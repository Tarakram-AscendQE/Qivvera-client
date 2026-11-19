"""Native source-to-candidate review over a real local app; no browser fetch mocks.

The fixture uses the actual deterministic drafting engine and disposable schema-6
SQLite. A transport wrapper delays authorized reads and drops one actual saved
candidate reply. Live AI, hosted HTTPS and PostgreSQL browser acceptance are not
claimed. Missing browser/runtime support fails the suite instead of skipping it.
"""
from pathlib import Path
from datetime import datetime, timezone
import json
import os
import queue
import secrets
import subprocess
import threading

from playwright.sync_api import sync_playwright, expect

WORK = Path(__file__).resolve().parents[1]
OUTPUT = Path(os.environ.get('QIVVERA_TEST_OUTPUT', str(WORK / 'review-test-results' / 'drafting')))
OUTPUT.mkdir(parents=True, exist_ok=True)
checks = []
report = {
    'status': 'running', 'passed': False, 'checks': checks,
    'method': 'Native Chromium, real HTTP/authentication, deterministic rules engine and disposable schema-6 SQLite.',
    'transportFaults': 'Delayed genuine run reads and one dropped reply after an actual candidate transaction.',
    'hostedHTTPS': False, 'postgresAcceptance': False, 'liveAI': False,
    'startedAt': datetime.now(timezone.utc).isoformat(),
}


def check(description):
    checks.append(description)


class Fixture:
    def __init__(self):
        self.password = secrets.token_urlsafe(32)
        port = int(os.environ.get('DRAFTING_TEST_PORT', '3188'))
        self.origin = f'http://127.0.0.1:{port}'
        self.log = (OUTPUT / 'drafting-fixture.log').open('w')
        self.process = subprocess.Popen(
            ['node', 'test/drafting-browser-fixture.mjs'], cwd=WORK,
            env={**os.environ, 'DRAFTING_TEST_PORT': str(port), 'DRAFTING_TEST_PASSWORD': self.password,
                 'DRAFTING_TEST_LATENCY_MS': '900', 'DRAFTING_TEST_DROP_SAVE_REPLY': 'true'},
            stdout=subprocess.PIPE, stderr=self.log, text=True,
        )
        lines = queue.Queue()
        threading.Thread(target=lambda: lines.put(self.process.stdout.readline()), daemon=True).start()
        try:
            metadata = json.loads(lines.get(timeout=15))
            assert metadata['origin'] == self.origin
            assert metadata['schemaVersion'] == 6 and metadata['liveModel'] is False
        except Exception:
            self.stop()
            raise RuntimeError('Drafting fixture did not start; inspect drafting-fixture.log.')

    def stop(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=3)
        self.log.close()


def sign_in(page, fixture, email):
    page.get_by_label('Email address').fill(email)
    page.get_by_label('Password', exact=True).fill(fixture.password)
    page.locator('#login-form').get_by_role('button', name='Open workspace').click()
    expect(page.get_by_role('button', name='Sign out', exact=True)).to_be_visible()


def sign_out(page):
    page.get_by_role('button', name='Sign out', exact=True).click()
    expect(page.get_by_role('heading', name='Welcome to Qivvera', exact=True)).to_be_visible()


def read(page, fixture, path):
    response = page.request.get(fixture.origin + path)
    assert response.status == 200, (path, response.status, response.text())
    return response.json()


def write(page, fixture, path, data, method='post'):
    session = read(page, fixture, '/api/session')
    return getattr(page.request, method)(fixture.origin + path, data=data,
        headers={'Origin': fixture.origin, 'X-CSRF-Token': session['csrfToken']})


def propose(page, fixture, drafting_url, reference, source):
    page.goto(drafting_url, wait_until='networkidle')
    form = page.locator('#drafting-source-form')
    expect(form).to_be_visible()
    form.locator('[name=sourceReference]').fill(reference)
    form.locator('[name=sourceVersion]').fill('2026.1')
    form.locator('[name=sourceText]').fill(source)
    form.locator('[name=method]').select_option('rules')
    with page.expect_response(lambda response: response.request.method == 'POST' and response.url.endswith('/drafting-runs')) as pending:
        form.get_by_role('button', name='Propose drafts', exact=True).click()
    response = pending.value
    assert response.status == 201, response.text()
    run = response.json()
    assert run['status'] == 'COMPLETED', run
    expect(page.get_by_role('heading', name='Review source drafts', exact=True)).to_be_visible()
    expect(page.get_by_role('heading', name=reference, exact=True)).to_be_visible()
    expect(page.locator('article[data-suggestion-id]')).to_have_count(len(run['suggestions']))
    return run


def candidate_form(page, suggestion, statement=None):
    article = page.locator(f'article[data-suggestion-id="{suggestion["id"]}"]')
    article.locator('summary').filter(has_text='Review and create a draft candidate').click()
    form = article.locator('form[data-drafting-action="CREATE_CANDIDATE"]')
    assert form.locator('[name=criticality]').input_value() == ''
    if statement is not None:
        form.locator('[name=statement]').fill(statement)
    form.locator('[name=criticality]').select_option('HIGH')
    form.locator('[name=rationale]').fill('I compared this draft with its quoted source and the scope of this change.')
    return form


fixture = None
phase = 'runtime'
try:
    node = subprocess.check_output(['node', '--version'], text=True).strip()
    report['nodeVersion'] = node
    parts = [int(value) for value in node.lstrip('v').split('.')]
    if parts[0] != 22 or parts[1] < 16:
        raise RuntimeError('Use supported Node 22, version 22.16 or later within Node 22.')
    phase = 'fixture'
    fixture = Fixture()
    phase = 'browser launch'
    with sync_playwright() as playwright:
        launch = {'headless': True}
        if os.environ.get('CHROMIUM_EXECUTABLE'):
            launch['executable_path'] = os.environ['CHROMIUM_EXECUTABLE']
        elif Path('/usr/bin/chromium').is_file():
            launch['executable_path'] = '/usr/bin/chromium'
        browser = playwright.chromium.launch(**launch)
        phase = 'browser assertions'
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
        page = context.new_page()
        page_errors = []
        page.on('pageerror', lambda error: page_errors.append(str(error)))
        page.goto(fixture.origin, wait_until='networkidle')
        assert page.request.get(fixture.origin + '/api/drafting-runs/00000000-0000-4000-8000-000000000000').status == 401
        sign_in(page, fixture, 'author@example.test')
        workspace = read(page, fixture, '/api/workspace')
        assert workspace['capabilities']['obligationDrafting'] is True
        assert workspace['applications'] == [] and workspace['changes'] == []
        check('Real authentication opens an empty drafting-enabled workspace; source records are protected before login.')

        page.get_by_role('button', name='+ Register application', exact=True).click()
        page.get_by_label('Application name').fill('Drafting browser application')
        page.get_by_role('button', name='Register application', exact=True).click()
        expect(page.get_by_role('heading', name='Drafting browser application', exact=True)).to_be_visible()
        page.get_by_role('button', name='+ New change', exact=True).click()
        page.get_by_label('Change title').fill('Source-grounded approval change')
        page.get_by_label('Business intent').fill('Make approval requirements explicit before verification.')
        page.get_by_label('Source commit reference').fill('a' * 40)
        page.get_by_role('button', name='Create change', exact=True).click()
        expect(page.get_by_role('heading', name='Source-grounded approval change', exact=True)).to_be_visible()
        change_url = page.url
        change_id = change_url.split('/changes/')[1]
        change = read(page, fixture, '/api/changes/' + change_id)
        revision_id = change['revision']['id']
        page.get_by_role('link', name='Draft from source', exact=True).click()
        expect(page.get_by_role('heading', name='Draft from source', exact=True)).to_be_visible()
        drafting_url = page.url
        assert '/drafting/' in drafting_url
        assert page.locator('#method option[value=openai]').count() == 0
        check('An Author reaches the workbench from a real current change; unconfigured AI is not offered as an available method.')

        source = '\n'.join([
            'The requester must not approve their own request.',
            'The application must preserve the original request identity.',
            'The display must render <img src=x onerror=window.qeInjected=true> as plain text.',
        ])
        run = propose(page, fixture, drafting_url, 'Synthetic approval source', source)
        run_url = page.url
        assert len(run['suggestions']) == 3
        assert read(page, fixture, '/api/changes/' + change_id)['obligations'] == []
        assert run['source']['text'] == source
        for suggestion in run['suggestions']:
            assert suggestion['status'] == 'PROPOSED' and suggestion['decision'] is None
            assert suggestion['quote'] == '\n'.join(source.split('\n')[suggestion['startLine'] - 1:suggestion['endLine']]).strip()
        check('Real rule-based extraction preserves exact quotations and proposed drafts without adding obligations, authority or evidence.')

        page.get_by_text('Read the saved source excerpt', exact=True).click()
        expect(page.locator('pre.drafting-text')).to_have_text(source)
        assert not page.evaluate('Boolean(window.qeInjected)')
        assert page.locator('img[src=x]').count() == 0
        expect(page.get_by_text('Original proposed statement', exact=True)).to_have_count(3)
        page.screenshot(path=str(OUTPUT / 'increment7-drafting-desktop.png'), full_page=True)
        check('Source text, original wording and malicious HTML stay visible as inert text rather than executable instructions.')

        with page.expect_download() as pending:
            page.get_by_role('link', name='Export drafting record', exact=True).click()
        downloaded = json.loads(Path(pending.value.path()).read_text())
        assert downloaded['id'] == run['id'] and downloaded['source']['text'] == source
        serialized = json.dumps(downloaded)
        assert fixture.password not in serialized and 'csrfToken' not in serialized and 'passwordHash' not in serialized
        check('Native export downloads the saved drafting provenance and excludes credentials and session secrets.')

        original = run['suggestions'][0]
        final_statement = original['statement'].rstrip('.') + ' in this approval workflow.'
        form = candidate_form(page, original, final_statement)
        with page.expect_response(lambda response: response.request.method == 'POST' and response.url.endswith('/actions')) as pending:
            form.get_by_role('button', name='Create draft candidate', exact=True).click()
        assert pending.value.status == 200, pending.value.text()
        updated = pending.value.json()
        selected = next(item for item in updated['suggestions'] if item['id'] == original['id'])
        expect(page.get_by_text('Draft candidate saved.', exact=False)).to_be_visible()
        assert selected['statement'] == original['statement']
        assert selected['decision']['statement'] == final_statement
        obligation_id = selected['decision']['obligationId']
        actual = read(page, fixture, '/api/changes/' + change_id)
        obligation = actual['obligations'][0]
        assert len(actual['obligations']) == 1 and obligation['id'] == obligation_id
        assert obligation['reviewStatus'] == 'DRAFT' and obligation['authority'] == 'CANDIDATE'
        assert obligation['state'] == 'NOT_ASSESSED' and obligation['evidenceCount'] == 0
        assert actual['disposition'] is None
        check('Explicit human wording, criticality and rationale create one ordinary draft candidate while preserving the original suggestion.')

        page.get_by_role('link', name='Open candidate in change', exact=True).click()
        card = page.locator(f'article[data-obligation-id="{obligation_id}"]')
        card.get_by_role('button', name='Request review', exact=True).click()
        page.get_by_role('button', name='Submit for review', exact=True).click()
        expect(page.get_by_text('Needs a different authorized reviewer.', exact=True)).to_be_visible()
        sign_out(page)
        sign_in(page, fixture, 'policy@example.test')
        card = page.locator(f'article[data-obligation-id="{obligation_id}"]')
        card.get_by_role('button', name='Record decision', exact=True).click()
        page.get_by_label('Decision', exact=True).select_option('ACCEPT')
        page.get_by_label('Reason for this decision').fill('This sourced separation rule applies to this declared synthetic approval change.')
        page.get_by_role('button', name='Save decision', exact=True).click()
        expect(page.get_by_text('Requirement accepted', exact=True)).to_be_visible()
        expect(page.get_by_role('heading', name='Not assessed', exact=True)).to_be_visible()
        accepted = read(page, fixture, '/api/changes/' + change_id)['obligations'][0]
        assert accepted['reviewStatus'] == 'ACCEPTED' and accepted['evidenceCount'] == 0
        check('The converted candidate follows the existing submission and separate Policy Authority review, without acquiring software evidence.')

        page.goto(run_url, wait_until='networkidle')
        expect(page.get_by_role('heading', name='Review source drafts', exact=True)).to_be_visible()
        assert page.locator('form[data-drafting-action]').count() == 0
        denied = write(page, fixture, f'/api/drafting-runs/{run["id"]}/suggestions/{run["suggestions"][1]["id"]}/actions',
            {'action': 'DISMISS', 'version': 1, 'rationale': 'Policy-only accounts cannot decide which source drafts become candidates.'})
        assert denied.status == 403
        check('A Policy Authority can inspect source provenance but cannot use Author-only suggestion actions.')

        sign_out(page)
        sign_in(page, fixture, 'viewer@example.test')
        expect(page.get_by_role('heading', name='Review source drafts', exact=True)).to_be_visible()
        assert page.locator('form[data-drafting-action]').count() == 0
        page.goto(drafting_url, wait_until='networkidle')
        expect(page.get_by_role('heading', name='Author role required to propose drafts', exact=True)).to_be_visible()
        assert page.locator('#drafting-source-form').count() == 0
        denied = write(page, fixture, f'/api/changes/{change_id}/drafting-runs', {
            'requestId': '11111111-1111-4111-8111-111111111111', 'revisionId': revision_id,
            'sourceReference': 'Unauthorized source', 'sourceVersion': '1', 'sourceText': source,
            'method': 'rules', 'externalProcessingConfirmed': False,
        })
        assert denied.status == 403
        check('Viewer navigation permits inspection while the real server and interface both refuse generation and decisions.')

        sign_out(page)
        sign_in(page, fixture, 'author@example.test')
        page.goto(run_url, wait_until='networkidle')
        second = run['suggestions'][1]
        article = page.locator(f'article[data-suggestion-id="{second["id"]}"]')
        article.locator('summary').filter(has_text='Dismiss this suggestion').click()
        dismiss = article.locator('form[data-drafting-action="DISMISS"]')
        dismiss.locator('[name=rationale]').fill('This separate clause will be reviewed outside the present change; dismissal does not establish complete scope.')
        dismiss.get_by_role('button', name='Dismiss suggestion', exact=True).click()
        expect(page.get_by_text('Suggestion dismissed with your recorded reason.', exact=False)).to_be_visible()
        saved = read(page, fixture, '/api/drafting-runs/' + run['id'])
        assert saved['suggestions'][1]['status'] == 'DISMISSED'
        assert len(read(page, fixture, '/api/changes/' + change_id)['obligations']) == 1
        check('A reasoned dismissal records a preparation decision without rejecting an obligation or changing declared scope.')

        empty = propose(page, fixture, drafting_url, 'Informational source', 'This is background information about the approval feature.')
        assert empty['suggestions'] == []
        expect(page.get_by_role('heading', name='No drafts were proposed', exact=True)).to_be_visible()
        expect(page.get_by_text('An empty result does not establish complete scope.', exact=False)).to_be_visible()
        check('A genuine empty extraction is explained as limited drafting output and does not establish obligation completeness.')

        limited = propose(page, fixture, drafting_url, 'Nine-clause source', '\n'.join(
            f'The application must preserve approval field {number}.' for number in range(1, 10)))
        assert len(limited['suggestions']) == 8
        assert 'LIMIT_REACHED' in limited['warnings']
        expect(page.get_by_text('The suggestion limit was reached.', exact=False)).to_be_visible()
        check('The eight-suggestion limit produces a visible warning while retaining the entire source for human review.')

        page.set_viewport_size({'width': 390, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.goto(drafting_url, wait_until='networkidle')
        expect(page.locator('#drafting-source-form')).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(OUTPUT / 'increment7-drafting-mobile.png'), full_page=True)
        page.set_viewport_size({'width': 1440, 'height': 1000})
        check('Source entry, saved-run history and suggestion review remain readable without horizontal page overflow at 390px.')

        lost = propose(page, fixture, drafting_url, 'Lost response source', 'The service must retain a unique recovery receipt.')
        lost_url = page.url
        form = candidate_form(page, lost['suggestions'][0])
        replay_data = {'action': 'CREATE_CANDIDATE', 'version': lost['suggestions'][0]['version'],
            'statement': lost['suggestions'][0]['statement'], 'criticality': 'HIGH',
            'rationale': 'I compared this draft with its quoted source and the scope of this change.'}
        form.get_by_role('button', name='Create draft candidate', exact=True).click()
        expect(form.get_by_role('alert')).to_contain_text('Your action may have been saved.')
        expect(form.get_by_role('alert')).to_contain_text('Reload the saved run')
        durable = read(page, fixture, '/api/drafting-runs/' + lost['id'])
        assert durable['suggestions'][0]['status'] == 'CANDIDATE_CREATED'
        assert len(read(page, fixture, '/api/changes/' + change_id)['obligations']) == 2
        page.get_by_role('button', name='Reload saved run', exact=True).click()
        expect(page.get_by_text('Draft candidate created', exact=True)).to_be_visible()
        replay = write(page, fixture, f'/api/drafting-runs/{lost["id"]}/suggestions/{lost["suggestions"][0]["id"]}/actions', replay_data)
        assert replay.status == 200 and replay.json()['replayed'] is True
        assert len(read(page, fixture, '/api/changes/' + change_id)['obligations']) == 2
        check('A lost reply after a real candidate save produces an uncertainty message; reload and identical replay preserve exactly one saved candidate.')

        page.goto(run_url, wait_until='networkidle')
        third = run['suggestions'][2]
        form = candidate_form(page, third)
        advanced = write(page, fixture, f'/api/changes/{change_id}/revisions', {
            'expectedRevisionId': revision_id, 'sourceRevision': 'b' * 40,
            'intent': 'A newer implementation needs its own source review.',
            'reason': 'Simulate a genuine concurrent revision while an old decision form is open.', 'copyObligations': False,
        })
        assert advanced.status == 201, advanced.text()
        with page.expect_response(lambda response: response.request.method == 'POST' and response.url.endswith('/actions')) as pending:
            form.get_by_role('button', name='Create draft candidate', exact=True).click()
        assert pending.value.status == 409
        expect(form.get_by_role('alert')).to_contain_text('Reload the saved run')
        assert read(page, fixture, '/api/changes/' + change_id)['obligations'] == []
        page.get_by_role('button', name='Reload saved run', exact=True).click()
        expect(page.get_by_text('Historical revision · read-only', exact=True)).to_be_visible()
        assert page.locator('form[data-drafting-action]').count() == 0
        historical = read(page, fixture, '/api/drafting-runs/' + run['id'])
        assert historical['applicability'] == 'HISTORICAL'
        assert historical['suggestions'][2]['status'] == 'PROPOSED'
        old_change = read(page, fixture, f'/api/changes/{change_id}?revision={revision_id}')
        assert old_change['obligations'][0]['reviewStatus'] == 'ACCEPTED'
        check('A real concurrent revision blocks a stale open decision form; reload becomes read-only and preserves the old authority and source record.')

        page.goto(fixture.origin + '/#/guide', wait_until='networkidle')
        with page.expect_response(lambda response: response.url.endswith('/api/drafting-runs/' + run['id'])) as pending:
            page.goto(run_url, wait_until='domcontentloaded')
        delayed = pending.value
        sign_out(page)
        page.evaluate("location.hash = '#/guide'")
        sign_in(page, fixture, 'viewer@example.test')
        delayed.body()  # Wait for the real delayed body without a lingering target-close waiter.
        page.wait_for_timeout(100)  # Allow the delayed browser continuation to run.
        expect(page.get_by_role('heading', name='Your guide to Qivvera', exact=True)).to_be_visible()
        expect(page.locator('.identity .email > span')).to_have_text('viewer@example.test')
        assert page.get_by_role('heading', name='Review source drafts', exact=True).count() == 0
        assert page.locator('form[data-drafting-action]').count() == 0
        check('A delayed authorized source response cannot restore its old view after sign-out, identity change and navigation.')

        session = read(page, fixture, '/api/session')
        revoked = page.request.delete(fixture.origin + '/api/session', headers={
            'Origin': fixture.origin, 'X-CSRF-Token': session['csrfToken'],
        })
        assert revoked.status == 200
        page.goto(lost_url, wait_until='networkidle')
        expect(page.get_by_role('heading', name='Welcome to Qivvera', exact=True)).to_be_visible()
        assert page.get_by_role('heading', name='Lost response source', exact=True).count() == 0
        check('Actual session revocation blocks a saved drafting route and clears authenticated source content.')

        assert not page_errors, page_errors
        check('The complete native drafting journey has no uncaught page JavaScript errors.')
        browser.close()
        report['status'] = 'passed'
        report['passed'] = True
except Exception as error:
    report['phase'] = phase
    report['error'] = str(error)
    report['status'] = 'blocked' if phase in ['runtime', 'browser launch'] else 'failed'
finally:
    if fixture:
        fixture.stop()
    report['count'] = len(checks)
    report['finishedAt'] = datetime.now(timezone.utc).isoformat()
    (OUTPUT / 'drafting-browser-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
if not report['passed']:
    raise SystemExit(1)

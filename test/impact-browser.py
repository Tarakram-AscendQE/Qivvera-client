"""Native revision impact journey over real HTTP/authentication and worker evidence.

Only genuine response delivery is delayed for race tests. The report, source data,
sessions and database reads are not mocked. Hosted HTTPS and PostgreSQL browser
acceptance remain separate. Missing Chromium support fails instead of skipping.
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
OUTPUT = Path(os.environ.get('QIVVERA_TEST_OUTPUT', str(WORK / 'review-test-results' / 'impact')))
OUTPUT.mkdir(parents=True, exist_ok=True)
checks = []
report = {
    'status': 'running', 'passed': False, 'checks': checks,
    'method': 'Native Chromium, real HTTP/authentication, genuine worker evidence and disposable schema-6 SQLite.',
    'transportFaults': 'Delayed genuine impact report bodies for navigation and session races.',
    'hostedHTTPS': False, 'postgresAcceptance': False,
    'startedAt': datetime.now(timezone.utc).isoformat(),
}


def check(description):
    checks.append(description)


class Fixture:
    def __init__(self):
        self.password = secrets.token_urlsafe(32)
        port = int(os.environ.get('IMPACT_TEST_PORT', '3189'))
        self.origin = f'http://127.0.0.1:{port}'
        self.log = (OUTPUT / 'impact-fixture.log').open('w')
        self.process = subprocess.Popen(
            ['node', 'test/impact-browser-fixture.mjs'], cwd=WORK,
            env={**os.environ, 'IMPACT_TEST_PORT': str(port), 'IMPACT_TEST_PASSWORD': self.password,
                 'IMPACT_TEST_LATENCY_MS': '900'},
            stdout=subprocess.PIPE, stderr=self.log, text=True,
        )
        lines = queue.Queue()
        threading.Thread(target=lambda: lines.put(self.process.stdout.readline()), daemon=True).start()
        try:
            self.metadata = json.loads(lines.get(timeout=15))
            assert self.metadata['origin'] == self.origin and self.metadata['schemaVersion'] == 6
            assert self.metadata['evidenceDigest'].startswith('sha256:')
        except Exception:
            self.stop()
            raise RuntimeError('Impact fixture did not start; inspect impact-fixture.log.')

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


def impact_url(fixture, change_id, revision_id):
    return fixture.origin + f'/#/impact/{change_id}/{revision_id}'


def view_impact(page, fixture, change_id, revision_id):
    endpoint = f'/api/changes/{change_id}/impact?revision={revision_id}'
    with page.expect_response(lambda response: response.url.endswith(endpoint) and response.request.method == 'GET') as pending:
        page.goto(impact_url(fixture, change_id, revision_id), wait_until='networkidle')
    response = pending.value
    assert response.status == 200, response.text()
    saved = response.json()
    expect(page.locator('#impact-report')).to_be_visible()
    expect(page.get_by_role('heading', name='Impact & next checks', exact=True)).to_be_visible()
    assert saved['selectedRevision']['id'] == revision_id
    return saved


def create_revision(page, fixture, change_id, source, copy=True):
    page.goto(fixture.origin + '/#/changes/' + change_id, wait_until='networkidle')
    page.get_by_role('button', name='+ New revision', exact=True).first.click()
    page.get_by_label('New source commit reference').fill(source)
    page.get_by_label('Business intent').fill('Preserve approval controls while reviewing a new declared implementation.')
    page.get_by_label('What changed and why?').fill('Register a separate revision for explicit impact and authority review.')
    page.get_by_label('Prior obligations').select_option('true' if copy else 'false')
    with page.expect_response(lambda response: response.request.method == 'POST' and response.url.endswith('/revisions')) as pending:
        page.get_by_role('button', name='Create revision', exact=True).click()
    response = pending.value
    assert response.status == 201, response.text()
    expect(page.get_by_role('heading', name='Approval change', exact=True)).to_be_visible()
    expect(page.locator('dialog[open]')).to_have_count(0)
    return response.json()


fixture = None
phase = 'runtime'
try:
    node = subprocess.check_output(['node', '--version'], text=True).strip()
    report['nodeVersion'] = node
    version = [int(part) for part in node.lstrip('v').split('.')]
    if version[0] != 22 or version[1] < 16:
        raise RuntimeError('Use supported Node 22, version 22.16 or later within Node 22.')
    phase = 'fixture'
    fixture = Fixture()
    meta = fixture.metadata
    change_id, baseline_id = meta['changeId'], meta['revisionId']
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
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        assert page.request.get(fixture.origin + f'/api/changes/{change_id}/impact?revision={baseline_id}').status == 401
        assert page.request.get(fixture.origin + f'/api/changes/{change_id}/impact/export?revision={baseline_id}').status == 401
        page.goto(fixture.origin, wait_until='networkidle')
        sign_in(page, fixture, 'author@example.test')
        assert read(page, fixture, '/api/workspace')['capabilities']['revisionImpact'] is True
        check('Real authentication protects report/export and exposes the revision-impact capability to the signed-in Author.')

        page.goto(fixture.origin + '/#/changes/' + change_id, wait_until='networkidle')
        page.get_by_role('link', name='Impact & next checks', exact=True).click()
        expect(page.locator('#impact-report')).to_be_visible()
        initial = read(page, fixture, f'/api/changes/{change_id}/impact?revision={baseline_id}')
        assert initial['assurance']['latestRun']['id'] == meta['runId']
        assert initial['assurance']['latestRun']['evidenceDigest'] == meta['evidenceDigest']
        assert initial['assurance']['latestRun']['currentDisposition'] == 'READY'
        expect(page.get_by_text('Read-only guidance.', exact=True)).to_be_visible()
        expect(page.get_by_role('heading', name='No earlier revision', exact=True)).to_be_visible()
        check('Native navigation shows the genuine baseline worker result with its original scope, identity and read-only boundary.')

        empty = view_impact(page, fixture, meta['emptyChangeId'], meta['emptyRevisionId'])
        assert empty['obligations'] == [] and empty['baselineRevision'] is None
        expect(page.get_by_role('heading', name='No obligations on this revision', exact=True)).to_be_visible()
        assert empty['assurance']['latestRun'] is None
        check('An initial empty declaration is explained without inventing completeness, comparison lineage or assurance.')

        next_change = create_revision(page, fixture, change_id, 'b' * 40)
        revision_id = next_change['revision']['id']
        copied = next_change['obligations'][0]
        saved = view_impact(page, fixture, change_id, revision_id)
        assert saved['baselineRevision']['id'] == baseline_id
        assert saved['obligations'][0]['comparison'] == 'COPIED_UNCHANGED'
        assert saved['obligations'][0]['current']['reviewStatus'] == 'DRAFT'
        assert saved['assurance']['latestRun'] is None
        row = page.locator(f'[data-impact-obligation="{copied["id"]}"]')
        expect(row.get_by_text('Copied · recorded fields unchanged', exact=True)).to_be_visible()
        expect(row.get_by_text('Draft', exact=True)).to_be_visible()
        check('Creating a revision through the native form records explicit copy lineage while requiring fresh authority and evidence.')

        row.get_by_text('Inspect previous mapping hint', exact=True).click()
        expect(row.get_by_text('Requester–approver separation', exact=True)).to_be_visible()
        assert saved['obligations'][0]['priorMappingHint']['planId'] == initial['assurance']['plan']['id']
        assert saved['assurance']['plan'] is None
        check('A previous human mapping appears only as a review hint and does not create a plan on the copied revision.')

        statement = copied['statement'].replace('requester', 'Requester')
        changed = write(page, fixture, '/api/obligations/' + copied['id'], {
            'revisionId': revision_id, 'version': copied['version'], 'statement': statement,
            'sourceReference': copied['sourceReference'], 'sourceVersion': copied['sourceVersion'],
            'criticality': 'HIGH',
        }, method='patch')
        assert changed.status == 200, changed.text()
        injected = '<img src=x onerror=window.impactInjected=true> must remain literal business text.'
        added = write(page, fixture, f'/api/changes/{change_id}/obligations', {
            'revisionId': revision_id, 'statement': injected,
            'sourceReference': 'Synthetic policy with untrusted text', 'sourceVersion': '2', 'criticality': 'MEDIUM',
        })
        assert added.status == 201, added.text()
        added_id = added.json()['id']
        with page.expect_download() as pending:
            page.get_by_role('button', name='Download impact report', exact=True).click()
        downloaded = json.loads(Path(pending.value.path()).read_text())
        assert downloaded == saved, 'The browser download must retain the exact previously displayed snapshot.'
        serialized = json.dumps(downloaded)
        for forbidden in [fixture.password, 'csrfToken', 'passwordHash', 'requesterTokenEnv', 'approverTokenEnv', 'MAKER_TEST_TOKEN']:
            assert forbidden not in serialized
        check('The native download preserves the exact displayed snapshot after concurrent edits and excludes runtime/session secrets.')

        endpoint = f'/api/changes/{change_id}/impact?revision={revision_id}'
        with page.expect_response(lambda response: response.url.endswith(endpoint)) as pending:
            page.get_by_role('button', name='Refresh impact report', exact=True).click()
        fresh = pending.value.json()
        expect(page.locator('[data-impact-obligation]')).to_have_count(2)
        assert fresh['snapshotDigest'] != saved['snapshotDigest']
        current = next(item for item in fresh['obligations'] if item['current']['id'] == copied['id'])
        assert current['comparison'] == 'COPIED_CHANGED'
        assert {'statement', 'criticality'} <= {item['field'] for item in current['differences']}
        row = page.locator(f'[data-impact-obligation="{copied["id"]}"]')
        expect(row.get_by_text('Copied · recorded fields changed', exact=True)).to_be_visible()
        row.get_by_text('Inspect exact field changes (2)', exact=True).click()
        expect(row.get_by_text(statement, exact=True).first).to_be_visible()
        check('Refresh exposes exact saved statement and criticality changes without concealing differences in literal capitalization.')

        new_row = page.locator(f'[data-impact-obligation="{added_id}"]')
        expect(new_row.get_by_text('No recorded copy link', exact=True)).to_be_visible()
        expect(new_row.get_by_role('heading', name=injected, exact=True)).to_be_visible()
        assert page.locator('img[src=x]').count() == 0
        assert not page.evaluate('Boolean(window.impactInjected)')
        check('New obligations retain their separate identity and hostile-looking business text remains inert in native rendering.')
        page.screenshot(path=str(OUTPUT / 'increment8-impact-desktop.png'), full_page=True)

        before_navigation = read(page, fixture, '/api/export')
        row.get_by_role('link', name='Inspect obligation record', exact=True).click()
        expect(page.get_by_role('heading', name='What needs to be established?', exact=True)).to_be_visible()
        assert read(page, fixture, f'/api/changes/{change_id}')['obligations'][0]['reviewStatus'] == 'DRAFT'
        after_navigation = read(page, fixture, '/api/export')
        for value in [before_navigation, after_navigation]:
            value.pop('exportedAt', None)
        assert before_navigation == after_navigation
        check('Guidance links open the existing obligation workflow without changing any review history or business record.')

        no_copy = create_revision(page, fixture, change_id, 'd' * 40, copy=False)
        no_copy_id = no_copy['revision']['id']
        omitted = view_impact(page, fixture, change_id, no_copy_id)
        assert omitted['obligations'] == [] and len(omitted['notCarriedForward']) == 2
        expect(page.locator('[data-impact-previous]')).to_have_count(2)
        expect(page.get_by_role('heading', name='Not carried forward', exact=True)).to_be_visible()
        assert omitted['assurance']['latestRun'] is None
        check('Starting a new revision without copied obligations exposes the omitted parent declarations and supplies no inherited pass.')

        historical = view_impact(page, fixture, change_id, baseline_id)
        expect(page.get_by_text('Historical revision · read-only', exact=True)).to_be_visible()
        assert historical['assurance']['latestRun']['recordedDisposition'] == 'READY'
        assert historical['assurance']['latestRun']['currentDisposition'] is None
        assert historical['assurance']['latestRun']['evidenceDigest'] == meta['evidenceDigest']
        check('Historical worker evidence keeps its original digest and recorded outcome while losing current-revision applicability.')

        sign_out(page)
        sign_in(page, fixture, 'viewer@example.test')
        viewer_report = view_impact(page, fixture, change_id, revision_id)
        assert viewer_report['selectedRevision']['id'] == revision_id
        assert page.locator('#impact-report form').count() == 0
        assert page.get_by_role('button', name='Approve plan', exact=True).count() == 0
        forged = write(page, fixture, f'/api/changes/{change_id}/impact?revision={revision_id}', {'disposition': 'READY'})
        assert forged.status == 404
        check('A Viewer can inspect historical/current records while the interface and server provide no impact mutation or approval route.')

        page.set_viewport_size({'width': 390, 'height': 844})
        view_impact(page, fixture, change_id, revision_id)
        expect(page.get_by_role('button', name='Download impact report', exact=True)).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        assert page.locator('[data-impact-obligation]').count() == 2
        page.screenshot(path=str(OUTPUT / 'increment8-impact-mobile.png'), full_page=True)
        page.set_viewport_size({'width': 1440, 'height': 1000})
        check('The impact workbench retains readable comparisons and reachable controls without horizontal overflow at 390px.')

        page.goto(fixture.origin + '/#/guide', wait_until='networkidle')
        with page.expect_response(lambda response: response.url.endswith(endpoint)) as pending:
            page.goto(impact_url(fixture, change_id, revision_id), wait_until='domcontentloaded')
        delayed = pending.value
        page.evaluate("location.hash = '#/guide'")
        delayed.finished()
        expect(page.get_by_role('heading', name='Your guide to Qivvera', exact=True)).to_be_visible()
        assert page.locator('#impact-report').count() == 0
        check('A delayed genuine impact response cannot replace a newer navigation destination.')

        with page.expect_response(lambda response: response.url.endswith(endpoint)) as pending:
            page.goto(impact_url(fixture, change_id, revision_id), wait_until='domcontentloaded')
        delayed = pending.value
        sign_out(page)
        page.evaluate("location.hash = '#/guide'")
        sign_in(page, fixture, 'policy@example.test')
        delayed.finished()
        expect(page.get_by_role('heading', name='Your guide to Qivvera', exact=True)).to_be_visible()
        expect(page.locator('.identity .email > span')).to_have_text('policy@example.test')
        assert page.locator('#impact-report').count() == 0
        check('A report begun under the old session cannot restore protected content after sign-out and identity change.')

        session = read(page, fixture, '/api/session')
        revoked = page.request.delete(fixture.origin + '/api/session', headers={
            'Origin': fixture.origin, 'X-CSRF-Token': session['csrfToken'],
        })
        assert revoked.status == 200
        page.goto(impact_url(fixture, change_id, revision_id), wait_until='networkidle')
        expect(page.get_by_role('heading', name='Welcome to Qivvera', exact=True)).to_be_visible()
        assert page.locator('#impact-report').count() == 0
        check('Actual session revocation blocks a saved report route and clears its authenticated content.')

        assert not errors, errors
        check('The complete native impact journey has no uncaught page JavaScript errors.')
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
    (OUTPUT / 'impact-browser-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
if not report['passed']:
    raise SystemExit(1)

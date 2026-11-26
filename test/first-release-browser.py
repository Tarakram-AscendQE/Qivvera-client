"""Increment 6 browser acceptance against a real local HTTP app and disposable SQLite.

No browser API or application fetch is stubbed. The test server can delay a real
response and replace an already-denied 401 body to exercise transport recovery.
This is local synthetic acceptance, not hosted HTTPS, PostgreSQL or live GitHub.
The suite fails nonzero when a browser/runtime prerequisite cannot run; no skip
or offline-rendering fallback can satisfy this gate.
"""
from pathlib import Path
from datetime import datetime, timezone
import json
import os
import queue
import re
import secrets
import subprocess
import threading

from playwright.sync_api import sync_playwright, expect

WORK = Path(__file__).resolve().parents[1]
OUTPUT = Path(os.environ.get('QIVVERA_TEST_OUTPUT', str(WORK / 'review-test-results' / 'first-release')))
OUTPUT.mkdir(parents=True, exist_ok=True)
checks = []
report = {
    'status': 'running', 'passed': False, 'checks': checks,
    'method': 'Native Chromium, real local HTTP application, real sessions and disposable schema-5 SQLite; no browser fetch mocks.',
    'transportFaults': 'Test server delays genuine bodies, replaces an actually denied support 401 body with unreadable HTML, and drops one reply after a real synthetic save.',
    'hostedHTTPS': False, 'postgresAcceptance': False, 'liveGitHub': False,
    'startedAt': datetime.now(timezone.utc).isoformat(),
}


def check(description):
    checks.append(description)


class Fixture:
    def __init__(self, port, mode='configured'):
        self.password = secrets.token_urlsafe(32)
        self.origin = f'http://127.0.0.1:{port}'
        self.mode = mode
        self.log = (OUTPUT / f'fixture-{mode}.log').open('w')
        environment = {
            **os.environ, 'FIRST_RELEASE_TEST_PORT': str(port),
            'FIRST_RELEASE_TEST_PASSWORD': self.password,
            'FIRST_RELEASE_TEST_CAPABILITIES': mode,
            'FIRST_RELEASE_TEST_LATENCY_MS': '800',
            'FIRST_RELEASE_TEST_MALFORMED_401': 'true',
            'FIRST_RELEASE_TEST_DROP_SAVE_REPLY': 'true',
        }
        self.process = subprocess.Popen(
            ['node', 'test/first-release-browser-fixture.mjs'], cwd=WORK,
            env=environment, stdout=subprocess.PIPE, stderr=self.log, text=True,
        )
        lines = queue.Queue()
        threading.Thread(target=lambda: lines.put(self.process.stdout.readline()), daemon=True).start()
        try:
            line = lines.get(timeout=15)
            metadata = json.loads(line)
            assert metadata['origin'] == self.origin
            assert metadata['schemaVersion'] == 5
        except Exception:
            self.stop()
            raise RuntimeError(f'{mode} fixture did not start; inspect fixture-{mode}.log')

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
    page.get_by_role('button', name='Open workspace').click()
    expect(page.get_by_role('button', name='Sign out', exact=True)).to_be_visible()


def sign_out(page):
    page.get_by_role('button', name='Sign out', exact=True).click()
    expect(page.get_by_role('heading', name='Welcome to Qivvera', exact=True)).to_be_visible()


def nav(page, label):
    page.get_by_role('navigation', name='Main navigation').get_by_role('link', name=label, exact=True).click()


def request_json(page, fixture, path):
    result = page.request.get(fixture.origin + path)
    assert result.status == 200, (path, result.status)
    return result.json()


def download_support(page):
    with page.expect_download() as pending:
        page.get_by_role('button', name='Download support details', exact=True).click()
    download = pending.value
    assert download.suggested_filename == 'Qivvera-support-details.json'
    return json.loads(Path(download.path()).read_text())


fixtures = []
phase = 'runtime'
try:
    version = subprocess.check_output(['node', '--version'], text=True).strip()
    report['nodeVersion'] = version
    version_parts = [int(x) for x in version.lstrip('v').split('.')]
    if version_parts[0] != 22 or version_parts[1] < 16:
        raise RuntimeError('Use the supported Node 22 runtime, version 22.16 or later within Node 22.')
    phase = 'fixture'
    fixture = Fixture(int(os.environ.get('FIRST_RELEASE_TEST_PORT', '3186')))
    fixtures.append(fixture)
    phase = 'browser launch'
    with sync_playwright() as playwright:
        launch = {'headless': True}
        executable = os.environ.get('CHROMIUM_EXECUTABLE')
        if executable:
            launch['executable_path'] = executable
        elif Path('/usr/bin/chromium').is_file():
            launch['executable_path'] = '/usr/bin/chromium'
        browser = playwright.chromium.launch(**launch)
        phase = 'browser assertions'
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
        page = context.new_page()
        page_errors = []
        page.on('pageerror', lambda error: page_errors.append(str(error)))
        page.goto(fixture.origin, wait_until='networkidle')
        expect(page.get_by_role('heading', name='Welcome to Qivvera', exact=True)).to_be_visible()
        protected = page.request.get(fixture.origin + '/api/support-info')
        assert protected.status == 401 and '"product"' not in protected.text()
        check('Native navigation reaches sign-in; unauthenticated support data is denied.')

        sign_in(page, fixture, 'author@example.test')
        expect(page.get_by_role('heading', name='Your turn', exact=True)).to_be_visible()
        before_guidance = request_json(page, fixture, '/api/workspace')
        assert before_guidance['applications'] == [] and before_guidance['changes'] == []
        check('An Author reaches role-specific starting guidance in a genuinely empty workspace.')

        guide_link = page.get_by_role('link', name='Read the product guide', exact=True)
        guide_link.focus()
        page.keyboard.press('Enter')
        expect(page.get_by_role('heading', name='Your guide to Qivvera', exact=True)).to_be_visible()
        expect(page.get_by_role('heading', name='Supported scope', exact=True)).to_be_visible()
        page.locator('summary').filter(has_text='READY, NOT_READY and INDETERMINATE').click()
        expect(page.get_by_text('A valid violation takes priority over missing evidence.', exact=False)).to_be_visible()
        check('Keyboard navigation opens the complete product guide and the scoped-status explanation.')
        page.screenshot(path=str(OUTPUT / 'increment6-guide-desktop.png'), full_page=True)

        nav(page, 'Support')
        expect(page.get_by_role('heading', name='Workspace support', exact=True)).to_be_visible()
        diagnostic = request_json(page, fixture, '/api/support-info')
        assert diagnostic['workspace']['schemaVersion'] == 5
        assert diagnostic['product']['revision'] == '6' * 40
        assert diagnostic['actions']['createChange'] is True
        assert diagnostic['actions']['reviewObligations'] is False
        assert diagnostic['capabilities']['configuredTargets'] is False
        assert diagnostic['limitations']['workerStatus'] == 'not-observed'
        assert diagnostic['limitations']['githubConnection'] == 'not-probed'
        assert diagnostic['limitations']['releaseStatus'] == 'not-evaluated'
        check('Support reports the real schema, declared revision, author actions and unobserved external checks.')

        exported = download_support(page)
        assert exported['schema'] == 'qivvera.support-info/1'
        assert exported['roles'] == ['AUTHOR']
        assert exported['product']['revision'] == '6' * 40
        serialized = json.dumps(exported)
        for forbidden in [fixture.password, 'author@example.test', 'policy@example.test', 'viewer@example.test', 'csrfToken', 'passwordHash', fixture.origin]:
            assert forbidden not in serialized
        check('Native support download contains the allowlisted diagnostic data without account names, session tokens or fixture secrets.')
        assert request_json(page, fixture, '/api/workspace') == before_guidance
        check('Guide and Support reads/downloads leave domain records and activity unchanged.')
        page.screenshot(path=str(OUTPUT / 'increment6-support-desktop.png'), full_page=True)

        nav(page, 'Workspace')
        page.get_by_role('button', name='+ Register application', exact=True).click()
        app_name = 'Review app <img src=x onerror=window.qeInjected=true>'
        page.get_by_label('Application name').fill(app_name)
        page.get_by_label('Description', exact=True).fill('Synthetic first-release browser acceptance only.')
        page.get_by_role('button', name='Register application', exact=True).click()
        expect(page.get_by_role('heading', name=app_name, exact=True)).to_be_visible()
        assert not page.evaluate('Boolean(window.qeInjected)')
        assert page.locator('img[src="x"]').count() == 0
        check('Application creation uses the actual API and untrusted application text remains inert.')

        page.get_by_role('button', name='+ New change', exact=True).click()
        page.get_by_label('Change title').fill('First controlled approval review')
        page.get_by_label('Business intent').fill('Keep the requester separate from the approving identity.')
        page.get_by_label('Source commit reference').fill('a' * 40)
        page.get_by_role('button', name='Create change', exact=True).click()
        expect(page.get_by_role('heading', name='Not assessed', exact=True)).to_be_visible()
        expect(page.get_by_role('heading', name='What to do next', exact=True)).to_be_visible()
        change_url = page.url
        change_id = change_url.split('/changes/')[1]
        check('A new source-bound change has a concrete next step and no fabricated assessment.')

        statement = 'The requester must not approve their own request.'
        page.get_by_role('button', name='+ Add obligation', exact=True).click()
        page.get_by_label('What must be true?').fill(statement)
        page.get_by_label('Source reference', exact=True).fill('Synthetic approval policy')
        page.get_by_label('Source version').fill('1')
        page.get_by_role('button', name='Add candidate', exact=True).click()
        expect(page.get_by_role('heading', name=statement, exact=True)).to_be_visible()
        page.get_by_role('button', name='Request review', exact=True).click()
        page.get_by_role('button', name='Submit for review', exact=True).click()
        expect(page.get_by_text('Needs a different authorized reviewer.', exact=True)).to_be_visible()
        check('The Author submits a sourced candidate without acquiring self-approval authority.')

        sign_out(page)
        sign_in(page, fixture, 'viewer@example.test')
        expect(page.get_by_role('button', name='+ Add obligation', exact=True)).to_be_disabled()
        expect(page.get_by_role('button', name='+ New revision', exact=True)).to_be_disabled()
        viewer_session = request_json(page, fixture, '/api/session')
        denied = page.request.post(fixture.origin + '/api/applications',
            data={'name': 'Unauthorized viewer application'},
            headers={'Origin': fixture.origin, 'X-CSRF-Token': viewer_session['csrfToken']})
        assert denied.status == 403
        assert len(request_json(page, fixture, '/api/workspace')['applications']) == 1
        nav(page, 'Support')
        expect(page.get_by_role('heading', name='Workspace support', exact=True)).to_be_visible()
        viewer_diagnostic = download_support(page)
        assert viewer_diagnostic['roles'] == ['VIEWER']
        assert not any(viewer_diagnostic['actions'].values())
        check('Viewer UI and server deny writes; the downloaded role hints grant no mutation actions.')

        sign_out(page)
        sign_in(page, fixture, 'policy@example.test')
        expect(page.get_by_role('heading', name='Workspace support', exact=True)).to_be_visible()
        policy_diagnostic = download_support(page)
        assert policy_diagnostic['actions']['reviewObligations'] is True
        assert policy_diagnostic['actions']['createChange'] is False
        page.goto(change_url, wait_until='networkidle')
        page.get_by_role('button', name='Record decision', exact=True).click()
        page.get_by_label('Decision', exact=True).select_option('ACCEPT')
        page.get_by_label('Reason for this decision').fill('This sourced approval rule applies to the declared synthetic change.')
        page.get_by_role('button', name='Save decision', exact=True).click()
        expect(page.get_by_text('Requirement accepted', exact=True)).to_be_visible()
        expect(page.get_by_role('heading', name='Not assessed', exact=True)).to_be_visible()
        page.get_by_role('button', name='Plan & check', exact=True).click()
        expect(page.get_by_role('button', name='Configure mapping', exact=True)).to_be_disabled()
        expect(page.get_by_text('No configured target matches this application and full source revision.', exact=False)).to_be_visible()
        check('A different Policy Authority accepts applicability; absent target setup still prevents mapping and no readiness is invented.')

        page.get_by_role('button', name='Requirements', exact=True).click()
        page.get_by_role('button', name='Review history', exact=True).click()
        expect(page.get_by_role('heading', name='Obligation review history', exact=True)).to_be_visible()
        expect(page.get_by_text('Different recorded reviewer identity. This is not a guarantee of organizational independence.', exact=True)).to_be_visible()
        page.get_by_role('button', name='Close dialog', exact=True).click()
        check('Recorded authority provenance remains inspectable through the real history API.')

        sign_out(page)
        sign_in(page, fixture, 'author@example.test')
        page.get_by_role('button', name='+ New revision', exact=True).click()
        page.get_by_label('New source commit reference').fill('b' * 40)
        page.get_by_label('Business intent').fill('Keep the same approval policy while replacing implementation.')
        page.get_by_label('What changed and why?').fill('Synthetic corrected source reference for a fresh review.')
        page.get_by_role('button', name='Create revision', exact=True).click()
        expect(page.get_by_text('CANDIDATE', exact=True)).to_be_visible()
        expect(page.get_by_role('heading', name='Not assessed', exact=True)).to_be_visible()
        page.get_by_role('button', name='Revisions', exact=True).click()
        page.get_by_role('link', name='Revision 1', exact=True).click()
        expect(page.get_by_text('Historical revision · read-only', exact=True)).to_be_visible()
        page.get_by_role('button', name='Requirements', exact=True).click()
        expect(page.get_by_role('button', name='+ Add obligation', exact=True)).to_be_disabled()
        expect(page.get_by_text('Requirement accepted', exact=True)).to_be_visible()
        page.get_by_role('link', name=re.compile('^Open current revision')).first.click()
        page.reload(wait_until='networkidle')
        expect(page.get_by_role('heading', name='First controlled approval review', exact=True)).to_be_visible()
        expect(page.get_by_text('CANDIDATE', exact=True)).to_be_visible()
        check('Revision navigation preserves historical authority, copies only candidates and survives a real page reload.')

        page.set_viewport_size({'width': 390, 'height': 844})
        expect(page.get_by_role('navigation', name='Main navigation').get_by_role('link', name='Guide', exact=True)).to_be_hidden()
        page.get_by_role('button', name='Open navigation', exact=True).click()
        nav(page, 'Guide')
        expect(page.get_by_role('heading', name='Your guide to Qivvera', exact=True)).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.get_by_role('button', name='Open navigation', exact=True).click()
        page.keyboard.press('Escape')
        expect(page.get_by_role('navigation', name='Main navigation').get_by_role('link', name='Support', exact=True)).to_be_hidden()
        page.get_by_role('button', name='Open navigation', exact=True).click()
        nav(page, 'Support')
        expect(page.get_by_role('heading', name='Workspace support', exact=True)).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(OUTPUT / 'increment6-support-mobile.png'), full_page=True)
        page.set_viewport_size({'width': 1440, 'height': 1000})
        check('At 390px the navigation is a drawer: hidden until opened, closes on Escape; Guide and Support stay usable without horizontal page overflow.')

        page.goto(fixture.origin + '/#/changes/00000000-0000-4000-8000-000000000000')
        expect(page.get_by_role('heading', name='We could not open this view', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='Try again', exact=True)).to_be_visible()
        expect(page.get_by_role('link', name='Get support details', exact=True)).to_be_visible()
        check('An unavailable change produces a recoverable error view rather than a blank or successful state.')

        # Revoke the actual server session outside the page, then deliver the genuine
        # API 401 with the fixture's unreadable transport body.
        current_session = request_json(page, fixture, '/api/session')
        revoked = page.request.delete(fixture.origin + '/api/session', headers={
            'Origin': fixture.origin, 'X-CSRF-Token': current_session['csrfToken'],
        })
        assert revoked.status == 200
        nav(page, 'Support')
        expect(page.get_by_role('heading', name='Welcome to Qivvera', exact=True)).to_be_visible()
        expect(page.get_by_role('alert')).to_contain_text('Your session ended')
        assert page.get_by_role('heading', name='Workspace support', exact=True).count() == 0
        check('A genuinely revoked session clears authenticated UI even when the 401 body is unreadable.')

        # Hold a valid response after server authorization, switch identities, and
        # verify that the old response cannot open a dialog in the new session.
        sign_in(page, fixture, 'author@example.test')
        page.goto(change_url, wait_until='networkidle')
        page.get_by_role('button', name='Requirements', exact=True).click()
        with page.expect_response(lambda response: '/api/obligations/' in response.url and response.url.endswith('/history')) as old_history:
            page.get_by_role('button', name='Review history', exact=True).click()
        history_response = old_history.value
        sign_out(page)
        sign_in(page, fixture, 'viewer@example.test')
        history_response.body()  # Wait for the real delayed body without a lingering target-close waiter.
        page.wait_for_timeout(100)  # Let the completed response's browser continuation run.
        expect(page.locator('dialog[open]')).to_have_count(0)
        expect(page.locator('.identity .email > span')).to_have_text('viewer@example.test')
        check('A delayed authorized history response cannot reopen a previous-session dialog after sign-out and identity change.')

        nav(page, 'Guide')
        expect(page.get_by_role('heading', name='Your guide to Qivvera', exact=True)).to_be_visible()
        with page.expect_response(lambda response: response.url.endswith('/api/support-info')) as old_support:
            nav(page, 'Support')
        support_response = old_support.value
        sign_out(page)
        sign_in(page, fixture, 'policy@example.test')
        support_response.body()
        expect(page.get_by_role('heading', name='Workspace support', exact=True)).to_be_visible()
        current_diagnostic = download_support(page)
        assert current_diagnostic['roles'] == ['POLICY_AUTHORITY']
        assert current_diagnostic['actions']['reviewObligations'] is True
        check('A delayed support reply cannot replace the new identity’s role or diagnostic download.')

        # Expiry during DELETE /api/session must clear the UI as well as expiry on
        # ordinary read routes. Keep old history in the closed dialog to verify cleanup.
        page.goto(change_url, wait_until='networkidle')
        page.get_by_role('button', name='Requirements', exact=True).click()
        page.get_by_role('button', name='Review history', exact=True).click()
        expect(page.get_by_role('heading', name='Obligation review history', exact=True)).to_be_visible()
        page.get_by_role('button', name='Close dialog', exact=True).click()
        current_session = request_json(page, fixture, '/api/session')
        revoked = page.request.delete(fixture.origin + '/api/session', headers={
            'Origin': fixture.origin, 'X-CSRF-Token': current_session['csrfToken'],
        })
        assert revoked.status == 200
        sign_out(page)
        expect(page.locator('dialog')).to_be_empty()
        expect(page.get_by_role('alert')).to_contain_text('Your session ended')
        check('Sign out after actual revocation handles DELETE-session 401 and clears cached dialog content.')

        sign_in(page, fixture, 'author@example.test')
        nav(page, 'Workspace')
        page.get_by_role('button', name='+ Register application', exact=True).click()
        page.get_by_label('Application name').fill('Lost response application')
        page.get_by_role('button', name='Register application', exact=True).click()
        expect(page.locator('dialog').get_by_role('alert')).to_contain_text('Your action may have been saved.')
        expect(page.locator('dialog').get_by_role('alert')).to_contain_text('check the records before submitting it again')
        workspace_after_loss = request_json(page, fixture, '/api/workspace')
        assert len([app for app in workspace_after_loss['applications'] if app['name'] == 'Lost response application']) == 1
        assert 'Saved to your workspace.' not in page.locator('#toast').inner_text()
        page.get_by_role('button', name='Close dialog', exact=True).click()
        page.reload(wait_until='networkidle')
        nav(page, 'Applications')
        expect(page.get_by_role('heading', name='Lost response application', exact=True)).to_be_visible()
        check('A dropped reply after a real save warns about uncertainty; reloading exposes the one saved record without automatic resubmission.')

        disabled = Fixture(int(os.environ.get('FIRST_RELEASE_TEST_DISABLED_PORT', '3187')), 'disabled')
        fixtures.append(disabled)
        disabled_context = browser.new_context(viewport={'width': 1440, 'height': 1000})
        disabled_page = disabled_context.new_page()
        disabled_page.on('pageerror', lambda error: page_errors.append(str(error)))
        disabled_page.goto(disabled.origin, wait_until='networkidle')
        sign_in(disabled_page, disabled, 'author@example.test')
        expect(disabled_page.get_by_role('heading', name='Your turn', exact=True)).to_be_visible()
        nav(disabled_page, 'Support')
        expect(disabled_page.get_by_role('heading', name='Workspace support', exact=True)).to_be_visible()
        disabled_info = request_json(disabled_page, disabled, '/api/support-info')
        for capability in ['assessmentQueue', 'configuredTargets', 'multiObligation', 'resolution', 'githubIntake']:
            assert disabled_info['capabilities'][capability] is False
        warning_codes = {item['code'] for item in disabled_info['warnings']}
        assert {'ASSURANCE_DISABLED', 'RESOLUTION_DISABLED', 'GITHUB_INTAKE_DISABLED'} <= warning_codes
        assert disabled_page.get_by_role('navigation', name='Main navigation').get_by_role('link', name='GitHub intake', exact=True).count() == 0
        assert disabled_page.get_by_role('navigation', name='Main navigation').get_by_role('link', name='Resolutions', exact=True).count() == 0
        check('A separate real disabled-feature configuration reports actionable gaps without presenting disabled workflows as operational.')
        assert not page_errors, page_errors
        check('All browser journeys complete without uncaught JavaScript errors.')
        browser.close()
        report['status'] = 'passed'
        report['passed'] = True
except Exception as error:
    report['phase'] = phase
    report['error'] = str(error)
    report['status'] = 'blocked' if phase in ['runtime', 'browser launch'] else 'failed'
finally:
    for fixture in reversed(fixtures):
        fixture.stop()
    report['count'] = len(checks)
    report['finishedAt'] = datetime.now(timezone.utc).isoformat()
    (OUTPUT / 'first-release-browser-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
if not report['passed']:
    raise SystemExit(1)

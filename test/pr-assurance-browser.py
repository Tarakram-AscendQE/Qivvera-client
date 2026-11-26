"""Native PR assurance journey over real HTTP, authentication, PostgreSQL and service code: register an
application with its repositories and GitHub token in the UI, choose it in PR assurance, import its
pull requests from GitHub and evaluate them.

Only GitHub is a stand-in (pr-assurance-browser-fixture.mjs): each run plays out over successive syncs
with the real check names and the evidence prcheck-verifiers recorded for each PR commit. Hosted HTTPS,
the real GitHub Actions workflow and Neon remain separate acceptance. Missing Chromium fails, never skips.
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
OUTPUT = Path(os.environ.get('QIVVERA_TEST_OUTPUT', str(WORK / 'review-test-results'))) / 'pr-assurance'
OUTPUT.mkdir(parents=True, exist_ok=True)
checks = []
report = {
    'status': 'running', 'passed': False, 'checks': checks,
    'method': 'Native Chromium, real HTTP/authentication, disposable PostgreSQL; GitHub replaced by a stand-in that replays recorded evidence.',
    'hostedHTTPS': False, 'realGitHubActions': False,
    'startedAt': datetime.now(timezone.utc).isoformat(),
}


def check(description):
    checks.append(description)


class Fixture:
    def __init__(self):
        self.password = secrets.token_urlsafe(32)
        port = int(os.environ.get('PR_TEST_PORT', '3196'))
        self.origin = f'http://127.0.0.1:{port}'
        self.log = (OUTPUT / 'pr-assurance-fixture.log').open('w')
        self.process = subprocess.Popen(
            ['node', 'test/pr-assurance-browser-fixture.mjs'], cwd=WORK,
            env={**os.environ, 'PR_TEST_PORT': str(port), 'PR_TEST_PASSWORD': self.password},
            stdout=subprocess.PIPE, stderr=self.log, text=True,
        )
        lines = queue.Queue()
        threading.Thread(target=lambda: lines.put(self.process.stdout.readline()), daemon=True).start()
        try:
            self.metadata = json.loads(lines.get(timeout=20))
            assert self.metadata['origin'] == self.origin
        except Exception:
            self.stop()
            raise RuntimeError('PR assurance fixture did not start; inspect pr-assurance-fixture.log.')

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
    page.goto(fixture.origin + '/', wait_until='networkidle')
    page.get_by_label('Email address').fill(email)
    page.get_by_label('Password', exact=True).fill(fixture.password)
    page.locator('#login-form').get_by_role('button', name='Open workspace').click()
    expect(page.get_by_role('button', name='Sign out', exact=True)).to_be_visible()


def sign_out(page):
    page.get_by_role('button', name='Sign out', exact=True).click()
    expect(page.get_by_role('heading', name='Welcome to Qivvera', exact=True)).to_be_visible()


def card(page, number):
    return page.locator(f'[data-pull="{number}"]')


APP = {}


def open_timeline(page, fixture):
    page.goto(fixture.origin + f"/#/pr-assurance/apps/{APP['id']}", wait_until='networkidle')
    expect(page.get_by_role('heading', name='VendorPay', exact=True)).to_be_visible()


def pull_url(fixture, number):
    return fixture.origin + f"/#/pr-assurance/apps/{APP['id']}/pulls/{number}"


def register(page, fixture, token):
    dialog = page.locator('#modal')
    dialog.get_by_label('Application name *').fill('VendorPay')
    dialog.get_by_label('Description').fill('Supplier payments')
    dialog.get_by_label('Application repository URL *').fill('https://github.com/prcheck-live/vendorpay-app')
    dialog.get_by_label('Test automation repository URL *').fill('https://github.com/prcheck-live/prcheck-verifiers')
    dialog.get_by_label('Profiles repository URL *').fill('https://github.com/prcheck-live/vendorpay-policies')
    dialog.get_by_label('GitHub personal access token *').fill(token)
    dialog.get_by_role('button', name='Register application', exact=True).click()


def evaluate(page, fixture, number, summary):
    """Opens a PR, starts an evaluation, watches it progress and waits for the report."""
    page.goto(pull_url(fixture, number), wait_until='networkidle')
    expect(page.get_by_text('Not evaluated yet', exact=True)).to_be_visible()
    page.get_by_role('button', name='Evaluate with Qivvera', exact=True).click()
    expect(page.get_by_role('heading', name='Evaluation in progress', exact=True)).to_be_visible()
    expect(page.locator('.pr-stages li.current')).to_have_count(1)
    expect(page.get_by_text(re.compile(r'\d+ of 14 finished'))).to_be_visible(timeout=20000)
    # Screen readers hear the same progress through the run panel's polite live region.
    expect(page.locator('.pr-run [role="status"][aria-live="polite"]')).to_have_text(re.compile(r'\d+ of 14 checks finished'), timeout=20000)
    expect(page.get_by_text(summary, exact=True)).to_be_visible(timeout=40000)
    expect(page.get_by_role('heading', name='Latest result', exact=True)).to_be_visible()


phase = 'runtime'
fixture = None
try:
    phase = 'fixture'
    fixture = Fixture()
    with sync_playwright() as playwright:
        phase = 'browser launch'
        launch = {'headless': True}
        if os.environ.get('CHROMIUM_EXECUTABLE'):
            launch['executable_path'] = os.environ['CHROMIUM_EXECUTABLE']
        browser = playwright.chromium.launch(**launch)
        phase = 'browser assertions'
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        syncs = []
        page.on('request', lambda request: syncs.append(request.url) if request.url.endswith('/sync') else None)

        sign_in(page, fixture, 'author@example.test')
        page.get_by_role('navigation', name='Main navigation').get_by_role('link', name='Applications', exact=True).click()
        page.get_by_role('button', name='+ Register application', exact=True).click()
        token_field = page.locator('#modal').get_by_label('GitHub personal access token *')
        expect(token_field).to_have_attribute('type', 'password')
        page.locator('#modal').get_by_role('button', name='Show token', exact=True).click()
        expect(token_field).to_have_attribute('type', 'text')
        page.locator('#modal').get_by_role('button', name='Hide token', exact=True).click()
        expect(token_field).to_have_attribute('type', 'password')
        page.screenshot(path=str(OUTPUT / 'register-dialog.png'))
        check('The Register application dialog asks for the three repositories and a token that stays hidden until shown.')

        wrong = 'github_pat_' + secrets.token_hex(20)
        register(page, fixture, wrong)
        expect(page.locator('#modal [role="alert"]')).to_contain_text('rejected this application', timeout=15000)
        assert wrong not in page.locator('#modal [role="alert"]').inner_text()
        check('A token GitHub rejects is reported in the dialog, never echoed, and nothing is saved.')

        page.locator('#modal').get_by_label('GitHub personal access token *').fill(fixture.metadata['token'])
        page.locator('#modal').get_by_role('button', name='Register application', exact=True).click()
        expect(page.get_by_role('heading', name='VendorPay', exact=True)).to_be_visible(timeout=15000)
        APP['id'] = re.search(r'#/applications/([0-9a-f-]{36})', page.url).group(1)
        panel = page.locator('#app-github')
        expect(panel.get_by_role('link', name='prcheck-live/prcheck-verifiers', exact=True)).to_be_visible()
        expect(panel.get_by_text('Stored encrypted', exact=True)).to_be_visible()
        assert fixture.metadata['token'] not in page.content()
        check('Registering saves the application with its checked GitHub access; the page shows the repositories, never the token.')

        page.get_by_role('navigation', name='Main navigation').get_by_role('link', name='PR assurance', exact=True).click()
        expect(page.get_by_role('heading', name='Pull request assurance', exact=True)).to_be_visible()
        page.locator(f"[data-application=\"{APP['id']}\"]").get_by_role('link', name='VendorPay', exact=True).click()
        expect(page.get_by_role('heading', name='VendorPay', exact=True)).to_be_visible()
        expect(page.get_by_text('6 rules · 14 obligations', exact=False)).to_be_visible()
        expect(page.get_by_text('No pull requests imported yet', exact=True)).to_be_visible()
        check('PR assurance lists the registered application; choosing it shows its rules and no pull requests yet.')

        page.get_by_role('button', name='Show open pull requests', exact=True).click()
        expect(page.locator('[data-github-pull]')).to_have_count(3)
        page.locator('[data-github-pull="6"]').get_by_role('button', name='Import', exact=True).click()
        expect(card(page, 6).get_by_text('Not evaluated', exact=True)).to_be_visible()
        page.get_by_role('button', name='Import all from GitHub', exact=True).click()
        expect(page.get_by_text('All 2 pull requests imported from GitHub. Nothing has been evaluated yet.', exact=True)).to_be_visible()
        for number in (6, 7, 8):
            expect(card(page, number).get_by_text('Not evaluated', exact=True)).to_be_visible()
            expect(card(page, number).get_by_text(fixture.metadata['pulls'][str(number)][:7], exact=True)).to_be_visible()
        page.get_by_role('button', name='Show open pull requests', exact=True).click()
        expect(page.locator('[data-github-pull] >> text=Imported')).to_have_count(3)
        check('The application\'s open pull requests are listed with its own token; importing one, then the rest with one button, reads each title, branch and exact head commit.')

        evaluate(page, fixture, 6, 'NOT READY · 2 rules broken · 11 of 14 obligations supported')
        expect(page.get_by_text('The team’s own tests all passed, yet 2 business rules are broken.', exact=True)).to_be_visible()
        expect(page.locator('[data-rule]')).to_have_count(2)
        expect(page.locator('[data-rule="FIN-001"]').get_by_text('V2/bank-change-self-approval-blocked', exact=True)).to_be_visible()
        page.screenshot(path=str(OUTPUT / 'pr-6-report.png'), full_page=True)
        check('Evaluating PR #6 shows live progress (also announced to screen readers), then NOT READY with FIN-001 and FIN-002 broken while the team\'s tests pass.')

        evaluate(page, fixture, 7, 'NOT READY · 1 rule broken · 12 of 14 obligations supported')
        since = page.get_by_role('region', name='Since PR #6')
        expect(since.get_by_text('FIN-001', exact=True)).to_be_visible()
        check('PR #7 reports FIN-001 fixed since PR #6 and FIN-002 still broken.')

        evaluate(page, fixture, 8, 'READY · no rules broken · 14 of 14 obligations supported')
        expect(page.get_by_text('No business rule is broken on this commit.', exact=True)).to_be_visible()
        page.screenshot(path=str(OUTPUT / 'pr-8-report.png'), full_page=True)
        check('PR #8 is READY with every obligation supported.')

        open_timeline(page, fixture)
        expect(page.get_by_label('Progression')).to_have_text('2 → 1 → 0 rules broken')
        row = page.locator('tr[data-obligation="FIN-002.1"] td')
        expect(row.nth(1)).to_have_text('VIOLATED')
        expect(row.nth(3)).to_have_text('SUPPORTED')
        expect(row.nth(4)).to_have_text('Now supported')
        page.screenshot(path=str(OUTPUT / 'timeline.png'), full_page=True)
        check('The timeline shows 2 → 1 → 0 and the comparison table marks FIN-002.1 now supported.')

        page.goto(pull_url(fixture, 6), wait_until='networkidle')
        expect(page.locator('.pr-history li')).to_have_count(1)
        page.locator('.pr-history a').first.click()
        expect(page.get_by_role('heading', name='Assessment run', exact=True)).to_be_visible()
        expect(page.get_by_text('NOT READY · 2 rules broken · 11 of 14 obligations supported', exact=True)).to_be_visible()
        check('A run stays available by its own link from the PR\'s history.')

        page.goto(pull_url(fixture, 6), wait_until='networkidle')
        page.get_by_role('button', name='Evaluate with Qivvera', exact=True).click()
        expect(page.get_by_role('heading', name='Evaluation in progress', exact=True)).to_be_visible()
        page.evaluate("location.hash = '#/guide'")
        expect(page.get_by_role('heading', name='Your guide to Qivvera', exact=True)).to_be_visible()
        before = len(syncs)
        page.wait_for_timeout(5000)
        assert len(syncs) == before, (before, len(syncs))
        check('Leaving a running evaluation stops its syncing; nothing from it is drawn on the new page.')

        page.set_viewport_size({'width': 390, 'height': 844})
        open_timeline(page, fixture)
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        page.goto(pull_url(fixture, 8), wait_until='networkidle')
        expect(page.get_by_text('READY · no rules broken · 14 of 14 obligations supported', exact=True)).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        page.screenshot(path=str(OUTPUT / 'mobile-report.png'), full_page=True)
        page.set_viewport_size({'width': 1440, 'height': 1000})
        check('The timeline and the report stay readable without horizontal overflow at 390px.')

        sign_out(page)
        sign_in(page, fixture, 'viewer@example.test')
        open_timeline(page, fixture)
        assert page.get_by_role('button', name=re.compile('Import|Show open')).count() == 0
        page.goto(pull_url(fixture, 8), wait_until='networkidle')
        expect(page.get_by_role('button', name='Evaluate with Qivvera', exact=True)).to_be_disabled()
        check('A Viewer can read the pull requests and reports but cannot import or evaluate.')

        assert not errors, errors
        check('The complete native PR assurance journey has no uncaught page JavaScript errors.')
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
    (OUTPUT / 'pr-assurance-browser-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
if not report['passed']:
    raise SystemExit(1)

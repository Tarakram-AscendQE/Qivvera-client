"""Native browser regression for record identity and navigation races.

Actual local HTTP app, sessions, SQLite and worker-generated source findings.
The fixture holds genuine response bodies behind explicit release barriers; no browser fetch/API is mocked.
Synthetic GitHub provider metadata exercises intake navigation only.
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
OUTPUT = Path(os.environ.get('QIVVERA_TEST_OUTPUT', str(WORK / 'review-test-results' / 'navigation')))
OUTPUT.mkdir(parents=True, exist_ok=True)
checks = []
report = {
    'passed': False, 'checks': checks,
    'method': 'Native Chromium, genuine local HTTP handlers and sessions, disposable SQLite, genuine synthetic worker evidence.',
    'transportFaults': 'Selected genuine read and saved-write reply bodies remain pending until an explicit fixture-only release after the competing browser state is established.',
    'liveGitHub': False, 'hostedAcceptance': False, 'postgresAcceptance': False,
    'startedAt': datetime.now(timezone.utc).isoformat(),
}
password = secrets.token_urlsafe(32)
log = (OUTPUT / 'navigation-fixture.log').open('w')
process = None


def sign_in(page, email):
    page.get_by_label('Email address').fill(email)
    page.get_by_label('Password', exact=True).fill(password)
    page.get_by_role('button', name='Open workspace').click()
    expect(page.get_by_role('button', name='Sign out', exact=True)).to_be_visible()


def nav(page, label):
    page.get_by_role('navigation', name='Main navigation').get_by_role('link', name=label, exact=True).click()


def read(page, origin, path):
    response = page.request.get(origin + path)
    assert response.status == 200, (path, response.status)
    return response.json()


def same_document(page, nonce):
    assert page.evaluate('window.__qivveraNavigationDocumentNonce') == nonce, \
        'The navigation race must stay in the original document; a reload would discard stale callbacks.'


def barrier_request(page, fixture, method, suffix, data=None):
    return page.request.fetch(fixture['origin'] + '/_navigation_test/barriers/' + suffix,
        method=method, headers={'X-Navigation-Fixture-Control': fixture['controlToken']}, data=data)


def arm(page, fixture, key):
    response = barrier_request(page, fixture, 'POST', 'arm', {'key': key})
    assert response.status == 201, (key, response.status)
    record = response.json()
    assert record['state'] == 'armed'
    return record['id']


def delivered(page, response, fixture, barrier, nonce):
    # The caller has already established the competing route/form/session. Confirm the
    # old body is still pending in that same document before deliberately releasing it.
    same_document(page, nonce)
    pending = barrier_request(page, fixture, 'GET', barrier)
    assert pending.status == 200 and pending.json()['state'] == 'pending', \
        ('The stale response was not pending at the competing state', pending.status, pending.text())
    released = barrier_request(page, fixture, 'POST', barrier + '/release')
    assert released.status == 200, ('Cannot release the pending response', released.status)
    response.body()
    # Let the completed genuine fetch's continuation run in the browser event loop.
    page.wait_for_timeout(100)
    same_document(page, nonce)
    completed = barrier_request(page, fixture, 'GET', barrier)
    assert completed.status == 200 and completed.json()['state'] == 'completed', \
        ('The response body did not complete normally', completed.status, completed.text())


try:
    version = subprocess.check_output(['node', '--version'], text=True).strip()
    parts = [int(part) for part in version.lstrip('v').split('.')]
    assert parts[0] == 22 and parts[1] >= 16, 'Use the supported Node 22 runtime.'
    report['nodeVersion'] = version
    process = subprocess.Popen(['node', 'test/navigation-browser-fixture.mjs'], cwd=WORK,
        env={**os.environ, 'NAVIGATION_TEST_PASSWORD': password,
             'NAVIGATION_TEST_PORT': os.environ.get('NAVIGATION_TEST_PORT', '3286')},
        stdout=subprocess.PIPE, stderr=log, text=True)
    metadata = queue.Queue()
    threading.Thread(target=lambda: metadata.put(process.stdout.readline()), daemon=True).start()
    fixture = json.loads(metadata.get(timeout=20))
    origin = fixture['origin']
    first_path = '/api/resolutions/' + fixture['firstResolutionId']
    second_path = '/api/resolutions/' + fixture['secondResolutionId']
    change_path = '/api/changes/' + fixture['changeId']
    other_path = '/api/changes/' + fixture['otherChangeId']

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True,
            executable_path=os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'))
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(origin, wait_until='networkidle')
        sign_in(page, 'author@example.test')
        document_nonce = secrets.token_hex(24)
        page.evaluate('(nonce) => { window.__qivveraNavigationDocumentNonce = nonce; }', document_nonce)

        # A slow older read must not change the record used by B's visible actions.
        barrier = arm(page, fixture, 'resolution-a')
        with page.expect_response(lambda response: response.url == origin + first_path) as pending:
            page.goto(origin + '/#/resolutions/' + fixture['firstResolutionId'])
        page.goto(origin + '/#/resolutions/' + fixture['secondResolutionId'])
        expect(page.get_by_role('heading', name=fixture['secondStatement'], exact=True)).to_be_visible()
        delivered(page, pending.value, fixture, barrier, document_nonce)
        page.get_by_role('button', name='Add note', exact=True).click()
        note = 'This note belongs only to the currently displayed second resolution.'
        page.get_by_label('Reason for this action').fill(note)
        with page.expect_response(lambda response: response.url == origin + second_path + '/actions') as saved:
            page.get_by_role('button', name='Save note', exact=True).click()
        assert saved.value.status == 200
        expect(page.locator('dialog')).not_to_be_visible()
        assert any(event['rationale'] == note for event in read(page, origin, second_path)['history'])
        assert all(event['rationale'] != note for event in read(page, origin, first_path)['history'])
        checks.append('A delayed resolution A read cannot retarget a note made from displayed resolution B.')

        # Reading another change must not leak its resolution list into the displayed change.
        barrier = arm(page, fixture, 'change-a-resolutions')
        with page.expect_response(lambda response: response.url.startswith(origin + change_path + '/resolutions?')) as pending:
            page.goto(origin + '/#/changes/' + fixture['changeId'])
        page.goto(origin + '/#/changes/' + fixture['otherChangeId'])
        expect(page.get_by_role('heading', name=fixture['otherChangeTitle'], exact=True)).to_be_visible()
        delivered(page, pending.value, fixture, barrier, document_nonce)
        page.get_by_role('button', name='Resolutions', exact=True).click()
        expect(page.get_by_role('heading', name='No resolution items yet', exact=True)).to_be_visible()
        assert page.locator('.resolution-row').count() == 0
        checks.append('A delayed resolution list cannot populate another change or a later tab render.')

        # A form opened on A becomes unusable when the browser navigates to B.
        page.goto(origin + '/#/changes/' + fixture['changeId'])
        expect(page.get_by_role('heading', name=fixture['changeTitle'], exact=True)).to_be_visible()
        page.get_by_role('button', name='Requirements', exact=True).click()
        before_a = read(page, origin, change_path)['obligations']
        before_b = read(page, origin, other_path)['obligations']
        page.get_by_role('button', name='+ Add obligation', exact=True).click()
        page.get_by_label('What must be true?').fill('An unsaved requirement must never transfer to another change.')
        page.goto(origin + '/#/changes/' + fixture['otherChangeId'])
        expect(page.get_by_role('heading', name=fixture['otherChangeTitle'], exact=True)).to_be_visible()
        same_document(page, document_nonce)
        expect(page.locator('dialog')).not_to_be_visible()
        assert read(page, origin, change_path)['obligations'] == before_a
        assert read(page, origin, other_path)['obligations'] == before_b
        checks.append('Navigating away dismisses an unsaved obligation dialog without changing either record.')

        # A write already sent remains on A; its delayed reply cannot close B's newer form.
        page.goto(origin + '/#/changes/' + fixture['changeId'])
        expect(page.get_by_role('heading', name=fixture['changeTitle'], exact=True)).to_be_visible()
        page.get_by_role('button', name='+ Add obligation', exact=True).click()
        page.get_by_label('What must be true?').fill('Delayed save stays with the first change.')
        barrier = arm(page, fixture, 'obligation-save-a')
        with page.expect_response(lambda response: response.url == origin + change_path + '/obligations' and response.request.method == 'POST') as pending:
            page.get_by_role('button', name='Add candidate', exact=True).click()
        page.goto(origin + '/#/changes/' + fixture['otherChangeId'])
        expect(page.get_by_role('heading', name=fixture['otherChangeTitle'], exact=True)).to_be_visible()
        page.get_by_role('button', name='+ Add obligation', exact=True).click()
        page.get_by_label('What must be true?').fill('Keep this new dialog open on the second change.')
        delivered(page, pending.value, fixture, barrier, document_nonce)
        assert page.url.endswith('/#/changes/' + fixture['otherChangeId'])
        expect(page.locator('dialog')).to_be_visible()
        expect(page.get_by_label('What must be true?')).to_have_value('Keep this new dialog open on the second change.')
        assert len(read(page, origin, change_path)['obligations']) == len(before_a) + 1
        assert read(page, origin, other_path)['obligations'] == before_b
        page.get_by_role('button', name='Cancel', exact=True).click()
        checks.append('A delayed saved-write reply neither redirects navigation nor closes a newer dialog; the write stays on its original change.')

        # Delayed preparation must not open a stale action dialog after navigation.
        page.goto(origin + '/#/resolutions/' + fixture['secondResolutionId'])
        expect(page.get_by_role('heading', name=fixture['secondStatement'], exact=True)).to_be_visible()
        barrier = arm(page, fixture, 'resolution-assignees')
        with page.expect_response(lambda response: response.url == origin + '/api/resolution-assignees') as pending:
            page.get_by_role('button', name='Edit ownership / action', exact=True).click()
        page.goto(origin + '/#/changes/' + fixture['otherChangeId'])
        expect(page.get_by_role('heading', name=fixture['otherChangeTitle'], exact=True)).to_be_visible()
        delivered(page, pending.value, fixture, barrier, document_nonce)
        expect(page.locator('dialog')).not_to_be_visible()
        checks.append('A delayed ownership directory cannot open a resolution dialog on a later route.')

        # The old preview was genuinely stored, but it cannot replace the new visible one.
        nav(page, 'GitHub intake')
        expect(page.get_by_role('heading', name='Import a GitHub change', exact=True)).to_be_visible()
        page.get_by_label('Open pull-request number').fill('12')
        barrier = arm(page, fixture, 'preview-12')
        with page.expect_response(lambda response: response.url == origin + '/api/source-previews') as pending:
            page.get_by_role('button', name='Preview source metadata', exact=True).click()
        nav(page, 'Workspace')
        nav(page, 'GitHub intake')
        page.get_by_label('Open pull-request number').fill('13')
        page.get_by_role('button', name='Preview source metadata', exact=True).click()
        expect(page.get_by_role('heading', name='Synthetic pull 13', exact=True)).to_be_visible()
        delivered(page, pending.value, fixture, barrier, document_nonce)
        expect(page.get_by_role('heading', name='Synthetic pull 13', exact=True)).to_be_visible()
        expect(page.get_by_role('heading', name='Synthetic pull 12', exact=True)).not_to_be_visible()
        checks.append('An old genuine preview reply cannot overwrite a newer Intake visit and preview.')

        # Delayed data from an old identity must not revive its authenticated view.
        barrier = arm(page, fixture, 'resolution-a')
        with page.expect_response(lambda response: response.url == origin + first_path) as pending:
            page.goto(origin + '/#/resolutions/' + fixture['firstResolutionId'])
        page.get_by_role('button', name='Sign out', exact=True).click()
        expect(page.get_by_role('heading', name='Welcome to Qivvera', exact=True)).to_be_visible()
        page.goto(origin + '/#/overview')
        sign_in(page, 'viewer@example.test')
        delivered(page, pending.value, fixture, barrier, document_nonce)
        expect(page.get_by_role('heading', name='Your turn', exact=True)).to_be_visible()
        assert 'viewer@example.test' in page.locator('.identity').inner_text()
        expect(page.locator('dialog')).not_to_be_visible()
        checks.append('A delayed prior-session resolution response cannot restore content or controls after identity change.')

        page.set_viewport_size({'width': 390, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(OUTPUT / 'navigation-safe-mobile.png'), full_page=True)
        checks.append('The resulting Viewer workspace remains usable without horizontal page overflow on mobile.')
        assert not errors, errors
        checks.append('No uncaught browser errors occurred during the genuine response races.')
        report['passed'] = True
        browser.close()
except Exception as error:
    report['error'] = str(error)
finally:
    if process is not None and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=3)
    log.close()
    report['count'] = len(checks)
    report['finishedAt'] = datetime.now(timezone.utc).isoformat()
    (OUTPUT / 'navigation-browser-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    if not report['passed']:
        raise SystemExit(1)

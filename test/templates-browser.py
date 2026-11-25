"""Native template review, new-plan approval, versioning and honest error recovery.

The fixture uses genuine HTTP, authentication, schema-7 persistence and approved
plans. It does not execute a verifier or claim hosted/live-provider acceptance.
Only genuine response delivery is delayed or dropped for recovery/race checks.
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
OUTPUT = Path(os.environ.get('QIVVERA_TEST_OUTPUT', str(WORK / 'review-test-results' / 'templates')))
OUTPUT.mkdir(parents=True, exist_ok=True)
checks = []
report = {
    'status': 'running', 'passed': False, 'checks': checks,
    'method': 'Native Chromium, real HTTP/authentication and disposable schema-7 SQLite; real approved plans and template receipts.',
    'transportFaults': 'One genuine saved-plan reply is lost; genuine template GET bodies are delayed for navigation/session races.',
    'hostedHTTPS': False, 'postgresAcceptance': False, 'liveExecution': False,
    'startedAt': datetime.now(timezone.utc).isoformat(),
}


def check(description):
    checks.append(description)


class Fixture:
    def __init__(self):
        self.password = secrets.token_urlsafe(32)
        port = int(os.environ.get('TEMPLATES_TEST_PORT', '3190'))
        self.origin = f'http://127.0.0.1:{port}'
        self.log = (OUTPUT / 'templates-fixture.log').open('w')
        self.process = subprocess.Popen(['node', 'test/templates-browser-fixture.mjs'], cwd=WORK,
            env={**os.environ, 'TEMPLATES_TEST_PORT': str(port), 'TEMPLATES_TEST_PASSWORD': self.password,
                 'TEMPLATES_TEST_LATENCY_MS': '900', 'TEMPLATES_TEST_DROP_PLAN_REPLY': 'true'},
            stdout=subprocess.PIPE, stderr=self.log, text=True)
        lines = queue.Queue()
        threading.Thread(target=lambda: lines.put(self.process.stdout.readline()), daemon=True).start()
        try:
            self.metadata = json.loads(lines.get(timeout=15))
            assert self.metadata['origin'] == self.origin and self.metadata['schemaVersion'] == 7
        except Exception:
            self.stop()
            raise RuntimeError('Template fixture did not start; inspect templates-fixture.log.')

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


def open_assurance(page, fixture, change_id):
    page.goto(fixture.origin + '/#/changes/' + change_id, wait_until='networkidle')
    page.get_by_role('button', name='Plan & check', exact=True).click()
    expect(page.get_by_role('heading', name='Approved verification plan', exact=True)).to_be_visible()


def save_from_source(page, fixture, meta, name):
    open_assurance(page, fixture, meta['sourceId'])
    page.get_by_role('link', name='Save as template', exact=True).click()
    expect(page.get_by_role('heading', name='Save verification template', exact=True)).to_be_visible()
    page.get_by_label('Template name', exact=False).fill(name)
    page.get_by_label('When should this approach be considered?', exact=False).fill('Review explicit separation and finality checks for another approved workflow implementation.')
    page.get_by_label('Why save this approach?', exact=False).fill('Retain the reviewed source mapping as a reference, with fresh approval required for each new plan.')
    page.locator('#template-save-form input[name=acknowledgeLimits]').check()
    with page.expect_response(lambda response: response.request.method == 'POST' and response.url.endswith('/api/verification-templates')) as pending:
        page.get_by_role('button', name='Save template', exact=True).click()
    response = pending.value
    assert response.status == 201, response.text()
    saved = response.json()
    expect(page.locator('#template-detail')).to_be_visible()
    return saved


def open_mapping(page, fixture, meta, template):
    url = fixture.origin + f'/#/template-plan/{meta["destinationId"]}/{meta["destinationRevisionId"]}/{template["family"]["id"]}/{template["version"]["id"]}'
    endpoint = f'/api/verification-templates/{template["family"]["id"]}?version={template["version"]["id"]}'
    with page.expect_response(lambda response: response.request.method == 'GET' and response.url.endswith(endpoint)) as pending:
        if page.url == url:
            # The same hash URL does not reload its data. Use the product's real
            # reload action after concurrent changes made in another session.
            page.get_by_role('button', name='Reload approval inputs', exact=True).click()
        else:
            page.goto(url, wait_until='networkidle')
    response = pending.value
    assert response.status == 200, response.text()
    assert response.json()['version']['id'] == template['version']['id']
    expect(page.get_by_role('heading', name='Review template mappings', exact=True)).to_be_visible()


def fill_mapping(page, meta):
    for check_id, obligation in zip(['separation', 'finality'], meta['destinationObligations']):
        fieldset = page.locator(f'[data-template-check="{check_id}"]')
        fieldset.locator('select').select_option(obligation['id'])
        fieldset.get_by_label('Why does this check support the new requirement?', exact=False).fill('I reviewed this new accepted requirement against the exact bounded check and its declared exclusions.')
    page.get_by_label('Approved target for this revision', exact=True).select_option(meta['destinationTargetId'])
    page.get_by_label('Reason for approving this new plan', exact=False).fill('The two selected requirements are mapped explicitly; the additional mandatory audit requirement remains a gap.')
    page.locator('#template-plan-form input[name=acknowledgeLimits]').check()


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
        assert page.request.get(fixture.origin + '/api/verification-templates').status == 401
        page.goto(fixture.origin, wait_until='networkidle')
        sign_in(page, fixture, 'policy@example.test')
        assert read(page, fixture, '/api/workspace')['capabilities']['verificationTemplates'] is True
        page.get_by_role('link', name='Support', exact=True).click()
        expect(page.get_by_role('heading', name='Workspace support', exact=True)).to_be_visible()
        page.get_by_text('Actions available to your role', exact=True).click()
        template_action = page.locator('dt').filter(has_text='Manage verification templates')
        expect(template_action).to_be_visible()
        expect(template_action.locator('xpath=following-sibling::dd[1]')).to_have_text('Available for your role')
        with page.expect_download() as pending:
            page.get_by_role('button', name='Download support details', exact=True).click()
        diagnostic = json.loads(Path(pending.value.path()).read_text())
        assert diagnostic['schema'] == 'qivvera.support-info/1'
        assert diagnostic['workspace']['schemaVersion'] == 7
        assert diagnostic['capabilities']['verificationTemplates'] is True
        assert diagnostic['actions']['manageVerificationTemplates'] is True
        page.get_by_role('link', name='Verification templates', exact=True).click()
        expect(page.get_by_role('heading', name='No templates in this view', exact=True)).to_be_visible()
        check('Genuine authentication protects the catalogue; Support exposes the Policy Authority template action and schema-7 Boolean diagnostics before the honest empty state.')

        source_context = f'/api/changes/{meta["sourceId"]}/assurance-context?revision={meta["sourceRevisionId"]}'
        destination_context = f'/api/changes/{meta["destinationId"]}/assurance-context?revision={meta["destinationRevisionId"]}'
        before_source = read(page, fixture, source_context)
        name = 'Approval controls <img src=x onerror=window.templateInjected=true>'
        saved = save_from_source(page, fixture, meta, name)
        template_id, version_id = saved['family']['id'], saved['version']['id']
        endpoint = f'/api/verification-templates/{template_id}?version={version_id}'
        recorded = read(page, fixture, endpoint)
        assert recorded['version']['snapshot']['source']['planId'] == meta['sourcePlanId']
        assert recorded['version']['snapshot']['source']['scopeDigest'] == before_source['scopeDigest']
        assert len(recorded['version']['snapshot']['entries']) == 2
        assert read(page, fixture, source_context)['plan'] == before_source['plan']
        assert read(page, fixture, destination_context)['plan'] is None
        check('Saving a template through the native form preserves the real source plan and makes no destination plan or approval.')

        expect(page.get_by_role('heading', name=name, exact=True)).to_be_visible()
        original_requirement = page.locator('.template-source').first
        original_requirement.get_by_text('Acceptance in the source revision', exact=True).click()
        expect(original_requirement.get_by_text('Recorded reviewer: policy@example.test', exact=True)).to_be_visible()
        expect(original_requirement.get_by_text('Different recorded reviewer identity. Organizational independence is not established by this record.', exact=True)).to_be_visible()
        assert page.locator('img[src=x]').count() == 0
        assert not page.evaluate('Boolean(window.templateInjected)')
        with page.expect_download() as pending:
            page.get_by_role('button', name='Download template version', exact=True).click()
        downloaded = json.loads(Path(pending.value.path()).read_text())
        assert downloaded == recorded
        serialized = json.dumps(downloaded)
        for forbidden in [fixture.password, 'csrfToken', 'TEMPLATE_FIXTURE_REQUESTER_TOKEN', 'TEMPLATE_FIXTURE_APPROVER_TOKEN', 'http://127.0.0.1:1', 'fixture-requester']:
            assert forbidden not in serialized
        check('Hostile-looking template text remains inert and the native download preserves the exact viewed version without runtime or session secrets.')

        open_assurance(page, fixture, meta['destinationId'])
        page.get_by_role('link', name='Use a template', exact=True).click()
        expect(page.get_by_role('heading', name='Choose a verification template', exact=True)).to_be_visible()
        page.locator(f'[data-template-id="{template_id}"]').get_by_role('link', name='Review new mappings', exact=True).click()
        expect(page.locator('#template-plan-form')).to_be_visible()
        assert read(page, fixture, destination_context)['plan'] is None
        for check_id in ['separation', 'finality']:
            assert page.locator(f'#map_{check_id}').input_value() == ''
            assert page.locator(f'#reason_{check_id}').input_value() == ''
            assert meta['extraObligationId'] not in page.locator(f'#map_{check_id} option').evaluate_all('(items)=>items.map(item=>item.value)')
        assert page.locator('#templateTarget').input_value() == ''
        assert page.locator('#planRationale').input_value() == ''
        check('Choosing a template leaves all destination mappings, target and rationales blank; unaccepted scope cannot be selected as an accepted mapping.')

        page.locator('#map_separation').select_option(meta['destinationObligations'][0]['id'])
        page.locator('#map_finality').select_option(meta['destinationObligations'][0]['id'])
        assert not page.locator('#map_finality').evaluate('(element)=>element.checkValidity()')
        fill_mapping(page, meta)
        assert page.locator('#template-plan-form').evaluate('(element)=>element.checkValidity()')
        page.screenshot(path=str(OUTPUT / 'increment9-templates-desktop.png'), full_page=True)
        check('The native form requires distinct accepted obligations and fresh target, reasoning and acknowledgement before approval.')

        approval_path = f'/api/changes/{meta["destinationId"]}/assurance-plan'
        with page.expect_request(lambda request: request.method == 'POST' and request.url.endswith(approval_path)) as pending:
            page.get_by_role('button', name='Approve new plan', exact=True).click()
        approval_input = pending.value.post_data_json
        expect(page.locator('#template-plan-form .form-error')).to_contain_text('may have been saved')
        expect(page.locator('#template-plan-form .form-error')).to_contain_text('Check saved verification plan')
        page.get_by_role('link', name='Check saved verification plan', exact=True).click()
        expect(page.locator('.template-use-receipt')).to_be_visible()
        destination_plan = read(page, fixture, destination_context)['plan']
        assert destination_plan['version'] == 1 and destination_plan['current'] is True
        assert destination_plan['templateUse']['versionId'] == version_id
        assert destination_plan['templateUse']['templateDigest'] == recorded['version']['digest']
        check('A genuinely lost successful approval reply reports uncertainty; inspecting the saved plan reveals its durable exact-template receipt.')

        replay = write(page, fixture, approval_path, approval_input)
        assert replay.status in [200, 201], replay.text()
        assert replay.json()['id'] == destination_plan['id']
        assert read(page, fixture, destination_context)['plan']['version'] == 1
        assert {item['id'] for item in destination_plan['snapshot']['scope']['obligations']} == {item['id'] for item in meta['destinationObligations']} | {meta['extraObligationId']}
        assert len(destination_plan['snapshot']['mappings']) == 2
        assert read(page, fixture, f'/api/changes/{meta["destinationId"]}/assessments?revision={meta["destinationRevisionId"]}') == []
        assert read(page, fixture, f'/api/changes/{meta["sourceId"]}/assessments?revision={meta["sourceRevisionId"]}') == []
        check('Identical receipt replay creates one plan; all mandatory scope remains and neither source nor destination gains fabricated execution evidence.')

        page.goto(fixture.origin + f'/#/verification-templates/{template_id}', wait_until='networkidle')
        page.get_by_label('Change containing the current approved plan', exact=True).select_option(meta['sourceId'])
        page.get_by_role('button', name='Prepare new template version', exact=True).click()
        expect(page.get_by_role('heading', name='Save a new template version', exact=True)).to_be_visible()
        page.get_by_label('Why is this new version needed?', exact=False).fill('Clarify the intended use while preserving the exact reviewed verification check contracts.')
        page.locator('#template-save-form input[name=acknowledgeLimits]').check()
        with page.expect_response(lambda response: response.request.method == 'POST' and response.url.endswith(f'/{template_id}/versions')) as pending:
            page.get_by_role('button', name='Save new template version', exact=True).click()
        response = pending.value
        assert response.status == 201, response.text()
        second = response.json()
        expect(page.locator('#template-detail')).to_be_visible()
        assert second['version']['number'] == 2
        first_again = read(page, fixture, endpoint)
        assert first_again['version'] == recorded['version']
        assert read(page, fixture, destination_context)['plan']['id'] == destination_plan['id']
        check('A new version retains the original frozen version and does not rewrite a plan already approved from version 1.')

        open_mapping(page, fixture, meta, saved)
        expect(page.get_by_text('This template version was superseded. Inspect the latest active version.', exact=True)).to_be_visible()
        assert page.locator('#template-plan-form').count() == 0
        page.goto(fixture.origin + f'/#/verification-templates/{template_id}/versions/{version_id}', wait_until='networkidle')
        expect(page.get_by_text('HISTORICAL VERSION', exact=True)).to_be_visible()
        assert page.get_by_role('button', name='Archive template', exact=True).count() == 0
        check('Superseded versions remain inspectable but cannot silently become a newly approved plan or a current maintenance action.')

        page.goto(fixture.origin + f'/#/verification-templates/{template_id}', wait_until='networkidle')
        page.get_by_role('button', name='Archive template', exact=True).click()
        page.get_by_label('Reason for archiving', exact=False).fill('Retire this reusable reference while keeping its existing plans and evidence histories intact.')
        with page.expect_response(lambda response: response.request.method == 'POST' and response.url.endswith(f'/{template_id}/archive')) as pending:
            page.get_by_role('button', name='Confirm archive', exact=True).click()
        assert pending.value.status == 200
        expect(page.get_by_text('Archived template', exact=True)).to_be_visible()
        assert read(page, fixture, destination_context)['plan']['current'] is True
        open_mapping(page, fixture, meta, second)
        expect(page.get_by_text('The template is archived and cannot be reused.', exact=True)).to_be_visible()
        assert page.locator('#template-plan-form').count() == 0
        check('Archiving blocks new reuse while preserving a previously approved plan and the complete template history.')

        racing = save_from_source(page, fixture, meta, 'Review concurrency carefully')
        open_mapping(page, fixture, meta, racing)
        fill_mapping(page, meta)
        extra = write(page, fixture, f'/api/changes/{meta["destinationId"]}/obligations', {
            'revisionId': meta['destinationRevisionId'], 'statement': 'A newly declared retention rule must remain visible.',
            'sourceReference': 'Concurrent policy amendment', 'sourceVersion': '3', 'criticality': 'HIGH',
        })
        # A Policy Authority cannot author requirements; use a separate genuine
        # Author session in another browser context for the concurrent mutation.
        assert extra.status == 403
        author_context = browser.new_context()
        author_page = author_context.new_page()
        author_page.goto(fixture.origin, wait_until='networkidle')
        sign_in(author_page, fixture, 'author@example.test')
        extra = write(author_page, fixture, f'/api/changes/{meta["destinationId"]}/obligations', {
            'revisionId': meta['destinationRevisionId'], 'statement': 'A newly declared retention rule must remain visible.',
            'sourceReference': 'Concurrent policy amendment', 'sourceVersion': '3', 'criticality': 'HIGH',
        })
        assert extra.status == 201, extra.text()
        with page.expect_response(lambda response: response.request.method == 'POST' and response.url.endswith(approval_path)) as pending:
            page.get_by_role('button', name='Approve new plan', exact=True).click()
        assert pending.value.status == 409
        expect(page.locator('#template-plan-form .form-error')).to_contain_text('Reload')
        assert read(page, fixture, destination_context)['plan']['version'] == 1
        check('A genuine concurrent Author scope change rejects the stale template approval without creating another plan; authority roles remain separate.')

        revision = write(author_page, fixture, f'/api/changes/{meta["destinationId"]}/revisions', {
            'expectedRevisionId': meta['destinationRevisionId'], 'sourceRevision': 'c' * 40,
            'intent': 'Review a new implementation separately.', 'reason': 'A separate revision requires fresh review and no inherited approval.',
            'copyObligations': True,
        })
        assert revision.status == 201, revision.text()
        author_context.close()
        open_mapping(page, fixture, meta, racing)
        expect(page.get_by_text('This revision is historical. Open the current revision.', exact=True)).to_be_visible()
        assert page.locator('#template-plan-form').count() == 0
        check('A formerly current destination becomes read-only after a real new revision; the old mapping screen cannot approve it.')

        sign_out(page)
        sign_in(page, fixture, 'viewer@example.test')
        page.goto(fixture.origin + f'/#/verification-templates/{racing["family"]["id"]}', wait_until='networkidle')
        expect(page.locator('#template-detail')).to_be_visible()
        assert page.locator('#template-version-source').count() == 0
        assert page.get_by_role('button', name='Archive template', exact=True).count() == 0
        denied = write(page, fixture, f'/api/verification-templates/{racing["family"]["id"]}/archive', {
            'requestKey': '11111111-1111-4111-8111-111111111111', 'expectedVersion': 1,
            'expectedStateVersion': racing['family']['stateVersion'], 'rationale': 'A Viewer must not be able to archive this record.',
        })
        assert denied.status == 403
        check('A Viewer inspects saved versions without maintenance controls and the actual server rejects a forged archive decision.')

        page.goto(fixture.origin + f'/#/verification-templates/{template_id}', wait_until='networkidle')
        expect(page.get_by_role('heading', name=name, exact=True)).to_be_visible()
        page.set_viewport_size({'width': 390, 'height': 844})
        expect(page.get_by_role('button', name='Download template version', exact=True)).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        page.screenshot(path=str(OUTPUT / 'increment9-templates-mobile.png'), full_page=True)
        page.set_viewport_size({'width': 1440, 'height': 1000})
        check('The native template detail retains readable source, version history and reachable download controls without horizontal overflow at 390px.')

        race_endpoint = f'/api/verification-templates/{racing["family"]["id"]}'
        race_url = fixture.origin + f'/#/verification-templates/{racing["family"]["id"]}'
        page.goto(fixture.origin + '/#/guide', wait_until='networkidle')
        with page.expect_response(lambda response: response.url.endswith(race_endpoint)) as pending:
            page.goto(race_url, wait_until='domcontentloaded')
        delayed = pending.value
        page.evaluate("location.hash = '#/guide'")
        delayed.body()
        expect(page.get_by_role('heading', name='Your guide to Qivvera', exact=True)).to_be_visible()
        assert page.locator('#template-detail').count() == 0
        check('A delayed genuine template read cannot overwrite a later navigation destination.')

        with page.expect_response(lambda response: response.url.endswith(race_endpoint)) as pending:
            page.goto(race_url, wait_until='domcontentloaded')
        delayed = pending.value
        sign_out(page)
        page.evaluate("location.hash = '#/guide'")
        sign_in(page, fixture, 'author@example.test')
        delayed.body()
        expect(page.get_by_role('heading', name='Your guide to Qivvera', exact=True)).to_be_visible()
        expect(page.locator('.identity .email > span')).to_have_text('author@example.test')
        assert page.locator('#template-detail').count() == 0
        check('A template response begun under the old session cannot restore protected content after sign-out and a new identity.')

        session = read(page, fixture, '/api/session')
        revoked = page.request.delete(fixture.origin + '/api/session', headers={
            'Origin': fixture.origin, 'X-CSRF-Token': session['csrfToken'],
        })
        assert revoked.status == 200
        page.goto(race_url, wait_until='networkidle')
        expect(page.get_by_role('heading', name='Welcome to Qivvera', exact=True)).to_be_visible()
        assert page.locator('#template-detail').count() == 0
        check('Actual session revocation clears the authenticated template view and requires a new sign-in.')
        assert not errors, errors
        check('The complete native template journey has no uncaught application-page JavaScript errors.')
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
    (OUTPUT / 'templates-browser-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
if not report['passed']:
    raise SystemExit(1)

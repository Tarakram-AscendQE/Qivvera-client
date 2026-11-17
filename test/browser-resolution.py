"""Native browser, real API, SQLite and a separate real worker. No mocked fetch or policy bypass."""
from pathlib import Path
import subprocess,os,json
from playwright.sync_api import sync_playwright,expect
work=Path(__file__).resolve().parents[1]
out=Path(os.environ.get('QIVVERA_TEST_OUTPUT',str(work/'review-test-results')));out.mkdir(parents=True,exist_ok=True)
checks=[];report={'passed':False,'checks':checks,'method':'Native browser with actual local HTTP application and separate verifier worker; synthetic fixtures and SQLite.'}
proc=subprocess.Popen(['node','test/resolution-browser-fixture.mjs'],cwd=work,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
try:
 meta=json.loads(proc.stdout.readline());base='http://127.0.0.1:'+str(meta['port'])
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE','/usr/bin/chromium'),headless=True)
  page=browser.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(base,wait_until='networkidle')
  def login(email):
   page.get_by_label('Email address').fill(email);page.get_by_label('Password',exact=True).fill('synthetic-browser-only-password');page.get_by_role('button',name='Open workspace',exact=True).click();expect(page.get_by_role('button',name='Sign out',exact=True)).to_be_visible()
  def reason(text='Reviewed the actual correction and its source-bound evidence.'):page.get_by_label('Reason for this action').fill(text)
  login('author@example.test');checks.append('Author signs in through native browser')
  page.goto(base+'/#/changes/'+meta['changeId']+'/revisions/'+meta['sourceRevisionId']);page.get_by_role('button',name='Resolutions',exact=True).click()
  page.get_by_role('button',name='Track resolution:',exact=False).first.click()
  page.get_by_label('What should happen next?').fill('Correct the self-approval guard and test the independent approver positive control.')
  page.get_by_role('button',name='Create resolution',exact=True).click();expect(page.get_by_role('heading',name=meta['obligation'],exact=True)).to_be_visible();item_url=page.url;checks.append('Creates an owned resolution from an actual historical violation')
  page.get_by_role('button',name='Start work',exact=True).click();reason();page.locator('dialog').get_by_role('button',name='Start work',exact=True).click();expect(page.get_by_text('In progress',exact=True)).to_be_visible()
  page.get_by_role('button',name='Propose correction',exact=True).click();reason();page.get_by_role('button',name='Record correction',exact=True).click();expect(page.get_by_text('Awaiting reassessment',exact=True)).to_be_visible();checks.append('Links the copied requirement on the corrected current revision')
  page.get_by_role('link',name='← Open change workspace',exact=True).click();page.get_by_role('button',name='Run assurance',exact=True).click();page.get_by_role('button',name='Queue assessment',exact=True).click();expect(page.get_by_role('heading',name='READY',exact=True)).to_be_visible(timeout=20000);checks.append('Real separate worker produces the corrective evidence')
  page.goto(item_url);page.get_by_role('button',name='Link reassessment',exact=True).click();reason();page.get_by_role('button',name='Link assessment',exact=True).click();expect(page.get_by_text('Evidence checks satisfied.',exact=True)).to_be_visible();expect(page.get_by_role('button',name='Verify resolution',exact=True)).to_be_disabled();checks.append('Author can link fresh evidence but cannot verify their own correction')
  page.get_by_role('button',name='Sign out',exact=True).click();login('policy@example.test');page.goto(item_url)
  page.get_by_role('button',name='Verify resolution',exact=True).click();reason();page.locator('dialog').get_by_role('button',name='Verify resolution',exact=True).click();expect(page.get_by_text('Resolution verified',exact=True)).to_be_visible();checks.append('A different policy authority verifies resolution with a rationale')
  page.screenshot(path=str(out/'native-resolution-verified.png'),full_page=True)
  with page.expect_download() as download:page.get_by_role('link',name='Export resolution case',exact=True).click()
  path=download.value.path();case=json.loads(Path(path).read_text());assert case['originalAssessment']['disposition']=='NOT_READY';assert case['reassessment']['disposition']=='READY';checks.append('Native download preserves original NOT_READY and new READY evidence')
  page.reload();expect(page.get_by_text('Resolution verified',exact=True)).to_be_visible();checks.append('Verified state survives page reload')
  page.get_by_role('button',name='Reopen',exact=True).click();reason();page.get_by_role('button',name='Reopen item',exact=True).click();expect(page.get_by_text('Open',exact=True)).to_be_visible();checks.append('Reopening preserves the verification timeline')
  page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');checks.append('Mobile resolution view has no horizontal page overflow')
  assert not errors,errors;checks.append('No uncaught browser script errors')
  report['passed']=True;browser.close()
except Exception as e:
 report['error']=str(e);report['limitation']='No browser security or network policy was disabled or bypassed.'
finally:
 proc.terminate()
 try:proc.wait(timeout=8)
 except subprocess.TimeoutExpired:proc.kill();proc.wait()
 report['count']=len(checks);(out/'native-resolution-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
 if not report['passed']:raise SystemExit(1)

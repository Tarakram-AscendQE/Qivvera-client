"""Native browser/API test. Does not disable browser policy, proxy, or mock requests."""
from pathlib import Path
import subprocess,os,json,time,urllib.request
from playwright.sync_api import sync_playwright,expect
work=Path(__file__).resolve().parents[1]
out=Path(os.environ.get('QIVVERA_TEST_OUTPUT',str(work/'review-test-results')));out.mkdir(parents=True,exist_ok=True)
checks=[];report={'checks':checks,'native':True,'passed':False}
proc=subprocess.Popen(['node','test/assurance-browser-fixture.mjs'],cwd=work,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
try:
 metadata=json.loads(proc.stdout.readline());base='http://127.0.0.1:'+str(metadata['port'])
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE','/usr/bin/chromium'),headless=True)
  page=browser.new_page(viewport={'width':1440,'height':1000})
  page.goto(base,wait_until='networkidle')
  page.get_by_label('Email address').fill('policy@example.test');page.get_by_label('Password',exact=True).fill('synthetic-browser-only-password');page.get_by_role('button',name='Open workspace').click()
  page.goto(base+'/#/changes/'+metadata['changeId']);expect(page.get_by_role('heading',name='Approval change',exact=True)).to_be_visible();checks.append('Native authenticated navigation')
  page.get_by_role('button',name='Assurance',exact=True).click()
  page.get_by_role('button',name='Configure mapping',exact=True).click()
  page.get_by_label('Why does this check support the obligation?').fill('Approved mapping for the explicit synthetic maker-checker rule.')
  page.locator('input[name="acknowledgeLimits"]').check();page.get_by_role('button',name='Approve plan',exact=True).click();checks.append('Authority-approved mapping through browser')
  page.get_by_role('button',name='Run assurance',exact=True).click();page.get_by_role('button',name='Queue assessment',exact=True).click()
  expect(page.get_by_role('heading',name='NOT READY',exact=True)).to_be_visible(timeout=15000);checks.append('Actual worker evidence changes current disposition')
  page.get_by_role('button',name='Open assurance case →',exact=True).click()
  expect(page.get_by_role('heading',name='Expected versus observed',exact=True)).to_be_visible();checks.append('Evidence explorer reachable')
  page.screenshot(path=str(out/'native-assurance.png'),full_page=True);browser.close();report['passed']=True
except Exception as e:
 report['error']=str(e);report['limitation']='No browser protection was disabled and no network bypass was attempted.'
finally:
 proc.terminate()
 try:proc.wait(timeout=8)
 except subprocess.TimeoutExpired:proc.kill();proc.wait()
 (out/'native-browser-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
 if not report['passed']:raise SystemExit(1)

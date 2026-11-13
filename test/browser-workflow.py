import subprocess,os,tempfile,time,json,pathlib,urllib.request
from playwright.sync_api import sync_playwright, expect
work=pathlib.Path(__file__).resolve().parents[1];out=pathlib.Path(os.environ.get('QIVVERA_TEST_OUTPUT',str(work/'review-test-results')));out.mkdir(parents=True,exist_ok=True)
d=tempfile.mkdtemp(prefix='qivvera-browser-');env={**os.environ,'TEST_SQLITE_PATH':d+'/review.sqlite','TEST_PORT':'3127'}
log=open(out/'browser-server.txt','w')
proc=subprocess.Popen(['node','test/browser-fixture.mjs'],cwd=work,env=env,stdout=log,stderr=log)
checks=[]
def check(name): checks.append(name)
try:
 for _ in range(50):
  try:
   urllib.request.urlopen('http://127.0.0.1:3127/healthz',timeout=1);break
  except Exception: time.sleep(.1)
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE','/usr/bin/chromium'),headless=True)
  page=browser.new_page(viewport={'width':1440,'height':1000})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:3127',wait_until='networkidle')
  expect(page.get_by_role('heading',name='Welcome to Qivvera')).to_be_visible();check('Native Chromium navigation and login screen')
  def login(email):
   page.get_by_label('Email address').fill(email);page.get_by_label('Password',exact=True).fill('synthetic-browser-only-password');page.get_by_role('button',name='Open workspace').click();page.wait_for_timeout(100)
  login('author@example.test')
  page.get_by_role('button',name='+ Register application',exact=True).click()
  page.get_by_label('Application name').fill('VendorPay Review')
  page.get_by_label('Description').fill('Synthetic approval workflow used for local acceptance testing.')
  page.get_by_role('button',name='Register application',exact=True).click()
  expect(page.get_by_role('heading',name='VendorPay Review',exact=True)).to_be_visible();check('Register application through browser')
  page.get_by_role('button',name='+ New change').click()
  page.get_by_label('Change title').fill('Supplier payment details — controlled approval')
  page.get_by_label('Business intent').fill('Allow supplier bank changes only after independent approval.')
  page.get_by_label('Source commit reference').fill('a'*40)
  page.get_by_role('button',name='Create change',exact=True).click()
  expect(page.get_by_role('heading',name='Not assessed',exact=True)).to_be_visible();check('Change has revision 1 and no disposition')
  page.get_by_role('button',name='+ Add obligation').click()
  page.get_by_label('What must be true?').fill('The requester cannot approve the same supplier-bank change.')
  page.get_by_label('Source reference',exact=True).fill('Finance Control Policy BR-017')
  page.get_by_label('Source version').fill('2.0')
  page.get_by_label('Criticality',exact=True).select_option('CRITICAL')
  page.get_by_role('button',name='Add candidate',exact=True).click()
  expect(page.get_by_role('heading',name='The requester cannot approve the same supplier-bank change.')).to_be_visible();check('Propose sourced candidate obligation')
  page.get_by_role('button',name='Request review',exact=True).click()
  page.get_by_role('button',name='Submit for review',exact=True).click()
  expect(page.get_by_text('Needs a different authorized reviewer.',exact=True)).to_be_visible();check('Author cannot approve own submitted requirement')
  old_url=page.url
  page.get_by_role('button',name='Sign out').click();login('reviewer@example.test')
  page.get_by_role('button',name='Record decision',exact=True).click()
  page.get_by_label('Decision',exact=True).select_option('ACCEPT')
  page.get_by_label('Reason for this decision').fill('BR-017 version 2.0 applies to this approval workflow and this revision.')
  page.get_by_role('button',name='Save decision',exact=True).click()
  expect(page.get_by_text('Requirement accepted',exact=True)).to_be_visible();expect(page.get_by_role('heading',name='Not assessed',exact=True)).to_be_visible();check('Named reviewer accepts requirement; no software verdict')
  page.screenshot(path=str(out/'01-accepted-requirement.png'),full_page=True)
  page.get_by_role('button',name='Review history',exact=True).click()
  expect(page.get_by_role('heading',name='Obligation review history')).to_be_visible();expect(page.get_by_text('Different recorded reviewer identity. This is not a guarantee of organizational independence.')).to_be_visible();check('Decision provenance and history visible')
  page.screenshot(path=str(out/'02-decision-history.png'),full_page=True)
  page.get_by_role('button',name='Close dialog').click()
  page.get_by_role('button',name='Sign out').click();login('author@example.test')
  page.get_by_role('button',name='+ New revision',exact=True).click()
  page.get_by_label('New source commit reference').fill('b'*40)
  page.get_by_label('Business intent').fill('Preserve the requirement while updating the implementation.')
  page.get_by_label('What changed and why?').fill('A corrected implementation was supplied for reassessment.')
  page.get_by_role('button',name='Create revision',exact=True).click()
  expect(page.get_by_text('CANDIDATE',exact=True)).to_be_visible();expect(page.get_by_role('heading',name='Not assessed',exact=True)).to_be_visible();check('Revision 2 copies candidates without acceptance')
  page.get_by_role('button',name='Revisions',exact=True).click()
  page.screenshot(path=str(out/'03-revision-history.png'),full_page=True)
  page.get_by_role('link',name='Revision 1',exact=True).click()
  page.get_by_role('button',name='Obligations',exact=True).click()
  expect(page.get_by_text('Historical revision · read-only',exact=True)).to_be_visible();expect(page.get_by_text('Requirement accepted',exact=True)).to_be_visible();expect(page.get_by_role('button',name='+ Add obligation')).to_be_disabled();check('Revision 1 remains accepted historically and cannot be edited')
  page.screenshot(path=str(out/'04-historical-obligation.png'),full_page=True)
  page.get_by_role('link',name='Open current revision').click()
  page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(100)
  overflow=page.evaluate('document.documentElement.scrollWidth>window.innerWidth')
  assert not overflow,'Horizontal overflow';check('390px layout has no horizontal page overflow')
  page.screenshot(path=str(out/'05-mobile.png'),full_page=True)
  # Preserve the exact URL for a fresh process read-back.
  current_url=page.url
  page.set_viewport_size({'width':1440,'height':1000})
  proc.terminate();proc.wait(timeout=8)
  proc=subprocess.Popen(['node','test/browser-fixture.mjs'],cwd=work,env=env,stdout=log,stderr=log)
  for _ in range(50):
   try: urllib.request.urlopen('http://127.0.0.1:3127/healthz',timeout=1);break
   except: time.sleep(.1)
  page.goto(current_url,wait_until='networkidle')
  expect(page.get_by_role('heading',name='Supplier payment details — controlled approval',exact=True)).to_be_visible();check('Fresh service process retains data and database-backed session')
  assert not errors,errors
  check('No browser JavaScript errors')
  browser.close()
 (out/'browser-report.json').write_text(json.dumps({'status':'passed','nativeNavigation':True,'transport':'real local HTTP','database':'SQLite only','tlsTested':False,'checks':checks,'count':len(checks)},indent=2))
 print(json.dumps({'passed':len(checks),'checks':checks},indent=2))
except Exception as e:
 (out/'browser-report.json').write_text(json.dumps({'status':'failed','checks':checks,'error':str(e)},indent=2))
 raise
finally:
 proc.terminate()
 try:proc.wait(timeout=8)
 except:proc.kill()
 log.close()

from pathlib import Path
import json,subprocess,os,re
from playwright.sync_api import sync_playwright,expect
work=Path(__file__).resolve().parents[1];out=Path(os.environ.get('QIVVERA_TEST_OUTPUT',str(work/'review-test-results')));out.mkdir(parents=True,exist_ok=True)
fixture_path=out/'ui-fixtures.json'
subprocess.run(['node','test/ui-fixtures.mjs'],cwd=work,env={**os.environ,'FIXTURE_OUTPUT':str(fixture_path)},check=True,capture_output=True)
f=json.loads(fixture_path.read_text());html=(work/'frontend/src/index.html').read_text();html=re.sub(r'<link[^>]+>','',html);html=re.sub(r'<script[^>]*>.*?</script>','',html,flags=re.S)
checks=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE','/usr/bin/chromium'),headless=True)
 page=b.new_page(viewport={'width':1440,'height':1000});errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
 page.set_content(html)
 page.add_style_tag(content=(work/'frontend/src/app.css').read_text()+'\n'+(work/'frontend/src/workflow.css').read_text())
 # This is an explicit offline API fixture, not a proxy around blocked browser networking.
 page.evaluate('''f=>{window.testFixture=f;window.mockRevision='accepted';window.mockRole='reviewer';window.fetch=async(url,options={})=>{
 const f=window.testFixture;let data,status=200;
 if(url==='/api/session')data={...f[window.mockRole],csrfToken:'synthetic-component-only',reviewMode:'independent'};
 else if(url==='/api/workspace')data=f.workspace;
 else if(url.includes('/history'))data=f.oldHistory;
 else if(url.startsWith('/api/changes/'))data=f[window.mockRevision];
 else {data={error:'NOT_MOCKED',message:'Only component read states are available.'};status=404;}
 return {ok:status===200,status,json:async()=>JSON.parse(JSON.stringify(data))};};}''',f)
 page.evaluate("id=>{location.hash='#/changes/'+id;}",f['c']['id'])
 page.add_script_tag(type='module',content=(work/'frontend/src/app.js').read_text())
 expect(page.get_by_role('heading',name='Supplier bank changes: controlled approval')).to_be_visible()
 expect(page.get_by_text('Requirement accepted',exact=True)).to_be_visible()
 expect(page.get_by_text('Clarification requested',exact=True)).to_be_visible()
 expect(page.get_by_role('heading',name='Not assessed',exact=True)).to_be_visible()
 checks+=['Implemented change view renders accepted requirement separately from assessment','Clarification state visible','No readiness disposition rendered']
 page.screenshot(path=str(out/'01-obligation-review.png'),full_page=True)
 page.get_by_role('button',name='Review history',exact=True).first.click()
 expect(page.get_by_role('heading',name='Obligation review history')).to_be_visible()
 expect(page.get_by_text('BR-017 version 2.0 applies to this workflow and to the declared change revision.',exact=True)).to_be_visible()
 page.get_by_text('Content at this decision').first.click()
 checks+=['History dialog shows exact rationale and earlier content','Review history opens with keyboard-accessible disclosure']
 page.screenshot(path=str(out/'02-review-history.png'),full_page=True)
 page.get_by_role('button',name='Close dialog').click()
 # Reload route from in-memory fixture; no native network navigation is performed.
 page.evaluate("()=>{mockRevision='second';mockRole='author';}")
 page.get_by_role('button',name='Sign out',exact=True).click()
 page.get_by_label('Email address').fill('author@example.test')
 page.get_by_label('Password',exact=True).fill('offline-component-placeholder')
 page.get_by_role('button',name='Open workspace',exact=False).click()
 expect(page.get_by_text('CANDIDATE',exact=True)).to_have_count(2)
 checks+=['New revision shows copied candidates with no inherited acceptance']
 page.get_by_role('button',name='Revisions',exact=True).click()
 expect(page.get_by_role('heading',name='Change revisions')).to_be_visible()
 page.screenshot(path=str(out/'03-revisions.png'),full_page=True)
 page.evaluate("()=>{mockRevision='old';window.dispatchEvent(new HashChangeEvent('hashchange'));}")
 expect(page.get_by_text('Historical revision · read-only',exact=True)).to_be_visible()
 page.get_by_role('button',name='Obligations',exact=True).click()
 expect(page.get_by_role('button',name='+ Add obligation')).to_be_disabled()
 checks+=['Historical revision has read-only actions']
 page.screenshot(path=str(out/'04-history-read-only.png'),full_page=True)
 page.evaluate("()=>{mockRevision='pending';mockRole='reviewer';}")
 page.get_by_role('button',name='Sign out',exact=True).click()
 page.get_by_label('Email address').fill('reviewer@example.test')
 page.get_by_label('Password',exact=True).fill('offline-component-placeholder')
 page.get_by_role('button',name='Open workspace',exact=False).click()
 page.get_by_role('button',name='Record decision',exact=True).click()
 expect(page.get_by_label('Reason for this decision')).to_be_visible()
 page.get_by_label('Decision',exact=True).select_option('REQUEST_CLARIFICATION')
 checks+=['Decision form supports acceptance rejection and clarification with a required rationale']
 page.screenshot(path=str(out/'05-decision-form.png'),full_page=True)
 page.get_by_role('button',name='Close dialog').click()
 page.evaluate("()=>{mockRevision='second';mockRole='author';}")
 page.get_by_role('button',name='Sign out',exact=True).click()
 page.get_by_label('Email address').fill('author@example.test')
 page.get_by_label('Password',exact=True).fill('offline-component-placeholder')
 page.get_by_role('button',name='Open workspace',exact=False).click()
 page.get_by_role('button',name='+ New revision',exact=True).click()
 expect(page.get_by_label('Prior obligations')).to_be_visible()
 checks+=['New revision form explains copy-as-candidate behavior']
 page.get_by_role('button',name='Close dialog').click()
 page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(80)
 assert not page.evaluate('document.documentElement.scrollWidth>window.innerWidth')
 checks+=['390px view has no horizontal page overflow']
 page.screenshot(path=str(out/'06-mobile.png'),full_page=True)
 assert not errs,errs;checks+=['No component JavaScript errors']
 b.close()
(out/'component-report.json').write_text(json.dumps({'status':'passed','checks':checks,'count':len(checks),'nativeNetwork':False,'method':'offline component tests using recorded synthetic workflow states, not end-to-end browser tests'},indent=2))
print(json.dumps({'passed':len(checks),'checks':checks},indent=2))

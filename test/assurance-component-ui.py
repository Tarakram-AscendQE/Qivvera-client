"""Offline UI checks with captured genuine local execution records, not browser E2E."""
from pathlib import Path
import json,re,os
from playwright.sync_api import sync_playwright,expect
work=Path(__file__).resolve().parents[1];out=Path(os.environ.get('QIVVERA_TEST_OUTPUT',str(work/'review-test-results')));out.mkdir(parents=True,exist_ok=True)
f=json.loads((out/'ui-self-approval-defect.json').read_text());good=json.loads((out/'ui-correct.json').read_text());gap=json.loads((out/'ui-reject-all.json').read_text())
html=(work/'frontend/static/index.html').read_text();html=re.sub(r'<link[^>]+>','',html);html=re.sub(r'<script[^>]*>.*?</script>','',html,flags=re.S)
checks=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE','/usr/bin/chromium'),headless=True)
 page=browser.new_page(viewport={'width':1440,'height':1050});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html)
 page.add_style_tag(content='\n'.join((work/'frontend'/'static'/n).read_text() for n in ['app.css','workflow.css','assurance.css']))
 page.evaluate('''fixtures=>{window.data=fixtures;window.caseMode='bad';window.fetch=async(path,options={})=>{
 const f=data[caseMode];let value,status=200;
 if(path==='/api/session')value=f.session;
 else if(path==='/api/workspace')value=f.workspace;
 else if(path.includes('assurance-context'))value=f.context;
 else if(path.includes('/assessments?'))value=f.runs;
 else if(path.startsWith('/api/assessments/'))value=f.runs[0];
 else if(path.startsWith('/api/changes/'))value=f.change;
 else {status=404;value={message:'Offline component route is not defined.'};}
 return {ok:status===200,status,json:async()=>JSON.parse(JSON.stringify(value))};};}''',{'bad':f,'good':good,'gap':gap})
 page.evaluate("id=>location.hash='#/changes/'+id",f['change']['id'])
 page.add_script_tag(type='module',content=(work/'frontend/public/app.js').read_text())
 expect(page.get_by_role('heading',name='NOT READY',exact=True)).to_be_visible();checks.append('Current violated execution displays NOT READY')
 expect(page.get_by_text('Requirement accepted',exact=True)).to_be_visible();expect(page.get_by_text('VIOLATED',exact=True)).to_be_visible();checks.append('Accepted requirement and violated software remain distinct')
 page.screenshot(path=str(out/'01-assessment-not-ready.png'),full_page=True)
 page.get_by_role('button',name='Plan & check',exact=True).click();expect(page.get_by_role('heading',name='Approved verification plan',exact=True)).to_be_visible();checks.append('Plan and execution history visible')
 page.screenshot(path=str(out/'02-assurance-plan.png'),full_page=True)
 page.get_by_role('button',name='Open assurance case →',exact=True).click()
 expect(page.get_by_role('heading',name='Expected versus observed',exact=True)).to_be_visible()
 page.get_by_text('attempt self-approval',exact=True).click();page.get_by_text('read state after self-approval',exact=True).click();checks.append('Actual expected 403 and observed approved state available')
 page.screenshot(path=str(out/'03-evidence-case.png'),full_page=True)
 expect(page.get_by_text('Assurance boundary',exact=True)).to_be_visible();expect(page.locator('a[href$="/export"]')).to_be_visible();checks+=['Boundary and binding limitations present','JSON assurance-case export available']
 page.get_by_role('button',name='Close dialog',exact=True).click()
 page.evaluate("()=>{caseMode='good';location.hash='#/changes/'+data.good.change.id;}")
 expect(page.get_by_role('heading',name='READY',exact=True)).to_be_visible();checks.append('Correct target yields READY with scope qualification')
 page.screenshot(path=str(out/'04-assessment-ready.png'),full_page=True)
 page.evaluate("()=>{caseMode='gap';location.hash='#/changes/'+data.gap.change.id;}")
 expect(page.get_by_role('heading',name='INDETERMINATE',exact=True)).to_be_visible();checks.append('Failed positive control cannot yield READY')
 page.screenshot(path=str(out/'05-assessment-insufficient.png'),full_page=True)
 # Synthetic stale read state based on an earlier real record, explicitly only a UI test.
 page.evaluate("()=>{data.gap.runs[0].applicability='STALE_INPUTS';window.dispatchEvent(new HashChangeEvent('hashchange'));}")
 expect(page.get_by_role('heading',name='Reassessment required',exact=True)).to_be_visible();checks.append('Stale evidence never appears as current readiness')
 page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(out/'06-assessment-mobile.png'),full_page=True)
 assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile page overflow';checks.append('390px page has no horizontal overflow')
 page.set_viewport_size({'width':1366,'height':900});assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth');checks.append('1366px page has no horizontal overflow')
 assert not errors,errors;checks.append('No browser-script errors during component checks')
 browser.close()
report={'passed':True,'checks':checks,'count':len(checks),'method':'Offline UI with stubbed fetch, using captured actual local HTTP execution evidence; NOT native E2E or deployed screenshots.'}
(out/'assurance-component-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))

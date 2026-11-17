"""Offline component tests with actual captured API records. NOT native browser/API E2E."""
from pathlib import Path
import os,json,re
from playwright.sync_api import sync_playwright,expect
work=Path(__file__).resolve().parents[1];out=Path(os.environ.get('QIVVERA_TEST_OUTPUT',str(work/'review-test-results')));out.mkdir(parents=True,exist_ok=True)
fixtures={name:json.loads((out/f'resolution-ui-{name}.json').read_text()) for name in ['awaiting','review','verified','stale']}
html=(work/'web/index.html').read_text();html=re.sub(r'<link[^>]+>','',html);html=re.sub(r'<script[^>]*>.*?</script>','',html,flags=re.S)
checks=[];errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE','/usr/bin/chromium'),headless=True)
 page=browser.new_page(viewport={'width':1440,'height':1000});page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html);page.add_style_tag(content='\n'.join((work/'web'/x).read_text() for x in ['app.css','workflow.css','assurance.css','resolution.css']))
 page.evaluate('''data=>{window.fixtureData=data;window.mode='review';window.fetch=async(path,options={})=>{
 const f=fixtureData[mode];let value,status=200;
 if(path==='/api/session')value=f.session;
 else if(path==='/api/workspace')value=f.workspace;
 else if(path==='/api/resolution-assignees')value=f.assignees;
 else if(path.startsWith('/api/resolutions?')||path.includes('/resolutions?'))value=f.resolutions;
 else if(path.startsWith('/api/resolutions/'))value=f.item;
 else if(path.includes('assurance-context'))value=f.context;
 else if(path.includes('/assessments?'))value=f.runs;
 else if(path.startsWith('/api/assessments/'))value=path.includes(f.source.id)?f.source:f.runs[0];
 else if(path.startsWith('/api/changes/'))value=f.change;
 else {status=404;value={message:'Offline component fixture route not defined.'};}
 return {ok:status===200,status,json:async()=>JSON.parse(JSON.stringify(value))};};}''',fixtures)
 page.add_script_tag(type='module',content=(work/'web/resolution.js').read_text()+'\nwindow.ResolutionComponent={createResolutionUI};')
 page.wait_for_function('!!window.ResolutionComponent')
 # Only module transport is supplied locally for this offline rendering. API responses are declared fixtures.
 js=(work/'web/app.js').read_text().replace("await import('./resolution.js')","window.ResolutionComponent")
 page.evaluate("id=>location.hash='#/resolutions/'+id",fixtures['review']['item']['id']);page.add_script_tag(type='module',content=js)
 expect(page.get_by_role('heading',name='Resolution review checks',exact=True)).to_be_visible();checks.append('Dedicated resolution view loads actual captured comparison')
 expect(page.get_by_role('heading',name='Original finding',exact=True)).to_be_visible();expect(page.get_by_role('heading',name='Correction reassessment',exact=True)).to_be_visible();checks.append('Original and correction assessments remain distinct')
 expect(page.get_by_text('VIOLATED',exact=True)).to_be_visible();expect(page.get_by_text('SUPPORTED',exact=True)).to_be_visible();checks.append('Original violation is not repainted as supported')
 expect(page.get_by_role('button',name='Verify resolution',exact=True)).to_be_enabled();checks.append('Eligible independent authority can request verification')
 expect(page.get_by_text('Evidence checks satisfied.',exact=True)).to_be_visible();checks.append('Evidence eligibility is labelled separately from human resolution decision')
 page.screenshot(path=str(out/'01-resolution-review.png'),full_page=True)
 page.get_by_role('button',name='Verify resolution',exact=True).click();expect(page.get_by_label('Reason for this action')).to_be_visible();checks.append('Verification requests a rationale rather than a checkbox-only closure');page.get_by_role('button',name='Close dialog',exact=True).click()
 page.evaluate("()=>{mode='awaiting';window.dispatchEvent(new HashChangeEvent('hashchange'));}");expect(page.get_by_role('heading',name='No reassessment linked',exact=True)).to_be_visible();expect(page.get_by_role('button',name='Verify resolution',exact=True)).to_be_disabled();checks.append('Absent new evidence cannot appear as a completed resolution')
 page.evaluate("()=>{mode='verified';window.dispatchEvent(new HashChangeEvent('hashchange'));}");expect(page.get_by_text('Resolution verified',exact=True)).to_be_visible();expect(page.get_by_role('link',name='Export resolution case',exact=True)).to_be_visible();checks.append('Verified record exposes history and export')
 page.screenshot(path=str(out/'02-resolution-verified.png'),full_page=True)
 expect(page.get_by_role('heading',name='Challenges and responses',exact=True)).to_be_visible();checks.append('Challenge rationale and authority response stay visible')
 page.evaluate("()=>{mode='stale';window.dispatchEvent(new HashChangeEvent('hashchange'));}");expect(page.get_by_text('Reassessment required',exact=True)).to_be_visible();expect(page.get_by_text('Previous resolution retained in history. It no longer establishes current resolution.',exact=True)).to_be_visible();checks.append('Changed inputs invalidate current resolution without deleting historical confirmation')
 page.screenshot(path=str(out/'03-resolution-stale.png'),full_page=True)
 page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(out/'04-resolution-mobile.png'),full_page=True);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),page.evaluate('[document.documentElement.scrollWidth,innerWidth]');checks.append('390px layout has no horizontal page overflow')
 page.set_viewport_size({'width':1366,'height':900});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');checks.append('1366px layout has no horizontal page overflow')
 page.evaluate("()=>location.hash='#/resolutions'");expect(page.get_by_role('heading',name='Findings to resolve',exact=True)).to_be_visible();checks.append('Workspace resolution inbox is reachable')
 # XSS fixture: rendering must treat this string as data, not executable HTML.
 page.evaluate("()=>{fixtureData.stale.item.actionPlan='<img src=x onerror=window.injected=true>';location.hash='#/resolutions/'+fixtureData.stale.item.id;}");expect(page.get_by_text('<img src=x onerror=window.injected=true>',exact=True)).to_be_visible();assert not page.evaluate('!!window.injected');checks.append('User action notes render as escaped text')
 assert not errors,errors;checks.append('No uncaught browser-script errors')
 browser.close()
report={'passed':True,'count':len(checks),'checks':checks,'method':'Offline component rendering with captured actual API records, stubbed fetch and a locally loaded ES module; NOT native E2E or deployed screenshots.'}
(out/'resolution-component-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))

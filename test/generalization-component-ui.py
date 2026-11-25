"""Offline component checks using captured local API records. NOT native API/browser E2E."""
from pathlib import Path
import json,re,os
from playwright.sync_api import sync_playwright,expect
work=Path(__file__).resolve().parents[1];out=work/'review-test-results';fixture=json.loads((out/'generalization-ui.json').read_text())
html=(work/'frontend/static/index.html').read_text().replace('<head>','<head><base href="http://component.local/">',1);html=re.sub(r'<link[^>]+>','',html);html=re.sub(r'<script[^>]*>.*?</script>','',html,flags=re.S)
checks=[];errors=[];report={'passed':False,'checks':checks,'method':'Offline Chromium components with captured local API data and explicitly stubbed fetch. Not native E2E or live GitHub.'}
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE','/usr/bin/chromium'),headless=True)
  page=browser.new_page(viewport={'width':1440,'height':1000});page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html);page.add_style_tag(content='\n'.join((work/'frontend'/'static'/f).read_text() for f in ['app.css','workflow.css','assurance.css','resolution.css']))
  page.evaluate('''f=>{window.fixture=f;window.simulatedWrites=[];window.fetch=async(path,opts={})=>{let data,code=200;if(opts.method&&opts.method!=='GET')simulatedWrites.push(path);
   if(path==='/api/session')data=f.session;else if(path==='/api/workspace')data=f.workspace;else if(path==='/api/source-repositories')data=f.repositories;else if(path==='/api/source-previews')data=f.preview;
   else if(path.endsWith('/source-imports'))data=[];else if(path.includes('assurance-context'))data=f.context;else if(path.includes('/assessments?'))data=f.runs;else if(path.startsWith('/api/assessments/'))data=f.runs[0];else if(path.startsWith('/api/changes/'))data=f.change;else{code=404;data={message:'Unconfigured offline component route'};}
   return {ok:code===200,status:code,json:async()=>structuredClone(data)};};}''',fixture)
  page.evaluate("id=>location.hash='#/changes/'+id",fixture['change']['id'])
  js=(work/'frontend/public/app.js').read_text()
  page.add_script_tag(type='module',content=js)
  expect(page.get_by_role('heading',name=fixture['change']['title'],exact=True)).to_be_visible();checks.append('Actual captured change renders without fabricated outcome')
  page.get_by_role('button',name='Assurance',exact=True).click();expect(page.get_by_role('heading',name='Approved verification plan',exact=True)).to_be_visible();checks.append('Version 2 plan renders')
  expect(page.get_by_text('separation',exact=True)).to_be_visible();expect(page.get_by_text('finality',exact=True)).to_be_visible();checks.append('Both mappings appear as distinct requirements')
  page.get_by_role('button',name='Revise mapping',exact=True).click();expect(page.locator('#map_separation')).to_be_visible();expect(page.locator('#map_finality')).to_be_visible();checks.append('Plan editor supports two explicit accepted-obligation choices')
  expect(page.get_by_text('Not mapped — any related mandatory obligation remains a gap',exact=True).first).to_be_attached();checks.append('Unmapped obligations are described as gaps')
  page.get_by_role('button',name='Close dialog',exact=True).click();page.get_by_role('button',name='Evidence',exact=True).click();page.get_by_role('button',name='Inspect expected vs observed',exact=True).click()
  expect(page.locator('dialog').get_by_text('SUPPORTED',exact=True)).to_be_visible();expect(page.locator('dialog').get_by_text('VIOLATED',exact=True)).to_be_visible();checks.append('Pass and violation are not collapsed into one green finding')
  assert page.locator('dialog details.observation').count()==22;checks.append('22 real selected observations are inspectable for this two-check execution')
  expect(page.locator('dialog').get_by_text(re.compile('finality ·')) .first).to_be_visible();checks.append('Observation labels retain per-check attribution')
  page.screenshot(path=str(out/'increment5-multi-evidence.png'),full_page=True);page.get_by_role('button',name='Close dialog',exact=True).click()
  page.evaluate("()=>{fixture.session=fixture.authorSession;location.hash='#/intake';}")
  # Reload component state via the real API-session loader without a network navigation.
  page.evaluate("()=>location.hash='#/changes'")
  # S is lexical in app.js: refresh permissions through a new document rather than invent DOM permissions.
  page.set_content(html);page.add_style_tag(content='\n'.join((work/'frontend'/'static'/f).read_text() for f in ['app.css','workflow.css','assurance.css','resolution.css']))
  page.evaluate("()=>location.hash='#/intake'");page.add_script_tag(type='module',content=js)
  expect(page.get_by_role('heading',name='Import a GitHub change',exact=True)).to_be_visible();checks.append('Author can open intake')
  page.get_by_label('Open pull-request number').fill('12');page.get_by_role('button',name='Preview source metadata',exact=True).click();expect(page.get_by_role('heading',name='Review before importing',exact=True)).to_be_visible();checks.append('Preview shows reviewed metadata before any import')
  assert not page.evaluate("simulatedWrites.includes('/api/source-imports')");checks.append('Preview does not silently import')
  page.get_by_role('button',name='Import reviewed context',exact=True).click();expect(page.get_by_label('Destination')).to_be_visible();expect(page.get_by_label('Why does this source belong here?')).to_be_visible();checks.append('Import requires explicit destination and rationale')
  page.get_by_role('button',name='Close dialog',exact=True).click()
  page.evaluate("()=>{fixture.preview.source.title='<img src=x onerror=window.injected=true>';}");page.get_by_role('button',name='Preview source metadata',exact=True).click();expect(page.get_by_role('heading',name='<img src=x onerror=window.injected=true>',exact=True)).to_be_visible();assert not page.evaluate('!!window.injected');checks.append('Source title renders as escaped text, not executable HTML')
  page.screenshot(path=str(out/'increment5-source-intake.png'),full_page=True)
  page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');checks.append('390px intake view has no horizontal page overflow')
  assert not errors,errors;checks.append('No uncaught script errors');browser.close();report['passed']=True
except Exception as e:report['error']=str(e)
report['count']=len(checks);(out/'generalization-component-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
if not report['passed']:raise SystemExit(1)

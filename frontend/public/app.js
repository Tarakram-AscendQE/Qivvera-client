let intakeUI;
async function ensureIntakeUI(){if(!intakeUI){const m=await import('./intake.js');intakeUI=m.createIntakeUI({S,api,h,shell,can,openForm,field,toast});}return intakeUI;}
let workspaceUI;
async function ensureWorkspaceUI(){if(!workspaceUI){const m=await import('./workspace.js');workspaceUI=m.createWorkspaceUI({S,shell,can,api,refresh,toast,route,closeDialog,viewContext,nextDialog:()=>++dialogGeneration,dialogGeneration:()=>dialogGeneration});}return workspaceUI;}
let guideUI;
async function ensureGuideUI(){if(!guideUI){const m=await import('./guide.js');guideUI=m.createGuideUI({S,api,h,shell});}return guideUI;}
let draftingUI;
async function ensureDraftingUI(){if(!draftingUI){const m=await import('./drafting.js');draftingUI=m.createDraftingUI({S,api,h,badge,date,shell,can,route,refresh});}return draftingUI;}
let impactUI;
async function ensureImpactUI(){if(!impactUI){const m=await import('./impact.js');impactUI=m.createImpactUI({S,api,h,badge,date,shell,route});}return impactUI;}
let templatesUI;
async function ensureTemplatesUI(){if(!templatesUI){const m=await import('./templates.js');templatesUI=m.createTemplatesUI({S,api,h,badge,date,shell,can,route,refresh});}return templatesUI;}
const mappingsOf=s=>s.mappings??[s.mapping];
const root=document.querySelector('#root'),modal=document.querySelector('#modal'),toastEl=document.querySelector('#toast');
let resolutionUI;
async function ensureResolutionUI(){if(!resolutionUI){const module=await import('./resolution.js');resolutionUI=module.createResolutionUI({S,api,h,badge,date,can,field,openForm,modal,toast,shell,route});resolutionUI.setChangeRenderer(changePage);}return resolutionUI;}
const S={session:null,workspace:null,change:null,tab:'obligations',assuranceContext:null,runs:[],assuranceError:null};
let renderedGeneration=0;
const logoSvg="<svg class=\"wordmark\" viewBox=\"0 0 1400 240\" role=\"img\" aria-label=\"QIVVERA\" xmlns=\"http://www.w3.org/2000/svg\">\n  <title>QIVVERA</title>\n  <g transform=\"translate(0,0.0)\">\n    <!-- Q Mark with Blue Accent -->\n    <path d=\"M163.114,216.836 A106.000,106.000 0 1 1 216.836,163.114 L191.257,151.725 A78.000,78.000 0 1 0 151.725,191.257 Z\" fill=\"currentColor\"/>\n    <path d=\"M152.527,172.326 L200.610,220.409 L220.409,200.610 L172.326,152.527 Z\" fill=\"#2449D8\"/>\n    <!-- I -->\n    <path d=\"M307.8853691275168 14.0H270.32295302013426V226.0H307.8853691275168Z\" fill=\"currentColor\"/>\n    <!-- V1 -->\n    <path d=\"M426.3919463087248 226.0H473.2026845637584L547.4738255033557 14.0H507.20805369127515L470.2147651006711 125.40671140939598C464.66577181208055 143.33422818791945 458.12080536912754 164.96107382550335 450.1530201342282 191.8523489932886C442.04295302013423 164.96107382550335 435.35570469798654 143.33422818791945 429.66442953020135 125.40671140939598L391.3906040268456 14.0H350.6979865771812Z\" fill=\"currentColor\"/>\n    <!-- V2 -->\n    <path d=\"M650.1871140939597 226.0H696.9978523489933L771.2689932885907 14.0H731.0032214765101L694.0099328859061 125.40671140939598C688.4609395973155 143.33422818791945 681.9159731543624 164.96107382550335 673.9481879194631 191.8523489932886C665.8381208053692 164.96107382550335 659.1508724832215 143.33422818791945 653.4595973154362 125.40671140939598L615.1857718120806 14.0H574.4931543624161Z\" fill=\"currentColor\"/>\n    <!-- E -->\n    <path d=\"M814.08 14.0H949.08V48.0H851.64V105.0H930.08V137.0H851.64V192.0H949.08V226.0H814.08Z\" fill=\"currentColor\"/>\n    <!-- R and A (Shifted to accommodate E) -->\n    <g transform=\"translate(178, 0)\">\n      <path d=\"M814.081610738255 226.0H851.6440268456375V148.88322147651007H894.3285906040269C894.7554362416107 148.88322147651007 895.04 148.88322147651007 895.3245637583892 148.88322147651007L935.1634899328859 226.0H976.5675167785234L932.3178523489933 142.0536912751678C957.501744966443 131.80939597315438 972.5836241610738 110.60939597315436 972.5836241610738 81.72617449664429C972.5836241610738 40.179865771812075 943.4158389261745 14.0 896.7473825503356 14.0H814.081610738255ZM851.6440268456375 117.86577181208054V45.871140939597325H894.6131543624161C919.9393288590604 45.871140939597325 935.5903355704697 59.67248322147651 935.5903355704697 81.72617449664429C935.5903355704697 103.92214765100671 919.9393288590604 117.86577181208054 894.8977181208054 117.86577181208054Z\" fill=\"currentColor\"/>\n      <path d=\"M1009.2781208053691 226.0H1049.6861744966443L1067.0445637583891 175.3476510067114H1149.283489932886L1166.215033557047 226.0H1207.6190604026845L1132.2096644295302 14.0H1084.9720805369127ZM1077.5734228187919 144.47248322147652 1087.8177181208052 114.59328859060403C1094.2204026845636 95.1006711409396 1100.623087248322 74.7543624161074 1108.5908724832213 48.005369127516786C1116.5586577181207 74.7543624161074 1122.8190604026845 95.1006711409396 1129.0794630872483 114.59328859060403L1139.0391946308723 144.47248322147652Z\" fill=\"currentColor\"/>\n    </g>\n  </g>\n</svg>\n\n";
const can=role=>(S.session?.roles??[]).includes(role);
const findingReason=value=>({
 REQUESTER_APPROVED_OWN_REQUEST:'The requester approved their own request, contrary to the accepted separation requirement.',
 SELF_APPROVAL_REJECTED_AND_INDEPENDENT_APPROVAL_SUCCEEDED:'Self-approval was rejected and approval by a different eligible approver succeeded.',
 FINALIZED_APPROVAL_ACCEPTED_OR_MUTATED:'The finalized request accepted another approval or changed when the repeated approval was attempted.',
 LEGITIMATE_APPROVAL_SUCCEEDED_AND_REPEAT_REJECTED:'Legitimate approval succeeded; the repeated approval was rejected and the finalized record stayed unchanged.',
 UNRESOLVED_PRIOR_COUNTEREXAMPLE:'A valid earlier counterexample remains unresolved for the same inputs.',
 AUTHORITATIVE_REQUIREMENT_UNRESOLVED:'The applicable requirement has not been accepted by the authority workflow.',
 NO_SUPPORTED_VERIFIER_MAPPING:'No supported verification check is mapped to this required obligation.',
 REJECTED_BY_RECORDED_AUTHORITY:'The recorded authority decision rejected this candidate. It remains in history as an exclusion.',
 MAPPED_REPORT_MISSING:'The mapped check has no usable report. This requirement cannot be treated as supported.',
 POSITIVE_CONTROL_NOT_ESTABLISHED:'The check could not establish that a legitimate approval succeeds. Rejecting all requests is not proof of the control.',
 REQUIRED_OBSERVATION_MISSING:'A required observation is missing; the check cannot establish support.',
 TARGET_IDENTITY_NOT_ESTABLISHED:'The expected test target identity could not be established before execution.',
 TARGET_IDENTITY_CHANGED_OR_UNAVAILABLE:'The test target identity changed or could not be confirmed after execution.',
 QUEUE_DEADLINE_EXCEEDED:'The assessment was not claimed before its queue deadline. Ask the operator to check the worker before requesting another run.',
 WORKER_LEASE_EXPIRED:'The worker did not complete within its ownership period. Its output is not accepted; investigate before requesting another run.',
 INPUTS_CHANGED_BEFORE_EXECUTION:'The plan, scope or target changed before execution. Review the current inputs and approve a new plan if needed.',
 CANCELLED_BY_USER:'A user cancelled acceptance of this run. Target operations already sent may still have completed.',
 PRIOR_EVIDENCE_INTEGRITY_FAILED:'Earlier related evidence failed integrity checks. Investigate it before accepting a new conclusion.'
})[value]??String(value??'');

const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=(name)=>{const paths={overview:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',applications:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h4"/>',changes:'<path d="M6 3v12a5 5 0 0 0 5 5h7M6 7h12M15 4l3 3-3 3"/><circle cx="6" cy="3" r="1"/>',activity:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>'};return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]??paths.overview}</svg>`;};
const date=value=>new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
const badge=(text,kind='')=>`<span class="pill ${kind}">${h(text)}</span>`;
function toast(text){toastEl.textContent=text;clearTimeout(toast.timer);toast.timer=setTimeout(()=>toastEl.textContent='',5000);}
/** React screens (frontend/src) render inside the page; remove them before the page is replaced. */
function unmountScreens(){for(const ui of [guideUI,intakeUI,draftingUI,impactUI,templatesUI,resolutionUI,workspaceUI])ui?.unmount?.();}
function clearSessionView(){
 S.session=null;S.workspace=null;S.change=null;S.assuranceContext=null;S.runs=[];S.resolutions=null;S.sources=[];S.assuranceError=null;S.sourceError=null;
 draftingUI?.invalidate();impactUI?.invalidate();templatesUI?.invalidate();resolutionUI?.invalidate();intakeUI?.invalidate();unmountScreens();draftingUI=null;impactUI=null;templatesUI=null;resolutionUI=null;intakeUI=null;guideUI=null;workspaceUI=null;clearTimeout(pollTimer);clearTimeout(toast.timer);++routeGeneration;
 if(modal.open)modal.close();modal.replaceChildren();toastEl.textContent='';
}
async function api(path,{method='GET',data}={}){
 const requestSession=S.session;
 let r;
 const assertSession=()=>{if(requestSession!==S.session){const e=new Error('This response belongs to an earlier session.');e.staleSession=true;throw e;}};
 const recovery=method==='GET'?'Check your connection and try loading this view again.':'Your action may have been saved. Reload the view and check the records before submitting it again.';
 try{r=await fetch(path,{method,credentials:'same-origin',headers:{...(data?{'Content-Type':'application/json'}:{}),...(method!=='GET'&&requestSession?{'X-CSRF-Token':requestSession.csrfToken}:{})},...(data?{body:JSON.stringify(data)}:{})});}
 catch{assertSession();throw new Error('Qivvera could not be reached. '+recovery);}
 assertSession();
 if(r.status===401&&!(path==='/api/session'&&method==='POST')&&requestSession){
   clearSessionView();
   login('Your session ended. Sign in again to continue. Your saved records are retained.');
   const e=new Error('Your session ended. Please sign in again.');e.status=401;e.sessionExpired=true;throw e;
 }
 let b;try{b=await r.json();}catch{assertSession();const e=new Error('Qivvera returned an unreadable response. '+recovery);e.status=r.status;throw e;}
 assertSession();
 if(!r.ok){
  let message=typeof b?.message==='string'?b.message:'This request could not be completed.';
  if(r.status===403)message+=' Check your role and reload the view before trying again.';
  if(r.status>=500)message+=' If this continues, contact your workspace operator using Support.';
  const reference=typeof b?.requestId==='string'&&/^[0-9a-f-]{36}$/i.test(b.requestId)?b.requestId:null;
  const e=new Error(message+(reference?' Request reference: '+reference+'.':''));e.status=r.status;e.code=b?.error;e.requestId=reference;throw e;
 }return b;
}
async function refresh(){const session=S.session,workspace=await api('/api/workspace');if(session===S.session)S.workspace=workspace;}
function login(error=''){
 root.innerHTML=`<main class="login-layout" id="main"><section class="login-story"><div class="brand">${logoSvg}</div><div class="login-message"><div class="eyebrow">Independent Change Assurance</div><h1>Confidence needs<br>more than a<br>green pipeline.</h1><p>Start with the change. Establish what must be true. Keep the evidence — and the uncertainty — visible.</p></div><div class="chain">CHANGE &nbsp;→&nbsp; OBLIGATIONS &nbsp;→&nbsp; EVIDENCE &nbsp;→&nbsp; GAPS &nbsp;→&nbsp; DISPOSITION</div></section><section class="login-panel"><form id="login-form"><div class="eyebrow">Your review workspace</div><h2>Welcome to Qivvera</h2><p class="sub">Sign in to organize applications, changes, and assurance obligations.</p><div class="form-error" role="alert">${h(error)}</div><div class="form-field"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="username" required></div><div class="form-field"><label for="password">Password</label><div class="input-with-eye"><input id="password" name="password" type="password" autocomplete="current-password" maxlength="256" required><button type="button" class="eye-btn" id="toggle-password" aria-label="Show password">Show</button></div></div><button class="button primary" type="submit">Open workspace &nbsp;→</button><div class="login-note">Increment 10 · Assurance workflow improvements<br>Review requirements, run supported checks, and inspect scope-bound conclusions. Use non-sensitive review data. For access or password help, contact the workspace operator who provided your account.</div></form></section></main>`;
 document.querySelector('#toggle-password').addEventListener('click',e=>{const p=document.querySelector('#password');p.type=p.type==='password'?'text':'password';e.currentTarget.textContent=p.type==='password'?'Show':'Hide';e.currentTarget.setAttribute('aria-label',p.type==='password'?'Show password':'Hide password');});
 document.querySelector('#login-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('[type=submit]');b.disabled=true;b.textContent='Signing in…';try{S.session=await api('/api/session',{method:'POST',data:Object.fromEntries(new FormData(f))});await refresh();await route();}catch(err){if(!err.staleSession&&!err.sessionExpired)f.querySelector('.form-error').textContent=err.message;}finally{b.disabled=false;b.textContent='Open workspace →';}});
}
function shell(content,active='overview',label='Workspace'){
 unmountScreens();
 renderedGeneration=routeGeneration;
 const email=S.session.email;
 root.innerHTML=`<div class="layout"><aside class="sidebar"><div class="brand">${logoSvg}</div><div class="label">Assurance workspace</div><nav class="nav" aria-label="Main navigation">${[['overview','Workspace'],['applications','Applications'],['changes','Changes'],...(S.workspace?.capabilities.resolutionWorkflow?[["resolutions","Resolutions"]]:[]),...(S.workspace?.capabilities.githubIntake?[["intake","GitHub intake"]]:[]),...(S.workspace?.capabilities.verificationTemplates?[["verification-templates","Verification templates"]]:[]),['activity','Activity'],['guide','Guide'],['support','Support']].map(([id,t])=>`<a href="#/${id}" class="${active===id?'active':''}" ${active===id?'aria-current="page"':''}>${icon(id)}${t}</a>`).join('')}</nav><div class="sidebar-foot"><span class="workspace-tag">REVIEW WORKSPACE</span><p>Independent assurance.<br>Explicit uncertainty.</p><p>Release ${h(S.workspace?.release??'0.11.0')} · ${h(S.workspace?.storage==='postgres'?'PostgreSQL':'Local review')}</p></div></aside><div class="right"><header class="topbar"><div class="breadcrumb">Qivvera &nbsp; / &nbsp; <strong>${h(label)}</strong></div><div class="identity"><div class="avatar">${h(email.slice(0,2).toUpperCase())}</div><div class="email"><span>${h(email)}</span><small>${h((S.session.roles??[]).map(x=>x==='POLICY_AUTHORITY'?'Policy authority':x==='AUTHOR'?'Author':'Viewer').join(' · '))}</small></div><button class="link-button" data-action="logout">Sign out</button></div></header><main id="main" class="main">${content}<footer class="footer"><span>Qivvera · Independent Change Assurance</span><span>Acceptance is not verification. Assessments are bound to their declared scope.</span></footer></main></div></div>`;
}
async function workspaceScreen(show){const generation=routeGeneration,ui=await ensureWorkspaceUI();if(generation===routeGeneration)show(ui);}
async function overview(){await workspaceScreen(ui=>ui.showOverview());}
async function applications(){await workspaceScreen(ui=>ui.showApplications());}
async function application(id){if(!S.workspace.applications.some(x=>x.id===id))return errorPage('Application not found.');await workspaceScreen(ui=>ui.showApplication(id));}
async function changes(){await workspaceScreen(ui=>ui.showChanges());}
async function changePage(){await workspaceScreen(ui=>ui.showChange(S.tab==='resolutions'?(resolutionUI?.renderChange()??'<div class="notice">Resolution is not enabled on this deployment.</div>'):''));}
async function activity(){await workspaceScreen(ui=>ui.showActivity());}
function errorPage(message){shell(`<section class="panel error-page"><h2>We could not open this view</h2><p role="alert">${h(message)}</p><div class="actions"><button class="button" data-action="retry">Try again</button><a class="button" href="#/overview">Open workspace</a><a class="button" href="#/support">Get support details</a></div><p class="small">If a save was interrupted, check the record before submitting the same action again.</p></section>`);}
let routeGeneration=0,pollTimer,dialogGeneration=0;
function viewContext(){const generation=routeGeneration,session=S.session,hash=location.hash;return()=>!!session&&generation===routeGeneration&&session===S.session&&hash===location.hash;}
function closeDialog(){++dialogGeneration;workspaceUI?.unmountDialog?.();if(modal.open)modal.close();modal.replaceChildren();}
function pollAssessment(){pollTimer=setTimeout(()=>{if(modal.open||document.hidden)pollAssessment();else void route();},2500);}
async function route(){
 const generation=++routeGeneration;draftingUI?.invalidate();impactUI?.invalidate();templatesUI?.invalidate();resolutionUI?.invalidate();intakeUI?.invalidate();closeDialog();clearTimeout(pollTimer);if(!S.session)return login();
 try{
  const p=location.hash.replace(/^#\/?/,'').split('/');
  if(p[0]==='guide'){const ui=await ensureGuideUI();if(generation===routeGeneration)ui.showGuide();return;}
  if(p[0]==='support'){const ui=await ensureGuideUI();if(generation===routeGeneration)await ui.showSupport();return;}
  if(['verification-templates','template-save','template-plan'].includes(p[0])){
   if(!S.workspace.capabilities.verificationTemplates)return errorPage('Verification templates are not enabled in this workspace. Existing verification plans remain available.');
   const ui=await ensureTemplatesUI();if(generation!==routeGeneration)return;
   const validId=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value);
   const offset=value=>/^\d+$/.test(value??'')&&Number.isSafeInteger(Number(value))?Number(value):null;
   if(p[0]==='verification-templates'){
    if(p.length===1)return await ui.showList();
    if(p[1]==='page'&&[3,4].includes(p.length)&&offset(p[2])!==null&&(p.length===3||p[3]==='all'))return await ui.showList({offset:offset(p[2]),includeArchived:p[3]==='all'});
    if(validId(p[1])&&(p.length===2||p.length===4&&p[2]==='versions'&&validId(p[3])))return await ui.showDetail(p[1],p[3]??null);
   }else if(p[0]==='template-save'&&validId(p[1])&&validId(p[2])&&(p.length===3||p.length===4&&validId(p[3])))return await ui.showSave(p[1],p[2],p[3]??null);
   else if(p[0]==='template-plan'&&validId(p[1])&&validId(p[2])){
    if(p.length===3)return await ui.showList({changeId:p[1],revisionId:p[2]});
    if(p.length===5&&p[3]==='page'&&offset(p[4])!==null)return await ui.showList({changeId:p[1],revisionId:p[2],offset:offset(p[4])});
    if(p.length===5&&validId(p[3])&&validId(p[4]))return await ui.showPlan(p[1],p[2],p[3],p[4]);
   }
   return errorPage('This verification-template link is incomplete. Open a template from the saved list or a current verification plan.');
  }
  if(p[0]==='impact'){
   if(!S.workspace.capabilities.revisionImpact)return errorPage('Revision impact is not available in this workspace. Open the change to inspect its obligations and evidence.');
   if(p.length!==3||!p[1]||!p[2])return errorPage('This impact link is incomplete. Open Impact & next checks from the change.');
   const ui=await ensureImpactUI();if(generation!==routeGeneration)return;
   return await ui.show(p[1],p[2]);
  }
  if(p[0]==='drafting'){
   if(!S.workspace.capabilities.obligationDrafting)return errorPage('Source drafting is not enabled in this workspace. Manual obligation authoring remains available.');
   if(!p[1]||!p[2]||(p[3]&&!['runs','page'].includes(p[3]))||(p[3]&&!p[4])||p.length>5)return errorPage('This source-drafting link is incomplete. Open source drafts from the change.');
   const offset=p[3]==='page'?Number(p[4]):0;
   if(!Number.isSafeInteger(offset)||offset<0)return errorPage('The saved-draft page is invalid. Open source drafts from the change.');
   const ui=await ensureDraftingUI();if(generation!==routeGeneration)return;
   return await ui.show(p[1],p[2],{runId:p[3]==='runs'?p[4]:null,offset});
  }
  if(p[0]==='resolutions'&&S.workspace.capabilities.resolutionWorkflow){const ui=await ensureResolutionUI();if(generation!==routeGeneration)return;return p[1]?await ui.showItem(p[1]):await ui.showInbox();}
  if(p[0]==='intake'&&S.workspace.capabilities.githubIntake){const ui=await ensureIntakeUI();if(generation!==routeGeneration)return;return await ui.show();}
  if(p[0]==='applications')return await (p[1]?application(p[1]):applications());
  if(p[0]==='changes'){
   if(p[1]){
    const c=await api(`/api/changes/${encodeURIComponent(p[1])}${p[2]==='revisions'&&p[3]?'?revision='+encodeURIComponent(p[3]):''}`);
    if(generation!==routeGeneration)return;
    S.change=c;S.runs=[];S.assuranceContext=null;S.assuranceError=c.assuranceError?.message??null;S.resolutions=null;S.resolutionError=null;
    if(S.workspace.capabilities?.assessmentQueue){
     try{const [ctx,runs]=await Promise.all([api(`/api/changes/${c.id}/assurance-context?revision=${c.revision.id}`),api(`/api/changes/${c.id}/assessments?revision=${c.revision.id}`)]);
      if(generation!==routeGeneration)return;S.assuranceContext=ctx;S.runs=runs;S.assuranceError=null;
     }catch(e){if(e.status===401||e.staleSession)throw e;if(generation!==routeGeneration)return;S.assuranceError=e.message;}
    }
    if(S.workspace.capabilities.resolutionWorkflow){const ui=await ensureResolutionUI();await ui.loadChange();if(generation!==routeGeneration)return;}
    S.sources=[];S.sourceError=null;if(S.workspace.capabilities.githubIntake){try{const sources=await api(`/api/changes/${c.id}/source-imports`);if(generation!==routeGeneration)return;S.sources=sources;}catch(e){if(e.status===401||e.staleSession)throw e;if(generation!==routeGeneration)return;S.sourceError=e.message;}}
    await changePage();
    if(S.runs.some(r=>['QUEUED','RUNNING'].includes(r.status)))pollAssessment();
    return;
   }return await changes();
  }
  if(p[0]==='activity')return await activity();return await overview();
 }catch(e){if(e.staleSession||generation!==routeGeneration)return;if(e.status===401){clearSessionView();return login('Your session ended. Please sign in again.');}errorPage(e.message);}
}

function field(id,label,type='text',value='',hint='',required=false){return `<div class="form-field"><label for="${id}">${label}${required?' *':''}</label>${type==='textarea'?`<textarea id="${id}" name="${id}" ${required?'required':''}>${h(value)}</textarea>`:`<input id="${id}" name="${id}" type="${type}" value="${h(value)}" ${required?'required':''}>`}${hint?`<small>${hint}</small>`:''}</div>`;}
function openForm(title,description,content,saveLabel,submit){
 const active=viewContext();closeDialog();
 modal.innerHTML=`<div class="modal-head"><div><h2 id="modal-title">${title}</h2></div><button class="close" data-close aria-label="Close dialog">×</button></div><div class="modal-body"><p class="small muted">${description}</p><form><div class="form-error" role="alert"></div>${content}<div class="form-actions"><button class="button" type="button" data-close>Cancel</button><button class="button primary" type="submit">${saveLabel}</button></div></form></div>`;
 modal.showModal();modal.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',closeDialog));
 const form=modal.querySelector('form'),present=()=>active()&&modal.open&&modal.querySelector('form')===form;
 let saving=false;
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!present()||saving||!form.reportValidity())return;
  const data=Object.fromEntries(new FormData(form)),button=form.querySelector('[type=submit]');
  const controls=[...form.elements],disabled=controls.map(control=>control.disabled);
  let saved=false;
  saving=true;controls.forEach(control=>control.disabled=true);button.textContent='Saving…';form.querySelector('.form-error').textContent='';
  try{
   const next=await submit(data);saved=true;if(!present())return;
   closeDialog();await refresh();if(!active())return;
   toast('Saved to your workspace.');
   if(typeof next==='string'&&next!==location.hash)location.hash=next;else await route();
  }catch(error){
   if(!active()||error.sessionExpired||error.staleSession)return;
   if(saved){toast('Your action was saved, but the workspace could not be refreshed. Reload the view to inspect the saved record.');return;}
   if(!present())return;
   form.querySelector('.form-error').textContent=error.status===409?error.message+' Close this dialog and reload the view before trying again.':error.message;
  }finally{
   saving=false;controls.forEach((control,index)=>control.disabled=disabled[index]);button.textContent=saveLabel;
  }
 });
}
function resultKind(value){return ['NOT_READY','VIOLATED'].includes(value)?'finding-bad':['READY','SUPPORTED'].includes(value)?'finding-good':['INDETERMINATE','INSUFFICIENT'].includes(value)?'finding-gap':'';}
function configureMultiPlan(ctx,accepted){
 const changeId=ctx.scope.changeId,revisionId=ctx.scope.revisionId;
 const mappingFields=ctx.checks.map(check=>`<fieldset><legend>${h(check.title)}</legend><p class="small">${h(check.rule)}</p><div class="form-field"><label for="map_${h(check.id)}">Accepted obligation to verify</label><select id="map_${h(check.id)}" name="map_${h(check.id)}"><option value="">Not mapped — any related mandatory obligation remains a gap</option>${accepted.map(o=>`<option value="${h(o.id)}">${h(o.statement)}</option>`).join('')}</select></div>${field('reason_'+check.id,'Why does this check support the requirement?','textarea','','Required when mapped; at least 10 characters.')}</fieldset>`).join('');
 openForm('Approve verification plan','One or two supported checks. Each needs a distinct accepted obligation; unmapped obligations cannot become supported.',`<div class="form-field"><label for="targetId">Approved test target</label><select name="targetId" id="targetId">${ctx.targets.map(t=>`<option value="${h(t.id)}">${h(t.name)} · ${h(t.adapterId??'approval-v1')}</option>`).join('')}</select></div>${mappingFields}${field('rationale','Plan rationale','textarea','','Explain the selected scope and limitations.',true)}<label class="acknowledge"><input type="checkbox" name="acknowledgeLimits" required> I acknowledge the exact contracts, exclusions and target-binding limitations.</label>`,'Approve plan',d=>api(`/api/changes/${changeId}/assurance-plan`,{method:'POST',data:{revisionId,scopeDigest:ctx.scopeDigest,expectedPlanVersion:ctx.plan?.version??0,targetId:d.targetId,rationale:d.rationale,acknowledgeLimits:d.acknowledgeLimits==='on',mappings:ctx.checks.filter(c=>d['map_'+c.id]).map(c=>({checkId:c.id,obligationId:d['map_'+c.id],rationale:d['reason_'+c.id]}))}}));
}

function configurePlan(){const changeId=S.change.id,revisionId=S.change.revision.id,ctx=S.assuranceContext,accepted=S.change.obligations.filter(o=>o.reviewStatus==='ACCEPTED');if(!accepted.length)return toast('Accept an obligation before mapping a verifier.');if(ctx.checks?.length)return configureMultiPlan(ctx,accepted);
 openForm('Approve verification mapping','This is an authority decision about coverage. The check writes isolated synthetic requests to an operator-approved test application.',`<div class="form-field"><label for="obligationId">Accepted obligation</label><select id="obligationId" name="obligationId">${accepted.map(o=>`<option value="${h(o.id)}">${h(o.statement)}</option>`).join('')}</select></div><div class="form-field"><label for="targetId">Approved test target</label><select id="targetId" name="targetId">${ctx.targets.map(t=>`<option value="${h(t.id)}">${h(t.name)}</option>`).join('')}</select></div><div class="review-summary"><h3>What this verifier actually establishes</h3><p>${h(ctx.profile.rule)}</p><p class="small">Only the described interface and identities are exercised. Every other non-rejected obligation remains mandatory and will be reported as a gap if unsupported.</p></div>${field('rationale','Why does this check support the obligation?','textarea','','Explain the mapping and accepted limitations; at least 10 characters.',true)}<label class="acknowledge"><input type="checkbox" name="acknowledgeLimits" required> I accept this declared scope and its limitations. The target binding is not an independent build attestation.</label>`,'Approve plan',d=>api(`/api/changes/${changeId}/assurance-plan`,{method:'POST',data:{...d,acknowledgeLimits:d.acknowledgeLimits==='on',revisionId,scopeDigest:ctx.scopeDigest,expectedPlanVersion:ctx.plan?.version??0}}));
}
function requestAssessment(){const active=viewContext(),changeId=S.change.id,revisionId=S.change.revision.id,ctx=S.assuranceContext,key=crypto.randomUUID();if(!ctx?.plan?.current)return;openForm('Request assurance','A separate worker will execute the accepted plan. This does not run inside the browser or claim an immediate result.',`<div class="review-summary"><p>Target: ${h(ctx.plan.snapshot.target.name)}</p><p>Revision: <span class="mono">${h(S.change.sourceRevision)}</span></p><p>Only synthetic operations in the configured test environment are authorized.</p></div>`,'Queue assessment',async()=>{await api(`/api/changes/${changeId}/assessments`,{method:'POST',data:{revisionId,planId:ctx.plan.id,requestKey:key}});if(active())S.tab='assurance';});}
async function showAssessment(id){const active=viewContext(),dialog=++dialogGeneration,r=await api(`/api/assessments/${id}`);if(!active()||dialog!==dialogGeneration)return;const s=r.snapshot,rawReport=r.evidence?.report,report=rawReport?.reports?{observations:rawReport.reports.flatMap(x=>x.report.observations.map(o=>({...o,step:x.checkId+' · '+x.obligationId.slice(0,8)+' · '+o.step})))}:rawReport;
 modal.innerHTML=`<div class="modal-head"><div><span class="eyebrow">Scope-bound assurance case</span><h2 id="modal-title">${h(r.disposition?.replaceAll('_',' ')??r.status.replaceAll('_',' '))}</h2></div><button class="close" data-close aria-label="Close dialog">×</button></div><div class="modal-body assurance-case"><div class="chip-row">${badge(r.applicability)}${badge(r.evidenceIntegrity)}</div><p>${h(findingReason(r.case?.reason??r.failureCode??'The worker has not produced a complete accepted result.'))}</p><div class="notice"><span>Readiness applies only to the frozen declared scope. Not universal safety, compliance, or an attested software supply chain.</span></div><h3>Obligations and gaps</h3>${(r.case?.findings??[]).map(f=>`<article class="run-card">${badge(f.state,resultKind(f.state))}<h4>${h(f.statement)}</h4><p class="small">${h(findingReason(f.reason))}</p></article>`).join('')}${r.evidence?.counterevidence?.length?`<h3>Unresolved contrary evidence</h3><div class="notice warning">A later passing execution cannot erase an earlier valid counterexample for these inputs.</div>${r.evidence.counterevidence.map(e=>`<p class="small">Run ${h(e.runId)} · ${h(findingReason(e.reason))}<br><span class="mono">${h(e.evidenceDigest)}</span></p>`).join('')}`:''}${resolutionUI?`<div class="actions resolution-source">${resolutionUI.sourceButtons(r)}</div>`:''}<h3>Expected versus observed</h3>${(report?.observations??[]).map(o=>`<details class="observation"><summary>${h(o.step)}</summary><div class="observation-grid"><div><span class="field-label">Expected</span><pre>${h(JSON.stringify(o.expected,null,2))}</pre></div><div><span class="field-label">Observed</span><pre>${h(JSON.stringify(o.observed,null,2))}</pre></div></div></details>`).join('')||'<p>No observations available.</p>'}<h3>Assurance boundary</h3><dl class="boundary"><dt>Source revision</dt><dd>${h(s.target.sourceRevision)}</dd><dt>Artifact digest</dt><dd>${h(s.target.artifactDigest)}</dd><dt>Environment digest</dt><dd>${h(s.target.environmentDigest)}</dd><dt>Instance</dt><dd>${h(s.target.instanceId)}</dd><dt>Scope digest</dt><dd>${h(s.scopeDigest)}</dd><dt>Profile</dt><dd>${h(s.profile.id)} / ${h(s.profile.version)}</dd><dt>Verifier digest</dt><dd>${h(s.verifier?.digest??s.mappings.map(m=>m.checkId+": "+m.verifier.digest).join("; "))}</dd><dt>Worker</dt><dd>${h(r.workerId??'Not yet claimed')}</dd><dt>Evidence cutoff</dt><dd>${h(r.finishedAt??'Not completed')}</dd><dt>Excluded areas</dt><dd>${h(s.profile.exclusions.join('; '))}</dd><dt>Binding limitation</dt><dd>${h(s.profile.independence.binding)}</dd><dt>Integrity limitation</dt><dd>${h(s.profile.independence.evidence)}</dd></dl><a class="button" href="/api/assessments/${h(r.id)}/export">Export case JSON</a></div>`;
 modal.showModal();modal.querySelector('[data-close]').onclick=closeDialog;
}
root.addEventListener('click',async e=>{const b=e.target.closest('[data-action],[data-resolution]');if(!b||renderedGeneration!==routeGeneration&&b.dataset.action!=='logout')return;const active=viewContext();try{if(b.dataset.resolution){await resolutionUI?.handle(b);return;}switch(b.dataset.action){case 'configure-plan':configurePlan();break;case 'run-assurance':requestAssessment();break;case 'refresh-assurance':await route();break;case 'open-assessment':await showAssessment(b.dataset.id);break;case 'cancel-assessment':await api(`/api/assessments/${b.dataset.id}/cancel`,{method:'POST',data:{}});if(active())await route();break;case 'logout':clearTimeout(pollTimer);await api('/api/session',{method:'DELETE'});clearSessionView();login();break;case 'new-application':(await ensureWorkspaceUI()).openNewApplication();break;case 'new-change':(await ensureWorkspaceUI()).openNewChange(b.dataset.app);break;case 'new-revision':(await ensureWorkspaceUI()).openNewRevision();break;case 'review-submit':(await ensureWorkspaceUI()).openReview(b.dataset.id,'SUBMIT');break;case 'review-withdraw':(await ensureWorkspaceUI()).openReview(b.dataset.id,'WITHDRAW');break;case 'review-decision':(await ensureWorkspaceUI()).openReview(b.dataset.id,'DECISION');break;case 'obligation-history':await (await ensureWorkspaceUI()).showObligationHistory(b.dataset.id);break;case 'new-obligation':(await ensureWorkspaceUI()).openObligation();break;case 'edit-obligation':(await ensureWorkspaceUI()).openObligation(b.dataset.id);break;case 'tab':S.tab=b.dataset.tab;await changePage();break;case 'retry':if(S.session){await refresh();if(active())await route();}else await bootstrap();break;}}catch(err){if((active()||b.dataset.action==='logout')&&!err.sessionExpired&&!err.staleSession)toast(err.message);}});
modal.addEventListener('click',async e=>{const b=e.target.closest('[data-resolution]');if(!b)return;try{await resolutionUI?.handle(b);}catch(err){if(!err.sessionExpired&&!err.staleSession)toast(err.message);}});
modal.addEventListener('cancel',()=>{++dialogGeneration;});
window.addEventListener('hashchange',route);
async function bootstrap(){
 try{S.session=await api('/api/session');await refresh();await route();}
 catch(e){
  if(e.sessionExpired||e.staleSession)return;
  if(e.status===401){clearSessionView();login();return;}
  if(S.session){errorPage(e.message);return;}
  root.innerHTML=`<main id="main" class="main"><section class="panel error-page"><h1>Qivvera could not be opened</h1><p role="alert">${h(e.message)}</p><button class="button primary" data-action="retry">Try again</button><p class="small">Your workspace operator can investigate if the service remains unavailable. No sign-in attempt was submitted.</p></section></main>`;
 }
}
await bootstrap();

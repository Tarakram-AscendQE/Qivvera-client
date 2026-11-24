/** Increment 4 presentation. Server rechecks all permissions, versions and evidence. */
export function createResolutionUI({S,api,h,badge,date,can,field,openForm,modal,toast,shell,route}){
  let item=null,generation=0,actionGeneration=0,itemActive=()=>false;
  const invalidate=()=>{generation++;actionGeneration++;item=null;itemActive=()=>false;};
  const capture=()=>{const current=generation,session=S.session,hash=location.hash;return()=>!!session&&current===generation&&session===S.session&&hash===location.hash;};
  const state=()=>{generation++;return capture();};
  const writable=()=>can('AUTHOR')||can('POLICY_AUTHORITY');
  const label=s=>({OPEN:'Open',IN_PROGRESS:'In progress',AWAITING_REASSESSMENT:'Awaiting reassessment',RESOLVED:'Resolution verified',REASSESSMENT_REQUIRED:'Reassessment required'})[s]??s;
  const kind=s=>s==='RESOLVED'?'accepted':s==='REASSESSMENT_REQUIRED'?'clarify':'candidate';
  const explain=value=>({REQUESTER_APPROVED_OWN_REQUEST:'The requester approved their own request.',SELF_APPROVAL_REJECTED_AND_INDEPENDENT_APPROVAL_SUCCEEDED:'Self-approval was rejected and approval by a different eligible person succeeded.',UNRESOLVED_PRIOR_COUNTEREXAMPLE:'A valid earlier counterexample remains unresolved.',AUTHORITATIVE_REQUIREMENT_UNRESOLVED:'The applicable requirement has not been accepted.',NO_SUPPORTED_VERIFIER_MAPPING:'No supported verification is mapped to this requirement.'})[value]??String(value??'').replaceAll('_',' ');
  const runLabel=r=>r.disposition?.replaceAll('_',' ')??r.status.replaceAll('_',' ');
  const rows=data=>data.items.length?data.items.map(r=>`<article class="resolution-row"><div><span class="field-label">${h(r.kind.replaceAll('_',' '))} · ${h(r.id.slice(0,8).toUpperCase())}</span><h3><a href="#/resolutions/${h(r.id)}">${h(r.source.finding.statement)}</a></h3><p class="small muted">Owner: ${h(r.assignedTo)} · Source assessment ${h(r.sourceRunId.slice(0,8))}</p></div><div>${badge(label(r.effectiveStatus),kind(r.effectiveStatus))}<p class="small muted">${h(date(r.updatedAt))}</p></div></article>`).join(''):'<div class="empty"><h3>No resolution items yet</h3><p>Open an assessment with a violation, a gap, or an execution failure, then track its resolution. No findings are invented from a passing assessment.</p></div>';
  const pagination=(data,scope='all')=>`<div class="resolution-pagination"><span>${data.total?data.offset+1:0}–${data.offset+data.items.length} of ${data.total} items · across all change revisions</span><div class="actions"><button class="button" data-resolution="page" data-scope="${h(scope)}" data-offset="${Math.max(0,data.offset-data.limit)}" ${data.offset?'':'disabled'}>Previous</button><button class="button" data-resolution="page" data-scope="${h(scope)}" data-offset="${data.offset+data.limit}" ${data.hasMore?'':'disabled'}>Next</button></div></div>`;
  const getDirectory=()=>api('/api/resolution-assignees');
  const ownerField=(directory,selected)=>`<div class="form-field"><label for="assignedTo">Resolution owner *</label><select id="assignedTo" name="assignedTo" required>${directory.map(p=>`<option value="${h(p.email)}" ${p.email===selected?'selected':''}>${h(p.email)}</option>`).join('')}</select><small>Configured named authors and policy authorities only. This is not an invitation or a permission grant.</small></div>`;
  const reasonField=()=>field('rationale','Reason for this action','textarea','','At least 10 characters. Do not include secrets or tokens.',true);
  function form(saved,title,description,content,button,action,extra={}){
    openForm(title,description,content,button,async d=>{await api(`/api/resolutions/${saved.id}/actions`,{method:'POST',data:{...d,...extra,action,version:saved.version}});return `#/resolutions/${saved.id}`;});
  }
  async function newItem(runId,obligationId,active){
    const directory=await getDirectory();if(!active())return;
    if(modal.open)modal.close();
    openForm('Track finding resolution','The original assessment and evidence will be preserved. A task status cannot change the assurance result.',ownerField(directory,S.session.email)+field('actionPlan','What should happen next?','textarea','','Describe a correction, investigation or clarification; at least 10 characters.',true)+field('externalReference','External ticket reference','text','','Optional reference only. Qivvera does not connect to or update the ticket.'),'Create resolution',async d=>{const r=await api(`/api/assessments/${runId}/resolutions`,{method:'POST',data:{...d,obligationId}});return `#/resolutions/${r.id}`;});
  }
  function sourceButtons(r){
    if(!S.workspace?.capabilities.resolutionWorkflow||!writable())return '';
    const findings=r.status==='FAILED'?(r.snapshot.mappings??[r.snapshot.mapping]).map(m=>({obligationId:m.obligationId,statement:'Investigate execution failure'})):(r.case?.findings??[]).filter(f=>['VIOLATED','INSUFFICIENT'].includes(f.state));
    return findings.map(f=>`<button class="button" data-resolution="create" data-run="${h(r.id)}" data-obligation="${h(f.obligationId)}">Track resolution: ${h(f.statement.slice(0,65))}${f.statement.length>65?'…':''}</button>`).join('');
  }
  async function loadChange(offset=0){
    const active=state(),changeId=S.change.id;
    try{
      const data=await api(`/api/changes/${changeId}/resolutions?offset=${offset}`);
      if(!active()||S.change?.id!==changeId)return false;
      S.resolutions=data;S.resolutionError=null;return true;
    }catch(error){
      if(error.status===401||error.staleSession)throw error;
      if(!active()||S.change?.id!==changeId)return false;
      S.resolutionError=error.message;S.resolutions=null;return true;
    }
  }
  function renderChange(){
    if(S.resolutionError)return `<div class="notice warning">${h(S.resolutionError)}</div>`;
    const data=S.resolutions??{items:[],total:0,limit:50,offset:0,hasMore:false};
    const runs=S.runs.filter(r=>r.status==='FAILED'||r.case?.findings.some(f=>['VIOLATED','INSUFFICIENT'].includes(f.state)));
    return `<section class="panel"><div class="panel-head"><div><h2>Findings to resolve</h2><p>Owners, corrections and evidence-backed review. Not a release waiver.</p></div><button class="button" data-resolution="refresh">Refresh</button></div>${rows(data)}${pagination(data,'change')}</section>${writable()&&runs.length?`<section class="panel resolution-source"><div class="panel-head"><h2>Track a finding from this revision</h2></div><div class="panel-body">${runs.map(r=>`<div class="run-card"><p>${badge(runLabel(r))} · Assessment ${h(r.id.slice(0,8))}</p><div class="actions">${sourceButtons(r)}</div></div>`).join('')}</div></section>`:''}`;
  }
  async function showInbox(offset=0){
    const active=state(),data=await api(`/api/resolutions?offset=${offset}`);if(!active()||!location.hash.startsWith('#/resolutions')||location.hash.split('/')[2])return;
    shell(`<div class="heading"><div><div class="eyebrow">Resolution workspace</div><h1>Findings to resolve</h1><p class="sub">Keep the original finding visible. Link a correction. Confirm it with fresh evidence.</p></div><button class="button" data-resolution="refresh">Refresh</button></div><div class="notice">Resolution status and software readiness are separate. An item can be resolved while another obligation still prevents READY.</div><section class="panel">${rows(data)}${pagination(data)}</section>`,'resolutions','Resolutions');
  }
  async function showItem(id){
    const active=state(),r=await api(`/api/resolutions/${id}`);if(!active()||!location.hash.endsWith('/'+id))return;
    item=r;itemActive=active;
    const source=r.comparison.source,candidate=r.comparison.candidate,openChallenge=r.challenges.find(c=>c.state==='OPEN');
    const contributors=r.history.filter(e=>['CREATED','PROPOSE_CORRECTION'].includes(e.action)).map(e=>e.actor);
    const independent=r.assignedTo!==S.session.email&&!contributors.includes(S.session.email);
    const mayVerify=can('POLICY_AUTHORITY')&&(independent||r.reviewMode==='founder-review');
    const actions=writable()?`<div class="actions">${r.status==='OPEN'?'<button class="button" data-resolution="start">Start work</button>':''}${r.status!=='RESOLVED'?'<button class="button" data-resolution="update">Edit ownership / action</button><button class="button primary" data-resolution="propose">Propose correction</button>':'<button class="button" data-resolution="reopen">Reopen</button>'}${r.status==='AWAITING_REASSESSMENT'?`<button class="button" data-resolution="link">Link reassessment</button><button class="button primary" data-resolution="verify" ${r.comparison.eligible&&mayVerify?'':'disabled'}>Verify resolution</button>`:''}<button class="button" data-resolution="note">Add note</button><button class="button" data-resolution="challenge" ${openChallenge?'disabled':''}>Challenge finding</button></div>`:'';
    const resultCard=(title,x)=>`<section class="panel"><div class="panel-head"><h2>${title}</h2></div><div class="panel-body">${x?`${badge(x.finding?.state??x.status??'NOT ASSESSED',x.finding?.state==='SUPPORTED'?'accepted':x.finding?.state==='VIOLATED'?'rejected':'candidate')}<p>${h(explain(x.finding?.reason??'No completed finding'))}</p><span class="field-label">Source revision</span><p class="mono">${h(x.sourceRevision)}</p><span class="field-label">Overall assessment</span><p>${h((x.disposition??'No disposition').replaceAll('_',' '))}</p><button class="button" data-action="open-assessment" data-id="${h(x.runId)}">Inspect assessment</button>`:'<h3>No reassessment linked</h3><p>Propose a correction, run assurance through the change workspace, then link the new run.</p>'}</div></section>`;
    shell(`<a class="back" href="#/changes/${h(r.changeId)}">← Open change workspace</a><div class="heading"><div><div class="eyebrow">Resolution ${h(r.id.slice(0,8).toUpperCase())}</div><h1>${h(r.source.finding.statement)}</h1><div class="chip-row">${badge(label(r.effectiveStatus),kind(r.effectiveStatus))}${badge(r.kind.replaceAll('_',' '))}${badge('Version '+r.version)}</div></div><button class="button" data-resolution="refresh">Refresh</button></div>${r.status==='RESOLVED'&&r.effectiveStatus!=='RESOLVED'?'<div class="notice warning"><strong>Previous resolution retained in history. It no longer establishes current resolution.</strong></div>':''}${r.reviewMode==='founder-review'?'<div class="notice warning">Founder-review mode permits same-person decisions. It does not establish independent review.</div>':''}<div class="notice">${h(r.notice)}</div><section class="panel"><div class="panel-body"><div class="details"><div><span class="field-label">Accountable owner</span><p>${h(r.assignedTo)}</p><span class="field-label">Next action</span><p class="resolution-text">${h(r.actionPlan)}</p></div><div><span class="field-label">External reference — not connected</span><p>${h(r.externalReference||'Not supplied')}</p><span class="field-label">Correction proposal</span><p>${h(r.correctionNote||'Not yet proposed')}</p></div></div>${actions}${r.status==='AWAITING_REASSESSMENT'&&!mayVerify?'<p class="small muted resolution-help">A different authorized Policy Authority must verify this correction.</p>':''}</div></section><div class="resolution-comparison">${resultCard('Original finding',source)}${resultCard('Correction reassessment',candidate)}</div><section class="panel"><div class="panel-head"><h2>Resolution review checks</h2></div><div class="panel-body">${r.comparison.eligible?'<p><strong>Evidence checks satisfied.</strong> An authorized reviewer must still confirm the correction. This does not mark the entire change READY.</p>':`<ul class="resolution-blockers">${r.comparison.blockers.map(b=>`<li><strong>${h(b.code.replaceAll('_',' '))}</strong><p>${h(b.message)}</p></li>`).join('')}</ul>`}<details><summary>Compare requirement wording and authority</summary><div class="observation-grid"><pre>${h(JSON.stringify(r.comparison.expectations.original,null,2))}</pre><pre>${h(JSON.stringify(r.comparison.expectations.correction,null,2))}</pre></div></details></div></section><section class="panel resolution-source"><div class="panel-head"><h2>Challenges and responses</h2></div><div class="panel-body">${r.challenges.length?r.challenges.map(c=>`<article class="run-card">${badge(c.state)}<p>${h(c.rationale)}</p><p class="small">${h(c.raisedBy)} · ${h(date(c.createdAt))}</p>${c.state==='OPEN'&&can('POLICY_AUTHORITY')?`<button class="button" data-resolution="respond" data-challenge="${h(c.id)}">Respond to challenge</button>`:''}${c.response?`<p><strong>${h(c.response.replaceAll('_',' '))}</strong> · ${h(c.responseReason)}</p><p class="small">${h(c.respondedBy)} · ${c.independentActor?'Different identity recorded':'Same-person review; not independent'}</p>`:''}</article>`).join(''):'<p>No challenge recorded. A response cannot delete evidence or waive a violation.</p>'}</div></section><section class="panel resolution-source"><div class="panel-head"><h2>Resolution history</h2><a class="button" href="/api/resolutions/${h(r.id)}/export">Export resolution case</a></div><div class="panel-body">${[...r.history].reverse().map(e=>`<article class="activity"><strong>${h(e.action.replaceAll('_',' '))} · Version ${e.version}</strong><p>${h(e.rationale)}</p><p>${h(e.actor)} · ${h(date(e.createdAt))}</p><details><summary>Recorded snapshot</summary><pre>${h(JSON.stringify(e.snapshot,null,2))}</pre></details></article>`).join('')}</div></section>`,'resolutions','Resolution');
  }
  async function handle(b){
    const action=b.dataset.resolution;if(!action)return false;
    const request=++actionGeneration,view=capture(),active=()=>request===actionGeneration&&view();
    if(action==='create'){await newItem(b.dataset.run,b.dataset.obligation,active);return true;}
    if(action==='refresh'){await route();return true;}
    if(action==='page'){
      const offset=Number(b.dataset.offset);
      if(b.dataset.scope==='change'){if(await loadChange(offset))shellRefresh();}else await showInbox(offset);
      return true;
    }
    if(!item||!itemActive())return true;
    const saved=item;
    if(action==='start')form(saved,'Start resolution work','Starting work does not alter evidence or disposition.',reasonField(),'Start work','START');
    if(action==='update'){
      const directory=await getDirectory();if(!active())return true;
      form(saved,'Update resolution ownership','This changes accountability and next steps only.',ownerField(directory,saved.assignedTo)+field('actionPlan','Next action','textarea',saved.actionPlan,'At least 10 characters.',true)+field('externalReference','External ticket reference','text',saved.externalReference)+reasonField(),'Save ownership','UPDATE');
    }
    if(action==='propose'){
      const change=await api(`/api/changes/${saved.changeId}`);if(!active())return true;
      form(saved,'Propose a correction','This is a proposal, not proof of a fix. A behavioural violation needs a new revision and artifact. Register the revision in the change workspace first.',`<div class="review-summary"><p>Current revision ${change.revision.number}: <span class="mono">${h(change.sourceRevision)}</span></p><p>Only the original requirement or an explicitly copied descendant can close the item.</p></div><div class="form-field"><label for="obligationId">Related requirement on the correction revision *</label><select id="obligationId" name="obligationId" required>${change.obligations.filter(obligation=>obligation.reviewStatus!=='REJECTED').map(obligation=>`<option value="${h(obligation.id)}">${h(obligation.statement)} · ${h(obligation.reviewStatus)}</option>`).join('')}</select></div>`+reasonField(),'Record correction','PROPOSE_CORRECTION',{revisionId:change.revision.id});
    }
    if(action==='link'){
      const runs=await api(`/api/changes/${saved.changeId}/assessments?revision=${saved.correctionRevisionId}`);if(!active())return true;
      const fresh=runs.filter(run=>run.number>saved.correctionRunFloor&&(run.snapshot.mappings??[run.snapshot.mapping]).some(mapping=>mapping.obligationId===saved.correctionObligationId));
      if(!fresh.length){toast('No new reassessment exists. Open the correction revision, approve its plan, and run assurance first.');return true;}
      form(saved,'Link reassessment','Only a fresh, related assessment can be linked. Failed or incomplete runs do not verify a correction.',`<div class="form-field"><label for="runId">Reassessment *</label><select id="runId" name="runId">${fresh.map(run=>`<option value="${h(run.id)}">Run ${run.number} · ${h(runLabel(run))} · ${h(run.applicability)} · ${h(date(run.queuedAt))}</option>`).join('')}</select></div>`+reasonField(),'Link assessment','LINK_ASSESSMENT');
    }
    if(action==='verify')form(saved,'Verify resolution','Confirm the corrected requirement using the linked evidence. The original finding remains unchanged. Other obligations may still prevent READY.',reasonField(),'Verify resolution','VERIFY');
    if(action==='reopen')form(saved,'Reopen resolution','Previous verification remains in history. A new correction and reassessment will be required.',reasonField(),'Reopen item','REOPEN');
    if(action==='note')form(saved,'Add resolution note','Notes are working records, not verification evidence.',reasonField(),'Save note','NOTE');
    if(action==='challenge')form(saved,'Challenge the finding','Explain the concern. This records a challenge; it does not invalidate evidence or change readiness.',reasonField(),'Record challenge','CHALLENGE');
    if(action==='respond')form(saved,'Respond to challenge','Neither response deletes evidence, closes the item, or creates a release exception.',`<div class="form-field"><label for="response">Response *</label><select id="response" name="response"><option value="FINDING_UPHELD">Finding upheld</option><option value="REASSESSMENT_REQUIRED">Reassessment required</option></select></div>`+reasonField(),'Record response','RESPOND_CHALLENGE',{challengeId:b.dataset.challenge});
    return true;
  }
  // The parent supplies its renderer so tab changes and pagination preserve the selected change.
  let shellRefresh=()=>{};
  return {invalidate,loadChange,renderChange,showInbox,showItem,sourceButtons,handle,setChangeRenderer:fn=>{shellRefresh=fn;}};
}

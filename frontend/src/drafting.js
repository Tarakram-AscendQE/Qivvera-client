/** Drafting prepares human-reviewed candidates. Source and model text are always data. */
export function createDraftingUI({S,api,h,badge,date,shell,can,route,refresh}) {
  let generation=0;
  const invalidate=()=>{generation++;};
  const methodLabel=method=>method==='openai'?'AI suggestions · OpenAI':'Explicit clauses · rule-based';
  const statusLabel=status=>({GENERATING:'Generation in progress',COMPLETED:'Drafts prepared',FAILED:'Generation failed',EXPIRED:'Generation expired',PROPOSED:'Awaiting your decision',CANDIDATE_CREATED:'Draft candidate created',DISMISSED:'Suggestion dismissed'})[status]??status;
  const warnings={
    LIMIT_REACHED:'The suggestion limit was reached. Review the full source and add any remaining applicable obligations yourself.',
    LONG_CLAUSES_SKIPPED:'Some matching clauses exceeded the supported length and were omitted. Review the source and record those requirements manually.'
  };
  const failures={
    DRAFTING_PROVIDER_UNAVAILABLE:'The configured AI service could not be reached. Ask the workspace operator to check its availability.',
    DRAFTING_PROVIDER_ACCESS_FAILED:'The AI service rejected the configured access. Ask the workspace operator to check the protected configuration.',
    DRAFTING_PROVIDER_RATE_LIMITED:'The AI service limited this request. Review this saved attempt before explicitly trying again later.',
    DRAFTING_PROVIDER_TIMEOUT:'The AI service did not finish within the allowed time. No successful drafts are claimed.',
    DRAFTING_PROVIDER_INVALID_RESPONSE:'The AI service returned an unusable response. It was not accepted as a completed set of drafts.',
    DRAFTING_PROVIDER_REFUSED:'The AI service declined the request. No drafts were accepted.',
    DRAFTING_PROVIDER_INCOMPLETE:'The AI response was incomplete. No partial result was accepted.',
    DRAFTING_UNGROUNDED_OUTPUT:'The proposed quotations did not match the saved source. The result was rejected.',
    DRAFTING_INVALID_OUTPUT:'The proposed result did not meet the drafting contract. It was rejected.',
    DRAFTING_GENERATION_FAILED:'Generation could not be completed. Review the saved attempt and contact the workspace operator if needed.',
    DRAFTING_GENERATION_EXPIRED:'This generation did not complete in time. It has not been retried automatically.'
  };
  const base=(changeId,revisionId)=>`#/drafting/${encodeURIComponent(changeId)}/${encodeURIComponent(revisionId)}`;
  const changeLink=(changeId,revisionId)=>`#/changes/${encodeURIComponent(changeId)}/revisions/${encodeURIComponent(revisionId)}`;
  const runLink=(changeId,revisionId,id)=>`${base(changeId,revisionId)}/runs/${encodeURIComponent(id)}`;
  const size=text=>{const normalized=text.replace(/\r\n?/g,'\n');return {text:normalized,characters:normalized.length,bytes:new TextEncoder().encode(normalized).length,lines:normalized.split('\n').length};};
  const problem=error=>error.status===409?`${error.message} Reload the saved run and reconcile its current state before trying again.`:error.message;
  function bindChangeLinks({changeId,revisionId,active}){for(const link of document.querySelectorAll('a'))if(link.getAttribute('href')===changeLink(changeId,revisionId))link.addEventListener('click',()=>{if(active())S.tab='obligations';});}

  async function show(changeId,revisionId,{runId=null,offset=0}={}) {
    const current=++generation,session=S.session,hash=location.hash;
    const active=()=>current===generation&&session===S.session&&location.hash===hash;
    const [change,context,run]=await Promise.all([
      api(`/api/changes/${encodeURIComponent(changeId)}?revision=${encodeURIComponent(revisionId)}`),
      api(`/api/changes/${encodeURIComponent(changeId)}/drafting?revision=${encodeURIComponent(revisionId)}&offset=${offset}&limit=10`),
      runId?api(`/api/drafting-runs/${encodeURIComponent(runId)}`):Promise.resolve(null)
    ]);
    if(!active())return;
    if(context.changeId!==changeId||context.revisionId!==revisionId||change.id!==changeId||change.revision.id!==revisionId)throw new Error('The drafting view does not match the selected revision. Reload the change before continuing.');
    if(run&&(run.changeId!==changeId||run.revisionId!==revisionId))throw new Error('This saved drafting run belongs to another change or revision. Open it from its original change.');
    const title=`<a class="back" href="${h(changeLink(changeId,revisionId))}">← Back to change</a><div class="heading"><div><div class="eyebrow">Prepare obligations · Revision ${h(change.revision.number)}</div><h1>${run?'Review source drafts':'Draft from source'}</h1><p class="sub">${h(change.title)}</p><p class="small muted">Declared source commit: <span class="mono">${h(change.sourceRevision||'Not supplied')}</span></p></div><a class="button" href="${h(changeLink(changeId,revisionId))}">Open obligations</a></div>`;
    const boundary=`${!context.isCurrentRevision?'<div class="notice warning"><strong>Historical revision · read-only</strong><span>Saved sources and decisions remain available. New drafts and decisions require the current revision.</span></div>':''}<div class="notice drafting-boundary"><span><strong>Drafts need human review.</strong> A matching quotation shows where wording came from. It does not prove that the source is authentic, that the statement applies, or that all requirements have been found.</span></div>`;
    const view={change,context,changeId,revisionId,active,title,boundary};
    if(run)renderRun(run,view);else renderSource(view);
  }

  function renderSource(view) {
    const {change,context,changeId,revisionId,active,title,boundary}=view;
    const allowed=can('AUTHOR')&&context.isCurrentRevision;
    shell(`${title}${boundary}${allowed?`<section class="panel drafting-section"><div class="panel-head"><div><h2>Provide the source to inspect</h2><p>Use a relevant, named and versioned excerpt. Its text is retained in the saved drafting record.</p></div></div><div class="panel-body"><form id="drafting-source-form">
      <div class="form-error" role="alert"></div>
      <div class="form-field"><label for="sourceReference">Source reference *</label><input id="sourceReference" name="sourceReference" maxlength="500" required><small>Document, policy or requirement identifier and section. Up to 500 characters.</small></div>
      <div class="form-field"><label for="sourceVersion">Source version *</label><input id="sourceVersion" name="sourceVersion" maxlength="120" required><small>The declared version of this source. Up to 120 characters.</small></div>
      <div class="form-field"><label for="sourceText">Source excerpt *</label><textarea id="sourceText" name="sourceText" maxlength="6000" rows="10" required aria-describedby="drafting-source-limits drafting-source-size"></textarea><small id="drafting-source-limits">Up to 6,000 characters, 12,000 UTF-8 bytes and 200 lines. Keep the original wording. Do not include credentials or sensitive data.</small><small id="drafting-source-size" aria-live="polite"></small></div>
      <div class="form-field"><label for="method">Drafting method</label><select id="method" name="method"><option value="rules">Explicit clauses · rule-based</option>${context.methods.openai?'<option value="openai">AI suggestions · OpenAI</option>':''}</select><small>Explicit clauses extracts individual lines with supported requirement phrases. It does not understand the whole document or discover every requirement.</small>${context.methods.openai?'':'<small>AI suggestions are not enabled in this workspace. The built-in method does not call an AI provider.</small>'}</div>
      <div id="drafting-ai-confirmation" class="review-summary" hidden><p>The displayed source excerpt will be sent to the configured OpenAI service. Account, application and evidence records are not part of this request. Provider retention follows your operator’s account and policy.</p><label class="acknowledge"><input type="checkbox" name="externalProcessingConfirmed" disabled> I confirm that this source excerpt may be processed by the configured external AI service.</label></div>
      <div class="actions"><button class="button primary" type="submit">Propose drafts</button><button class="button" type="button" id="drafting-check-saved">Check saved drafts</button></div><p class="small muted">Generation saves a preparation record. It does not add obligations, approve requirements or run verification.</p>
    </form></div></section>`:`<section class="panel drafting-section"><div class="panel-body"><h2>${context.isCurrentRevision?'Author role required to propose drafts':'This source history is read-only'}</h2><p>You can inspect saved sources and decisions. Only the requesting Author can act on their suggestions for a current revision.</p></div></section>`}
    <section class="panel drafting-section"><div class="panel-head"><div><h2>Saved drafting runs</h2><p>${context.total} saved run${context.total===1?'':'s'} for this revision. Preparing or dismissing a suggestion does not change declared assurance scope.</p></div><button class="button" id="drafting-refresh-history">Refresh saved drafts</button></div>
    ${context.runs.length?context.runs.map(run=>`<article class="drafting-run"><div class="chip-row">${badge(statusLabel(run.status),'candidate')}${badge(run.applicability??(context.isCurrentRevision?'CURRENT':'HISTORICAL'))}</div><h3><a href="${h(runLink(changeId,revisionId,run.id))}">${h(run.source.reference)}</a></h3><p class="small">Source version: ${h(run.source.version)} · ${h(methodLabel(run.method))}</p><p class="small muted">Requested by ${h(run.createdBy)} · ${h(date(run.createdAt))}</p><p>${run.pendingCount} awaiting decision · ${run.createdCount} candidates created · ${run.dismissedCount} dismissed</p><a class="button" href="${h(runLink(changeId,revisionId,run.id))}">Review saved run</a></article>`).join(''):'<div class="empty"><h3>No saved drafting runs</h3><p>Manual obligation authoring remains available on the change.</p></div>'}
    <div class="panel-body drafting-pagination"><p class="small">${context.runs.length?`Showing ${context.offset+1}–${Math.min(context.offset+context.runs.length,context.total)} of ${context.total}.`:`No runs on this page. ${context.total} saved runs in total.`}</p><div class="actions">${context.offset>0?`<a class="button" href="${h(base(changeId,revisionId))}/page/${Math.max(0,context.offset-context.limit)}">Previous runs</a>`:''}${context.offset+context.runs.length<context.total?`<a class="button" href="${h(base(changeId,revisionId))}/page/${context.offset+context.limit}">Next runs</a>`:''}</div></div></section>`,'changes','Source drafts');
    bindChangeLinks(view);
    document.querySelector('#drafting-refresh-history').onclick=()=>{if(active())route();};
    const form=document.querySelector('#drafting-source-form');
    if(!form)return;
    let attempt=null,generating=false;
    const source=form.elements.sourceText,method=form.elements.method,confirmation=form.elements.externalProcessingConfirmed;
    const updateSize=()=>{const value=size(source.value);document.querySelector('#drafting-source-size').textContent=`${value.characters} / 6,000 characters · ${value.bytes} / 12,000 bytes · ${value.lines} / 200 lines`;source.setCustomValidity(value.bytes>12000?'Reduce the excerpt to at most 12,000 UTF-8 bytes.':value.lines>200?'Reduce the excerpt to at most 200 lines.':'');};
    source.addEventListener('input',updateSize);updateSize();
    method.addEventListener('change',()=>{const external=method.value==='openai';document.querySelector('#drafting-ai-confirmation').hidden=!external;confirmation.disabled=!external;confirmation.required=external;confirmation.checked=false;});
    document.querySelector('#drafting-check-saved').onclick=()=>{if(active())route();};
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(!active()||generating)return;updateSize();if(!form.reportValidity())return;generating=true;
      const data={revisionId,sourceReference:form.elements.sourceReference.value,sourceVersion:form.elements.sourceVersion.value,sourceText:size(source.value).text,method:method.value,externalProcessingConfirmed:method.value==='openai'&&confirmation.checked};
      const fingerprint=JSON.stringify(data);
      if(attempt?.fingerprint!==fingerprint)attempt={fingerprint,requestId:crypto.randomUUID()};
      const button=form.querySelector('[type=submit]'),error=form.querySelector('.form-error');
      const controls=[...form.elements].filter(element=>element.tagName!=='BUTTON');
      const previouslyDisabled=controls.map(element=>element.disabled);
      controls.forEach(element=>element.disabled=true);button.disabled=true;button.textContent='Proposing drafts…';error.textContent='';
      try{const run=await api(`/api/changes/${encodeURIComponent(changeId)}/drafting-runs`,{method:'POST',data:{...data,requestId:attempt.requestId}});if(!active())return;location.hash=runLink(changeId,revisionId,run.id);}
      catch(err){if(!active()||err.sessionExpired||err.staleSession)return;error.textContent=problem(err)+' Use “Check saved drafts” to inspect the saved attempt before starting another.';}
      finally{generating=false;controls.forEach((element,index)=>element.disabled=previouslyDisabled[index]);button.disabled=false;button.textContent='Propose drafts';}
    });
  }

  function renderRun(run,view,message='') {
    const {context,changeId,revisionId,active,title,boundary}=view;
    if(!active())return;
    const suggestions=run.suggestions??[],pending=suggestions.filter(item=>item.status==='PROPOSED').length;
    const owns=can('AUTHOR')&&run.createdBy===S.session.email;
    const actionable=owns&&context.isCurrentRevision&&run.applicability==='CURRENT'&&run.status==='COMPLETED';
    const engine=run.engine??{};
    shell(`${title}${boundary}${message?`<p class="notice" role="status">${h(message)}</p>`:''}<div class="actions drafting-toolbar"><a class="button" href="${h(base(changeId,revisionId))}">All source drafts</a><button class="button" id="drafting-refresh-run">Reload saved run</button><a class="button" href="/api/drafting-runs/${encodeURIComponent(run.id)}/export">Export drafting record</a></div>
      <section class="panel drafting-section"><div class="panel-head"><div><h2>${h(run.source.reference)}</h2><p>Source version ${h(run.source.version)}</p></div><div class="chip-row">${badge(statusLabel(run.status),'candidate')}${badge(run.applicability)}</div></div><div class="panel-body">
      <dl class="support-list"><dt>Method</dt><dd>${h(methodLabel(run.method??engine.method))}</dd><dt>Requested by</dt><dd>${h(run.createdBy)}</dd><dt>Requested at</dt><dd>${h(date(run.createdAt))}</dd><dt>Source digest</dt><dd class="mono">${h(run.source.digest)}</dd>${engine.id?`<dt>Generator</dt><dd>${h(engine.id)}${engine.version?' · '+h(engine.version):''}</dd>`:''}${engine.provider?`<dt>Provider</dt><dd>${h(engine.provider)}</dd>`:''}${engine.model?`<dt>Recorded model</dt><dd>${h(engine.model)}</dd>`:''}${engine.requestedModel?`<dt>Configured model</dt><dd>${h(engine.requestedModel)}</dd>`:''}${engine.promptVersion?`<dt>Prompt version</dt><dd>${h(engine.promptVersion)}</dd>`:''}${engine.promptDigest?`<dt>Prompt digest</dt><dd class="mono">${h(engine.promptDigest)}</dd>`:''}${run.resultDigest?`<dt>Result digest</dt><dd class="mono">${h(run.resultDigest)}</dd>`:''}</dl>
      <details class="guide-detail drafting-source"><summary>Read the saved source excerpt</summary><pre class="drafting-text">${h(run.source.text)}</pre></details>
      <p class="small muted">These digests identify stored content. They are not signatures or independent proof of source authenticity. Original suggestions and human decisions remain separate.</p>
      ${(run.warnings??[]).map(code=>`<p class="notice warning">${h(warnings[code]??'The saved run reports a limitation: '+code)}</p>`).join('')}
      ${run.failureCode?`<p class="notice warning" role="alert">${h(failures[run.failureCode]??'This run could not produce an accepted drafting result. Ask the workspace operator to inspect its reference.')} <span class="small">Reference: ${h(run.id)}</span></p>`:''}
      ${run.status==='GENERATING'?'<p class="notice" role="status">This request is still in progress. Use “Reload saved run” to inspect its state. Do not start another generation to recover a lost response.</p>':''}
      </div></section>
      <section class="panel drafting-section"><div class="panel-head"><div><h2>Review each suggestion</h2><p>${pending} awaiting decision · ${suggestions.filter(item=>item.status==='CANDIDATE_CREATED').length} candidates created · ${suggestions.filter(item=>item.status==='DISMISSED').length} dismissed</p></div></div><div class="panel-body drafting-scope-note"><p>Unconverted suggestions are preparation records. They are not declared obligations, evidence or passes. Each candidate you create enters the ordinary requirement workflow and becomes a declared scope gap until reviewed and supported.</p>${!owns?'<p>Only the requesting Author can create candidates or dismiss suggestions from this run.</p>':!context.isCurrentRevision||run.applicability!=='CURRENT'?'<p>This run belongs to a historical revision. Its decisions cannot be changed here.</p>':''}</div>
      ${suggestions.length?suggestions.map((item,index)=>suggestion(item,index,actionable,changeId,revisionId)).join(''):`<div class="empty"><h3>${run.status==='COMPLETED'?'No drafts were proposed':'No completed suggestions are available'}</h3><p>${run.status==='COMPLETED'?'Review the source yourself and add any applicable obligations. An empty result does not establish complete scope.':'Inspect the saved run status. A failed or unfinished attempt is not an empty successful result.'}</p><a href="${h(changeLink(changeId,revisionId))}">Open the change to add an obligation</a></div>`}</section>`,'changes','Review source drafts');
    bindChangeLinks(view);
    document.querySelector('#drafting-refresh-run').onclick=()=>{if(active())route();};
    let savingDecision=false;
    document.querySelectorAll('form[data-drafting-action]').forEach(form=>form.addEventListener('submit',async event=>{
      event.preventDefault();if(!active()||savingDecision||!form.reportValidity())return;
      const item=suggestions.find(value=>value.id===form.dataset.suggestionId);if(!item)return;
      const action=form.dataset.draftingAction;
      const data={action,version:item.version,rationale:form.elements.rationale.value};
      if(action==='CREATE_CANDIDATE'){data.statement=form.elements.statement.value;data.criticality=form.elements.criticality.value;}
      const controls=[...document.querySelectorAll('form[data-drafting-action] input,form[data-drafting-action] textarea,form[data-drafting-action] select,form[data-drafting-action] button')],error=form.querySelector('.form-error');
      const previouslyDisabled=controls.map(element=>element.disabled);savingDecision=true;
      controls.forEach(element=>element.disabled=true);error.textContent='';
      try{const updated=await api(`/api/drafting-runs/${encodeURIComponent(run.id)}/suggestions/${encodeURIComponent(item.id)}/actions`,{method:'POST',data});if(!active())return;renderRun(updated,view,action==='CREATE_CANDIDATE'?'Draft candidate saved. Open the change to request its separate authority review.':'Suggestion dismissed with your recorded reason. This is not an obligation rejection or a waiver.');
        if(action==='CREATE_CANDIDATE'){try{await refresh();}catch(err){if(!active()||err.sessionExpired||err.staleSession)return;const note=document.createElement('p');note.className='notice warning';note.setAttribute('role','alert');note.textContent='The draft candidate was saved, but the workspace summary could not refresh. Reload the view to update its counts.';document.querySelector('.drafting-toolbar')?.after(note);}}
      }
      catch(err){if(!active()||err.sessionExpired||err.staleSession)return;error.textContent=problem(err)+' Reload the saved run to check whether the decision was recorded before submitting again.';}
      finally{savingDecision=false;controls.forEach((element,index)=>element.disabled=previouslyDisabled[index]);}
    }));
  }

  function suggestion(item,index,actionable,changeId,revisionId) {
    const id=`draft-${index}`,decision=item.decision;
    return `<article class="drafting-suggestion" data-suggestion-id="${h(item.id)}"><div class="chip-row">${badge('SUGGESTION '+(index+1))}${badge(statusLabel(item.status),'candidate')}</div><h3>Original proposed statement</h3><p class="drafting-statement">${h(item.statement)}</p><div class="drafting-quote"><h4>Exact source quotation · ${item.startLine===item.endLine?'line '+item.startLine:'lines '+item.startLine+'–'+item.endLine}</h4><blockquote>${h(item.quote)}</blockquote><p class="small muted">Check the surrounding source. Quotation matching does not prove that the proposed statement follows from it.</p></div>
      ${decision?`<div class="review-summary"><h4>${decision.action==='CREATE_CANDIDATE'?'Recorded candidate decision':'Recorded dismissal'}</h4><p>${h(decision.rationale)}</p>${decision.statement?`<p><strong>Statement saved at this decision:</strong> ${h(decision.statement)}</p><p><strong>Criticality selected:</strong> ${h(decision.criticality)}</p>`:''}<p class="small">${h(decision.actor)} · ${h(date(decision.createdAt))}</p>${decision.obligationId?`<p class="small mono">Obligation: ${h(decision.obligationId)}</p><a class="button" href="${h(changeLink(changeId,revisionId))}">Open candidate in change</a><p class="small muted">This receipt preserves the original creation decision. The ordinary obligation record may have later edits or review decisions.</p>`:'<p class="small muted">Dismissal applies to this suggestion. It does not reject an existing obligation, grant a waiver or prove completeness.</p>'}</div>`:''}
      ${actionable&&item.status==='PROPOSED'?`<div class="drafting-decisions"><details class="guide-detail"><summary>Review and create a draft candidate</summary><form data-drafting-action="CREATE_CANDIDATE" data-suggestion-id="${h(item.id)}"><div class="form-error" role="alert"></div><div class="form-field"><label for="${id}-statement">What must be true? *</label><textarea id="${id}-statement" name="statement" maxlength="1200" required>${h(item.statement)}</textarea><small>Edit this proposed wording after comparing it with the source. Up to 1,200 characters.</small></div><div class="form-field"><label for="${id}-criticality">Criticality *</label><select id="${id}-criticality" name="criticality" required><option value="">Choose the appropriate criticality</option>${['LOW','MEDIUM','HIGH','CRITICAL'].map(value=>`<option value="${value}">${value}</option>`).join('')}</select><small>This is your decision. The generator has not assigned criticality.</small></div><div class="form-field"><label for="${id}-rationale">Why should this become a candidate? *</label><textarea id="${id}-rationale" name="rationale" minlength="10" maxlength="1500" required></textarea><small>10–1,500 characters. Explain the source and relevance to this change.</small></div><p class="small">The candidate starts as DRAFT / CANDIDATE / NOT_ASSESSED, with no evidence. Separate Policy Authority review is still required.</p><button class="button primary" type="submit">Create draft candidate</button></form></details><details class="guide-detail"><summary>Dismiss this suggestion</summary><form data-drafting-action="DISMISS" data-suggestion-id="${h(item.id)}"><div class="form-error" role="alert"></div><div class="form-field"><label for="${id}-dismissal">Reason for dismissal *</label><textarea id="${id}-dismissal" name="rationale" minlength="10" maxlength="1500" required></textarea><small>10–1,500 characters. Explain why you are not creating a candidate from this suggestion.</small></div><button class="button" type="submit">Dismiss suggestion</button></form></details></div>`:''}
    </article>`;
  }
  return {show,invalidate};
}

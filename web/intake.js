/** Source metadata is rendered as escaped text, never markdown, HTML or an instruction. */
export function createIntakeUI({S,api,h,shell,can,openForm,field,toast}){
 let generation=0;
 const invalidate=()=>{generation++;};
 async function show(preferredRepo=null,preferredPull=null){
  const current=++generation,session=S.session,hash=location.hash;
  const active=()=>!!session&&current===generation&&session===S.session&&hash===location.hash;
  const repos=await api('/api/source-repositories');
  if(!active()||!location.hash.startsWith('#/intake'))return;
  shell(`<div class="heading"><div><div class="eyebrow">Development workflow</div><h1>Import a GitHub change</h1><p class="sub">Preview the exact source reference. Import context—not requirements, evidence or readiness.</p></div></div><div class="notice">Repository access is configured by the operator. This does not fetch or execute repository code, verify a deployment, post a GitHub check or grant workspace permissions.</div><section class="panel"><div class="panel-body">${can('AUTHOR')&&repos.length?`<form id="source-preview"><div class="form-error" role="alert"></div><div class="form-field"><label for="repositoryKey">Authorized repository</label><select name="repositoryKey" id="repositoryKey">${repos.map(r=>`<option value="${h(r.id)}"${r.id===preferredRepo?' selected':''}>${h(r.owner+'/'+r.repo)} · ${h(S.workspace.applications.find(a=>a.id===r.applicationId)?.name??'Configured application')}</option>`).join('')}</select></div><div class="form-field"><label for="pullNumber">Open pull-request number</label><input id="pullNumber" name="pullNumber" type="number" min="1" max="2147483647" required value="${Number.isSafeInteger(preferredPull)&&preferredPull>0?h(preferredPull):''}"></div><button class="button primary" type="submit">Preview source metadata</button></form>`:`<h2>${can('AUTHOR')?'No repository is configured':'Author role required'}</h2><p>Ask the workspace operator to confirm access. No source import has occurred.</p>`}</div></section><div id="source-preview-result"></div>`,'intake','GitHub intake');
  let previewing=false;
  document.querySelector('#source-preview')?.addEventListener('submit',async e=>{
   e.preventDefault();if(!active()||previewing)return;
   const form=e.currentTarget,button=form.querySelector('button'),error=form.querySelector('.form-error');
   if(!form.reportValidity())return;
   previewing=true;button.disabled=true;error.textContent='';
   try{const d=Object.fromEntries(new FormData(form));const preview=await api('/api/source-previews',{method:'POST',data:{repositoryKey:d.repositoryKey,pullNumber:Number(d.pullNumber)}});if(!active())return;render(preview,active);}
   catch(err){if(!active()||err.sessionExpired||err.staleSession)return;error.textContent=err.message;document.querySelector('#source-preview-result')?.replaceChildren();}finally{previewing=false;button.disabled=false;}
  });
  // Arriving from an application's pull-request list: preview the chosen PR (read-only; nothing is imported).
  if(preferredRepo&&Number.isSafeInteger(preferredPull)&&preferredPull>0&&repos.some(r=>r.id===preferredRepo))document.querySelector('#source-preview')?.requestSubmit();
 }
 function render(preview,active){
  if(!active())return;
  const s=preview.source,area=document.querySelector('#source-preview-result');
  area.innerHTML=`<section class="panel resolution-source"><div class="panel-head"><div><h2>Review before importing</h2><p>${h(s.repository)} #${h(s.pullNumber)}${s.draft?' · Draft pull request':''}</p></div></div><div class="panel-body"><h3>${h(s.title)}</h3><p class="small">Imported change title: ${h(s.importedTitle)}</p><dl class="boundary"><dt>Head SHA</dt><dd>${h(s.headSha)}</dd><dt>Base SHA</dt><dd>${h(s.baseSha)}</dd><dt>Head repository</dt><dd>${h(s.headRepository)}</dd><dt>Preview expires</dt><dd>${h(preview.expiresAt)}</dd></dl><details><summary>Untrusted pull-request description</summary><pre class="source-description">${h(s.body.slice(0,4000))}${s.body.length>4000?'\n[Preview truncated; full supported description retained in the source receipt.]':''}</pre></details><div class="notice warning">Nothing here is an accepted requirement or proof. Import rechecks the provider; changed source or metadata requires a new preview.</div><button class="button primary" id="source-import">Import reviewed context</button></div></section>`;
  area.querySelector('#source-import').onclick=()=>{
   if(!active())return;
   const changes=S.workspace.changes.filter(c=>c.applicationId===preview.applicationId);
   openForm('Import reviewed source','Choose a new change or an explicit existing change. A copied obligation becomes a candidate and receives no inherited evidence.',`<div class="form-field"><label for="changeId">Destination</label><select name="changeId" id="changeId"><option value="">Create a new change</option>${changes.map(c=>`<option value="${h(c.id)}">New revision of: ${h(c.title)}</option>`).join('')}</select></div>${field('reason','Why does this source belong here?','textarea','','At least 10 characters; a human import rationale, not an auto-accepted PR instruction.',true)}<label class="acknowledge"><input type="checkbox" name="copyObligations"> Copy prior candidates when adding to an existing change</label>`,'Import source',async d=>{
    const change=changes.find(c=>c.id===d.changeId);
    const result=await api('/api/source-imports',{method:'POST',data:{previewId:preview.id,changeId:change?.id??null,expectedRevisionId:change?.revision.id??null,copyObligations:!!change&&d.copyObligations==='on',reason:d.reason}});
    if(active())toast('Source context saved. No assurance result was created.');return `#/changes/${result.changeId}`;
   });
  };
 }
 return {show,invalidate};
}

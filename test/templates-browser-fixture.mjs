/** Disposable real template workflow; only response delivery is fault-injected. */
import { setupTemplates, author, authority, viewer } from './templates-helpers.mjs';
import { createApplicationServer } from '../backend/server/app.mjs';
import { hashPassword } from '../backend/server/auth.mjs';

const password=process.env.TEMPLATES_TEST_PASSWORD;
if(typeof password!=='string'||password.length<24)throw new Error('Supply a generated TEMPLATES_TEST_PASSWORD.');
const port=Number(process.env.TEMPLATES_TEST_PORT??3190);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Use an unprivileged test port.');
const latency=Number(process.env.TEMPLATES_TEST_LATENCY_MS??0);
if(!Number.isInteger(latency)||latency<0||latency>5000)throw new Error('Test latency must be 0–5000ms.');
const cleanup=[];
const fixture=await setupTemplates({after:callback=>cleanup.push(callback)});
const extra=await fixture.workflow.addObligation(fixture.destination.id,{
    revisionId:fixture.destination.revision.id,
    statement:'The application must retain a separate audit record for every approval decision.',
    sourceReference:'Additional audit policy',sourceVersion:'2',criticality:'HIGH'
},author);
const origin=`http://127.0.0.1:${port}`,passwordHash=hashPassword(password);
const server=createApplicationServer({repository:fixture.workflow,assurance:fixture.service,publicOrigin:origin,
    releaseRevision:'9'.repeat(40),accounts:[author,authority,viewer].map(actor=>({...actor,passwordHash}))});
const handler=server.listeners('request')[0];
let dropPlanReply=process.env.TEMPLATES_TEST_DROP_PLAN_REPLY==='true';
server.removeListener('request',handler);
server.on('request',(req,res)=>{
    const path=new URL(req.url,origin).pathname;
    const delayed=req.method==='GET'&&/^\/api\/verification-templates\/[a-f0-9-]{36}$/.test(path);
    const end=res.end.bind(res);
    res.end=(data,encoding,callback)=>{
        if(dropPlanReply&&req.method==='POST'&&path===`/api/changes/${fixture.destination.id}/assurance-plan`&&res.statusCode>=200&&res.statusCode<300){
            // The authentic permission checks and atomic plan/receipt save have
            // completed. Lose only the reply to exercise honest UI recovery.
            dropPlanReply=false;res.flushHeaders();setTimeout(()=>res.destroy(),25);return res;
        }
        if(delayed&&latency){res.flushHeaders();setTimeout(()=>end(data,encoding,callback),latency);return res;}
        return end(data,encoding,callback);
    };
    void handler(req,res);
});
const schemaVersion=await fixture.workflow.getSchemaVersion();
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({origin,schemaVersion,
    sourceId:fixture.source.id,sourceRevisionId:fixture.source.revision.id,sourcePlanId:fixture.sourcePlan.id,
    destinationId:fixture.destination.id,destinationRevisionId:fixture.destination.revision.id,
    sourceObligations:fixture.sourceObligations.map(item=>({id:item.id,statement:item.statement})),
    destinationObligations:fixture.destinationObligations.map(item=>({id:item.id,statement:item.statement})),
    extraObligationId:extra.id,destinationTargetId:fixture.destinationTarget.id,
    originalSourcePlanDigest:fixture.sourceContext.scopeDigest
})));
let closing=false;
async function stop(){
    if(closing)return;closing=true;
    await new Promise(resolve=>server.close(resolve));
    for(const callback of cleanup)await callback();
    process.exit(0);
}
process.on('SIGTERM',stop);process.on('SIGINT',stop);

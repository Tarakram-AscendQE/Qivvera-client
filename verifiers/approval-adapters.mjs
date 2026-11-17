/** Fixed adapters selected by protected configuration; no scripts or paths from browser input. */
import {createBoundedTransport} from './bounded-transport.mjs';
export function createApprovalAdapter(target,options){
 const id=target.adapterId??'approval-v1';
 if(!['approval-v1','expense-v1'].includes(id))throw new Error('UNSUPPORTED_ADAPTER');
 const raw=createBoundedTransport(target,options);
 return async (method,path,settings={})=>{
  if(!/^\/(identity|me|requests(?:\/[a-zA-Z0-9_-]{1,80}(?:\/approve)?)?)$/.test(path))throw new Error('UNSUPPORTED_OPERATION');
  if(id==='approval-v1')return raw(method,path,settings);
  const wire=path==='/identity'?'/meta':path==='/me'?'/principal':path.replace('/requests','/expenses').replace('/approve','/authorize');
  const opts={...settings};
  if(method==='POST'&&path==='/requests')opts.data={trace:settings.data.correlationId,description:'Synthetic assurance expense; no real reimbursement',amountMinor:100,currency:'INR'};
  const r=await raw(method,wire,opts),b=r.body;
  let body;
  if(path==='/identity')body={contract:b.contract==='qivvera.expense-http/1'?'qivvera.approval-http/1':b.contract,sourceRevision:b.revision,artifactDigest:b.artifact,environmentDigest:b.environment,instanceId:b.instance};
  else if(path==='/me')body={subject:b.principal,error:b.code};
  else body={id:b.expenseId,requesterId:b.employee,approverId:b.authorizedBy,status:b.state==='SUBMITTED'?'PENDING':b.state,correlationId:b.trace,error:b.code==='ALREADY_FINALIZED'?'NOT_PENDING':b.code==='SAME_ACTOR'?'SELF_APPROVAL_NOT_ALLOWED':b.code};
  return {status:r.status,body};
 };
}

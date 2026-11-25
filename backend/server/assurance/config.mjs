import {validateTargets as validateCatalogue} from './generalization.mjs';
export function loadAssuranceConfig(env=process.env){
  const enabled=env.QIVVERA_ASSURANCE_ENABLED==='true';
  const generalizationEnabled=env.QIVVERA_GENERALIZATION_ENABLED==='true';
  const templatesEnabled=env.QIVVERA_TEMPLATES_ENABLED==='true';
  if(templatesEnabled&&(!enabled||!generalizationEnabled))throw new Error('TEMPLATES_REQUIRE_GENERALIZED_ASSURANCE');
  const hosted=env.NODE_ENV==='production'||env.VERCEL==='1';
  const allowLocalTargets=!hosted&&env.QIVVERA_ALLOW_LOOPBACK_TARGETS==='true';
  if(hosted&&env.QIVVERA_ALLOW_LOOPBACK_TARGETS==='true')throw new Error('HOSTED_LOOPBACK_TARGETS_FORBIDDEN');
  let raw=[];
  if(enabled){try{raw=JSON.parse(env.QIVVERA_TARGETS_JSON??'[]');}catch{throw new Error('INVALID_TARGET_CATALOGUE_JSON');}}
  return {enabled,generalizationEnabled,templatesEnabled,allowLocalTargets,targets:validateCatalogue(raw,{local:allowLocalTargets})};
}

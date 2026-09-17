/* Authenticated, short-lived RT list snapshot. Never persisted or used as a write receipt. */
(function(g){
'use strict';
const D=g.OqcDomain,SCHEMA='OQC_RT_CATALOG_G12',PATCH='RT-CATALOG-G12-20260917';
function create({fetchCatalog,scope,now=Date.now,maxAgeMs=30000}){
 let identity,epoch=0,snapshot=null,pending=null,lastFailure=null,retryAt=0;
 function clear(){identity=scope();epoch++;snapshot=null;pending=null;lastFailure=null;retryAt=0;}
 function align(){if(identity!==scope())clear();return epoch;}
 function fresh(){align();return !!snapshot&&now()<snapshot.expiresAt;}
 function prime(raw,expected=scope(),startedAt=now()){
  align();if(expected!==identity)D.fail('RT_CHECK_CONTEXT_CHANGED','登入或連線已改變，請重新查驗 RT');
  if(!raw||raw.schema!==SCHEMA||raw.complete!==true||!Array.isArray(raw.entries)||!Array.isArray(raw.errors)||
   !Number.isFinite(raw.validForMs)||raw.validForMs<=0||raw.entries.length+raw.errors.length>5000)
   D.fail('RT_CATALOG_INVALID','RT 主檔回應不完整，請重新查驗');
  const entries=new Map(),errors=new Map(),seen=new Set();
  for(const row of raw.entries){
   const rt=row?.entry?.rt;D.validRtMeta(row?.entry,rt);
   if(seen.has(rt)||typeof row.proof!=='string'||!row.proof)D.fail('RT_CATALOG_INVALID','RT 主檔重複或缺少驗證資料');
   seen.add(rt);entries.set(rt,D.clone(row));
  }
  for(const row of raw.errors){
   if(!row||typeof row.rt!=='string'||!D.rtPattern.test(row.rt)||seen.has(row.rt)||!['RT_MASTER_CONFLICT','RT_NOT_CYLINDER'].includes(row.code)||typeof row.message!=='string')
    D.fail('RT_CATALOG_INVALID','RT 主檔分類回應不完整');
   seen.add(row.rt);errors.set(row.rt,D.clone(row));
  }
  if(!seen.size)D.fail('RT_CATALOG_INVALID','RT 主檔回應為空，請重新查驗');
  // Include request time in the freshness budget; a slow transfer cannot extend it.
  const expiresAt=startedAt+Math.min(maxAgeMs,raw.validForMs);
  if(expiresAt<=now())D.fail('RT_CATALOG_EXPIRED','RT 主檔載入時間過長，請重新查驗');
  snapshot={entries,errors,expiresAt};lastFailure=null;retryAt=0;return true;
 }
 function peek(rt){if(!fresh())return null;const value=snapshot.entries.get(rt);return value?D.clone(value):null;}
 async function refresh(){
  const generation=align();if(pending)return pending;
  if(lastFailure&&now()<retryAt)throw lastFailure;
  const expected=identity,startedAt=now();
  const task=Promise.resolve().then(fetchCatalog).then(reply=>{
   if(generation!==align())D.fail('RT_CHECK_CONTEXT_CHANGED','登入或連線已改變，請重新查驗 RT');
   prime(reply?.rtCatalog,expected,startedAt);return true;
  }).catch(e=>{if(generation===align()){lastFailure=e;retryAt=now()+5000;}throw e;})
   .finally(()=>{if(pending===task)pending=null;});
  pending=task;return task;
 }
 async function get(rt){
  if(!D.rtPattern.test(rt))D.fail('INVALID_RT','RT 必須是 5～10 碼數字');
  if(!fresh())await refresh();
  if(!fresh())D.fail('RT_CATALOG_EXPIRED','RT 主檔已過期，請重新查驗');
  const failure=snapshot.errors.get(rt);if(failure)D.fail(failure.code,failure.message);
  const value=snapshot.entries.get(rt);
  if(!value)D.fail('RT_NOT_FOUND','RT '+rt+' 不存在於 RT list，本次未套用');
  return D.clone(value);
 }
 function status(){align();return {fresh:fresh(),loading:!!pending,remainingMs:fresh()?snapshot.expiresAt-now():0,error:lastFailure?.message||''};}
 return {clear,prime,peek,get,refresh,status};
}
g.OqcRtCatalogG12={SCHEMA,PATCH,create};
})(typeof globalThis!=='undefined'?globalThis:this);

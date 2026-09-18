/* RT-G1-20260917: validation and atomic reconciliation of fenced RT requests. */
(function(g){
'use strict';
const D=g.OqcDomain,PATCH='RT-G1-20260916',BUILD='RT-G1-20260917-02';
const fail=message=>D.fail('RT_RECOVERY_UNSAFE',message+'；原請求及資料保留');
function normalizeRt(value){return String(value||'').trim().replace(/^RT\s*/i,'');}
function validateReply(rt,items,response){
 const meta=D.validRtMeta(response&&response.entry,rt);
 if(typeof response.proof!=='string'||!response.proof)D.fail('RT_PROOF_MISSING','RT list 回應缺少驗證資料，未套用');
 if(!items.length)D.fail('EMPTY_SELECTION','請先選取項目');
 items.forEach(i=>{if(!D.canRt(i))D.fail('STALE_SELECTION','選取項目已改變');D.validateRtType(i,meta);});
 return {rtMaster:meta,proof:response.proof};
}
// A brief, memory-only reuse of authenticated proofs; batch_sync still checks
// the current master and permission before accepting any RT operation.
function createRtLookup({lookup,scope,now=Date.now,maxAgeMs=30000,maxEntries=32}){
 let identity,epoch=0;const entries=new Map();
 function clear(){entries.clear();identity=scope();epoch++;}
 function align(){if(identity!==scope())clear();return epoch;}
 function peek(rt){align();const hit=entries.get(rt);return hit?.value&&now()-hit.at<maxAgeMs?D.clone(hit.value):null;}
 async function get(rt){
  const generation=align(),cached=peek(rt);if(cached)return cached;
  const old=entries.get(rt);if(old?.promise)return D.clone(await old.promise);
  const entry={};entries.set(rt,entry);
  while(entries.size>maxEntries)entries.delete(entries.keys().next().value);
  entry.promise=Promise.resolve().then(()=>lookup(rt)).then(response=>{
   if(generation!==align())D.fail('RT_CHECK_CONTEXT_CHANGED','登入或連線已改變，請重新查驗 RT');
   D.validRtMeta(response?.entry,rt);
   if(typeof response.proof!=='string'||!response.proof)D.fail('RT_PROOF_MISSING','RT list 回應缺少驗證資料，未套用');
   entry.value=D.clone(response);entry.at=now();entry.promise=null;return response;
  }).catch(e=>{if(entries.get(rt)===entry)entries.delete(rt);throw e;});
  return D.clone(await entry.promise);
 }
 return {get,peek,clear};
}
function isRtRejection(error){
 const codes=['INVALID_RT','RT_NOT_FOUND','RT_MASTER_CONFLICT','RT_NOT_CYLINDER','RT_QUEUE_REJECTED'];
 return !!error&&(error.code?codes.includes(error.code):/^RT\s+\d+\s+不存在於 RT list|^此無效 RT 原請求已封存/.test(error.message||''));
}
function rtQueueProblem(root){
 if(!root.lastError||!(root.pending||[]).length)return null;
 const failure=root.syncFailure||{message:root.lastMessage};
 if(!isRtRejection(failure))return null;
 if(failure.requestId&&failure.requestId!==root.inflight?.requestId)return null;
 const commands=root.inflight?.operations||root.pending,rt=commands.find(c=>c.type==='RT_CHANGE');
 if(!rt)return null;
 const batchId=root.inflight?.batchId||rt.batchId,count=root.pending.filter(c=>c.batchId===batchId).length;
 if(!count)return null;
 return {batchId,count,number:root.docs[batchId]?.number||batchId,message:failure.message||root.lastMessage};
}
function syncNotice(root,issue='',busy=false){
 const problem=rtQueueProblem(root),queued=!!((root.pending||[]).length||root.inflight);
 if(busy)return {text:'資料同步中；尚未代表裝框完成',danger:false,problem};
 if(problem)return {text:'舊待傳 RT 尚未修復｜'+problem.number+'（'+problem.count+' 筆待傳）：'+problem.message+'。請按「修復待傳 RT」核對原請求。',danger:true,problem};
 // An acknowledged queue must not keep showing its old error as current state.
 const transient=issue&&issue!==root.lastMessage?issue:'',persistent=queued&&(root.blocked||root.lastError&&root.lastMessage);
 const text=transient||persistent||((root.pending||[]).length?'本機已保存，待傳 '+root.pending.length+' 項操作':!root.lastError&&root.lastMessage||'目前沒有待傳操作');
 return {text,danger:!!(transient||persistent),problem:null};
}
function closeProblems(doc){
 const errors=[];
 if(!doc)return ['請先選擇批次'];
 if(!D.active(doc).length)errors.push('空批次不能完成；請先掃描 CTN');
 if(!doc.shippingRef)errors.push('尚未填寫裝框識別；請取消後到「設定總量／備註」填寫');
 D.active(doc).forEach(i=>{
  if(i.iqc.state==='NON_CYLINDER')errors.push(i.ctn+'：運輸框／型態需確認，請核對實物與 IQC 來源');
  if(i.iqc.state==='CONFLICT')errors.push(i.ctn+'：IQC 資料衝突，請先確認來源');
 });
 return errors;
}
function recoveryState(root,batchId){return D.canonical({actor:root.actor,doc:root.docs[batchId]||null,pending:root.pending.filter(c=>c.batchId===batchId),inflight:root.inflight});}
function reconcile(root,packet,reply,expected,id,at){
 if(recoveryState(root,packet.batchId)!==expected||D.canonical(root.inflight)!==D.canonical(packet))fail('修復期間資料已改變，請重新查核');
 if(reply.recoveryPatch!==PATCH||reply.requestId!==packet.requestId||typeof reply.accepted!=='boolean'||!Array.isArray(reply.ackIds))fail('後端修復確認不完整');
 if(reply.doc&&reply.doc.id!==packet.batchId)fail('後端批次不符');
 const pending=root.pending.filter(c=>c.batchId===packet.batchId),byId=new Map(pending.map(c=>[c.id,c]));
 if(packet.operations.some(c=>!byId.has(c.id)||D.canonical(byId.get(c.id))!==D.canonical(c)))fail('原請求與待傳內容不符');
 let doc=reply.doc?D.clone(reply.doc):null;
 let next=[],audit;
 if(reply.accepted){
  const ack=new Set(reply.ackIds);
  if(!doc||reply.rejection||ack.size!==packet.operations.length||packet.operations.some(c=>!ack.has(c.id)||doc.applied?.[c.id]!==D.canonical(c)))fail('已接受操作的確認不完整');
  next=pending.filter(c=>!ack.has(c.id));
  for(const c of next)doc=D.run(doc,c,{actor:root.actor});
  audit={state:'ACCEPTED',requestId:packet.requestId,ackIds:reply.ackIds,at};
 }else{
  const rejection=reply.rejection;
  if(reply.ackIds.length||!rejection||rejection.kind!=='RT_G1_REJECTED_REQUEST'||rejection.requestId!==packet.requestId||!Array.isArray(rejection.invalid)||!rejection.invalid.length)fail('未取得可安全撤回的拒絕封存');
  if(doc&&doc.phase!=='OPEN')fail('後端批次已非開放中');
  if(pending.some(c=>doc?.applied?.[c.id]))fail('包含已入帳操作，不撤銷或改寫');
  const invalid=new Set(),allowed=['INVALID_RT','RT_NOT_FOUND','RT_MASTER_CONFLICT','RT_NOT_CYLINDER'];
  for(const entry of rejection.invalid){
   const cmd=packet.operations.find(c=>c.id===entry.id);
   if(invalid.has(entry.id)||!cmd||cmd.type!=='RT_CHANGE'||!allowed.includes(entry.code)||String(cmd.data.rt)!==entry.rt||D.canonical((cmd.data.items||[]).map(i=>i.ctn))!==D.canonical(entry.ctns))fail('被拒操作與原請求不符');
   invalid.add(entry.id);
  }
  // Every replacement is a new operation; originals remain in the repair audit.
  // Reconfirm CLOSE/REMOVE instead of silently changing an operator's consent.
  if(pending.some(c=>['CLOSE','REMOVE_BATCH'].includes(c.type)))fail('包含完成或移除確認，需先核對，不自動重建此類操作');
  const mapping={},allowedTypes=['CREATE','SCAN','IQC_RESULT','RT_CHANGE','RT_META','VOID','RESTORE','SETTINGS'];
  for(const original of pending){
   if(invalid.has(original.id))continue;
   if(!allowedTypes.includes(original.type))fail('包含未知操作');
   const c=D.clone(original);c.id=id('op');mapping[original.id]=c.id;c.base=doc?doc.revision:0;
   if(c.data.scanId)c.data.scanId=mapping[c.data.scanId]||c.data.scanId;
   if(c.data.voidId)c.data.voidId=mapping[c.data.voidId]||c.data.voidId;
   if(c.type==='RT_CHANGE')c.data.items.forEach(item=>{
    const current=doc?.items.find(i=>i.ctn===item.ctn);
    if(!current)fail('合法 RT 操作的 CTN 無法重建');item.fromRt=current.rt;
   });
   doc=D.run(doc,c,{actor:root.actor});next.push(c);
  }
  if(!doc)fail('無法重建原批次');
  audit={state:'REJECTED_REPAIRED',requestId:packet.requestId,packet:D.clone(packet),rejection:D.clone(rejection),originalPending:D.clone(pending),beforeDoc:D.clone(root.docs[packet.batchId]),operationMapping:mapping,at};
 }
 // Nothing above changes root. Commit the complete, validated result atomically.
 const replacements=new Map();let p=0;
 if(reply.accepted)next.forEach(c=>replacements.set(c.id,c));
 else pending.filter(c=>!reply.rejection.invalid.some(i=>i.id===c.id)).forEach(c=>replacements.set(c.id,next[p++]));
 root.pending=root.pending.flatMap(c=>c.batchId!==packet.batchId?[c]:replacements.has(c.id)?[replacements.get(c.id)]:[]);
 root.docs[packet.batchId]=doc;
 if(reply.doc?.receipt)root.receipts[packet.batchId]=D.clone(reply.doc.receipt);
 root.rtRepairs=root.rtRepairs||[];root.rtRepairs.push(audit);
 root.inflight=null;root.blocked='';root.lastError=false;root.syncFailure=null;
 root.lastMessage=reply.accepted?'原請求已由後端接受，已取回確認，未撤銷交易':'已復原被拒絕的 RT；CTN、其他操作及修復紀錄保留，合法操作接續同步';
 return audit;
}
g.OqcRtGateG1={PATCH,BUILD,normalizeRt,validateReply,createRtLookup,isRtRejection,rtQueueProblem,syncNotice,closeProblems,recoveryState,reconcile};
})(typeof globalThis!=='undefined'?globalThis:this);

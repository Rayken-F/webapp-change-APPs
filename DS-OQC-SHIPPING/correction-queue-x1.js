(function(g){
 'use strict';
 const D=g.OqcDomain,G=g.OqcRtGateG1,PATCH='IQC-X1-20260928';
 function fail(message){D.fail('CORRECTION_RECOVERY_INVALID',message+'；原資料保留');}
 function problem(root){return !!root.inflight&&(root.docs[root.inflight.batchId]?.identityCorrections?.length||['CORRECTION_REVIEW_REQUIRED','CORRECTION_QUEUE_REJECTED'].includes(root.syncFailure?.code));}
 function reconcile(root,packet,reply,expected,id,at){
  if(G.recoveryState(root,packet.batchId)!==expected||D.canonical(root.inflight)!==D.canonical(packet))fail('核對期間資料已變更');
  if(reply.recoveryPatch!==PATCH||reply.requestId!==packet.requestId||reply.doc?.id!==packet.batchId||!reply.doc.identityCorrections?.length||typeof reply.accepted!=='boolean'||!Array.isArray(reply.ackIds))fail('後端確認不完整');
  const pending=root.pending.filter(c=>c.batchId===packet.batchId),byId=new Map(pending.map(c=>[c.id,c]));
  if(packet.operations.some(c=>!byId.has(c.id)||D.canonical(byId.get(c.id))!==D.canonical(c)))fail('原請求與待傳資料不符');
  const ack=new Set(reply.ackIds);
  if(reply.accepted){
   if(ack.size!==packet.operations.length||packet.operations.some(c=>!ack.has(c.id)||reply.doc.applied?.[c.id]!==D.canonical(c))||reply.rejection)fail('已入帳確認不完整');
  }else if(ack.size||reply.rejection?.kind!=='IQC_X1_REJECTED_REQUEST'||reply.rejection.requestId!==packet.requestId||pending.some(c=>reply.doc.applied?.[c.id]))fail('尚未取得原請求的拒絕紀錄');
  let doc=D.clone(reply.doc);const next=[],held=[],mapping={};
  for(const original of pending){
   if(ack.has(original.id))continue;
   // CLOSE and RT edits require a fresh operator decision on the corrected list.
   if(['CLOSE','REMOVE_BATCH','RT_CHANGE','RT_META'].includes(original.type)){held.push({command:D.clone(original),reason:'CTN 已更正，請依目前清單重新核對後操作'});continue;}
   if(!['SCAN','IQC_RESULT','VOID','RESTORE','SETTINGS'].includes(original.type))fail('有未知待傳操作');
   const c=D.correctedCommand(doc,original);c.id=id('op');c.base=doc.revision;c.identityVersion=doc.identityCorrections.length;
   if(c.data.scanId)c.data.scanId=mapping[c.data.scanId]||c.data.scanId;
   if(c.data.voidId)c.data.voidId=mapping[c.data.voidId]||c.data.voidId;
   if(c.type==='IQC_RESULT'&&c.data.ctn!==D.norm(original.data.ctn)){
    held.push({command:D.clone(original),reason:'舊 CTN 的查詢已由已核准的新 IQC 來源取代'});continue;
   }
   try{doc=D.run(doc,c,{actor:root.actor});next.push(c);mapping[original.id]=c.id;}
   catch(e){held.push({command:D.clone(original),reason:String(e.message||e)});}
  }
  const audit={at,batchId:packet.batchId,number:doc.number,packet:D.clone(packet),originalPending:D.clone(pending),beforeDoc:D.clone(root.docs[packet.batchId]),rejection:D.clone(reply.rejection),operationMapping:mapping,held};
  root.correctionReviews=root.correctionReviews||[];root.correctionReviews.push(audit);
  root.pending=root.pending.filter(c=>c.batchId!==packet.batchId).concat(next);root.docs[packet.batchId]=doc;
  if(reply.doc.receipt)root.receipts[packet.batchId]=D.clone(reply.doc.receipt);
  root.inflight=null;root.blocked='';root.lastError=false;root.syncFailure=null;
  root.lastMessage='已讀回更正後清單；'+next.length+' 筆接續同步，'+held.length+' 筆保留於「更正後待核對操作」。';
  return audit;
 }
 g.OqcCorrectionQueue={PATCH,problem,reconcile};
})(typeof globalThis!=='undefined'?globalThis:this);

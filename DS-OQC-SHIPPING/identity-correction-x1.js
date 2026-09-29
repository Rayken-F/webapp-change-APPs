/* IQC-authorized identity corrections; source receipts and completed work remain immutable. */
(function(g){
 'use strict';
 const D=g.OqcDomain,previous=D.run;
 function resolve(doc,value){let n=D.norm(value),seen=new Set();while(doc?.ctnAliases?.[n]){if(seen.has(n))D.fail('CORRECTION_CYCLE','CTN 更正對照循環');seen.add(n);n=doc.ctnAliases[n];}return n;}
 function mapped(doc,cmd){const c=D.clone(cmd),p=c.data||{};if(p.ctn)p.ctn=resolve(doc,p.ctn);if(Array.isArray(p.items))p.items.forEach(i=>{if(i.ctn)i.ctn=resolve(doc,i.ctn);});return c;}
 D.correctedCommand=mapped;
 D.run=function(input,cmd,ctx){
  if(input?.applied?.[cmd.id]){if(input.applied[cmd.id]!==D.canonical(cmd))D.fail('IDEMPOTENCY_CONFLICT','同一操作編號的內容不同');return D.clone(input);}
  if(cmd.type==='IQC_CORRECTION'){
   if(!ctx?.iqcCorrection || !input || cmd.base!==input.revision)D.fail('CORRECTION_NOT_AUTHORIZED','缺少已核准的 IQC 更正');
   const p=cmd.data||{},old=D.norm(p.oldCtn),next=D.norm(p.newCtn),doc=D.clone(input);
   if(!D.ctnPattern.test(old)||!D.ctnPattern.test(next)||!p.requestId)D.fail('INVALID_CORRECTION','更正內容不完整');
   if(old!==next&&doc.items.some(i=>i.ctn===next))D.fail('DUPLICATE_CTN','更正後 CTN 已在此批次');
   const item=doc.items.find(i=>i.ctn===old);if(!item)D.fail('CORRECTION_SOURCE_MISSING','批次找不到原 CTN');
   item.identityHistory=item.identityHistory||[];
   item.identityHistory.push({requestId:p.requestId,oldCtn:old,newCtn:next,oldSource:D.clone(item.iqcSource||item.iqc),at:ctx.time});
   if(doc.packingStatus==='PACKED'&&doc.receipt&&!item.packingIdentity)item.packingIdentity={ctn:old,kind:D.kind(item),sourceRt:D.source(item).rt,effectiveRt:item.rt};
   item.originalCtn=item.originalCtn||old;item.ctn=next;
   if(p.iqc?.state==='FOUND'){
    item.iqc=D.clone(p.iqc);item.iqcSource=D.clone(p.iqc);
    // A deliberately changed OQC RT continues to belong to OQC.
    if(!item.rtChanges?.length){item.rt=p.iqc.rt;if(p.iqc.rtMaster)item.rtMaster=D.clone(p.iqc.rtMaster);}
   }
   doc.ctnAliases=doc.ctnAliases||{};if(old!==next)doc.ctnAliases[old]=next;
   doc.identityCorrections=doc.identityCorrections||[];doc.identityCorrections.push({requestId:p.requestId,at:ctx.time,revision:doc.revision});
   doc.revision++;doc.applied[cmd.id]=D.canonical(cmd);doc.history.push({id:cmd.id,type:cmd.type,at:ctx.time,by:ctx.actor,requestId:p.requestId,oldCtn:old,newCtn:next});
   return doc;
  }
  if(!input?.identityCorrections?.length)return previous(input,cmd,ctx);
  const c=mapped(input,cmd),offset=input.identityCorrections.length-Number(cmd.identityVersion||0);
  if(Number(c.base)!==input.revision){
   if(Number(c.base)+offset!==input.revision)D.fail('REVISION_CONFLICT','批次已更新，請核對原待傳資料');
   if(['CLOSE','REMOVE_BATCH','RT_CHANGE','RT_META'].includes(c.type))D.fail('CORRECTION_REVIEW_REQUIRED','IQC 已更正此批次；請重新核對待傳修改或完成摘要。原待傳資料保留。');
   c.base=input.revision;
  }
  let doc;
  if(c.type==='IQC_RESULT'&&D.norm(cmd.data?.ctn)!==c.data.ctn){
   // A lookup made under the old identity cannot overwrite the corrected source snapshot.
   doc=D.clone(input);doc.revision++;doc.history.push({id:cmd.id,type:'STALE_IQC_LOOKUP_ACK',at:ctx?.time||cmd.at,by:ctx?.actor||''});
  }else doc=previous(input,c,ctx);
  doc.applied[cmd.id]=D.canonical(cmd);return doc;
 };
 D.identityCorrectionPatch='IQC-X1-20260928';
})(typeof globalThis!=='undefined'?globalThis:this);

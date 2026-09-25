(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./iqc-ocr-review-model-rc31.js'));
  else root.IqcSubmitModel31=factory(root.IqcReviewModel31);
})(typeof window!=='undefined'?window:this,function(review){
  'use strict';
  const protocol='IQC_IMAGE_V1',environment='IQC_IMAGE_TEST_20260925';
  function draft(snapshot,legacy={}){
    if(!snapshot.batch||snapshot.batch.status!=='DRAFT')throw Error('此批次已送出或待確認，請查收據／重試。');
    if(!snapshot.photos.length)throw Error('此為空批次，已排除，不建立待傳資料。');
    if(!snapshot.batch.regionCode)throw Error('請先選擇區域。');
    for(const p of snapshot.photos){
      if(!review.candidates(p).length)throw Error(`第 ${p.seq} 張尚無 CTN，請辨識、補登或移除不需要的照片。`);
      if(!['RECOGNIZED','NEEDS_REVIEW'].includes(p.status))throw Error(`第 ${p.seq} 張處理未完成，請先辨識完成。`);
    }
    const groups=review.build(snapshot.photos,review.legacyDecisions(snapshot.photos,legacy));
    const byCtn=new Map(),warnings=[];
    for(const g of groups){
      for(const row of g.rows){
        if(!/^[A-Z]{2}\d{2}[A-Z]{2}[A-Z0-9]$/.test(row.ctn))throw Error('請核對 CTN 格式：'+row.ctn);
        if(!/^\d{5,8}$/.test(row.rt||'')||!row.status||row.status.length>50||row.groupAmbiguous||row.ambiguous&&!row.manual)throw Error(`${row.ctn} 的 RT／狀態或歸屬尚未完成，請手動歸類。`);
        const item={ctn:row.ctn,rtNo:row.rt,cylinderStatus:row.status,plant:row.plant||''},old=byCtn.get(row.ctn);
        if(old&&JSON.stringify(old)!==JSON.stringify(item))throw Error(`${row.ctn} 在來源照片有不同 RT／狀態／廠區，請先核對全部歸屬。`);
        byCtn.set(row.ctn,item);
      }
      if(!g.expected||g.expected!==g.ctns.length)warnings.push(`RT ${g.rt}：去重後 ${g.ctns.length} 支，照片參考總量 ${g.expected||'未知'}，請確認實際數量。`);
      warnings.push(...g.warnings);
    }
    const items=[...byCtn.values()].sort((a,b)=>a.ctn.localeCompare(b.ctn));
    if(!items.length||items.length>500)throw Error('每批需有 1～500 筆已核對 CTN。');
    return {items,warnings:[...new Set(warnings)],duplicateCount:groups.reduce((n,g)=>n+g.rows.length,0)-items.length};
  }
  function payload(snapshot,draft,submissionId){return {protocol,environment,submissionId,batchId:snapshot.batch.id,regionCode:String(snapshot.batch.regionCode).trim().toUpperCase(),reviewed:true,items:draft.items};}
  function receipt(data,record){
    const r=data?.receipt;
    return !!(data?.ok===true&&!data.pending&&data.protocol===protocol&&data.environment===environment&&r?.environment===environment&&r.submissionId===record.submissionId&&r.payloadHash===record.payloadHash&&r.account===record.account&&r.station==='IQC'&&r.sheetName==='IQC_Log'&&r.receiptId&&r.writtenAt&&Number.isInteger(r.startRow)&&r.startRow>=2&&r.endRow===r.startRow+r.rowCount-1&&r.rowCount===record.payload.items.length);
  }
  return {protocol,environment,draft,payload,receipt};
});

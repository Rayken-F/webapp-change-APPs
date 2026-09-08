/* OQC shipping DEMO V0.2.0. Pure command reducer shared by browser and RC backend. */
(function(g){
  'use strict';
  const VERSION='OQC_SHIPPING_DEMO_V02_20260909';
  const clone=x=>JSON.parse(JSON.stringify(x));
  const norm=x=>String(x==null?'':x).trim().toUpperCase();
  const ctnPattern=/^[A-Z]{2}\d{2}[A-Z]{2}[A-Z0-9]$/;
  const rtPattern=/^\d{5,10}$/;
  const fail=(code,message)=>{const e=new Error(message);e.code=code;throw e;};
  function canonical(x){
    if(Array.isArray(x)) return '['+x.map(canonical).join(',')+']';
    if(x&&typeof x==='object') return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
    return JSON.stringify(x);
  }
  function active(doc){return (doc&&doc.items||[]).filter(i=>!i.voided);}
  // Compact non-secret UI snapshot checksum. Revision checks and server SHA-256
  // idempotency hashes remain authoritative; this is not an authentication primitive.
  function fingerprint(value){
    const s=canonical(value);let a=2166136261,b=2246822507;
    for(let n=0;n<s.length;n++){a=Math.imul(a^s.charCodeAt(n),16777619);b=Math.imul(b^s.charCodeAt(n),3266489909);}
    return 'view-'+(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
  }
  function signature(doc){
    return fingerprint({ref:doc.shippingRef,target:doc.targetQty,items:active(doc).map(i=>({ctn:i.ctn,rt:i.rt,iqc:i.iqc.state,status:i.iqc.status,changes:i.rtChanges.map(c=>[c.oldRt,c.newRt,c.operationId])})).sort((a,b)=>a.ctn.localeCompare(b.ctn))});
  }
  function summary(doc){
    const items=active(doc);
    return {total:items.length,found:items.filter(i=>i.iqc.state==='FOUND').length,
      missing:items.filter(i=>i.iqc.state==='NOT_FOUND').length,
      pending:items.filter(i=>['PENDING','ERROR'].includes(i.iqc.state)).length,
      conflicts:items.filter(i=>['CONFLICT','NON_CYLINDER'].includes(i.iqc.state)).length,
      voided:(doc&&doc.items||[]).filter(i=>i.voided).length};
  }
  function groups(doc){
    const map=new Map();
    active(doc).forEach(i=>{
      const key=i.iqc.state==='FOUND'?'RT '+i.rt:i.iqc.state==='NOT_FOUND'?'未建IQC':'待確認';
      if(!map.has(key))map.set(key,[]);
      map.get(key).push(i);
    });
    return Array.from(map.entries()).map(([title,items])=>({title,items}));
  }
  function text(value,max,name){
    const s=String(value==null?'':value).trim();
    if(s.length>max)fail('FIELD_TOO_LONG',name+'過長');return s;
  }
  function run(input,command,context){
    const cmd=clone(command),ctx=context||{},p=cmd.data||{},when=ctx.time||cmd.at,actor=ctx.actor||'DEMO';
    if(!/^op_[a-z0-9_-]{8,100}$/i.test(cmd.id||'')||!/^b_[a-z0-9_-]{8,100}$/i.test(cmd.batchId||''))fail('INVALID_ID','操作編號不正確');
    if(!when||!Number.isFinite(Date.parse(when)))fail('INVALID_TIME','操作時間不正確');
    let doc=input?clone(input):null;
    if(doc&&doc.applied[cmd.id]){
      if(doc.applied[cmd.id]!==canonical(cmd))fail('IDEMPOTENCY_CONFLICT','同一操作編號的內容不同');
      return doc;
    }
    if(Number(cmd.base)!==Number(doc?doc.revision:0))fail('REVISION_CONFLICT','資料已在其他裝置更新；請先更新並檢查待送資料');
    if(cmd.type==='CREATE'){
      if(doc)fail('EXISTS','此批次已存在');
      doc={id:cmd.batchId,number:ctx.number||p.number||'',revision:0,phase:'OPEN',shippingRef:'',note:'',targetQty:null,
        createdAt:when,createdBy:actor,items:[],applied:{},history:[],receipt:null};
    }else{
      if(!doc)fail('NOT_FOUND','批次不存在');
      if(doc.phase!=='OPEN')fail('CLOSED','已完成的批次不能直接修改');
      switch(cmd.type){
        case 'SCAN':{
          const ctn=norm(p.ctn);
          if(!ctnPattern.test(ctn))fail('INVALID_CTN','CTN 格式錯誤，本次未收錄');
          let item=doc.items.find(i=>i.ctn===ctn);
          if(item&&!item.voided)fail('DUPLICATE_CTN','CTN 已在本批次，不重複計數');
          if(item){item.voided=false;item.voidId='';item.scannedAt=when;item.capturedAt=cmd.at;item.scanId=cmd.id;}
          else{
            if(doc.items.length>=500)fail('BATCH_LIMIT','DEMO 每批最多 500 支');
            item={ctn,scanId:cmd.id,scannedAt:when,capturedAt:cmd.at,scannedBy:actor,voided:false,voidId:'',rt:'',rtChanges:[],
              iqc:{state:'PENDING',rt:'',status:'',checkedAt:'',message:''}};
            doc.items.push(item);
          }break;
        }
        case 'IQC_RESULT':{
          const item=doc.items.find(i=>i.ctn===norm(p.ctn));
          if(!item||item.voided||item.scanId!==p.scanId)fail('STALE_LOOKUP','查詢對象已變更，不套用舊回應');
          const info=p.result||{};
          if(!['FOUND','NOT_FOUND','ERROR','CONFLICT','NON_CYLINDER'].includes(info.state))fail('INVALID_LOOKUP','查詢結果不完整');
          if(info.state==='FOUND'&&!rtPattern.test(String(info.rt||'')))fail('INVALID_LOOKUP','IQC 回應的 RT 不正確');
          // Once a source snapshot is accepted, neither retries nor OQC edits rewrite it.
          if(item.iqc.state==='FOUND')break;
          item.iqc={state:info.state,rt:info.state==='FOUND'?String(info.rt):'',status:info.state==='FOUND'?text(info.status,50,'狀態').toUpperCase():'',
            checkedAt:info.checkedAt||when,message:text(info.message,200,'訊息')};
          if(!item.rtChanges.length)item.rt=item.iqc.rt;
          break;
        }
        case 'RT_CHANGE':{
          const next=text(p.rt,10,'RT');
          if(!rtPattern.test(next))fail('INVALID_RT','RT 必須是 5～10 碼數字');
          if(!Array.isArray(p.items)||!p.items.length||p.items.length>500)fail('EMPTY_SELECTION','請先勾選鋼瓶');
          const unique=new Set();
          p.items.forEach(sel=>{
            const item=doc.items.find(i=>i.ctn===norm(sel.ctn));
            if(unique.has(sel.ctn))fail('DUPLICATE_SELECTION','選取重複');unique.add(sel.ctn);
            if(!item||item.voided||item.iqc.state!=='FOUND'||item.rt!==String(sel.fromRt))fail('STALE_SELECTION','選取的鋼瓶或 RT 已變更');
            if(item.rt!==next){item.rtChanges.push({oldRt:item.rt,newRt:next,at:when,by:actor,operationId:cmd.id});item.rt=next;}
          });break;
        }
        case 'VOID':{
          const item=doc.items.find(i=>i.ctn===norm(p.ctn));
          if(!item||item.voided||item.scanId!==p.scanId)fail('STALE_SELECTION','鋼瓶資料已變更');
          item.voided=true;item.voidId=cmd.id;break;
        }
        case 'RESTORE':{
          const item=doc.items.find(i=>i.ctn===norm(p.ctn));
          if(!item||!item.voided||item.voidId!==p.voidId)fail('STALE_SELECTION','作廢紀錄已變更，不能套用舊復原');
          item.voided=false;item.voidId='';break;
        }
        case 'SETTINGS':{
          doc.shippingRef=text(p.shippingRef,80,'裝框／出貨識別');doc.note=text(p.note,120,'備註');
          const n=p.targetQty===''||p.targetQty==null?null:Number(p.targetQty);
          if(n!==null&&(!Number.isInteger(n)||n<1||n>9999))fail('INVALID_QUANTITY','標籤總量必須是 1～9999');
          doc.targetQty=n;break;
        }
        case 'CLOSE':{
          const s=summary(doc);
          if(!doc.shippingRef)fail('SHIPPING_REF_REQUIRED','請先填寫裝框／出貨識別');
          if(!s.total)fail('EMPTY_BATCH','空批次不能送出');
          if(s.conflicts)fail('UNRESOLVED_CONFLICT','有資料衝突或非鋼瓶項目，請確認後先作廢誤掃');
          if(p.signature!==signature(doc))fail('STALE_CLOSE','清單已變更，請重新確認完成摘要');
          if((s.pending||s.missing||doc.targetQty&&doc.targetQty!==s.total)&&p.acknowledge!==true)fail('CONFIRM_REQUIRED','請確認缺 IQC／待查項目與數量差異');
          doc.phase='CLOSED';doc.closedAt=when;doc.closedBy=actor;
          doc.receipt={id:(ctx.simulated?'SIM-':'OQC-DEMO-')+doc.number+'-'+cmd.id.slice(-8),operationId:cmd.id,
            environment:ctx.simulated?'LOCAL_SIMULATION':VERSION,batchId:doc.id,number:doc.number,shippingRef:doc.shippingRef,
            total:s.total,missing:s.missing,pending:s.pending,at:when,actor,notQualityRelease:true};break;
        }
        default:fail('UNKNOWN_ACTION','不支援的操作');
      }
    }
    doc.revision++;
    doc.applied[cmd.id]=canonical(cmd);
    doc.history.push({id:cmd.id,type:cmd.type,at:when,by:actor});
    return doc;
  }
  function resolveIqc(response,rawCtn){
    const ctn=norm(rawCtn),r=response&&response.result,iqc=r&&r.iqc;
    if(!response||response.ok!==true||!r||norm(r.normalizedQuery||r.query)!==ctn||r.queryType!=='CTN'||
       !iqc||!['bottleRows','transportCards','bundleCards','submissionRows'].every(k=>Array.isArray(iqc[k])))fail('INVALID_RESPONSE','IQC 回應不完整，不能判為未建IQC');
    const rows=[...iqc.bottleRows,...iqc.submissionRows];
    iqc.transportCards.forEach(c=>rows.push(...(c.rows||[])));
    const found=rows.filter(x=>norm(x.ctn)===ctn);
    if(!found.length){
      const bundle=iqc.bundleCards.some(c=>norm(c.ctn||c.bundleCtn)===ctn||(c.rows||[]).some(x=>norm(x.ctn)===ctn));
      const frame=iqc.transportCards.some(c=>norm(c.transportFrameCtn)===ctn);
      return {state:bundle||frame?'NON_CYLINDER':'NOT_FOUND',rt:'',status:'',message:bundle||frame?'這是框架／集束 CTN，請確認誤掃':'',checkedAt:new Date().toISOString()};
    }
    const rts=Array.from(new Set(found.map(x=>String(x.rt||'').trim().replace(/^RT/i,''))));
    if(rts.length!==1||!rtPattern.test(rts[0]))return {state:'CONFLICT',rt:'',status:'',message:'IQC RT 資料衝突',checkedAt:new Date().toISOString()};
    const row=found.slice().sort((a,b)=>(Date.parse(b.date||b.createdAt)||0)-(Date.parse(a.date||a.createdAt)||0))[0];
    return {state:'FOUND',rt:rts[0],status:String(row.bottleStatus||row.status||'').trim().toUpperCase(),message:'',checkedAt:new Date().toISOString()};
  }
  const api={VERSION,clone,norm,ctnPattern,rtPattern,canonical,fail,run,active,summary,signature,groups,resolveIqc};
  g.OqcDomain=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

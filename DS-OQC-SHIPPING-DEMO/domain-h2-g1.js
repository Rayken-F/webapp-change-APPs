/* OQC stage 2: keep legacy replay intact; RT metadata is never an IQC write. */
(function(g){
'use strict';
const L=g.OqcDomain,RULE='0.2.3-H2',PATCH='20260915-rtlist-h2',fail=L.fail;
function parseRows(rows){
 if(!Array.isArray(rows)||!rows.length)fail('RT_MASTER_EMPTY','RT list 沒有資料');
 const map=Object.create(null);
 rows.forEach((row,n)=>[0,3].forEach(c=>{
  const rt=String(row[c]??'').trim();if(!/^\d+$/.test(rt))return;
  const description=String(row[c+1]??'').trim(),text=description.normalize('NFKC').toUpperCase();
  const assetType=c===0?'BUNDLE':'BOTTLE',section=c===0?'集束RT':'散支RT';
  const matches=Array.from(text.matchAll(/(?:^|[^A-Z0-9])(\d{1,4})\s*[X×]\s*\d+(?:\.\d+)?\s*S(?=$|[^A-Z0-9])/g));
  const qtys=Array.from(new Set(matches.map(m=>Number(m[1]))));
  const single=/(?:^|[^A-Z0-9])X\s*\d+(?:\.\d+)?[SA](?=$|[^A-Z0-9])/.test(text);
  const nonAsset=/\b(?:PALLET|TRANSPORT\s*FRAME)\b|運輸框|棧板/.test(text);
  const conflict=qtys.length>1||(assetType==='BOTTLE'&&qtys.length>0)||(assetType==='BUNDLE'&&single&&!qtys.length);
  const item={rt,description,assetType:nonAsset?'OTHER':assetType,section,source:'RT list',rowNumber:n+1,
   cylinderQty:nonAsset?null:assetType==='BOTTLE'?1:qtys.length===1&&qtys[0]>0?qtys[0]:null,
   state:conflict?'CONFLICT':'VALID'};
  if(map[rt]){
   const old=map[rt];
   if(old.assetType!==item.assetType||old.description!==item.description||old.cylinderQty!==item.cylinderQty||item.state!=='VALID')old.state='CONFLICT';
  }else map[rt]=item;
 }));
 if(!Object.keys(map).length)fail('RT_MASTER_EMPTY','RT list 找不到純數字料號');return map;
}
function validMeta(raw,rt){
 if(!raw||raw.source!=='RT list'||raw.state!=='VALID'||raw.rt!==String(rt)||!L.rtPattern.test(String(rt))||!['BOTTLE','BUNDLE'].includes(raw.assetType))fail('RT_MASTER_INVALID','料號尚未通過 RT list 驗證');
 const q=raw.cylinderQty;if(q!==null&&(!Number.isInteger(q)||q<1||q>9999))fail('RT_MASTER_INVALID','RT list 支數不正確');
 if(raw.assetType==='BOTTLE'&&q!==1)fail('RT_MASTER_INVALID','散支數量不正確');return L.clone(raw);
}
function meta(i){const m=i?.rtMaster;return m&&m.state==='VALID'&&m.rt===i.rt&&m.source==='RT list'?m:null;}
function kind(i){const k=L.kind(i);return ['BOTTLE','BUNDLE','TRANSPORT_FRAME'].includes(k)?k:meta(i)?.assetType||k;}
function quantity(i){
 const k=kind(i);if(k==='BOTTLE')return 1;if(k!=='BUNDLE')return null;
 const q=i.iqc.cylinderQty;if(Number.isInteger(q)&&q>0)return q;
 const m=meta(i);return m?.assetType==='BUNDLE'?m.cylinderQty:null;
}
function summary(d){
 const s=L.summary(d),a=L.active(d);s.bottles=a.filter(i=>kind(i)==='BOTTLE').length;s.bundles=a.filter(i=>kind(i)==='BUNDLE').length;
 s.unknownType=a.filter(i=>!['BOTTLE','BUNDLE'].includes(kind(i))).length;
 s.bundleQtyUnknown=a.filter(i=>kind(i)==='BUNDLE'&&quantity(i)===null).length;
 s.bundleCylinders=a.filter(i=>kind(i)==='BUNDLE').reduce((n,i)=>n+(quantity(i)||0),0);return s;
}
function countText(d){const s=summary(d);return s.bottles+' 支散支／'+s.bundles+' 組集束'+(s.unknownType?'／'+s.unknownType+' 件型態待確認':'');}
function signature(d){return L.canonical({legacy:L.signature(d),rtTypes:L.active(d).map(i=>[i.ctn,kind(i),quantity(i)]).sort((a,b)=>a[0].localeCompare(b[0]))});}
function validateType(i,m){const k=L.kind(i);if(['BOTTLE','BUNDLE'].includes(k)&&k!==m.assetType)fail('RT_TYPE_MISMATCH',i.ctn+' 的 IQC 型態與新 RT 的'+m.section+'不符');}
function run(input,cmd,ctx){
 if(cmd.ruleset!==RULE)return L.run(input,cmd,ctx);
 if(input?.applied?.[cmd.id]){if(input.applied[cmd.id]!==L.canonical(cmd))fail('IDEMPOTENCY_CONFLICT','同一操作編號內容不同');return L.clone(input);}
 const p=cmd.data||{},old=Object.assign({},cmd,{ruleset:L.RULE});let m=null;
 if(cmd.type==='RT_CHANGE'||cmd.type==='RT_META'){
  if(!input||input.phase!=='OPEN')fail('CLOSED','只有開放中的批次能修改');
  m=validMeta(p.rtMaster,p.rt);
  const items=cmd.type==='RT_META'?[{ctn:p.ctn,fromRt:p.rt}]:p.items;
  if(!Array.isArray(items)||!items.length)fail('EMPTY_SELECTION','請先選取項目');
  items.forEach(s=>{const i=input.items.find(i=>i.ctn===L.norm(s.ctn));if(!i||!L.canRt(i)||i.rt!==String(s.fromRt))fail('STALE_SELECTION','選取資料已改變');if(cmd.type==='RT_META'&&i.scanId!==p.scanId)fail('STALE_LOOKUP','查詢來源已改變');validateType(i,m);});
  old.type='RT_CHANGE';old.data=Object.assign({},p,{items});
 }else if(cmd.type==='CLOSE'){
  if(!input||p.signature!==signature(input))fail('STALE_CLOSE','清單已更新，請重新確認');
  old.data=Object.assign({},p,{signature:L.signature(input)});
 }
 const out=L.run(input,old,ctx);
 if(m){
  old.data.items.forEach(s=>{const i=out.items.find(i=>i.ctn===L.norm(s.ctn));i.rtMaster=L.clone(m);const change=i.rtChanges[i.rtChanges.length-1];if(cmd.type==='RT_CHANGE'&&change?.operationId===cmd.id)change.rtMaster=L.clone(m);});
 }else if(cmd.type==='IQC_RESULT'){
  const r=p.result||{},i=out.items.find(i=>i.ctn===L.norm(p.ctn));
  if(r.rtMaster?.state==='VALID'&&i&&i.iqc.state==='FOUND'&&r.rt===i.rt&&r.rtMaster.assetType===L.kind(i))i.rtMaster=validMeta(r.rtMaster,i.rt);
 }else if(cmd.type==='CLOSE'){
  const s=summary(input);Object.assign(out.receipt,{bottles:s.bottles,bundles:s.bundles,unknownType:s.unknownType,bundleCylinders:s.bundleCylinders,bundleQtyUnknown:s.bundleQtyUnknown});
 }
 out.applied[cmd.id]=L.canonical(cmd);if(out.history.length)out.history[out.history.length-1].type=cmd.type;return out;
}
g.OqcDomain=Object.assign({},L,{RULE,RT_PATCH:PATCH,parseRtRows:parseRows,validRtMeta:validMeta,validateRtType:validateType,rtMeta:meta,kind,quantity,summary,countText,signature,run,legacy023:L});
})(typeof globalThis!=='undefined'?globalThis:this);


/* OQC 0.2.3-H1: view-only history. No new backend commands or schema. */
(function(g){
'use strict';
const D=g.OqcDomain;
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function receipt(d,r){return r.receipts?.[d.id]||d.receipt||null;}
function archived(d,r){
 const x=receipt(d,r);
 return d.phase==='CLOSED'&&x?.packingStatus==='PACKED'&&x.batchId===d.id&&!!x.id&&!!x.operationId&&
  !(r.pending||[]).some(c=>c.batchId===d.id)&&r.inflight?.batchId!==d.id;
}
function working(r,pin=''){
 return Object.values(r.docs||{}).filter(d=>!archived(d,r)||d.id===pin)
  .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}
function preferred(r,pin=''){
 const a=working(r,pin);
 return a.some(d=>d.id===r.active)?r.active:(a.find(d=>d.phase==='OPEN')||a[0])?.id||'';
}
function date(value){return Number.isFinite(Date.parse(value))?new Date(Date.parse(value)+28800000).toISOString().slice(0,10):'';}
function stamp(value){return Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value)):'—';}
function filter(r,ymd='',search=''){
 const q=search.trim().toUpperCase();
 return Object.values(r.docs||{}).filter(d=>archived(d,r))
  .filter(d=>!ymd||date(receipt(d,r).at||d.closedAt)===ymd)
  .filter(d=>!q||[d.number,d.shippingRef,...(d.items||[]).map(i=>i.ctn)].some(v=>String(v||'').toUpperCase().includes(q)))
  .sort((a,b)=>String(receipt(b,r).at||b.closedAt||'').localeCompare(String(receipt(a,r).at||a.closedAt||'')));
}
function label(d,r){return d.phase==='OPEN'?'開放中':archived(d,r)?'已完成裝框':receipt(d,r)?.packingStatus==='PACKED'?'完成已確認／尚有待同步':receipt(d,r)&&!receipt(d,r).packingStatus?'舊版完成／需確認':'待確認收據';}
function item(i,n){
 const src=D.source(i),rt=String(i.rt||''),changed=!!rt&&(rt!==src.rt||(!src.rt&&i.rtChanges?.length));
 const line=rt?'<div class="rtline">'+(src.rt&&src.rt!==rt?'RT '+esc(src.rt)+' <span class="arrow">→</span> ':'')+'<span class="'+(changed?'newrt':'')+'">RT '+esc(rt)+'</span></div>':'';
 const flag=i.voided?'已作廢':i.iqc.state==='NOT_FOUND'?'未建IQC':i.iqc.state==='ERROR'||i.iqc.state==='PENDING'?'完成時待查':'已完成裝框';
 const type=D.kind(i)==='BUNDLE'?'<div class="type">集束 1 組'+(i.iqc.cylinderQty?'／'+esc(i.iqc.cylinderQty)+' 支':'／內含支數未確認')+'</div>':'';
 const changes=i.rtChanges||[];
 const trail=changes.map(x=>'<div class="subtext">'+esc(stamp(x.at))+'｜'+esc(x.by)+'｜'+esc(x.oldRt||'空白')+' → '+esc(x.newRt)+'</div>').join('');
 return '<div class="history-item"><div class="item"><span class="number">'+n+'</span><div class="mainline"><b class="ctn">'+esc(i.ctn)+'</b>'+(src.status?'<span class="status">狀態 '+esc(src.status)+'</span>':'')+'</div>'+line+type+'<span class="flag '+(flag==='未建IQC'?'danger':'')+'">'+flag+'</span></div>'+(trail?'<details><summary class="subtext">RT 轉換紀錄（'+changes.length+'）</summary>'+trail+'</details>':'')+'</div>';
}
function render(r){
 const host=document.getElementById('historyList');if(!host)return;
 const ymd=document.getElementById('historyDate').value,q=document.getElementById('historySearch').value;
 const docs=filter(r,ymd,q);
 // Preserve expanded details on unrelated background UI refreshes.
 const signature=JSON.stringify([ymd,q,docs.map(d=>[d.id,d.revision,receipt(d,r)])]);
 if(host.dataset.signature===signature)return;host.dataset.signature=signature;
 const open=new Set(Array.from(host.querySelectorAll('details[data-history][open]'),x=>x.dataset.history));
 document.getElementById('historyCount').textContent='已完成 '+docs.length+' 批｜日期以完成時間為準';
 host.innerHTML=docs.map(d=>{
  const x=receipt(d,r);
  return '<details class="panel" data-history="'+esc(d.id)+'" '+(open.has(d.id)?'open':'')+'><summary>'+esc(d.number)+'<span class="subtext">｜'+esc(date(x.at||d.closedAt))+'｜'+esc(x.total)+' 件</span></summary><div class="tools"><b>已完成裝框｜出貨狀態未確認</b><p class="subtext">裝框識別：'+esc(d.shippingRef||'—')+'<br>作業日期：'+esc(d.workDate||x.workDate||'—')+'<br>作業人員：'+esc(d.workers||x.workers||x.actor||'—')+'<br>完成時間：'+esc(stamp(x.at||d.closedAt))+'<br>收據：'+esc(x.id)+'<br>散支 '+esc(x.bottles??'—')+' 支／集束 '+esc(x.bundles??'—')+' 組'+(x.unknownType?'／型態待確認 '+esc(x.unknownType)+' 件':'')+'<br>備註：'+esc(d.note||'—')+'</p>'+(d.items||[]).map((i,n)=>item(i,n+1)).join('')+'</div></details>';
 }).join('')||'<div class="empty">這個範圍尚無已確認完成的装框紀錄。</div>';
}
g.OqcHistory={receipt,archived,working,preferred,filter,label,render};
})(window);

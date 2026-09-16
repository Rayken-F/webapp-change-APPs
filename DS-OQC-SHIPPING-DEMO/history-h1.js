/* OQC 0.2.3-H1: view-only history. No new backend commands or schema. */
(function(g){
'use strict';
const D=g.OqcDomain;
// H1-LAYOUT-R1-20260916: only the history filter controls, not data or API rules.
const LAYOUT_BUILD='H1-LAYOUT-R1-20260916';
function installFilterLayout(){
 const panel=document.getElementById('historyPanel');
 const input=document.getElementById('historyDate');
 const search=document.getElementById('historySearch');
 const field=input&&input.parentElement, row=field&&field.parentElement;
 if(!panel||!input||!search||!row||row.parentElement!==panel||search.parentElement!==row)return;
 row.classList.add('history-filter-fields');
 field.classList.add('history-date-field');
 panel.dataset.layoutBuild=LAYOUT_BUILD;
 if(!document.getElementById('oqcHistoryFilterLayoutR1')){
  const style=document.createElement('style');style.id='oqcHistoryFilterLayoutR1';
  style.textContent=`
#historyPanel > .history-filter-fields{
 display:grid;grid-template-columns:minmax(0,1fr);align-items:end;
 gap:10px;width:100%;min-width:0;max-width:100%;margin:0 0 10px;
}
#historyPanel > .history-filter-fields > *{
 min-width:0;max-width:100%;width:100%;box-sizing:border-box;
}
#historyPanel .history-date-field{
 display:block;margin:0;min-width:0;line-height:1.55;
}
#historyPanel #historyDate,#historyPanel #historySearch{
 display:block;box-sizing:border-box;width:100%;min-width:0;max-width:100%;
 height:46px;min-height:46px;margin:0;font-size:16px;
}
#historyPanel #historyDate{
 margin-top:5px;appearance:none;-webkit-appearance:none;
}
#historyPanel #historyDate::-webkit-date-and-time-value{
 min-width:0;text-align:left;
}
#historyPanel .history-layout-build{
 display:inline-block;margin-left:8px;font-size:11px;font-weight:400;
 color:var(--muted);vertical-align:middle;white-space:nowrap;
}
@media(min-width:641px){
 #historyPanel > .history-filter-fields{grid-template-columns:repeat(2,minmax(0,1fr));}
}`;
  document.head.appendChild(style);
 }
 const heading=panel.querySelector('h2');
 if(heading&&!document.getElementById('historyLayoutBuild')){
  const badge=document.createElement('span');badge.id='historyLayoutBuild';
  badge.className='history-layout-build';badge.textContent='排版 R1';badge.title=LAYOUT_BUILD;
  heading.appendChild(badge);
 }
}
installFilterLayout();

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
  return '<details class="panel" data-history="'+esc(d.id)+'" '+(open.has(d.id)?'open':'')+'><summary>'+esc(d.number)+'<span class="subtext">｜'+esc(date(x.at||d.closedAt))+'｜'+esc(x.total)+' 件</span></summary><div class="tools"><b>已完成裝框｜出貨狀態未確認</b><p class="subtext">裝框識別：'+esc(d.shippingRef||'—')+'<br>作業日期：'+esc(d.workDate||x.workDate||'—')+'<br>作業人員：'+esc(d.workers||x.workers||x.actor||'—')+'<br>完成時間：'+esc(x.at?stamp(x.at):stamp(d.closedAt))+'<br>收據：'+esc(x.id)+'<br>散支 '+esc(x.bottles??'—')+' 支／集束 '+esc(x.bundles??'—')+' 組'+(x.unknownType?'／型態待確認 '+esc(x.unknownType)+' 件':'')+'<br>備註：'+esc(d.note||'—')+'</p>'+(d.items||[]).map((i,n)=>item(i,n+1)).join('')+'</div></details>';
 }).join('')||'<div class="empty">這個範圍尚無已確認完成的装框紀錄。</div>';
}
g.OqcHistory={receipt,archived,working,preferred,filter,label,render};
})(window);
/* DAILY-D1-20260916: daily PACK setup and reminders, using the unchanged 0.2.3 commands. */
(function(g){
'use strict';
const BUILD='DAILY-D1-20260916',D=g.OqcDomain,S=g.OqcStore,H=g.OqcHistory;
const today=(ms=Date.now())=>new Date(ms+28800000).toISOString().slice(0,10);
function batchDay(d){
 const m=/^OQC-(\d{4})(\d{2})(\d{2})-\d{2}$/.exec(d.number||'');
 return m?m[1]+'-'+m[2]+'-'+m[3]:Number.isFinite(Date.parse(d.createdAt))?today(Date.parse(d.createdAt)):'';
}
function dailyDocs(r,date){return Object.values(r.docs||{}).filter(d=>batchDay(d)===date).sort((a,b)=>String(b.number).localeCompare(String(a.number)));}
function oldDocs(r,date){return H.working(r).filter(d=>batchDay(d)&&batchDay(d)<date).sort((a,b)=>String(a.number).localeCompare(String(b.number)));}
function reminderKey(r,date){return date+'|'+oldDocs(r,date).map(d=>d.id+':'+d.phase).join('|');}
// Called inside the existing IndexedDB read/write transaction. Refreshes and tabs
// in the same browser cannot each insert another daily first batch.
function ensureIn(r,date,at,id){
 if(r.dailyOpenedDate===date)return {created:false,id:r.active};
 if(r.dailyOpenedDate&&r.dailyOpenedDate>date)throw Error('裝置日期比上次作業日早，請先確認手機日期');
 let rows=dailyDocs(r,date),created=false,target=rows.find(d=>d.phase==='OPEN'&&d.id===r.active)||rows.find(d=>d.phase==='OPEN');
 if(!rows.length){
  const batchId=id('b'),cmd={id:id('op'),batchId,base:0,type:'CREATE',data:{number:'OQC-'+date.replace(/-/g,'')+'-01'},at,ruleset:D.RULE};
  r.docs[batchId]=D.run(null,cmd,{actor:r.actor,simulated:false});r.pending.push(cmd);target=r.docs[batchId];created=true;
 }
 // If today's batches are already completed, do not generate 02 on every reopen.
 if(target)r.active=target.id;
 r.dailyOpenedDate=date;
 return {created,id:target?.id||'',number:target?.number||''};
}
function install(){
 const T=g.OqcDemoTest,$=id=>document.getElementById(id),host=$('packOnly');
 if(!T||!S||!H||!host||$('oqcDailyD1'))return;
 const panel=document.createElement('section');panel.id='oqcDailyD1';panel.dataset.build=BUILD;
 panel.innerHTML='<div class="daily-title"><b id="dailyDateD1"></b><small>每日批次 D1</small></div><div id="dailyStateD1" class="subtext" aria-live="polite"></div><button id="dailyRetryD1" type="button" class="hidden">準備今日批次</button><details id="dailyOldD1" class="hidden"><summary id="dailyOldSummaryD1"></summary><p class="subtext">要先確認舊批次是否送出嗎？不會自動完成或刪除。</p><select id="dailyOldSelectD1" aria-label="待確認舊批次"></select><div class="daily-actions"><button id="dailyReviewD1" type="button">前往確認</button><button id="dailyLaterD1" type="button">稍後處理</button></div></details>';
 host.prepend(panel);
 const style=document.createElement('style');style.textContent='#oqcDailyD1{margin:8px 0 12px;padding:10px;border:1px solid var(--line);border-radius:12px;min-width:0}#oqcDailyD1 .daily-title{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:14px}#oqcDailyD1 small{font-size:10px;color:var(--muted);white-space:nowrap}#oqcDailyD1 select{display:block;width:100%;max-width:100%;min-width:0;margin:8px 0;font-size:14px}#oqcDailyD1 .daily-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}#oqcDailyD1 summary{font-size:13px;color:#ffd078}#oqcDailyD1 button{min-width:0}#dailyRetryD1{margin-bottom:8px}';
 document.head.appendChild(style);
 let busy=null,queued=0,retryAfter=0,problem='',lastRoot=null,lastKey='',lastDay='',paintSignature='';
 const pack=()=>$('packMode').classList.contains('active');
 const verified=()=>/後端已驗證/.test($('environment').textContent)||new URLSearchParams(location.search).get('mode')==='sim';
 const offline=()=>$('offline').checked;
 const editing=allowInput=>!!document.querySelector('dialog[open]')||!$('rtPanel').classList.contains('hidden')||(!allowInput&&!!$('scanInput').value.trim());
 const id=p=>p+'_'+(crypto.randomUUID?crypto.randomUUID().replace(/-/g,''):Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join(''));
 function paint(r){
  const date=today(),old=oldDocs(r,date),rows=dailyDocs(r,date),current=r.docs[r.active];
  const done=r.dailyOpenedDate===date,asOf=date.replace(/-/g,'/');
  $('dailyDateD1').textContent='今日 '+asOf;
  let msg=problem|| (busy?'正在確認今日批次，原資料保留…':!verified()?'登入並連接後，自動準備今日第一批。':offline()&&!done?'離線中：今日批次尚未確認，連線後接續。':!done?'今日批次待準備；正在輸入時不會強制切換。':current&&batchDay(current)<date?'目前查看舊批次；日期與資料維持原樣。':rows.some(d=>d.phase==='OPEN')?'今日批次已準備；重新整理不會另建一批。':'今日批次已使用或移除；需要再作業請按「＋新批次」。');
  if($('dailyStateD1').textContent!==msg)$('dailyStateD1').textContent=msg;
  $('dailyRetryD1').classList.toggle('hidden',done&&!problem);$('dailyRetryD1').disabled=!!busy||!verified()||offline();
  $('dailyOldD1').classList.toggle('hidden',!old.length);
  const key=reminderKey(r,date),signature=JSON.stringify([date,key,old.map(d=>[d.id,d.revision]),r.dailyReminderDismissed]);
  if(signature!==paintSignature){
   const selected=$('dailyOldSelectD1').value;paintSignature=signature;
   $('dailyOldSummaryD1').textContent='舊批次 '+old.length+' 批尚待處理';
   $('dailyOldSelectD1').replaceChildren(...old.map(d=>{
    const option=document.createElement('option');option.value=d.id;
    const n=D.active(d).length;option.textContent=d.number+'｜'+(d.phase==='OPEN'?(n?n+' 件未完成':'空批次，尚未掃描'):H.label(d,r));return option;
   }));
   if(old.some(d=>d.id===selected))$('dailyOldSelectD1').value=selected;
   $('dailyOldD1').open=r.dailyReminderDismissed!==key;
  }
  $('dailyReviewD1').disabled=!!busy;$('dailyLaterD1').disabled=!!busy;
 }
 async function check(force=false,allowInput=false){
  if(busy)return busy;
  if(!pack()||document.hidden)return false;
  const k=T.getKey(),date=today();
  busy=Promise.resolve().then(async()=>{
   let r=await T.getRoot();lastRoot=r;lastKey=k;lastDay=date;
   if(r.dailyOpenedDate===date){problem='';return true;}
   if(!verified()||offline()||editing(allowInput)||(!force&&Date.now()<retryAfter))return false;
   problem='';paint(r);
   if(!dailyDocs(r,date).length){
    // Reuse already-created server batches before creating locally. Do not overwrite
    // unsent operations; the existing sync/read guards remain in force.
    await T.sync();r=await T.getRoot();
    if(r.blocked||r.pending.length||r.inflight)throw Error('舊資料仍待同步，先按「同步／重試」；今日批次不會重複建立');
    if(!dailyDocs(r,date).length)await T.readRemote();
   }
   if(k!==T.getKey()||date!==today()||!pack()||editing(allowInput))return false;
   const result=await S.change(k,v=>ensureIn(v,date,new Date().toISOString(),id));
   await T.reload();lastRoot=await T.getRoot();retryAfter=0;
   // Only the original CREATE command is queued. This never sends CLOSE.
   if(result.created)T.sync().catch(e=>{problem='今日批次已保留，但尚待同步：'+e.message;request();});
   return true;
  }).catch(e=>{problem=e.message||String(e);retryAfter=Date.now()+60000;return false;});
  try{return await busy;}finally{busy=null;if(k===T.getKey()){lastRoot=await T.getRoot();paint(lastRoot);}}
 }
 function request(){clearTimeout(queued);queued=setTimeout(()=>check().catch(()=>{}),80);}
 $('dailyRetryD1').onclick=()=>check(true);
 $('dailyReviewD1').onclick=async()=>{
  if(busy)return;const r=await T.getRoot(),selected=$('dailyOldSelectD1').value;
  if(!oldDocs(r,today()).some(d=>d.id===selected))return request();
  const select=$('batchSelect');select.value=selected;
  if(select.value!==selected){await T.reload();select.value=selected;}
  select.dispatchEvent(new Event('change',{bubbles:true}));
  // Switch only. The operator must still review the existing completion dialog.
  $('batchSelect').scrollIntoView({block:'center',behavior:'smooth'});
 };
 $('dailyLaterD1').onclick=async()=>{await S.change(T.getKey(),r=>{r.dailyReminderDismissed=reminderKey(r,today());});lastRoot=await T.getRoot();paint(lastRoot);};
 // Wait for date preparation when the operator submits a scan across midnight.
 // Preserve their input; do not silently add it to yesterday's batch.
 $('scanForm').addEventListener('submit',event=>{
  if(!pack()||(lastKey===T.getKey()&&lastDay===today()&&lastRoot?.dailyOpenedDate===today()&&!busy))return;
  event.preventDefault();event.stopImmediatePropagation();const raw=$('scanInput').value;
  check(true,true).then(async ok=>{if(ok&&pack()&&$('scanInput').value===raw)await T.capture(raw);}).catch(e=>{problem=e.message;request();});
 },true);
 for(const node of [$('newBatch'),$('connect')])node.addEventListener('click',e=>{if(busy){e.preventDefault();e.stopImmediatePropagation();}},true);
 const observer=new MutationObserver(request);
 observer.observe($('environment'),{childList:true,characterData:true,subtree:true});
 observer.observe($('batchSelect'),{childList:true});
 observer.observe($('packMode'),{attributes:true,attributeFilter:['class']});
 observer.observe($('rtPanel'),{attributes:true,attributeFilter:['class']});
 for(const node of document.querySelectorAll('dialog'))node.addEventListener('close',request);
 $('scanInput').addEventListener('blur',request);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)request();});
 g.addEventListener('pageshow',request);g.addEventListener('online',request);
 const timer=setInterval(()=>{if(!document.hidden&&pack())request();},60000);
 g.OqcDailyBatchD1={BUILD,today,batchDay,dailyDocs,oldDocs,ensureIn,reminderKey,check,
  dispose:()=>{clearInterval(timer);clearTimeout(queued);observer.disconnect();}};
 request();
}
g.OqcDailyBatchLogicD1={today,batchDay,dailyDocs,oldDocs,ensureIn,reminderKey};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(window);

/* Load batch removal independently; existing IQC/daily/history contracts stay intact. */
(function(){const script=document.createElement('script');script.src=new URL('batch-removal-rm1.js?v=20260916-rm1',document.currentScript.src).href;document.head.appendChild(script);})();

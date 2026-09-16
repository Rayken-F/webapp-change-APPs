/* RM1: soft cancellation of OPEN batches; immutable audit, no IQC writes. */
(function(g){
'use strict';
const D=g.OqcDomain,previous=D.run,PATCH='RM1-20260916';
if(D.batchRemovalPatch===PATCH)return;
function confirmed(doc){return !!doc&&doc.phase==='REMOVED'&&doc.removal?.state==='CONFIRMED';}
function run(input,cmd,ctx){
 if(cmd.type!=='REMOVE_BATCH')return previous(input,cmd,ctx);
 const p=cmd.data||{},c=ctx||{},at=c.time||cmd.at;
 if(!/^op_[a-z0-9_-]{8,100}$/i.test(cmd.id||'')||!/^b_[a-z0-9_-]{8,100}$/i.test(cmd.batchId||''))D.fail('INVALID_ID','移除操作編號不正確');
 if(!input||input.id!==cmd.batchId)D.fail('BATCH_MISMATCH','批次不存在或已切換');
 const fp=D.canonical(cmd);
 if(input.applied?.[cmd.id]){if(input.applied[cmd.id]!==fp)D.fail('IDEMPOTENCY_CONFLICT','同一移除操作編號的內容不同');return D.clone(input);}
 if(input.phase!=='OPEN'||input.receipt||input.packingStatus==='PACKED')D.fail('REMOVE_NOT_OPEN','僅能移除未完成的批次；已完成裝框的收據保留於歷史');
 if(!Number.isInteger(cmd.base)||cmd.base!==input.revision)D.fail('REVISION_CONFLICT','批次已在其他裝置更新；移除未完成，請先核對最新資料');
 if(cmd.ruleset!=='0.2.3'||p.patch!==PATCH||p.confirmed!==true||p.number!==input.number||p.signature!==D.signature(input))D.fail('REMOVE_CONFIRMATION_CHANGED','移除確認資料已改變，請重新核對批次與件數');
 if(!Number.isFinite(Date.parse(at)))D.fail('INVALID_TIME','移除時間不正確');
 const reason=String(p.reason||'不再使用此批次').trim();
 if(!reason||reason.length>120)D.fail('INVALID_REASON','移除原因需為 1～120 字');
 const doc=D.clone(input),ctns=D.active(doc).map(i=>i.ctn);
 // Release only this cancelled batch's active CTNs. Keep each source and RT trail.
 doc.items.forEach(i=>{if(!i.voided){i.voided=true;i.voidId=cmd.id;}});
 doc.phase='REMOVED';doc.packingStatus='CANCELLED';doc.shippingStatus='UNCONFIRMED';
 doc.removal={state:c.authoritative===true?'CONFIRMED':'PENDING',operationId:cmd.id,
  at,by:String(c.actor||'DEMO'),reason,previousPhase:'OPEN',activeCount:ctns.length,ctns};
 doc.revision++;doc.applied[cmd.id]=fp;doc.history.push({id:cmd.id,type:cmd.type,at,by:doc.removal.by});
 return doc;
}
D.run=run;D.batchRemovalPatch=PATCH;
g.OqcBatchRemovalDomain={PATCH,confirmed};
})(typeof globalThis!=='undefined'?globalThis:this);

/* RM1-H2-UI-20260916-01: OPEN batches, two confirmations, same outbox. */
(function(g){
'use strict';
const D=g.OqcDomain,S=g.OqcStore,H=g.OqcHistory,R=g.OqcBatchRemovalDomain;
if(!D||!S||!H||!R)return;
const oldWorking=H.working,oldLabel=H.label,oldRender=H.render;
function confirmed(doc,root){return R.confirmed(doc)&&!(root.pending||[]).some(c=>c.batchId===doc.id)&&root.inflight?.batchId!==doc.id;}
H.working=(root,pin='')=>oldWorking(root,pin).filter(d=>!confirmed(d,root));
H.preferred=(root,pin='')=>{const rows=H.working(root,pin);return rows.some(d=>d.id===root.active)?root.active:(rows.find(d=>d.phase==='OPEN')||rows[0])?.id||'';};
H.label=(d,r)=>d.phase==='REMOVED'?'移除待確認（請同步／重試）':oldLabel(d,r);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let auditHost;
function audit(root){
 if(!auditHost)return;
 const docs=Object.values(root.docs||{}).filter(d=>confirmed(d,root)).sort((a,b)=>String(b.removal.at).localeCompare(String(a.removal.at)));
 const stamp=JSON.stringify(docs.map(d=>[d.id,d.revision]));if(auditHost.dataset.stamp===stamp)return;auditHost.dataset.stamp=stamp;
 auditHost.querySelector('summary').textContent='已移除批次（'+docs.length+'）';
 auditHost.querySelector('.removed-entries').innerHTML=docs.map(d=>'<details class="removed-entry"><summary>'+esc(d.number)+'</summary><p class="subtext">已移除；不計入已完成裝框。<br>移除時間：'+esc(new Date(d.removal.at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}))+'<br>人員：'+esc(d.removal.by)+'<br>原因：'+esc(d.removal.reason)+'<br>原有效件數：'+d.removal.activeCount+'<br>CTN：'+esc(d.removal.ctns.join('、')||'空批次')+'</p>'+(d.items||[]).filter(i=>i.rtChanges?.length).map(i=>'<p class="subtext">'+esc(i.ctn)+' RT 歷程：'+i.rtChanges.map(x=>esc(x.oldRt||'空白')+' → '+esc(x.newRt)).join('；')+'</p>').join('')+'</details>').join('')||'<p class="subtext">尚無移除紀錄。</p>';
}
H.render=root=>{oldRender(root);audit(root);};
function install(){
 const T=g.OqcDemoTest,$=id=>document.getElementById(id);
 if(!T||!$('packOnly')||$('removeBatchRM1'))return;
 const actions=document.createElement('div');actions.className='batch-removal-actions';
 actions.innerHTML='<button id="removeBatchRM1" type="button">移除目前批次</button><small>批次管理 RM1</small>';
 const batchMeta=$('batchMeta');
 if(batchMeta&&batchMeta.parentElement===$('packOnly'))batchMeta.insertAdjacentElement('afterend',actions);
 else $('packOnly').appendChild(actions);
 auditHost=document.createElement('details');auditHost.id='removedBatchesRM1';
 auditHost.innerHTML='<summary>已移除批次（0）</summary><div class="removed-entries"></div>';
 $('historyPanel').appendChild(auditHost);
 const dialog=document.createElement('dialog');dialog.id='removeBatchDialogRM1';
 dialog.innerHTML='<h2 id="removeTitleRM1">移除批次</h2><div id="removeSummaryRM1"></div><p id="removeHintRM1" class="subtext"></p><label id="removeReasonLabelRM1">移除原因（可留空）<input id="removeReasonRM1" maxlength="120" placeholder="例如：誤按新增、不再使用"></label><div class="row"><button type="button" id="removeCancelRM1">取消</button><button type="button" id="removeConfirmRM1">繼續移除</button></div>';
 document.body.appendChild(dialog);
 const style=document.createElement('style');style.textContent='.batch-removal-actions{display:flex;align-items:center;gap:10px;margin:10px 0}.batch-removal-actions button{color:var(--red);font-size:13px}.batch-removal-actions small{color:var(--muted);font-size:10px}#removeBatchDialogRM1{overflow-wrap:anywhere}#removeSummaryRM1{font-size:15px;line-height:1.8}#removeConfirmRM1{border-color:var(--red);color:var(--red)}#removedBatchesRM1{margin-top:16px;border-top:1px solid var(--line);padding-top:12px}.removed-entry{margin-top:12px}.removed-entry summary{font-size:13px}';document.head.appendChild(style);
 let step=0,snapshot=null,busy=false,queued=0,capabilityKey='';
 const pack=()=>$('packMode').classList.contains('active');
 const report=message=>{$('syncState').textContent=message;$('syncState').classList.add('danger');};
 async function paint(){const r=await T.getRoot(),d=r.docs[r.active];$('removeBatchRM1').disabled=busy||!pack()||!d||d.phase!=='OPEN';audit(r);}
 function request(){clearTimeout(queued);queued=setTimeout(()=>paint().catch(()=>{}),40);}
 async function capability(){
  if(new URLSearchParams(location.search).get('mode')==='sim')return;
  let config={};try{config=JSON.parse(localStorage.getItem('oqc_stage1_config')||'{}');}catch(_){}
  const endpoint=String(config.endpoint||'');let hash=2166136261;for(const ch of endpoint)hash=Math.imul(hash^ch.charCodeAt(0),16777619);
  const k='client-rc-'+(hash>>>0).toString(16);
  if(k!==T.getKey()||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint))throw Error('請先連接原 OQC DEMO 後端');
  if(capabilityKey===k)return;
  const ctrl=new AbortController();let timer;
  try{
   const reply=await Promise.race([(async()=>{const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({api:'health',environment:D.VERSION,client_version:D.VERSION}),cache:'no-store',redirect:'follow',signal:ctrl.signal});if(!res.ok)throw Error('無法確認移除功能：HTTP '+res.status);return res.json();})(),new Promise((_,reject)=>{timer=setTimeout(()=>{ctrl.abort();reject(Error('移除功能驗證逾時，未移除任何批次'));},25000);})]);
   if(!reply.ok||reply.environment!==D.VERSION||reply.batchRemovalPatch!==R.PATCH||reply.rtMasterPatch!=='20260915-rtlist-h2')throw Error('請套用「現行H2合併RM1 完整覆蓋版」並更新原 DEMO 部署；目前未移除任何批次，不要改用不含 H2 的舊 RM1。');
   capabilityKey=k;
  }finally{clearTimeout(timer);}
 }
 function consent(){
  $('removeTitleRM1').textContent=step===2?'再次確認移除':'移除批次｜確認內容';
  $('removeSummaryRM1').textContent=snapshot.number+'\n有效 CTN：'+snapshot.count+' 件';
  $('removeSummaryRM1').style.whiteSpace='pre-line';
  $('removeHintRM1').textContent=step===2?'確定不再使用這個批次？確認後退出作業選單與舊批提醒；原 CTN、RT 歷程及移除紀錄保留。此操作不是完成裝框。':'請先核對批次。若有已掃描 CTN，整批取消後可在其他未完成批次重新收錄；IQC 不變。';
  $('removeReasonLabelRM1').classList.toggle('hidden',step===2);
  $('removeConfirmRM1').textContent=step===2?'確認移除':'繼續移除';
 }
 $('removeBatchRM1').onclick=async()=>{
  if(busy||!pack())return;
  const root=await T.getRoot(),d=root.docs[root.active];if(!d||d.phase!=='OPEN')return;
  snapshot={key:T.getKey(),id:d.id,number:d.number,revision:d.revision,count:D.active(d).length,signature:D.signature(d),reason:''};step=1;
  $('removeReasonRM1').value='';$('removeConfirmRM1').disabled=false;$('removeCancelRM1').disabled=false;consent();dialog.showModal();$('removeCancelRM1').focus();
 };
 $('removeCancelRM1').onclick=()=>{if(!busy){snapshot=null;step=0;dialog.close();}};
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();else{snapshot=null;step=0;}});
 $('removeConfirmRM1').onclick=async()=>{
  if(busy||!snapshot)return;
  if(step===1){snapshot.reason=$('removeReasonRM1').value.trim()||'不再使用此批次';step=2;consent();$('removeCancelRM1').focus();return;}
  const target={...snapshot};busy=true;$('removeConfirmRM1').disabled=true;$('removeCancelRM1').disabled=true;request();
  try{
   if($('offline').checked)throw Error('目前離線，尚未移除；請恢復網路後再確認');
   await capability();
   // Sync existing commands without discarding them; the normal backend reader
   // verifies DS Session and refuses to overwrite an unsent outbox.
   await T.sync();await T.readRemote();
   if(target.key!==T.getKey())throw Error('連線已切換，尚未移除');
   const r=await T.getRoot(),d=r.docs[target.id];
   if(r.blocked||r.pending.length||r.inflight)throw Error('仍有待同步操作，尚未移除；請先同步／重試');
   if(!d||d.phase!=='OPEN'||d.revision!==target.revision||d.number!==target.number||D.signature(d)!==target.signature)throw Error('批次資料已更新，尚未移除；請重新核對件數後再操作');
   await T.mutate('REMOVE_BATCH',{patch:R.PATCH,confirmed:true,number:d.number,signature:target.signature,reason:target.reason},target.id);
   dialog.close();snapshot=null;step=0;await T.sync();
   const after=await T.getRoot();
   if(confirmed(after.docs[target.id],after)){$('syncState').textContent=target.number+' 已移除；原紀錄可在「歷史紀錄 → 已移除批次」查看。';$('syncState').classList.remove('danger');}
   else report('移除請求已保存，等待後端確認。請按「同步／重試」，不要重建或重送另一筆。');
  }catch(e){
   const r=await T.getRoot();
   if(r.docs[target.id]?.phase==='REMOVED'){dialog.close();snapshot=null;step=0;report('移除结果待確認：'+e.message+'。原請求保留，請按「同步／重試」。');}
   else{$('removeHintRM1').textContent=e.message;report(e.message);}
  }finally{busy=false;$('removeConfirmRM1').disabled=false;$('removeCancelRM1').disabled=false;request();}
 };
 const observer=new MutationObserver(request);observer.observe($('batchSelect'),{childList:true});
 for(const node of [$('packMode'),$('historyMode')])observer.observe(node,{attributes:true,attributeFilter:['class']});
 // Daily initialization continues to see cancelled batches as that day's issued
 // numbers; therefore deleting today's only batch does not recreate 01 or 02.
 g.OqcBatchRemovalRM1={PATCH:R.PATCH,confirmed,paint};T.reload().then(paint).catch(e=>report(e.message));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(window);

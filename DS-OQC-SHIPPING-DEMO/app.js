/* First-stage DEMO only. Production menus, IQC writes and existing RC storage are untouched. */
(function(){
'use strict';
const D=window.OqcDomain,S=window.OqcStore,$=id=>document.getElementById(id);
const BUILD='20260910-recovery01',ENV=D.VERSION;
const cfg=JSON.parse(localStorage.getItem('oqc_stage1_config')||'{"mode":"SIM","endpoint":""}');
let key=environmentKey(),root=S.blank(),editRt=false,selected=new Set(),syncing=false,lookupRunning=0;
let timer,toastTimer,undoAction=null,closingSignature='',sessionReady=cfg.mode==='SIM';
const inLookup=new Set(),attempted=new Set();
// Recovery state is separate from saved CTNs, operation IDs and backend permissions.
let profilePromise=null,recoveryPromise=null,recoveryTimer=0,connecting=false;
let connectionIssue=null,lastCall={api:'',at:'',code:''};
const AUTH_CODES=new Set(['SESSION_REQUIRED','SESSION_EXPIRED','ACCOUNT_DISABLED','FORBIDDEN','UNAUTHORIZED','AUTH_REQUIRED','LOGIN_REQUIRED','INVALID_PROFILE','CLIENT_UPDATE_REQUIRED']);
const TRANSIENT_CODES=new Set(['TIMEOUT','NETWORK_ERROR','UPSTREAM_ERROR','UPSTREAM_INVALID','BUSY']);
function errorWith(code,message){const e=new Error(message);e.code=code;return e;}
function rememberIssue(e,apiName){
 connectionIssue={api:apiName||e.api||'profile',code:e.code||'CONNECTION_ERROR',message:String(e.message||e).slice(0,200),at:now()};
 if(AUTH_CODES.has(connectionIssue.code))sessionReady=false;
 render();
}
function connectionText(){
 if(offline())return '已暫停：模擬斷網／離線；CTN 已保存在本機，連線恢復後繼續。';
 if(profilePromise||connecting)return '正在驗證 DS 連線；既有 CTN 保留，驗證後自動續查／續傳。';
 if(cfg.mode==='RC'&&!sessionReady){
  const detail=connectionIssue?' ['+connectionIssue.code+'] '+connectionIssue.message:' DS 連線尚未驗證。';
  return '查詢與同步已暫停：'+detail+' 按「同步／重試」或「重試待查 IQC」恢復；不用重掃。';
 }
 return '';
}
async function verifySession(){
 if(cfg.mode==='SIM'){sessionReady=true;connectionIssue=null;return;}
 if(profilePromise)return profilePromise;
 if(sessionReady)return;
 const sourceKey=key,sourceEndpoint=cfg.endpoint;
 const work=Promise.resolve().then(async()=>{
  try{
   const profile=await api('profile');
   if(key!==sourceKey||cfg.endpoint!==sourceEndpoint)return;
   if(typeof profile.actor!=='string'||!profile.actor.trim())throw errorWith('INVALID_PROFILE','測試後端未回傳有效 DS 身分');
   await S.change(sourceKey,v=>{v.actor=profile.actor;v.lastVerified=now();});
   sessionReady=true;connectionIssue=null;await reload();
  }catch(e){if(key===sourceKey&&cfg.endpoint===sourceEndpoint){sessionReady=false;rememberIssue(e,'profile');}throw e;}
 });
 profilePromise=work;render();
 try{return await work;}finally{profilePromise=null;render();}
}
// Both retry controls and lifecycle recovery use the same single-flight verification.
// A transient profile failure gets one bounded retry, never an endless login loop.
async function resumeWork(retry=true,automaticRetries=0){
 if(recoveryPromise)return recoveryPromise;
 clearTimeout(recoveryTimer);
 if(offline()||connecting){render();return;}
 const sourceKey=key;
 const work=Promise.resolve().then(async()=>{
  try{
   await verifySession();
   if(key!==sourceKey)return;
   if(retry)attempted.clear();
   pumpLookup();
   await syncPending();
  }catch(e){
   showError(e);
   if(automaticRetries>0&&TRANSIENT_CODES.has(e.code)&&key===sourceKey&&!document.hidden){
    recoveryTimer=setTimeout(()=>resumeWork(true,automaticRetries-1),2500);
   }
  }
 });
 recoveryPromise=work;render();
 try{return await work;}finally{recoveryPromise=null;render();}
}
const escape=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=p=>p+'_'+(crypto.randomUUID?crypto.randomUUID().replace(/-/g,''):Date.now().toString(36)+Math.random().toString(36).slice(2));
const now=()=>new Date().toISOString();
const dateKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replace(/-/g,'');
const time=x=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(x));
// Browser online hints are not proof that an RC endpoint is unreachable.
const offline=()=>$('offline').checked||(cfg.mode==='SIM'&&navigator.onLine===false);
function hash(s){let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return (n>>>0).toString(16);}
function environmentKey(){return cfg.mode==='SIM'?'client-sim':'client-rc-'+hash(cfg.endpoint||'');}
function token(){
 try{
  let t=sessionStorage.getItem('ds_iqcc_session_v2')||localStorage.getItem('ds_iqcc_session_v2');
  if(!t){const v=JSON.parse(localStorage.getItem('ds_oqc_rc_fast_session_v1')||'null');if(v&&v.expiresAt>Date.now())t=v.token;}
  return t||'';
 }catch(_){return '';}
}
function toast(message,error=false){$('toast').textContent=message;$('toast').className=error?'danger':'';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),5000);}
async function reload(){root=await S.read(key);render();}
function current(){return root.docs[root.active]||null;}
function localNumber(value){const prefix='OQC-'+dateKey()+'-';const used=Object.values(value.docs).map(x=>x.number).filter(n=>n.startsWith(prefix)).map(n=>Number(n.slice(-2)));const next=Math.max(0,...used)+1;if(next>99)D.fail('LIMIT','DEMO 當日最多 99 批');return prefix+String(next).padStart(2,'0');}
async function newBatch(){
 const id=uid('b');
 await S.change(key,v=>{const cmd={id:uid('op'),batchId:id,base:0,type:'CREATE',data:{number:localNumber(v)},at:now()};v.docs[id]=D.run(null,cmd,{actor:v.actor,simulated:cfg.mode==='SIM'});v.pending.push(cmd);v.active=id;});
 editRt=false;selected.clear();await reload();scheduleSync();return id;
}
async function action(type,data,batchId){
 const id=batchId||root.active;let saved;
 await S.change(key,v=>{
  const doc=v.docs[id];if(!doc)D.fail('NOT_FOUND','請先建立批次');
  const cmd={id:uid('op'),batchId:id,base:doc.revision,type,data,at:now()};
  v.docs[id]=D.run(doc,cmd,{actor:v.actor,simulated:cfg.mode==='SIM'});v.pending.push(cmd);saved=cmd;
 });
 await reload();scheduleSync();return saved;
}
async function scan(raw){
 const ctn=D.norm(raw).replace(/\s+/g,'');
 if(!D.ctnPattern.test(ctn))throw new Error('CTN 格式錯誤，本次未收錄；不會截斷長條碼冒充有效 CTN');
 if(cfg.mode==='RC'&&!sessionReady&&!root.lastVerified)throw new Error('請先由 DS 工作台登入並驗證測試後端');
 if(!current())await newBatch();
 await action('SCAN',{ctn});
 $('scanInput').value='';
 toast(ctn+(cfg.mode==='RC'&&!sessionReady?' 已保存於本機；DS 連線待恢復，不用重掃':' 已保存於本機，RT 在背景查詢'));
 pumpLookup();
}
function scheduleSync(){clearTimeout(timer);timer=setTimeout(()=>syncPending().catch(showError),700);}
async function api(apiName,payload,auth=true){
 if(offline())throw errorWith('OFFLINE','目前離線；已保存的 CTN 留在待傳清單');
 if(cfg.mode==='SIM')return mockApi(apiName,payload||{});
 const sourceKey=key,sourceEndpoint=cfg.endpoint;
 const body=Object.assign({},payload||{},{api:apiName,environment:ENV,client_version:ENV});
 lastCall={api:apiName,at:now(),code:'RUNNING'};
 if(auth){body.session_token=token();if(!body.session_token){
  const e=errorWith('SESSION_REQUIRED','DS 登入已失效；本機掃描保留，請在同一瀏覽器回工作台登入');
  lastCall.code=e.code;rememberIssue(e,apiName);throw e;
 }}
 const ctrl=new AbortController();let t;
 try{
  // Race covers fetch and response body parsing; a late response cannot unlock a session.
  const request=(async()=>{
   const response=await fetch(sourceEndpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),cache:'no-store',redirect:'follow',signal:ctrl.signal});
   if(!response.ok)throw errorWith(response.status>=500?'UPSTREAM_ERROR':'HTTP_ERROR','測試後端 HTTP '+response.status);
   try{return await response.json();}catch(_){throw errorWith('INVALID_RESPONSE','測試後端未回傳 JSON；請確認 DEMO /exec 網址及部署設定');}
  })();
  const timeout=new Promise((_,reject)=>{t=setTimeout(()=>{reject(errorWith('TIMEOUT','測試後端回應逾時；原 CTN 與待傳操作保留，可重試'));ctrl.abort();},25000);});
  const data=await Promise.race([request,timeout]);
  if(!data||data.environment!==ENV)throw errorWith('ENVIRONMENT_GUARD','不是獨立 OQC DEMO 後端，已停止串接');
  if(data.ok!==true)throw errorWith(data.code||'API_ERROR',data.message||'後端拒絕操作');
  lastCall={api:apiName,at:now(),code:'OK'};
  return data;
 }catch(e){
  if(!e.code){e.code=e.name==='AbortError'?'TIMEOUT':'NETWORK_ERROR';e.message=e.code==='TIMEOUT'?'測試後端回應逾時；CTN 保留，請重試':'測試後端連線失敗；CTN 保留，請確認連線後重試';}
  e.api=apiName;lastCall={api:apiName,at:now(),code:e.code};
  if(key===sourceKey&&cfg.endpoint===sourceEndpoint&&AUTH_CODES.has(e.code)&&!(apiName==='iqc_lookup'&&e.code==='FORBIDDEN'))rememberIssue(e,apiName);
  throw e;
 }finally{clearTimeout(t);}
}
function fixture(ctn){
 const match=/^QA10(?:AA|AB)[A-Z0-9]$/.test(ctn);
 if(!match)return {state:'ERROR',rt:'',status:'',message:'模擬資料沒有此 CTN；不代表未建IQC',checkedAt:now()};
 if(ctn==='QA10AA2')return {state:'NOT_FOUND',rt:'',status:'',message:'',checkedAt:now()};
 return {state:'FOUND',rt:ctn==='QA10AA3'?'113407':'113399',status:ctn==='QA10AA3'?'VCYL':'OCYL',message:'',checkedAt:now()};
}
async function mockApi(name,p){
 await new Promise(r=>setTimeout(r,name==='iqc_lookup'?180:260));
 if(offline())throw new Error('模擬斷網：資料留在本機');
 if(name==='iqc_lookup')return {ok:true,environment:ENV,result:fixture(p.ctn)};
 if(name==='health'||name==='profile')return {ok:true,environment:ENV,actor:'DEMO測試人員'};
 return S.change('simulated-receiver',v=>{
  v.requests=v.requests||{};
  if(name==='batches')return {ok:true,environment:ENV,docs:Object.values(v.docs)};
  if(name==='receipt')return {ok:true,environment:ENV,receipt:v.docs[p.batchId]&&v.docs[p.batchId].receipt||null};
  if(name!=='batch_sync')throw new Error('不支援的 DEMO 操作');
  const fp=D.canonical(p);
  if(v.requests[p.requestId]){
    const prev=v.requests[p.requestId];if(prev.fingerprint!==fp)throw new Error('操作編號內容衝突');return D.clone(prev.response);
  }
  let doc=v.docs[p.batchId]||null;
  p.operations.forEach(cmd=>{const number=cmd.type==='CREATE'?localNumber(v):undefined;doc=D.run(doc,cmd,{actor:'DEMO測試人員',number,simulated:true,time:cmd.at});});
  v.docs[p.batchId]=doc;
  const result={ok:true,environment:ENV,doc,ackIds:p.operations.map(c=>c.id),requestId:p.requestId,simulated:true};
  v.requests[p.requestId]={fingerprint:fp,response:D.clone(result)};
  return result;
 });
}
async function syncPending(){
 if(syncing)return;
 if(offline()||(cfg.mode==='RC'&&!sessionReady)){render();return;}
 clearTimeout(timer);syncing=true;render();
 const sessionKey=key;
 try{
  for(let round=0;round<12;round++){
   const packet=await S.change(sessionKey,v=>{
    if(v.blocked)return null;
    if(v.inflight)return D.clone(v.inflight);
    if(!v.pending.length)return null;
    const batchId=v.pending[0].batchId;
    const operations=v.pending.filter(c=>c.batchId===batchId).slice(0,12);
    v.inflight={requestId:uid('req'),batchId,operations};return D.clone(v.inflight);
   });
   if(!packet)break;
   const reply=await api('batch_sync',packet);
   if(cfg.mode==='SIM'&&$('lostReply').checked){$('lostReply').checked=false;const e=new Error('模擬：接收端已寫入，但回應遺失。按「同步／重試」確認原收據，不會另建一筆');e.code='LOST_REPLY';throw e;}
   if(reply.requestId!==packet.requestId||!reply.doc||!Array.isArray(reply.ackIds)||packet.operations.some(c=>!reply.ackIds.includes(c.id)))throw new Error('收據不完整；本機待傳紀錄保留');
   await S.change(sessionKey,v=>{
    const ack=new Set(reply.ackIds);v.pending=v.pending.filter(c=>!ack.has(c.id));
    let latest=D.clone(reply.doc);
    for(const c of v.pending.filter(c=>c.batchId===packet.batchId))latest=D.run(latest,c,{actor:v.actor,simulated:cfg.mode==='SIM'});
    v.docs[packet.batchId]=latest;
    if(reply.doc.receipt)v.receipts[packet.batchId]=reply.doc.receipt;
    v.inflight=null;v.lastError=false;v.lastMessage=cfg.mode==='SIM'?'模擬接收完成（非後端入帳）':'已保存至獨立測試 Sheet';
   });
   await reload();
  }
 }catch(e){
  const conflicts=['REVISION_CONFLICT','IDEMPOTENCY_CONFLICT','STALE_SELECTION','CLOSED','STALE_CLOSE','DUPLICATE_CTN'];
  await S.change(sessionKey,v=>{v.lastMessage=e.message;v.lastError=true;if(conflicts.includes(e.code))v.blocked=e.message;});
  showError(e);
 }finally{syncing=false;await reload();if(root.pending.length&&!root.blocked&&!root.lastError)scheduleSync();}
}
async function fetchRemote(){
 if(syncing)throw new Error('同步中，請稍候');
 if(root.pending.length||root.inflight)throw new Error('仍有本機待傳操作，請先同步；遇到版本衝突時先匯出驗收紀錄，不會用舊資料覆蓋後端');
 const reply=await api('batches');
 await S.change(key,v=>{reply.docs.forEach(doc=>{v.docs[doc.id]=doc;if(doc.receipt)v.receipts[doc.id]=doc.receipt;});if(!v.active||!v.docs[v.active])v.active=reply.docs[0]&&reply.docs[0].id||'';});
 await reload();toast('已重新讀取'+(cfg.mode==='SIM'?'本機模擬接收端':'測試後端'));pumpLookup();
}
function pumpLookup(retry=false){
 if(retry)attempted.clear();
 if(offline()||(cfg.mode==='RC'&&!sessionReady)){render();return;}
 const tasks=[];
 Object.values(root.docs).filter(d=>d.phase==='OPEN').forEach(doc=>D.active(doc).forEach(item=>{
  const id=doc.id+':'+item.scanId;
  if(['PENDING','ERROR'].includes(item.iqc.state)&&!inLookup.has(id)&&!attempted.has(id))tasks.push({doc,item,id});
 }));
 while(lookupRunning<2&&tasks.length){
  const task=tasks.shift(),sourceKey=key;inLookup.add(task.id);attempted.add(task.id);lookupRunning++;render();
  (async()=>{
   let info;
   try{
    const reply=await api('iqc_lookup',{ctn:task.item.ctn});
    if(!reply.result||!['FOUND','NOT_FOUND','ERROR','CONFLICT','NON_CYLINDER'].includes(reply.result.state))throw errorWith('INVALID_RESPONSE','IQC 查詢回應不完整，不能判定未建IQC');
    info={result:reply.result,proof:reply.proof||''};
   }
   catch(e){info={result:{state:'ERROR',rt:'',status:'',checkedAt:now(),message:e.message},proof:''};}
   if(key!==sourceKey)return;
   const latest=await S.read(sourceKey),doc=latest.docs[task.doc.id],item=doc&&doc.items.find(i=>i.ctn===task.item.ctn);
   if(!doc||doc.phase!=='OPEN'||!item||item.voided||item.scanId!==task.item.scanId)return;
   await action('IQC_RESULT',{ctn:item.ctn,scanId:item.scanId,...info},doc.id);
  })().catch(showError).finally(()=>{inLookup.delete(task.id);lookupRunning--;render();pumpLookup();});
 }
}
function itemHtml(item,index){
 const changed=item.iqc.state==='FOUND'&&item.rt!==item.iqc.rt;
 const status=item.iqc.state==='FOUND'&&item.iqc.status?'<span class="status">狀態 '+escape(item.iqc.status)+'</span>':'';
 const line=item.iqc.state==='FOUND'?'<div class="rtline">RT '+escape(item.iqc.rt)+(changed?' <span class="arrow">→</span> <span class="newrt">RT '+escape(item.rt)+'</span>':'')+'</div>':'';
 const querying=inLookup.has(root.active+':'+item.scanId);
 const flag=item.iqc.state==='FOUND'?'OQC 待檢':item.iqc.state==='NOT_FOUND'?'未建IQC':item.iqc.state==='NON_CYLINDER'?'疑似誤掃':item.iqc.state==='CONFLICT'?'IQC衝突':querying?'RT查詢中':item.iqc.state==='ERROR'?'查詢失敗':(cfg.mode==='RC'&&!sessionReady||offline())?'等候連線':'等待 RT 查詢';
 const cls=item.iqc.state==='NOT_FOUND'||['NON_CYLINDER','CONFLICT'].includes(item.iqc.state)?'danger':item.iqc.state==='FOUND'?'':'warning';
 const pick=editRt&&item.iqc.state==='FOUND'?'<input class="pick" type="checkbox" aria-label="選取 '+escape(item.ctn)+'" data-pick="'+escape(item.ctn)+'" '+(selected.has(item.ctn)?'checked':'')+'>':'<span class="number">'+index+'</span>';
 return '<div class="swipe"><button class="delete" data-void="'+escape(item.ctn)+'" tabindex="-1" aria-hidden="true">作廢誤掃</button><div class="item" data-swipe="'+escape(item.ctn)+'">'+pick+'<div class="mainline"><span class="ctn">'+escape(item.ctn)+'</span>'+status+'</div>'+line+'<div class="flag '+cls+'">'+flag+'<small>'+escape(time(item.capturedAt||item.scannedAt))+'</small></div></div></div>';
}
function render(){
 const doc=current(),isOpen=doc&&doc.phase==='OPEN',info=D.summary(doc);
 const options=Object.values(root.docs).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 $('batchSelect').innerHTML=options.length?options.map(d=>'<option value="'+d.id+'">'+escape(d.number)+(d.phase==='CLOSED'?(root.receipts[d.id]?'｜已收錄完成':'｜待確認收據'):'｜開放中')+'</option>').join(''):'<option value="">尚無批次</option>';
 $('batchSelect').value=root.active;
 $('environment').textContent=cfg.mode==='SIM'?'本機模擬驗收｜模擬 IQC／模擬收據，不是後端或正式出貨紀錄':(sessionReady?'RC 實連｜僅使用獨立測試 Sheet，非正式出貨入帳':'RC 尚未驗證／離線｜本機保存不等於後端入帳');
 $('environment').classList.toggle('connected',cfg.mode==='RC'&&sessionReady);
 $('batchMeta').textContent=doc?(doc.shippingRef?'裝框／出貨：'+doc.shippingRef:'尚未填寫裝框／出貨識別')+(doc.targetQty?'｜標籤總量 '+doc.targetQty:'')+'｜'+(cfg.mode==='SIM'?'DEMO測試人員':root.actor):'先建立批次，或直接掃描第一支 CTN';
 $('total').textContent=info.total;$('missing').textContent=info.missing;$('pending').textContent=info.pending;$('outbox').textContent=root.pending.length;
 $('scanInput').disabled=!!doc&&!isOpen||cfg.mode==='RC'&&!sessionReady&&!root.lastVerified;
 $('scanBtn').disabled=$('scanInput').disabled;
 ['settingsBtn','rtBtn','closeBtn'].forEach(id=>$(id).disabled=!isOpen);
 $('syncBtn').disabled=syncing||!!profilePromise||connecting;
 $('retryIqc').disabled=!!profilePromise||connecting;
 $('connect').disabled=syncing||lookupRunning>0||!!profilePromise||!!recoveryPromise||connecting;
 $('simulation').disabled=syncing||lookupRunning>0||!!profilePromise||!!recoveryPromise||connecting;
 if(connecting){$('scanInput').disabled=true;$('scanBtn').disabled=true;}
 $('syncState').textContent=root.blocked?'同步已停止：'+root.blocked:syncing?'正在傳送測試接收端…':root.lastError?root.lastMessage+'｜待傳 '+root.pending.length+' 項':root.pending.length?'本機已保存；待傳 '+root.pending.length+' 項操作（尚非入帳收據）':root.lastMessage||'掃描後先保存 CTN，再背景查詢 RT';
 const gate=connectionText();
 if(gate)$('syncState').textContent=gate+' 待傳 '+root.pending.length+' 項。';
 else{
  const failed=D.active(doc).filter(i=>i.iqc.state==='ERROR');
  if(failed.length)$('syncState').textContent+='｜'+failed.length+' 支查詢失敗：'+String(failed[0].iqc.message||'請重試待查 IQC').slice(0,160);
 }
 $('syncState').classList.toggle('danger',!!root.blocked||!!root.lastError||!!connectionIssue);
 const pill=document.querySelector('.pill');if(pill)pill.textContent='DEMO V0.2.1';
 $('rtPanel').classList.toggle('hidden',!editRt||!isOpen);
 $('selectionCount').textContent='已選 '+selected.size+' 支';$('applyRt').disabled=!selected.size;
 $('rtBtn').textContent=editRt?'取消 RT 更改':'RT 更改';
 const grouped=D.groups(doc);let index=0;
 $('list').innerHTML=grouped.length?grouped.map(group=>'<section class="group"><div class="group-head"><strong>'+escape(group.title)+'</strong><small>'+group.items.length+' 支</small></div>'+group.items.map(i=>itemHtml(i,++index)).join('')+'</section>').join(''):'<div class="empty">尚未收錄鋼瓶。空的 RT 分組不顯示。</div>';
 const receipt=doc&&root.receipts[doc.id];
 $('receiptPanel').classList.toggle('hidden',!doc||doc.phase!=='CLOSED');
 $('receiptText').innerHTML=receipt?'<b>'+escape(receipt.id)+'</b><br>裝框／出貨：'+escape(receipt.shippingRef)+'<br>收錄 '+receipt.total+' 支｜未建IQC '+receipt.missing+' 支｜待查 '+receipt.pending+' 支<br>'+escape(receipt.at)+'<br><b class="warning">'+(receipt.environment==='LOCAL_SIMULATION'?'本機模擬收據，不是後端入帳':'DEMO 後端收據，不是正式出貨放行')+'</b>':'已封存本機待送版本，尚未取得接收端收據。請連線後同步或查詢原收據。';
 $('samples').disabled=cfg.mode!=='SIM';$('loadTest').disabled=cfg.mode!=='SIM';$('lostReply').disabled=cfg.mode!=='SIM';
 bindSwipes();
}
function bindSwipes(){
 if(editRt||!current()||current().phase!=='OPEN')return;
 document.querySelectorAll('[data-swipe]').forEach(el=>{
  let x=0,y=0,dx=0,tracking=false,horizontal=false;
  const reset=open=>{el.style.transform=open?'translateX(-88px)':'translateX(0)';const b=el.previousElementSibling;b.tabIndex=open?0:-1;b.setAttribute('aria-hidden',String(!open));};
  el.addEventListener('pointerdown',e=>{if(e.target.closest('input'))return;x=e.clientX;y=e.clientY;dx=0;tracking=true;horizontal=false;});
  el.addEventListener('pointermove',e=>{if(!tracking)return;dx=e.clientX-x;const dy=e.clientY-y;if(!horizontal&&Math.abs(dy)>Math.abs(dx)+6){tracking=false;reset(false);return;}if(Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)){horizontal=true;try{el.setPointerCapture(e.pointerId);}catch(_){}}if(horizontal)el.style.transform='translateX('+Math.max(-88,Math.min(0,dx))+'px)';});
  el.addEventListener('pointerup',()=>{if(tracking)reset(horizontal&&dx< -35);tracking=false;});
  el.addEventListener('pointercancel',()=>{tracking=false;reset(false);});
 });
}
function showError(e){toast(e&&e.message||String(e),true);}
function safe(fn){return (...args)=>Promise.resolve().then(()=>fn(...args)).catch(showError);}
async function connect(){
 if(syncing||lookupRunning||profilePromise||recoveryPromise||connecting)throw new Error('請先等目前連線作業完成');
 const endpoint=$('endpoint').value.trim();
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint))throw new Error('請填入獨立 Apps Script 的 /exec 網址');
 if(cfg.mode==='RC'&&endpoint===cfg.endpoint){sessionReady=false;await resumeWork(true);return;}
 if(cfg.mode==='RC'&&(root.pending.length||root.inflight))throw new Error('原 DEMO 後端還有待傳資料，請先恢復原連線；不移轉或刪除待傳 CTN');
 if(!confirm('確認這是你新建立的「OQC DEMO」後端？驗證通過後才傳送 DS Session；不修改原有後端。'))return;
 const old={...cfg},oldKey=key,oldReady=sessionReady;let verified=false;
 connecting=true;clearTimeout(recoveryTimer);cfg.mode='RC';cfg.endpoint=endpoint;render();
 try{
  await api('health',{},false);const profile=await api('profile');
  if(typeof profile.actor!=='string'||!profile.actor.trim())throw errorWith('INVALID_PROFILE','測試後端未回傳有效 DS 身分');
  key=environmentKey();localStorage.setItem('oqc_stage1_config',JSON.stringify(cfg));
  sessionReady=true;connectionIssue=null;verified=true;
  await S.change(key,v=>{v.actor=profile.actor;v.lastVerified=now();});await reload();
  // Reconnecting an existing endpoint with an outbox is valid. Do not roll back
  // authentication merely because fetchRemote deliberately rejects pending edits.
  if(!root.pending.length&&!root.inflight)await fetchRemote();
  toast('已接上獨立 DEMO 後端；將續查／續傳既有 CTN');
 }catch(e){
  if(!verified){Object.assign(cfg,old);key=oldKey;sessionReady=oldReady;}
  rememberIssue(e,e.api||'connect');showError(e);
 }finally{connecting=false;render();}
 if(verified)await resumeWork(true);
}
$('scanForm').addEventListener('submit',e=>{e.preventDefault();safe(()=>scan($('scanInput').value))();});
// Do not truncate a hardware barcode: validate the whole value on Enter.
$('scanInput').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase();});
$('newBatch').onclick=safe(newBatch);
$('batchSelect').onchange=safe(async e=>{await S.change(key,v=>{v.active=e.target.value;});editRt=false;selected.clear();await reload();});
$('settingsBtn').onclick=()=>{const d=current();if(!d)return;$('shippingRef').value=d.shippingRef;$('target').value=d.targetQty||'';$('note').value=d.note;$('settings').showModal();};
$('saveSettings').onclick=safe(async()=>{await action('SETTINGS',{shippingRef:$('shippingRef').value,targetQty:$('target').value,note:$('note').value});$('settings').close();});
$('rtBtn').onclick=()=>{editRt=!editRt;selected.clear();render();};$('rtCancel').onclick=()=>{editRt=false;selected.clear();render();};
$('selectAll').onclick=()=>{selected=new Set(D.active(current()).filter(i=>i.iqc.state==='FOUND').map(i=>i.ctn));render();};$('selectNone').onclick=()=>{selected.clear();render();};
$('list').addEventListener('change',e=>{if(e.target.dataset.pick){e.target.checked?selected.add(e.target.dataset.pick):selected.delete(e.target.dataset.pick);$('selectionCount').textContent='已選 '+selected.size+' 支';$('applyRt').disabled=!selected.size;}});
$('applyRt').onclick=safe(async()=>{const d=current(),rt=$('newRt').value.trim();const items=D.active(d).filter(i=>selected.has(i.ctn)).map(i=>({ctn:i.ctn,fromRt:i.rt}));if(!D.rtPattern.test(rt))throw new Error('RT 必須是 5～10 碼數字');if(!items.length)throw new Error('請先勾選鋼瓶');if(!confirm('將 '+items.length+' 支的 OQC RT 改為 '+rt+'？IQC 不變，歷程保留。'))return;await action('RT_CHANGE',{rt,items});editRt=false;selected.clear();render();});
$('list').addEventListener('click',safe(async e=>{const ctn=e.target.dataset.void;if(!ctn)return;const d=current(),item=d.items.find(i=>i.ctn===ctn);const op=await action('VOID',{ctn,scanId:item.scanId});undoAction={ctn,voidId:op.id,batchId:d.id,until:Date.now()+5000};$('undoText').textContent=ctn+' 已作廢誤掃';$('undo').classList.remove('hidden');setTimeout(()=>{if(undoAction&&Date.now()>=undoAction.until){undoAction=null;$('undo').classList.add('hidden');}},5050);}));
$('undoBtn').onclick=safe(async()=>{if(!undoAction||Date.now()>undoAction.until)return;const u=undoAction;await action('RESTORE',{ctn:u.ctn,voidId:u.voidId},u.batchId);undoAction=null;$('undo').classList.add('hidden');});
$('syncBtn').onclick=safe(()=>resumeWork(true));
$('retryIqc').onclick=safe(()=>resumeWork(true));
$('closeBtn').onclick=()=>{const d=current();if(!d)return;const s=D.summary(d);if(!d.shippingRef){toast('請先填寫裝框／出貨識別',true);$('settingsBtn').click();return;}closingSignature=D.signature(d);$('closeSummary').innerHTML=escape(d.number)+'<br>裝框／出貨：'+escape(d.shippingRef)+'<br>有效 '+s.total+' 支｜未建IQC '+s.missing+' 支｜待查 '+s.pending+' 支'+(d.targetQty?'<br>標籤總量 '+d.targetQty+'；差額 '+(s.total-d.targetQty):'');$('closeDialog').showModal();};
$('cancelClose').onclick=()=>$('closeDialog').close();
$('confirmClose').onclick=safe(async()=>{await action('CLOSE',{signature:closingSignature,acknowledge:true});$('closeDialog').close();editRt=false;selected.clear();await syncPending();});
$('checkReceipt').onclick=safe(async()=>{const d=current();if(!d)return;const r=await api('receipt',{batchId:d.id});if(!r.receipt){toast('接收端尚無此批收據；本機資料仍保留',true);return;}await S.change(key,v=>{v.receipts[d.id]=r.receipt;});await reload();toast('已取得原收據；沒有建立新批次');});
$('samples').onclick=safe(async()=>{if(cfg.mode!=='SIM')return;for(const ctn of ['QA10AA1','QA10AA2','QA10AA3'])await scan(ctn);});
$('loadTest').onclick=safe(async()=>{if(cfg.mode!=='SIM')return;for(const ch of '0123456789ABCDEFGHIJ')await scan('QA10AB'+ch);});
$('offline').onchange=()=>{render();if(!offline())resumeWork(true,1);};
$('refreshRemote').onclick=safe(fetchRemote);$('connect').onclick=safe(connect);
$('simulation').onclick=safe(async()=>{if(syncing||lookupRunning||profilePromise||recoveryPromise||connecting)throw new Error('請先等目前測試完成');connectionIssue=null;clearTimeout(recoveryTimer);cfg.mode='SIM';sessionReady=true;key=environmentKey();localStorage.setItem('oqc_stage1_config',JSON.stringify(cfg));editRt=false;selected.clear();await reload();scheduleSync();pumpLookup(true);});
$('export').onclick=safe(async()=>{const data=await S.read(key);const blob=new Blob([JSON.stringify({version:ENV,build:BUILD,mode:cfg.mode,diagnostic:diagnostic(),exportedAt:now(),data},null,2)],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='OQC_DEMO_'+dateKey()+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);});
window.addEventListener('online',()=>resumeWork(true,1));
window.addEventListener('offline',()=>render());
window.addEventListener('pageshow',()=>reload().then(()=>resumeWork(true,1)).catch(showError));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload().then(()=>resumeWork(true,1)).catch(showError);});
window.addEventListener('storage',event=>{
 if(['ds_iqcc_session_v2','ds_oqc_rc_fast_session_v1'].includes(event.key)&&cfg.mode==='RC'&&!profilePromise){
  sessionReady=false;resumeWork(true,1);
 }
});
function diagnostic(){
 return {build:BUILD,mode:cfg.mode,endpointConfigured:!!cfg.endpoint,tokenPresent:!!token(),sessionReady,
  browserOnlineHint:navigator.onLine,simulatedOffline:!!$('offline').checked,checking:!!profilePromise,
  activeQueries:lookupRunning,pendingOperations:root.pending.length,connectionIssue,lastCall};
}
window.addEventListener('beforeunload',e=>{if(syncing){e.preventDefault();e.returnValue='';}});
async function start(){
 await S.open();$('endpoint').value=cfg.endpoint||'';await reload();
 await resumeWork(true,1);
 if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
}
window.OqcDemoTest={getRoot:()=>S.read(key),scan,newBatch,action,syncPending,fetchRemote,pumpLookup,fixture,reload,resumeWork,diagnostic,getKey:()=>key};
start().catch(e=>{showError(e);$('scanBtn').disabled=true;$('scanInput').disabled=true;});
})();

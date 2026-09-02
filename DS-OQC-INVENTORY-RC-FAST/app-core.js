"use strict";

const Api=window.IqcCorrectionApi;
const Db=window.OqcRcDb;
const RC_VERSION="OQC_INVENTORY_SCAN_RC_V0_1_20260902";
const TOKEN_KEY="ds_iqcc_session_v2";
const CTN_PATTERN=/^[A-Z]{2}\d{2}[A-Z]{2}[A-Z0-9]$/;
const META_ACTIVE_BATCH="activeBatchId";
const META_LOCK_RT="lockRt";

const state={
  user:null,
  profile:null,
  authReady:false,
  batches:[],
  items:[],
  events:[],
  activeBatchId:"",
  lockRt:false,
  tab:"OPEN",
  expanded:new Set(),
  queue:[],
  processing:false,
  undo:null,
  undoTimer:0
};

const $=id=>document.getElementById(id);

function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,ch=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));
}

function normalizeCtn(value){
  return String(value||"").trim().toUpperCase().replace(/\s+/g,"");
}

function isValidCtn(value){
  return CTN_PATTERN.test(normalizeCtn(value));
}

function nowIso(){
  return new Date().toISOString();
}

function ymd(value=new Date()){
  const date=value instanceof Date ? value : new Date(value);
  if(Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA",{
    timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"
  }).format(date);
}

function displayTime(value){
  const date=new Date(value);
  if(Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-TW",{
    timeZone:"Asia/Taipei",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false
  }).format(date);
}

function shortTime(value){
  const date=new Date(value);
  if(Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-TW",{
    timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false
  }).format(date);
}

function newId(prefix){
  const random=window.crypto?.randomUUID
    ? window.crypto.randomUUID().replace(/-/g,"")
    : Math.random().toString(36).slice(2)+Date.now().toString(36);
  return `${String(prefix||"RC").toUpperCase()}_${random.toUpperCase()}`;
}

function operatorName(){
  const user=state.user||state.profile?.user||{};
  return String(user.displayName||user.display_name||user.name||user.account||"RC使用者");
}

function getStoredToken(){
  return sessionStorage.getItem(TOKEN_KEY)||localStorage.getItem(TOKEN_KEY)||"";
}

function toast(message,type=""){
  const el=$("toast");
  if(!el) return;
  el.textContent=String(message||"");
  el.className=`toast ${type}`.trim();
  el.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>el.classList.add("hidden"),3800);
}

function vibrate(pattern){
  try{navigator.vibrate?.(pattern)}catch(_){ }
}

function showAuthGate(show,message=""){
  $("authGate").classList.toggle("hidden",!show);
  $("scanInput").disabled=show;
  $("scanBtn").disabled=show;
  if(show&&message) toast(message,"error");
}

function parentSessionContext(){
  try{
    const bridge=window.parent&&window.parent!==window&&window.parent.DS_PORTAL_BRIDGE;
    if(!bridge) return null;
    return typeof bridge.getSessionContext==="function"
      ? bridge.getSessionContext()
      : {
          token:typeof bridge.getToken==="function"?bridge.getToken():"",
          profile:typeof bridge.getProfile==="function"?bridge.getProfile():null
        };
  }catch(_){
    return null;
  }
}

async function hydrateAuth(){
  if(!Api||typeof Api.post!=="function"){
    showAuthGate(true,"IQC API 模組載入失敗");
    return false;
  }

  const parent=parentSessionContext();
  if(parent?.token){
    try{sessionStorage.setItem(TOKEN_KEY,String(parent.token))}catch(_){ }
  }
  if(parent?.profile){
    state.profile=parent.profile;
    state.user=parent.profile.user||null;
  }

  if(!getStoredToken()){
    $("userPill").textContent="尚未登入";
    showAuthGate(true);
    state.authReady=false;
    return false;
  }

  state.authReady=true;
  showAuthGate(false);

  if(state.user){
    $("userPill").textContent=operatorName();
    return true;
  }

  try{
    const result=await Api.post("bootstrap",{});
    state.profile=result;
    state.user=result.user||null;
    $("userPill").textContent=operatorName();
    return true;
  }catch(err){
    const message=String(err?.message||err||"");
    if(/登入|session|停用|權限/i.test(message)){
      state.authReady=false;
      $("userPill").textContent="登入失效";
      showAuthGate(true,message);
      return false;
    }
    $("userPill").textContent="RC 離線檢視";
    toast("目前無法確認登入，但既有 RC 資料仍可查看；掃描時會再次驗證。","error");
    return true;
  }
}

async function reloadData(){
  const [batches,items,events,activeBatchId,lockRt]=await Promise.all([
    Db.getAll("batches"),
    Db.getAll("items"),
    Db.getAll("events"),
    Db.getMeta(META_ACTIVE_BATCH,""),
    Db.getMeta(META_LOCK_RT,false)
  ]);

  state.batches=batches.sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")));
  state.items=items.sort((a,b)=>String(a.scannedAt||"").localeCompare(String(b.scannedAt||"")));
  state.events=events;
  state.activeBatchId=state.batches.some(row=>row.batchId===activeBatchId&&row.status==="OPEN")
    ? activeBatchId
    : (state.batches.find(row=>row.status==="OPEN")?.batchId||"");
  state.lockRt=!!lockRt;
  $("lockRtToggle").checked=state.lockRt;

  if(state.activeBatchId) state.expanded.add(state.activeBatchId);
  renderAll();
}

function activeItemsForBatch(batchId){
  return state.items
    .filter(item=>item.batchId===batchId&&item.recordStatus!=="VOIDED")
    .sort((a,b)=>String(a.scannedAt||"").localeCompare(String(b.scannedAt||"")));
}

function voidItemsForBatch(batchId){
  return state.items.filter(item=>item.batchId===batchId&&item.recordStatus==="VOIDED");
}

function findActiveItemByCtn(ctn){
  return state.items.find(item=>item.ctn===ctn&&item.recordStatus!=="VOIDED")||null;
}

function batchById(batchId){
  return state.batches.find(row=>row.batchId===batchId)||null;
}

function currentBatch(){
  return batchById(state.activeBatchId);
}

function openBatchForRt(rt){
  return state.batches
    .filter(row=>row.status==="OPEN"&&String(row.rt)===String(rt))
    .sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")))[0]||null;
}

function renderAll(){
  renderBatchSelect();
  renderKpis();
  renderBatches();
  renderQueue();
}

function renderBatchSelect(){
  const open=state.batches.filter(row=>row.status==="OPEN");
  const options=['<option value="">自動依 RT 建立批次</option>'].concat(open.map(batch=>{
    const count=activeItemsForBatch(batch.batchId).length;
    return `<option value="${escapeHtml(batch.batchId)}">RT ${escapeHtml(batch.rt)}｜${count}${batch.targetQty?`/${escapeHtml(batch.targetQty)}`:""}</option>`;
  }));
  $("activeBatchSelect").innerHTML=options.join("");
  $("activeBatchSelect").value=state.activeBatchId||"";
}

function renderKpis(){
  const today=ymd();
  $("openBatchCount").textContent=String(state.batches.filter(row=>row.status==="OPEN").length);
  $("activeItemCount").textContent=String(state.items.filter(row=>row.recordStatus!=="VOIDED").length);
  $("todayScanCount").textContent=String(state.items.filter(row=>row.recordStatus!=="VOIDED"&&ymd(row.scannedAt)===today).length);
  $("voidItemCount").textContent=String(state.items.filter(row=>row.recordStatus==="VOIDED").length);
}

function batchProgress(batch,count){
  const target=Number(batch.targetQty||0);
  if(!target) return 0;
  return Math.min(100,Math.max(0,(count/target)*100));
}

function batchCardHtml(batch){
  const items=activeItemsForBatch(batch.batchId);
  const voided=voidItemsForBatch(batch.batchId).length;
  const expanded=state.expanded.has(batch.batchId);
  const active=batch.batchId===state.activeBatchId;
  const completed=batch.status==="COMPLETED";
  const target=Number(batch.targetQty||0);
  const pct=batchProgress(batch,items.length);

  const itemHtml=items.length
    ? items.map((item,index)=>itemRowHtml(item,index+1,!completed)).join("")
    : '<div class="item-empty">此批次尚未掃描鋼瓶。</div>';

  return `
    <article class="batch-card ${active?"active":""} ${completed?"completed":""}" data-batch-id="${escapeHtml(batch.batchId)}">
      <button class="batch-summary" type="button" data-toggle-batch="${escapeHtml(batch.batchId)}">
        <div>
          <div class="batch-title-row">
            <strong>RT ${escapeHtml(batch.rt)}</strong>
            <span class="batch-status">${completed?"掃描完成":"OPEN"}</span>
            ${active&&!completed?'<span class="batch-status">目前批次</span>':""}
          </div>
          <div class="batch-sub">${escapeHtml(batch.note||batch.regionCode||"分次掃描批次")}｜最後更新 ${escapeHtml(shortTime(batch.updatedAt))}</div>
        </div>
        <div class="batch-count">
          ${items.length}${target?` / ${target}`:""}
          <small>${target?"已掃 / 標籤總量":"已掃描支數"}</small>
        </div>
      </button>
      <div class="batch-detail ${expanded?"":"hidden"}">
        <div class="batch-meta">
          <div class="meta-box"><span>批次編號</span><strong>${escapeHtml(batch.batchId)}</strong></div>
          <div class="meta-box"><span>建立人員</span><strong>${escapeHtml(batch.createdBy||"-")}</strong></div>
          <div class="meta-box"><span>作廢誤掃</span><strong>${voided} 支</strong></div>
        </div>
        ${target?`<div class="progress-track"><i style="width:${pct.toFixed(1)}%"></i></div>`:""}
        <div class="batch-actions">
          ${!completed?`<button class="secondary-btn" type="button" data-use-batch="${escapeHtml(batch.batchId)}">設為目前批次</button>`:""}
          <button class="secondary-btn" type="button" data-edit-batch="${escapeHtml(batch.batchId)}">設定總量／備註</button>
          ${!completed
            ? `<button class="primary-btn" type="button" data-complete-batch="${escapeHtml(batch.batchId)}">完成掃描批次</button>`
            : `<button class="secondary-btn" type="button" data-reopen-batch="${escapeHtml(batch.batchId)}">重新開放（RC）</button>`}
        </div>
        <div class="item-list">${itemHtml}</div>
      </div>
    </article>`;
}

function itemRowHtml(item,index,voidable){
  return `
    <div class="swipe-shell" data-item-shell="${escapeHtml(item.itemId)}">
      <div class="swipe-actions">
        <button class="void-btn" type="button" data-void-item="${escapeHtml(item.itemId)}">作廢誤掃</button>
      </div>
      <div class="scan-item" data-swipe-item="${escapeHtml(item.itemId)}" data-voidable="${voidable?"1":"0"}">
        <div class="item-no">${index}</div>
        <div class="item-main">
          <div class="item-ctn">${escapeHtml(item.ctn)}</div>
          <div class="item-sub">
            <span>RT ${escapeHtml(item.rt)}</span>
            <span class="item-frame">運輸框 ${escapeHtml(item.frameCtn||"無")}</span>
            ${item.bottleStatus?`<span>狀態 ${escapeHtml(item.bottleStatus)}</span>`:""}
          </div>
        </div>
        <div class="item-state">
          <strong>OQC 待檢</strong>
          <small>${escapeHtml(shortTime(item.scannedAt))}</small>
          ${voidable?`<button class="item-menu-btn" type="button" data-open-item="${escapeHtml(item.itemId)}" aria-label="顯示作廢按鈕">•••</button>`:""}
        </div>
      </div>
    </div>`;
}

function renderBatches(){
  const rows=state.batches
    .filter(row=>row.status===state.tab)
    .sort((a,b)=>{
      if(a.batchId===state.activeBatchId) return -1;
      if(b.batchId===state.activeBatchId) return 1;
      return String(b.updatedAt||"").localeCompare(String(a.updatedAt||""));
    });

  $("batchList").innerHTML=rows.length
    ? rows.map(batchCardHtml).join("")
    : `<div class="empty-card">${state.tab==="OPEN"?"尚無開放批次；掃描第一支 CTN 後會依 RT 自動建立。":"尚無已完成掃描批次。"}</div>`;

  bindBatchInteractions();
}

function renderQueue(){
  const box=$("scanQueue");
  if(!state.queue.length){
    box.classList.add("hidden");
    box.innerHTML="";
    return;
  }
  box.classList.remove("hidden");
  box.innerHTML=state.queue.slice(-5).reverse().map(entry=>`
    <div class="queue-item ${escapeHtml(entry.status)}">
      <div class="queue-spinner"></div>
      <div class="queue-main"><strong>${escapeHtml(entry.ctn)}</strong><span>${escapeHtml(entry.message||"辨識中…")}</span></div>
      <div class="queue-state">${entry.status==="processing"?"IQC查詢":entry.status==="success"?"已加入":entry.status==="duplicate"?"未重複":"未加入"}</div>
    </div>`).join("");
}

function addQueueEntry(ctn){
  const entry={queueId:newId("SCANQ"),ctn,status:"processing",message:"正在由 IQC 反查 RT…",createdAt:Date.now()};
  state.queue.push(entry);
  renderQueue();
  return entry;
}

function finishQueueEntry(entry,status,message){
  entry.status=status;
  entry.message=message;
  renderQueue();
  setTimeout(()=>{
    const index=state.queue.findIndex(row=>row.queueId===entry.queueId);
    if(index!==-1) state.queue.splice(index,1);
    renderQueue();
  },status==="error"?5200:2600);
}

function bind(){
  $("scanForm").addEventListener("submit",event=>{
    event.preventDefault();
    enqueueScan($("scanInput").value);
  });
  $("scanInput").addEventListener("input",event=>{
    const cursor=event.target.selectionStart;
    event.target.value=normalizeCtn(event.target.value).slice(0,7);
    try{event.target.setSelectionRange(cursor,cursor)}catch(_){ }
  });
  $("focusScanBtn").addEventListener("click",focusScan);
  $("retryAuthBtn").addEventListener("click",async()=>{
    await hydrateAuth();
    if(state.authReady) focusScan();
  });
  $("lockRtToggle").addEventListener("change",async event=>{
    state.lockRt=event.target.checked;
    await Db.setMeta(META_LOCK_RT,state.lockRt);
    if(state.lockRt&&!currentBatch()){
      toast("尚未選擇開放批次；第一筆成功掃描後會自動鎖定該 RT。","error");
    }
  });
  $("activeBatchSelect").addEventListener("change",event=>setActiveBatch(event.target.value));
  $("refreshBtn").addEventListener("click",async()=>{
    await reloadData();
    toast("已重新載入本機 RC 資料","success");
  });
  document.querySelectorAll("[data-tab]").forEach(btn=>btn.addEventListener("click",()=>{
    state.tab=btn.dataset.tab;
    syncTabs();
    renderBatches();
  }));
  $("saveBatchBtn").addEventListener("click",saveBatchSettings);
  $("undoBtn").addEventListener("click",undoVoid);
  $("exportBtn").addEventListener("click",exportRcData);
  $("clearRcBtn").addEventListener("click",clearRcData);
  document.addEventListener("click",event=>{
    if(!event.target.closest("[data-swipe-item]")&&!event.target.closest("[data-open-item]")&&!event.target.closest("[data-void-item]")){
      closeAllSwipes();
    }
  });
  window.addEventListener("pageshow",()=>reloadData().catch(()=>{}));
  document.addEventListener("visibilitychange",()=>{
    if(!document.hidden) reloadData().catch(()=>{});
  });
}

async function init(){
  if(!Db){
    document.body.innerHTML='<div style="padding:30px;color:white">OQC RC 本機資料模組載入失敗。</div>';
    return;
  }
  bind();
  syncTabs();
  try{
    await Db.openDb();
    await reloadData();
  }catch(err){
    toast(err?.message||"無法開啟本機 RC 資料庫","error");
  }
  await hydrateAuth();
  focusScan();
  window.OQC_INVENTORY_RC=Object.freeze({
    version:RC_VERSION,
    reload:reloadData,
    exportData:()=>({batches:state.batches,items:state.items,events:state.events})
  });
}

init();

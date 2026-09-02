async function editBatch(batchId){
  const batch=batchById(batchId);
  if(!batch) return;
  $("batchDialogId").value=batch.batchId;
  $("batchDialogTitle").textContent=`RT ${batch.rt} 批次設定`;
  $("batchTargetQty").value=batch.targetQty||"";
  $("batchNote").value=batch.note||"";
  $("batchDialog").showModal();
}

async function saveBatchSettings(){
  const batch=batchById($("batchDialogId").value);
  if(!batch) return;
  const rawTarget=String($("batchTargetQty").value||"").trim();
  const targetQty=rawTarget?Number(rawTarget):null;
  if(targetQty!==null&&(!Number.isInteger(targetQty)||targetQty<1||targetQty>9999)){
    toast("標籤總量需為 1～9999 的整數","error");
    return;
  }
  const before={...batch};
  batch.targetQty=targetQty;
  batch.note=String($("batchNote").value||"").trim();
  batch.updatedAt=nowIso();
  await Db.put("batches",batch);
  await addEvent(batch.batchId,"","BATCH_SETTINGS_UPDATED",before,batch);
  $("batchDialog").close();
  renderAll();
  toast("批次設定已儲存","success");
}

async function completeBatch(batchId){
  const batch=batchById(batchId);
  if(!batch||batch.status!=="OPEN") return;
  const count=activeItemsForBatch(batchId).length;
  if(!count){
    toast("空白批次不能完成","error");
    return;
  }
  if(!confirm(`確定完成 RT ${batch.rt} 的掃描批次？\n目前有效鋼瓶：${count} 支`)) return;
  const before={...batch};
  batch.status="COMPLETED";
  batch.completedBy=operatorName();
  batch.completedAt=nowIso();
  batch.updatedAt=batch.completedAt;
  await Db.put("batches",batch);
  await addEvent(batch.batchId,"","BATCH_COMPLETED",before,batch);
  if(state.activeBatchId===batch.batchId){
    state.activeBatchId=state.batches.find(row=>row.status==="OPEN"&&row.batchId!==batch.batchId)?.batchId||"";
    await Db.setMeta(META_ACTIVE_BATCH,state.activeBatchId);
  }
  renderAll();
  toast("掃描批次已完成；鋼瓶仍保持 OQC 待檢狀態。","success");
}

async function reopenBatch(batchId){
  const batch=batchById(batchId);
  if(!batch||batch.status!=="COMPLETED") return;
  const before={...batch};
  batch.status="OPEN";
  batch.completedBy="";
  batch.completedAt="";
  batch.updatedAt=nowIso();
  await Db.put("batches",batch);
  await addEvent(batch.batchId,"","BATCH_REOPENED",before,batch,"RC測試重新開放");
  state.tab="OPEN";
  state.activeBatchId=batch.batchId;
  state.expanded.add(batch.batchId);
  await Db.setMeta(META_ACTIVE_BATCH,batch.batchId);
  syncTabs();
  renderAll();
  toast("批次已重新開放（RC）","success");
}

async function voidItem(itemId){
  const item=state.items.find(row=>row.itemId===itemId);
  if(!item||item.recordStatus==="VOIDED") return;
  const batch=batchById(item.batchId);
  if(!batch||batch.status!=="OPEN"){
    toast("已完成掃描的批次不可直接作廢，請先重新開放批次。","error");
    return;
  }
  if(item.oqcStatus!=="SCANNED"){
    toast("此鋼瓶已進入後續 OQC 狀態，不能由掃描頁直接作廢。","error");
    return;
  }

  const before={...item};
  item.recordStatus="VOIDED";
  item.voidedBy=operatorName();
  item.voidedAt=nowIso();
  item.voidReason="BARCODE_SCAN_ERROR";
  await Db.put("items",item);
  await addEvent(item.batchId,item.ctn,"VOID",before,item,"BARCODE_SCAN_ERROR");

  state.undo={itemId:item.itemId,before,expiresAt:Date.now()+5000};
  clearTimeout(state.undoTimer);
  $("undoText").textContent=`${item.ctn} 已作廢誤掃`;
  $("undoBar").classList.remove("hidden");
  state.undoTimer=setTimeout(()=>{
    state.undo=null;
    $("undoBar").classList.add("hidden");
  },5000);
  renderAll();
  vibrate(25);
}

async function undoVoid(){
  if(!state.undo||Date.now()>state.undo.expiresAt){
    $("undoBar").classList.add("hidden");
    state.undo=null;
    return;
  }
  const item=state.items.find(row=>row.itemId===state.undo.itemId);
  if(!item) return;
  const before={...item};
  Object.assign(item,state.undo.before,{recordStatus:"ACTIVE",voidedBy:"",voidedAt:"",voidReason:""});
  await Db.put("items",item);
  await addEvent(item.batchId,item.ctn,"RESTORE",before,item,"5秒復原");
  clearTimeout(state.undoTimer);
  state.undo=null;
  $("undoBar").classList.add("hidden");
  renderAll();
  toast(`${item.ctn} 已復原`,"success");
}

function openSwipe(itemId){
  document.querySelectorAll("[data-swipe-item]").forEach(el=>{
    el.style.transform=el.dataset.swipeItem===itemId?"translateX(-96px)":"translateX(0)";
  });
}

function closeAllSwipes(){
  document.querySelectorAll("[data-swipe-item]").forEach(el=>{el.style.transform="translateX(0)"});
}

function bindSwipe(el){
  if(el.dataset.swipeBound==="1") return;
  el.dataset.swipeBound="1";
  let startX=0;
  let startY=0;
  let deltaX=0;
  let dragging=false;

  el.addEventListener("pointerdown",event=>{
    if(el.dataset.voidable!=="1") return;
    startX=event.clientX;
    startY=event.clientY;
    deltaX=0;
    dragging=true;
    el.classList.add("no-transition");
    try{el.setPointerCapture(event.pointerId)}catch(_){ }
  });

  el.addEventListener("pointermove",event=>{
    if(!dragging) return;
    const dx=event.clientX-startX;
    const dy=event.clientY-startY;
    if(Math.abs(dy)>Math.abs(dx)+8){
      dragging=false;
      el.classList.remove("no-transition");
      return;
    }
    deltaX=Math.max(-104,Math.min(10,dx));
    if(deltaX<0) el.style.transform=`translateX(${deltaX}px)`;
  });

  const finish=()=>{
    if(!dragging) return;
    dragging=false;
    el.classList.remove("no-transition");
    el.style.transform=deltaX<-44?"translateX(-96px)":"translateX(0)";
  };
  el.addEventListener("pointerup",finish);
  el.addEventListener("pointercancel",finish);
}

function bindBatchInteractions(){
  document.querySelectorAll("[data-toggle-batch]").forEach(btn=>btn.addEventListener("click",()=>{
    const id=btn.dataset.toggleBatch;
    state.expanded.has(id)?state.expanded.delete(id):state.expanded.add(id);
    renderBatches();
  }));
  document.querySelectorAll("[data-use-batch]").forEach(btn=>btn.addEventListener("click",()=>setActiveBatch(btn.dataset.useBatch)));
  document.querySelectorAll("[data-edit-batch]").forEach(btn=>btn.addEventListener("click",()=>editBatch(btn.dataset.editBatch)));
  document.querySelectorAll("[data-complete-batch]").forEach(btn=>btn.addEventListener("click",()=>completeBatch(btn.dataset.completeBatch)));
  document.querySelectorAll("[data-reopen-batch]").forEach(btn=>btn.addEventListener("click",()=>reopenBatch(btn.dataset.reopenBatch)));
  document.querySelectorAll("[data-void-item]").forEach(btn=>btn.addEventListener("click",()=>voidItem(btn.dataset.voidItem)));
  document.querySelectorAll("[data-open-item]").forEach(btn=>btn.addEventListener("click",event=>{
    event.stopPropagation();
    openSwipe(btn.dataset.openItem);
  }));
  document.querySelectorAll("[data-swipe-item]").forEach(bindSwipe);
}

function syncTabs(){
  document.querySelectorAll("[data-tab]").forEach(btn=>btn.classList.toggle("active",btn.dataset.tab===state.tab));
}

async function exportRcData(){
  const payload={
    version:RC_VERSION,
    exportedAt:nowIso(),
    user:operatorName(),
    batches:state.batches,
    items:state.items,
    events:state.events
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=`OQC_INVENTORY_RC_${ymd().replace(/-/g,"")}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast("RC JSON 已匯出","success");
}

async function clearRcData(){
  const first=confirm("確定清除這台裝置上的 OQC RC 批次、鋼瓶與事件紀錄？\n不會影響 IQC、Grinding、ERP。 ");
  if(!first) return;
  const text=prompt("為避免誤按，請輸入 CLEAR");
  if(String(text||"").trim().toUpperCase()!=="CLEAR"){
    toast("未輸入 CLEAR，已取消。","error");
    return;
  }
  await Db.clearAll();
  state.batches=[];
  state.items=[];
  state.events=[];
  state.activeBatchId="";
  state.expanded.clear();
  state.lockRt=false;
  $("lockRtToggle").checked=false;
  renderAll();
  toast("本機 OQC RC 資料已清除","success");
}

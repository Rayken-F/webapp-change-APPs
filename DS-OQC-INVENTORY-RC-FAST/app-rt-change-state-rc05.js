(function installOqcRtChangeStateRc05(global){
  "use strict";

  if(global.OqcRtChangeRc05) return;

  const VERSION="OQC_INVENTORY_RT_CHANGE_RC05_20260908";
  const RT_PATTERN=/^\d{5,10}$/;
  const mode={batchId:"",selected:new Set(),applying:false};

  function isModeFor(batchId){return mode.batchId===batchId}
  function selectedCount(){return mode.selected.size}
  function updateControls(){
    const count=selectedCount();
    document.querySelectorAll("[data-rt-selected-count]").forEach(el=>{el.textContent=String(count)});
    document.querySelectorAll("[data-rt-change-apply]").forEach(btn=>{btn.disabled=!count||mode.applying});
  }

  function cancel(render=true){
    mode.batchId="";
    mode.selected.clear();
    mode.applying=false;
    if(render) renderBatches();
  }

  async function start(batchId){
    const batch=batchById(batchId);
    if(!batch||batch.status!=="OPEN"){
      toast("只有開放中的批次可以更改 RT。","error");
      return;
    }
    if(mode.batchId===batchId){cancel();return}

    mode.batchId=batchId;
    mode.selected.clear();
    state.expanded.add(batchId);
    if(state.activeBatchId!==batchId){
      state.activeBatchId=batchId;
      await Db.setMeta(META_ACTIVE_BATCH,batchId);
    }
    renderAll();
    setTimeout(()=>{
      document.querySelector(`[data-rt-change-panel="${batchId}"]`)?.scrollIntoView({block:"nearest",behavior:"smooth"});
    },40);
  }

  function setSelected(itemId,checked){
    checked?mode.selected.add(itemId):mode.selected.delete(itemId);
    updateControls();
  }

  function selectAll(batchId){
    mode.selected.clear();
    activeItemsForBatch(batchId).forEach(item=>{
      if(item.oqcStatus==="SCANNED") mode.selected.add(item.itemId);
    });
    renderBatches();
  }

  function clearSelection(){
    mode.selected.clear();
    renderBatches();
  }

  function createTargetBatch(newRt,sourceBatch){
    const now=nowIso();
    return {
      batchId:createBatchId(),
      rt:newRt,
      targetQty:null,
      note:"",
      regionCode:sourceBatch?.regionCode||"",
      regionName:sourceBatch?.regionName||"",
      status:"OPEN",
      createdBy:operatorName(),
      createdAt:now,
      updatedAt:now,
      lastScanAt:now,
      completedBy:"",
      completedAt:"",
      rcVersion:VERSION,
      createdReason:"RT_CHANGE"
    };
  }

  async function apply(batchId){
    if(mode.applying) return;
    const sourceBatch=batchById(batchId);
    if(!sourceBatch||sourceBatch.status!=="OPEN"){
      toast("目前批次已不是開放狀態，請重新整理。","error");
      cancel();
      return;
    }

    const input=document.querySelector(`[data-rt-change-input="${batchId}"]`);
    const newRt=String(input?.value||"").trim().replace(/^RT/i,"");
    if(!RT_PATTERN.test(newRt)){
      toast("新 RT 必須是 5～10 碼數字。","error");
      input?.focus();
      return;
    }

    const selectedItems=Array.from(mode.selected)
      .map(id=>state.items.find(row=>row.itemId===id))
      .filter(item=>item&&item.batchId===batchId&&item.recordStatus!=="VOIDED"&&item.oqcStatus==="SCANNED");

    if(!selectedItems.length){
      toast("請先勾選要更改 RT 的鋼瓶。","error");
      return;
    }
    if(selectedItems.every(item=>String(item.rt)===newRt)){
      toast(`所選鋼瓶目前已是 RT ${newRt}。`,"error");
      return;
    }

    const oldRts=Array.from(new Set(selectedItems.map(item=>String(item.rt||""))));
    if(!confirm(`確定將 ${selectedItems.length} 支鋼瓶更改為 RT ${newRt}？\n\n舊 RT：${oldRts.join("、")}\n系統會保留完整 RT 轉換紀錄。`)) return;

    mode.applying=true;
    updateControls();

    try{
      let targetBatch=openBatchForRt(newRt);
      let createdTarget=false;
      if(!targetBatch||targetBatch.batchId===sourceBatch.batchId){
        targetBatch=createTargetBatch(newRt,sourceBatch);
        createdTarget=true;
      }

      const now=nowIso();
      const changedBy=operatorName();
      const itemsToSave=[];
      const eventRows=[];

      for(const item of selectedItems){
        const oldRt=String(item.rt||"");
        if(oldRt===newRt) continue;

        const before=JSON.parse(JSON.stringify(item));
        const history={
          oldRt,newRt,changedAt:now,changedBy,
          sourceBatchId:sourceBatch.batchId,
          targetBatchId:targetBatch.batchId,
          reason:"MANUAL_RT_CHANGE"
        };

        if(!item.originalRt) item.originalRt=oldRt;
        if(!item.originalBatchId) item.originalBatchId=sourceBatch.batchId;
        item.previousRt=oldRt;
        item.rt=newRt;
        item.batchId=targetBatch.batchId;
        item.rtChangedAt=now;
        item.rtChangedBy=changedBy;
        item.rtChangeCount=Number(item.rtChangeCount||0)+1;
        item.rtChangeHistory=[...(Array.isArray(item.rtChangeHistory)?item.rtChangeHistory:[]),history];
        item.effectiveRtSource="MANUAL_RT_CHANGE";
        itemsToSave.push(item);
        eventRows.push({item,before,after:JSON.parse(JSON.stringify(item)),oldRt});
      }

      if(!itemsToSave.length){
        mode.applying=false;
        updateControls();
        toast("沒有可更改的鋼瓶。","error");
        return;
      }

      sourceBatch.updatedAt=now;
      targetBatch.updatedAt=now;
      targetBatch.lastScanAt=now;

      await Db.putMany("items",itemsToSave);
      await Promise.all([Db.put("batches",sourceBatch),Db.put("batches",targetBatch)]);

      for(const row of eventRows){
        await addEvent(
          targetBatch.batchId,row.item.ctn,"RT_CHANGE",row.before,row.after,
          `RT ${row.oldRt} → ${newRt}｜來源批次 ${sourceBatch.batchId}｜目標批次 ${targetBatch.batchId}`
        );
      }

      if(createdTarget){
        await addEvent(
          targetBatch.batchId,"","BATCH_CREATED_BY_RT_CHANGE",{},
          JSON.parse(JSON.stringify(targetBatch)),`由批次 ${sourceBatch.batchId} 的 RT 更改建立`
        );
      }

      await addEvent(
        sourceBatch.batchId,"","BATCH_RT_CHANGE_OUT",
        {rt:sourceBatch.rt,itemCount:selectedItems.length},
        {targetRt:newRt,targetBatchId:targetBatch.batchId,itemCount:itemsToSave.length},
        `${itemsToSave.length} 支鋼瓶移至 RT ${newRt}`
      );

      state.batches=state.batches.map(row=>{
        if(row.batchId===sourceBatch.batchId) return sourceBatch;
        if(row.batchId===targetBatch.batchId) return targetBatch;
        return row;
      });
      if(!state.batches.some(row=>row.batchId===targetBatch.batchId)) state.batches.unshift(targetBatch);

      state.expanded.add(sourceBatch.batchId);
      state.expanded.add(targetBatch.batchId);
      mode.batchId="";
      mode.selected.clear();
      mode.applying=false;
      renderAll();
      toast(`${itemsToSave.length} 支鋼瓶已更改為 RT ${newRt}，轉換紀錄已保留。`,"success");
      vibrate([30,40,30]);
    }catch(err){
      mode.applying=false;
      updateControls();
      toast(err?.message||"RT 更改失敗，請重新整理後再試。","error");
    }
  }

  global.OqcRtChangeRc05={
    VERSION,mode,isModeFor,selectedCount,updateControls,
    cancel,start,setSelected,selectAll,clearSelection,apply
  };
})(window);

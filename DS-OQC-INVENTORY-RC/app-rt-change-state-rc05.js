(function installOqcRtChangeStateRc05(global){
  "use strict";
  if(global.OqcRtChangeRc05) return;

  const VERSION="OQC_RT_EMPTY_BATCH_RC_V0_1_5_2_20260908";
  const ARCHIVED="ARCHIVED_RT_CHANGE";
  const RT_PATTERN=/^\d{5,10}$/;
  const STORES=["batches","items","events","meta"];
  const mode={batchId:"",selected:new Set(),applying:false};
  const baseReload=reloadData;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const active=item=>item.recordStatus!=="VOIDED";
  const isModeFor=batchId=>mode.batchId===batchId;
  const selectedCount=()=>mode.selected.size;
  const scansPending=()=>state.queue.some(row=>row.status==="queued"||row.status==="processing");

  function updateControls(){
    document.querySelectorAll("[data-rt-selected-count]").forEach(el=>{el.textContent=String(selectedCount())});
    document.querySelectorAll("[data-rt-change-apply]").forEach(btn=>{btn.disabled=!selectedCount()||mode.applying});
  }
  function cancel(render=true){
    if(mode.applying) return;
    mode.batchId="";
    mode.selected.clear();
    if(render) renderBatches();
  }
  async function start(batchId){
    if(mode.applying) return;
    const batch=batchById(batchId);
    if(!batch||batch.status!=="OPEN") return toast("只有開放中的批次可以更改 RT。","error");
    if(isModeFor(batchId)){cancel();return}
    mode.batchId=batchId;
    mode.selected.clear();
    state.expanded.add(batchId);
    if(state.activeBatchId!==batchId){
      state.activeBatchId=batchId;
      await Db.setMeta(META_ACTIVE_BATCH,batchId);
    }
    renderAll();
    setTimeout(()=>{
      Array.from(document.querySelectorAll("[data-rt-change-panel]")).find(el=>el.dataset.rtChangePanel===batchId)?.scrollIntoView({block:"nearest",behavior:"smooth"});
    },40);
  }
  function setSelected(itemId,checked){
    if(mode.applying) return;
    checked?mode.selected.add(itemId):mode.selected.delete(itemId);
    updateControls();
  }
  function selectAll(batchId){
    if(mode.applying) return;
    mode.selected.clear();
    activeItemsForBatch(batchId).forEach(item=>{if(item.oqcStatus==="SCANNED") mode.selected.add(item.itemId)});
    renderBatches();
  }
  function clearSelection(){
    if(mode.applying) return;
    mode.selected.clear();
    renderBatches();
  }

  // Local RC database only. Commit items, batch lifecycle, history and active selection together.
  // Never issue network requests, or update the shared IQC source, from this transaction.
  async function transact(plan){
    const db=await Db.openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORES,"readwrite");
      const snapshot={};
      let remaining=STORES.length,result,failure;
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(failure||tx.error||new Error("RC 儲存未完成；本次修改未寫入，請重試。"));
      tx.onerror=()=>{failure=failure||tx.error};
      STORES.forEach(name=>{
        const request=tx.objectStore(name).getAll();
        request.onsuccess=()=>{
          snapshot[name]=request.result||[];
          if(--remaining) return;
          try{
            const planned=plan(snapshot);
            result=planned.result;
            Object.entries(planned.writes||{}).forEach(([store,rows])=>{
              rows.forEach(row=>tx.objectStore(store).put(row));
            });
          }catch(err){failure=err;tx.abort()}
        };
      });
    });
  }
  function event(batchId,ctn,eventType,before,after,note,when){
    return {
      eventId:newId("OQCE"),batchId,ctn,eventType,
      before:clone(before||{}),after:clone(after||{}),note:note||"",
      actor:operatorName(),eventAt:when,rcVersion:VERSION
    };
  }
  function archive(batch,targetIds,when,reason){
    return {...batch,status:ARCHIVED,archivedAt:when,archivedBy:operatorName(),
      archiveReason:reason,transferredToBatchIds:Array.from(new Set(targetIds.filter(Boolean))),updatedAt:when};
  }
  function batchNumber(batches){
    const date=ymd().replace(/-/g,"");
    const prefix=`OQC-${date}-`;
    const sameDay=batches.filter(row=>ymd(row.createdAt||row.updatedAt||new Date()).replace(/-/g,"")===date).length;
    const used=batches.map(row=>String(row.batchId||"")).filter(id=>id.startsWith(prefix)).map(id=>Number(id.slice(prefix.length))||0);
    const next=Math.max(sameDay,...used)+1;
    if(next>99) throw new Error("當日 OQC 掃描批次已達 99 批，請聯絡管理者。");
    return prefix+String(next).padStart(2,"0");
  }

  // Repair old empty source cards using persisted transfer evidence. Never retire an arbitrary
  // empty/new/void-only batch, or remove item history. Repeated reloads are idempotent.
  async function reconcileEmptySources(){
    if(mode.applying||scansPending()) return [];
    return transact(snapshot=>{
      const when=nowIso(),writes={batches:[],events:[],meta:[]};
      const outgoing=new Map();
      snapshot.events.forEach(row=>{
        if(row.eventType!=="BATCH_RT_CHANGE_OUT"||!(Number(row.after?.itemCount)>0)) return;
        if(!outgoing.has(row.batchId)) outgoing.set(row.batchId,[]);
        outgoing.get(row.batchId).push(row);
      });
      snapshot.batches.forEach(batch=>{
        if(batch.status!=="OPEN"||snapshot.items.some(item=>active(item)&&item.batchId===batch.batchId)) return;
        const transfers=outgoing.get(batch.batchId)||[];
        if(!transfers.length) return;
        const latest=transfers.slice().sort((a,b)=>String(b.eventAt).localeCompare(String(a.eventAt)))[0];
        const laterRemoval=snapshot.events.some(row=>row.batchId===batch.batchId&&
          ["SCAN","RESTORE","VOID","BATCH_REOPENED"].includes(row.eventType)&&String(row.eventAt)>=String(latest.eventAt));
        if(laterRemoval) return;
        const targets=transfers.map(row=>row.after?.targetBatchId).filter(Boolean);
        if(!targets.length||targets.some(id=>!snapshot.batches.some(row=>row.batchId===id))) return;
        const after=archive(batch,targets,when,"EMPTY_AFTER_RT_CHANGE");
        writes.batches.push(after);
        writes.events.push(event(batch.batchId,"","BATCH_ARCHIVED_RT_CHANGE",batch,after,"收起既有 RT 全數轉出空批次；歷程保留。",when));
      });
      const archivedIds=new Set(writes.batches.map(row=>row.batchId));
      const selected=snapshot.meta.find(row=>row.key===META_ACTIVE_BATCH)?.value;
      if(archivedIds.has(selected)){
        const targetIds=writes.batches.find(row=>row.batchId===selected)?.transferredToBatchIds||[];
        const open=snapshot.batches.filter(row=>row.status==="OPEN"&&!archivedIds.has(row.batchId));
        const next=open.find(row=>targetIds.includes(row.batchId))||open[0];
        writes.meta.push({key:META_ACTIVE_BATCH,value:next?.batchId||"",updatedAt:when});
      }
      return {writes,result:Array.from(archivedIds)};
    });
  }
  reloadData=async function(){
    if(mode.applying) return;
    try{
      const ids=await reconcileEmptySources();
      ids.forEach(id=>state.expanded.delete(id));
    }catch(err){
      console.error("OQC RC batch archive",err);
      toast("空批次整理未完成；資料仍保留，請重新整理。","error");
    }
    return baseReload();
  };

  async function apply(batchId){
    if(mode.applying||mode.batchId!==batchId) return;
    if(scansPending()) return toast("仍有 CTN 在 RT查詢中，請等查詢完成後再更改。","error");
    const input=Array.from(document.querySelectorAll("[data-rt-change-input]")).find(el=>el.dataset.rtChangeInput===batchId);
    const newRt=String(input?.value||"").trim().replace(/^RT/i,"");
    if(!RT_PATTERN.test(newRt)){
      toast("新 RT 必須是 5～10 碼數字。","error");input?.focus();return;
    }
    const selected=Array.from(mode.selected).map(id=>state.items.find(row=>row.itemId===id));
    if(!selected.length||selected.some(item=>!item||item.batchId!==batchId||!active(item)||item.oqcStatus!=="SCANNED")){
      return toast("請重新勾選此批次內可更改的鋼瓶。","error");
    }
    if(selected.every(item=>String(item.rt)===newRt)) return toast(`所選鋼瓶目前已是 RT ${newRt}。`,"error");
    const oldRts=Array.from(new Set(selected.map(item=>String(item.rt))));
    if(!confirm(`確定將 ${selected.length} 支鋼瓶更改為 RT ${newRt}？\n舊 RT：${oldRts.join("、")}\n原批次若全數轉出會自動收起，轉換歷程保留；不修改 IQC。`)) return;
    const expected=new Map(selected.map(item=>[item.itemId,String(item.rt)]));
    mode.applying=true;updateControls();
    let committed=false;
    try{
      const outcome=await transact(snapshot=>{
        const source=snapshot.batches.find(row=>row.batchId===batchId);
        if(!source||source.status!=="OPEN") throw new Error("目前批次已變更，請重新整理後再試。");
        const chosen=Array.from(expected.keys()).map(id=>snapshot.items.find(row=>row.itemId===id));
        if(chosen.some(item=>!item||item.batchId!==batchId||!active(item)||item.oqcStatus!=="SCANNED"||String(item.rt)!==expected.get(item.itemId))){
          throw new Error("所選鋼瓶資料已變更；本次未套用，請重新整理後再選取。");
        }
        const when=nowIso(),changedBy=operatorName();
        let target=snapshot.batches.filter(row=>row.status==="OPEN"&&String(row.rt)===newRt&&row.batchId!==batchId)
          .sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
        const created=!target;
        if(!target) target={batchId:batchNumber(snapshot.batches),rt:newRt,targetQty:null,note:"",
          regionCode:source.regionCode||"",regionName:source.regionName||"",status:"OPEN",
          createdBy:changedBy,createdAt:when,updatedAt:when,lastScanAt:when,completedBy:"",completedAt:"",
          rcVersion:VERSION,createdReason:"RT_CHANGE"};
        const writes={items:[],batches:[],events:[],meta:[]};
        chosen.forEach(item=>{
          const oldRt=String(item.rt||"");
          if(oldRt===newRt) return;
          const history={oldRt,newRt,changedAt:when,changedBy,sourceBatchId:batchId,targetBatchId:target.batchId,reason:"MANUAL_RT_CHANGE"};
          const after={...item,originalRt:item.originalRt||oldRt,originalBatchId:item.originalBatchId||batchId,
            previousRt:oldRt,rt:newRt,batchId:target.batchId,rtChangedAt:when,rtChangedBy:changedBy,
            rtChangeCount:Number(item.rtChangeCount||0)+1,
            rtChangeHistory:[...(Array.isArray(item.rtChangeHistory)?item.rtChangeHistory:[]),history],effectiveRtSource:"MANUAL_RT_CHANGE"};
          writes.items.push(after);
          writes.events.push(event(target.batchId,item.ctn,"RT_CHANGE",item,after,`RT ${oldRt} → RT ${newRt}`,when));
        });
        const moved=new Set(writes.items.map(item=>item.itemId));
        const remaining=snapshot.items.filter(item=>item.batchId===batchId&&active(item)&&!moved.has(item.itemId)).length;
        const sourceAfter=remaining?{...source,updatedAt:when}:archive(source,[target.batchId],when,"EMPTY_AFTER_RT_CHANGE");
        const targetAfter={...target,updatedAt:when,lastScanAt:when};
        writes.batches.push(sourceAfter,targetAfter);
        if(created) writes.events.push(event(target.batchId,"","BATCH_CREATED_BY_RT_CHANGE",{},targetAfter,`來源批次 ${batchId}`,when));
        writes.events.push(event(batchId,"","BATCH_RT_CHANGE_OUT",
          {rt:source.rt,itemCount:writes.items.length},
          {targetRt:newRt,targetBatchId:target.batchId,itemCount:writes.items.length,remainingCount:remaining},
          `${writes.items.length} 支鋼瓶移至 RT ${newRt}`,when));
        if(!remaining){
          writes.events.push(event(batchId,"","BATCH_ARCHIVED_RT_CHANGE",source,sourceAfter,"原批次全數轉出，退出掃描清單；歷程保留。",when));
          writes.meta.push({key:META_ACTIVE_BATCH,value:target.batchId,updatedAt:when});
        }
        return {writes,result:{count:writes.items.length,targetId:target.batchId,archived:!remaining}};
      });
      committed=true;
      mode.batchId="";mode.selected.clear();
      if(outcome.archived) state.expanded.delete(batchId);
      state.expanded.add(outcome.targetId);
      await baseReload();
      toast(`${outcome.count} 支已更改為 RT ${newRt}${outcome.archived?"；原空批次已收起":""}，轉換歷程已保留。`,"success");
      vibrate([30,40,30]);
    }catch(err){
      toast(committed?"RT 更改已儲存，畫面更新失敗；請重新整理確認，勿重複操作。":(err?.message||"RT 更改失敗；本次未寫入，請重試。"),"error");
    }finally{mode.applying=false;updateControls()}
  }

  // Avoid a local scan/void/complete racing the single RT move transaction.
  const baseEnqueue=enqueueScan;
  enqueueScan=function(raw){
    if(mode.applying) return toast("RT 更改儲存中，請稍後再掃；本次尚未加入。","error");
    return baseEnqueue(raw);
  };
  document.addEventListener("click",event=>{
    if(!mode.applying) return;
    if(event.target.closest?.("[data-void-item],[data-complete-batch],[data-reopen-batch],[data-use-batch],[data-edit-batch],#clearRcBtn,#undoBtn,#saveBatchBtn")){
      event.preventDefault();event.stopImmediatePropagation();
    }
  },true);
  // The existing presentation script loads next; stamp the combined build after parsing.
  function showBuild(){
    const pill=document.querySelector(".rc-pill");
    if(pill) pill.textContent="RC V0.1.5.2";
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",showBuild,{once:true});
  else showBuild();
  global.OqcRtChangeRc05={VERSION,mode,isModeFor,selectedCount,updateControls,cancel,start,setSelected,
    selectAll,clearSelection,apply,reconcileEmptySources};
})(window);

(function installOqcShippingScanRc06(global){
  "use strict";
  if(global.OqcShippingScanRc06) return;
  const VERSION="OQC_SHIPPING_SCAN_RC_V0_1_6_20260909";
  const GROUP="UNREGISTERED_IQC";
  const missing=value=>value?.iqcLookupStatus==="NOT_FOUND";
  const missingBatch=batch=>batch?.groupKind===GROUP;
  const baseResolve=resolveLookup,basePersist=persistScan,baseItem=itemRowHtml;
  const baseCard=batchCardHtml,baseSelect=renderBatchSelect,baseEdit=editBatch,baseComplete=completeBatch;
  const rt=global.OqcRtChangeRc05;
  const active=item=>item.recordStatus!=="VOIDED";
  const clone=value=>JSON.parse(JSON.stringify(value));
  const error=(code,message)=>Object.assign(new Error(message),{code});

  // Only a successful, exact CTN response with the complete IQC collection schema may
  // establish NOT_FOUND. Transport/auth/JSON errors are never converted to NOT_FOUND.
  resolveLookup=function(result,rawCtn){
    const ctn=normalizeCtn(rawCtn);
    const iqc=result?.iqc;
    if(!isValidCtn(ctn)) throw error("INVALID_CTN","CTN格式錯誤，本次未加入。");
    if(!iqc||["transportCards","bundleCards","bottleRows","submissionRows"].some(key=>!Array.isArray(iqc[key]))||
       result.ok===false||iqc.ok===false||result.error||iqc.error||result.partial===true||iqc.partial===true){
      throw error("IQC_RESULT_INCOMPLETE","IQC查詢回應不完整，無法判定是否未建IQC；請重試。");
    }
    const frame=iqc.transportCards.some(card=>normalizeCtn(card.transportFrameCtn)===ctn);
    const bundle=iqc.bundleCards.some(card=>(card.rows||[]).some(row=>normalizeCtn(row.ctn)===ctn));
    if(frame||bundle) throw error("NOT_A_CYLINDER","此 CTN 為運輸框或集束；本頁目前只收錄單支鋼瓶。");
    try{
      return {...baseResolve(result,ctn),iqcLookupStatus:"FOUND"};
    }catch(err){
      if(err?.code!=="IQC_NOT_FOUND") throw err;
      if(result.queryType!=="CTN"||normalizeCtn(result.normalizedQuery||result.query)!==ctn){
        throw error("IQC_RESULT_INCOMPLETE","IQC查詢結果與本次 CTN 不一致，請重試。");
      }
      return {ctn,rt:"",bottleStatus:"",frameCtn:"",iqcDate:"",regionCode:"",regionName:"",
        currentStation:"",currentStatus:"",iqcLookupStatus:"NOT_FOUND",iqcCheckedAt:nowIso()};
    }
  };

  function nextBatchId(batches){
    const date=ymd().replace(/-/g,"");
    const prefix=`OQC-${date}-`;
    const sameDay=batches.filter(row=>ymd(row.createdAt||row.updatedAt).replace(/-/g,"")===date).length;
    const used=batches.filter(row=>String(row.batchId).startsWith(prefix)).map(row=>Number(row.batchId.slice(prefix.length))||0);
    const next=Math.max(sameDay,0,...used)+1;
    if(next>99) throw error("OQC_BATCH_LIMIT","當日 OQC 掃描批次已達 99 批，請聯絡管理者。");
    return prefix+String(next).padStart(2,"0");
  }
  function makeEvent(batchId,ctn,eventType,before,after,when){
    return {eventId:newId("OQCE"),batchId,ctn,eventType,before:clone(before||{}),after:clone(after||{}),
      note:"OQC RC 本機紀錄；IQC 只讀。",actor:operatorName(),eventAt:when,rcVersion:VERSION};
  }
  async function transaction(plan){
    const db=await Db.openDb();
    return new Promise((resolve,reject)=>{
      const names=["batches","items","events","meta"],snapshot={};
      const tx=db.transaction(names,"readwrite");
      let left=names.length,outcome,failure;
      tx.oncomplete=()=>resolve(outcome);
      tx.onabort=()=>reject(failure||tx.error||error("RC_SAVE_FAILED","本機儲存未完成，本次未加入；請重試。"));
      tx.onerror=()=>{failure=failure||tx.error};
      names.forEach(name=>{
        const req=tx.objectStore(name).getAll();
        req.onsuccess=()=>{
          snapshot[name]=req.result||[];
          if(--left) return;
          try{
            const result=plan(snapshot);outcome=result.outcome;
            Object.entries(result.writes).forEach(([store,rows])=>rows.forEach(row=>tx.objectStore(store).put(row)));
          }catch(err){failure=err;tx.abort()}
        };
      });
    });
  }

  // No upstream API calls and no false RT (0/UNKNOWN) are written here. Keep unknown
  // cylinders in a dedicated group instead of borrowing the selected RT batch's data.
  persistScan=async function(lookup){
    if(!missing(lookup)) return basePersist(lookup);
    if(rt?.mode.applying) throw error("RT_CHANGE_BUSY","RT 更改儲存中，請稍後再掃描。");
    if(!isValidCtn(lookup.ctn)||lookup.rt||lookup.bottleStatus||!lookup.iqcCheckedAt){
      throw error("INVALID_MISSING_IQC","未建IQC資料不完整，本次未加入。");
    }
    const selected=state.activeBatchId,keepSelection=state.lockRt;
    const saved=await transaction(snapshot=>{
      if(snapshot.items.some(item=>active(item)&&item.ctn===lookup.ctn)){
        throw error("DUPLICATE_CTN","CTN已在掃描清單，不重複計數。");
      }
      const when=nowIso();
      let batch=snapshot.batches.filter(row=>row.status==="OPEN"&&missingBatch(row))
        .sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
      const created=!batch;
      if(!batch) batch={batchId:nextBatchId(snapshot.batches),rt:"",groupKind:GROUP,targetQty:null,note:"",
        regionCode:"",regionName:"",status:"OPEN",createdBy:operatorName(),createdAt:when,
        updatedAt:when,lastScanAt:"",completedBy:"",completedAt:"",rcVersion:VERSION};
      const before=clone(batch);
      batch={...batch,updatedAt:when,lastScanAt:when};
      const item={itemId:newId("OQCI"),batchId:batch.batchId,scanEventId:newId("SCAN"),ctn:lookup.ctn,
        rt:"",bottleStatus:"",frameCtn:"",iqcDate:"",iqcLookupStatus:"NOT_FOUND",iqcSourceRt:"",
        iqcCheckedAt:lookup.iqcCheckedAt,currentStation:"",currentStatus:"",oqcStatus:"SCANNED",
        recordStatus:"ACTIVE",scannedBy:operatorName(),scannedAt:when,voidedBy:"",voidedAt:"",voidReason:"",rcVersion:VERSION};
      const events=[makeEvent(batch.batchId,item.ctn,"SCAN",{},item,when),
        makeEvent(batch.batchId,"",created?"BATCH_CREATED":"BATCH_UPDATED",created?{}:before,batch,when)];
      const selectedStillOpen=snapshot.batches.some(row=>row.batchId===selected&&row.status==="OPEN");
      const activeId=keepSelection&&selectedStillOpen?selected:batch.batchId;
      return {writes:{items:[item],batches:[batch],events,meta:[{key:META_ACTIVE_BATCH,value:activeId,updatedAt:when}]},
        outcome:{batch,item,events,activeId}};
    });
    state.items.push(saved.item);
    state.batches=state.batches.filter(row=>row.batchId!==saved.batch.batchId).concat(saved.batch);
    state.events.push(...saved.events);
    state.activeBatchId=saved.activeId;state.expanded.add(saved.batch.batchId);
    renderAll();
    return saved;
  };

  // Retain the existing two-worker lookup scheduler and serialized persistence chain.
  processScanEntry=async function(entry){
    try{
      const existing=findActiveItemByCtn(entry.ctn);
      if(existing){
        state.expanded.add(existing.batchId);
        if(batchById(existing.batchId)?.status==="OPEN") await setActiveBatch(existing.batchId);
        finishQueueEntry(entry,"duplicate",missing(existing)?"CTN已在未建IQC清單，不重複計數。":`CTN已存在｜RT ${existing.rt}`);
        toast("CTN已存在，系統未重複計數。","error");return;
      }
      entry.message="RT查詢中";renderQueue();
      const lookup=await lookupBottle(entry.ctn);
      entry.message=missing(lookup)?"未建IQC，正在保存 CTN…":`RT ${lookup.rt} 查詢完成，正在加入 OQC…`;
      renderQueue();
      const task=state.persistChain.catch(()=>undefined).then(()=>persistScan(lookup));
      state.persistChain=task.catch(()=>undefined);
      const saved=await task;
      const message=missing(saved.item)?`${entry.ctn}｜未建IQC，CTN已收錄。`:`CTN已加入OQC待檢｜${entry.ctn}｜RT ${saved.item.rt}`;
      finishQueueEntry(entry,"success",message);
      toast(message,missing(saved.item)?"warning":"success");vibrate(35);
    }catch(err){
      let message=String(err?.message||"RT查詢失敗");
      if(err?.code==="NETWORK_TIMEOUT") message="RT查詢逾時，尚未確認IQC；本次未加入，請恢復網路後重掃。";
      if(err?.code==="NETWORK_ERROR") message="RT查詢連線失敗，尚未確認IQC；本次未加入，請恢復網路後重掃。";
      finishQueueEntry(entry,err?.code==="DUPLICATE_CTN"?"duplicate":"error",message);
      toast(message,"error");vibrate([60,80,60]);
    }
  };

  itemRowHtml=function(item,index,voidable){
    if(!missing(item)) return baseItem(item,index,voidable);
    return `<div class="swipe-shell" data-item-shell="${escapeHtml(item.itemId)}">
      <div class="swipe-actions"><button class="void-btn" type="button" data-void-item="${escapeHtml(item.itemId)}">作廢誤掃</button></div>
      <div class="scan-item oqc-two-line oqc-no-iqc" data-swipe-item="${escapeHtml(item.itemId)}" data-voidable="${voidable?"1":"0"}">
        <div class="item-no">${index}</div>
        <div class="item-main"><div class="item-main-top"><div class="item-ctn">${escapeHtml(item.ctn)}</div></div></div>
        <div class="item-state"><strong class="oqc-no-iqc-label">未建IQC</strong><small>${escapeHtml(shortTime(item.scannedAt))}</small></div>
      </div></div>`;
  };
  batchCardHtml=function(batch){
    const html=baseCard(batch);
    if(!missingBatch(batch)) return html;
    return html.replace(`<strong>RT ${escapeHtml(batch.rt)}</strong>`,"<strong>未建IQC</strong>")
      .replace(/<button\b[^>]*\bdata-rt-change-batch="[^"]*"[^>]*>[\s\S]*?<\/button>/g,"");
  };
  renderBatchSelect=function(){
    baseSelect();
    Array.from($("activeBatchSelect").options).forEach(option=>{
      const batch=batchById(option.value);
      if(missingBatch(batch)) option.textContent=`未建IQC｜${activeItemsForBatch(batch.batchId).length}${batch.targetQty?"/"+batch.targetQty:""}`;
    });
  };
  editBatch=async function(batchId){
    await baseEdit(batchId);
    if(missingBatch(batchById(batchId))) $("batchDialogTitle").textContent="未建IQC 批次設定";
  };
  completeBatch=async function(batchId){
    if(state.queue.some(row=>row.status==="queued"||row.status==="processing")){
      return toast("尚有 CTN 查詢中，請等清單更新完成再結束批次。","error");
    }
    if(!missingBatch(batchById(batchId))) return baseComplete(batchId);
    if(rt?.mode.applying) return;
    const current=batchById(batchId);
    if(current?.status!=="OPEN") return;
    const count=activeItemsForBatch(batchId).length;
    if(!count) return toast("空白批次不能完成。","error");
    if(!confirm(`確定完成未建IQC掃描批次，共 ${count} 支？\n僅保存 RC 本機資料，不代表 IQC 完成或出貨放行。`)) return;
    try{
      const outcome=await transaction(snapshot=>{
        const batch=snapshot.batches.find(row=>row.batchId===batchId);
        if(batch?.status!=="OPEN"||snapshot.items.filter(item=>item.batchId===batchId&&active(item)).length!==count){
          throw error("BATCH_CHANGED","批次資料已變更，請重新整理後再試。");
        }
        const when=nowIso(),after={...batch,status:"COMPLETED",completedAt:when,completedBy:operatorName(),updatedAt:when};
        const selected=snapshot.meta.find(row=>row.key===META_ACTIVE_BATCH)?.value;
        const next=selected===batchId?(snapshot.batches.find(row=>row.status==="OPEN"&&row.batchId!==batchId)?.batchId||""):selected;
        return {writes:{batches:[after],events:[makeEvent(batchId,"","BATCH_COMPLETED",batch,after,when)],
          meta:[{key:META_ACTIVE_BATCH,value:next||"",updatedAt:when}]},outcome:after};
      });
      await reloadData();toast("掃描批次已完成；未建IQC標記保留，尚未送出正式資料。","success");
      return outcome;
    }catch(err){toast(err?.message||"完成批次失敗，請重新整理確認。","error")}
  };
  // Do not fabricate an IQC source or hide a manually supplied RT on a missing-IQC row.
  // Manual RT assignment for unregistered cylinders is intentionally not part of this RC.
  if(rt){
    const start=rt.start,apply=rt.apply;
    rt.start=function(batchId){
      if(missingBatch(batchById(batchId))) return toast("未建IQC清單僅收錄 CTN，不套用 RT 或狀態。","error");
      return start(batchId);
    };
    rt.apply=function(batchId){
      if(missingBatch(batchById(batchId))||Array.from(rt.mode.selected).some(id=>missing(state.items.find(item=>item.itemId===id)))){
        return toast("未建IQC鋼瓶不會套用 RT 或狀態。","error");
      }
      return apply(batchId);
    };
  }
  const style=document.createElement("style");
  style.id="oqcNoIqcRc016Style";
  style.textContent=`
    .scan-item.oqc-no-iqc{grid-template-columns:24px minmax(0,1fr) auto!important;min-height:56px}
    .oqc-no-iqc .item-main-top{grid-column:2;grid-row:1/3;align-self:center}
    .oqc-no-iqc .item-state{display:block!important;grid-column:3;grid-row:1/3;align-self:center}
    .oqc-no-iqc .item-state .oqc-no-iqc-label{color:#ff7179!important;font-size:13px!important;white-space:nowrap}
    .toast.warning{border-color:#ffc861;color:#ffe0a0}
  `;
  document.head.appendChild(style);
  const showBuild=()=>{const pill=document.querySelector(".rc-pill");if(pill) pill.textContent="RC V0.1.6"};
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",showBuild,{once:true});
  else showBuild();
  global.OqcShippingScanRc06=Object.freeze({version:VERSION});
})(window);

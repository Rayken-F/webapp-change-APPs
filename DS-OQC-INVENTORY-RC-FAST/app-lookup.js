function candidateKey(row){
  return [row.ctn,row.rt,row.frameCtn,row.bottleStatus,row.iqcDate].map(value=>String(value||"")).join("|");
}

function collectBottleCandidates(result,ctn){
  const iqc=result?.iqc||{};
  const candidates=[];
  const bundleMatches=[];

  const addRows=(rows,context={})=>{
    (Array.isArray(rows)?rows:[]).forEach(row=>{
      if(normalizeCtn(row?.ctn)!==ctn) return;
      candidates.push({
        ctn,
        rt:String(row.rt||"").trim().replace(/^RT/i,""),
        frameCtn:normalizeCtn(row.transportFrameCtn||context.frameCtn||""),
        bottleStatus:String(row.bottleStatus||row.status||"").trim(),
        iqcDate:row.date||row.createdAt||context.date||"",
        regionCode:String(row.regionCode||context.regionCode||"").trim(),
        regionName:String(row.regionName||context.regionName||"").trim()
      });
    });
  };

  (iqc.transportCards||[]).forEach(card=>addRows(card.rows,{
    frameCtn:card.transportFrameCtn,
    date:card.createdAt||card.date,
    regionCode:card.regionCode,
    regionName:card.regionName
  }));
  addRows(iqc.bottleRows||[]);
  addRows(iqc.submissionRows||[]);

  (iqc.bundleCards||[]).forEach(card=>{
    (card.rows||[]).forEach(row=>{
      if(normalizeCtn(row.ctn)===ctn) bundleMatches.push(row);
    });
  });

  const unique=[];
  const seen=new Set();
  candidates.forEach(row=>{
    const key=candidateKey(row);
    if(!seen.has(key)){
      seen.add(key);
      unique.push(row);
    }
  });

  return {candidates:unique,bundleMatches};
}

function resolveCurrentState(result,ctn){
  const current=(result?.ctnCurrentState||[]).find(row=>normalizeCtn(row.ctn)===ctn)||null;
  const grinding=(result?.grinding||[]).find(row=>normalizeCtn(row.asset_ctn||row.source_ctn)===ctn)||null;
  return {
    currentStation:current?.current_station_code||grinding?.current_station||"",
    currentStatus:current?.current_station_status||current?.status||grinding?.station_status||grinding?.lifecycle_status||"",
    currentFrameCtn:normalizeCtn(current?.current_frame_ctn||grinding?.current_frame_ctn||"")
  };
}

function resolveLookup(result,ctn){
  const {candidates,bundleMatches}=collectBottleCandidates(result,ctn);

  if(!candidates.length){
    if(bundleMatches.length){
      const err=new Error("此 CTN 為集束；OQC 庫存掃描初版目前只支援散支鋼瓶。");
      err.code="BUNDLE_NOT_SUPPORTED";
      throw err;
    }
    const err=new Error("CTN未建立IQC");
    err.code="IQC_NOT_FOUND";
    throw err;
  }

  const rts=Array.from(new Set(candidates.map(row=>String(row.rt||"")).filter(Boolean)));
  if(rts.length!==1||!/^\d+$/.test(rts[0])){
    const err=new Error(rts.length>1?`IQC資料衝突：同一 CTN 查到多個 RT（${rts.join("、")}）`:`IQC資料缺少有效 RT：${ctn}`);
    err.code="IQC_RT_CONFLICT";
    throw err;
  }

  const frames=Array.from(new Set(candidates.map(row=>normalizeCtn(row.frameCtn)).filter(Boolean)));
  if(frames.length>1){
    const err=new Error(`IQC資料衝突：同一 CTN 查到多個運輸框（${frames.join("、")}）`);
    err.code="IQC_FRAME_CONFLICT";
    throw err;
  }

  const sorted=candidates.slice().sort((a,b)=>{
    const ta=new Date(a.iqcDate||0).getTime()||0;
    const tb=new Date(b.iqcDate||0).getTime()||0;
    return tb-ta;
  });
  const chosen=sorted[0];
  const current=resolveCurrentState(result,ctn);

  return {
    ctn,
    rt:rts[0],
    frameCtn:frames[0]||current.currentFrameCtn||"",
    bottleStatus:chosen.bottleStatus||"",
    iqcDate:chosen.iqcDate||"",
    regionCode:chosen.regionCode||"",
    regionName:chosen.regionName||"",
    currentStation:current.currentStation,
    currentStatus:current.currentStatus
  };
}

async function lookupBottle(ctn){
  if(!state.authReady&&!getStoredToken()) throw new Error("請先登入 DS 工作台");
  const response=await Api.post("lookup",{query:ctn});
  return resolveLookup(response.result,ctn);
}

function createBatchId(rt){
  const date=ymd().replace(/-/g,"");
  const prefix=`OQC-RC-${date}-${rt}-`;
  const used=state.batches
    .map(row=>String(row.batchId||""))
    .filter(value=>value.startsWith(prefix))
    .map(value=>Number(value.slice(prefix.length))||0);
  const next=(Math.max(0,...used)+1).toString().padStart(2,"0");
  return prefix+next;
}

async function setActiveBatch(batchId){
  const batch=batchById(batchId);
  state.activeBatchId=batch&&batch.status==="OPEN"?batch.batchId:"";
  if(state.activeBatchId) state.expanded.add(state.activeBatchId);
  await Db.setMeta(META_ACTIVE_BATCH,state.activeBatchId);
  renderAll();
}

async function ensureBatchForLookup(lookup){
  const selected=currentBatch();
  if(state.lockRt&&selected&&selected.status==="OPEN"&&String(selected.rt)!==String(lookup.rt)){
    const err=new Error(`RT已鎖定為 ${selected.rt}；掃描 CTN ${lookup.ctn} 屬於 RT ${lookup.rt}，本次未加入。`);
    err.code="RT_LOCKED";
    throw err;
  }

  let batch=openBatchForRt(lookup.rt);
  if(!batch){
    const now=nowIso();
    batch={
      batchId:createBatchId(lookup.rt),
      rt:lookup.rt,
      targetQty:null,
      note:"",
      regionCode:lookup.regionCode||"",
      regionName:lookup.regionName||"",
      status:"OPEN",
      createdBy:operatorName(),
      createdAt:now,
      updatedAt:now,
      lastScanAt:"",
      completedBy:"",
      completedAt:"",
      rcVersion:RC_VERSION
    };
    await Db.put("batches",batch);
    state.batches.unshift(batch);
    await addEvent(batch.batchId,"", "BATCH_CREATED",{},batch);
  }

  if(!state.activeBatchId||!state.lockRt||String(currentBatch()?.rt)===String(lookup.rt)){
    state.activeBatchId=batch.batchId;
    state.expanded.add(batch.batchId);
    await Db.setMeta(META_ACTIVE_BATCH,batch.batchId);
  }
  return batch;
}

async function addEvent(batchId,ctn,eventType,before,after,note=""){
  const row={
    eventId:newId("OQCE"),
    batchId:batchId||"",
    ctn:ctn||"",
    eventType,
    before:before||{},
    after:after||{},
    note,
    actor:operatorName(),
    eventAt:nowIso(),
    rcVersion:RC_VERSION
  };
  await Db.put("events",row);
  state.events.push(row);
  return row;
}

async function persistScan(lookup){
  const duplicate=findActiveItemByCtn(lookup.ctn);
  if(duplicate){
    const batch=batchById(duplicate.batchId);
    if(batch){
      state.activeBatchId=batch.status==="OPEN"?batch.batchId:state.activeBatchId;
      state.expanded.add(batch.batchId);
      await Db.setMeta(META_ACTIVE_BATCH,state.activeBatchId);
    }
    const err=new Error(batch?.status==="COMPLETED"
      ? `CTN已在已完成掃描批次：RT ${duplicate.rt}`
      : `CTN已在本批次：RT ${duplicate.rt}`);
    err.code="DUPLICATE_CTN";
    throw err;
  }

  const batch=await ensureBatchForLookup(lookup);
  const now=nowIso();
  const item={
    itemId:newId("OQCI"),
    batchId:batch.batchId,
    scanEventId:newId("SCAN"),
    ctn:lookup.ctn,
    rt:lookup.rt,
    frameCtn:lookup.frameCtn||"",
    bottleStatus:lookup.bottleStatus||"",
    iqcDate:lookup.iqcDate||"",
    currentStation:lookup.currentStation||"",
    currentStatus:lookup.currentStatus||"",
    oqcStatus:"SCANNED",
    recordStatus:"ACTIVE",
    scannedBy:operatorName(),
    scannedAt:now,
    voidedBy:"",
    voidedAt:"",
    voidReason:"",
    rcVersion:RC_VERSION
  };

  const before={...batch};
  batch.updatedAt=now;
  batch.lastScanAt=now;
  if(!batch.regionCode&&lookup.regionCode) batch.regionCode=lookup.regionCode;
  if(!batch.regionName&&lookup.regionName) batch.regionName=lookup.regionName;

  await Promise.all([
    Db.put("items",item),
    Db.put("batches",batch)
  ]);
  state.items.push(item);
  state.batches=state.batches.map(row=>row.batchId===batch.batchId?batch:row);
  await addEvent(batch.batchId,item.ctn,"SCAN",{},item,`IQC RT ${item.rt}`);
  await addEvent(batch.batchId,"","BATCH_UPDATED",before,batch,"新增掃描鋼瓶");
  renderAll();
  return {batch,item};
}

async function processScanEntry(entry){
  try{
    const existing=findActiveItemByCtn(entry.ctn);
    if(existing){
      const batch=batchById(existing.batchId);
      if(batch){
        state.expanded.add(batch.batchId);
        if(batch.status==="OPEN") await setActiveBatch(batch.batchId);
      }
      finishQueueEntry(entry,"duplicate",batch?.status==="COMPLETED"
        ? `已在已完成批次 RT ${existing.rt}`
        : `已在開放批次 RT ${existing.rt}`);
      toast("CTN已存在，系統未重複計數。","error");
      vibrate([40,50,40]);
      return;
    }

    const lookup=await lookupBottle(entry.ctn);
    entry.message=`IQC確認 RT ${lookup.rt}，正在加入 OQC…`;
    renderQueue();
    const saved=await persistScan(lookup);
    finishQueueEntry(entry,"success",`RT ${lookup.rt}｜運輸框 ${lookup.frameCtn||"無"}`);
    toast(`CTN已加入OQC待檢｜${lookup.ctn}｜RT ${lookup.rt}`,"success");
    vibrate(35);
    state.expanded.add(saved.batch.batchId);
  }catch(err){
    const code=String(err?.code||"");
    if(code==="DUPLICATE_CTN"){
      finishQueueEntry(entry,"duplicate",err.message);
    }else{
      finishQueueEntry(entry,"error",err?.message||"掃描失敗");
    }
    toast(err?.message||"掃描失敗","error");
    vibrate([60,80,60]);
  }
}

async function processQueue(){
  if(state.processing) return;
  state.processing=true;
  try{
    while(true){
      const entry=state.queue.find(row=>row.status==="processing"&&!row.started);
      if(!entry) break;
      entry.started=true;
      renderQueue();
      await processScanEntry(entry);
    }
  }finally{
    state.processing=false;
    focusScan();
  }
}

function enqueueScan(raw){
  const ctn=normalizeCtn(raw);
  if(!ctn){
    toast("請掃描或輸入鋼瓶 CTN","error");
    return;
  }
  if(!isValidCtn(ctn)){
    toast("CTN格式錯誤：需為7碼，前2英文、3–4數字、5–6英文、第7碼英數","error");
    vibrate([60,80,60]);
    return;
  }
  if(state.queue.some(row=>row.ctn===ctn&&row.status==="processing")){
    toast("此 CTN 正在辨識中，請勿重複掃描。","error");
    return;
  }
  const entry=addQueueEntry(ctn);
  $("scanInput").value="";
  processQueue();
  return entry;
}

function focusScan(){
  if(!$("scanInput").disabled){
    setTimeout(()=>{
      try{$("scanInput").focus({preventScroll:true})}catch(_){$("scanInput").focus()}
    },60);
  }
}


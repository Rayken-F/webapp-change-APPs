(function installOqcRtLookupSpeedRc03(){
  "use strict";

  const VERSION="OQC_RT_LOOKUP_SPEED_RC03_20260902";
  const MAX_RT_LOOKUP_CONCURRENCY=2;
  const RT_CACHE_TTL_MS=10*60*1000;

  if(window.__OQC_RT_LOOKUP_SPEED_RC03__) return;

  const style=document.createElement("style");
  style.id="oqcRtLookupSpeedRc03Style";
  style.textContent=`
    .queue-item.queued .queue-spinner{
      border:0;
      animation:none;
      display:grid;
      place-items:center;
      color:var(--muted);
    }
    .queue-item.queued .queue-spinner::before{
      content:"…";
      font-size:19px;
      font-weight:900;
      line-height:1;
    }
  `;
  document.head.appendChild(style);

  state.rtLookupWorkers=0;
  state.persistChain=Promise.resolve();
  state.rtLookupCache=new Map();
  state.processing=false;

  function queueLabel(entry){
    if(entry.status==="queued") return "等待中";
    if(entry.status==="processing") return "RT查詢中";
    if(entry.status==="success") return "已加入";
    if(entry.status==="duplicate") return "未重複";
    return "未加入";
  }

  function cachedLookup(ctn){
    const row=state.rtLookupCache.get(ctn);
    if(!row) return null;
    if(Date.now()>row.expiresAt){
      state.rtLookupCache.delete(ctn);
      return null;
    }
    return {...row.value,cacheHit:true};
  }

  function saveLookupCache(value){
    if(!value?.ctn||!value?.rt) return;
    state.rtLookupCache.set(normalizeCtn(value.ctn),{
      value:{...value,cacheHit:false},
      expiresAt:Date.now()+RT_CACHE_TTL_MS
    });
  }

  function cacheWholeLookupResult(result){
    const ctns=new Set();
    const iqc=result?.iqc||{};

    (iqc.transportCards||[]).forEach(card=>{
      (card.rows||[]).forEach(row=>{
        const ctn=normalizeCtn(row?.ctn);
        if(ctn) ctns.add(ctn);
      });
    });
    (iqc.bottleRows||[]).forEach(row=>{
      const ctn=normalizeCtn(row?.ctn);
      if(ctn) ctns.add(ctn);
    });
    (iqc.submissionRows||[]).forEach(row=>{
      const ctn=normalizeCtn(row?.ctn);
      if(ctn) ctns.add(ctn);
    });

    ctns.forEach(ctn=>{
      try{saveLookupCache(resolveLookup(result,ctn))}catch(_){ }
    });
  }

  lookupBottle=async function(ctn){
    if(!state.authReady&&!getStoredToken()) throw new Error("請先登入 DS 工作台");

    const normalized=normalizeCtn(ctn);
    const cached=cachedLookup(normalized);
    if(cached) return cached;

    const response=await Api.post("lookup",{query:normalized});
    cacheWholeLookupResult(response.result);

    const afterCache=cachedLookup(normalized);
    if(afterCache) return {...afterCache,cacheHit:false};

    const resolved=resolveLookup(response.result,normalized);
    saveLookupCache(resolved);
    return {...resolved,cacheHit:false};
  };

  renderQueue=function(){
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
        <div class="queue-main">
          <strong>${escapeHtml(entry.ctn)}</strong>
          <span>${escapeHtml(entry.message||"RT查詢中")}</span>
        </div>
        <div class="queue-state">${escapeHtml(queueLabel(entry))}</div>
      </div>`).join("");
  };

  addQueueEntry=function(ctn){
    const entry={
      queueId:newId("SCANQ"),
      ctn,
      status:"queued",
      message:"等待 RT 查詢",
      createdAt:Date.now(),
      started:false
    };
    state.queue.push(entry);
    renderQueue();
    return entry;
  };

  function persistInOrder(lookup){
    const task=state.persistChain
      .catch(()=>undefined)
      .then(()=>persistScan(lookup));

    state.persistChain=task.catch(()=>undefined);
    return task;
  }

  processScanEntry=async function(entry){
    try{
      const existing=findActiveItemByCtn(entry.ctn);
      if(existing){
        const batch=batchById(existing.batchId);
        if(batch){
          state.expanded.add(batch.batchId);
          if(batch.status==="OPEN") await setActiveBatch(batch.batchId);
        }
        finishQueueEntry(
          entry,
          "duplicate",
          batch?.status==="COMPLETED"
            ? `已在已完成批次 RT ${existing.rt}`
            : `已在開放批次 RT ${existing.rt}`
        );
        toast("CTN已存在，系統未重複計數。","error");
        vibrate([40,50,40]);
        return;
      }

      entry.message="RT查詢中";
      renderQueue();

      const lookup=await lookupBottle(entry.ctn);
      entry.message=lookup.cacheHit
        ? `RT ${lookup.rt} 已取得，正在加入 OQC…`
        : `RT ${lookup.rt} 查詢完成，正在加入 OQC…`;
      renderQueue();

      // RT 查詢可並行；IndexedDB 寫入與批次建立保持單一路徑，避免同 RT 競態建立重複批次。
      const saved=await persistInOrder(lookup);

      finishQueueEntry(
        entry,
        "success",
        `RT ${lookup.rt}｜運輸框 ${lookup.frameCtn||"無"}`
      );
      toast(`CTN已加入OQC待檢｜${lookup.ctn}｜RT ${lookup.rt}`,"success");
      vibrate(35);
      state.expanded.add(saved.batch.batchId);
    }catch(err){
      const code=String(err?.code||"");
      let message=String(err?.message||"掃描失敗");

      if(code==="NETWORK_TIMEOUT"){
        message="RT查詢逾時，已停止等待；請確認網路後重新掃描。";
      }else if(code==="NETWORK_ERROR"){
        message="RT查詢連線失敗；請確認網路後重新掃描。";
      }

      finishQueueEntry(
        entry,
        code==="DUPLICATE_CTN"?"duplicate":"error",
        message
      );
      toast(message,"error");
      vibrate([60,80,60]);
    }
  };

  processQueue=function(){
    while(state.rtLookupWorkers<MAX_RT_LOOKUP_CONCURRENCY){
      const entry=state.queue.find(row=>row.status==="queued"&&!row.started);
      if(!entry) break;

      entry.started=true;
      entry.startedAt=Date.now();
      entry.status="processing";
      entry.message="RT查詢中";
      state.rtLookupWorkers+=1;
      renderQueue();

      Promise.resolve(processScanEntry(entry))
        .catch(err=>{
          console.error("OQC RC RT lookup worker failed",err);
          finishQueueEntry(entry,"error",err?.message||"RT查詢失敗");
        })
        .finally(()=>{
          state.rtLookupWorkers=Math.max(0,state.rtLookupWorkers-1);
          processQueue();

          const pending=state.queue.some(row=>
            row.status==="queued"||row.status==="processing"
          );
          if(!pending&&state.rtLookupWorkers===0) focusScan();
        });
    }
  };

  enqueueScan=function(raw){
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

    if(state.queue.some(row=>
      row.ctn===ctn&&
      (row.status==="queued"||row.status==="processing")
    )){
      toast("此 CTN 正在 RT 查詢中，請勿重複掃描。","error");
      return;
    }

    const entry=addQueueEntry(ctn);
    $("scanInput").value="";
    processQueue();
    return entry;
  };

  const rcPill=document.querySelector(".rc-pill");
  if(rcPill) rcPill.textContent="RC V0.1.2";

  window.__OQC_RT_LOOKUP_SPEED_RC03__=Object.freeze({
    version:VERSION,
    maxConcurrency:MAX_RT_LOOKUP_CONCURRENCY,
    cacheTtlMs:RT_CACHE_TTL_MS,
    cacheSize:()=>state.rtLookupCache.size
  });
})(window);

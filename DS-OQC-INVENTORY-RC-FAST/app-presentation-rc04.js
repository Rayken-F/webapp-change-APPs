(function installOqcInventoryPresentationRc04(){
  "use strict";

  const VERSION="OQC_INVENTORY_PRESENTATION_RC04_20260907";
  const BATCH_PREFIX="OQC";

  if(window.__OQC_INVENTORY_PRESENTATION_RC04__) return;

  function batchDateKey(batch){
    const value=batch?.createdAt||batch?.updatedAt||new Date();
    return ymd(value).replace(/-/g,"")||ymd().replace(/-/g,"");
  }

  function batchesForDate(dateKey){
    return state.batches
      .filter(batch=>batchDateKey(batch)===dateKey)
      .slice()
      .sort((a,b)=>{
        const timeA=String(a.createdAt||a.updatedAt||"");
        const timeB=String(b.createdAt||b.updatedAt||"");
        const byTime=timeA.localeCompare(timeB);
        return byTime!==0?byTime:String(a.batchId||"").localeCompare(String(b.batchId||""));
      });
  }

  function canonicalBatchNo(batch){
    const actual=String(batch?.batchId||"");
    if(/^OQC-\d{8}-\d{2}$/.test(actual)) return actual;

    const dateKey=batchDateKey(batch);
    const sameDay=batchesForDate(dateKey);
    const index=Math.max(0,sameDay.findIndex(row=>row.batchId===batch.batchId));
    return `${BATCH_PREFIX}-${dateKey}-${String(index+1).padStart(2,"0")}`;
  }

  createBatchId=function(){
    const dateKey=ymd().replace(/-/g,"");
    const prefix=`${BATCH_PREFIX}-${dateKey}-`;
    const sameDayCount=batchesForDate(dateKey).length;
    const used=state.batches
      .map(row=>String(row.batchId||""))
      .filter(value=>value.startsWith(prefix))
      .map(value=>Number(value.slice(prefix.length))||0);
    const next=Math.max(sameDayCount,...used)+1;

    if(next>99){
      const err=new Error("當日 OQC 掃描批次已達 99 批，請聯絡管理者。");
      err.code="OQC_BATCH_LIMIT";
      throw err;
    }

    return prefix+String(next).padStart(2,"0");
  };

  itemRowHtml=function(item,index,voidable){
    const bottleStatus=String(item.bottleStatus||"無狀態").trim()||"無狀態";

    return `
      <div class="swipe-shell" data-item-shell="${escapeHtml(item.itemId)}">
        <div class="swipe-actions">
          <button class="void-btn" type="button" data-void-item="${escapeHtml(item.itemId)}">作廢誤掃</button>
        </div>
        <div class="scan-item" data-swipe-item="${escapeHtml(item.itemId)}" data-voidable="${voidable?"1":"0"}">
          <div class="item-no">${index}</div>
          <div class="item-main">
            <div class="item-ctn">${escapeHtml(item.ctn)}</div>
            <div class="item-sub item-sub-primary">
              <span class="item-rt">RT ${escapeHtml(item.rt)}</span>
              <span class="item-bottle-status">狀態 ${escapeHtml(bottleStatus)}</span>
            </div>
          </div>
          <div class="item-state">
            <strong>OQC 待檢</strong>
            <small>${escapeHtml(shortTime(item.scannedAt))}</small>
          </div>
        </div>
      </div>`;
  };

  batchCardHtml=function(batch){
    const items=activeItemsForBatch(batch.batchId);
    const voided=voidItemsForBatch(batch.batchId).length;
    const expanded=state.expanded.has(batch.batchId);
    const active=batch.batchId===state.activeBatchId;
    const completed=batch.status==="COMPLETED";
    const target=Number(batch.targetQty||0);
    const pct=batchProgress(batch,items.length);
    const displayBatchNo=canonicalBatchNo(batch);

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
            <div class="meta-box"><span>批次編號</span><strong>${escapeHtml(displayBatchNo)}</strong></div>
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
  };

  const style=document.createElement("style");
  style.id="oqcInventoryPresentationRc04Style";
  style.textContent=`
    .item-menu-btn{display:none!important}
    .item-sub-primary{
      display:flex;
      align-items:center;
      gap:18px;
      margin-top:8px;
      font-size:16px!important;
      line-height:1.35;
    }
    .item-sub-primary .item-rt,
    .item-sub-primary .item-bottle-status{
      display:inline-flex;
      align-items:center;
      color:#dce5ff;
      font-size:16px!important;
      font-weight:800;
      letter-spacing:.01em;
    }
    .item-sub-primary .item-bottle-status{color:#b9c7ec}
    .item-state strong{font-size:14px!important}
    .item-state small{font-size:11px!important}
    @media(max-width:680px){
      .item-sub-primary{
        gap:14px;
        font-size:17px!important;
      }
      .item-sub-primary .item-rt,
      .item-sub-primary .item-bottle-status{
        font-size:17px!important;
      }
    }
  `;
  document.head.appendChild(style);

  const rcPill=document.querySelector(".rc-pill");
  if(rcPill) rcPill.textContent="RC V0.1.4";

  window.__OQC_INVENTORY_PRESENTATION_RC04__=Object.freeze({
    version:VERSION,
    canonicalBatchNo
  });
})(window);

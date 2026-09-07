(function installOqcRtChangeViewRc05(global){
  "use strict";

  const rt=global.OqcRtChangeRc05;
  if(!rt||global.__OQC_INVENTORY_RT_CHANGE_VIEW_RC05__) return;

  const originalBindBatchInteractions=bindBatchInteractions;

  function statusOf(item){
    return String(item?.bottleStatus||"無狀態").trim()||"無狀態";
  }

  function latestChange(item){
    const history=Array.isArray(item?.rtChangeHistory)?item.rtChangeHistory:[];
    return history.length?history[history.length-1]:null;
  }

  function toolbar(batch){
    if(!rt.isModeFor(batch.batchId)) return "";
    return `
      <section class="rt-change-panel" data-rt-change-panel="${escapeHtml(batch.batchId)}">
        <div class="rt-change-head">
          <div><strong>RT 更改</strong><span>已選 <b data-rt-selected-count>${rt.selectedCount()}</b> 支</span></div>
          <button class="rt-change-close" type="button" data-rt-change-cancel="${escapeHtml(batch.batchId)}">×</button>
        </div>
        <div class="rt-change-quick-actions">
          <button class="secondary-btn compact" type="button" data-rt-select-all="${escapeHtml(batch.batchId)}">全選</button>
          <button class="secondary-btn compact" type="button" data-rt-select-clear="${escapeHtml(batch.batchId)}">清除</button>
        </div>
        <div class="rt-change-input-row">
          <label><span>新 RT</span><input type="text" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="輸入新 RT" data-rt-change-input="${escapeHtml(batch.batchId)}"></label>
          <button class="primary-btn rt-change-apply" type="button" data-rt-change-apply="${escapeHtml(batch.batchId)}" ${rt.selectedCount()?"":"disabled"}>套用更改</button>
        </div>
        <p>新 RT 會成為有效資料；原 RT 與每次轉換紀錄仍保留於 RC Event Log。</p>
      </section>`;
  }

  itemRowHtml=function(item,index,voidable){
    const status=statusOf(item);
    const change=latestChange(item);
    const selectable=rt.isModeFor(item.batchId)&&voidable;
    const checked=rt.mode.selected.has(item.itemId);
    const leading=selectable
      ? `<label class="rt-select-check" aria-label="選取 ${escapeHtml(item.ctn)}"><input type="checkbox" data-rt-select-item="${escapeHtml(item.itemId)}" ${checked?"checked":""}><span></span></label>`
      : `<div class="item-no">${index}</div>`;

    const detail=change
      ? `<div class="item-main-top"><div class="item-ctn">${escapeHtml(item.ctn)}</div><span class="item-status-inline">狀態 ${escapeHtml(status)}</span></div>
         <div class="item-rt-history"><span class="rt-old">RT ${escapeHtml(change.oldRt)}</span><b>→</b><span class="rt-new">${escapeHtml(change.newRt)}</span></div>`
      : `<div class="item-ctn">${escapeHtml(item.ctn)}</div>
         <div class="item-sub item-sub-inline"><span class="item-rt">RT ${escapeHtml(item.rt)}</span><span class="item-bottle-status">狀態 ${escapeHtml(status)}</span></div>`;

    return `
      <div class="swipe-shell ${selectable?"rt-change-selection":""}" data-item-shell="${escapeHtml(item.itemId)}">
        <div class="swipe-actions"><button class="void-btn" type="button" data-void-item="${escapeHtml(item.itemId)}">作廢誤掃</button></div>
        <div class="scan-item" data-swipe-item="${escapeHtml(item.itemId)}" data-voidable="${voidable&&!selectable?"1":"0"}">
          ${leading}
          <div class="item-main">${detail}</div>
          <div class="item-state"><strong>OQC 待檢</strong><small>${escapeHtml(shortTime(item.scannedAt))}</small></div>
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
    const displayNo=global.__OQC_INVENTORY_PRESENTATION_RC04__?.canonicalBatchNo
      ? global.__OQC_INVENTORY_PRESENTATION_RC04__.canonicalBatchNo(batch)
      : String(batch.batchId||"");
    const changing=rt.isModeFor(batch.batchId);
    const rows=items.length
      ? items.map((item,index)=>itemRowHtml(item,index+1,!completed)).join("")
      : '<div class="item-empty">此批次尚未掃描鋼瓶。</div>';

    return `
      <article class="batch-card ${active?"active":""} ${completed?"completed":""} ${changing?"rt-change-mode":""}" data-batch-id="${escapeHtml(batch.batchId)}">
        <button class="batch-summary" type="button" data-toggle-batch="${escapeHtml(batch.batchId)}">
          <div>
            <div class="batch-title-row"><strong>RT ${escapeHtml(batch.rt)}</strong><span class="batch-status">${completed?"掃描完成":"OPEN"}</span>${active&&!completed?'<span class="batch-status">目前批次</span>':""}</div>
            <div class="batch-sub">${escapeHtml(batch.note||batch.regionCode||"分次掃描批次")}｜最後更新 ${escapeHtml(shortTime(batch.updatedAt))}</div>
          </div>
          <div class="batch-count">${items.length}${target?` / ${target}`:""}<small>${target?"已掃 / 標籤總量":"已掃描支數"}</small></div>
        </button>
        <div class="batch-detail ${expanded?"":"hidden"}">
          <div class="batch-meta">
            <div class="meta-box"><span>批次編號</span><strong>${escapeHtml(displayNo)}</strong></div>
            <div class="meta-box"><span>建立人員</span><strong>${escapeHtml(batch.createdBy||"-")}</strong></div>
            <div class="meta-box"><span>作廢誤掃</span><strong>${voided} 支</strong></div>
          </div>
          ${target?`<div class="progress-track"><i style="width:${pct.toFixed(1)}%"></i></div>`:""}
          <div class="batch-actions batch-actions-four">
            ${!completed?`<button class="secondary-btn" type="button" data-use-batch="${escapeHtml(batch.batchId)}">設為目前批次</button>`:""}
            <button class="secondary-btn" type="button" data-edit-batch="${escapeHtml(batch.batchId)}">設定總量／備註</button>
            ${!completed?`<button class="secondary-btn rt-change-toggle ${changing?"active":""}" type="button" data-rt-change-batch="${escapeHtml(batch.batchId)}">${changing?"取消 RT 更改":"RT 更改"}</button>`:""}
            ${!completed
              ? `<button class="primary-btn" type="button" data-complete-batch="${escapeHtml(batch.batchId)}">完成掃描批次</button>`
              : `<button class="secondary-btn" type="button" data-reopen-batch="${escapeHtml(batch.batchId)}">重新開放（RC）</button>`}
          </div>
          ${toolbar(batch)}
          <div class="item-list">${rows}</div>
        </div>
      </article>`;
  };

  bindBatchInteractions=function(){
    originalBindBatchInteractions();

    document.querySelectorAll("[data-rt-change-batch]").forEach(btn=>btn.addEventListener("click",()=>rt.start(btn.dataset.rtChangeBatch)));
    document.querySelectorAll("[data-rt-change-cancel]").forEach(btn=>btn.addEventListener("click",()=>rt.cancel()));
    document.querySelectorAll("[data-rt-select-item]").forEach(input=>{
      input.addEventListener("click",event=>event.stopPropagation());
      input.addEventListener("change",()=>rt.setSelected(input.dataset.rtSelectItem,input.checked));
    });
    document.querySelectorAll("[data-rt-select-all]").forEach(btn=>btn.addEventListener("click",()=>rt.selectAll(btn.dataset.rtSelectAll)));
    document.querySelectorAll("[data-rt-select-clear]").forEach(btn=>btn.addEventListener("click",rt.clearSelection));
    document.querySelectorAll("[data-rt-change-input]").forEach(input=>{
      input.addEventListener("input",()=>{input.value=String(input.value||"").replace(/\D+/g,"").slice(0,10)});
      input.addEventListener("keydown",event=>{
        if(event.key==="Enter"){
          event.preventDefault();
          rt.apply(input.dataset.rtChangeInput);
        }
      });
    });
    document.querySelectorAll("[data-rt-change-apply]").forEach(btn=>btn.addEventListener("click",()=>rt.apply(btn.dataset.rtChangeApply)));
  };

  const pill=document.querySelector(".rc-pill");
  if(pill) pill.textContent="RC V0.1.5";

  global.__OQC_INVENTORY_RT_CHANGE_VIEW_RC05__=Object.freeze({version:rt.VERSION});
})(window);

"use strict";

(function installHomeProductionFocusRc(){
  const VERSION="HOME_PRODUCTION_FOCUS_RC_V5_20260822";

  function demandUnit(item){
    const cap=String(item&&item.capacity||"").trim().toUpperCase();
    const type=String(item&&item.rtType||"").trim().toUpperCase();
    if(type==="BUNDLE"||/^\d+X/.test(cap))return "框";
    return "ea";
  }
  function numOrDash(value){
    if(value===null||value===undefined||value==="")return "--";
    const n=Number(value);
    return Number.isFinite(n)?String(n):"--";
  }
  function processQty(item){
    return item&&(
      item.processQty ?? item.inProcessQty ?? item.wipQty ?? item.process_qty ?? item.in_process_qty
    );
  }
  function loadedQty(item){
    return item&&(
      item.loadedQty ?? item.frameQty ?? item.readyQty ?? item.loaded_qty ?? item.frame_qty
    );
  }

  function installStyle(){
    if(document.getElementById("dsHomeProductionFocusRcStyle"))return;
    const style=document.createElement("style");
    style.id="dsHomeProductionFocusRcStyle";
    style.textContent=`
      #homeModule .progress-strip{display:none!important}
      #homeModule .priority-section{margin-top:14px}
      .priority-card .ds-demand-metric{color:#fff;font-weight:900}
      .priority-card .ds-process-metric{color:#6fe4ff;font-weight:900}
      .priority-card .ds-loaded-metric{color:#89efb8;font-weight:900}
      .priority-card .priority-line3{gap:7px}
      @media(max-width:640px){
        .priority-card .priority-line1{padding-right:44px}
        .priority-card .priority-line3{font-size:12px;gap:6px}
      }
    `;
    document.head.appendChild(style);
  }

  function installRenderer(){
    if(typeof renderPriorities!=="function"||typeof state==="undefined")return false;
    renderPriorities=function(){
      const list=state.priorities.filter(item=>state.filter==="ALL"||item.status===state.filter);
      if(!list.length){
        $("priorityList").innerHTML='<div class="empty-state">目前沒有符合條件的生產需求。</div>';
        return;
      }
      const canEdit=permission("production_priority_edit_enabled");
      $("priorityList").innerHTML=list.map(item=>{
        const dUnit=demandUnit(item);
        const pQty=numOrDash(processQty(item));
        const lQty=numOrDash(loadedQty(item));
        return `
          <article class="priority-card" data-priority-id="${escapeHtml(item.priorityId)}" data-status="${escapeHtml(item.status)}">
            ${canEdit?`<button class="edit-priority" data-edit-id="${escapeHtml(item.priorityId)}" type="button">✎</button>`:""}
            <div class="priority-line1">
              <span>${escapeHtml(item.rtNo)}</span><span class="priority-divider">|</span>
              <span>${escapeHtml(item.capacity||"規格待確認")}</span><span class="priority-divider">|</span>
              <span>${escapeHtml(item.demandSource)}</span><span class="priority-divider">|</span>
              <span>廠區：${escapeHtml(item.plantCode)}</span>
            </div>
            <div class="priority-desc" title="${escapeHtml(item.description||"")}">${escapeHtml(item.description||"RT敘述待確認")}</div>
            <div class="priority-line3">
              <span class="ds-demand-metric">需求量：${escapeHtml(item.demandQty)}${dUnit}</span><span class="priority-divider">|</span>
              <span class="ds-process-metric">製程中：${pQty}ea</span><span class="priority-divider">|</span>
              <span class="ds-loaded-metric">裝框：${lQty}ea</span><span class="priority-divider">|</span>
              <span class="status-badge">${escapeHtml(item.status)}</span>
            </div>
          </article>`;
      }).join("");
      $("priorityList").querySelectorAll("[data-edit-id]").forEach(btn=>btn.addEventListener("click",()=>openPriorityModal(btn.dataset.editId)));
    };
    renderPriorities();
    return true;
  }

  installStyle();
  [100,300,700,1400].forEach(ms=>setTimeout(installRenderer,ms));
  document.addEventListener("click",event=>{
    if(event.target.closest&&event.target.closest("#refreshPriorityBtn,#statusFilters"))setTimeout(installRenderer,80);
  },true);
  window.__DS_HOME_PRODUCTION_FOCUS_RC={version:VERSION,installRenderer};
})();

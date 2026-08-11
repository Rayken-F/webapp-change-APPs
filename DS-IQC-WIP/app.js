"use strict";
const Api = window.IqcCorrectionApi;
if(!Api || typeof Api.post !== "function"){
  document.addEventListener("DOMContentLoaded",()=>{
    const toast=document.getElementById("toast");
    if(toast){
      toast.textContent="前端 API 模組載入失敗，請確認 api.js 已正確部署。";
      toast.className="toast error";
    }
  });
  throw new Error("IQC Correction API module failed to initialize.");
}
const state = {
  user:null,
  bootstrap:null,
  lookup:null,
  selection:null,
  unread:{own:0,review:0},
  unreadIds:{
    own:new Set(),
    review:new Set()
  },
  transferSelection:{
    sourceFrameCtn:"",
    bottles:[]
  },
  notificationTimer:null
};

const CTN_PATTERN=/^[A-Z]{2}\d{2}[A-Z]{2}[A-Z0-9]$/;
const RT_PATTERN=/^\d+$/;
const NOTIFICATION_POLL_MS=45000;
const SYSTEM_NOTIFIED_KEY="ds_iqcc_system_notified_v095";

const REQUEST_TYPES = [
  {code:"ADD_MISSING_BOTTLE",label:"新增漏建鋼瓶"},
  {code:"CORRECT_BOTTLE_CTN_RT",label:"修改鋼瓶CTN/RT"},
  {code:"MISSING_TRANSPORT_FRAME",label:"修改運輸框CTN"},
  {code:"TRANSFER_BOTTLE_FRAME",label:"鋼瓶轉移運輸框"},
  {code:"VOID_INCORRECT_RECORD",label:"作廢錯誤紀錄"}
];
const REQUEST_TYPE_MAP = Object.fromEntries(REQUEST_TYPES.map(item=>[item.code,item.label]));
const $ = id => document.getElementById(id);

let loadingTimers=[];

function showLoading(title,text){
  loadingTimers.forEach(clearTimeout);
  loadingTimers=[];
  $("loadingTitle").textContent=title||"正在處理";
  $("loadingText").textContent=text||"請稍候…";
  $("loadingOverlay").classList.remove("hidden");

  loadingTimers.push(setTimeout(()=>{
    if(!$("loadingOverlay").classList.contains("hidden")){
      $("loadingText").textContent="Apps Script 首次喚醒可能需要幾秒，系統仍在驗證中…";
    }
  },3500));

  loadingTimers.push(setTimeout(()=>{
    if(!$("loadingOverlay").classList.contains("hidden")){
      $("loadingText").textContent="仍在等待後端回應，請不要重複點擊登入按鈕。";
    }
  },8000));
}

function updateLoading(title,text){
  if(title) $("loadingTitle").textContent=title;
  if(text) $("loadingText").textContent=text;
}

function hideLoading(){
  loadingTimers.forEach(clearTimeout);
  loadingTimers=[];
  $("loadingOverlay").classList.add("hidden");
}

function toast(message,error){
  const drawerOpen=
    document.body.classList.contains("mobile-request-open") &&
    isMobileRequestDrawer();

  const drawerEl=$("requestPanelToast");
  const globalEl=$("toast");

  if(drawerOpen && drawerEl){
    drawerEl.textContent=message;
    drawerEl.className="drawer-toast"+(error?" error":"");
    drawerEl.classList.remove("hidden");

    if(globalEl) globalEl.classList.add("hidden");

    clearTimeout(toast.drawerTimer);
    toast.drawerTimer=setTimeout(()=>{
      drawerEl.classList.add("hidden");
    },4200);
    return;
  }

  if(!globalEl) return;
  globalEl.textContent=message;
  globalEl.className="toast"+(error?" error":"");
  globalEl.classList.remove("hidden");

  if(drawerEl) drawerEl.classList.add("hidden");

  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>{
    globalEl.classList.add("hidden");
  },3600);
}

function normalizeCtn(value){
  return String(value||"").trim().toUpperCase().replace(/\s+/g,"");
}

function normalizeRt(value){
  return String(value||"").trim().toUpperCase().replace(/^RT/i,"").replace(/\s+/g,"");
}

function isValidCtn(value){
  return CTN_PATTERN.test(normalizeCtn(value));
}

function isValidRt(value){
  return RT_PATTERN.test(normalizeRt(value));
}

function assertValidCtn(value,label,allowBlank=false){
  const raw=String(value||"").trim();
  if(!raw && allowBlank) return "";
  const ctn=normalizeCtn(raw);
  if(!isValidCtn(ctn)){
    throw new Error(`${label||"CTN"}格式錯誤：需為7碼，前2英文、3–4數字、5–6英文、第7碼英數`);
  }
  return ctn;
}

function assertValidRt(value,label,allowBlank=false){
  const raw=String(value||"").trim();
  if(!raw && allowBlank) return "";
  const rt=normalizeRt(raw);
  if(!isValidRt(rt)){
    throw new Error(`${label||"RT"}格式錯誤：只允許數字`);
  }
  return rt;
}

function attachFieldValidation(el,kind,label,allowBlank=false){
  if(!el) return;
  const validate=()=>{
    const raw=String(el.value||"").trim();
    if(!raw && allowBlank){
      el.classList.remove("input-invalid","input-valid");
      el.setCustomValidity("");
      return true;
    }
    const ok=kind==="CTN" ? isValidCtn(raw) : isValidRt(raw);
    el.classList.toggle("input-invalid",!ok);
    el.classList.toggle("input-valid",ok);
    const message=ok ? "" :
      (kind==="CTN"
        ? `${label}需為7碼：前2英文、3–4數字、5–6英文、第7碼英數`
        : `${label}只允許數字`);
    el.setCustomValidity(message);
    return ok;
  };
  el.addEventListener("input",validate);
  el.addEventListener("blur",validate);
  validate();
}


function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,ch=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));
}

function requestLabelByCode(code,fallback){
  return REQUEST_TYPE_MAP[code] || fallback || "-";
}

function hydrateUiFromLogin(result){
  state.user=result.user;
  state.bootstrap={
    version:result.version,
    user:result.user,
    requestTypes:REQUEST_TYPES,
    permissions:{
      canReview:Array.isArray(result.user.allowedActions) &&
        result.user.allowedActions.includes("REVIEW"),
      canClose:Array.isArray(result.user.allowedActions) &&
        result.user.allowedActions.includes("CLOSE"),
      iqcLogWritable:true
    }
  };

  $("versionPill").textContent=result.version||Api.CLIENT_VERSION;
  $("userPill").textContent=`${result.user.displayName}｜${result.user.role}`;
  $("reviewTabBtn").classList.toggle(
    "hidden",
    !state.bootstrap.permissions.canReview
  );
  $("requestType").innerHTML=REQUEST_TYPES.map(item=>
    `<option value="${escapeHtml(item.code)}">${escapeHtml(item.label)}</option>`
  ).join("");
  renderRequestDynamicFields();
}


function activateAuthenticatedSession(){
  showApp();
  updateNotificationButton();

  // 立即抓一次，不等 45 秒；手機 PWA 自動恢復登入也會走這裡。
  startNotificationPolling();
  refreshNotificationSummary(true);
}

async function login(userId,password,remember){
  showLoading("正在登入","正在驗證帳號、密碼與系統權限…");
  const result=await Api.post("login",{user_id:userId,password});

  updateLoading("登入成功","正在開啟 IQC 異常處理台…");
  Api.saveToken(result.sessionToken,remember);
  hydrateUiFromLogin(result);
  activateAuthenticatedSession();
  hideLoading();
  toast(`登入成功，${result.user.displayName}`);
}

async function bootstrap(){
  const result=await Api.post("bootstrap",{});
  state.bootstrap=result;
  state.user=result.user;
  $("versionPill").textContent=result.version;
  $("userPill").textContent=`${result.user.displayName}｜${result.user.role}`;
  $("reviewTabBtn").classList.toggle("hidden",!result.permissions.canReview);
  $("requestType").innerHTML=REQUEST_TYPES.map(item=>
    `<option value="${escapeHtml(item.code)}">${escapeHtml(item.label)}</option>`
  ).join("");
  renderRequestDynamicFields();
}

function showApp(){
  document.body.classList.remove("view-login");
  document.body.classList.add("view-app");
  $("loginView").classList.add("hidden");
  $("loginView").hidden=true;
  $("appView").hidden=false;
  $("appView").classList.remove("hidden");
}

function showLogin(){
  document.body.classList.remove("view-app");
  document.body.classList.add("view-login");
  $("appView").classList.add("hidden");
  $("appView").hidden=true;
  $("loginView").hidden=false;
  $("loginView").classList.remove("hidden");
}

async function tryRestore(){
  if(!Api.hasToken()) return;
  showLoading("恢復登入","正在確認此裝置的登入狀態與最新權限…");
  try{
    await bootstrap();
    activateAuthenticatedSession();
  }catch(err){
    Api.clearToken();
    showLogin();
  }finally{
    hideLoading();
  }
}

function deriveSelectionFromResult(result){
  if(!result) return null;
  const q = normalizeCtn(result.normalizedQuery);
  for(const card of (result.iqc.transportCards||[])){
    if(normalizeCtn(card.transportFrameCtn)===q){
      return {targetCtn:q,targetKind:"frame",sourceFrameCtn:q,rt:""};
    }
    for(const row of (card.rows||[])){
      if(normalizeCtn(row.ctn)===q){
        return {
          targetCtn:q,
          targetKind:"bottle",
          sourceFrameCtn:normalizeCtn(card.transportFrameCtn),
          rt:row.rt||""
        };
      }
    }
  }
  for(const card of (result.iqc.bundleCards||[])){
    for(const row of (card.rows||[])){
      if(normalizeCtn(row.ctn)===q){
        return {
          targetCtn:q,
          targetKind:"bundle",
          sourceFrameCtn:normalizeCtn(card.transportFrameCtn||row.transportFrameCtn||""),
          rt:row.rt||""
        };
      }
    }
  }
  if(q){
    return {targetCtn:q,targetKind:"generic",sourceFrameCtn:"",rt:""};
  }
  return null;
}

function setSelection(selection){
  state.selection=selection || null;
  renderRequestDynamicFields();
  applySelectionStyles();
}
function isTransferMode(){
  return $("requestType")?.value==="TRANSFER_BOTTLE_FRAME";
}

function transferBottleMap(){
  const map=new Map();
  (state.transferSelection?.bottles||[]).forEach(item=>{
    map.set(normalizeCtn(item.ctn),item);
  });
  return map;
}

function clearTransferSelection(render=true){
  state.transferSelection={
    sourceFrameCtn:"",
    bottles:[]
  };
  if(render){
    renderRequestDynamicFields();
    applySelectionStyles();
  }
}

function toggleTransferBottle(data){
  const ctn=normalizeCtn(data?.ctn||"");
  const frame=normalizeCtn(data?.frameCtn||"");
  const rt=normalizeRt(data?.rt||"");
  const bottleStatus=String(data?.bottleStatus||"").trim();

  if(!ctn || !frame) return;

  const current=state.transferSelection || {
    sourceFrameCtn:"",
    bottles:[]
  };
  const existingMap=transferBottleMap();

  if(existingMap.has(ctn)){
    current.bottles=current.bottles.filter(item=>
      normalizeCtn(item.ctn)!==ctn
    );
    if(!current.bottles.length){
      current.sourceFrameCtn="";
    }
    state.transferSelection=current;
    renderRequestDynamicFields();
    applySelectionStyles();
    return;
  }

  if(current.sourceFrameCtn &&
      normalizeCtn(current.sourceFrameCtn)!==frame){
    toast(
      `同一張轉框異常單只能選同一來源運輸框；目前已選 ${current.sourceFrameCtn}`,
      true
    );
    return;
  }

  if(current.bottles.length>=18){
    toast("單次最多只能選擇 18 支鋼瓶",true);
    return;
  }

  current.sourceFrameCtn=frame;
  current.bottles.push({ctn,rt,frameCtn:frame,bottleStatus});
  state.transferSelection=current;

  // 兼容既有 target 顯示 / lookup 行為：第一支作為 representative target。
  if(current.bottles.length){
    const first=current.bottles[0];
    state.selection={
      targetCtn:first.ctn,
      targetKind:"bottle",
      sourceFrameCtn:current.sourceFrameCtn,
      rt:first.rt,
      bottleStatus:first.bottleStatus || ""
    };
  }

  renderRequestDynamicFields();
  applySelectionStyles();
}

function selectAllTransferBottlesFromCurrentFrame(){
  const rows=[...document.querySelectorAll(".bottle-row.selectable")];
  if(!rows.length){
    toast("目前畫面沒有可選鋼瓶",true);
    return;
  }

  const preferred=normalizeCtn(
    state.transferSelection.sourceFrameCtn ||
    state.selection?.sourceFrameCtn ||
    rows[0].dataset.frame ||
    ""
  );

  const candidates=rows.filter(row=>
    normalizeCtn(row.dataset.frame||"")===preferred
  );

  if(candidates.length>18){
    toast(
      `此框目前畫面有 ${candidates.length} 支，已超過 18 支上限，請先修正資料`,
      true
    );
    return;
  }

  state.transferSelection={
    sourceFrameCtn:preferred,
    bottles:candidates.map(row=>({
      ctn:normalizeCtn(row.dataset.ctn||""),
      rt:normalizeRt(row.dataset.rt||""),
      bottleStatus:String(row.dataset.status||"").trim(),
      frameCtn:preferred
    })).filter(item=>item.ctn)
  };

  if(state.transferSelection.bottles.length){
    const first=state.transferSelection.bottles[0];
    state.selection={
      targetCtn:first.ctn,
      targetKind:"bottle",
      sourceFrameCtn:preferred,
      rt:first.rt,
      bottleStatus:first.bottleStatus || ""
    };
  }

  renderRequestDynamicFields();
  applySelectionStyles();
}

async function refreshTransferCapacityPreview(){
  const box=$("transferCapacityPreview");
  const input=$("requestMoveFrameCtn");
  if(!box || !input) return;

  const frame=normalizeCtn(input.value);
  const bottles=(state.transferSelection?.bottles||[])
    .map(item=>normalizeCtn(item.ctn))
    .filter(Boolean);

  if(!frame || !isValidCtn(frame) || !bottles.length){
    box.innerHTML="輸入有效的目標運輸框 CTN 後，可即時驗證 18 支容量上限。";
    box.classList.remove("capacity-ok","capacity-bad");
    return;
  }

  box.textContent="容量驗證中…";
  box.classList.remove("capacity-ok","capacity-bad");

  try{
    const response=await Api.post("frame_capacity",{
      frame_ctn:frame,
      incoming_ctns:bottles
    });
    const cap=response.capacity||{};
    box.innerHTML=
      `目標框目前 <strong>${cap.currentQty??0}/18</strong> 支；`+
      `本次轉入 <strong>${cap.incomingQty??bottles.length}</strong> 支；`+
      `完成後 <strong>${cap.projectedQty??"-"}/18</strong> 支；`+
      `剩餘 <strong>${cap.remainingAfter??"-"}</strong> 格。`;

    box.classList.toggle("capacity-bad",!!cap.overCapacity);
    box.classList.toggle("capacity-ok",!cap.overCapacity);
  }catch(err){
    box.textContent=err.message;
    box.classList.add("capacity-bad");
    box.classList.remove("capacity-ok");
  }
}

function applySelectionStyles(){
  const transferMap=transferBottleMap();

  document.querySelectorAll(".bottle-row.selectable").forEach(el=>{
    const ctn=normalizeCtn(el.dataset.ctn||"");
    const selected=isTransferMode()
      ? transferMap.has(ctn)
      : (!!state.selection &&
         ctn===normalizeCtn(state.selection.targetCtn));

    el.classList.toggle("selected",selected);
    el.classList.toggle(
      "multi-selectable",
      isTransferMode()
    );
  });
}

function bindLookupInteractions(){
  document.querySelectorAll(".js-select-frame").forEach(btn=>{
    btn.addEventListener("click",()=>{
      setSelection({
        targetCtn: normalizeCtn(btn.dataset.ctn),
        targetKind: "frame",
        sourceFrameCtn: normalizeCtn(btn.dataset.ctn),
        rt: ""
      });
      if(isMobileRequestDrawer()) openMobileRequestPanel();
    });
  });

  document.querySelectorAll(".bottle-row.selectable").forEach(el=>{
    el.addEventListener("click",()=>{
      if(isTransferMode()){
        toggleTransferBottle({
          ctn:el.dataset.ctn,
          frameCtn:el.dataset.frame,
          rt:el.dataset.rt,
          bottleStatus:el.dataset.status || ""
        });
      }else{
        setSelection({
          targetCtn: normalizeCtn(el.dataset.ctn),
          targetKind: "bottle",
          sourceFrameCtn: normalizeCtn(el.dataset.frame || ""),
          rt: el.dataset.rt || "",
          bottleStatus: el.dataset.status || ""
        });
      }

      if(isMobileRequestDrawer()) openMobileRequestPanel();
    });
  });
}

function displayValue(value,fallback="-"){
  const text=String(value??"").trim();
  return text||fallback;
}

function infoCell(label,value){
  return `
    <div class="lookup-info">
      <div class="label">${escapeHtml(label)}</div>
      <div class="value">${escapeHtml(displayValue(value))}</div>
    </div>`;
}

function renderBottleRows(rows, frameCtn){
  if(!Array.isArray(rows)||!rows.length){
    return '<div class="lookup-empty">沒有鋼瓶明細</div>';
  }
  return `
    <details class="fold-card">
      <summary>
        <span>鋼瓶清單（${rows.length} 支）</span>
        <span class="fold-summary-note">一般異常可單選；鋼瓶轉移可複選多支</span>
      </summary>
      <div class="bottle-list" style="padding:10px">${
        rows.map((row,index)=>`
          <div class="bottle-row selectable js-select-ctn"
               data-ctn="${escapeHtml(displayValue(row.ctn,''))}"
               data-rt="${escapeHtml(displayValue(row.rt,''))}"
               data-status="${escapeHtml(displayValue(row.bottleStatus,''))}"
               data-frame="${escapeHtml(displayValue(frameCtn||row.transportFrameCtn,''))}">
            <div class="bottle-no">${escapeHtml(row.pairNo||String(index+1))}</div>
            <div class="bottle-main">
              <div class="bottle-ctn">${escapeHtml(displayValue(row.ctn))}</div>
              <div class="bottle-sub">鋼瓶 CTN</div>
            </div>
            <div class="bottle-rt">
              <div>RT：${escapeHtml(displayValue(row.rt))}</div>
              <div class="bottle-status-text">狀態：${escapeHtml(displayValue(row.bottleStatus))}</div>
            </div>
          </div>`
        ).join("")
      }</div>
    </details>`;
}

function renderTransportCard(card){
  const frameCtn = displayValue(card.transportFrameCtn);
  return `
    <div class="lookup-section">
      <div class="lookup-section-title">
        <span>運輸框 ${escapeHtml(frameCtn)}</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <span class="state-badge">${escapeHtml(displayValue(card.type))}</span>
          <button type="button" class="mini-btn js-select-frame" data-ctn="${escapeHtml(frameCtn)}">選用此運輸框</button>
        </div>
      </div>
      <div class="lookup-info-grid">
        ${infoCell("IQC建立時間",card.createdAt||card.date)}
        ${infoCell("區域",`${displayValue(card.regionCode,"")} ${displayValue(card.regionName,"")}`.trim())}
        ${infoCell("鋼瓶數量",`${Number(card.bottleCount||card.rows?.length||0)} 支`)}
        ${infoCell("運輸框CTN",frameCtn)}
      </div>
      ${renderBottleRows(card.rows, frameCtn)}
    </div>`;
}

function renderBundleCard(card){
  return `
    <div class="lookup-section">
      <div class="lookup-section-title">
        <span>集束 ${escapeHtml(displayValue(card.rows?.[0]?.ctn||card.transportFrameCtn))}</span>
        <span class="state-badge">集束</span>
      </div>
      <div class="lookup-info-grid">
        ${infoCell("IQC建立時間",card.createdAt||card.date)}
        ${infoCell("區域",`${displayValue(card.regionCode,"")} ${displayValue(card.regionName,"")}`.trim())}
        ${infoCell("RT",card.rows?.[0]?.rt)}
      </div>
    </div>`;
}

function renderGrindingRows(rows){
  if(!Array.isArray(rows)||!rows.length){
    return '<div class="lookup-empty">目前沒有 Grinding WIP 紀錄</div>';
  }
  return rows.map(row=>`
    <div class="lookup-section">
      <div class="lookup-section-title">
        <span>${escapeHtml(displayValue(row.asset_ctn||row.source_ctn))}</span>
        <span class="state-badge">${escapeHtml(displayValue(row.lifecycle_status||row.station_status))}</span>
      </div>
      <div class="lookup-info-grid">
        ${infoCell("目前站別",row.current_station)}
        ${infoCell("站別狀態",row.station_status)}
        ${infoCell("來源運輸框",row.source_frame_ctn)}
        ${infoCell("目前運輸框",row.current_frame_ctn)}
        ${infoCell("RT",row.rt)}
        ${infoCell("最後更新",row.updated_at||row.status_changed_at)}
      </div>
    </div>`).join("");
}

function renderCtnStateRows(rows){
  if(!Array.isArray(rows)||!rows.length) return "";
  return `
    <div class="lookup-section">
      <div class="lookup-section-title">
        <span>CTN Current State</span>
        <small>${rows.length} 筆</small>
      </div>
      ${rows.map(row=>`
        <div class="lookup-info-grid" style="margin-top:8px">
          ${infoCell("CTN",row.ctn)}
          ${infoCell("狀態",row.status)}
          ${infoCell("目前站別",row.current_station_code)}
          ${infoCell("站別狀態",row.current_station_status)}
          ${infoCell("目前框架",row.current_frame_ctn)}
          ${infoCell("最後更新",row.updated_at)}
        </div>`).join("")}
    </div>`;
}

function renderRelatedRequests(rows){
  if(!Array.isArray(rows)||!rows.length){
    return '<div class="lookup-empty">沒有相關異常單</div>';
  }
  return rows.map(row=>`
    <div class="lookup-section">
      <div class="lookup-section-title">
        <span>${escapeHtml(displayValue(row.requestId))}</span>
        <span class="state-badge">${escapeHtml(displayValue(row.status))}</span>
      </div>
      <div class="lookup-info-grid">
        ${infoCell("異常類型",requestLabelByCode(row.requestType || row.request_type, row.requestTypeLabel))}
        ${infoCell("風險",row.riskLevel)}
        ${infoCell("提出人",row.requesterName)}
        ${infoCell("建立時間",row.createdAt)}
      </div>
    </div>`).join("");
}

function renderLookup(result){
  const iqcCount=
    (result.iqc.bundleCards||[]).length+
    (result.iqc.transportCards||[]).length+
    (result.iqc.bottleRows||[]).length+
    (result.iqc.submissionRows||[]).length;

  const riskClass=result.risk.level==="HIGH"?"danger":"ok";
  const riskText=result.risk.downstreamLocked
    ?"已進後續製程｜主管審核"
    :(result.risk.reasons.length?"需人工確認":"一般審核");

  const reasons=result.risk.reasons.length
    ? `<div class="danger-box" style="margin-top:12px">${result.risk.reasons.map(escapeHtml).join("<br>")}</div>`
    :"";

  const transportHtml=(result.iqc.transportCards||[]).map(renderTransportCard).join("");
  const bundleHtml=(result.iqc.bundleCards||[]).map(renderBundleCard).join("");

  const directBottleHtml=(result.iqc.bottleRows||[]).length
    ? `<div class="lookup-section">
         <div class="lookup-section-title"><span>鋼瓶 IQC 資料</span><small>${result.iqc.bottleRows.length} 筆</small></div>
         ${renderBottleRows(result.iqc.bottleRows, "")}
       </div>`
    :"";

  const submissionHtml=(result.iqc.submissionRows||[]).length
    ? `<div class="lookup-section">
         <div class="lookup-section-title"><span>Submission 明細</span><small>${result.iqc.submissionRows.length} 筆</small></div>
         ${renderBottleRows(result.iqc.submissionRows, "")}
       </div>`
    :"";

  const iqcHtml=transportHtml+bundleHtml+directBottleHtml+submissionHtml ||
    '<div class="lookup-empty">IQC_Log 沒有找到對應資料</div>';

  $("lookupResult").innerHTML=`
    <div class="result">
      <div class="result-head">
        <strong>${escapeHtml(result.normalizedQuery)}</strong>
        <span class="pill ${riskClass}">${escapeHtml(riskText)}</span>
      </div>

      <div class="lookup-summary">
        查詢結果：找到 <strong>${iqcCount}</strong> 筆 IQC 資料；
        Grinding WIP <strong>${result.grinding.length}</strong> 筆；
        相關異常單 <strong>${result.relatedRequests.length}</strong> 筆。
      </div>

      ${reasons}

      <div class="lookup-sections">
        <div>
          <div class="lookup-section-title">
            <span>IQC 資料</span>
            <small>可點選鋼瓶帶入右側</small>
          </div>
          ${iqcHtml}
        </div>

        <div>
          <div class="lookup-section-title">
            <span>Grinding WIP</span>
            <small>目前製程狀態</small>
          </div>
          ${renderGrindingRows(result.grinding)}
        </div>

        ${renderCtnStateRows(result.ctnCurrentState)}

        <div>
          <div class="lookup-section-title">
            <span>相關異常單</span>
            <small>修正追蹤</small>
          </div>
          ${renderRelatedRequests(result.relatedRequests)}
        </div>
      </div>
    </div>`;

  bindLookupInteractions();
  applySelectionStyles();
}

async function lookup(){
  const query=$("lookupQuery").value.trim();
  if(!query) return toast("請輸入查詢關鍵字",true);
  $("lookupBtn").disabled=true;
  try{
    const response=await Api.post("lookup",{query});
    state.lookup=response.result;
    clearTransferSelection(false);
    renderLookup(response.result);
    setSelection(deriveSelectionFromResult(response.result));
  }catch(err){
    toast(err.message,true);
  }finally{
    $("lookupBtn").disabled=false;
  }
}

function requestTargetContext(type){
  const selection = state.selection || {};
  const selectedCtn = normalizeCtn(selection.targetCtn || "");
  const sourceFrame = normalizeCtn(
    selection.sourceFrameCtn ||
    (selection.targetKind==="frame" ? selection.targetCtn : "")
  );

  if(type==="ADD_MISSING_BOTTLE"){
    return {
      targetCtn: sourceFrame || (selection.targetKind==="frame" ? selectedCtn : ""),
      kind:"frame",
      label:"當前運輸框 CTN"
    };
  }

  if(type==="MISSING_TRANSPORT_FRAME"){
    return {
      targetCtn: sourceFrame || (selection.targetKind==="frame" ? selectedCtn : ""),
      kind:"frame",
      label:"原運輸框 CTN"
    };
  }

  return {
    targetCtn:selectedCtn,
    kind:selection.targetKind || "generic",
    label:"主要 CTN"
  };
}

function renderRequestTargetField(type){
  const genericField=$("genericTargetField");
  const hiddenTarget=$("targetCtn");
  const display=$("targetCtnDisplay");
  const hint=$("targetCtnHint");
  const label=$("targetCtnLabel");
  const ctx=requestTargetContext(type);

  hiddenTarget.value=ctx.targetCtn || "";

  if(
    type==="ADD_MISSING_BOTTLE" ||
    type==="MISSING_TRANSPORT_FRAME" ||
    type==="TRANSFER_BOTTLE_FRAME"
  ){
    genericField.classList.add("hidden");
    return ctx;
  }

  genericField.classList.remove("hidden");

  if(type==="CORRECT_BOTTLE_CTN_RT"){
    label.textContent="原鋼瓶 CTN";
  }else if(type==="TRANSFER_BOTTLE_FRAME"){
    label.textContent="待轉移鋼瓶 CTN";
  }else{
    label.textContent="主要 CTN";
  }

  if(ctx.targetCtn){
    display.textContent=ctx.targetCtn;
    display.classList.remove("muted");

    if(type==="CORRECT_BOTTLE_CTN_RT"){
      hint.textContent="原鋼瓶 CTN 由左側點選鋼瓶帶入，不需手動填寫。";
    }else if(type==="TRANSFER_BOTTLE_FRAME"){
      hint.textContent="待轉移鋼瓶 CTN 由左側點選鋼瓶帶入。";
    }else{
      hint.textContent="CTN 已由查詢結果帶入。";
    }
  }else{
    display.textContent=type==="TRANSFER_BOTTLE_FRAME"
      ? "請先在左側點選待轉移鋼瓶"
      : "請先在左側點選鋼瓶";
    display.classList.add("muted");
    hint.textContent="此欄由查詢結果帶入，不需手動輸入。";
  }
  return ctx;
}

function renderRequestDynamicFields(){
  const wrap=$("requestDynamicFields");
  if(!wrap) return;

  const type=$("requestType").value || REQUEST_TYPES[0].code;
  const selection=state.selection || {};
  renderRequestTargetField(type);

  const sourceFrame=normalizeCtn(
    type==="TRANSFER_BOTTLE_FRAME"
      ? (
          state.transferSelection?.sourceFrameCtn ||
          selection.sourceFrameCtn ||
          (selection.targetKind==="frame" ? selection.targetCtn : "")
        )
      : (
          selection.sourceFrameCtn ||
          (selection.targetKind==="frame" ? selection.targetCtn : "")
        )
  );

  const needBottleHint=
    (
      type==="CORRECT_BOTTLE_CTN_RT" &&
      selection.targetKind!=="bottle"
    ) ||
    (
      type==="TRANSFER_BOTTLE_FRAME" &&
      !(state.transferSelection?.bottles||[]).length
    );

  const hint=needBottleHint
    ? '<div class="field-hint">請先在左側鋼瓶清單點選要處理的鋼瓶。</div>'
    : '';

  let html="";
  switch(type){
    case "ADD_MISSING_BOTTLE":
      html=`
        <div class="field">
          <label>當前運輸框 CTN</label>
          <div class="static-display ${sourceFrame?"":"muted"}">${escapeHtml(sourceFrame || "請先查詢或選用運輸框")}</div>
        </div>
        <div class="row">
          <div class="field">
            <label for="requestAddBottleCtn">待新增鋼瓶 CTN</label>
            <input id="requestAddBottleCtn" maxlength="7" placeholder="請輸入待新增鋼瓶 CTN">
          </div>
          <div class="field">
            <label for="requestAddBottleRt">待新增鋼瓶 RT</label>
            <input id="requestAddBottleRt" inputmode="numeric" placeholder="請輸入 RT 料號">
          </div>
        </div>
        <div class="field">
          <label for="requestAddBottleStatus">待新增鋼瓶狀態</label>
          <input id="requestAddBottleStatus"
                 maxlength="50"
                 autocomplete="off"
                 placeholder="請輸入鋼瓶狀態（必填，最多 50 字）">
          <div class="field-hint">沿用正式 IQC 規則：鋼瓶狀態必填，最多 50 字。</div>
        </div>`;
      break;

    case "CORRECT_BOTTLE_CTN_RT":
      html=`
        ${hint}
        <div class="field">
          <label>原鋼瓶 RT</label>
          <div class="static-display ${selection.rt?"":"muted"}">${escapeHtml(selection.rt || "請先點選鋼瓶")}</div>
        </div>
        <div class="row">
          <div class="field">
            <label for="requestNewBottleCtn">待修改鋼瓶 CTN</label>
            <input id="requestNewBottleCtn" maxlength="7" placeholder="空白＝沿用原 CTN">
          </div>
          <div class="field">
            <label for="requestNewBottleRt">待修改鋼瓶 RT</label>
            <input id="requestNewBottleRt" inputmode="numeric" placeholder="空白＝沿用原 RT">
          </div>
        </div>
        <div class="field-hint">CTN 或 RT 可只改其中一項；另一項留白時會沿用目前資料。</div>`;
      break;

    case "MISSING_TRANSPORT_FRAME":
      html=`
        <div class="field">
          <label>原運輸框 CTN</label>
          <div class="static-display ${sourceFrame?"":"muted"}">${escapeHtml(sourceFrame || "請先查詢或選用運輸框")}</div>
        </div>
        <div class="field">
          <label for="requestNewFrameCtn">待修改運輸框 CTN</label>
          <input id="requestNewFrameCtn" maxlength="7" placeholder="請輸入正確運輸框 CTN">
        </div>`;
      break;

    case "TRANSFER_BOTTLE_FRAME":{
      const transferItems=state.transferSelection?.bottles||[];
      const transferFrame=normalizeCtn(
        state.transferSelection?.sourceFrameCtn||sourceFrame
      );
      const selectedHtml=transferItems.length
        ? `<div class="transfer-chip-list">${
            transferItems.map(item=>
              `<span class="transfer-chip">${escapeHtml(item.ctn)}</span>`
            ).join("")
          }</div>`
        : `<div class="static-display muted">請在左側鋼瓶清單點選，可一次複選多支</div>`;

      html=`
        <div class="field">
          <div class="field-title-row">
            <label>待轉移鋼瓶 CTN（已選 ${transferItems.length} 支）</label>
            <div class="mini-action-row">
              <button id="selectAllTransferBtn" class="mini-btn" type="button">全選此框</button>
              <button id="clearTransferBtn" class="mini-btn" type="button">清除選擇</button>
            </div>
          </div>
          ${selectedHtml}
          <div class="field-hint">同一張異常單只能選同一個來源運輸框；單次最多 18 支。</div>
        </div>

        <div class="field">
          <label>原運輸框架 CTN</label>
          <div class="static-display ${transferFrame?"":"muted"}">${escapeHtml(transferFrame || "尚未選擇鋼瓶")}</div>
        </div>

        <div class="field">
          <label for="requestMoveFrameCtn">待轉移運輸框 CTN</label>
          <input id="requestMoveFrameCtn" maxlength="7" placeholder="請輸入待轉移運輸框 CTN">
          <div id="transferCapacityPreview" class="capacity-preview">
            輸入有效的目標運輸框 CTN 後，可即時驗證 18 支容量上限。
          </div>
        </div>`;
      break;
    }

    case "VOID_INCORRECT_RECORD":
      html='';
      break;
  }

  wrap.innerHTML=html;

  [
    "requestAddBottleCtn",
    "requestNewBottleCtn",
    "requestNewFrameCtn",
    "requestMoveFrameCtn"
  ].forEach(id=>{
    const el=$(id);
    if(el){
      el.addEventListener("input",event=>{
        event.target.value=normalizeCtn(event.target.value);
      });
    }
  });

  ["requestAddBottleRt","requestNewBottleRt"].forEach(id=>{
    const el=$(id);
    if(el){
      el.addEventListener("input",event=>{
        event.target.value=normalizeRt(event.target.value).replace(/\D/g,"");
      });
    }
  });

  attachFieldValidation($("requestAddBottleCtn"),"CTN","待新增鋼瓶 CTN",false);
  attachFieldValidation($("requestAddBottleRt"),"RT","待新增鋼瓶 RT",false);
  attachFieldValidation($("requestNewBottleCtn"),"CTN","待修改鋼瓶 CTN",true);
  attachFieldValidation($("requestNewBottleRt"),"RT","待修改鋼瓶 RT",true);
  attachFieldValidation($("requestNewFrameCtn"),"CTN","待修改運輸框 CTN",false);
  attachFieldValidation($("requestMoveFrameCtn"),"CTN","待轉移運輸框 CTN",false);

  const addBottleStatus=$("requestAddBottleStatus");
  if(addBottleStatus){
    addBottleStatus.addEventListener("input",event=>{
      const start=event.target.selectionStart;
      const end=event.target.selectionEnd;
      event.target.value=String(event.target.value||"").toUpperCase();
      try{
        event.target.setSelectionRange(start,end);
      }catch(ignore){}
    });
    addBottleStatus.addEventListener("blur",event=>{
      event.target.value=normalizeBottleStatus(event.target.value);
    });
  }

  $("selectAllTransferBtn")?.addEventListener(
    "click",
    selectAllTransferBottlesFromCurrentFrame
  );
  $("clearTransferBtn")?.addEventListener(
    "click",
    ()=>clearTransferSelection(true)
  );

  const moveInput=$("requestMoveFrameCtn");
  if(moveInput){
    let timer=null;
    moveInput.addEventListener("input",()=>{
      clearTimeout(timer);
      timer=setTimeout(refreshTransferCapacityPreview,450);
    });
    moveInput.addEventListener("blur",refreshTransferCapacityPreview);
  }
}


function normalizeBottleStatus(value){
  return String(value||"").trim().toUpperCase();
}

function assertValidBottleStatus(value,label="鋼瓶狀態"){
  const status=normalizeBottleStatus(value);
  if(!status){
    throw new Error(`${label}為必填`);
  }
  if(status.length>50){
    throw new Error(`${label}最多 50 字`);
  }
  if(/[\r\n]/.test(status)){
    throw new Error(`${label}請使用單行文字`);
  }
  return status;
}

function collectRequestPayload(){
  const requestType=$("requestType").value;
  const selection=state.selection || {};
  const targetCtx=requestTargetContext(requestType);
  const targetCtn=normalizeCtn(targetCtx.targetCtn);
  let sourceFrameCtn=normalizeCtn(
    selection.sourceFrameCtn ||
    (selection.targetKind==="frame" ? selection.targetCtn : "")
  );
  const reason=$("requestReason").value.trim();

  if(!reason) throw new Error("請填寫異常原因");

  let destinationFrameCtn="";
  let oldValue={};
  let proposedValue={};

  if(requestType==="ADD_MISSING_BOTTLE"){
    if(!sourceFrameCtn) throw new Error("請先查詢或選用當前運輸框 CTN");
    const newCtn=assertValidCtn(
      $("requestAddBottleCtn")?.value,
      "待新增鋼瓶 CTN"
    );
    const newRt=assertValidRt(
      $("requestAddBottleRt")?.value,
      "待新增鋼瓶 RT"
    );
    const newStatus=assertValidBottleStatus(
      $("requestAddBottleStatus")?.value,
      "待新增鋼瓶狀態"
    );

    proposedValue={
      value:newCtn,
      ctn:newCtn,
      rt:newRt,
      bottle_status:newStatus
    };

  }else if(requestType==="CORRECT_BOTTLE_CTN_RT"){
    if(selection.targetKind!=="bottle") {
      throw new Error("請先在左側點選要修改的鋼瓶");
    }

    const newCtn=assertValidCtn(
      $("requestNewBottleCtn")?.value,
      "待修改鋼瓶 CTN",
      true
    );
    const newRt=assertValidRt(
      $("requestNewBottleRt")?.value,
      "待修改鋼瓶 RT",
      true
    );
    if(!newCtn && !newRt) {
      throw new Error("待修改鋼瓶 CTN / RT 至少填寫其中一項");
    }
    if(!newRt && !isValidRt(selection.rt||"")){
      throw new Error("原鋼瓶 RT 不符合規格，請填入正確的待修改鋼瓶 RT");
    }

    oldValue={ctn:targetCtn,rt:String(selection.rt || "").trim()};
    proposedValue={ctn:newCtn,rt:newRt};

  }else if(requestType==="MISSING_TRANSPORT_FRAME"){
    if(!sourceFrameCtn) throw new Error("請先查詢或選用原運輸框 CTN");
    const newFrame=assertValidCtn(
      $("requestNewFrameCtn")?.value,
      "待修改運輸框 CTN"
    );

    oldValue={value:sourceFrameCtn,ctn:sourceFrameCtn};
    proposedValue={value:newFrame,ctn:newFrame};

  }else if(requestType==="TRANSFER_BOTTLE_FRAME"){
    const selected=(state.transferSelection?.bottles||[])
      .map(item=>({
        ctn:assertValidCtn(item.ctn,"待轉移鋼瓶 CTN"),
        rt:normalizeRt(item.rt||""),
        source_frame_ctn:assertValidCtn(
          item.frameCtn||state.transferSelection.sourceFrameCtn,
          "原運輸框架 CTN"
        )
      }));

    if(!selected.length){
      throw new Error("請先在左側至少選擇 1 支待轉移鋼瓶");
    }
    if(selected.length>18){
      throw new Error("單次最多只能轉移 18 支鋼瓶");
    }

    const sourceFrames=new Set(
      selected.map(item=>item.source_frame_ctn)
    );
    if(sourceFrames.size!==1){
      throw new Error("同一張異常單只能轉移同一個來源運輸框的鋼瓶");
    }

    const batchSourceFrame=[...sourceFrames][0];
    destinationFrameCtn=assertValidCtn(
      $("requestMoveFrameCtn")?.value,
      "待轉移運輸框 CTN"
    );

    if(batchSourceFrame===destinationFrameCtn){
      throw new Error("原運輸框與待轉移運輸框不可相同");
    }

    oldValue={
      ctn:selected[0].ctn,
      bottle_ctns:selected.map(item=>item.ctn),
      bottle_items:selected,
      source_frame_ctn:batchSourceFrame,
      qty:selected.length
    };
    proposedValue={
      destination_frame_ctn:destinationFrameCtn,
      qty:selected.length
    };

    // representative target 保留第一支，真正批次名單放 old_value_json。
    sourceFrameCtn=batchSourceFrame;

  }else if(requestType==="VOID_INCORRECT_RECORD"){
    if(!targetCtn) throw new Error("請先查詢或點選要作廢的 CTN");
  }

  return {
    request_type:requestType,
    target_ctn:
      requestType==="ADD_MISSING_BOTTLE"
        ? sourceFrameCtn
        : (
            requestType==="TRANSFER_BOTTLE_FRAME"
              ? normalizeCtn(
                  state.transferSelection?.bottles?.[0]?.ctn||""
                )
              : targetCtn
          ),
    source_frame_ctn:sourceFrameCtn,
    destination_frame_ctn:destinationFrameCtn,
    old_value:oldValue,
    proposed_value:proposedValue,
    reason,
    evidence_url:""
  };
}
async function createRequest(){
  const btn=$("submitRequestBtn");
  const originalText=btn.textContent;
  btn.disabled=true;
  btn.textContent="建立中…";

  try{
    const payload=collectRequestPayload();
    const response=await Api.post("create_request",{
      idempotency_key:Api.makeIdempotencyKey("IQCR"),
      ...payload
    });

    const request=response.request;
    $("requestReceipt").innerHTML=`
      <div class="result">
        <div class="result-head">
          <strong>${escapeHtml(request.requestId)}</strong>
          <span class="pill warn">${escapeHtml(request.status)}</span>
        </div>
        <p class="panel-note">${escapeHtml(response.message)}</p>
        <div class="lookup-summary">
          類型：<strong>${escapeHtml(requestLabelByCode(request.requestType || request.request_type, request.requestTypeLabel))}</strong>｜
          風險：<strong>${escapeHtml(request.riskLevel)}</strong>｜
          建立時間：<strong>${escapeHtml(request.createdAt)}</strong>
          ${response.writeMs!==undefined?`｜後端寫入：<strong>${escapeHtml(response.writeMs)} ms</strong>`:""}
        </div>
      </div>`;

    toast("異常單建立成功");
    locallyAddUnread("OWN",request.requestId);
    if(state.bootstrap?.permissions?.canReview){
      locallyAddUnread("REVIEW",request.requestId);
    }
    if(isMobileRequestDrawer()) closeMobileRequestPanel();
    $("requestReason").value="";
    if(payload.request_type==="TRANSFER_BOTTLE_FRAME"){
      clearTransferSelection(false);
    }
    renderRequestDynamicFields();
    applySelectionStyles();
  }catch(err){
    toast(err.message,true);
  }finally{
    btn.disabled=false;
    btn.textContent=originalText;
  }
}

function requestCard(request,reviewMode,isUnread=false){
  const statusClass=request.status==="PENDING_REVIEW"?"warn":
    request.status==="REJECTED"?"danger":"ok";
  const riskClass=request.riskLevel==="HIGH"?"danger":"warn";
  const typeLabel = requestLabelByCode(request.requestType || request.request_type, request.requestTypeLabel);

  const oldData=request.oldValue || {};
  const newData=request.proposedValue || {};
  let detailLine=`異常原因：${escapeHtml(request.reason)}`;

  if(typeLabel==="新增漏建鋼瓶"){
    detailLine =
      `當前運輸框 CTN：${escapeHtml(request.targetCtn||request.sourceFrameCtn||"-")}` +
      `<br>待新增鋼瓶 CTN：${escapeHtml(newData.ctn||newData.value||"-")}` +
      `｜RT：${escapeHtml(newData.rt||"-")}` +
      `<br>鋼瓶狀態：${escapeHtml(newData.bottle_status||"-")}` +
      `<br>${detailLine}`;

  }else if(typeLabel==="修改鋼瓶CTN/RT"){
    detailLine =
      `原鋼瓶 CTN：${escapeHtml(request.targetCtn||oldData.ctn||"-")}` +
      `｜原 RT：${escapeHtml(oldData.rt||"-")}` +
      `<br>待修改鋼瓶 CTN：${escapeHtml(newData.ctn||"沿用原 CTN")}` +
      `｜待修改鋼瓶 RT：${escapeHtml(newData.rt||"沿用原 RT")}` +
      `<br>${detailLine}`;

  }else if(typeLabel==="鋼瓶轉移運輸框"){
    const bottles=Array.isArray(oldData.bottle_ctns)
      ? oldData.bottle_ctns
      : [request.targetCtn].filter(Boolean);

    detailLine =
      `待轉移鋼瓶：<strong>${bottles.length} 支</strong>` +
      `<br>${escapeHtml(bottles.join("、")||"-")}` +
      `<br>原運輸框架 CTN：${escapeHtml(request.sourceFrameCtn||oldData.source_frame_ctn||"-")}` +
      `｜待轉移運輸框 CTN：${escapeHtml(request.destinationFrameCtn||newData.destination_frame_ctn||"-")}` +
      `<br>${detailLine}`;

  }else if(typeLabel==="修改運輸框CTN"){
    detailLine =
      `原運輸框 CTN：${escapeHtml(request.targetCtn||request.sourceFrameCtn||oldData.ctn||oldData.value||"-")}` +
      `｜待修改運輸框 CTN：${escapeHtml(newData.ctn||newData.value||"-")}` +
      `<br>${detailLine}`;

  }else if(typeLabel==="作廢錯誤紀錄"){
    detailLine =
      `作廢 CTN：${escapeHtml(request.targetCtn||"-")}` +
      `<br>${detailLine}`;

  }else{
    detailLine =
      `主要 CTN：${escapeHtml(request.targetCtn||"-")}` +
      `<br>${detailLine}`;
  }

  let buttons="";
  if(reviewMode&&request.status==="PENDING_REVIEW"){
    buttons=`<div class="actions">
      <button class="btn" onclick="reviewRequest('${escapeHtml(request.requestId)}','APPROVE')">核准</button>
      <button class="btn danger" onclick="reviewRequest('${escapeHtml(request.requestId)}','REJECT')">駁回</button>
    </div>`;
  }else if(reviewMode&&["APPROVED","REJECTED"].includes(request.status)){
    buttons=`<div class="actions">
      <button class="btn secondary" onclick="closeRequest('${escapeHtml(request.requestId)}')">完成結案</button>
    </div>`;
  }
  const scope=reviewMode?"REVIEW":"OWN";
  const unreadHtml=isUnread
    ? `<span class="request-unread-pill"><span class="request-unread-dot"></span>未讀</span>`
    : "";

  return `
    <article class="request-card${isUnread?" unread-card":""}"
             data-request-id="${escapeHtml(request.requestId)}"
             data-notification-scope="${scope}"
             onclick="handleRequestCardView(event,this)">
      <div class="request-top">
        <div>
          <div class="request-id">${escapeHtml(request.requestId)}</div>
          <div class="request-meta">
            ${escapeHtml(typeLabel)}｜${escapeHtml(request.requesterName)}｜${escapeHtml(request.createdAt)}
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap">
          ${unreadHtml}
          <span class="pill ${statusClass}">${escapeHtml(request.status)}</span>
          <span class="pill ${riskClass}">${escapeHtml(request.riskLevel)}</span>
        </div>
      </div>
      <div class="request-meta">${detailLine}</div>
      ${request.reviewNote?`<div class="request-meta">審核：${escapeHtml(request.reviewNote)}</div>`:""}
      ${buttons}
    </article>`;
}


function setBadge(id,count){
  const el=$(id);
  if(!el) return;
  const value=Math.max(0,Number(count||0));
  el.textContent=value>99?"99+":String(value);
  el.classList.toggle("hidden",value<=0);
}

function updateUnreadBadges(summary){
  if(summary){
    const ownIds=Array.isArray(summary.ownUnreadRequestIds)
      ? summary.ownUnreadRequestIds.map(id=>String(id||"").toUpperCase())
      : [];
    const reviewIds=Array.isArray(summary.reviewUnreadRequestIds)
      ? summary.reviewUnreadRequestIds.map(id=>String(id||"").toUpperCase())
      : [];

    state.unreadIds.own=new Set(ownIds);
    state.unreadIds.review=new Set(reviewIds);
    state.unread.own=Number(summary.ownUnread ?? ownIds.length);
    state.unread.review=Number(summary.reviewUnread ?? reviewIds.length);
  }else{
    state.unread.own=state.unreadIds.own.size;
    state.unread.review=state.unreadIds.review.size;
  }

  setBadge("requestUnreadBadge",state.unread.own);
  setBadge("reviewUnreadBadge",state.unread.review);
  applyUnreadCardStates();
}

function applyUnreadCardStates(){
  document.querySelectorAll(".request-card[data-request-id]").forEach(card=>{
    const requestId=String(card.dataset.requestId||"").toUpperCase();
    const scope=String(card.dataset.notificationScope||"OWN").toUpperCase();
    const set=scope==="REVIEW" ? state.unreadIds.review : state.unreadIds.own;
    const unread=set.has(requestId);

    card.classList.toggle("unread-card",unread);

    let pill=card.querySelector(".request-unread-pill");
    if(unread && !pill){
      const statusWrap=card.querySelector(".request-top > div:last-child");
      if(statusWrap){
        pill=document.createElement("span");
        pill.className="request-unread-pill";
        pill.innerHTML='<span class="request-unread-dot"></span>未讀';
        statusWrap.prepend(pill);
      }
    }else if(!unread && pill){
      pill.remove();
    }
  });
}

function locallyAddUnread(scope,requestId){
  const id=String(requestId||"").toUpperCase();
  if(!id) return;

  if(scope==="OWN"){
    state.unreadIds.own.add(id);
  }else if(scope==="REVIEW"){
    state.unreadIds.review.add(id);
  }
  updateUnreadBadges();
}

function notificationSupported(){
  return "Notification" in window;
}

function updateNotificationButton(){
  const btn=$("notifyBtn");
  if(!btn) return;
  btn.classList.remove("enabled","denied");

  if(!notificationSupported()){
    btn.textContent="通知不支援";
    btn.disabled=true;
    return;
  }

  if(Notification.permission==="granted"){
    btn.textContent="🔔 已開啟";
    btn.classList.add("enabled");
    btn.disabled=false;
  }else if(Notification.permission==="denied"){
    btn.textContent="🔕 已封鎖";
    btn.classList.add("denied");
    btn.disabled=false;
  }else{
    btn.textContent="🔔 開啟通知";
    btn.disabled=false;
  }
}

async function ensureServiceWorker(){
  if(!("serviceWorker" in navigator)) return null;
  try{
    const existing=await navigator.serviceWorker.getRegistration("./");
    if(existing) return existing;
    return await navigator.serviceWorker.register("./sw.js");
  }catch(err){
    console.warn("Service Worker registration failed",err);
    return null;
  }
}

async function enableSystemNotifications(){
  if(!notificationSupported()){
    toast("此瀏覽器不支援系統通知",true);
    return;
  }

  if(Notification.permission==="denied"){
    toast("瀏覽器已封鎖通知，請到網站/APP權限設定重新開啟",true);
    updateNotificationButton();
    return;
  }

  try{
    const permission=await Notification.requestPermission();
    updateNotificationButton();
    if(permission==="granted"){
      await ensureServiceWorker();
      toast("系統通知已開啟");
      await refreshNotificationSummary(true);
    }else{
      toast("尚未允許系統通知",true);
    }
  }catch(err){
    toast("無法開啟系統通知："+err.message,true);
  }
}

function loadSystemNotifiedIds(){
  try{
    const data=JSON.parse(localStorage.getItem(SYSTEM_NOTIFIED_KEY)||"[]");
    return Array.isArray(data)?data:[];
  }catch(err){
    return [];
  }
}

function saveSystemNotifiedIds(ids){
  try{
    localStorage.setItem(
      SYSTEM_NOTIFIED_KEY,
      JSON.stringify(Array.from(new Set(ids)).slice(-120))
    );
  }catch(err){}
}

async function showSystemNotification(item){
  if(!item || Notification.permission!=="granted") return;
  const options={
    body:item.message||"",
    tag:item.notificationId||item.requestId||undefined,
    renotify:true,
    data:{requestId:item.requestId||"",scope:item.scope||""}
  };

  try{
    const reg=await ensureServiceWorker();
    if(reg && typeof reg.showNotification==="function"){
      await reg.showNotification(item.title||"IQC 異常處理台",options);
      return;
    }
  }catch(err){
    console.warn("SW notification failed",err);
  }

  try{
    new Notification(item.title||"IQC 異常處理台",options);
  }catch(err){
    console.warn("Notification fallback failed",err);
  }
}

async function notifyNewUnreadItems(items){
  if(Notification.permission!=="granted" || !Array.isArray(items)) return;
  const notified=loadSystemNotifiedIds();
  const known=new Set(notified);
  const fresh=items
    .slice()
    .reverse()
    .filter(item=>item.notificationId && !known.has(item.notificationId));

  for(const item of fresh){
    await showSystemNotification(item);
    known.add(item.notificationId);
  }
  saveSystemNotifiedIds(Array.from(known));
}

async function refreshNotificationSummary(showSystem=false){
  if(!Api.hasToken() || !state.user) return;
  try{
    const response=await Api.post("notification_summary",{});
    updateUnreadBadges(response);
    if(showSystem){
      await notifyNewUnreadItems(response.notifications||[]);
    }
  }catch(err){
    console.warn("notification_summary failed",err);
  }
}

async function markSingleRequestViewed(scope,requestId,cardEl){
  const normalizedScope=String(scope||"OWN").toUpperCase();
  const id=String(requestId||"").toUpperCase();
  if(!Api.hasToken() || !state.user || !id) return;

  const set=normalizedScope==="REVIEW"
    ? state.unreadIds.review
    : state.unreadIds.own;

  if(!set.has(id)) return;

  // Optimistic UI：只清這一張；失敗時 polling 會補回。
  set.delete(id);
  updateUnreadBadges();

  if(cardEl){
    cardEl.classList.remove("unread-card");
    const pill=cardEl.querySelector(".request-unread-pill");
    if(pill) pill.remove();
  }

  try{
    await Api.post("mark_notifications_viewed",{
      scope:normalizedScope,
      request_id:id
    });
  }catch(err){
    console.warn("mark_notifications_viewed failed",err);
    set.add(id);
    updateUnreadBadges();
    toast("未讀狀態更新失敗，系統稍後會重試",true);
  }
}

async function handleRequestCardView(event,cardEl){
  if(!cardEl) return;

  const requestId=String(cardEl.dataset.requestId||"").toUpperCase();
  const scope=String(cardEl.dataset.notificationScope||"OWN").toUpperCase();
  const set=scope==="REVIEW"
    ? state.unreadIds.review
    : state.unreadIds.own;

  if(!set.has(requestId)) return;

  // 使用者真的點到這張卡才算 VIEW。
  await markSingleRequestViewed(scope,requestId,cardEl);
}
window.handleRequestCardView=handleRequestCardView;


function startNotificationPolling(){
  if(state.notificationTimer){
    clearInterval(state.notificationTimer);
    state.notificationTimer=null;
  }
  refreshNotificationSummary(true);
  state.notificationTimer=setInterval(()=>{
    refreshNotificationSummary(true);
  },NOTIFICATION_POLL_MS);
}

function stopNotificationPolling(){
  if(state.notificationTimer){
    clearInterval(state.notificationTimer);
    state.notificationTimer=null;
  }
}

async function loadMyRequests(){
  try{
    const response=await Api.post("list_requests",{limit:100});
    $("myRequestList").innerHTML=response.requests.length
      ? `<div class="request-list">${response.requests.map(item=>requestCard(
          item,
          false,
          state.unreadIds.own.has(String(item.requestId||"").toUpperCase())
        )).join("")}</div>`
      : `<div class="empty">目前沒有異常單。</div>`;
  }catch(err){
    toast(err.message,true);
  }
}

async function loadReview(){
  try{
    const response=await Api.post("list_requests",{limit:200});
    $("reviewList").innerHTML=response.requests.length
      ? `<div class="request-list">${response.requests.map(item=>requestCard(
          item,
          true,
          state.unreadIds.review.has(String(item.requestId||"").toUpperCase())
        )).join("")}</div>`
      : `<div class="empty">目前沒有待審核異常單。</div>`;
  }catch(err){
    toast(err.message,true);
  }
}

function switchTab(tab){
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.classList.toggle("active",btn.dataset.tab===tab);
  });
  ["workbench","requests","review"].forEach(name=>{
    $(`tab-${name}`).classList.toggle("hidden",name!==tab);
  });

  // v0.9.6：切換頁籤不代表 VIEW。
  if(tab==="requests") loadMyRequests();
  if(tab==="review") loadReview();
}

async function reviewRequest(requestId,action){
  const note=prompt(action==="APPROVE"?"請輸入核准說明（可留空）":"請輸入駁回原因");
  if(note===null) return;
  try{
    const response = await Api.post("review_request",{
      request_id:requestId,
      decision:action,
      review_note:note
    });
    toast(response.message || (action==="APPROVE"?"已核准並套用異常修正":"已駁回異常單"));
    await loadReview();
    await loadMyRequests();
  }catch(err){
    toast(err.message,true);
  }
}
window.reviewRequest=reviewRequest;

async function closeRequest(requestId){
  const note=prompt("請輸入結案備註（可留空）");
  if(note===null) return;
  try{
    await Api.post("close_request",{
      request_id:requestId,
      close_note:note
    });
    toast("異常單已結案");
    await loadReview();
    await loadMyRequests();
  }catch(err){
    toast(err.message,true);
  }
}
window.closeRequest=closeRequest;

function updateCapsLockState(event){
  const warning=$("capsLockWarning");
  if(!warning || typeof event.getModifierState!=="function") return;
  warning.classList.toggle("hidden",!event.getModifierState("CapsLock"));
}

function updateCapsLockState(event){
  const warning=$("capsLockWarning");
  if(!warning || typeof event.getModifierState!=="function") return;
  warning.classList.toggle("hidden",!event.getModifierState("CapsLock"));
}

$("passwordToggleBtn").addEventListener("click",()=>{
  const input=$("loginPassword");
  const show=input.type==="password";
  input.type=show?"text":"password";
  $("eyeOpenIcon").classList.toggle("hidden",show);
  $("eyeClosedIcon").classList.toggle("hidden",!show);
  $("passwordToggleBtn").setAttribute("aria-pressed",String(show));
  $("passwordToggleBtn").setAttribute("aria-label",show?"隱藏密碼":"顯示密碼");
  $("passwordToggleBtn").title=show?"隱藏密碼":"顯示密碼";
  input.focus({preventScroll:true});
});

["keydown","keyup"].forEach(type=>{
  $("loginPassword").addEventListener(type,updateCapsLockState);
});
$("loginPassword").addEventListener("blur",()=>{
  $("capsLockWarning").classList.add("hidden");
});
$("loginPassword").addEventListener("focus",event=>{
  updateCapsLockState(event);
});


function isMobileRequestDrawer(){
  return window.matchMedia("(max-width:680px)").matches;
}

function openMobileRequestPanel(){
  if(!isMobileRequestDrawer()) return;
  $("requestPanelToast")?.classList.add("hidden");
  document.body.classList.add("mobile-request-open");
  $("mobileRequestBackdrop").classList.remove("hidden");
  $("mobileRequestToggle").setAttribute("aria-expanded","true");
}

function closeMobileRequestPanel(){
  document.body.classList.remove("mobile-request-open");
  $("mobileRequestBackdrop").classList.add("hidden");
  $("mobileRequestToggle").setAttribute("aria-expanded","false");
  $("requestPanelToast")?.classList.add("hidden");
}

$("mobileRequestToggle").addEventListener("click",openMobileRequestPanel);
$("mobileRequestClose").addEventListener("click",closeMobileRequestPanel);
$("mobileRequestBackdrop").addEventListener("click",closeMobileRequestPanel);

window.addEventListener("resize",()=>{
  if(!isMobileRequestDrawer()) closeMobileRequestPanel();
});

document.addEventListener("keydown",event=>{
  if(event.key==="Escape") closeMobileRequestPanel();
});

$("notifyBtn").addEventListener("click",enableSystemNotifications);

$("loginForm").addEventListener("submit",async event=>{
  event.preventDefault();
  const btn=$("loginSubmitBtn");
  btn.disabled=true;
  btn.textContent="登入中…";
  try{
    await login(
      $("loginUser").value.trim(),
      $("loginPassword").value,
      $("rememberLogin").checked
    );
  }catch(err){
    hideLoading();
    toast(err.message,true);
  }finally{
    btn.disabled=false;
    btn.textContent="登入異常處理台";
  }
});
$("logoutBtn").addEventListener("click",()=>{
  stopNotificationPolling();
  Api.clearToken();
  state.user=null;
  state.unread={own:0,review:0};
  state.unreadIds={
    own:new Set(),
    review:new Set()
  };
  state.transferSelection={
    sourceFrameCtn:"",
    bottles:[]
  };
  updateUnreadBadges();
  showLogin();
});
$("lookupBtn").addEventListener("click",lookup);
$("clearLookupBtn").addEventListener("click",()=>{
  $("lookupQuery").value="";
  $("lookupResult").innerHTML="";
  state.lookup=null;
  clearTransferSelection(false);
  setSelection(null);
});
$("lookupQuery").addEventListener("input",event=>{
  event.target.value=event.target.value.toUpperCase()
});
$("lookupQuery").addEventListener("keydown",event=>{
  if(event.key==="Enter"){event.preventDefault();lookup()}
});
$("requestType").addEventListener("change",()=>{
  if(isTransferMode()){
    if(
      !(state.transferSelection?.bottles||[]).length &&
      state.selection?.targetKind==="bottle"
    ){
      toggleTransferBottle({
        ctn:state.selection.targetCtn,
        frameCtn:state.selection.sourceFrameCtn,
        rt:state.selection.rt
      });
      return;
    }
  }else{
    clearTransferSelection(false);
  }
  renderRequestDynamicFields();
  applySelectionStyles();
});
$("submitRequestBtn").addEventListener("click",createRequest);
$("refreshRequestsBtn").addEventListener("click",loadMyRequests);
$("refreshReviewBtn").addEventListener("click",loadReview);
document.querySelectorAll(".tab").forEach(btn=>
  btn.addEventListener("click",()=>switchTab(btn.dataset.tab))
);

// 先強制回到單一畫面，避免部分 Android / PWA 從快照恢復時同時看到登入與主畫面
updateNotificationButton();
ensureServiceWorker();
showLogin();

window.addEventListener("pageshow",()=>{
  if(state.user){
    showApp();
    refreshNotificationSummary(true);
  }else if(!Api.hasToken()){
    showLogin();
  }
});

document.addEventListener("visibilitychange",()=>{
  if(
    document.visibilityState==="visible" &&
    state.user &&
    Api.hasToken()
  ){
    refreshNotificationSummary(true);
  }
});

window.addEventListener("focus",()=>{
  if(state.user && Api.hasToken()){
    refreshNotificationSummary(true);
  }
});

tryRestore();

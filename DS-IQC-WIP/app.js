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
const state = { user:null, bootstrap:null, lookup:null, selection:null };

const REQUEST_TYPES = [
  {code:"ADD_MISSING_BOTTLE",label:"新增漏建鋼瓶"},
  {code:"CORRECT_BOTTLE_CTN",label:"修改鋼瓶CTN"},
  {code:"CORRECT_RT",label:"修改鋼瓶RT"},
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
  const el=$("toast");
  el.textContent=message;
  el.className="toast"+(error?" error":"");
  el.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>el.classList.add("hidden"),3600);
}

function normalizeCtn(value){
  return String(value||"").trim().toUpperCase().replace(/\s+/g,"");
}

function normalizeRt(value){
  return String(value||"").trim().toUpperCase().replace(/^RT/i,"").replace(/\s+/g,"");
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

async function login(userId,password,remember){
  showLoading("正在登入","正在驗證帳號、密碼與系統權限…");
  const result=await Api.post("login",{user_id:userId,password});

  updateLoading("登入成功","正在開啟 IQC 異常處理台…");
  Api.saveToken(result.sessionToken,remember);
  hydrateUiFromLogin(result);
  showApp();
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
    showApp();
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
  const targetValue = selection?.targetCtn || "";
  $("targetCtn").value = targetValue;
  const display = $("targetCtnDisplay");
  const hint = $("targetCtnHint");

  if(targetValue){
    display.textContent = targetValue;
    display.classList.remove("muted");
    if(selection?.targetKind==="bottle"){
      hint.textContent = `已選取鋼瓶 CTN；來源運輸框：${selection.sourceFrameCtn||"-"}${selection.rt?`｜RT：${selection.rt}`:""}`;
    }else if(selection?.targetKind==="frame"){
      hint.textContent = "已選取運輸框 CTN；可用於新增漏建鋼瓶或修改運輸框 CTN。";
    }else{
      hint.textContent = "主要 CTN 已帶入；可依異常類型補充必要欄位。";
    }
  }else{
    display.textContent = "請先在左側查詢資料；也可點選鋼瓶帶入主要 CTN。";
    display.classList.add("muted");
    hint.textContent = "主要 CTN 會跟隨查詢結果或鋼瓶點選帶入，不需手動輸入。";
  }
  renderRequestDynamicFields();
  applySelectionStyles();
}

function applySelectionStyles(){
  document.querySelectorAll(".bottle-row.selectable").forEach(el=>{
    const ctn = normalizeCtn(el.dataset.ctn || "");
    el.classList.toggle("selected", !!state.selection && ctn === normalizeCtn(state.selection.targetCtn));
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
    });
  });

  document.querySelectorAll(".bottle-row.selectable").forEach(el=>{
    el.addEventListener("click",()=>{
      setSelection({
        targetCtn: normalizeCtn(el.dataset.ctn),
        targetKind: "bottle",
        sourceFrameCtn: normalizeCtn(el.dataset.frame || ""),
        rt: el.dataset.rt || ""
      });
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
        <span class="fold-summary-note">點選鋼瓶可帶入右側主要 CTN</span>
      </summary>
      <div class="bottle-list" style="padding:10px">${
        rows.map((row,index)=>`
          <div class="bottle-row selectable js-select-ctn"
               data-ctn="${escapeHtml(displayValue(row.ctn,''))}"
               data-rt="${escapeHtml(displayValue(row.rt,''))}"
               data-frame="${escapeHtml(displayValue(frameCtn||row.transportFrameCtn,''))}">
            <div class="bottle-no">${escapeHtml(row.pairNo||String(index+1))}</div>
            <div class="bottle-main">
              <div class="bottle-ctn">${escapeHtml(displayValue(row.ctn))}</div>
              <div class="bottle-sub">鋼瓶 CTN</div>
            </div>
            <div class="bottle-rt">RT：${escapeHtml(displayValue(row.rt))}</div>
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
    renderLookup(response.result);
    setSelection(deriveSelectionFromResult(response.result));
  }catch(err){
    toast(err.message,true);
  }finally{
    $("lookupBtn").disabled=false;
  }
}

function renderRequestDynamicFields(){
  const wrap = $("requestDynamicFields");
  if(!wrap) return;
  const type = $("requestType").value || REQUEST_TYPES[0].code;
  const selection = state.selection || {};
  const sourceFrame = selection.sourceFrameCtn || (selection.targetKind==="frame" ? selection.targetCtn : "");

  const needBottleHint = ['CORRECT_BOTTLE_CTN','CORRECT_RT','TRANSFER_BOTTLE_FRAME'].includes(type) && selection.targetKind!=="bottle";
  let hint = needBottleHint
    ? '<div class="field-hint">請先在左側查詢結果中點選鋼瓶，讓主要 CTN 帶入要處理的鋼瓶。</div>'
    : '';

  let html = "";
  switch(type){
    case "ADD_MISSING_BOTTLE":
      html = `
        <div class="field">
          <label for="requestAddBottleCtn">待新增鋼瓶 CTN</label>
          <input id="requestAddBottleCtn" maxlength="7" placeholder="請輸入待新增鋼瓶 CTN">
        </div>`;
      break;
    case "CORRECT_BOTTLE_CTN":
      html = `
        ${hint}
        <div class="field">
          <label for="requestNewBottleCtn">待修改鋼瓶 CTN</label>
          <input id="requestNewBottleCtn" maxlength="7" placeholder="請輸入正確鋼瓶 CTN">
        </div>`;
      break;
    case "CORRECT_RT":
      html = `
        ${hint}
        <div class="field">
          <label for="requestNewBottleRt">待修改鋼瓶 RT</label>
          <input id="requestNewBottleRt" placeholder="請輸入正確 RT 料號">
        </div>`;
      break;
    case "MISSING_TRANSPORT_FRAME":
      html = `
        <div class="field">
          <label>原運輸框 CTN</label>
          <div class="static-display ${sourceFrame ? "" : "muted"}">${escapeHtml(sourceFrame || "請先查詢運輸框資料")}</div>
        </div>
        <div class="field">
          <label for="requestNewFrameCtn">待修改運輸框 CTN</label>
          <input id="requestNewFrameCtn" maxlength="7" placeholder="請輸入正確運輸框 CTN">
        </div>`;
      break;
    case "TRANSFER_BOTTLE_FRAME":
      html = `
        ${hint}
        <div class="field">
          <label for="requestMoveFrameCtn">待轉移運輸框 CTN</label>
          <input id="requestMoveFrameCtn" maxlength="7" placeholder="請輸入待轉移運輸框 CTN">
        </div>`;
      break;
    case "VOID_INCORRECT_RECORD":
      html = '';
      break;
    default:
      html = '';
  }
  wrap.innerHTML = html;

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
}

function collectRequestPayload(){
  const requestType=$("requestType").value;
  const targetCtn=normalizeCtn($("targetCtn").value);
  const selection = state.selection || {};
  const sourceFrameCtn = normalizeCtn(selection.sourceFrameCtn || (selection.targetKind==="frame" ? selection.targetCtn : ""));
  const reason=$("requestReason").value.trim();

  if(!targetCtn) throw new Error("請先在左側查詢資料，或點選鋼瓶帶入主要 CTN。");
  if(!reason) throw new Error("請填寫異常原因");

  let destinationFrameCtn="";
  let oldValue="";
  let newValue="";

  if(requestType==="ADD_MISSING_BOTTLE"){
    newValue = normalizeCtn($("requestAddBottleCtn")?.value);
    if(!newValue) throw new Error("請填寫待新增鋼瓶 CTN");
  }else if(requestType==="CORRECT_BOTTLE_CTN"){
    if(selection.targetKind!=="bottle") throw new Error("請先在左側點選要修改的鋼瓶");
    oldValue = targetCtn;
    newValue = normalizeCtn($("requestNewBottleCtn")?.value);
    if(!newValue) throw new Error("請填寫待修改鋼瓶 CTN");
  }else if(requestType==="CORRECT_RT"){
    if(selection.targetKind!=="bottle") throw new Error("請先在左側點選要修改 RT 的鋼瓶");
    oldValue = String(selection.rt || "").trim();
    newValue = normalizeRt($("requestNewBottleRt")?.value);
    if(!newValue) throw new Error("請填寫待修改鋼瓶 RT");
  }else if(requestType==="MISSING_TRANSPORT_FRAME"){
    oldValue = sourceFrameCtn || targetCtn;
    if(!oldValue) throw new Error("請先查詢原運輸框 CTN");
    newValue = normalizeCtn($("requestNewFrameCtn")?.value);
    if(!newValue) throw new Error("請填寫待修改運輸框 CTN");
  }else if(requestType==="TRANSFER_BOTTLE_FRAME"){
    if(selection.targetKind!=="bottle") throw new Error("請先在左側點選要轉移的鋼瓶");
    destinationFrameCtn = normalizeCtn($("requestMoveFrameCtn")?.value);
    if(!destinationFrameCtn) throw new Error("請填寫待轉移運輸框 CTN");
  }

  return {
    request_type:requestType,
    target_ctn:targetCtn,
    source_frame_ctn:sourceFrameCtn,
    destination_frame_ctn:destinationFrameCtn,
    old_value:{value:oldValue},
    proposed_value:{value:newValue},
    reason,
    evidence_url:""
  };
}

async function createRequest(){
  $("submitRequestBtn").disabled=true;
  try{
    const payload = collectRequestPayload();
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
        </div>
      </div>`;
    toast("異常單建立成功");
    $("requestReason").value="";
    renderRequestDynamicFields();
    await loadMyRequests();
  }catch(err){
    toast(err.message,true);
  }finally{
    $("submitRequestBtn").disabled=false;
  }
}

function requestCard(request,reviewMode){
  const statusClass=request.status==="PENDING_REVIEW"?"warn":
    request.status==="REJECTED"?"danger":"ok";
  const riskClass=request.riskLevel==="HIGH"?"danger":"warn";
  const typeLabel = requestLabelByCode(request.requestType || request.request_type, request.requestTypeLabel);

  const snapshot = request.sourceSnapshot || {};
  let detailLine = `主要 CTN：${escapeHtml(request.targetCtn||"-")}｜原因：${escapeHtml(request.reason)}`;
  if(typeLabel==="鋼瓶轉移運輸框"){
    detailLine += `<br>待轉移運輸框 CTN：${escapeHtml(request.destinationFrameCtn||request.proposedValue?.value||"-")}`;
  }else if(typeLabel==="新增漏建鋼瓶"){
    detailLine += `<br>待新增鋼瓶 CTN：${escapeHtml(request.proposedValue?.value||"-")}`;
  }else if(typeLabel==="修改運輸框CTN"){
    detailLine += `<br>原運輸框 CTN：${escapeHtml(request.sourceFrameCtn||request.oldValue?.value||"-")}｜待修改運輸框 CTN：${escapeHtml(request.proposedValue?.value||"-")}`;
  }else if(typeLabel==="修改鋼瓶CTN"){
    detailLine += `<br>待修改鋼瓶 CTN：${escapeHtml(request.proposedValue?.value||"-")}`;
  }else if(typeLabel==="修改鋼瓶RT"){
    detailLine += `<br>待修改鋼瓶 RT：${escapeHtml(request.proposedValue?.value||"-")}`;
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
  return `
    <article class="request-card">
      <div class="request-top">
        <div>
          <div class="request-id">${escapeHtml(request.requestId)}</div>
          <div class="request-meta">
            ${escapeHtml(typeLabel)}｜${escapeHtml(request.requesterName)}｜${escapeHtml(request.createdAt)}
          </div>
        </div>
        <div>
          <span class="pill ${statusClass}">${escapeHtml(request.status)}</span>
          <span class="pill ${riskClass}">${escapeHtml(request.riskLevel)}</span>
        </div>
      </div>
      <div class="request-meta">${detailLine}</div>
      ${request.reviewNote?`<div class="request-meta">審核：${escapeHtml(request.reviewNote)}</div>`:""}
      ${buttons}
    </article>`;
}

async function loadMyRequests(){
  try{
    const response=await Api.post("list_requests",{limit:100});
    $("myRequestList").innerHTML=response.requests.length
      ? `<div class="request-list">${response.requests.map(item=>requestCard(item,false)).join("")}</div>`
      : `<div class="empty">目前沒有異常單。</div>`;
  }catch(err){
    toast(err.message,true);
  }
}

async function loadReview(){
  try{
    const response=await Api.post("list_requests",{limit:200});
    $("reviewList").innerHTML=response.requests.length
      ? `<div class="request-list">${response.requests.map(item=>requestCard(item,true)).join("")}</div>`
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
  Api.clearToken();state.user=null;showLogin()
});
$("lookupBtn").addEventListener("click",lookup);
$("clearLookupBtn").addEventListener("click",()=>{
  $("lookupQuery").value="";
  $("lookupResult").innerHTML="";
  state.lookup=null;
  setSelection(null);
});
$("lookupQuery").addEventListener("input",event=>{
  event.target.value=event.target.value.toUpperCase()
});
$("lookupQuery").addEventListener("keydown",event=>{
  if(event.key==="Enter"){event.preventDefault();lookup()}
});
$("requestType").addEventListener("change",renderRequestDynamicFields);
$("submitRequestBtn").addEventListener("click",createRequest);
$("refreshRequestsBtn").addEventListener("click",loadMyRequests);
$("refreshReviewBtn").addEventListener("click",loadReview);
document.querySelectorAll(".tab").forEach(btn=>
  btn.addEventListener("click",()=>switchTab(btn.dataset.tab))
);

// 先強制回到單一畫面，避免部分 Android / PWA 從快照恢復時同時看到登入與主畫面
showLogin();

window.addEventListener("pageshow",()=>{
  if(state.user){
    showApp();
  }else if(!Api.hasToken()){
    showLogin();
  }
});

tryRestore();

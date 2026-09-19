"use strict";
const CFG = window.DS_PORTAL_CONFIG;
if(!CFG) throw new Error("DS_PORTAL_CONFIG 未載入");

const state={
  authUser:null,
  profile:null,
  priorities:[],
  rtMaster:[],
  rtMap:new Map(),
  filter:"ALL",
  selectedRt:null
};
const $=id=>document.getElementById(id);

function showLoading(title,text){
  $("authFailureDialog").classList.add("hidden");
  $("loadingTitle").textContent=title||"正在處理";
  $("loadingText").textContent=text||"請稍候…";
  $("loadingOverlay").classList.remove("hidden");
}
function hideLoading(){ if(!authTask)$("loadingOverlay").classList.add("hidden"); }
function toast(message,error=false){
  const el=$("toast");
  el.textContent=message;
  el.className="toast"+(error?" error":"");
  el.classList.remove("hidden");
  clearTimeout(toast.t);
  toast.t=setTimeout(()=>el.classList.add("hidden"),3600);
}
function escapeHtml(v){
  return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function getToken(){
  return sessionStorage.getItem(CFG.AUTH_TOKEN_KEY)||localStorage.getItem(CFG.AUTH_TOKEN_KEY)||"";
}
function saveToken(token,remember){
  sessionStorage.removeItem(CFG.AUTH_TOKEN_KEY);
  localStorage.removeItem(CFG.AUTH_TOKEN_KEY);
  (remember?localStorage:sessionStorage).setItem(CFG.AUTH_TOKEN_KEY,token);
}
function clearToken(){
  sessionStorage.removeItem(CFG.AUTH_TOKEN_KEY);
  localStorage.removeItem(CFG.AUTH_TOKEN_KEY);
}
function saveRememberedAccount(account,remember){
  const normalized=String(account||"").trim();
  if(remember){
    localStorage.setItem(CFG.REMEMBER_ACCOUNT_KEY,normalized);
    localStorage.setItem(CFG.REMEMBER_ENABLED_KEY,"1");
  }else{
    localStorage.removeItem(CFG.REMEMBER_ACCOUNT_KEY);
    localStorage.removeItem(CFG.REMEMBER_ENABLED_KEY);
  }
}
function hydrateRememberedLogin(){
  const remember=localStorage.getItem(CFG.REMEMBER_ENABLED_KEY)==="1";
  const account=remember?String(localStorage.getItem(CFG.REMEMBER_ACCOUNT_KEY)||""):"";
  if($("rememberLogin")) $("rememberLogin").checked=remember;
  if(account&&$("loginAccount")&&!$("loginAccount").value) $("loginAccount").value=account;
}
function isExplicitAuthInvalidMessage(message){
  const text=String(message||"").toLowerCase();
  return /登入狀態無效|登入簽章無效|登入資訊損壞|登入已逾時|帳號不存在或已停用/.test(text)||text.includes("登入狀態已失效")||text.includes("session invalid")||text.includes("session expired")||text.includes("帳號已停用")||text.includes("此帳號已停用");
}
async function portalPublicPost(api,payload={}){
  assertPortalConfigured();
  const body={...payload,api,client_version:CFG.CLIENT_VERSION};
  const r=await fetch(CFG.PORTAL_API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(body),redirect:"follow",cache:"no-store"});
  const text=await r.text();
  let data;
  try{data=JSON.parse(text)}catch(_){throw new Error("Portal API 回傳格式錯誤")}
  if(!data.ok) throw new Error(data.message||"Portal API 執行失敗");
  return data;
}
function assertPortalConfigured(){
  if(!CFG.PORTAL_API_URL||CFG.PORTAL_API_URL.includes("PASTE_")) throw new Error("尚未設定 DS Portal Apps Script /exec URL");
}
async function portalPost(api,payload={},control={}){
  assertPortalConfigured();
  const token=getToken();
  if(!token) throw new Error("登入狀態已失效");
  const body={...payload,api,client_version:CFG.CLIENT_VERSION,session_token:token};
  const r=await fetch(CFG.PORTAL_API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(body),redirect:"follow",cache:"no-store",signal:control.signal});
  const text=await r.text();
  let data;
  try{data=JSON.parse(text)}catch(_){throw new Error("Portal API 回傳格式錯誤")}
  if(!data.ok) throw new Error(data.message||"Portal API 執行失敗");
  return data;
}
function openExternal(url,label){
  if(!url||url.includes("PASTE_")){
    toast(`${label}網址尚未設定`,true);
    return;
  }
  location.href=url;
}
function moduleUrl(url){
  if(!url||url.includes("PASTE_")) return "";
  try{
    const u=new URL(url,location.href);
    u.searchParams.set("ds_shell","1");
    return u.href;
  }catch(_){return url}
}
function setActiveNav(key){
  document.querySelectorAll(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.nav===key));
}
function syncBottomNavHeight(){
  const nav=document.querySelector(".bottom-nav");
  if(!nav) return;
  const h=Math.max(1,Math.ceil(nav.getBoundingClientRect().height));
  document.documentElement.style.setProperty("--ds-nav-real-h",`${h}px`);
}
function syncShellViewport(){
  // iOS standalone PWA 在 iframe module 切換時，layout viewport 與 visual viewport
  // 偶爾不同步；直接以目前可視高度作為 App Shell 的實際高度。
  const vv=window.visualViewport;
  const h=Math.max(1,Math.round(vv?.height||window.innerHeight||document.documentElement.clientHeight||1));
  document.documentElement.style.setProperty("--ds-shell-vh",`${h}px`);
  syncBottomNavHeight();
}
function installBottomNavHeightObserver(){
  syncShellViewport();
  if(typeof ResizeObserver!=="undefined"){
    const nav=document.querySelector(".bottom-nav");
    if(nav){
      const ro=new ResizeObserver(()=>syncBottomNavHeight());
      ro.observe(nav);
      window.__dsBottomNavRO=ro;
    }
  }
  addEventListener("resize",syncShellViewport,{passive:true});
  addEventListener("orientationchange",()=>setTimeout(syncShellViewport,80),{passive:true});
  if(window.visualViewport){
    window.visualViewport.addEventListener("resize",syncShellViewport,{passive:true});
  }
}
function ensureModuleFrame(key,url,title){
  const host=$("moduleFrameHost");
  let frame=host.querySelector(`[data-module-key="${key}"]`);
  if(!frame){
    frame=document.createElement("iframe");
    frame.className="module-frame hidden";
    frame.dataset.moduleKey=key;
    frame.title=title||key;
    frame.setAttribute("allow","clipboard-read; clipboard-write; camera; notifications");
    frame.setAttribute("referrerpolicy","strict-origin-when-cross-origin");
    frame.src=moduleUrl(url);
    host.appendChild(frame);
  }
  return frame;
}
function prewarmModule(key,url,title){
  if(!url||url.includes("PASTE_")) return null;
  return ensureModuleFrame(key,url,title);
}
function prewarmForNav(view){
  if(view==="daily" && permission("daily_report_enabled")) return prewarmModule("daily",CFG.DAILY_REPORT_URL,"日報系統");
  if(view==="grinding" && permission("grinding_enabled")) return prewarmModule("grinding",CFG.GRINDING_URL,"Grinding WIP");
  if(view==="dashboard") return prewarmModule("dashboard",CFG.DASHBOARD_PUBLIC_URL,"日報 Dashboard");
  return null;
}
function scheduleCorePrewarm(){
  // 不在登入階段搶頻寬；先讓工作台可操作，再分段預熱最常用的兩個內部模組。
  clearTimeout(scheduleCorePrewarm.t1);
  clearTimeout(scheduleCorePrewarm.t2);
  scheduleCorePrewarm.t1=setTimeout(()=>{
    if(document.hidden) return;
    prewarmForNav("daily");
  },1200);
  scheduleCorePrewarm.t2=setTimeout(()=>{
    if(document.hidden) return;
    prewarmForNav("grinding");
  },2600);
}

function openModule(key,url,title,navKey){
  if(!url||url.includes("PASTE_")){
    toast(`${title}網址尚未設定`,true);
    return;
  }
  const frame=ensureModuleFrame(key,url,title);
  $("homeModule").classList.add("hidden");
  $("moreModule").classList.add("hidden");
  $("moduleModule").classList.remove("hidden");
  $("moduleFrameHost").querySelectorAll(".module-frame").forEach(f=>f.classList.toggle("hidden",f!==frame));
  syncShellViewport();
  $("appShell").classList.add("module-mode");
  document.body.classList.add("ds-module-active");
  // iOS PWA 在切換 iframe 時偶爾會延後重算 safe-area；下一個 frame 再校正一次。
  requestAnimationFrame(syncShellViewport);
  setActiveNav(navKey||key);
  if(key==="oqc") window.__DS_SHELL_UX__?.repatch();
}
function leaveModuleMode(){
  $("moduleModule").classList.add("hidden");
  $("appShell").classList.remove("module-mode");
  document.body.classList.remove("ds-module-active");
  requestAnimationFrame(syncShellViewport);
}
function permission(key){return !!state.profile?.permissions?.[key]}
function setNavPermission(id,enabled){
  const el=$(id);
  el.classList.toggle("locked",!enabled);
  el.dataset.enabled=enabled?"1":"0";
}
function syncShellPermissions(){
  setNavPermission("navHome",permission("home_enabled"));
  setNavPermission("navDaily",permission("daily_report_enabled"));
  // Dashboard 是 public exception，永遠可進。
  setNavPermission("navDashboard",true);
  $("navGrinding").classList.toggle("hidden",!permission("grinding_enabled"));
  $("addPriorityBtn").classList.toggle("hidden",!permission("production_priority_edit_enabled"));
  renderMore();
}
function showLogin(){
  $("appShell").classList.add("hidden");
  $("loginView").classList.remove("hidden");
  $("retrySessionBtn").classList.toggle("hidden",!getToken());
}
function showApp(){
  $("loginView").classList.add("hidden");
  $("appShell").classList.remove("hidden");
}
function hydrateUser(){
  const user=state.profile?.user||state.authUser||{};
  $("userName").textContent=user.displayName||user.display_name||"使用者";
  $("userRole").textContent=user.role||"";
  $("userMenuName").textContent=`${user.displayName||user.display_name||"使用者"}${user.role?`｜${user.role}`:""}`;
}
async function loadProfile(){
  const result=await portalPost("portal_profile",{});
  state.profile=result;
  hydrateUser();
  syncShellPermissions();
}
function requestedReturnPath(){
  const p=new URLSearchParams(location.search);
  return String(p.get("return")||"");
}
function clearReturnQuery(){
  const u=new URL(location.href);
  u.searchParams.delete("return");
  u.searchParams.delete("reason");
  history.replaceState({},"",u.pathname+(u.search?u.search:"")+u.hash);
}
function routeAfterAuth(){
  const target=requestedReturnPath();
  if(!target) return false;
  clearReturnQuery();
  if(target.includes("/ds-report-pwa-beta/") && permission("grinding_enabled")){
    openModule("grinding",CFG.GRINDING_URL,"Grinding WIP","grinding");
    return true;
  }
  if(target.includes("/ds-report-pwa/") && permission("daily_report_enabled")){
    openModule("daily",CFG.DAILY_REPORT_URL,"日報系統","daily");
    return true;
  }
  if(target.includes("/DS-IQC-WIP/") && permission("iqc_correction_enabled")){
    openModule("iqc",CFG.IQC_CORRECTION_URL,"IQC 異常處理","more");
    return true;
  }
  if(target.includes("/DS-OQC-SHIPPING/") && permission("stamp_shipping_enabled")){
    openModule("oqc",CFG.OQC_SHIPPING_URL,"OQC 庫存掃描／裝框","more");
    return true;
  }
  return false;
}
async function completeLogin(authResult,remember){
  if(authResult?.sessionToken) saveToken(authResult.sessionToken,remember);
  state.authUser=authResult?.user||state.authUser;
  await loadProfile();
  showApp();
  if(routeAfterAuth()) return;
  if(permission("home_enabled")){
    await loadHomeData();
    switchView("home");
  }else{
    switchView("more");
    toast("此帳號尚未勾選公佈欄權限");
  }
}
async function loadHomeDataSafe(){
  if(!permission("home_enabled")) return;
  try{
    await loadHomeData();
  }catch(err){
    if(err.name==="AbortError")return;
    console.warn("DS Portal home data load failed",err);
    toast(`公佈欄資料暫時無法載入：${err.message||err}`,true);
  }
}
let authTask=null;
let authEpoch=0;
let resumeValidationNeeded=false;
let authController=null;
let restoreViewPending=false;
const authRecords=[];
function renderAuthDiagnostics(){
  $("authDiagnosticText").textContent=JSON.stringify({build:"AUTH-K5",attempts:authRecords},null,2);
  $("authDiagnostics").classList.toggle("hidden",authRecords.length===0);
}
function authStatus(message){
  $("authStatus").textContent=message||"";$("authStatus").classList.toggle("hidden",!message);
}
function showAuthFailure(error,message){
  const explanation=message||error.message||"登入服務暫時無法使用，請重試。";
  authStatus(explanation);
  $("authFailureText").textContent=explanation;
  const last=authRecords.at(-1);
  $("authFailureCode").textContent=last?.errorCode?`連線代碼：${last.errorCode} · ${last.requestId.slice(0,8)}`:"";
  $("authFailureDialog").classList.remove("hidden");
  $("closeAuthFailureBtn").focus({preventScroll:true});
}
function markAuthApplied(result){
  const record=authRecords.find(r=>r.requestId===result.authDiagnostic?.requestId);
  if(record){record.appliedMs=Date.now()-Date.parse(record.startedAt);renderAuthDiagnostics();}
}
const authBridge=window.DsAuthBridge?.create({url:CFG.AUTH_API_URL});
const authTransport=window.DsAuthTransport.create({url:CFG.AUTH_API_URL,clientVersion:CFG.AUTH_CLIENT_VERSION,bridge:authBridge,
  onDiagnostic:record=>{authRecords.push(record);if(authRecords.length>5)authRecords.shift();renderAuthDiagnostics();}});
function cancelAuthentication(){
  authEpoch++;authController?.abort();authController=null;authTask=null;
  $("loginBtn").disabled=false;$("retrySessionBtn").disabled=false;
  $("cancelAuthBtn").classList.add("hidden");hideLoading();
  $("authFailureDialog").classList.add("hidden");
}
function authControl(epoch,signal){
  return {signal,onSlow:()=>{if(epoch===authEpoch)$("loadingText").textContent="登入服務仍在回應中；不必重新輸入，最長等待 45 秒。";}};
}

function runAuthentication(work){
  if(authTask) return authTask;
  cancelHomeData();authStatus("");
  const epoch=++authEpoch;
  const controller=new AbortController();authController=controller;
  $("loginBtn").disabled=true;
  $("retrySessionBtn").disabled=true;
  $("cancelAuthBtn").classList.remove("hidden");
  const pending=Promise.resolve().then(()=>{if(epoch===authEpoch)return work(epoch,controller.signal);}).catch(error=>{
    if(epoch===authEpoch&&error.code!=="AUTH_CANCELLED")showAuthFailure(error);
    throw error;
  }).finally(()=>{
    if(authTask!==pending)return;
    authTask=null;authController=null;
    $("loginBtn").disabled=false;$("retrySessionBtn").disabled=false;$("cancelAuthBtn").classList.add("hidden");
    if(epoch===authEpoch)hideLoading();
  });
  authTask=pending;
  return authTask;
}
function applyAuthentication(result,preserveView){
  state.authUser=result.user||null;
  state.profile={user:result.user||null,permissions:result.permissions||{}};
  hydrateUser();syncShellPermissions();showApp();hideLoading();
  // Remove frames whose permission was revoked while the app was suspended.
  const modulePermissions={daily:"daily_report_enabled",grinding:"grinding_enabled",iqc:"iqc_correction_enabled",oqc:"stamp_shipping_enabled"};
  let activeRevoked=false;
  $("moduleFrameHost").querySelectorAll(".module-frame").forEach(frame=>{
    const key=modulePermissions[frame.dataset.moduleKey];
    if(key&&!permission(key)){if(!frame.classList.contains("hidden"))activeRevoked=true;frame.remove();}
  });
  if(preserveView&&!activeRevoked){
    $("moduleFrameHost").querySelectorAll(".module-frame").forEach(frame=>{
      try{const win=frame.contentWindow;win.dispatchEvent(new win.CustomEvent("ds-iqc-session-restored"));}catch(_){ }
    });
    window.dispatchEvent(new CustomEvent("ds-session-restored"));
    return;
  }
  if(routeAfterAuth())return;
  switchView(permission("home_enabled")?"home":"more");
  loadHomeDataSafe();
}
function login(account,password,remember){
  return runAuthentication(async(epoch,signal)=>{
    const normalized=String(account||"").trim();
    saveRememberedAccount(normalized,remember);
    showLoading("正在登入","正在驗證帳號、密碼與最新權限…");
    const result=await authTransport.post("workstation_login",{user_id:normalized,password:String(password||"")},authControl(epoch,signal));
    if(epoch!==authEpoch)return;
    if(!result.sessionToken||!result.user||!result.permissions)throw new Error("登入服務回應不完整，請重試。");
    // Credentials login starts a fresh module context; old forms must not leak to another account.
    $("moduleFrameHost").replaceChildren();
    restoreViewPending=false;
    saveToken(result.sessionToken,remember);
    applyAuthentication(result,false);
    markAuthApplied(result);
    toast(`登入成功，${result.user.displayName||""}`);
  });
}
function tryRestore(preserveView=false){
  return runAuthentication(async(epoch,signal)=>{
    hydrateRememberedLogin();
    const token=getToken();
    if(!token){showLogin();return;}
    const previousUser=state.authUser;
    restoreViewPending=restoreViewPending||(preserveView&&!!state.profile);
    state.profile=null;
    showLoading("驗證登入狀態","正在確認登入有效性與最新權限…");
    try{
      const result=await authTransport.post("workstation_bootstrap",{session_token:token},authControl(epoch,signal));
      if(epoch!==authEpoch||getToken()!==token)return;
      if(!result.user||!result.permissions)throw new Error("登入服務回應不完整，請重試。");
      const sameUser=previousUser?.account===result.user.account;
      applyAuthentication(result,preserveView&&restoreViewPending&&sameUser);
      restoreViewPending=false;markAuthApplied(result);
    }catch(err){
      if(epoch!==authEpoch||getToken()!==token)return;
      if(isExplicitAuthInvalidMessage(err.message)){
        restoreViewPending=false;
        clearToken();state.authUser=null;$("moduleFrameHost").replaceChildren();
        authStatus("登入已失效，請重新登入。");
      }else{
        authStatus((err.message||"無法確認登入")+"；已保留登入資訊，請按「重試登入驗證」。");
      }
      showLogin();
      if(err.code!=="AUTH_CANCELLED")showAuthFailure(err,$("authStatus").textContent);
    }
  });
}

function switchView(view){
  leaveModuleMode();
  $("homeModule").classList.toggle("hidden",view!=="home");
  $("moreModule").classList.toggle("hidden",view!=="more");
  setActiveNav(view);
  if(view==="home"){
    $("pageEyebrow").textContent="OPERATIONS HOME";
    $("pageTitle").textContent="公佈欄";
  }else{
    $("pageEyebrow").textContent="TOOLS";
    $("pageTitle").textContent="更多功能";
  }
  scrollTo({top:0,behavior:"smooth"});
}
function handleNav(view){
  if(view==="home"){
    if(!permission("home_enabled")) return toast("此帳號未開啟公佈欄權限",true);
    return switchView("home");
  }
  if(view==="daily"){
    if(!permission("daily_report_enabled")) return toast("此帳號未開啟日報系統權限",true);
    return openModule("daily",CFG.DAILY_REPORT_URL,"日報系統","daily");
  }
  if(view==="dashboard") return openModule("dashboard",CFG.DASHBOARD_PUBLIC_URL,"日報 Dashboard","dashboard");
  if(view==="grinding"){
    if(!permission("grinding_enabled")) return toast("此帳號未開啟 Grinding WIP 權限",true);
    return openModule("grinding",CFG.GRINDING_URL,"Grinding WIP","grinding");
  }
  if(view==="more") return switchView("more");
}
function renderMore(){
  const tools=[];
  // Grinding WIP 已有固定底部入口，不在「更多」重複顯示。
  if(permission("iqc_correction_enabled")) tools.push({key:"iqc",title:"IQC 異常處理",desc:"補建、修正、轉框與異常單",url:CFG.IQC_CORRECTION_URL,nav:"more"});
  if(permission("stamp_shipping_enabled")) tools.push({key:"oqc",title:"OQC 庫存掃描／裝框",desc:"CTN 收錄、RT 更改與裝框歷史",url:CFG.OQC_SHIPPING_URL,nav:"more"});
  if(permission("inventory_enabled")) tools.push({title:"庫存盤點",desc:"中長期模組：現場實體庫存與盤點",disabled:true});
  if(permission("hr_enabled")) tools.push({title:"人事系統",desc:"已保留權限欄位，URL於整併時接入",disabled:true});
  if(!tools.length) tools.push({title:"尚無其他功能",desc:"System_Access_Master 勾選權限後會自動出現。",disabled:true});
  $("moreGrid").innerHTML=tools.map((t,i)=>`<button class="tool-card" type="button" data-tool-index="${i}" ${t.disabled?"disabled":""}><strong>${escapeHtml(t.title)}</strong><span>${escapeHtml(t.desc)}</span></button>`).join("");
  $("moreGrid").querySelectorAll("[data-tool-index]").forEach(btn=>{
    const warm=()=>{
      const item=tools[Number(btn.dataset.toolIndex)];
      if(item&&!item.disabled&&item.key&&item.url) prewarmModule(item.key,item.url,item.title);
    };
    btn.addEventListener("pointerdown",warm,{passive:true});
    btn.addEventListener("touchstart",warm,{passive:true});
    btn.addEventListener("click",()=>{
      const item=tools[Number(btn.dataset.toolIndex)];
      if(item&&!item.disabled) openModule(item.key,item.url,item.title,item.nav||"more");
    });
  });
}
let homeTask=null;
function cancelHomeData(){
  if(homeTask){homeTask.controller.abort();homeTask=null;}
}
function loadHomeData(){
  if(!permission("home_enabled")) return;
  const requestedToken=getToken();
  if(homeTask?.token===requestedToken)return homeTask.promise;
  cancelHomeData();
  const task={token:requestedToken,controller:new AbortController()};homeTask=task;
  const timer=setTimeout(()=>task.controller.abort(),30000);
  task.promise=(async()=>{
    const result=await portalPost("portal_home_data",{include_rt_master:!state.rtMaster.length},{signal:task.controller.signal});
    if(task.controller.signal.aborted||getToken()!==requestedToken||!state.profile)return;
    state.priorities=Array.isArray(result.priorities)?result.priorities:[];
    if(!state.rtMaster.length&&Array.isArray(result.rtMaster)){
      state.rtMaster=result.rtMaster;
      state.rtMap=new Map(state.rtMaster.map(item=>[String(item.rtNo),item]));
    }
    renderPriorities();
  })().finally(()=>{clearTimeout(timer);if(homeTask===task)homeTask=null;});
  return task.promise;
}
function renderPriorities(){
  const list=state.priorities.filter(item=>state.filter==="ALL"||item.status===state.filter);
  if(!list.length){
    $("priorityList").innerHTML='<div class="empty-state">目前沒有符合條件的生產需求。</div>';
    return;
  }
  const canEdit=permission("production_priority_edit_enabled");
  $("priorityList").innerHTML=list.map(item=>`
    <article class="priority-card" data-priority-id="${escapeHtml(item.priorityId)}" data-status="${escapeHtml(item.status)}">
      ${canEdit?`<button class="edit-priority" data-edit-id="${escapeHtml(item.priorityId)}" type="button">✎</button>`:""}
      <div class="priority-line1">
        <span>${escapeHtml(item.rtNo)}</span><span class="priority-divider">|</span>
        <span>${escapeHtml(item.capacity||"規格待確認")}</span><span class="priority-divider">|</span>
        <span>需求量：${escapeHtml(item.demandQty)}${escapeHtml(item.unit)}</span>
      </div>
      <div class="priority-desc" title="${escapeHtml(item.description||"")}">${escapeHtml(item.description||"RT敘述待確認")}</div>
      <div class="priority-line3">
        <span>${escapeHtml(item.demandSource)}</span><span class="priority-divider">|</span>
        <span>廠區：${escapeHtml(item.plantCode)}</span><span class="priority-divider">|</span>
        <span class="status-badge">${escapeHtml(item.status)}</span>
      </div>
    </article>`).join("");
  $("priorityList").querySelectorAll("[data-edit-id]").forEach(btn=>btn.addEventListener("click",()=>openPriorityModal(btn.dataset.editId)));
}
function filteredRtMatches(q){
  const query=String(q||"").trim().toUpperCase().replace(/^RT/i,"");
  if(!query) return [];
  return state.rtMaster.filter(item=>String(item.rtNo).includes(query)||String(item.description||"").toUpperCase().includes(query)).slice(0,12);
}
function renderRtSuggestions(){
  const matches=filteredRtMatches($("priorityRt").value);
  const box=$("rtSuggestions");
  if(!matches.length){box.classList.add("hidden");box.innerHTML="";return}
  box.innerHTML=matches.map((item,i)=>`<button class="rt-option" type="button" data-rt-index="${i}"><strong>${escapeHtml(item.rtNo)}｜${escapeHtml(item.capacity||"-")}｜${escapeHtml(item.unit||"")}</strong><small>${escapeHtml(item.description||"")}</small></button>`).join("");
  box.classList.remove("hidden");
  box.querySelectorAll("[data-rt-index]").forEach(btn=>btn.addEventListener("click",()=>selectRt(matches[Number(btn.dataset.rtIndex)])));
}
function selectRt(item){
  state.selectedRt=item||null;
  $("priorityRt").value=item?.rtNo||"";
  $("rtSuggestions").classList.add("hidden");
  syncRtPreview();
}
function syncRtPreview(){
  const raw=String($("priorityRt").value||"").trim().replace(/^RT/i,"");
  const item=state.rtMap.get(raw)||state.selectedRt;
  if(item&&String(item.rtNo)===raw){
    state.selectedRt=item;
    $("rtPreview").innerHTML=`<strong>${escapeHtml(item.rtNo)}｜${escapeHtml(item.capacity||"規格待確認")}｜單位：${escapeHtml(item.unit)}</strong><br>${escapeHtml(item.description||"RT敘述待確認")}`;
    $("demandUnitLabel").textContent=`（${item.unit}）`;
  }else{
    state.selectedRt=null;
    $("rtPreview").textContent="RT 尚未從 RT list 確認，不能儲存。";
    $("demandUnitLabel").textContent="";
  }
}
function openPriorityModal(id=""){
  if(!permission("production_priority_edit_enabled")) return toast("沒有需求表編輯權限",true);
  const item=state.priorities.find(x=>x.priorityId===id)||null;
  $("priorityModalTitle").textContent=item?"編輯需求":"新增需求";
  $("priorityId").value=item?.priorityId||"";
  $("priorityRt").value=item?.rtNo||"";
  $("priorityQty").value=item?.demandQty||"";
  $("prioritySource").value=item?.demandSource||"";
  $("priorityPlant").value=item?.plantCode||"";
  $("priorityStatus").value=item?.status||"常態";
  $("archivePriorityBtn").classList.toggle("hidden",!item);
  state.selectedRt=item?state.rtMap.get(String(item.rtNo))||null:null;
  syncRtPreview();
  $("priorityModal").classList.remove("hidden");
  $("priorityModal").setAttribute("aria-hidden","false");
}
function closePriorityModal(){
  $("priorityModal").classList.add("hidden");
  $("priorityModal").setAttribute("aria-hidden","true");
  $("rtSuggestions").classList.add("hidden");
}
async function savePriority(){
  if(!state.selectedRt) throw new Error("RT 必須存在於 RT list");
  const qty=Number($("priorityQty").value||0);
  if(!Number.isInteger(qty)||qty<=0) throw new Error("需求量必須為大於 0 的整數");
  const payload={
    priority_id:$("priorityId").value,
    rt_no:state.selectedRt.rtNo,
    demand_qty:qty,
    demand_source:$("prioritySource").value.trim(),
    plant_code:$("priorityPlant").value.trim().toUpperCase(),
    status:$("priorityStatus").value
  };
  showLoading("正在儲存需求","系統會保留修改歷史…");
  try{
    await portalPost("portal_priority_save",payload);
    closePriorityModal();
    await loadHomeData();
    toast("生產需求已儲存");
  }finally{hideLoading()}
}
async function archivePriority(){
  const id=$("priorityId").value;
  if(!id) return;
  if(!confirm("確定封存這筆需求？歷史紀錄會保留。")) return;
  showLoading("正在封存","不會永久刪除歷史資料…");
  try{
    await portalPost("portal_priority_archive",{priority_id:id});
    closePriorityModal();
    await loadHomeData();
    toast("需求已封存");
  }finally{hideLoading()}
}
function bind(){
  $("loginForm").addEventListener("submit",async e=>{
    e.preventDefault();
    try{await login($("loginAccount").value,$("loginPassword").value,$("rememberLogin").checked)}catch(_){/* The active authentication task presents its error. */}
  });
  $("closeAuthFailureBtn").addEventListener("click",()=>{$("authFailureDialog").classList.add("hidden");$("loginBtn").focus({preventScroll:true});});
  $("cancelAuthBtn").addEventListener("click",()=>{cancelAuthentication();authStatus("已取消等待。可重新登入；原登入資訊有效時，也可按「重試登入驗證」。");showLogin();});
  $("copyAuthDiagnosticBtn").addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("authDiagnosticText").textContent);toast("連線紀錄已複製");}catch(_){toast("無法複製，可展開連線資訊截圖。",true);}});
  $("retrySessionBtn").addEventListener("click",()=>tryRestore(true));
  $("togglePassword").addEventListener("click",()=>{$("loginPassword").type=$("loginPassword").type==="password"?"text":"password"});
  document.querySelectorAll("[data-nav]").forEach(btn=>{
    btn.addEventListener("pointerdown",()=>prewarmForNav(btn.dataset.nav),{passive:true});
    btn.addEventListener("touchstart",()=>prewarmForNav(btn.dataset.nav),{passive:true});
    btn.addEventListener("click",()=>handleNav(btn.dataset.nav));
  });
  $("userButton").addEventListener("click",()=>$("userMenu").classList.toggle("hidden"));
  $("logoutBtn").addEventListener("click",()=>{cancelAuthentication();cancelHomeData();restoreViewPending=false;resumeValidationNeeded=false;clearToken();state.authUser=null;state.profile=null;$("moduleFrameHost").replaceChildren();authStatus("");$("userMenu").classList.add("hidden");hydrateRememberedLogin();showLogin()});
  $("addPriorityBtn").addEventListener("click",()=>openPriorityModal());
  $("refreshPriorityBtn").addEventListener("click",async()=>{try{showLoading("重新整理","正在取得最新需求…");await loadHomeData();toast("已更新")}catch(err){toast(err.message,true)}finally{hideLoading()}});
  $("statusFilters").querySelectorAll("[data-status]").forEach(btn=>btn.addEventListener("click",()=>{state.filter=btn.dataset.status;$("statusFilters").querySelectorAll("[data-status]").forEach(x=>x.classList.toggle("active",x===btn));renderPriorities()}));
  $("closePriorityModal").addEventListener("click",closePriorityModal);
  $("priorityModal").addEventListener("click",e=>{if(e.target===$("priorityModal")) closePriorityModal()});
  $("priorityRt").addEventListener("input",()=>{state.selectedRt=null;renderRtSuggestions();syncRtPreview()});
  $("priorityForm").addEventListener("submit",async e=>{e.preventDefault();try{await savePriority()}catch(err){hideLoading();toast(err.message||"儲存失敗",true)}});
  $("archivePriorityBtn").addEventListener("click",async()=>{try{await archivePriority()}catch(err){hideLoading();toast(err.message||"封存失敗",true)}});
  document.addEventListener("click",e=>{if(!$("userMenu").contains(e.target)&&!$("userButton").contains(e.target)) $("userMenu").classList.add("hidden")});
}
window.DS_PORTAL_BRIDGE=Object.freeze({
  reauthenticate:()=>tryRestore(true),
  getToken:()=>getToken(),
  getProfile:()=>state.profile,
  getClientVersion:()=>CFG.CLIENT_VERSION,
  getSessionContext:()=>({token:getToken(),profile:state.profile,clientVersion:CFG.CLIENT_VERSION})
});

function handlePublicRoute(){
  const p=new URLSearchParams(location.search);
  if(p.get("public")==="dashboard"){
    openExternal(CFG.DASHBOARD_PUBLIC_URL,"日報 Dashboard");
    return true;
  }
  return false;
}
async function init(){
  bind();
  hydrateRememberedLogin();
  if(handlePublicRoute()) return;
  if("serviceWorker" in navigator){navigator.serviceWorker.register("sw.js").catch(()=>{})}
  await installBottomNavHeightObserver();
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden){resumeValidationNeeded=!!getToken();return;}
    if(resumeValidationNeeded&&getToken()){resumeValidationNeeded=false;tryRestore(true);}
  });
  window.addEventListener("pageshow",event=>{if(event.persisted&&getToken())tryRestore(true);});
  tryRestore();
}
init();

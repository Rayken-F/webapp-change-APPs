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
  $("loadingTitle").textContent=title||"正在處理";
  $("loadingText").textContent=text||"請稍候…";
  $("loadingOverlay").classList.remove("hidden");
}
function hideLoading(){ $("loadingOverlay").classList.add("hidden"); }
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
async function authPost(api,payload={}){
  const body={...payload,api,client_version:CFG.AUTH_CLIENT_VERSION};
  const token=getToken();
  if(token&&api!=="login") body.session_token=token;
  const r=await fetch(CFG.AUTH_API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(body),redirect:"follow",cache:"no-store"});
  const text=await r.text();
  let data;
  try{data=JSON.parse(text)}catch(_){throw new Error("登入服務回傳格式錯誤")}
  if(!data.ok) throw new Error(data.message||"登入服務失敗");
  return data;
}
function assertPortalConfigured(){
  if(!CFG.PORTAL_API_URL||CFG.PORTAL_API_URL.includes("PASTE_")) throw new Error("尚未設定 DS Portal Apps Script /exec URL");
}
async function portalPost(api,payload={}){
  assertPortalConfigured();
  const token=getToken();
  if(!token) throw new Error("登入狀態已失效");
  const body={...payload,api,client_version:CFG.CLIENT_VERSION,session_token:token};
  const r=await fetch(CFG.PORTAL_API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(body),redirect:"follow",cache:"no-store"});
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
  $("appShell").classList.add("module-mode");
  document.body.classList.add("ds-module-active");
  setActiveNav(navKey||key);
}
function leaveModuleMode(){
  $("moduleModule").classList.add("hidden");
  $("appShell").classList.remove("module-mode");
  document.body.classList.remove("ds-module-active");
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
  const hasProcess=permission("grinding_enabled")||permission("stamp_shipping_enabled")||permission("inventory_enabled");
  $("navProcess").classList.toggle("hidden",!hasProcess);
  $("addPriorityBtn").classList.toggle("hidden",!permission("production_priority_edit_enabled"));
  renderMore();
}
function showLogin(){
  $("appShell").classList.add("hidden");
  $("loginView").classList.remove("hidden");
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
    openModule("grinding",CFG.GRINDING_URL,"Grinding WIP","process");
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
async function login(account,password,remember){
  showLoading("正在登入","沿用既有 System_Access_Master 驗證帳號與權限…");
  try{
    const result=await authPost("login",{user_id:String(account||"").trim(),password});
    await completeLogin(result,remember);
    toast(`登入成功，${result.user?.displayName||""}`);
  }finally{hideLoading()}
}
async function tryRestore(){
  if(!getToken()) return showLogin();
  showLoading("恢復登入","正在確認既有 session 與最新權限…");
  try{
    const result=await authPost("bootstrap",{});
    state.authUser=result.user||null;
    await loadProfile();
    showApp();
    if(routeAfterAuth()) return;
    if(permission("home_enabled")){
      await loadHomeData();
      switchView("home");
    }else switchView("more");
  }catch(err){
    clearToken();
    showLogin();
    toast(err.message||"登入已失效",true);
  }finally{hideLoading()}
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
  if(view==="process"){
    if(permission("grinding_enabled")) return openModule("grinding",CFG.GRINDING_URL,"Grinding WIP","process");
    return switchView("more");
  }
  if(view==="more") return switchView("more");
}
function renderMore(){
  const tools=[];
  if(permission("grinding_enabled")) tools.push({key:"grinding",title:"Grinding WIP",desc:"研磨入站、WIP、待噴砂、DCYL、轉HT",url:CFG.GRINDING_URL,nav:"process"});
  if(permission("iqc_correction_enabled")) tools.push({key:"iqc",title:"IQC 異常處理",desc:"補建、修正、轉框與異常單",url:CFG.IQC_CORRECTION_URL,nav:"more"});
  if(permission("stamp_shipping_enabled")) tools.push({title:"鋼印鎖瓶／裝框",desc:"中期模組：庫存、裝框、出貨",disabled:true});
  if(permission("inventory_enabled")) tools.push({title:"庫存盤點",desc:"中長期模組：現場實體庫存與盤點",disabled:true});
  if(permission("hr_enabled")) tools.push({title:"人事系統",desc:"已保留權限欄位，URL於整併時接入",disabled:true});
  if(!tools.length) tools.push({title:"尚無其他功能",desc:"System_Access_Master 勾選權限後會自動出現。",disabled:true});
  $("moreGrid").innerHTML=tools.map((t,i)=>`<button class="tool-card" type="button" data-tool-index="${i}" ${t.disabled?"disabled":""}><strong>${escapeHtml(t.title)}</strong><span>${escapeHtml(t.desc)}</span></button>`).join("");
  $("moreGrid").querySelectorAll("[data-tool-index]").forEach(btn=>btn.addEventListener("click",()=>{
    const item=tools[Number(btn.dataset.toolIndex)];
    if(item&&!item.disabled) openModule(item.key,item.url,item.title,item.nav||"more");
  }));
}
async function loadHomeData(){
  if(!permission("home_enabled")) return;
  const [priority,rt]=await Promise.all([
    portalPost("portal_priority_list",{}),
    state.rtMaster.length?Promise.resolve({items:state.rtMaster}):portalPost("portal_rt_master",{})
  ]);
  state.priorities=Array.isArray(priority.items)?priority.items:[];
  if(!state.rtMaster.length){
    state.rtMaster=Array.isArray(rt.items)?rt.items:[];
    state.rtMap=new Map(state.rtMaster.map(item=>[String(item.rtNo),item]));
  }
  renderPriorities();
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
    try{await login($("loginAccount").value,$("loginPassword").value,$("rememberLogin").checked)}catch(err){hideLoading();toast(err.message||"登入失敗",true)}
  });
  $("togglePassword").addEventListener("click",()=>{$("loginPassword").type=$("loginPassword").type==="password"?"text":"password"});
  document.querySelectorAll("[data-nav]").forEach(btn=>btn.addEventListener("click",()=>handleNav(btn.dataset.nav)));
  $("userButton").addEventListener("click",()=>$("userMenu").classList.toggle("hidden"));
  $("logoutBtn").addEventListener("click",()=>{clearToken();state.authUser=null;state.profile=null;$("userMenu").classList.add("hidden");showLogin()});
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
  getToken:()=>getToken(),
  getProfile:()=>state.profile,
  getClientVersion:()=>CFG.CLIENT_VERSION
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
  if(handlePublicRoute()) return;
  if("serviceWorker" in navigator){navigator.serviceWorker.register("sw.js").catch(()=>{})}
  await tryRestore();
}
init();

(function(){
  "use strict";
  const CFG=window.DS_PORTAL_CONFIG;
  if(!CFG) return;

  const path=location.pathname;
  const MODULES=[
    {match:"/ds-report-pwa-beta/",permission:"grinding_enabled",name:"Grinding WIP"},
    {match:"/ds-report-pwa/",permission:"daily_report_enabled",name:"日報系統"},
    {match:"/DS-IQC-WIP/",permission:"iqc_correction_enabled",name:"IQC 異常處理"}
  ];
  const mod=MODULES.find(x=>path.includes(x.match));
  if(!mod) return;

  document.documentElement.classList.add("ds-portal-auth-pending");
  const style=document.createElement("style");
  style.textContent="html.ds-portal-auth-pending body{visibility:hidden!important}";
  document.head.appendChild(style);

  function portalBridge_(){
    try{
      return window.parent!==window && window.parent.DS_PORTAL_BRIDGE
        ? window.parent.DS_PORTAL_BRIDGE
        : null;
    }catch(_){return null}
  }
  function tokenFromPortal_(){
    const bridge=portalBridge_();
    try{return bridge?String(bridge.getToken()||""):""}catch(_){return ""}
  }
  function profileFromPortal_(){
    const bridge=portalBridge_();
    try{return bridge&&typeof bridge.getProfile==="function"?bridge.getProfile():null}catch(_){return null}
  }
  function redirectToPortal(reason){
    const target=location.pathname+location.search+location.hash;
    const u=new URL("../ds-app/",location.href);
    u.searchParams.set("return",target);
    if(reason) u.searchParams.set("reason",reason);
    try{
      if(window.top!==window) window.top.location.replace(u.href);
      else location.replace(u.href);
    }catch(_){location.replace(u.href)}
  }
  function commitAuthorization_(token,profile){
    try{sessionStorage.setItem(CFG.AUTH_TOKEN_KEY,token)}catch(_){ }
    window.DS_PORTAL_CONTEXT={embedded:true,profile:profile,module:mod,token:token,fastPath:true};
    document.documentElement.classList.remove("ds-portal-auth-pending");
    window.dispatchEvent(new CustomEvent("ds-portal-authorized",{detail:window.DS_PORTAL_CONTEXT}));
  }
  function fastAuthorizeFromParent_(){
    const token=tokenFromPortal_();
    const profile=profileFromPortal_();
    if(!token||!profile||!profile.permissions) return false;
    if(!profile.permissions[mod.permission]){
      redirectToPortal("permission_denied");
      return true;
    }
    commitAuthorization_(token,profile);
    return true;
  }
  async function fallbackValidate_(){
    const token=tokenFromPortal_();
    if(!token) return redirectToPortal("login_required");
    const body={api:"portal_profile",client_version:CFG.CLIENT_VERSION,session_token:token};
    let lastErr=null;
    for(let attempt=0;attempt<2;attempt++){
      try{
        const r=await fetch(CFG.PORTAL_API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(body),redirect:"follow",cache:"no-store"});
        const text=await r.text();
        const data=JSON.parse(text);
        if(!data.ok) throw new Error(data.message||"portal_profile failed");
        if(!data.permissions||!data.permissions[mod.permission]) return redirectToPortal("permission_denied");
        commitAuthorization_(token,data);
        return;
      }catch(err){
        lastErr=err;
        if(attempt===0) await new Promise(resolve=>setTimeout(resolve,500));
      }
    }
    console.warn("DS module authorization fallback failed",lastErr);
    redirectToPortal("module_auth_check_failed");
  }

  const embedded=new URLSearchParams(location.search).get("ds_shell")==="1" && window.top!==window;
  if(!embedded){
    redirectToPortal("open_from_ds_required");
    return;
  }

  // 同網域 DS Workstation 已經驗證過身份與權限時，直接沿用父層結果，不再多打一趟 Apps Script。
  if(fastAuthorizeFromParent_()) return;
  fallbackValidate_();
})();

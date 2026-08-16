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

  function tokenFromPortal(){
    try{
      if(window.parent!==window && window.parent.DS_PORTAL_BRIDGE){
        return String(window.parent.DS_PORTAL_BRIDGE.getToken()||"");
      }
    }catch(_){ }
    return "";
  }
  function redirectToPortal(reason){
    const target=location.pathname+location.search+location.hash;
    const u=new URL("../ds-app/",location.href);
    u.searchParams.set("return",target);
    if(reason) u.searchParams.set("reason",reason);
    try{
      if(window.top!==window) window.top.location.replace(u.href);
      else location.replace(u.href);
    }catch(_){ location.replace(u.href); }
  }
  async function sleep_(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
  async function validate(){
    const embedded=new URLSearchParams(location.search).get("ds_shell")==="1" && window.top!==window;
    if(!embedded) return redirectToPortal("open_from_ds_required");
    const token=tokenFromPortal();
    if(!token) return redirectToPortal("login_required");

    // 讓既有 IQC 自己的 bootstrap 能直接沿用 DS 工作站登入，不再要求帳密。
    try{sessionStorage.setItem(CFG.AUTH_TOKEN_KEY,token)}catch(_){ }

    const body={api:"portal_profile",client_version:CFG.CLIENT_VERSION,session_token:token};
    let lastErr=null;
    for(let attempt=0;attempt<2;attempt++){
      try{
        const r=await fetch(CFG.PORTAL_API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(body),redirect:"follow",cache:"no-store"});
        const text=await r.text();
        const data=JSON.parse(text);
        if(!data.ok) throw new Error(data.message||"portal_profile failed");
        if(!data.permissions || !data.permissions[mod.permission]) return redirectToPortal("permission_denied");
        window.DS_PORTAL_CONTEXT={embedded:true,profile:data,module:mod};
        document.documentElement.classList.remove("ds-portal-auth-pending");
        window.dispatchEvent(new CustomEvent("ds-portal-authorized",{detail:window.DS_PORTAL_CONTEXT}));
        return;
      }catch(err){
        lastErr=err;
        if(attempt===0) await sleep_(900);
      }
    }
    // 網路不穩不得主動刪掉 DS 工作站 session；回外殼讓外殼自行判斷是否真的失效。
    redirectToPortal("module_auth_check_failed");
  }
  validate();
})();

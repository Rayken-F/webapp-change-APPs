(function(global){
  "use strict";
  const shellMode=new URLSearchParams(location.search).get("ds_shell")==="1" && global.top!==global;
  if(!shellMode) return;

  const context=global.DS_PORTAL_CONTEXT || {};
  let parentProfile=context.profile || null;
  let parentToken=String(context.token || "");
  try{
    const bridge=global.parent && global.parent.DS_PORTAL_BRIDGE;
    if(bridge){
      if(!parentProfile && typeof bridge.getProfile==="function") parentProfile=bridge.getProfile();
      if(!parentToken && typeof bridge.getToken==="function") parentToken=String(bridge.getToken()||"");
    }
  }catch(_){ }

  if(!parentProfile || !parentProfile.permissions || !parentProfile.permissions.iqc_correction_enabled){
    return;
  }

  document.documentElement.classList.add("ds-iqc-shell-sso");
  const style=document.createElement("style");
  style.textContent=[
    "html.ds-iqc-shell-sso #loginView{display:none!important}",
    "html.ds-iqc-shell-sso #logoutBtn{display:none!important}",
    "html.ds-iqc-shell-sso body.view-login #loadingOverlay{display:none!important}"
  ].join("");
  document.head.appendChild(style);

  const Api=global.IqcCorrectionApi;
  if(!Api || typeof Api.post!=="function") return;
  if(parentToken){
    try{sessionStorage.setItem("ds_iqcc_session_v2",parentToken)}catch(_){ }
  }

  const originalPost=Api.post.bind(Api);
  const user=parentProfile.user || {};
  const allowedActions=Array.isArray(user.allowedActions)
    ? user.allowedActions.map(v=>String(v||"").trim().toUpperCase()).filter(Boolean)
    : [];

  Api.post=async function(api,payload){
    if(api==="login") throw new Error("IQC 異常處理台已改由 DS 工作站統一登入");
    if(api==="bootstrap"){
      return {
        ok:true,
        version:Api.CLIENT_VERSION,
        user:{
          account:user.account||"",
          displayName:user.displayName||user.display_name||"使用者",
          role:user.role||"",
          allowedActions:allowedActions
        },
        permissions:{
          canReview:allowedActions.includes("REVIEW"),
          canClose:allowedActions.includes("CLOSE"),
          iqcLogWritable:true
        }
      };
    }
    return originalPost(api,payload);
  };
})(window);

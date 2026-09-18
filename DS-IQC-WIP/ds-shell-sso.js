(function(global){
  "use strict";
  const Api=global.IqcCorrectionApi;
  if(!Api)return;
  function bridge(){try{return global.parent!==global?global.parent.DS_PORTAL_BRIDGE:null;}catch(_){return null;}}
  function session(){
    const parent=bridge(),profile=parent?.getProfile(),token=parent?.getToken();
    if(!token||!profile)throw new Error("DS 工作台尚未完成登入驗證，請在工作台重試。");
    if(!profile.permissions?.iqc_correction_enabled)throw new Error("此帳號未開啟 IQC 異常處理權限。");
    return {parent,profile,token};
  }
  const originalPost=Api.post.bind(Api);
  Api.post=async function(api,payload){
    if(api==="login")throw new Error("請由 DS 工作台統一登入。");
    const current=session(),user=current.profile.user,permissions=current.profile.permissions;
    // Every business request still passes through the original backend authorization.
    sessionStorage.setItem("ds_iqcc_session_v2",current.token);
    if(api==="bootstrap"){
      return {ok:true,version:Api.CLIENT_VERSION,user:{...user,allowedActions:user.allowedActions||[]},
        permissions:{canReview:!!permissions.iqc_approval_enabled,canClose:!!permissions.iqc_approval_enabled,iqcLogWritable:true}};
    }
    try{return await originalPost(api,payload);}
    catch(error){
      if(/登入狀態無效|登入簽章無效|登入資訊損壞|登入已逾時|帳號不存在或已停用/.test(String(error.message||""))){
        current.parent.reauthenticate?.();
      }
      throw error;
    }
  };
  document.documentElement.classList.add("ds-iqc-shell-sso");
  const style=document.createElement("style");
  style.id="dsIqcShellSsoStyle20260918";
  style.textContent="@media(max-width:680px){html.ds-iqc-shell-sso body.mobile-request-open #requestPanel{padding-bottom:calc(15px + var(--ds-shell-nav-inset,96px))!important;scroll-padding-bottom:calc(var(--ds-shell-nav-inset,96px) + 20px)!important}html.ds-iqc-shell-sso body.mobile-request-open #requestPanel #requestReceipt{margin-bottom:8px}}";
  document.head.appendChild(style);
})(window);

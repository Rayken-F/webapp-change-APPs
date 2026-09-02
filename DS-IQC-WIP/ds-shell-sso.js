(function(global){
  "use strict";

  const params = new URLSearchParams(location.search);
  const shellMode = params.get("ds_shell") === "1" && global.top !== global;
  if(!shellMode) return;

  const context = global.DS_PORTAL_CONTEXT || {};
  let parentProfile = context.profile || null;
  let parentToken = String(context.token || "");

  try{
    const bridge = global.parent && global.parent.DS_PORTAL_BRIDGE;
    if(bridge){
      if(!parentProfile && typeof bridge.getProfile === "function"){
        parentProfile = bridge.getProfile();
      }
      if(!parentToken && typeof bridge.getToken === "function"){
        parentToken = String(bridge.getToken() || "");
      }
    }
  }catch(_){ }

  const permissions = parentProfile && parentProfile.permissions
    ? parentProfile.permissions
    : {};
  const user = parentProfile && parentProfile.user
    ? parentProfile.user
    : {};

  // IQC 異常處理台本身必須先有功能使用權限。
  if(!permissions.iqc_correction_enabled) return;

  document.documentElement.classList.add("ds-iqc-shell-sso");

  const style = document.createElement("style");
  style.id = "dsIqcShellSsoStyle20260902";
  style.textContent = [
    "html.ds-iqc-shell-sso #loginView{display:none!important}",
    "html.ds-iqc-shell-sso #logoutBtn{display:none!important}",
    "html.ds-iqc-shell-sso body.view-login #loadingOverlay{display:none!important}",
    // DS 工作台底部導覽是真浮層；手機異常單本身又是獨立 fixed 捲動容器，
    // 不能只靠 body padding。將導覽列高度加在抽屜內容尾端，讓最後按鈕可滑到導覽列上方。
    "@media(max-width:680px){html.ds-iqc-shell-sso body.mobile-request-open #requestPanel{padding-bottom:calc(15px + var(--ds-shell-nav-inset,96px))!important;scroll-padding-bottom:calc(var(--ds-shell-nav-inset,96px) + 20px)!important}html.ds-iqc-shell-sso body.mobile-request-open #requestPanel #requestReceipt{margin-bottom:8px}}"
  ].join("");
  document.head.appendChild(style);

  const Api = global.IqcCorrectionApi;
  if(!Api || typeof Api.post !== "function") return;

  // DS Workstation 的 session_token 就是現有 IQC 登入服務簽發的 token。
  // 寫進 IQC 原本使用的 TOKEN_KEY，讓 review_request / close_request 等正式 API
  // 繼續由 IQC 後端做真正的權限驗證，不繞過後端安全檢查。
  if(parentToken){
    try{
      sessionStorage.setItem("ds_iqcc_session_v2", parentToken);
    }catch(_){ }
  }

  const originalPost = Api.post.bind(Api);

  const baseActions = Array.isArray(user.allowedActions)
    ? user.allowedActions
        .map(v => String(v || "").trim().toUpperCase())
        .filter(Boolean)
    : [];

  // DS App Shell 權限模型：是否能進異常處理台看 iqc_correction_enabled；
  // 是否能主管簽核看獨立 checkbox iqc_approval_enabled。
  // 不再依賴舊登入畫面幫前端帶回 REVIEW/CLOSE 才能辨識權限。
  const effectiveActions = new Set(baseActions);
  if(permissions.iqc_approval_enabled){
    effectiveActions.add("REVIEW");
    effectiveActions.add("CLOSE");
  }

  const allowedActions = Array.from(effectiveActions);
  const canReview = permissions.iqc_approval_enabled || allowedActions.includes("REVIEW");
  const canClose = permissions.iqc_approval_enabled || allowedActions.includes("CLOSE");

  Api.post = async function(api, payload){
    if(api === "login"){
      throw new Error("IQC 異常處理台已改由 DS 工作站統一登入");
    }

    if(api === "bootstrap"){
      return {
        ok: true,
        version: Api.CLIENT_VERSION,
        user: {
          account: user.account || "",
          displayName: user.displayName || user.display_name || "使用者",
          role: user.role || "",
          allowedActions: allowedActions
        },
        permissions: {
          canReview: !!canReview,
          canClose: !!canClose,
          iqcLogWritable: true
        }
      };
    }

    // 所有真正寫入／簽核仍走 IQC 正式後端。
    return originalPost(api, payload);
  };

  // 供除錯查看，不包含 token。
  global.DS_IQC_SSO_STATE = Object.freeze({
    version: Api.CLIENT_VERSION,
    account: String(user.account || ""),
    role: String(user.role || ""),
    iqcCorrectionEnabled: !!permissions.iqc_correction_enabled,
    iqcApprovalEnabled: !!permissions.iqc_approval_enabled,
    allowedActions: allowedActions.slice(),
    canReview: !!canReview,
    canClose: !!canClose
  });
})(window);

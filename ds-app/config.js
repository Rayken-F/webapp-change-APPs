(function(global){
  "use strict";

  global.DS_PORTAL_CONFIG = Object.freeze({
    CLIENT_VERSION: "DS_APP_SHELL_V1_3_20260816",

    AUTH_API_URL: "https://script.google.com/macros/s/AKfycbzgOpdC9aStQBaqMjR9MORMFcmWi-DTbP3f_RLtb5lq_U48e1kv_7vu9z_9IHtJqQDs/exec",
    AUTH_CLIENT_VERSION: "IQC_CORRECTION_V0_9_7_20260810",
    AUTH_TOKEN_KEY: "ds_iqcc_session_v2",
    REMEMBER_ACCOUNT_KEY: "ds_portal_remembered_account_v1",
    REMEMBER_ENABLED_KEY: "ds_portal_remember_enabled_v1",

    PORTAL_API_URL: "https://script.google.com/macros/s/AKfycbyqBTbuSF4ZqURo2QhrcsW3gwNkLVdIrPirgCVoOVv2LN1mKo5OW6Ps20Z5pRCXYIxcAA/exec",

    DAILY_REPORT_URL: "../ds-report-pwa/",
    GRINDING_URL: "../ds-report-pwa-beta/",
    IQC_CORRECTION_URL: "../DS-IQC-WIP/",

    // Dashboard 是唯一 public 例外；客戶仍可直接開此 URL，不需 DS 登入。
    DASHBOARD_PUBLIC_URL: "https://script.google.com/macros/s/AKfycbzoy2GnMHbPmOLB-jDIs-N4PPx38oc5dcQ7F0J0MH4oP-lB13vFKkRCHMiBNtScaXKH/exec"
  });

  // Production enhancement loader：只在 DS 工作站本體啟用。
  const path=String(global.location&&global.location.pathname||"");
  const isDsShell=/\/ds-app(?:\/index\.html|\/)?$/.test(path);
  if(!isDsShell) return;

  function ensureStyle(id,href){
    if(document.getElementById(id)) return;
    const link=document.createElement("link");
    link.id=id;
    link.rel="stylesheet";
    link.href=href;
    document.head.appendChild(link);
  }

  function ensureScript(id,src){
    if(document.getElementById(id)) return;
    const script=document.createElement("script");
    script.id=id;
    script.src=src;
    script.async=false;
    document.body.appendChild(script);
  }

  ensureStyle(
    "dsProductionLineNavR5K1Css",
    "../ds-app-grinding-recovery-rc/rc-line-nav-v8.css?v=20260901-prod-k1"
  );
  ensureStyle(
    "dsProductionShellStabilityR5K1Css",
    "../ds-app-grinding-recovery-rc/rc-shell-stability-v9.css?v=20260901-prod-k1"
  );
  ensureStyle(
    "dsProductionEnhancementsR5K1Css",
    "./production-enhancements.css?v=20260901-k1"
  );

  function loadProductionEnhancements(){
    ensureScript(
      "dsProductionEnhancementsR5K1Js",
      "./production-enhancements.js?v=20260901-k1"
    );
    ensureScript(
      "dsProductionKeyboardFocusGuardK1Js",
      "./production-keyboard-guard.js?v=20260901-k1"
    );
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",loadProductionEnhancements,{once:true});
  }else{
    loadProductionEnhancements();
  }
})(window);

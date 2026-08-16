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
})(window);

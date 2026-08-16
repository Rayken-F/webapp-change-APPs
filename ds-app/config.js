(function(global){
  "use strict";
  global.DS_PORTAL_CONFIG = Object.freeze({
    CLIENT_VERSION: "DS_APP_SHELL_V1_20260816",

    // 沿用現有 IQC 異常處理台登入／session，不另建帳號密碼系統。
    AUTH_API_URL: "https://script.google.com/macros/s/AKfycbzgOpdC9aStQBaqMjR9MORMFcmWi-DTbP3f_RLtb5lq_U48e1kv_7vu9z_9IHtJqQDs/exec",
    AUTH_CLIENT_VERSION: "IQC_CORRECTION_V0_9_7_20260810",
    AUTH_TOKEN_KEY: "ds_iqcc_session_v2",

    // 部署 DsPortalBackend.gs 後，把固定 /exec URL 貼在這裡。
    PORTAL_API_URL: "https://script.google.com/macros/s/AKfycbyqBTbuSF4ZqURo2QhrcsW3gwNkLVdIrPirgCVoOVv2LN1mKo5OW6Ps20Z5pRCXYIxcAA/exec",

    // 現有系統保留 standalone / backup；短期逐一改造成原生 Module。
    DAILY_REPORT_URL: "../ds-report-pwa/",
    GRINDING_URL: "../ds-report-pwa-beta/",
    IQC_CORRECTION_URL: "../DS-IQC-WIP/",

    // 請貼現有「日報 Dashboard」public URL。客戶直接開此網址仍不需要登入。
    DASHBOARD_PUBLIC_URL: "https://script.google.com/macros/s/AKfycbzoy2GnMHbPmOLB-jDIs-N4PPx38oc5dcQ7F0J0MH4oP-lB13vFKkRCHMiBNtScaXKH/exec"
  });
})(window);

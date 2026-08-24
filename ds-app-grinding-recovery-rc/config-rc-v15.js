(function(global){
  "use strict";
  global.DS_PORTAL_CONFIG = Object.freeze({
    CLIENT_VERSION: "DS_APP_SHELL_IQC_HYBRID_RC_V15_20260824",

    AUTH_API_URL: "https://script.google.com/macros/s/AKfycbzgOpdC9aStQBaqMjR9MORMFcmWi-DTbP3f_RLtb5lq_U48e1kv_7vu9z_9IHtJqQDs/exec",
    AUTH_CLIENT_VERSION: "IQC_CORRECTION_V0_9_7_20260810",
    AUTH_TOKEN_KEY: "ds_iqcc_session_v2",
    REMEMBER_ACCOUNT_KEY: "ds_portal_remembered_account_v1",
    REMEMBER_ENABLED_KEY: "ds_portal_remember_enabled_v1",

    // RC v15 only: isolated DS Portal deployment for IQC Cloud Vision second-reader testing.
    PORTAL_API_URL: "https://script.google.com/macros/s/AKfycbwffupawYytMbDEbjRTBlEaXQmI4nROCO6aKlgC1kCEq3UECWP-JlcxRANhi4IGtjka8g/exec",

    DAILY_REPORT_URL: "../ds-report-pwa/",
    GRINDING_URL: "../ds-report-pwa-beta/",
    IQC_CORRECTION_URL: "../DS-IQC-WIP/",

    // Dashboard remains the public exception.
    DASHBOARD_PUBLIC_URL: "https://script.google.com/macros/s/AKfycbzoy2GnMHbPmOLB-jDIs-N4PPx38oc5dcQ7F0J0MH4oP-lB13vFKkRCHMiBNtScaXKH/exec"
  });
})(window);

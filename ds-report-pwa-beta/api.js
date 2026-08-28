/**
 * Grinding WIP API loader｜2026-08-29
 *
 * Core is pinned to the last verified v2.0.7 + precise-status + barcode-layout build.
 * The instant-scan UX layer is loaded immediately after it.
 * Both scripts are injected synchronously because index.html uses BETA_CLIENT_VERSION
 * in the following inline script.
 */
(function () {
  document.write('<script src="./api-core-v207-20260828.js?v=e34b128"><\/script>');
  document.write('<script src="./api-instant-scan-ux-20260829.js?v=10825ffe"><\/script>');
})();

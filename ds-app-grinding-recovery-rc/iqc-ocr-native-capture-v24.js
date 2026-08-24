"use strict";

(function captureNativeOcrV24(){
  if(window.__DS_TESSERACT_NATIVE_CREATE_WORKER_V24)return;
  if(!window.Tesseract||typeof window.Tesseract.createWorker!=="function")return;
  window.__DS_TESSERACT_NATIVE_CREATE_WORKER_V24=window.Tesseract.createWorker.bind(window.Tesseract);
})();

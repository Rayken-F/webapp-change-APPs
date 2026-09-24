// Report bootstrap and unhandled core rejections even before Tesseract has a job reply.
// Only safe error categories leave this worker; never forward raw URLs or image data.
(function(){
  let action="load",reported=false;
  const report=error=>{
    if(reported)return;reported=true;
    const safe=self.IqcOcrEngine31?.workerFault(error,action)||{code:"WORKER_ASSET_NETWORK",workerAction:action};
    self.postMessage({rc31WorkerFailure:true,action,error:{code:safe.code,workerAction:safe.workerAction}});
  };
  self.addEventListener("message",event=>{
    if(["load","loadLanguage","initialize","setParameters","recognize"].includes(event.data?.action))action=event.data.action;
  });
  self.addEventListener("unhandledrejection",event=>{report(event.reason);event.preventDefault();});
  self.addEventListener("error",event=>{report(event.error||event.message);event.preventDefault();});
  try{
    importScripts("./iqc-ocr-engine-rc31.js?v=20260924-9");
    importScripts("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js");
  }catch(error){report(error);}
})();

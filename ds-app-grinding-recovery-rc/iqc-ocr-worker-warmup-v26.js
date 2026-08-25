"use strict";

(function installIqcOcrWorkerWarmupV26(){
  const VERSION="IQC_OCR_WORKER_WARMUP_RC_V26_20260825";
  if(window.__DS_IQC_OCR_WORKER_WARMUP_V26)return;

  const original=window.__DS_TESSERACT_NATIVE_CREATE_WORKER_V24;
  if(typeof original!=="function"){
    console.warn("[IQC V26] native Tesseract createWorker 尚未載入");
    return;
  }

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const withTimeout=(promise,ms,label)=>{
    let timer;
    const timeout=new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error(label+" timeout")),ms);
    });
    return Promise.race([promise,timeout]).finally(()=>clearTimeout(timer));
  };

  function buildProbeCanvas(){
    const canvas=document.createElement("canvas");
    canvas.width=180;
    canvas.height=52;
    const ctx=canvas.getContext("2d",{alpha:false});
    ctx.fillStyle="#fff";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle="#000";
    ctx.font="bold 22px monospace";
    ctx.textBaseline="middle";
    ctx.fillText("DS OCR 1234",10,26);
    return canvas;
  }

  async function createWarmedWorker(lang,oem,options,config){
    const baseOptions=options&&typeof options==="object"?options:{};
    const userLogger=typeof baseOptions.logger==="function"?baseOptions.logger:null;
    let lastErr=null;

    for(let attempt=1;attempt<=2;attempt++){
      let worker=null;
      let warming=true;
      try{
        const wrappedOptions={...baseOptions};
        if(userLogger){
          wrappedOptions.logger=function(message){
            if(!warming)userLogger(message);
          };
        }

        worker=await original(lang,oem,wrappedOptions,config);
        const probe=buildProbeCanvas();
        await withTimeout(worker.recognize(probe),12000,"OCR warm-up recognize");
        probe.width=1;
        probe.height=1;
        probe.remove();
        warming=false;
        await sleep(280);
        worker.__dsWarmupV26=true;
        worker.__dsWarmupAttempt=attempt;
        return worker;
      }catch(err){
        lastErr=err;
        try{await worker?.terminate?.();}catch(_){ }
        worker=null;
        if(attempt<2)await sleep(1200);
      }
    }

    throw new Error("OCR Worker 預熱失敗："+String(lastErr?.message||lastErr||"UNKNOWN"));
  }

  window.__DS_TESSERACT_NATIVE_CREATE_WORKER_V24=createWarmedWorker;
  window.__DS_IQC_OCR_WORKER_WARMUP_V26={version:VERSION};
})();

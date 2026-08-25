"use strict";

(function installIqcPersistentWorkerV28(){
  const VERSION="IQC_OCR_PERSISTENT_WORKER_RC_V28_20260826";
  if(window.__DS_IQC_OCR_PERSISTENT_WORKER_V28)return;

  const originalCreate=window.__DS_TESSERACT_NATIVE_CREATE_WORKER_V24;
  if(typeof originalCreate!=="function"){
    console.warn("[IQC V28] native createWorker 尚未載入");
    return;
  }

  const IDLE_TERMINATE_MS=90000;
  const WARMUP_TIMEOUT_MS=12000;
  let shared=null;
  let creating=null;
  let idleTimer=null;
  let generation=0;

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  function withTimeout(promise,ms,label){
    let timer;
    const timeout=new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error(label+" timeout")),ms);
    });
    return Promise.race([promise,timeout]).finally(()=>clearTimeout(timer));
  }

  function clearIdle(){
    if(idleTimer){clearTimeout(idleTimer);idleTimer=null;}
  }

  async function hardTerminate(reason){
    clearIdle();
    const current=shared;
    shared=null;
    if(!current)return;
    try{await current.__dsRealTerminate?.();}catch(_){ }
    console.log("[IQC V28] worker terminated:",reason||"idle");
  }

  function scheduleIdleTerminate(){
    clearIdle();
    idleTimer=setTimeout(()=>{hardTerminate("idle-timeout").catch(()=>{});},IDLE_TERMINATE_MS);
  }

  function buildProbe(){
    const c=document.createElement("canvas");
    c.width=180;c.height=52;
    const ctx=c.getContext("2d",{alpha:false});
    ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle="#000";ctx.font="bold 22px monospace";ctx.textBaseline="middle";
    ctx.fillText("DS OCR 1234",10,26);
    return c;
  }

  async function buildShared(lang,oem,options,config){
    const myGen=++generation;
    let worker=null;
    try{
      worker=await originalCreate(lang,oem,options,config);
      const realTerminate=worker.terminate.bind(worker);
      const realRecognize=worker.recognize.bind(worker);
      worker.__dsRealTerminate=realTerminate;
      worker.__dsGeneration=myGen;

      const probe=buildProbe();
      try{
        await withTimeout(realRecognize(probe),WARMUP_TIMEOUT_MS,"OCR warm-up");
      }finally{
        probe.width=1;probe.height=1;probe.remove();
      }
      await sleep(250);

      worker.recognize=async function(){
        clearIdle();
        try{
          return await realRecognize.apply(worker,arguments);
        }catch(err){
          if(shared===worker)shared=null;
          try{await realTerminate();}catch(_){ }
          console.warn("[IQC V28] recognize failed; worker discarded",err);
          throw err;
        }
      };

      worker.terminate=async function(){
        // V25 每張辨識後都會 terminate；V28 改成批次共享，先延後真正釋放。
        scheduleIdleTerminate();
      };

      worker.__dsWarm=true;
      return worker;
    }catch(err){
      try{await worker?.__dsRealTerminate?.();}catch(_){ }
      try{if(worker&&!worker.__dsRealTerminate)await worker.terminate?.();}catch(_){ }
      throw err;
    }
  }

  async function persistentCreate(lang,oem,options,config){
    clearIdle();
    if(shared)return shared;
    if(creating)return creating;
    creating=(async()=>{
      let lastErr=null;
      for(let attempt=1;attempt<=2;attempt++){
        try{
          const worker=await buildShared(lang,oem,options,config);
          shared=worker;
          console.log("[IQC V28] persistent worker ready, attempt",attempt);
          return worker;
        }catch(err){
          lastErr=err;
          shared=null;
          if(attempt<2)await sleep(1200);
        }
      }
      throw new Error("Persistent OCR Worker 啟動失敗："+String(lastErr?.message||lastErr||"UNKNOWN"));
    })().finally(()=>{creating=null;});
    return creating;
  }

  window.__DS_TESSERACT_NATIVE_CREATE_WORKER_V24=persistentCreate;
  window.__DS_IQC_OCR_PERSISTENT_WORKER_V28={
    version:VERSION,
    hardTerminate:()=>hardTerminate("manual"),
    hasWorker:()=>!!shared
  };
})();

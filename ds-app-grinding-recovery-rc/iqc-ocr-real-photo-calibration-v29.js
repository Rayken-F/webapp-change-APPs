"use strict";

(function installIqcRealPhotoCalibrationV29(){
  const VERSION="IQC_OCR_REAL_PHOTO_CALIBRATION_RC_V29_20260826";
  const DB_NAME="ds_iqc_image_rc_v1";
  const DB_VERSION=1;
  const ACTIVE_BATCH_KEY="ds_iqc_image_rc_active_batch";
  const IDLE_TERMINATE_MS=120000;
  const CAL_TIMEOUT_MS=50000;
  if(window.__DS_IQC_OCR_REAL_PHOTO_CAL_V29)return;

  const originalCreate=window.__DS_TESSERACT_NATIVE_CREATE_WORKER_V24;
  if(typeof originalCreate!=="function"){
    console.warn("[IQC V29] native createWorker 尚未載入");
    return;
  }

  let shared=null;
  let creating=null;
  let idleTimer=null;
  let calibrating=false;
  let calibratedBatch="";
  let lastPhotoSignature="";

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const activeBatch=()=>String(localStorage.getItem(ACTIVE_BATCH_KEY)||"").trim();

  function withTimeout(promise,ms,label){
    let timer;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+" timeout")),ms);});
    return Promise.race([promise,timeout]).finally(()=>clearTimeout(timer));
  }
  function clearIdle(){if(idleTimer){clearTimeout(idleTimer);idleTimer=null;}}
  function scheduleIdle(){
    clearIdle();
    idleTimer=setTimeout(()=>{hardTerminate("idle-timeout").catch(()=>{});},IDLE_TERMINATE_MS);
  }
  async function hardTerminate(reason){
    clearIdle();
    const w=shared;shared=null;
    calibratedBatch="";
    if(!w)return;
    try{await w.__dsRealTerminate?.();}catch(_){ }
    console.log("[IQC V29] worker terminated",reason||"");
  }

  async function persistentCreate(lang,oem,options,config){
    clearIdle();
    if(shared)return shared;
    if(creating)return creating;
    creating=(async()=>{
      const w=await originalCreate(lang,oem,options,config);
      const realTerminate=w.terminate.bind(w);
      const realRecognize=w.recognize.bind(w);
      w.__dsRealTerminate=realTerminate;
      w.__dsRealRecognize=realRecognize;
      w.recognize=async function(){
        clearIdle();
        try{return await realRecognize.apply(w,arguments);}
        catch(err){
          if(shared===w)shared=null;
          calibratedBatch="";
          try{await realTerminate();}catch(_){ }
          throw err;
        }
      };
      w.terminate=async function(){scheduleIdle();};
      shared=w;
      return w;
    })().finally(()=>{creating=null;});
    return creating;
  }

  window.__DS_TESSERACT_NATIVE_CREATE_WORKER_V24=persistentCreate;

  function openDb(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error("IndexedDB open failed"));
    });
  }
  function photosOf(batchId){
    return openDb().then(db=>new Promise((resolve,reject)=>{
      const tx=db.transaction("photos","readonly");
      const req=tx.objectStore("photos").index("batchId").getAll(batchId);
      req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>Number(a.seq)-Number(b.seq)));
      req.onerror=()=>reject(req.error||new Error("read photos failed"));
      tx.oncomplete=()=>db.close();
    }));
  }

  async function createBitmap(blob){
    if(typeof createImageBitmap==="function"){
      try{return await createImageBitmap(blob,{imageOrientation:"from-image"});}catch(_){ }
    }
    return new Promise((resolve,reject)=>{
      const img=new Image(),url=URL.createObjectURL(blob);
      img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};
      img.onerror=e=>{URL.revokeObjectURL(url);reject(e||new Error("image decode failed"));};
      img.src=url;
    });
  }
  async function preprocess(blob){
    let b=null,c=null;
    try{
      b=await createBitmap(blob);
      c=document.createElement("canvas");
      c.width=b.width;c.height=b.height;
      const ctx=c.getContext("2d",{willReadFrequently:true,alpha:false});
      ctx.drawImage(b,0,0);
      try{b.close?.();}catch(_){ }b=null;
      const im=ctx.getImageData(0,0,c.width,c.height),d=im.data;
      for(let i=0;i<d.length;i+=4){
        const y=.299*d[i]+.587*d[i+1]+.114*d[i+2];
        const v=Math.max(0,Math.min(255,(y-128)*1.28+138));
        d[i]=d[i+1]=d[i+2]=v;
      }
      ctx.putImageData(im,0,0);
      return await new Promise(resolve=>c.toBlob(x=>resolve(x||blob),"image/jpeg",.86));
    }finally{
      try{b?.close?.();}catch(_){ }
      if(c){c.width=1;c.height=1;c.remove();}
    }
  }

  function btn(){return document.getElementById("iqcRcAnalyze");}
  function badge(text,bad=false,good=false){
    const el=document.getElementById("iqcRcOcrBadge");if(!el)return;
    el.textContent=text;el.className=`iqc-rc-status ${bad?"bad":good?"good":"warn"}`;
  }
  function progress(text){const el=document.getElementById("iqcRcProgressText");if(el)el.textContent=text;}
  function lockButton(text){const el=btn();if(el){el.disabled=true;el.textContent=text;}}
  function unlockButton(){const el=btn();if(el){el.disabled=false;el.textContent="開始辨識";}}

  async function ensureCalibrated(){
    if(calibrating)return;
    const batchId=activeBatch();
    if(!batchId)return;
    const photos=await photosOf(batchId).catch(()=>[]);
    if(!photos.length)return;
    const first=photos[0];
    const signature=`${batchId}:${first.id}:${Number(first.size||first.blob?.size||0)}`;
    if(calibratedBatch===batchId&&lastPhotoSignature===signature){unlockButton();return;}

    calibrating=true;
    lockButton("OCR 實圖校正中…");
    badge("OCR 實圖校正中…");
    progress("正在用第1張照片做 2 次隱藏校正；校正結果不會寫入 IQC，也不會送 Cloud。");
    let prepared=null;
    try{
      prepared=await preprocess(first.blob);
      let waited=0;
      while(!shared&&waited<15000){await sleep(250);waited+=250;}
      if(!shared){
        await persistentCreate("eng",1,{
          workerPath:"https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
          corePath:"https://cdn.jsdelivr.net/npm/tesseract.js-core@5",
          langPath:"https://tessdata.projectnaptha.com/4.0.0"
        });
      }
      if(!shared)throw new Error("Persistent Worker unavailable");
      try{await shared.setParameters({tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_:-. ",preserve_interword_spaces:"1",tessedit_pageseg_mode:"6"});}catch(_){ }

      for(let i=1;i<=2;i++){
        progress(`OCR 實圖校正 ${i}/2：使用第1張照片預熱正式辨識負載；結果丟棄。`);
        await withTimeout(shared.__dsRealRecognize(prepared),CAL_TIMEOUT_MS,`real-photo calibration ${i}`);
        await sleep(500);
      }
      calibratedBatch=batchId;
      lastPhotoSignature=signature;
      badge("OCR 實圖校正完成",false,true);
      progress("OCR 已完成 2 次實圖校正；現在開始辨識時，第1張正式結果將是同一 Worker 的第3次實圖工作。");
      unlockButton();
    }catch(err){
      calibratedBatch="";
      lastPhotoSignature="";
      badge("OCR 實圖校正失敗",true,false);
      progress(`OCR 實圖校正失敗：${String(err?.message||err||"UNKNOWN")}。請重新進入影像建檔後再試。`);
      lockButton("OCR 校正失敗");
      await hardTerminate("calibration-failed").catch(()=>{});
    }finally{
      prepared=null;
      calibrating=false;
    }
  }

  const observer=new MutationObserver(()=>{
    setTimeout(()=>ensureCalibrated().catch(()=>{}),120);
  });
  observer.observe(document.documentElement,{subtree:true,childList:true});
  setInterval(()=>ensureCalibrated().catch(()=>{}),700);

  window.__DS_IQC_OCR_REAL_PHOTO_CAL_V29={
    version:VERSION,
    ensureCalibrated,
    hardTerminate:()=>hardTerminate("manual"),
    hasWorker:()=>!!shared,
    calibratedBatch:()=>calibratedBatch
  };
})();

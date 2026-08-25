"use strict";

(function installIqcLocalLateRetryV27(){
  const VERSION="IQC_LOCAL_LATE_RETRY_RC_V27_20260825";
  const DB_NAME="ds_iqc_image_rc_v1";
  const DB_VERSION=1;
  const ACTIVE_BATCH_KEY="ds_iqc_image_rc_active_batch";
  const RETRY_DELAY_MS=4000;
  if(window.__DS_IQC_LOCAL_LATE_RETRY_V27)return;

  let retrying=false;
  let watchedBatch="";
  let lastCompletionKey="";

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const activeBatch=()=>String(localStorage.getItem(ACTIVE_BATCH_KEY)||"").trim();

  function openDb(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error("IndexedDB 開啟失敗"));
    });
  }

  function sourcePhotos(batchId){
    return openDb().then(db=>new Promise((resolve,reject)=>{
      const tx=db.transaction("photos","readonly");
      const req=tx.objectStore("photos").index("batchId").getAll(batchId);
      req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>Number(a.seq)-Number(b.seq)));
      req.onerror=()=>reject(req.error||new Error("讀取照片失敗"));
      tx.oncomplete=()=>db.close();
    }));
  }

  function setProgress(text){
    const el=document.getElementById("iqcRcProgressText");
    if(el)el.textContent=text;
  }

  function setBadge(text){
    const el=document.getElementById("iqcRcOcrBadge");
    if(!el)return;
    el.textContent=text;
    el.className="iqc-rc-status warn";
  }

  async function maybeLateRetry(){
    if(retrying)return;
    const runtime=window.__DS_IQC_INTAKE_RUNTIME_V25;
    if(!runtime||typeof runtime.runBatch!=="function")return;

    const batchId=activeBatch();
    if(!batchId)return;
    if(watchedBatch!==batchId){
      watchedBatch=batchId;
      lastCompletionKey="";
    }

    const btn=document.getElementById("iqcRcAnalyze");
    const progress=String(document.getElementById("iqcRcProgressText")?.textContent||"");
    if(btn?.disabled)return;
    if(!progress.startsWith("完成："))return;

    const photos=await sourcePhotos(batchId).catch(()=>[]);
    if(!photos.length||photos.some(p=>p.status==="PROCESSING"))return;
    const failed=photos.filter(p=>p.status==="LOCAL_FAILED");
    if(!failed.length)return;

    const completionKey=photos.map(p=>`${p.id}:${p.status}:${String(p.ocrText||"").length}`).join("|");
    if(completionKey===lastCompletionKey)return;
    lastCompletionKey=completionKey;

    const retryKey=`ds_iqc_v27_late_retry_${batchId}_${completionKey.length}`;
    if(sessionStorage.getItem(retryKey)==="1")return;
    sessionStorage.setItem(retryKey,"1");

    retrying=true;
    try{
      setBadge(`Local 尾端補跑 ${failed.length} 張`);
      setProgress(`第一輪完成；${failed.length} 張 Local 失敗。系統降壓 ${Math.round(RETRY_DELAY_MS/1000)} 秒後，只補跑失敗照片一次。`);
      await sleep(RETRY_DELAY_MS);
      await runtime.runBatch();
    }catch(err){
      console.warn("[IQC V27 late retry]",err);
    }finally{
      retrying=false;
    }
  }

  const observer=new MutationObserver(()=>{
    setTimeout(()=>maybeLateRetry().catch(()=>{}),100);
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["disabled"]});

  setInterval(()=>maybeLateRetry().catch(()=>{}),700);
  window.__DS_IQC_LOCAL_LATE_RETRY_V27={version:VERSION,maybeLateRetry};
})();

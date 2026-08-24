"use strict";
(function installIqcHybridStuckGuardV16(){
  const VERSION="IQC_HYBRID_STUCK_GUARD_RC_V16_20260824";
  const DB="ds_iqc_image_rc_v1";
  const ACTIVE_BATCH_KEY="ds_iqc_image_rc_active_batch";
  const STUCK_MS=15000;
  if(window.__DS_IQC_HYBRID_STUCK_GUARD_V16)return;

  function installV16RenderOwner(){
    if(window.__DS_IQC_RESULT_RENDER_OWNER_V16__)return;
    if(document.querySelector('script[data-ds-iqc-render-owner-v16="1"]'))return;
    const s=document.createElement("script");
    s.src="./iqc-result-render-owner-v16.js?v=20260824-1";
    s.async=false;
    s.dataset.dsIqcRenderOwnerV16="1";
    s.onerror=()=>console.warn("[IQC RC V16] result render owner 載入失敗");
    document.head.appendChild(s);
  }

  function markVersion(){
    const banner=document.querySelector(".rc-login-banner");
    if(banner)banner.textContent="⚠️ Grinding Recovery / Return / IQC Hybrid Image RC v16｜測試入口";
  }

  function photos(batchId){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB,1);
      req.onsuccess=()=>{
        const db=req.result,tx=db.transaction("photos","readonly");
        const r=tx.objectStore("photos").index("batchId").getAll(batchId);
        r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();
      };
      req.onerror=()=>reject(req.error);
    });
  }

  async function check(){
    const hybrid=window.__DS_IQC_HYBRID_V15;
    if(!hybrid)return;
    const batchId=String(localStorage.getItem(ACTIVE_BATCH_KEY)||"").trim();
    if(!batchId)return;
    if(localStorage.getItem(`ds_iqc_hybrid_v15_local_attempted_${batchId}`)!=="1")return;
    const btn=document.getElementById("iqcRcAnalyze");
    if(btn?.disabled)return;
    const list=await photos(batchId).catch(()=>[]);
    const stuck=list.filter(p=>p.status==="PROCESSING"&&(Date.now()-new Date(p.updatedAt||0).getTime())>=STUCK_MS);
    if(!stuck.length)return;
    const marker=`ds_iqc_hybrid_v15_stuck_queued_${batchId}`;
    if(sessionStorage.getItem(marker)==="1")return;
    sessionStorage.setItem(marker,"1");
    await hybrid.queueBatchForAi(batchId,"LOCAL_ENGINE_STUCK");
    const hint=document.getElementById("iqcHybridHint");
    if(hint)hint.textContent=`Local OCR 已停止回應（${stuck.length} 張卡在 PROCESSING），已取消等待並改排 AI_PENDING。照片仍保存在本機。`;
    if(navigator.onLine)setTimeout(()=>hybrid.syncAiQueue({manual:false}),500);
  }

  installV16RenderOwner();
  markVersion();
  setInterval(()=>check().catch(()=>{}),1500);
  setInterval(()=>{installV16RenderOwner();markVersion();},3000);
  window.__DS_IQC_HYBRID_STUCK_GUARD_V16={version:VERSION,check};
  window.__DS_IQC_HYBRID_STUCK_GUARD_V15=window.__DS_IQC_HYBRID_STUCK_GUARD_V16;
})();

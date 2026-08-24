"use strict";
(function installIqcHybridStuckGuardV18(){
  const VERSION="IQC_HYBRID_STUCK_GUARD_RC_V18_20260824";
  const DB="ds_iqc_image_rc_v1";
  const ACTIVE_BATCH_KEY="ds_iqc_image_rc_active_batch";
  const STUCK_MS=15000;
  if(window.__DS_IQC_HYBRID_STUCK_GUARD_V18)return;

  function installStableResultCss(){
    if(document.getElementById("dsIqcResultStableV18"))return;
    const s=document.createElement("style");
    s.id="dsIqcResultStableV18";
    s.textContent=`
      #iqcRcResultList .iqc-rc-field{display:block!important;visibility:visible!important;}
      #iqcRcResultList .ds-iqc-v8-group{visibility:visible!important;}
    `;
    document.head.appendChild(s);
  }

  function markVersion(){
    const banner=document.querySelector(".rc-login-banner");
    if(banner)banner.textContent="⚠️ Grinding Recovery / Return / IQC Hybrid Image RC v18｜測試入口";
  }

  function photos(batchId){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB,1);
      req.onsuccess=()=>{
        const db=req.result,tx=db.transaction("photos","readonly");
        const r=tx.objectStore("photos").index("batchId").getAll(batchId);
        r.onsuccess=()=>resolve(r.result||[]);
        r.onerror=()=>reject(r.error);
        tx.oncomplete=()=>db.close();
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

  installStableResultCss();
  markVersion();
  setInterval(()=>check().catch(()=>{}),1500);
  setInterval(()=>{installStableResultCss();markVersion();},3000);

  window.__DS_IQC_HYBRID_STUCK_GUARD_V18={version:VERSION,check};
  window.__DS_IQC_HYBRID_STUCK_GUARD_V15=window.__DS_IQC_HYBRID_STUCK_GUARD_V18;
})();

"use strict";

(function installGrindingLookupRecoveryRc(){
  const VERSION="GRINDING_LOOKUP_RECOVERY_RC_V2_20260819";
  const badge=document.getElementById("grindingRecoveryBadge");
  const stats={batches:0,retries:0,recovered:0,failed:0,lastError:""};
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function setBadge(text,kind){
    if(!badge)return;
    badge.textContent=text;
    badge.className="grinding-recovery-badge"+(kind?" "+kind:"");
  }

  function retryable(err,w){
    if(!err)return false;
    try{
      if(typeof w.isBetaAmbiguousApiError==="function"&&w.isBetaAmbiguousApiError(err))return true;
    }catch(_){ }
    return ["NETWORK_TIMEOUT","NETWORK_ERROR","RESPONSE_READ_FAILED","EMPTY_RESPONSE","INVALID_JSON_RESPONSE"].includes(String(err.code||""));
  }

  function patchGrindingFrame(frame){
    if(!frame||String(frame.dataset.moduleKey||"")!=="grinding")return false;
    let w;
    try{w=frame.contentWindow;}catch(_){return false;}
    if(!w||typeof w.fetchBetaWipLookupBatch!=="function")return false;
    if(w.__DS_LOOKUP_RECOVERY_RC_V2_INSTALLED){
      setBadge(`Grinding Recovery RC 已啟用｜批次 ${stats.batches}｜恢復 ${stats.recovered}`);
      return true;
    }

    const original=w.fetchBetaWipLookupBatch;
    async function patchedFetchBetaWipLookupBatch(ctns){
      stats.batches++;
      const count=Array.isArray(ctns)?ctns.length:0;
      const retryDelays=[0,850,1800];
      let lastErr=null;

      for(let attempt=0;attempt<retryDelays.length;attempt++){
        if(attempt===0){
          setBadge(`RC 已啟用｜辨識中 ${count} 筆`);
        }else{
          stats.retries++;
          setBadge(`回應待確認｜${count} 筆｜自動重試 ${attempt}/2`,"wait");
          await sleep(retryDelays[attempt]);
        }

        try{
          const result=await original.call(w,ctns);
          if(attempt>0)stats.recovered++;
          setBadge(attempt>0
            ? `✅ 已恢復｜${count} 筆辨識完成｜重試 ${attempt} 次`
            : `✅ RC 已啟用｜${count} 筆辨識完成`);
          setTimeout(()=>setBadge(`Grinding Recovery RC 已啟用｜批次 ${stats.batches}｜重試 ${stats.retries}｜恢復 ${stats.recovered}`),1600);
          return result;
        }catch(err){
          lastErr=err;
          stats.lastError=String(err&&err.code||err&&err.message||err||"");
          if(!retryable(err,w)){
            setBadge(`後端明確回應｜不重試｜${String(err&&err.message||"業務錯誤").slice(0,46)}`,"bad");
            throw err;
          }
          if(attempt===retryDelays.length-1)break;
        }
      }

      stats.failed++;
      setBadge("傳輸仍不穩｜已自動重試 2 次｜可按重新辨識","bad");
      if(lastErr){
        try{
          lastErr.message="辨識回應連續不完整；已自動重試 2 次。這是傳輸異常，不代表 CTN 資料錯誤，請稍後按『重新辨識』。";
        }catch(_){ }
        throw lastErr;
      }
      throw new Error("Grinding lookup transport failed after recovery retries");
    }

    w.fetchBetaWipLookupBatch=patchedFetchBetaWipLookupBatch;
    w.__DS_LOOKUP_RECOVERY_RC_V2_INSTALLED=true;
    w.__DS_LOOKUP_RECOVERY_RC_V2={version:VERSION,stats:stats};

    // 明確驗證全域函式已被替換，避免 RC 標籤顯示成功但實際未生效。
    if(w.fetchBetaWipLookupBatch!==patchedFetchBetaWipLookupBatch){
      setBadge("RC 注入驗證失敗｜請勿測試","bad");
      return false;
    }

    setBadge(`Grinding Recovery RC 已啟用｜${VERSION}`);
    return true;
  }

  function attachFrame(frame){
    if(!frame||String(frame.dataset.moduleKey||"")!=="grinding")return;
    const tryPatch=()=>{
      let attempts=0;
      const timer=setInterval(()=>{
        attempts++;
        if(patchGrindingFrame(frame)||attempts>=100){
          clearInterval(timer);
          if(attempts>=100){
            let ok=false;
            try{ok=!!frame.contentWindow.__DS_LOOKUP_RECOVERY_RC_V2_INSTALLED;}catch(_){ }
            if(!ok)setBadge("Grinding Recovery RC 注入失敗｜請重整 RC","bad");
          }
        }
      },100);
    };
    frame.addEventListener("load",tryPatch);
    tryPatch();
  }

  const host=document.getElementById("moduleFrameHost");
  if(host){
    host.querySelectorAll("iframe").forEach(attachFrame);
    const observer=new MutationObserver(mutations=>{
      mutations.forEach(m=>m.addedNodes.forEach(node=>{
        if(node&&node.tagName==="IFRAME")attachFrame(node);
      }));
    });
    observer.observe(host,{childList:true});
    window.__DS_GRINDING_RECOVERY_RC_OBSERVER=observer;
  }

  document.addEventListener("click",event=>{
    const nav=event.target.closest&&event.target.closest("[data-nav='grinding']");
    if(!nav)return;
    setTimeout(()=>{
      const frame=document.querySelector("#moduleFrameHost iframe[data-module-key='grinding']");
      if(frame)patchGrindingFrame(frame);
    },350);
  },true);

  setBadge(`Grinding Recovery RC Shell｜${VERSION}`);
  window.__DS_GRINDING_RECOVERY_RC={version:VERSION,stats:stats,repatch:()=>{
    const frame=document.querySelector("#moduleFrameHost iframe[data-module-key='grinding']");
    return frame?patchGrindingFrame(frame):false;
  }};
})();

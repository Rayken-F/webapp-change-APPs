"use strict";

/* DS Workstation Production Enhancements R3 | 2026-08-31
   Allowlisted non-image RC promotion only.
   Excludes IQC image/OCR/Cloud Vision, fault injection and Return-to-WIP. */
(function installDsProductionEnhancementsR3(){
  const VERSION="DS_PROD_ENH_R3_20260831";
  if(window.__DS_PROD_ENH_R3__) return;

  const SAFE_RC_SCRIPTS=[
    ["dsProdRcNavGuard","../ds-app-grinding-recovery-rc/rc-nav-visibility-guard-v12.js?v=20260831-prod-r3"],
    ["dsProdRcShellStability","../ds-app-grinding-recovery-rc/rc-shell-stability-v9.js?v=20260831-prod-r3"],
    ["dsProdRcQuickbarKeeper","../ds-app-grinding-recovery-rc/rc-quickbar-keeper-v6.js?v=20260831-prod-r3"],
    ["dsProdGrindingUiSafe","../ds-app-grinding-recovery-rc/grinding-ui-safe-rc.js?v=20260831-prod-r3"],
    ["dsProdGrindingOperatorSession","../ds-app-grinding-recovery-rc/operator-session-rc-v5.js?v=20260831-prod-r3"],
    ["dsProdHomeProductionFocus","../ds-app-grinding-recovery-rc/home-production-focus-rc-v5.js?v=20260831-prod-r3"]
  ];

  const RETRYABLE_CODES=new Set([
    "NETWORK_TIMEOUT",
    "NETWORK_ERROR",
    "RESPONSE_READ_FAILED",
    "EMPTY_RESPONSE",
    "INVALID_JSON_RESPONSE"
  ]);

  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const later=(fn,...delays)=>delays.forEach(delay=>setTimeout(fn,delay));
  const grindingFrame=()=>document.querySelector(
    "#moduleFrameHost iframe[data-module-key='grinding']"
  );

  function loadScript(id,src){
    return new Promise((resolve,reject)=>{
      if(document.getElementById(id)){
        resolve();
        return;
      }
      const script=document.createElement("script");
      script.id=id;
      script.src=src;
      script.async=false;
      script.onload=resolve;
      script.onerror=()=>reject(new Error("Production enhancement load failed: "+src));
      document.body.appendChild(script);
    });
  }

  async function loadSafeRcModules(){
    for(const [id,src] of SAFE_RC_SCRIPTS){
      await loadScript(id,src);
    }
  }

  function isRetryable(error,frameWindow){
    try{
      if(typeof frameWindow.isBetaAmbiguousApiError==="function" &&
          frameWindow.isBetaAmbiguousApiError(error)){
        return true;
      }
    }catch(_){ }
    return RETRYABLE_CODES.has(String(error&&error.code||""));
  }

  function patchGrindingLookupRetry(frame){
    if(!frame || String(frame.dataset.moduleKey||"")!=="grinding") return false;

    let frameWindow;
    try{
      frameWindow=frame.contentWindow;
    }catch(_){
      return false;
    }

    if(!frameWindow || typeof frameWindow.fetchBetaWipLookupBatch!=="function"){
      return false;
    }
    if(frameWindow.__DS_GRINDING_LOOKUP_RETRY_PROD_R3) return true;

    const original=frameWindow.fetchBetaWipLookupBatch;
    const patched=async function(ctns){
      const retryDelays=[0,850,1800];
      let lastError=null;

      for(let attempt=0;attempt<retryDelays.length;attempt++){
        if(attempt>0){
          try{
            frameWindow.showToast&&frameWindow.showToast(
              "辨識回應待確認，自動重試 "+attempt+"/2"
            );
          }catch(_){ }
          await sleep(retryDelays[attempt]);
        }

        try{
          const result=await original.call(frameWindow,ctns);
          if(attempt>0){
            try{
              frameWindow.showToast&&frameWindow.showToast("辨識連線已恢復");
            }catch(_){ }
          }
          return result;
        }catch(error){
          lastError=error;
          if(!isRetryable(error,frameWindow)) throw error;
        }
      }

      if(lastError){
        try{
          lastError.message=
            "辨識回應連續不完整；已自動重試 2 次。"+
            "這是傳輸異常，不代表 CTN 資料錯誤，請稍後按『重新辨識』。";
        }catch(_){ }
        throw lastError;
      }
      throw new Error("Grinding lookup transport failed after recovery retries");
    };

    patched.__dsProdR3=true;
    frameWindow.fetchBetaWipLookupBatch=patched;
    frameWindow.__DS_GRINDING_LOOKUP_RETRY_PROD_R3={
      version:VERSION,
      original
    };
    return true;
  }

  const watchedFrames=new WeakSet();
  function attachGrindingFrame(frame){
    if(!frame || String(frame.tagName||"").toUpperCase()!=="IFRAME") return;
    if(String(frame.dataset.moduleKey||"")!=="grinding") return;

    if(!watchedFrames.has(frame)){
      watchedFrames.add(frame);
      frame.addEventListener("load",()=>later(
        ()=>patchGrindingLookupRetry(frame),
        80,300,900,1800,3200
      ));
    }

    later(()=>patchGrindingLookupRetry(frame),0,150,500,1200,2400);
  }

  function scanFrames(){
    document.querySelectorAll("#moduleFrameHost iframe").forEach(attachGrindingFrame);
  }

  const host=document.getElementById("moduleFrameHost");
  if(host){
    const observer=new MutationObserver(mutations=>{
      mutations.forEach(mutation=>{
        mutation.addedNodes.forEach(attachGrindingFrame);
      });
      scanFrames();
    });
    observer.observe(host,{childList:true,subtree:false});
    window.__DS_PROD_ENH_R3_FRAME_OBSERVER=observer;
  }

  document.addEventListener("click",event=>{
    if(event.target.closest&&event.target.closest("[data-nav='grinding']")){
      later(scanFrames,0,120,400,900,1800);
    }
  },true);

  loadSafeRcModules()
    .then(()=>{
      scanFrames();
      later(scanFrames,200,700,1500,3000);
    })
    .catch(error=>{
      console.error("DS production enhancement bootstrap failed",error);
    });

  window.__DS_PROD_ENH_R3__={
    version:VERSION,
    reloadSafeModules:loadSafeRcModules,
    repatchGrinding:scanFrames
  };
})();

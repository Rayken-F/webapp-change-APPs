"use strict";

/* DS Workstation Production Enhancements R4 | 2026-08-31
   Allowlisted non-image RC promotion only.
   Excludes IQC image/OCR/Cloud Vision, fault injection and Return-to-WIP.
   R4 fixes floating-nav overlap and iOS nav drift by measuring the real nav footprint. */
(function installDsProductionEnhancementsR4(){
  const VERSION="DS_PROD_ENH_R4_20260831";
  if(window.__DS_PROD_ENH_R4__) return;

  const SAFE_RC_SCRIPTS=[
    ["dsProdRcNavGuard","../ds-app-grinding-recovery-rc/rc-nav-visibility-guard-v12.js?v=20260831-prod-r4"],
    ["dsProdRcShellStability","../ds-app-grinding-recovery-rc/rc-shell-stability-v9.js?v=20260831-prod-r4"],
    ["dsProdRcQuickbarKeeper","../ds-app-grinding-recovery-rc/rc-quickbar-keeper-v6.js?v=20260831-prod-r4"],
    ["dsProdGrindingUiSafe","../ds-app-grinding-recovery-rc/grinding-ui-safe-rc.js?v=20260831-prod-r4"],
    ["dsProdGrindingOperatorSession","../ds-app-grinding-recovery-rc/operator-session-rc-v5.js?v=20260831-prod-r4"],
    ["dsProdHomeProductionFocus","../ds-app-grinding-recovery-rc/home-production-focus-rc-v5.js?v=20260831-prod-r4"]
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

  function syncNavGeometry(){
    const root=document.documentElement;
    const nav=document.querySelector("#appShell .bottom-nav");
    if(!nav) return;

    if(root.classList.contains("ds-keyboard-open")){
      root.style.setProperty("--ds-prod-nav-occupied-h","0px");
      return;
    }

    const rect=nav.getBoundingClientRect();
    const viewportHeight=Math.max(
      1,
      Math.round(Number(window.innerHeight||0)),
      Math.round(Number(document.documentElement.clientHeight||0))
    );

    if(!Number.isFinite(rect.top)||rect.height<=0) return;

    const occupied=Math.max(
      Math.ceil(rect.height+12),
      Math.ceil(viewportHeight-rect.top+6),
      82
    );

    root.style.setProperty("--ds-prod-nav-occupied-h",`${occupied}px`);
    root.style.setProperty("--ds-nav-real-h",`${Math.ceil(rect.height)}px`);
  }

  function scheduleNavGeometry(){
    later(syncNavGeometry,0,40,120,260,520,900);
  }

  function installNavGeometryObserver(){
    const nav=document.querySelector("#appShell .bottom-nav");
    if(nav&&typeof ResizeObserver!=="undefined"){
      const observer=new ResizeObserver(scheduleNavGeometry);
      observer.observe(nav);
      window.__DS_PROD_NAV_R4_RESIZE_OBSERVER=observer;
    }

    window.addEventListener("resize",scheduleNavGeometry,{passive:true});
    window.addEventListener("orientationchange",()=>later(syncNavGeometry,120,360,720),{passive:true});
    window.addEventListener("pageshow",scheduleNavGeometry,{passive:true});
    document.addEventListener("visibilitychange",()=>{
      if(!document.hidden) scheduleNavGeometry();
    },{passive:true});
    document.addEventListener("focusout",()=>later(syncNavGeometry,80,260,620),true);
    if(window.visualViewport){
      window.visualViewport.addEventListener("resize",scheduleNavGeometry,{passive:true});
      window.visualViewport.addEventListener("scroll",scheduleNavGeometry,{passive:true});
    }

    const shell=document.getElementById("appShell");
    if(shell){
      const observer=new MutationObserver(scheduleNavGeometry);
      observer.observe(shell,{attributes:true,attributeFilter:["class"]});
      window.__DS_PROD_NAV_R4_SHELL_OBSERVER=observer;
    }
    scheduleNavGeometry();
  }

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
    if(frameWindow.__DS_GRINDING_LOOKUP_RETRY_PROD_R4) return true;

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

    patched.__dsProdR4=true;
    frameWindow.fetchBetaWipLookupBatch=patched;
    frameWindow.__DS_GRINDING_LOOKUP_RETRY_PROD_R4={
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
      scheduleNavGeometry();
    });
    observer.observe(host,{childList:true,subtree:false});
    window.__DS_PROD_ENH_R4_FRAME_OBSERVER=observer;
  }

  document.addEventListener("click",event=>{
    if(event.target.closest&&event.target.closest("[data-nav]")){
      scheduleNavGeometry();
    }
    if(event.target.closest&&event.target.closest("[data-nav='grinding']")){
      later(scanFrames,0,120,400,900,1800);
    }
  },true);

  installNavGeometryObserver();

  loadSafeRcModules()
    .then(()=>{
      scanFrames();
      scheduleNavGeometry();
      later(scanFrames,200,700,1500,3000);
    })
    .catch(error=>{
      console.error("DS production enhancement bootstrap failed",error);
    });

  window.__DS_PROD_ENH_R4__={
    version:VERSION,
    reloadSafeModules:loadSafeRcModules,
    repatchGrinding:scanFrames,
    syncNavGeometry
  };
})();

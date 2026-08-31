"use strict";

/* DS Workstation Production Enhancements R5 | 2026-08-31
   True overlay navigation:
   - shell iframe remains full-height;
   - same-origin modules receive an internal scroll-tail inset;
   - cross-origin Dashboard receives the inset by postMessage and ACKs;
   - Dashboard alone keeps the R4 fallback until its receiver is deployed.
   Explicitly excludes IQC image/OCR/Cloud Vision, fault injection and Return-to-WIP. */
(function installDsProductionEnhancementsR5(){
  const VERSION="DS_PROD_ENH_R5_20260831";
  const MESSAGE_CHANNEL="DS_SHELL_LAYOUT_V1";
  if(window.__DS_PROD_ENH_R5__) return;

  const SAFE_RC_SCRIPTS=[
    ["dsProdRcNavGuard","../ds-app-grinding-recovery-rc/rc-nav-visibility-guard-v12.js?v=20260831-prod-r5"],
    ["dsProdRcShellStability","../ds-app-grinding-recovery-rc/rc-shell-stability-v9.js?v=20260831-prod-r5"],
    ["dsProdRcQuickbarKeeper","../ds-app-grinding-recovery-rc/rc-quickbar-keeper-v6.js?v=20260831-prod-r5"],
    ["dsProdGrindingUiSafe","../ds-app-grinding-recovery-rc/grinding-ui-safe-rc.js?v=20260831-prod-r5"],
    ["dsProdGrindingOperatorSession","../ds-app-grinding-recovery-rc/operator-session-rc-v5.js?v=20260831-prod-r5"],
    ["dsProdHomeProductionFocus","../ds-app-grinding-recovery-rc/home-production-focus-rc-v5.js?v=20260831-prod-r5"]
  ];

  const RETRYABLE_CODES=new Set([
    "NETWORK_TIMEOUT",
    "NETWORK_ERROR",
    "RESPONSE_READ_FAILED",
    "EMPTY_RESPONSE",
    "INVALID_JSON_RESPONSE"
  ]);

  const MODULE_TAIL_PX=Object.freeze({
    daily:24,
    grinding:24,
    iqc:24
  });

  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const later=(fn,...delays)=>delays.forEach(delay=>setTimeout(fn,delay));
  const root=document.documentElement;
  const shell=document.getElementById("appShell");
  const host=document.getElementById("moduleFrameHost");
  const watchedFrames=new WeakSet();

  let currentInset=96;
  let geometryTimer=0;

  function keyboardOpen(){
    return root.classList.contains("ds-keyboard-open");
  }

  function visibleViewportBottom(){
    const vv=window.visualViewport;
    if(vv){
      return Math.max(1,Math.round(Number(vv.offsetTop||0)+Number(vv.height||0)));
    }
    return Math.max(
      1,
      Math.round(Number(window.innerHeight||0)),
      Math.round(Number(document.documentElement.clientHeight||0))
    );
  }

  function activeFrame(){
    return host&&host.querySelector(".module-frame:not(.hidden)")||null;
  }

  function navInset(){
    const nav=document.querySelector("#appShell .bottom-nav");
    if(!nav || keyboardOpen()) return 0;

    const rect=nav.getBoundingClientRect();
    if(!Number.isFinite(rect.top)||!Number.isFinite(rect.height)||rect.height<=0){
      return currentInset||96;
    }

    const occupiedByTop=Math.ceil(visibleViewportBottom()-rect.top+8);
    const occupiedByHeight=Math.ceil(rect.height+18);
    return Math.max(82,occupiedByTop,occupiedByHeight);
  }

  function ensureFrameInsetStyle(doc){
    let style=doc.getElementById("dsShellOverlayInsetR5Style");
    if(style) return style;

    style=doc.createElement("style");
    style.id="dsShellOverlayInsetR5Style";
    style.textContent=`
      html,body{
        scroll-padding-bottom:
          calc(var(--ds-shell-nav-inset,0px) + var(--ds-shell-content-tail,40px))!important;
      }
      body.ds-shell-overlay-inset-r5{
        padding-bottom:
          calc(var(--ds-shell-nav-inset,0px) + var(--ds-shell-content-tail,40px))!important;
      }
      body.ds-shell-overlay-inset-r5 .sticky-actions,
      body.ds-shell-overlay-inset-r5 #stickyActions{
        bottom:
          calc(var(--ds-shell-nav-inset,0px) + 10px + env(safe-area-inset-bottom,0px))!important;
      }
      body.ds-shell-overlay-inset-r5 #dsJumpReconcileBtn{
        bottom:calc(var(--ds-shell-nav-inset,0px) + 14px)!important;
      }
      @supports selector(body:has(.sticky-actions:not(.hidden))){
        body.ds-shell-overlay-inset-r5:has(.sticky-actions:not(.hidden)){
          padding-bottom:
            calc(var(--ds-shell-nav-inset,0px) + 108px)!important;
          scroll-padding-bottom:
            calc(var(--ds-shell-nav-inset,0px) + 108px)!important;
        }
      }
    `;
    (doc.head||doc.documentElement).appendChild(style);
    return style;
  }

  function applySameOriginInset(frame,inset){
    let doc;
    try{
      doc=frame.contentDocument;
      if(!doc||!doc.documentElement||!doc.body) return false;
      void doc.body.offsetHeight;
    }catch(_){
      return false;
    }

    const key=String(frame.dataset.moduleKey||"");
    const tail=Number(MODULE_TAIL_PX[key]||40);
    ensureFrameInsetStyle(doc);
    doc.documentElement.style.setProperty("--ds-shell-nav-inset",`${Math.max(0,inset)}px`);
    doc.documentElement.style.setProperty("--ds-shell-content-tail",`${tail}px`);
    doc.body.classList.add("ds-shell-overlay-inset-r5");
    doc.body.dataset.dsShellInsetVersion=VERSION;
    frame.dataset.dsInsetMode="same-origin";
    return true;
  }

  function postInset(frame,inset){
    if(!frame||!frame.contentWindow) return;
    try{
      frame.contentWindow.postMessage({
        channel:MESSAGE_CHANNEL,
        type:"DS_SHELL_NAV_INSET",
        version:VERSION,
        inset:Math.max(0,Math.round(inset)),
        keyboardOpen:keyboardOpen(),
        moduleKey:String(frame.dataset.moduleKey||""),
        shellOrigin:location.origin
      },"*");
    }catch(_){ }
  }

  function syncDashboardFallback(){
    if(!shell) return;
    const frame=activeFrame();
    const isDashboard=!!(frame&&String(frame.dataset.moduleKey||"")==="dashboard");
    const acknowledged=!!(frame&&frame.dataset.dsInsetAck==="1");
    shell.classList.toggle(
      "ds-dashboard-inset-fallback",
      isDashboard&&!acknowledged&&!keyboardOpen()
    );
  }

  function syncFrame(frame,inset){
    if(!frame) return;
    const sameOrigin=applySameOriginInset(frame,inset);
    if(!sameOrigin) postInset(frame,inset);
  }

  function syncAllFrames(){
    const inset=keyboardOpen()?0:currentInset;
    if(host){
      host.querySelectorAll("iframe.module-frame").forEach(frame=>syncFrame(frame,inset));
    }
    syncDashboardFallback();
  }

  function syncNavGeometry(){
    currentInset=navInset();
    root.style.setProperty("--ds-shell-nav-inset",`${currentInset}px`);

    const nav=document.querySelector("#appShell .bottom-nav");
    if(nav){
      const rect=nav.getBoundingClientRect();
      if(Number.isFinite(rect.height)&&rect.height>0){
        root.style.setProperty("--ds-nav-real-h",`${Math.ceil(rect.height)}px`);
      }
    }

    syncAllFrames();
  }

  function scheduleNavGeometry(){
    clearTimeout(geometryTimer);
    syncNavGeometry();
    geometryTimer=setTimeout(syncNavGeometry,50);
    later(syncNavGeometry,120,260,520,900);
  }

  function attachFrame(frame){
    if(!frame||String(frame.tagName||"").toUpperCase()!=="IFRAME") return;
    if(watchedFrames.has(frame)){
      syncFrame(frame,keyboardOpen()?0:currentInset);
      return;
    }

    watchedFrames.add(frame);
    frame.addEventListener("load",()=>{
      frame.dataset.dsInsetAck="";
      later(()=>{
        syncFrame(frame,keyboardOpen()?0:currentInset);
        syncDashboardFallback();
      },40,160,420,900,1800);
    });

    later(()=>syncFrame(frame,keyboardOpen()?0:currentInset),0,100,300,800);
  }

  function scanFrames(){
    if(!host) return;
    host.querySelectorAll("iframe.module-frame").forEach(attachFrame);
    syncDashboardFallback();
  }

  window.addEventListener("message",event=>{
    const data=event&&event.data;
    if(!data||data.channel!==MESSAGE_CHANNEL) return;
    if(data.type!=="DS_SHELL_NAV_INSET_READY"&&
       data.type!=="DS_SHELL_NAV_INSET_ACK") return;

    const frame=Array.from(host?host.querySelectorAll("iframe.module-frame"):[])
      .find(item=>{
        try{return item.contentWindow===event.source}catch(_){return false}
      });
    if(!frame) return;

    if(data.type==="DS_SHELL_NAV_INSET_ACK"){
      frame.dataset.dsInsetAck="1";
      frame.dataset.dsInsetReceiverVersion=String(data.version||"");
      syncDashboardFallback();
    }
    postInset(frame,keyboardOpen()?0:currentInset);
  });

  function installNavGeometryObserver(){
    const nav=document.querySelector("#appShell .bottom-nav");
    if(nav&&typeof ResizeObserver!=="undefined"){
      const observer=new ResizeObserver(scheduleNavGeometry);
      observer.observe(nav);
      window.__DS_PROD_NAV_R5_RESIZE_OBSERVER=observer;
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

    if(shell){
      const observer=new MutationObserver(scheduleNavGeometry);
      observer.observe(shell,{attributes:true,attributeFilter:["class"]});
      window.__DS_PROD_NAV_R5_SHELL_OBSERVER=observer;
    }

    if(host){
      const observer=new MutationObserver(mutations=>{
        mutations.forEach(mutation=>{
          mutation.addedNodes.forEach(attachFrame);
        });
        scanFrames();
        scheduleNavGeometry();
      });
      observer.observe(host,{childList:true,subtree:false});
      window.__DS_PROD_ENH_R5_FRAME_OBSERVER=observer;
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
    if(!frame||String(frame.dataset.moduleKey||"")!=="grinding") return false;

    let frameWindow;
    try{
      frameWindow=frame.contentWindow;
    }catch(_){
      return false;
    }

    if(!frameWindow||typeof frameWindow.fetchBetaWipLookupBatch!=="function"){
      return false;
    }
    if(frameWindow.__DS_GRINDING_LOOKUP_RETRY_PROD_R5) return true;

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

    patched.__dsProdR5=true;
    frameWindow.fetchBetaWipLookupBatch=patched;
    frameWindow.__DS_GRINDING_LOOKUP_RETRY_PROD_R5={
      version:VERSION,
      original
    };
    return true;
  }

  function patchGrindingFrames(){
    if(!host) return;
    host.querySelectorAll("iframe[data-module-key='grinding']").forEach(frame=>{
      later(()=>patchGrindingLookupRetry(frame),0,150,500,1200,2400);
    });
  }

  document.addEventListener("click",event=>{
    if(event.target.closest&&event.target.closest("[data-nav]")){
      scheduleNavGeometry();
      later(scanFrames,0,100,320,760);
    }
    if(event.target.closest&&event.target.closest("[data-nav='grinding']")){
      later(patchGrindingFrames,0,120,400,900,1800);
    }
  },true);

  installNavGeometryObserver();
  scanFrames();

  loadSafeRcModules()
    .then(()=>{
      scanFrames();
      patchGrindingFrames();
      scheduleNavGeometry();
      later(scanFrames,200,700,1500,3000);
    })
    .catch(error=>{
      console.error("DS production enhancement bootstrap failed",error);
    });

  window.__DS_PROD_ENH_R5__={
    version:VERSION,
    reloadSafeModules:loadSafeRcModules,
    repatchGrinding:patchGrindingFrames,
    syncNavGeometry,
    syncAllFrames
  };
})();

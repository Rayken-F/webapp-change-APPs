"use strict";

/* DS Workstation Production Enhancements R5 | 2026-08-31
   Floating navigation (LAYOUT-K5): full-height modules with clearance
   inside document/dialog scrollers, held stable while typing.
   Explicitly excludes IQC image/OCR/Cloud Vision, fault injection and Return-to-WIP. */
(function installDsProductionEnhancementsR5(){
  const VERSION="DS_PROD_LAYOUT_K7_20260919";
  const MESSAGE_CHANNEL="DS_SHELL_LAYOUT_V1";
  if(window.__DS_PROD_ENH_R5__) return;

  const SAFE_RC_SCRIPTS=[
    ["dsProdRcNavGuard","../ds-app-grinding-recovery-rc/rc-nav-visibility-guard-v12.js?v=20260831-prod-r5"],
    ["dsProdRcShellStability","../ds-app-grinding-recovery-rc/rc-shell-stability-v9.js?v=20260831-prod-r5"],
    ["dsProdRcQuickbarKeeper","../ds-app-grinding-recovery-rc/rc-quickbar-keeper-v6.js?v=20260918-k2"],
    ["dsProdGrindingUiSafe","../ds-app-grinding-recovery-rc/grinding-ui-safe-rc.js?v=20260831-prod-r5"],
    ["dsProdGrindingOperatorSession","../ds-app-grinding-recovery-rc/operator-session-rc-v5.js?v=20260831-prod-r5"],
    ["dsProdHomeProductionFocus","../ds-app-grinding-recovery-rc/home-production-focus-rc-v5.js?v=20260919-k6"]
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
  // Let CSS resolve the PWA viewport. iOS JavaScript viewport readings can
  // still describe the shorter login screen while no data has arrived.
  const viewportProbe=document.createElement("div");
  viewportProbe.setAttribute("aria-hidden","true");
  viewportProbe.style.cssText="position:fixed;top:0;left:0;width:0;height:100dvh;visibility:hidden;pointer-events:none";
  document.body.appendChild(viewportProbe);

  let currentInset=96;
  let geometryTimer=0;

  function keyboardOpen(){
    return root.classList.contains("ds-keyboard-open") || root.classList.contains("ds-child-input-focus");
  }

  function navInset(){
    const nav=document.querySelector("#appShell .bottom-nav");
    if(!nav || keyboardOpen()) return currentInset;

    const rect=nav.getBoundingClientRect();
    if(!Number.isFinite(rect.top)||!Number.isFinite(rect.height)||rect.height<=0){
      return currentInset||96;
    }

    // Measure layout dimensions, not an iOS visual viewport shifted by the keyboard.
    const style=getComputedStyle(nav);
    const bottom=Math.max(8,parseFloat(style.bottom)||0);
    return Math.max(82,Math.ceil(rect.height+bottom+8));
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
      /* Some Daily station pages are outside .wrap in the parsed document.
         Give the active page its own tail, including station/confirmation
         transitions, without adding space before pages or while typing. */
      body[data-ds-shell-module="daily"]{padding-bottom:0!important}
      body[data-ds-shell-module="daily"] .page.active::after{
        content:"";
        display:block;
        height:calc(var(--ds-shell-nav-inset,0px) + var(--ds-shell-content-tail,24px));
        flex-shrink:0;
        pointer-events:none;
      }
      body.ds-shell-overlay-inset-r5 .sticky-actions,
      body.ds-shell-overlay-inset-r5 #stickyActions{
        bottom:
          calc(var(--ds-shell-nav-inset,0px) + 10px + env(safe-area-inset-bottom,0px))!important;
      }
      body.ds-shell-overlay-inset-r5 #dsJumpReconcileBtn{
        bottom:calc(var(--ds-shell-nav-inset,0px) + 14px)!important;
      }
      body[data-ds-shell-module="grinding"] .modal-panel{
        padding-bottom:calc(18px + var(--ds-shell-nav-inset,0px))!important;
        scroll-padding-bottom:var(--ds-shell-nav-inset,0px)!important;
      }
      body[data-ds-shell-module="daily"] .iqc-quick-dock,
      body[data-ds-shell-module="daily"] .iqc-quick-bulk-panel{
        bottom:calc(12px + var(--ds-shell-nav-inset,0px))!important;
      }
      body[data-ds-shell-module="oqc"] main{padding-bottom:12px!important}
      body[data-ds-shell-module="oqc"] #toast,
      body[data-ds-shell-module="oqc"] #undo{
        bottom:calc(12px + var(--ds-shell-nav-inset,0px))!important;
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
    const geometryKey=`${Math.max(0,inset)}:${tail}`;
    if(doc.body.dataset.dsShellInsetGeometry===geometryKey)return true;
    doc.body.dataset.dsShellInsetGeometry=geometryKey;
    doc.documentElement.style.setProperty("--ds-shell-nav-inset",`${Math.max(0,inset)}px`);
    doc.documentElement.style.setProperty("--ds-shell-content-tail",`${tail}px`);
    doc.body.classList.add("ds-shell-overlay-inset-r5");
    doc.body.dataset.dsShellModule=key;
    doc.body.dataset.dsShellInsetVersion=VERSION;
    frame.dataset.dsInsetMode="same-origin";
    return true;
  }

  function postInset(frame,inset){
    if(!frame||!frame.contentWindow) return;
    try{
      const message={
        channel:MESSAGE_CHANNEL,
        type:"DS_SHELL_NAV_INSET",
        version:VERSION,
        inset:Math.max(0,Math.round(inset)),
        frameHeight:Math.max(0,frame.clientHeight),
        // Keep scroll geometry stable while an input/IME is active.
        keyboardOpen:false,
        moduleKey:String(frame.dataset.moduleKey||""),
        shellOrigin:location.origin
      };
      frame.contentWindow.postMessage(message,"*");
      // HtmlService places the receiver inside its sandbox iframe.
      if(frame.dataset.dsInsetPeer)frame.__dsInsetPeer?.postMessage(message,frame.dataset.dsInsetPeer);
    }catch(_){ }
  }

  function syncDashboardFallback(){
    // Never replace the floating capsule with an opaque parent reservation.
    if(shell?.classList.contains("ds-dashboard-inset-fallback"))shell.classList.remove("ds-dashboard-inset-fallback");
  }

  function syncFrame(frame,inset){
    if(!frame) return;
    if(["daily","dashboard"].includes(frame.dataset.moduleKey)){
      // The iframe can extend past its clipped host while iOS recomputes
      // viewport/safe-area geometry. Measure its overlap, not just nav height.
      if(keyboardOpen()){
        inset=Number(frame.dataset.dsStableInset)||inset;
      }else{
        const nav=document.querySelector("#appShell .bottom-nav");
        const rect=frame.getBoundingClientRect();
        if(nav&&rect.height>0){
          inset=Math.max(inset,Math.ceil(rect.bottom-nav.getBoundingClientRect().top+8));
          try{inset+=Math.max(0,frame.contentWindow.innerHeight-frame.clientHeight);}catch(_){ }
          frame.dataset.dsStableInset=String(inset);
        }
      }
    }
    const sameOrigin=applySameOriginInset(frame,inset);
    if(!sameOrigin) postInset(frame,inset);
  }

  function syncAllFrames(){
    const inset=currentInset;
    if(host){
      host.querySelectorAll("iframe.module-frame").forEach(frame=>syncFrame(frame,inset));
    }
    syncDashboardFallback();
  }

  function syncNavGeometry(){
    if(!keyboardOpen()){
      const height=viewportProbe.getBoundingClientRect().height;
      const value=`${Math.round(height)}px`;
      if(Number.isFinite(height)&&height>0&&root.style.getPropertyValue("--ds-shell-layout-height")!==value)
        root.style.setProperty("--ds-shell-layout-height",value);
    }
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
      syncFrame(frame,currentInset);
      return;
    }

    watchedFrames.add(frame);
    frame.addEventListener("load",()=>{
      frame.dataset.dsInsetAck="";
      syncFrame(frame,currentInset);
      later(()=>{
        syncFrame(frame,currentInset);
        syncDashboardFallback();
      },40,160,420,900,1800);
    });

    later(()=>syncFrame(frame,currentInset),0,100,300,800);
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
        try{
          if(item.contentWindow===event.source)return true;
          if(item.dataset.moduleKey!=="dashboard"||!/^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/.test(event.origin))return false;
          // HtmlService can nest a second userCodeAppPanel inside its sandbox.
          // Match bounded descendants by WindowProxy only, never DOM/data.
          const pending=[{win:item.contentWindow,depth:0}];let visited=0;
          while(pending.length&&visited<32){
            const {win,depth}=pending.shift();if(depth>=4)continue;
            for(let i=0;i<Math.min(win.length,8)&&visited<32;i++){
              const child=win[i];visited++;
              if(child===event.source)return true;
              pending.push({win:child,depth:depth+1});
            }
          }
        }catch(_){ }
        return false;
      });
    if(!frame) return;
    if(frame.dataset.moduleKey==="dashboard"){
      frame.__dsInsetPeer=event.source;frame.dataset.dsInsetPeer=event.origin;
    }

    if(data.type==="DS_SHELL_NAV_INSET_ACK"){
      frame.dataset.dsInsetAck="1";
      frame.dataset.dsInsetReceiverVersion=String(data.version||"");
      syncDashboardFallback();
    }
    // An ACK completes the exchange; replying to ACK would create a message loop.
    if(data.type==="DS_SHELL_NAV_INSET_READY")syncFrame(frame,currentInset);
  });

  function installNavGeometryObserver(){
    const nav=document.querySelector("#appShell .bottom-nav");
    if(nav&&typeof ResizeObserver!=="undefined"){
      const observer=new ResizeObserver(scheduleNavGeometry);
      observer.observe(nav);
      observer.observe(viewportProbe);
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
      observer.observe(host,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
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

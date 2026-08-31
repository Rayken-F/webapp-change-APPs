"use strict";

/* DS Workstation R6 keyboard / Dashboard overlay hotfix | 2026-08-31
   Runs after Production Enhancements R5.
   It does not touch data APIs, Timestamp, ERP, IQC image recognition or Return-to-WIP. */
(function installDsKeyboardOverlayHotfixR6(){
  const VERSION="DS_OVERLAY_HOTFIX_R6_20260831";
  if(window.__DS_OVERLAY_HOTFIX_R6__) return;

  const root=document.documentElement;
  const shell=document.getElementById("appShell");
  const host=document.getElementById("moduleFrameHost");
  const watchedDocs=new WeakSet();
  let focusStartedAt=0;
  let stableVisualHeight=Math.max(
    1,
    Math.round(Number(window.visualViewport&&window.visualViewport.height||0)),
    Math.round(Number(window.innerHeight||0)),
    Math.round(Number(document.documentElement.clientHeight||0))
  );

  function isEditable(node){
    if(!node||node.nodeType!==1) return false;
    if(node.matches&&node.matches(
      "input:not([type='button']):not([type='submit']):not([type='reset']):not([type='checkbox']):not([type='radio']),"+
      "textarea,select,[contenteditable='true'],[role='textbox']"
    )) return true;
    return !!(node.closest&&node.closest(
      "input:not([type='button']):not([type='submit']):not([type='reset']):not([type='checkbox']):not([type='radio']),"+
      "textarea,select,[contenteditable='true'],[role='textbox']"
    ));
  }

  function neutralizeDashboardFallback(){
    if(shell) shell.classList.remove("ds-dashboard-inset-fallback");
  }

  function setDirectFrameInset(value){
    if(!host) return;
    host.querySelectorAll("iframe.module-frame").forEach(frame=>{
      try{
        const doc=frame.contentDocument;
        if(!doc||!doc.documentElement) return;
        doc.documentElement.style.setProperty("--ds-shell-nav-inset",`${Math.max(0,value)}px`);
      }catch(_){ }
    });
  }

  function restoreR5Geometry(){
    neutralizeDashboardFallback();
    try{
      const api=window.__DS_PROD_ENH_R5__;
      if(api&&typeof api.syncNavGeometry==="function") api.syncNavGeometry();
      if(api&&typeof api.syncAllFrames==="function") api.syncAllFrames();
    }catch(_){ }
    neutralizeDashboardFallback();
  }

  function setChildInputFocused(open){
    const next=!!open;
    root.classList.toggle("ds-child-input-focused",next);
    neutralizeDashboardFallback();

    if(next){
      focusStartedAt=Date.now();
      root.style.setProperty("--ds-shell-nav-inset","0px");
      setDirectFrameInset(0);
    }else{
      setTimeout(restoreR5Geometry,20);
      setTimeout(restoreR5Geometry,180);
      setTimeout(restoreR5Geometry,520);
    }
  }

  function documentHasEditableFocus(doc){
    try{
      return !!(doc&&isEditable(doc.activeElement));
    }catch(_){
      return false;
    }
  }

  function anyEditableFocused(){
    if(documentHasEditableFocus(document)) return true;
    if(!host) return false;

    return Array.from(host.querySelectorAll("iframe.module-frame")).some(frame=>{
      try{
        return documentHasEditableFocus(frame.contentDocument);
      }catch(_){
        return false;
      }
    });
  }

  function visualKeyboardOpen(){
    const vv=window.visualViewport;
    if(!vv) return root.classList.contains("ds-keyboard-open");

    const height=Math.max(1,Math.round(Number(vv.height||0)));
    if(height>stableVisualHeight) stableVisualHeight=height;
    const threshold=Math.max(120,Math.round(stableVisualHeight*0.16));
    return stableVisualHeight-height>threshold;
  }

  function reconcileFocusState(forceVisualDecision){
    neutralizeDashboardFallback();

    if(visualKeyboardOpen()){
      setChildInputFocused(true);
      return;
    }

    if(forceVisualDecision&&Date.now()-focusStartedAt>420){
      setChildInputFocused(false);
      return;
    }

    setChildInputFocused(anyEditableFocused());
  }

  function scheduleReconcile(forceVisualDecision){
    [0,60,180,420,760].forEach(delay=>{
      setTimeout(()=>reconcileFocusState(forceVisualDecision),delay);
    });
  }

  function installDocumentBridge(doc){
    if(!doc||watchedDocs.has(doc)) return;
    watchedDocs.add(doc);

    const focusOn=event=>{
      if(!isEditable(event.target)) return;
      setChildInputFocused(true);
    };

    const focusOff=()=>{
      scheduleReconcile(false);
    };

    const pointerOn=event=>{
      if(!isEditable(event.target)) return;
      setChildInputFocused(true);
    };

    doc.addEventListener("focusin",focusOn,true);
    doc.addEventListener("focusout",focusOff,true);
    doc.addEventListener("pointerdown",pointerOn,true);
    doc.addEventListener("touchstart",pointerOn,{capture:true,passive:true});
  }

  function attachFrame(frame){
    if(!frame||String(frame.tagName||"").toUpperCase()!=="IFRAME") return;

    const install=()=>{
      try{
        installDocumentBridge(frame.contentDocument);
      }catch(_){ }
      neutralizeDashboardFallback();
    };

    frame.addEventListener("load",()=>[40,160,420,900].forEach(delay=>setTimeout(install,delay)));
    [0,100,300,800].forEach(delay=>setTimeout(install,delay));
  }

  function scanFrames(){
    neutralizeDashboardFallback();
    if(!host) return;
    host.querySelectorAll("iframe.module-frame").forEach(attachFrame);
  }

  installDocumentBridge(document);
  scanFrames();

  if(host){
    const observer=new MutationObserver(mutations=>{
      mutations.forEach(mutation=>{
        mutation.addedNodes.forEach(attachFrame);
      });
      scanFrames();
    });
    observer.observe(host,{childList:true,subtree:false});
    window.__DS_OVERLAY_R6_FRAME_OBSERVER=observer;
  }

  if(shell){
    const observer=new MutationObserver(neutralizeDashboardFallback);
    observer.observe(shell,{attributes:true,attributeFilter:["class"]});
    window.__DS_OVERLAY_R6_SHELL_OBSERVER=observer;
  }

  document.addEventListener("click",event=>{
    if(event.target.closest&&event.target.closest("[data-nav]")){
      setChildInputFocused(false);
      neutralizeDashboardFallback();
      [0,80,220,520].forEach(delay=>setTimeout(scanFrames,delay));
    }
  },true);

  window.addEventListener("pageshow",()=>scheduleReconcile(true),{passive:true});
  window.addEventListener("resize",()=>scheduleReconcile(true),{passive:true});
  document.addEventListener("visibilitychange",()=>{
    if(!document.hidden) scheduleReconcile(true);
  },{passive:true});

  if(window.visualViewport){
    window.visualViewport.addEventListener("resize",()=>scheduleReconcile(true),{passive:true});
    window.visualViewport.addEventListener("scroll",()=>scheduleReconcile(true),{passive:true});
  }

  const fallbackGuard=setInterval(neutralizeDashboardFallback,500);
  setTimeout(()=>clearInterval(fallbackGuard),15000);

  window.__DS_OVERLAY_HOTFIX_R6__={
    version:VERSION,
    rescan:scanFrames,
    reconcile:reconcileFocusState,
    hideNav:()=>setChildInputFocused(true),
    restoreNav:()=>setChildInputFocused(false)
  };
})();

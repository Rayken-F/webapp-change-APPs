"use strict";

/* DS Workstation keyboard focus guard K1.1 | 2026-09-01
   Small fail-open runtime guard:
   - observes only module iframe creation/load;
   - listens only to focusin/focusout inside the active same-origin module;
   - never resizes the shell and never starts polling loops. */
(function installDsKeyboardFocusGuardK11(){
  const VERSION="DS_KEYBOARD_FOCUS_GUARD_K1_1_20260901";
  if(window.__DS_KEYBOARD_FOCUS_GUARD_K1_1__) return;

  const root=document.documentElement;
  const host=document.getElementById("moduleFrameHost");
  const watchedFrames=new WeakSet();
  const nonTextInputTypes=new Set([
    "button","checkbox","color","file","hidden","image",
    "radio","range","reset","submit"
  ]);

  let releaseTimer=0;
  let lastEditableFocusAt=0;

  function isEditable(target){
    if(!target || target.nodeType!==1) return false;
    const tag=String(target.tagName||"").toUpperCase();
    if(tag==="TEXTAREA") return !target.disabled && !target.readOnly;
    if(tag==="SELECT") return !target.disabled;
    if(tag==="INPUT"){
      const type=String(target.type||"text").toLowerCase();
      return !nonTextInputTypes.has(type) && !target.disabled && !target.readOnly;
    }
    return target.isContentEditable===true;
  }

  function activeFrame(){
    return host&&host.querySelector("iframe.module-frame:not(.hidden)")||null;
  }

  function activeEditableFocused(){
    const frame=activeFrame();
    if(!frame) return false;
    try{
      const doc=frame.contentDocument;
      return !!(doc && isEditable(doc.activeElement));
    }catch(_){
      return false;
    }
  }

  function setChildInputFocus(open){
    root.classList.toggle("ds-child-input-focus",!!open);
  }

  function scheduleRelease(){
    clearTimeout(releaseTimer);
    releaseTimer=setTimeout(function(){
      if(root.classList.contains("ds-keyboard-open")){
        setChildInputFocus(true);
        return;
      }

      /* Initial focus can arrive slightly before VisualViewport reports the
         keyboard. Keep a short opening grace period; after that, a restored
         viewport wins even when iOS leaves the input element technically focused. */
      const openingGrace=
        activeEditableFocused() &&
        Date.now()-lastEditableFocusAt<650;

      setChildInputFocus(openingGrace);
    },260);
  }

  function attachDocument(frame){
    let doc;
    try{
      doc=frame.contentDocument;
      if(!doc || !doc.documentElement) return false;
    }catch(_){
      return false;
    }

    if(doc.documentElement.dataset.dsKeyboardFocusGuardK11==="1") return true;
    doc.documentElement.dataset.dsKeyboardFocusGuardK11="1";

    doc.addEventListener("focusin",function(event){
      if(!isEditable(event.target)) return;
      clearTimeout(releaseTimer);
      lastEditableFocusAt=Date.now();
      setChildInputFocus(true);
    },true);

    doc.addEventListener("focusout",scheduleRelease,true);
    return true;
  }

  function attachFrame(frame){
    if(!frame || String(frame.tagName||"").toUpperCase()!=="IFRAME") return;
    if(!watchedFrames.has(frame)){
      watchedFrames.add(frame);
      frame.addEventListener("load",function(){
        setTimeout(function(){ attachDocument(frame); },0);
        setTimeout(function(){ attachDocument(frame); },180);
      });
    }
    attachDocument(frame);
  }

  function scanFrames(){
    if(!host) return;
    host.querySelectorAll("iframe.module-frame").forEach(attachFrame);
  }

  if(host){
    const observer=new MutationObserver(function(mutations){
      mutations.forEach(function(mutation){
        mutation.addedNodes.forEach(attachFrame);
      });
      scanFrames();
    });
    observer.observe(host,{childList:true,subtree:false});
    window.__DS_KEYBOARD_FOCUS_GUARD_K1_1_OBSERVER=observer;
  }

  if(window.visualViewport){
    window.visualViewport.addEventListener("resize",scheduleRelease,{passive:true});
  }

  window.addEventListener("pageshow",scheduleRelease,{passive:true});
  document.addEventListener("visibilitychange",function(){
    if(!document.hidden) scheduleRelease();
  },{passive:true});

  document.addEventListener("click",function(event){
    if(event.target.closest && event.target.closest("[data-nav]")){
      setChildInputFocus(false);
      setTimeout(scanFrames,0);
      setTimeout(scanFrames,180);
    }
  },true);

  scanFrames();

  window.__DS_KEYBOARD_FOCUS_GUARD_K1_1__={
    version:VERSION,
    scan:scanFrames,
    release:scheduleRelease
  };
})();

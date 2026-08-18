"use strict";

/* DS App Shell keyboard-safe viewport RC｜2026-08-19
   Test path only. It patches the currently loaded production shell at runtime
   without modifying ds-app/app.js.
*/
(function installDsKeyboardSafeViewport(){
  const root=document.documentElement;
  const vv=window.visualViewport;
  const oldSync=window.syncShellViewport;
  let stableHeight=Math.max(
    Number(window.innerHeight||0),
    Number(vv&&vv.height||0),
    Number(document.documentElement.clientHeight||0),
    1
  );
  let settleTimer=0;
  let keyboardOpen=false;

  // Remove the two listeners that directly shrink --ds-shell-vh to visualViewport.height.
  if(typeof oldSync==="function"){
    try{window.removeEventListener("resize",oldSync);}catch(_){ }
    if(vv){
      try{vv.removeEventListener("resize",oldSync);}catch(_){ }
    }
  }

  function readVisualHeight(){
    return Math.max(1,Math.round(
      Number(vv&&vv.height||0) ||
      Number(window.innerHeight||0) ||
      Number(document.documentElement.clientHeight||0) ||
      1
    ));
  }

  function readLayoutCandidate(){
    return Math.max(
      readVisualHeight(),
      Math.round(Number(window.innerHeight||0)),
      Math.round(Number(document.documentElement.clientHeight||0)),
      1
    );
  }

  function keyboardThreshold(){
    return Math.max(130,Math.round(stableHeight*0.17));
  }

  function writeStableHeight(){
    root.style.setProperty("--ds-shell-vh",`${Math.max(1,Math.round(stableHeight))}px`);
    if(typeof window.syncBottomNavHeight==="function") window.syncBottomNavHeight();
  }

  function setKeyboardState(open){
    if(keyboardOpen===open) return;
    keyboardOpen=open;
    root.classList.toggle("ds-keyboard-open",open);
  }

  function syncKeyboardSafeViewport(options){
    const forceReset=!!(options&&options.forceReset);
    const visualHeight=readVisualHeight();

    if(forceReset){
      stableHeight=readLayoutCandidate();
      setKeyboardState(false);
      writeStableHeight();
      return;
    }

    const heightDrop=stableHeight-visualHeight;
    const looksLikeKeyboard=!!vv && heightDrop>keyboardThreshold();

    if(looksLikeKeyboard){
      clearTimeout(settleTimer);
      setKeyboardState(true);
      // Critical rule: never shrink the shell to the keyboard-reduced visual viewport.
      writeStableHeight();
      return;
    }

    setKeyboardState(false);
    clearTimeout(settleTimer);

    // iOS can report one or two transient heights while the keyboard is closing
    // or while switching iframe modules. Wait briefly before accepting a new
    // keyboard-closed baseline so the bottom bar cannot "walk" upward.
    settleTimer=setTimeout(function(){
      const nextVisual=readVisualHeight();
      const nextCandidate=readLayoutCandidate();
      const stillKeyboard=(stableHeight-nextVisual)>keyboardThreshold();
      if(stillKeyboard){
        setKeyboardState(true);
        writeStableHeight();
        return;
      }
      stableHeight=nextCandidate;
      setKeyboardState(false);
      writeStableHeight();
    },160);
  }

  // Replace the global binding used by later openModule()/leaveModuleMode() calls.
  window.syncShellViewport=syncKeyboardSafeViewport;

  window.addEventListener("resize",syncKeyboardSafeViewport,{passive:true});
  if(vv){
    vv.addEventListener("resize",syncKeyboardSafeViewport,{passive:true});
    vv.addEventListener("scroll",syncKeyboardSafeViewport,{passive:true});
  }

  window.addEventListener("orientationchange",function(){
    clearTimeout(settleTimer);
    // Orientation changes legitimately replace the baseline viewport.
    setTimeout(function(){
      stableHeight=readLayoutCandidate();
      syncKeyboardSafeViewport({forceReset:true});
    },280);
  },{passive:true});

  // Module switching can happen during the iOS keyboard closing animation.
  // Re-assert the stable geometry after click transitions settle.
  document.addEventListener("click",function(e){
    if(!e.target.closest("[data-nav]")) return;
    setTimeout(syncKeyboardSafeViewport,40);
    setTimeout(syncKeyboardSafeViewport,220);
  },true);

  syncKeyboardSafeViewport({forceReset:true});
  window.__DS_KEYBOARD_NAV_RC__={
    version:"DS_SHELL_KEYBOARD_NAV_RC_20260819",
    getState:function(){return {stableHeight,visualHeight:readVisualHeight(),keyboardOpen};},
    resync:syncKeyboardSafeViewport
  };
})();

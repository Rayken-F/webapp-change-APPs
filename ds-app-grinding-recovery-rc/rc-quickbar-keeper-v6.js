"use strict";

(function installRcQuickbarKeeperV6(){
  const VERSION="DS_RC_QUICKBAR_KEEPER_V6_20260823";
  if(window.__DS_RC_QUICKBAR_KEEPER_V6)return;

  function shellState(){
    try{return window.__DS_RC_V3__&&window.__DS_RC_V3__.getState?window.__DS_RC_V3__.getState():null;}catch(_){return null;}
  }
  function focusLooksEditable(doc){
    const el=doc&&doc.activeElement;
    if(!el)return false;
    const tag=String(el.tagName||"").toUpperCase();
    return tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT"||el.isContentEditable===true;
  }
  function keyboardReallyOpen(){
    const s=shellState();
    if(s&&s.keyboardOpen)return true;
    const vv=window.visualViewport;
    const full=Math.max(Number(window.innerHeight||0),Number(document.documentElement.clientHeight||0),1);
    const visual=Number(vv&&vv.height||full);
    return focusLooksEditable(document)&&full-visual>Math.max(120,full*.15);
  }

  function healShellNav(){
    const shell=document.getElementById("appShell");
    const nav=shell&&shell.querySelector(".bottom-nav");
    if(!shell||!nav||shell.classList.contains("hidden"))return;

    if(!keyboardReallyOpen()){
      // iOS 有時 focusout 後 visualViewport 已恢復，但 RC keyboard class 留住，導致底部快速切換持續消失。
      document.documentElement.classList.remove("ds-keyboard-open");
      try{if(window.__DS_RC_V3__&&typeof window.__DS_RC_V3__.resync==="function")window.__DS_RC_V3__.resync();}catch(_){ }
      nav.style.removeProperty("display");
      nav.style.removeProperty("visibility");
      nav.style.removeProperty("opacity");
      nav.style.removeProperty("pointer-events");
      nav.style.removeProperty("transform");
    }
  }

  function getGrindingFrame(){return document.querySelector("#moduleFrameHost iframe[data-module-key='grinding']");}
  function healGrindingActionBar(){
    const frame=getGrindingFrame();
    if(!frame)return;
    let doc,win;
    try{doc=frame.contentDocument;win=frame.contentWindow;}catch(_){return;}
    if(!doc||!win||!doc.body)return;

    // HT/DCYL 返回 Grinding RC 正在選取時，底部空間由 return sticky 正常接管，不強制搶回。
    const returnSticky=doc.getElementById("dsReturnV4Sticky");
    if(returnSticky&&returnSticky.classList.contains("show"))return;

    const regular=doc.getElementById("stickyActions");
    if(!regular)return;
    const state=win.state;
    const selected=state&&state.selected&&typeof state.selected==="object"?Object.keys(state.selected).filter(k=>state.selected[k]):[];
    const shouldShow=!!(state&&state.tab==="wip"&&selected.length);

    if(shouldShow){
      try{if(typeof win.renderSticky==="function")win.renderSticky();}catch(_){ }
      // renderSticky 是正式邏輯；只有在它被 RC/DOM 重繪誤留 hidden 時才做最後復原。
      if(regular.classList.contains("hidden"))regular.classList.remove("hidden");
    }
  }

  function healAll(){healShellNav();healGrindingActionBar();}
  function schedule(){[40,160,420,900].forEach(ms=>setTimeout(healAll,ms));}

  document.addEventListener("click",e=>{
    if(e.target.closest("[data-nav],button,input,label,.nav-item"))schedule();
  },true);
  document.addEventListener("focusout",schedule,true);
  window.addEventListener("pageshow",schedule,{passive:true});
  window.addEventListener("resize",schedule,{passive:true});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)schedule();},{passive:true});

  const rootObserver=new MutationObserver(()=>{clearTimeout(rootObserver.t);rootObserver.t=setTimeout(healAll,50);});
  rootObserver.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:["class","style"]});

  let frameDoc=null,frameObserver=null;
  function watchGrindingFrame(){
    const frame=getGrindingFrame();
    if(!frame)return;
    let doc;
    try{doc=frame.contentDocument;}catch(_){return;}
    if(!doc||doc===frameDoc||!doc.documentElement)return;
    frameDoc=doc;
    if(frameObserver)frameObserver.disconnect();
    frameObserver=new MutationObserver(()=>{clearTimeout(frameObserver.t);frameObserver.t=setTimeout(healGrindingActionBar,45);});
    frameObserver.observe(doc.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:["class","style","checked"]});
    doc.addEventListener("click",()=>setTimeout(healGrindingActionBar,50),true);
    doc.addEventListener("change",()=>setTimeout(healGrindingActionBar,50),true);
    frame.addEventListener("load",()=>setTimeout(()=>{watchGrindingFrame();healGrindingActionBar();},120));
  }

  setInterval(()=>{watchGrindingFrame();healAll();},850);
  schedule();
  window.__DS_RC_QUICKBAR_KEEPER_V6={version:VERSION,heal:healAll};
})();

"use strict";
(function installRcNavVisibilityGuardV12(){
  const VERSION="DS_RC_NAV_VISIBILITY_GUARD_V12_20260823";
  if(window.__DS_RC_NAV_GUARD_V12)return;
  const supported=new Set(["daily","dashboard","grinding"]);
  let ticket=0;

  function activeNav(){return document.querySelector("#appShell .bottom-nav .nav-item.active")?.dataset?.nav||"";}
  function inModuleMode(){return !!document.getElementById("appShell")?.classList.contains("module-mode");}
  function frames(){return Array.from(document.querySelectorAll("#moduleFrameHost .module-frame"));}

  function enforce(expected=""){
    if(!inModuleMode())return;
    const target=expected||activeNav();
    if(!supported.has(target))return;
    let matched=0;
    frames().forEach(frame=>{
      const show=String(frame.dataset.moduleKey||"")===target;
      frame.classList.toggle("hidden",!show);
      frame.setAttribute("aria-hidden",show?"false":"true");
      frame.style.visibility=show?"visible":"hidden";
      frame.style.pointerEvents=show?"auto":"none";
      frame.style.zIndex=show?"2":"-1";
      if(show)matched++;
    });
    if(matched!==1){
      console.warn(`[${VERSION}] expected exactly one visible ${target} frame, got ${matched}`);
    }
  }

  function settle(target,myTicket){
    [0,16,60,140,320].forEach(ms=>setTimeout(()=>{
      if(myTicket!==ticket)return;
      if(activeNav()!==target)return;
      enforce(target);
    },ms));
  }

  document.addEventListener("click",e=>{
    const btn=e.target.closest?.("#appShell .bottom-nav [data-nav]");
    if(!btn)return;
    const target=String(btn.dataset.nav||"");
    if(!supported.has(target))return;
    const my=++ticket;
    settle(target,my);
  },true);

  const observer=new MutationObserver(()=>{
    const target=activeNav();
    if(supported.has(target))enforce(target);
  });
  const host=document.getElementById("moduleFrameHost");
  const nav=document.querySelector("#appShell .bottom-nav");
  if(host)observer.observe(host,{subtree:true,childList:true,attributes:true,attributeFilter:["class"]});
  if(nav)observer.observe(nav,{subtree:true,attributes:true,attributeFilter:["class"]});

  window.__DS_RC_NAV_GUARD_V12={version:VERSION,enforce};
})();

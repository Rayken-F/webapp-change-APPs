"use strict";
(function installRcShellStabilityV10(){
  const VERSION="DS_RC_SHELL_STABILITY_V10_20260823";
  if(window.__DS_RC_SHELL_STABILITY_V10)return;
  const root=document.documentElement;
  const vv=window.visualViewport;
  let homeHeight=Math.max(1,Math.round(Number(window.innerHeight||0)),Math.round(Number(document.documentElement.clientHeight||0)),Math.round(Number(vv&&vv.height||0)));
  let orientationReset=false;

  function editableFocused(){
    const el=document.activeElement;if(!el)return false;
    const tag=String(el.tagName||"").toUpperCase();
    return tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT"||el.isContentEditable===true;
  }
  function inModuleMode(){return !!document.getElementById("appShell")?.classList.contains("module-mode");}
  function candidate(){
    const visual=Math.round(Number(vv&&vv.height||0)+Math.max(0,Number(vv&&vv.offsetTop||0)));
    const inner=Math.round(Number(window.innerHeight||0));
    const client=Math.round(Number(document.documentElement.clientHeight||0));
    return Math.max(1,...[visual,inner,client].filter(n=>Number.isFinite(n)&&n>0));
  }
  function keyboardOpen(){
    if(!vv||!editableFocused())return false;
    const full=Math.max(homeHeight,Number(window.innerHeight||0),1);
    return full-Number(vv.height||full)>Math.max(120,full*.15);
  }
  function apply(force){
    // Important v10 rule: never write --ds-shell-vh here. RC v3 owns module geometry.
    if(inModuleMode()){
      root.style.removeProperty("--ds-rc-home-vh");
      try{window.__DS_RC_V3__?.resync?.();}catch(_){ }
      return;
    }
    const c=candidate();
    if(force||orientationReset){homeHeight=c;orientationReset=false;}
    else if(!keyboardOpen()&&c>homeHeight)homeHeight=c;
    root.style.setProperty("--ds-rc-home-vh",`${Math.max(1,Math.round(homeHeight))}px`);
  }
  function burst(force){[0,70,180,420,900].forEach((ms,i)=>setTimeout(()=>apply(!!force&&i===0),ms));}
  function moduleTransition(){
    setTimeout(()=>{
      if(inModuleMode()){
        root.style.removeProperty("--ds-rc-home-vh");
        try{window.__DS_RC_V3__?.resync?.();window.__DS_RC_V3__?.repatch?.();}catch(_){ }
      }else burst(false);
    },30);
    setTimeout(()=>{if(inModuleMode())try{window.__DS_RC_V3__?.resync?.();}catch(_){ }},260);
  }

  window.addEventListener("pageshow",()=>burst(false),{passive:true});
  window.addEventListener("load",()=>burst(false),{passive:true});
  window.addEventListener("resize",()=>{if(!keyboardOpen())apply(false);},{passive:true});
  if(vv){vv.addEventListener("resize",()=>{if(!keyboardOpen())apply(false);},{passive:true});vv.addEventListener("scroll",()=>{if(!inModuleMode())apply(false);},{passive:true});}
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)moduleTransition();},{passive:true});
  document.addEventListener("focusout",()=>setTimeout(moduleTransition,90),true);
  document.addEventListener("click",e=>{if(e.target.closest?.("[data-nav]"))moduleTransition();},true);
  window.addEventListener("orientationchange",()=>{orientationReset=true;setTimeout(()=>burst(true),650);},{passive:true});

  const obs=new MutationObserver(muts=>{
    if(muts.some(m=>m.target?.id==="appShell"||m.target?.id==="loginView"))moduleTransition();
  });
  obs.observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:["class"]});
  homeHeight=candidate();apply(true);
  window.__DS_RC_SHELL_STABILITY_V10={version:VERSION,getHeight:()=>homeHeight,resync:moduleTransition};
})();

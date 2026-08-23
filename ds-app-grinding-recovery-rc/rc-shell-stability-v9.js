"use strict";
(function installRcShellStabilityV11(){
  const VERSION="DS_RC_SHELL_STABILITY_V11_20260823";
  if(window.__DS_RC_SHELL_STABILITY_V11)return;
  const root=document.documentElement;
  const vv=window.visualViewport;
  let homeHeight=Math.max(1,Math.round(Number(window.innerHeight||0)),Math.round(Number(document.documentElement.clientHeight||0)),Math.round(Number(vv&&vv.height||0)));

  function inModuleMode(){return !!document.getElementById("appShell")?.classList.contains("module-mode");}
  function editableFocused(){const el=document.activeElement;if(!el)return false;const t=String(el.tagName||"").toUpperCase();return t==="INPUT"||t==="TEXTAREA"||t==="SELECT"||el.isContentEditable===true;}
  function candidate(){const visual=Math.round(Number(vv&&vv.height||0)+Math.max(0,Number(vv&&vv.offsetTop||0)));const inner=Math.round(Number(window.innerHeight||0));const client=Math.round(Number(document.documentElement.clientHeight||0));return Math.max(1,...[visual,inner,client].filter(n=>Number.isFinite(n)&&n>0));}
  function keyboardOpen(){if(!vv||!editableFocused())return false;const full=Math.max(homeHeight,Number(window.innerHeight||0),1);return full-Number(vv.height||full)>Math.max(120,full*.15);}
  function apply(force=false){
    if(inModuleMode()){
      /* v11 intentionally does nothing to module viewport variables or dimensions. */
      root.style.removeProperty("--ds-rc-home-vh");
      return;
    }
    const c=candidate();
    if(force)homeHeight=c;else if(!keyboardOpen()&&c>homeHeight)homeHeight=c;
    root.style.setProperty("--ds-rc-home-vh",`${Math.max(1,Math.round(homeHeight))}px`);
  }
  function burst(force=false){[0,80,220,520,1100].forEach((ms,i)=>setTimeout(()=>apply(force&&i===0),ms));}

  window.addEventListener("pageshow",()=>burst(false),{passive:true});
  window.addEventListener("load",()=>burst(false),{passive:true});
  window.addEventListener("resize",()=>{if(!inModuleMode()&&!keyboardOpen())apply(false);},{passive:true});
  if(vv)vv.addEventListener("resize",()=>{if(!inModuleMode()&&!keyboardOpen())apply(false);},{passive:true});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden&&!inModuleMode())burst(false);},{passive:true});
  document.addEventListener("focusout",()=>{if(!inModuleMode())setTimeout(()=>burst(false),80);},true);
  window.addEventListener("orientationchange",()=>setTimeout(()=>{homeHeight=candidate();burst(true);},650),{passive:true});

  const obs=new MutationObserver(()=>{
    if(inModuleMode())root.style.removeProperty("--ds-rc-home-vh");
    else burst(false);
  });
  const shell=document.getElementById("appShell");
  if(shell)obs.observe(shell,{attributes:true,attributeFilter:["class"]});
  apply(true);
  window.__DS_RC_SHELL_STABILITY_V11={version:VERSION,getHeight:()=>homeHeight,resync:()=>burst(false)};
})();

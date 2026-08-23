"use strict";
(function installRcShellStabilityV9(){
  const VERSION="DS_RC_SHELL_STABILITY_V9_20260823";
  if(window.__DS_RC_SHELL_STABILITY_V9)return;
  const root=document.documentElement;
  const vv=window.visualViewport;
  const standalone=!!(window.navigator.standalone||window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches);
  const isiOS=/iPhone|iPad|iPod/i.test(navigator.userAgent||"")||(/Macintosh/i.test(navigator.userAgent||"")&&navigator.maxTouchPoints>1);
  let stable=1;
  let orientationReset=false;

  function editableFocused(){
    const el=document.activeElement;if(!el)return false;
    const tag=String(el.tagName||"").toUpperCase();
    return tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT"||el.isContentEditable===true;
  }
  function readCandidate(){
    const visual=Math.round(Number(vv&&vv.height||0)+Math.max(0,Number(vv&&vv.offsetTop||0)));
    const inner=Math.round(Number(window.innerHeight||0));
    const client=Math.round(Number(document.documentElement.clientHeight||0));
    const candidates=[visual,inner,client,1];
    if(isiOS&&standalone){
      const sh=Math.round(Number(screen&&screen.height||0));
      if(sh>0)candidates.push(sh);
    }
    return Math.max.apply(null,candidates.filter(n=>Number.isFinite(n)&&n>0));
  }
  function keyboardOpen(){
    if(!vv||!editableFocused())return false;
    const full=Math.max(stable,Number(window.innerHeight||0),1);
    return full-Number(vv.height||full)>Math.max(120,full*.15);
  }
  function apply(force){
    const c=readCandidate();
    if(force||orientationReset){stable=c;orientationReset=false;}
    else if(!keyboardOpen()&&c>stable)stable=c;
    root.style.setProperty("--ds-rc-full-vh",`${Math.max(1,Math.round(stable))}px`);
    if(!keyboardOpen())root.style.setProperty("--ds-shell-vh",`${Math.max(1,Math.round(stable))}px`);
  }
  function burst(force){[0,60,180,420,900,1600].forEach((ms,i)=>setTimeout(()=>apply(!!force&&i===0),ms));}

  window.addEventListener("pageshow",()=>burst(false),{passive:true});
  window.addEventListener("load",()=>burst(false),{passive:true});
  window.addEventListener("resize",()=>{if(!keyboardOpen())apply(false);},{passive:true});
  if(vv){vv.addEventListener("resize",()=>{if(!keyboardOpen())apply(false);},{passive:true});vv.addEventListener("scroll",()=>apply(false),{passive:true});}
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)burst(false);},{passive:true});
  document.addEventListener("focusout",()=>setTimeout(()=>burst(false),80),true);
  window.addEventListener("orientationchange",()=>{orientationReset=true;setTimeout(()=>burst(true),650);},{passive:true});

  const obs=new MutationObserver(()=>{
    const login=document.getElementById("loginView"),shell=document.getElementById("appShell");
    if((login&&!login.classList.contains("hidden"))||(shell&&!shell.classList.contains("hidden")))burst(false);
  });
  obs.observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:["class"]});
  stable=readCandidate();apply(true);burst(false);
  window.__DS_RC_SHELL_STABILITY_V9={version:VERSION,getHeight:()=>stable,resync:()=>burst(false)};
})();

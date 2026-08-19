"use strict";

/* DS App Shell Production UX｜2026-08-19
   Promoted from field-accepted RC v3.
*/
(function installDsShellUx(){
  const root=document.documentElement;
  const vv=window.visualViewport;
  const oldSync=window.syncShellViewport;
  let stableHeight=Math.max(
    Math.round(Number(window.innerHeight||0)),
    Math.round(Number(document.documentElement.clientHeight||0)),
    Math.round(Number(vv&&vv.height||0)),
    1
  );
  let keyboardOpen=false;
  let orientationTimer=0;
  let patchTimer=0;

  if(typeof oldSync==="function"){
    try{window.removeEventListener("resize",oldSync);}catch(_){ }
    if(vv){try{vv.removeEventListener("resize",oldSync);}catch(_){ }}
  }

  function readVisualHeight(){
    return Math.max(1,Math.round(Number(vv&&vv.height||0)||Number(window.innerHeight||0)||Number(document.documentElement.clientHeight||0)||1));
  }
  function readCandidate(){
    return Math.max(
      readVisualHeight()+Math.max(0,Math.round(Number(vv&&vv.offsetTop||0))),
      Math.round(Number(window.innerHeight||0)),
      Math.round(Number(document.documentElement.clientHeight||0)),
      1
    );
  }
  function keyboardThreshold(){return Math.max(130,Math.round(stableHeight*0.17));}
  function writeGeometry(){
    root.style.setProperty("--ds-shell-vh",`${Math.max(1,Math.round(stableHeight))}px`);
    if(typeof window.syncBottomNavHeight==="function") window.syncBottomNavHeight();
  }
  function setKeyboard(open){
    keyboardOpen=!!open;
    root.classList.toggle("ds-keyboard-open",keyboardOpen);
  }

  function syncShellUxViewport(){
    const visual=readVisualHeight();
    const candidate=readCandidate();
    const drop=stableHeight-visual;
    const looksLikeKeyboard=!!vv && drop>keyboardThreshold();

    if(looksLikeKeyboard){
      setKeyboard(true);
      writeGeometry();
      return;
    }

    setKeyboard(false);
    if(candidate>stableHeight) stableHeight=candidate;
    writeGeometry();
  }

  function rebaseAfterOrientation(){
    clearTimeout(orientationTimer);
    const samples=[];
    const collect=()=>samples.push(readCandidate());
    collect();
    setTimeout(collect,120);
    setTimeout(collect,300);
    orientationTimer=setTimeout(function(){
      collect();
      stableHeight=Math.max.apply(null,samples.concat([1]));
      setKeyboard(false);
      writeGeometry();
    },620);
  }

  window.syncShellViewport=syncShellUxViewport;
  window.addEventListener("resize",syncShellUxViewport,{passive:true});
  window.addEventListener("pageshow",()=>setTimeout(syncShellUxViewport,60),{passive:true});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)setTimeout(syncShellUxViewport,80);},{passive:true});
  if(vv){
    vv.addEventListener("resize",syncShellUxViewport,{passive:true});
    vv.addEventListener("scroll",syncShellUxViewport,{passive:true});
  }
  window.addEventListener("orientationchange",rebaseAfterOrientation,{passive:true});

  ["gesturestart","gesturechange","gestureend"].forEach(type=>document.addEventListener(type,e=>{if(e&&typeof e.preventDefault==="function")e.preventDefault();},{passive:false}));

  function getProfile(){
    try{return window.DS_PORTAL_BRIDGE&&window.DS_PORTAL_BRIDGE.getProfile?window.DS_PORTAL_BRIDGE.getProfile():null;}catch(_){return null;}
  }
  function getUser(){const profile=getProfile()||{};return profile.user||{};}
  function getDisplayName(){const u=getUser();return String(u.displayName||u.display_name||u.name||"").trim();}
  function getRole(){return String(getUser().role||"").trim();}
  function visibleModuleFrame(){return document.querySelector("#moduleFrameHost .module-frame:not(.hidden)");}

  function updateContextBar(){
    const bar=document.getElementById("dsModuleContextBar");
    if(!bar) return;
    const frame=visibleModuleFrame();
    const key=String(frame&&frame.dataset.moduleKey||"");
    const title=String(frame&&frame.title||"")||({daily:"日報系統",dashboard:"Dashboard",grinding:"Grinding WIP",iqc:"IQC 異常處理"}[key]||"DS 功能");
    const icon={daily:"📝",dashboard:"📊",grinding:"⚙️",iqc:"📥"}[key]||"DS";
    const titleEl=document.getElementById("dsModuleContextTitle");
    const iconEl=document.getElementById("dsModuleContextIcon");
    const userEl=document.getElementById("dsModuleContextUser");
    if(titleEl) titleEl.textContent=title;
    if(iconEl) iconEl.textContent=icon;
    if(userEl){
      const name=getDisplayName(); const role=getRole();
      userEl.textContent=name?(role?`${name} · ${role}`:name):"DS 使用者";
    }
    bar.setAttribute("aria-hidden",document.getElementById("appShell")?.classList.contains("module-mode")?"false":"true");
  }

  function injectDailyStyle(doc){
    if(doc.getElementById("ds-shell-production-style")) return;
    const style=doc.createElement("style");
    style.id="ds-shell-production-style";
    style.textContent=`
      #card-person{display:none!important;}
      #dsShellReporterCard{display:none!important;}
      details.legacy-sandblast-entry{display:none!important;}
    `;
    doc.head.appendChild(style);
  }

  function installChildKeyboardHooks(frame,doc){
    if(!doc||doc.documentElement.dataset.dsShellKeyboardHooks==="1") return;
    doc.documentElement.dataset.dsShellKeyboardHooks="1";
    doc.addEventListener("focusin",function(){setTimeout(syncShellUxViewport,40);setTimeout(syncShellUxViewport,180);},true);
    doc.addEventListener("focusout",function(){setTimeout(syncShellUxViewport,60);setTimeout(syncShellUxViewport,260);setTimeout(syncShellUxViewport,600);},true);
  }

  function patchDaily(frame){
    if(!frame||String(frame.dataset.moduleKey)!=="daily") return;
    let doc,win;
    try{doc=frame.contentDocument;win=frame.contentWindow;}catch(_){return;}
    if(!doc||!doc.body) return;
    injectDailyStyle(doc);
    installChildKeyboardHooks(frame,doc);

    const person=doc.getElementById("person");
    const name=getDisplayName();
    if(!person||!name) return;
    let option=Array.from(person.options||[]).find(opt=>String(opt.value||opt.textContent||"").trim()===name);
    if(!option){option=doc.createElement("option");option.value=name;option.textContent=name;person.appendChild(option);}
    person.value=name;
    try{win.localStorage.setItem("report_person",name);}catch(_){ }
    try{person.dispatchEvent(new win.Event("input",{bubbles:true}));}catch(_){ }
    try{person.dispatchEvent(new win.Event("change",{bubbles:true}));}catch(_){ }
    const duplicate=doc.getElementById("dsShellReporterCard");
    if(duplicate) duplicate.remove();
  }

  function patchFrame(frame){
    if(!frame) return;
    let doc=null;
    try{doc=frame.contentDocument;}catch(_){ }
    if(doc) installChildKeyboardHooks(frame,doc);
    if(String(frame.dataset.moduleKey)==="daily") patchDaily(frame);
  }
  function patchAllFrames(){document.querySelectorAll("#moduleFrameHost .module-frame").forEach(patchFrame);updateContextBar();}

  const host=document.getElementById("moduleFrameHost");
  if(host){
    const observer=new MutationObserver(function(mutations){
      mutations.forEach(function(m){
        if(m.type==="childList") m.addedNodes.forEach(function(node){if(node&&node.tagName==="IFRAME")node.addEventListener("load",()=>setTimeout(()=>{patchFrame(node);updateContextBar();syncShellUxViewport();},70));});
      });
      setTimeout(patchAllFrames,40);
    });
    observer.observe(host,{childList:true,subtree:false,attributes:true,attributeFilter:["class"]});
    window.__dsShellModuleObserver=observer;
  }

  document.addEventListener("click",function(e){
    if(!e.target.closest("[data-nav]")) return;
    setTimeout(()=>{syncShellUxViewport();updateContextBar();patchAllFrames();},40);
    setTimeout(()=>{syncShellUxViewport();updateContextBar();patchAllFrames();},240);
  },true);

  let retries=0;
  patchTimer=setInterval(function(){retries+=1;patchAllFrames();syncShellUxViewport();if(retries>=12)clearInterval(patchTimer);},650);

  writeGeometry();
  updateContextBar();
  window.__DS_SHELL_UX__={version:"DS_SHELL_IOS_UX_PROD_20260819_R1",getState:()=>({stableHeight,visualHeight:readVisualHeight(),candidateHeight:readCandidate(),keyboardOpen,scale:Number(vv&&vv.scale||1)}),resync:syncShellUxViewport,repatch:patchAllFrames};
})();

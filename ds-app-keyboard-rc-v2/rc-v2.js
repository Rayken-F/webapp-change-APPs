"use strict";

/* DS App Shell RC v2｜2026-08-19
   - Stable iOS keyboard geometry
   - Persistent module title
   - Daily Report reporter auto-fill from DS login
   - Legacy sandblast backup containment
   - Test path only; production ds-app and ds-report-pwa are untouched.
*/
(function installDsRcV2(){
  const root=document.documentElement;
  const vv=window.visualViewport;
  const oldSync=window.syncShellViewport;
  let stableHeight=Math.max(
    Math.round(Number(window.innerHeight||0)),
    Math.round(Number(vv&&vv.height||0)),
    Math.round(Number(document.documentElement.clientHeight||0)),
    1
  );
  let keyboardOpen=false;
  let settleTimer=0;
  let patchTimer=0;

  if(typeof oldSync==="function"){
    try{window.removeEventListener("resize",oldSync);}catch(_){ }
    if(vv){
      try{vv.removeEventListener("resize",oldSync);}catch(_){ }
    }
  }

  function readVisualHeight(){
    return Math.max(1,Math.round(
      Number(vv&&vv.height||0)||
      Number(window.innerHeight||0)||
      Number(document.documentElement.clientHeight||0)||1
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

  function writeStableGeometry(){
    root.style.setProperty("--ds-shell-vh",`${Math.max(1,Math.round(stableHeight))}px`);
    if(typeof window.syncBottomNavHeight==="function") window.syncBottomNavHeight();
  }

  function setKeyboardState(open){
    keyboardOpen=!!open;
    root.classList.toggle("ds-keyboard-open",keyboardOpen);
  }

  function syncRcViewport(options){
    const forceReset=!!(options&&options.forceReset);
    const visualHeight=readVisualHeight();

    if(forceReset){
      stableHeight=readLayoutCandidate();
      setKeyboardState(false);
      writeStableGeometry();
      return;
    }

    const looksLikeKeyboard=!!vv && (stableHeight-visualHeight)>keyboardThreshold();
    if(looksLikeKeyboard){
      clearTimeout(settleTimer);
      setKeyboardState(true);
      writeStableGeometry();
      return;
    }

    setKeyboardState(false);
    clearTimeout(settleTimer);
    settleTimer=setTimeout(function(){
      const nextVisual=readVisualHeight();
      if((stableHeight-nextVisual)>keyboardThreshold()){
        setKeyboardState(true);
        writeStableGeometry();
        return;
      }
      stableHeight=readLayoutCandidate();
      setKeyboardState(false);
      writeStableGeometry();
    },180);
  }

  window.syncShellViewport=syncRcViewport;
  window.addEventListener("resize",syncRcViewport,{passive:true});
  if(vv){
    vv.addEventListener("resize",syncRcViewport,{passive:true});
    vv.addEventListener("scroll",syncRcViewport,{passive:true});
  }
  window.addEventListener("orientationchange",function(){
    clearTimeout(settleTimer);
    setTimeout(function(){
      stableHeight=readLayoutCandidate();
      syncRcViewport({forceReset:true});
    },320);
  },{passive:true});

  // iOS sometimes still exposes gesture events in standalone mode. RC v2 is an
  // operations shell, so accidental pinch zoom is intentionally suppressed.
  ["gesturestart","gesturechange","gestureend"].forEach(function(type){
    document.addEventListener(type,function(e){
      if(e&&typeof e.preventDefault==="function") e.preventDefault();
    },{passive:false});
  });

  function getProfile(){
    try{return window.DS_PORTAL_BRIDGE&&window.DS_PORTAL_BRIDGE.getProfile?window.DS_PORTAL_BRIDGE.getProfile():null;}catch(_){return null;}
  }

  function getUser(){
    const profile=getProfile()||{};
    return profile.user||{};
  }

  function getDisplayName(){
    const user=getUser();
    return String(user.displayName||user.display_name||user.name||"").trim();
  }

  function getRole(){
    const user=getUser();
    return String(user.role||"").trim();
  }

  function visibleModuleFrame(){
    return document.querySelector("#moduleFrameHost .module-frame:not(.hidden)");
  }

  function updateContextBar(){
    const bar=document.getElementById("dsModuleContextBar");
    if(!bar) return;
    const frame=visibleModuleFrame();
    const titleEl=document.getElementById("dsModuleContextTitle");
    const iconEl=document.getElementById("dsModuleContextIcon");
    const userEl=document.getElementById("dsModuleContextUser");
    const key=String(frame&&frame.dataset.moduleKey||"");
    const title=String(frame&&frame.title||"")||({daily:"日報系統",dashboard:"Dashboard",grinding:"Grinding WIP",iqc:"IQC 異常處理"}[key]||"DS 功能");
    const icon={daily:"📝",dashboard:"📊",grinding:"⚙️",iqc:"📥"}[key]||"DS";
    if(titleEl) titleEl.textContent=title;
    if(iconEl) iconEl.textContent=icon;
    if(userEl){
      const name=getDisplayName();
      const role=getRole();
      userEl.textContent=name?(role?`${name} · ${role}`:name):"DS 使用者";
    }
    bar.setAttribute("aria-hidden",document.getElementById("appShell")?.classList.contains("module-mode")?"false":"true");
  }

  function injectDailyStyle(doc){
    if(doc.getElementById("ds-shell-rc2-style")) return;
    const style=doc.createElement("style");
    style.id="ds-shell-rc2-style";
    style.textContent=`
      #card-person.ds-shell-reporter-hidden{display:none!important;}
      .ds-shell-reporter-card{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:14px;width:100%;margin:0 0 18px;padding:15px 16px;border:1px solid rgba(190,207,255,.32);border-radius:20px;background:linear-gradient(135deg,rgba(44,72,164,.42),rgba(94,54,184,.36));box-shadow:0 10px 34px rgba(13,25,83,.32);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);overflow:hidden;}
      .ds-shell-reporter-main{min-width:0;display:flex;align-items:center;gap:12px;}
      .ds-shell-reporter-avatar{width:42px;height:42px;flex:0 0 42px;display:grid;place-items:center;border-radius:14px;background:linear-gradient(145deg,#5c70ff,#4eb7ff);box-shadow:0 8px 22px rgba(65,91,255,.28);font-size:18px;font-weight:900;color:#fff;}
      .ds-shell-reporter-copy{min-width:0;}
      .ds-shell-reporter-copy small{display:block;margin-bottom:2px;color:rgba(222,232,255,.64);font-size:11px;font-weight:800;letter-spacing:.06em;}
      .ds-shell-reporter-copy strong{display:block;overflow:hidden;color:#fff;font-size:17px;line-height:1.25;text-overflow:ellipsis;white-space:nowrap;}
      .ds-shell-reporter-lock{flex:0 0 auto;padding:6px 9px;border:1px solid rgba(176,196,255,.20);border-radius:999px;background:rgba(255,255,255,.055);color:rgba(226,235,255,.72);font-size:10px;font-weight:800;white-space:nowrap;}
      details.legacy-sandblast-entry{display:block!important;width:100%!important;max-width:100%!important;margin:0 0 18px!important;padding:14px 16px!important;border:1px solid rgba(255,199,103,.28)!important;border-radius:18px!important;background:linear-gradient(135deg,rgba(71,66,133,.52),rgba(91,65,130,.38))!important;box-sizing:border-box!important;overflow:hidden!important;color:#ffe7a5!important;}
      details.legacy-sandblast-entry summary{display:block!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important;cursor:pointer;font-weight:900;overflow-wrap:anywhere;}
      details.legacy-sandblast-entry .scan-tip,details.legacy-sandblast-entry button{max-width:100%!important;box-sizing:border-box!important;}
      .legacy-sandblast-backup,.legacy-sandblast-body,.legacy-sandblast-warning{width:100%!important;max-width:100%!important;box-sizing:border-box!important;overflow-wrap:anywhere;}
    `;
    doc.head.appendChild(style);
  }

  function patchDailyReporter(frame){
    if(!frame||String(frame.dataset.moduleKey)!=="daily") return;
    let doc,win;
    try{doc=frame.contentDocument;win=frame.contentWindow;}catch(_){return;}
    if(!doc||!doc.body) return;
    injectDailyStyle(doc);

    const person=doc.getElementById("person");
    const card=doc.getElementById("card-person");
    const name=getDisplayName();
    if(!person||!card||!name) return;

    let option=Array.from(person.options||[]).find(function(opt){return String(opt.value||opt.textContent||"").trim()===name;});
    if(!option){
      option=doc.createElement("option");
      option.value=name;
      option.textContent=name;
      person.appendChild(option);
    }
    person.value=name;
    try{win.localStorage.setItem("report_person",name);}catch(_){ }
    try{person.dispatchEvent(new win.Event("input",{bubbles:true}));}catch(_){ }
    try{person.dispatchEvent(new win.Event("change",{bubbles:true}));}catch(_){ }
    card.classList.add("ds-shell-reporter-hidden");

    let reporter=doc.getElementById("dsShellReporterCard");
    if(!reporter){
      reporter=doc.createElement("div");
      reporter.id="dsShellReporterCard";
      reporter.className="ds-shell-reporter-card";
      card.insertAdjacentElement("beforebegin",reporter);
    }
    const initial=Array.from(name)[0]||"DS";
    reporter.innerHTML=`<div class="ds-shell-reporter-main"><div class="ds-shell-reporter-avatar">${escapeHtmlRc(initial)}</div><div class="ds-shell-reporter-copy"><small>DS 工作站登入使用者</small><strong>${escapeHtmlRc(name)}</strong></div></div><div class="ds-shell-reporter-lock">自動帶入</div>`;
  }

  function escapeHtmlRc(value){
    return String(value||"").replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});
  }

  function patchFrame(frame){
    if(!frame) return;
    if(String(frame.dataset.moduleKey)==="daily") patchDailyReporter(frame);
  }

  function patchAllFrames(){
    document.querySelectorAll("#moduleFrameHost .module-frame").forEach(patchFrame);
    updateContextBar();
  }

  const host=document.getElementById("moduleFrameHost");
  if(host){
    const observer=new MutationObserver(function(mutations){
      mutations.forEach(function(m){
        if(m.type==="childList"){
          m.addedNodes.forEach(function(node){
            if(node&&node.tagName==="IFRAME"){
              node.addEventListener("load",function(){setTimeout(function(){patchFrame(node);updateContextBar();},60);});
            }
          });
        }
      });
      setTimeout(patchAllFrames,40);
    });
    observer.observe(host,{childList:true,subtree:false,attributes:true,attributeFilter:["class"]});
    window.__dsRc2ModuleObserver=observer;
  }

  document.addEventListener("click",function(e){
    if(!e.target.closest("[data-nav]")) return;
    setTimeout(function(){syncRcViewport();updateContextBar();patchAllFrames();},40);
    setTimeout(function(){syncRcViewport();updateContextBar();patchAllFrames();},240);
  },true);

  // Profile and prewarmed iframe can become ready in either order. Retry briefly,
  // then stop; normal iframe load/nav events keep the patch current afterwards.
  let retries=0;
  patchTimer=setInterval(function(){
    retries+=1;
    patchAllFrames();
    if(retries>=15) clearInterval(patchTimer);
  },700);

  syncRcViewport({forceReset:true});
  updateContextBar();
  window.__DS_RC_V2__={
    version:"DS_SHELL_IOS_UX_RC_V2_20260819",
    getState:function(){return {stableHeight,visualHeight:readVisualHeight(),keyboardOpen,scale:Number(vv&&vv.scale||1)};},
    resync:syncRcViewport,
    repatch:patchAllFrames
  };
})();

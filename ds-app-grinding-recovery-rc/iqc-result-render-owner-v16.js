"use strict";

(function installIqcResultRenderOwnerV16(){
  const VERSION="IQC_RESULT_RENDER_OWNER_RC_V16_20260824";
  if(window.__DS_IQC_RESULT_RENDER_OWNER_V16)return;

  let v8Seen=false;
  let repairing=false;
  let observer=null;
  let lastRepairAt=0;

  function getHost(){
    return document.getElementById("iqcRcResultList");
  }

  function meta(){
    return window.__DS_IQC_META_GROUPING_V8||null;
  }

  function hasV8(host){
    return !!(host&&host.querySelector(".ds-iqc-v8-group"));
  }

  async function repair(reason){
    const host=getHost();
    const m=meta();
    if(!host||!m||typeof m.refresh!=="function"||repairing)return;

    if(hasV8(host)){
      v8Seen=true;
      host.style.visibility="";
      host.dataset.dsResultOwner="META_V8";
      return;
    }

    // V8 曾經接管後，舊 Intake renderer 若再次覆寫結果區，先隱藏內容。
    // visibility:hidden 保留原高度，避免畫面跳動；V8 重畫完成後立即恢復。
    if(!v8Seen)return;
    repairing=true;
    lastRepairAt=Date.now();
    host.style.visibility="hidden";
    host.dataset.dsResultOwner="REPAIRING_TO_META_V8";
    try{
      await Promise.resolve(m.refresh());
    }catch(err){
      console.warn("[IQC RESULT OWNER V16] refresh failed",reason,err);
    }finally{
      requestAnimationFrame(()=>{
        const current=getHost();
        if(current&&hasV8(current)){
          current.style.visibility="";
          current.dataset.dsResultOwner="META_V8";
          v8Seen=true;
        }
        repairing=false;
      });
    }
  }

  function attach(){
    const host=getHost();
    if(!host)return false;
    if(observer)observer.disconnect();
    observer=new MutationObserver(()=>{
      if(hasV8(host)){
        v8Seen=true;
        host.style.visibility="";
        host.dataset.dsResultOwner="META_V8";
        return;
      }
      if(v8Seen&&!repairing)repair("legacy-render-overwrite");
    });
    observer.observe(host,{childList:true,subtree:true});
    repair("attach");
    return true;
  }

  const bootstrap=new MutationObserver(()=>{
    if(attach())bootstrap.disconnect();
  });
  bootstrap.observe(document.documentElement,{childList:true,subtree:true});
  attach();

  // Safety-net only. Normal protection is mutation-driven and does not repaint periodically.
  setInterval(()=>{
    const host=getHost();
    if(!host)return;
    if(hasV8(host)){
      v8Seen=true;
      host.style.visibility="";
      return;
    }
    if(v8Seen&&!repairing&&Date.now()-lastRepairAt>500)repair("safety-net");
  },2000);

  // Make the active RC version visible without touching Production.
  const banner=document.querySelector(".rc-login-banner");
  if(banner)banner.textContent="⚠️ Grinding Recovery / Return / IQC Hybrid Image RC v16｜測試入口";

  window.__DS_IQC_RESULT_RENDER_OWNER_V16__={
    version:VERSION,
    repair:()=>repair("manual"),
    status:()=>({v8Seen,repairing,lastRepairAt})
  };
})();

"use strict";

(function installIqcHybridButtonStabilityV19(){
  const VERSION="IQC_HYBRID_BUTTON_STABILITY_RC_V19_20260824";
  if(window.__DS_IQC_HYBRID_BUTTON_STABILITY_V19__)return;

  function ensureStyle(){
    if(document.getElementById("dsIqcHybridButtonStabilityV19Style"))return;
    const style=document.createElement("style");
    style.id="dsIqcHybridButtonStabilityV19Style";
    style.textContent=`
      #iqcHybridSyncBtn,
      #iqcHybridSyncBtn:disabled{
        opacity:1!important;
        filter:none!important;
        transition:none!important;
        animation:none!important;
      }
      #iqcHybridSyncBtn:disabled{
        cursor:default;
      }
    `;
    document.head.appendChild(style);
  }

  function stabilize(){
    ensureStyle();
    const btn=document.getElementById("iqcHybridSyncBtn");
    if(!btn)return;
    btn.style.opacity="1";
    btn.style.filter="none";
    btn.style.transition="none";
    btn.style.animation="none";
    btn.dataset.dsVisualStable="1";
  }

  const observer=new MutationObserver(()=>stabilize());
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:["disabled","class","style"]});

  ensureStyle();
  stabilize();

  window.__DS_IQC_HYBRID_BUTTON_STABILITY_V19__={
    version:VERSION,
    stabilize
  };
})();

"use strict";

(function installGrindingUiSafeRc(){
  const VERSION="GRINDING_UI_SAFE_RC_V1_20260820";

  function getGrindingFrame(){
    return document.querySelector("#moduleFrameHost iframe[data-module-key='grinding']");
  }

  function apply(){
    const frame=getGrindingFrame();
    if(!frame)return false;
    let doc;
    try{doc=frame.contentDocument;}catch(_){return false;}
    if(!doc||!doc.head)return false;
    if(doc.getElementById("dsGrindingUiSafeRcStyle"))return true;

    const style=doc.createElement("style");
    style.id="dsGrindingUiSafeRcStyle";
    style.textContent=`
      #operationInfoCard .row.between{align-items:flex-start;gap:8px;min-width:0}
      #operationInfoCard .row.between>*{min-width:0}
      #apiPill{
        flex:1 1 220px;
        max-width:100%;
        min-width:0;
        white-space:normal!important;
        overflow-wrap:anywhere;
        word-break:break-word;
        line-height:1.35;
        text-align:left;
        font-size:10px;
      }
      @media(max-width:620px){
        #operationInfoCard .row.between{flex-direction:column;align-items:stretch}
        #apiPill{width:100%;font-size:10px;padding:6px 8px}
      }
    `;
    doc.head.appendChild(style);
    return true;
  }

  function schedule(){
    [150,450,900,1600,2600].forEach(ms=>setTimeout(apply,ms));
  }

  document.addEventListener("click",event=>{
    const nav=event.target.closest&&event.target.closest("[data-nav='grinding']");
    if(nav)schedule();
  },true);

  setTimeout(schedule,3000);
  window.__DS_GRINDING_UI_SAFE_RC={version:VERSION,apply};
})();

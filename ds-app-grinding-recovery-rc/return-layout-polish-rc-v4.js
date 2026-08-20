"use strict";

(function installReturnLayoutPolishRcV4(){
  const VERSION="GRINDING_RETURN_LAYOUT_POLISH_RC_V4_20260820";

  function apply(){
    const frame=document.querySelector("#moduleFrameHost iframe[data-module-key='grinding']");
    if(!frame)return false;
    let doc;
    try{doc=frame.contentDocument;}catch(_){return false;}
    if(!doc||!doc.head)return false;
    if(doc.getElementById("dsReturnLayoutPolishV4"))return true;
    if(!doc.getElementById("dsReturnV4Card"))return false;

    const style=doc.createElement("style");
    style.id="dsReturnLayoutPolishV4";
    style.textContent=`
      .ds-ret4-row{grid-template-columns:minmax(0,1fr) auto!important}
      .ds-ret4-row>div{grid-column:1;grid-row:1;min-width:0}
      .ds-ret4-row>input[data-ret-key]{grid-column:2;grid-row:1;margin:0 2px 0 6px}
    `;
    doc.head.appendChild(style);
    return true;
  }

  function schedule(){[250,700,1400,2600,4200].forEach(ms=>setTimeout(apply,ms));}
  document.addEventListener("click",event=>{
    const nav=event.target.closest&&event.target.closest("[data-nav='grinding']");
    if(nav)schedule();
  },true);
  setTimeout(schedule,3600);
  window.__DS_RETURN_LAYOUT_POLISH_RC_V4={version:VERSION,apply};
})();

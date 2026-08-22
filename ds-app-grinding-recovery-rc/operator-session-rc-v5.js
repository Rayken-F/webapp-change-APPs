"use strict";

(function installGrindingOperatorSessionRc(){
  const VERSION="GRINDING_OPERATOR_SESSION_RC_V5_20260822";

  function getGrindingFrame(){
    return document.querySelector("#moduleFrameHost iframe[data-module-key='grinding']");
  }

  function getDsUserName(){
    const el=document.getElementById("userName");
    const name=String(el&&el.textContent||"").trim();
    return name&&name!=="-"&&name!=="使用者"?name:"";
  }

  function apply(){
    const frame=getGrindingFrame();
    if(!frame)return false;
    let doc;
    try{doc=frame.contentDocument;}catch(_){return false;}
    if(!doc||!doc.head||!doc.body)return false;

    if(!doc.getElementById("dsOperatorSessionRcStyle")){
      const style=doc.createElement("style");
      style.id="dsOperatorSessionRcStyle";
      style.textContent=`
        #operatorName{display:none!important}
        #operatorName.closest-hidden{display:none!important}
        #operationInfoCard .meta-grid{grid-template-columns:1fr!important}
      `;
      doc.head.appendChild(style);
    }

    const field=doc.getElementById("operatorName");
    const userName=getDsUserName();
    if(field){
      const holder=field.closest(".field");
      if(holder)holder.style.display="none";
      if(userName)field.value=userName;
    }

    if(!doc.getElementById("dsOperatorSessionRcRuntime")){
      const script=doc.createElement("script");
      script.id="dsOperatorSessionRcRuntime";
      script.textContent=`
        (function(){
          if(window.__DS_OPERATOR_SESSION_RC_V5)return;
          function readHostUser(){
            try{
              const el=window.parent&&window.parent.document&&window.parent.document.getElementById('userName');
              const name=String(el&&el.textContent||'').trim();
              return name&&name!=='-'&&name!=='使用者'?name:'';
            }catch(_){return ''}
          }
          function sync(){
            const field=document.getElementById('operatorName');
            const name=readHostUser();
            if(field){
              const holder=field.closest('.field');
              if(holder)holder.style.display='none';
              if(name)field.value=name;
            }
            try{
              if(name&&typeof state!=='undefined'&&state)state.operator=name;
            }catch(_){}
            try{if(typeof saveState==='function')saveState();}catch(_){}
          }
          const originalSync=typeof syncMetaFromInputs==='function'?syncMetaFromInputs:null;
          if(originalSync){
            syncMetaFromInputs=function(){
              sync();
              const result=originalSync.apply(this,arguments);
              sync();
              return result;
            };
          }
          sync();
          setTimeout(sync,300);
          setTimeout(sync,900);
          window.__DS_OPERATOR_SESSION_RC_V5={version:'${VERSION}',sync:sync};
        })();
      `;
      doc.body.appendChild(script);
    }
    return true;
  }

  function schedule(){[120,350,800,1500,2600].forEach(ms=>setTimeout(apply,ms));}
  document.addEventListener("click",event=>{
    const nav=event.target.closest&&event.target.closest("[data-nav='grinding']");
    if(nav)schedule();
  },true);
  setTimeout(schedule,2600);
  window.__DS_GRINDING_OPERATOR_SESSION_RC={version:VERSION,apply};
})();

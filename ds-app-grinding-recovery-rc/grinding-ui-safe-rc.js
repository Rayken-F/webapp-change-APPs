"use strict";

(function installGrindingUiSafeRc(){
  const VERSION="GRINDING_UI_SAFE_RC_V2_20260820";

  function getGrindingFrame(){
    return document.querySelector("#moduleFrameHost iframe[data-module-key='grinding']");
  }

  function apply(){
    const frame=getGrindingFrame();
    if(!frame)return false;
    let doc;
    try{doc=frame.contentDocument;}catch(_){return false;}
    if(!doc||!doc.head||!doc.body)return false;

    if(!doc.getElementById("dsGrindingUiSafeRcStyle")){
      const style=doc.createElement("style");
      style.id="dsGrindingUiSafeRcStyle";
      style.textContent=`
        #operationInfoCard .row.between{align-items:center;gap:8px;min-width:0}
        #operationInfoCard .row.between>*{min-width:0}
        #apiPill{flex:0 1 auto;max-width:min(48vw,230px);min-width:0;white-space:nowrap!important;overflow:hidden;text-overflow:ellipsis;line-height:1.35;font-size:10px}
        [data-ds-refresh-btn].ds-refresh-running{opacity:.72;pointer-events:none}
        [data-ds-refresh-btn].ds-refresh-done{border-color:rgba(88,214,141,.48);color:#c9ffdb}
        @media(max-width:620px){#apiPill{max-width:46vw;font-size:10px}}
      `;
      doc.head.appendChild(style);
    }

    if(!doc.getElementById("dsGrindingUiSafeRcRuntime")){
      const script=doc.createElement("script");
      script.id="dsGrindingUiSafeRcRuntime";
      script.textContent=`
        (function(){
          if(window.__DS_GRINDING_UI_SAFE_RC_V2)return;
          const compact=v=>{const t=String(v||"");const m=t.match(/V(\\d+)_(\\d+)_(\\d+)/i);return m?('v'+m[1]+'.'+m[2]+'.'+m[3]):'BETA';};
          const pill=document.getElementById('apiPill');
          function compactPill(){
            if(!pill)return;
            const full=String(pill.dataset.fullBuild||pill.title||pill.textContent||BETA_CLIENT_VERSION||'');
            if(full.includes('BETA_GRINDING_WIP_')||String(BETA_CLIENT_VERSION||'').includes('BETA_GRINDING_WIP_')){
              const src=full.includes('BETA_GRINDING_WIP_')?full:String(BETA_CLIENT_VERSION||'');
              pill.dataset.fullBuild=src;
              pill.title=src;
              if(pill.classList.contains('ok'))pill.textContent='已連線｜'+compact(src);
            }
          }

          const originalHealth=typeof checkHealth==='function'?checkHealth:null;
          if(originalHealth){
            checkHealth=async function(){
              const result=await originalHealth.apply(this,arguments);
              compactPill();
              return result;
            };
          }
          compactPill();

          function findRefreshButton(){
            return Array.from(document.querySelectorAll('button')).find(btn=>String(btn.getAttribute('onclick')||'').replace(/\\s/g,'').includes('refreshAll(true)'))||null;
          }
          const originalRefresh=typeof refreshAll==='function'?refreshAll:null;
          if(originalRefresh){
            refreshAll=async function(showMessage){
              const manual=showMessage===true;
              const btn=manual?findRefreshButton():null;
              if(manual&&state&&state.refreshing){
                if(typeof showToast==='function')showToast('Grinding WIP 正在更新，請稍候');
                return;
              }
              let originalText='';
              if(btn){
                originalText=btn.textContent||'重新整理';
                btn.dataset.dsRefreshBtn='1';
                btn.disabled=true;
                btn.classList.add('ds-refresh-running');
                btn.textContent='↻ 更新中…';
                if(typeof showToast==='function')showToast('正在更新 Grinding WIP…');
              }
              try{
                return await originalRefresh.apply(this,arguments);
              }finally{
                if(btn){
                  btn.classList.remove('ds-refresh-running');
                  btn.classList.add('ds-refresh-done');
                  btn.textContent='✓ 已更新';
                  setTimeout(()=>{
                    btn.disabled=false;
                    btn.classList.remove('ds-refresh-done');
                    btn.textContent=originalText||'重新整理';
                  },900);
                }
                compactPill();
              }
            };
          }
          window.__DS_GRINDING_UI_SAFE_RC_V2={version:'${VERSION}',compactPill:compactPill};
        })();
      `;
      doc.body.appendChild(script);
    }
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

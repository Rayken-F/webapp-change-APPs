"use strict";

(function installGrindingUiSafeRc(){
  const VERSION="GRINDING_UI_SAFE_RC_V3_20260820";

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
        #dsWipCurrentCard.ds-wip-collapsed>:not(.ds-wip-head){display:none!important}
        .ds-wip-collapse-btn{min-height:32px;padding:5px 8px;border-radius:10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);font-size:11px;font-weight:900}
        #dsJumpReconcileBtn{position:fixed;right:10px;bottom:16px;z-index:1150;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(17,25,79,.94);border:1px solid rgba(207,216,255,.32);box-shadow:0 10px 26px rgba(2,7,34,.42);font-size:19px;line-height:1;padding:0;opacity:.84}
        #dsJumpReconcileBtn:active{transform:scale(.94)}
        @media(max-width:620px){#apiPill{max-width:46vw;font-size:10px}#dsJumpReconcileBtn{right:8px;bottom:12px;width:36px;height:36px}}
      `;
      doc.head.appendChild(style);
    }

    if(!doc.getElementById("dsGrindingUiSafeRcRuntime")){
      const script=doc.createElement("script");
      script.id="dsGrindingUiSafeRcRuntime";
      script.textContent=`
        (function(){
          if(window.__DS_GRINDING_UI_SAFE_RC_V3)return;
          const compact=v=>{const t=String(v||'');const m=t.match(/V(\\d+)_(\\d+)_(\\d+)/i);return m?('v'+m[1]+'.'+m[2]+'.'+m[3]):'BETA';};
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
            let refreshPromise=null;
            refreshAll=async function(showMessage){
              const manual=showMessage===true;
              const btn=manual?findRefreshButton():null;
              if(refreshPromise){
                if(manual&&typeof showToast==='function')showToast('Grinding WIP 正在更新，請稍候');
                return refreshPromise;
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
              refreshPromise=(async()=>{
                try{return await originalRefresh.apply(this,arguments);}
                finally{
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
                  refreshPromise=null;
                }
              })();
              return refreshPromise;
            };
          }

          function findCardByTitle(text){
            const title=Array.from(document.querySelectorAll('.section-title')).find(el=>String(el.textContent||'').trim()===text);
            return title&&title.closest('.card');
          }

          function installWipCollapse(){
            const card=findCardByTitle('Grinding 目前在製');
            if(!card||card.id==='dsWipCurrentCard')return;
            card.id='dsWipCurrentCard';
            const head=card.querySelector('.row.between');
            if(!head)return;
            head.classList.add('ds-wip-head');
            const count=document.getElementById('wipCountText');
            const btn=document.createElement('button');
            btn.type='button';btn.className='ds-wip-collapse-btn';btn.textContent='收合';
            btn.addEventListener('click',()=>{
              const collapsed=card.classList.toggle('ds-wip-collapsed');
              btn.textContent=collapsed?'展開':'收合';
            });
            if(count&&count.parentNode===head)head.insertBefore(btn,count);else head.appendChild(btn);
          }

          function findReconcileCard(){return findCardByTitle('Grinding 即時對帳');}
          function installJumpButton(){
            if(document.getElementById('dsJumpReconcileBtn'))return;
            const btn=document.createElement('button');
            btn.id='dsJumpReconcileBtn';btn.type='button';btn.textContent='↑';btn.setAttribute('aria-label','回到 Grinding 即時對帳');btn.title='回到 Grinding 即時對帳';
            btn.addEventListener('click',()=>{
              const target=findReconcileCard();
              if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
            });
            document.body.appendChild(btn);
          }

          installWipCollapse();
          installJumpButton();
          window.__DS_GRINDING_UI_SAFE_RC_V3={version:'${VERSION}',compactPill:compactPill,installWipCollapse:installWipCollapse};
        })();
      `;
      doc.body.appendChild(script);
    }
    return true;
  }

  function schedule(){[150,450,900,1600,2600].forEach(ms=>setTimeout(apply,ms));}
  document.addEventListener("click",event=>{
    const nav=event.target.closest&&event.target.closest("[data-nav='grinding']");
    if(nav)schedule();
  },true);
  setTimeout(schedule,3000);
  window.__DS_GRINDING_UI_SAFE_RC={version:VERSION,apply};
})();

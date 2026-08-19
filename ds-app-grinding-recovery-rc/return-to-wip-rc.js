"use strict";

(function installGrindingReturnToWipRc(){
  const VERSION="GRINDING_RETURN_TO_WIP_UI_RC_V1_20260820";

  function injectIntoGrinding(frame){
    if(!frame||String(frame.dataset.moduleKey||"")!=="grinding")return false;
    let doc;
    try{doc=frame.contentDocument;}catch(_){return false;}
    if(!doc||!doc.body)return false;
    if(doc.getElementById("dsGrindingReturnToWipRcScript"))return true;

    const style=doc.createElement("style");
    style.id="dsGrindingReturnToWipRcStyle";
    style.textContent=`
      #dsReturnToWipRcCard{border-color:rgba(88,214,141,.38);background:linear-gradient(180deg,rgba(38,113,105,.24),rgba(32,42,114,.25))}
      #dsReturnToWipRcCard .return-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
      #dsReturnToWipRcCard .return-rc-mark{font-size:10px;font-weight:900;color:#caffdf;border:1px solid rgba(88,214,141,.38);border-radius:999px;padding:4px 7px;background:rgba(88,214,141,.08)}
      #dsReturnToWipRcList{display:grid;gap:8px;margin-top:10px}
      .ds-return-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px;border-radius:14px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.1)}
      .ds-return-row .name{font-weight:900;word-break:break-all}
      .ds-return-row .sub{margin-top:4px;color:var(--sub);font-size:12px;line-height:1.45}
      .ds-return-btn{min-height:36px;padding:7px 10px;border-radius:11px;background:rgba(88,214,141,.15);border:1px solid rgba(88,214,141,.42);color:#d8ffe5;font-size:11px;font-weight:900}
      .ds-return-btn:disabled{opacity:.45}
      #dsReturnToWipRcStatus{display:none;margin-top:9px;padding:9px 10px;border-radius:12px;font-size:12px;font-weight:800;line-height:1.5}
      #dsReturnToWipRcStatus.show{display:block;background:rgba(67,198,232,.10);border:1px solid rgba(67,198,232,.30);color:#d7f8ff}
      #dsReturnToWipRcStatus.bad{background:rgba(255,113,136,.10);border-color:rgba(255,113,136,.35);color:#ffd0d8}
      @media(max-width:620px){.ds-return-row{grid-template-columns:1fr}.ds-return-btn{width:100%}}
    `;
    doc.head.appendChild(style);

    const script=doc.createElement("script");
    script.id="dsGrindingReturnToWipRcScript";
    script.textContent=`
      (function(){
        if(window.__DS_GRINDING_RETURN_TO_WIP_RC)return;
        const VERSION=${JSON.stringify(VERSION)};
        let busy=false;
        const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
        const normalizeLifecycle=v=>String(v||"").trim().toUpperCase();
        const isReturnable=item=>["HT","DCYL"].includes(normalizeLifecycle(item&&item.lifecycleStatus));

        function ensureCard(){
          let card=document.getElementById("dsReturnToWipRcCard");
          if(card)return card;
          const history=document.getElementById("historyList");
          const historyCard=history&&history.closest(".card");
          if(!historyCard||!historyCard.parentNode)return null;
          card=document.createElement("section");
          card.id="dsReturnToWipRcCard";
          card.className="card";
          card.innerHTML='<div class="return-head"><div class="section-title">↩ HT／DCYL 退回 Grinding</div><span class="return-rc-mark">RC｜補償交易</span></div><div class="muted" style="margin-top:6px">只允許目前仍在 HT 或 DCYL 的項目退回；原始交易保留，不直接改 Sheet。</div><div id="dsReturnToWipRcStatus"></div><div id="dsReturnToWipRcList"></div>';
          historyCard.parentNode.insertBefore(card,historyCard);
          return card;
        }

        function setStatus(text,bad){
          const el=document.getElementById("dsReturnToWipRcStatus");
          if(!el)return;
          el.textContent=String(text||"");
          el.className="show"+(bad?" bad":"");
        }

        function itemLabel(item){
          const type=String(item&&item.trackingType||"").toUpperCase();
          return type==="BUNDLE_LOT"?`集束來源 ${item.sourceCtn||item.assetCtn||"-"}`:(item.assetCtn||item.sourceCtn||item.assetKey||"-");
        }

        function currentItems(){
          const list=state&&state.wip&&Array.isArray(state.wip.dispositions)?state.wip.dispositions:[];
          return list.filter(isReturnable);
        }

        function render(){
          const card=ensureCard();
          if(!card)return;
          const host=document.getElementById("dsReturnToWipRcList");
          const items=currentItems();
          if(!host)return;
          host.innerHTML=items.length?items.map((item,index)=>{
            const life=normalizeLifecycle(item.lifecycleStatus);
            const key=String(item.assetKey||"");
            const label=itemLabel(item);
            return '<article class="ds-return-row"><div><div class="name">'+escapeHtml(label)+'</div><div class="sub">目前：'+escapeHtml(life)+'｜'+Number(item.qty||0)+' 支｜RT '+escapeHtml(item.rt||"-")+'</div></div><button class="ds-return-btn" type="button" data-return-index="'+index+'" '+(busy?'disabled':'')+'>↩ 退回 Grinding</button></article>';
          }).join(""):'<div class="empty">目前沒有可從 HT／DCYL 退回的項目。</div>';
        }

        function buildSubmissionId(){
          return 'GRDRET_'+Date.now()+'_'+Math.random().toString(36).slice(2,10).toUpperCase();
        }

        async function resolveAmbiguous(body){
          let sawNotFound=false;
          for(let i=0;i<4;i++){
            try{
              const status=await fetchBetaWipSubmissionStatus(body.submission_id);
              if(status&&status.found){
                const s=String(status.status||"").toLowerCase();
                if(s==="completed")return status.result||status;
                if(s==="failed")throw new Error(status.message||"後端確認退回交易失敗");
              }else if(status&&status.status==="not_found"){
                sawNotFound=true;
              }
            }catch(err){
              if(err&&err.definitive)throw err;
            }
            if(i<3)await sleep(1600);
          }
          if(sawNotFound){
            return betaPostApi("grinding_return",body,60000);
          }
          throw new Error("目前仍無法確認退回交易結果；submission_id 已保留，請勿重複操作。");
        }

        async function submitReturn(index){
          if(busy)return;
          const items=currentItems();
          const item=items[index];
          if(!item)return;
          const lifecycle=normalizeLifecycle(item.lifecycleStatus);
          const action=lifecycle==="DCYL"?"RETURN_FROM_DCYL":"RETURN_FROM_HT";
          const label=itemLabel(item);
          const reason=prompt('請輸入退回 Grinding 原因（必填）', '現場確認需退回 Grinding');
          if(reason===null)return;
          const note=String(reason||"").trim();
          if(!note){showToast("退回原因必填",true);return;}
          if(!confirm('確認將 '+label+'（'+Number(item.qty||0)+' 支）從 '+lifecycle+' 退回 Grinding？\\n\\n原始 '+lifecycle+' 紀錄會保留，系統將新增補償交易。'))return;

          const body={
            submission_id:buildSubmissionId(),
            report_date:state.reportDate,
            operator:state.operator,
            base_revision:Number(state.revision||0),
            action:action,
            items:[{
              asset_key:String(item.assetKey||""),
              qty:Number(item.qty||0),
              expected_version:Number(item.stateVersion||0)
            }],
            note:note
          };

          busy=true;render();
          setStatus('正在送出退回補償交易，請勿重複操作…',false);
          try{
            let result;
            try{
              result=await betaPostApi("grinding_return",body,60000);
            }catch(err){
              if(err&&err.code==="API_ROUTE_NOT_FOUND"){
                throw new Error("後端 Return RC 路由尚未部署；前端 RC 已完成，但目前不會修改正式資料。");
              }
              if(typeof isBetaAmbiguousApiError==="function"&&isBetaAmbiguousApiError(err)){
                setStatus('網路回應不完整，正在用 submission_id 確認退回結果…',false);
                result=await resolveAmbiguous(body);
              }else throw err;
            }
            setStatus((result&&result.message)||"退回 Grinding 完成",false);
            showToast((result&&result.message)||"退回 Grinding 完成");
            await refreshAll(false);
          }catch(err){
            setStatus(err&&err.message||"退回 Grinding 失敗",true);
            showToast(err&&err.message||"退回 Grinding 失敗",true);
          }finally{
            busy=false;render();
          }
        }

        document.addEventListener("click",event=>{
          const btn=event.target.closest&&event.target.closest("[data-return-index]");
          if(!btn)return;
          const index=Number(btn.dataset.returnIndex||0);
          submitReturn(index);
        },true);

        const originalRenderHistory=renderHistory;
        renderHistory=function(){
          originalRenderHistory();
          setTimeout(render,0);
        };
        const originalApplyBootstrap=applyBootstrap;
        applyBootstrap=function(r){
          originalApplyBootstrap(r);
          setTimeout(render,0);
        };

        window.__DS_GRINDING_RETURN_TO_WIP_RC={version:VERSION,render:render};
        setTimeout(render,0);
      })();
    `;
    doc.body.appendChild(script);
    return true;
  }

  function attach(frame){
    if(!frame||String(frame.dataset.moduleKey||"")!=="grinding")return;
    const tryInstall=()=>{
      let count=0;
      const timer=setInterval(()=>{
        count++;
        if(injectIntoGrinding(frame)||count>=100)clearInterval(timer);
      },100);
    };
    frame.addEventListener("load",tryInstall);
    tryInstall();
  }

  const host=document.getElementById("moduleFrameHost");
  if(host){
    host.querySelectorAll("iframe").forEach(attach);
    const observer=new MutationObserver(mutations=>{
      mutations.forEach(m=>m.addedNodes.forEach(node=>{
        if(node&&node.tagName==="IFRAME")attach(node);
      }));
    });
    observer.observe(host,{childList:true});
    window.__DS_GRINDING_RETURN_RC_OBSERVER=observer;
  }

  window.__DS_GRINDING_RETURN_RC={version:VERSION,repatch:()=>{
    const frame=document.querySelector("#moduleFrameHost iframe[data-module-key='grinding']");
    return frame?injectIntoGrinding(frame):false;
  }};
})();

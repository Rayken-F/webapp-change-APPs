"use strict";

(function installGrindingReturnToWipRcV2(){
  const VERSION="GRINDING_RETURN_TO_WIP_UI_RC_V2_20260820";
  // Set only after a separate Apps Script RC deployment is created.
  // Production Grinding reads remain on the formal endpoint; only this new return action uses RC.
  const RETURN_RC_API_URL="";

  function injectIntoGrinding(frame){
    if(!frame||String(frame.dataset.moduleKey||"")!=="grinding")return false;
    let doc;
    try{doc=frame.contentDocument;}catch(_){return false;}
    if(!doc||!doc.body)return false;
    if(doc.getElementById("dsGrindingReturnToWipRcV2Script"))return true;

    const style=doc.createElement("style");
    style.id="dsGrindingReturnToWipRcV2Style";
    style.textContent=`
      #dsReturnToWipRcCard{border-color:rgba(88,214,141,.38);background:linear-gradient(180deg,rgba(38,113,105,.24),rgba(32,42,114,.25))}
      #dsReturnToWipRcCard .return-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
      #dsReturnToWipRcCard .return-rc-mark{font-size:10px;font-weight:900;color:#caffdf;border:1px solid rgba(88,214,141,.38);border-radius:999px;padding:4px 7px;background:rgba(88,214,141,.08)}
      #dsReturnToWipRcList{display:grid;gap:8px;margin-top:10px}
      .ds-return-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px;border-radius:14px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.1)}
      .ds-return-row .name{font-weight:900;word-break:break-all}.ds-return-row .sub{margin-top:4px;color:var(--sub);font-size:12px;line-height:1.45}
      .ds-return-btn{min-height:36px;padding:7px 10px;border-radius:11px;background:rgba(88,214,141,.15);border:1px solid rgba(88,214,141,.42);color:#d8ffe5;font-size:11px;font-weight:900}
      .ds-return-btn:disabled{opacity:.45}
      #dsReturnToWipRcStatus{display:none;margin-top:9px;padding:9px 10px;border-radius:12px;font-size:12px;font-weight:800;line-height:1.5}
      #dsReturnToWipRcStatus.show{display:block;background:rgba(67,198,232,.10);border:1px solid rgba(67,198,232,.30);color:#d7f8ff}
      #dsReturnToWipRcStatus.bad{background:rgba(255,113,136,.10);border-color:rgba(255,113,136,.35);color:#ffd0d8}
      @media(max-width:620px){.ds-return-row{grid-template-columns:1fr}.ds-return-btn{width:100%}}
    `;
    doc.head.appendChild(style);

    const script=doc.createElement("script");
    script.id="dsGrindingReturnToWipRcV2Script";
    script.textContent=`
      (function(){
        if(window.__DS_GRINDING_RETURN_TO_WIP_RC_V2)return;
        const VERSION=${JSON.stringify(VERSION)};
        const RETURN_RC_API_URL=${JSON.stringify(RETURN_RC_API_URL)};
        let busy=false;
        const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
        const upper=v=>String(v||"").trim().toUpperCase();
        const isReturnable=item=>["HT","DCYL"].includes(upper(item&&item.lifecycleStatus));

        function rcConfigured(){return /^https:\\/\\/script\\.google\\.com\\/macros\\/s\\/.+\\/exec$/.test(String(RETURN_RC_API_URL||""));}
        function rcError(message,ambiguous,definitive,code){const e=new Error(message);e.ambiguous=!!ambiguous;e.definitive=!!definitive;e.code=String(code||"");return e;}

        async function rcFetch(url,options,timeoutMs){
          const controller=typeof AbortController==="function"?new AbortController():null;
          const timer=controller?setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs||30000))):0;
          try{return await fetch(url,Object.assign({},options||{},{signal:controller?controller.signal:undefined}));}
          catch(err){
            if(err&&err.name==="AbortError")throw rcError("RC 回應逾時；正在確認 submission_id。",true,false,"NETWORK_TIMEOUT");
            throw rcError("RC 網路連線中斷；正在確認 submission_id。",true,false,"NETWORK_ERROR");
          }finally{if(timer)clearTimeout(timer);}
        }

        async function rcParse(response){
          let text="";
          try{text=await response.text();}catch(_){throw rcError("RC 回應讀取中斷。",true,false,"RESPONSE_READ_FAILED");}
          if(!String(text||"").trim())throw rcError("RC 回應為空白。",true,false,"EMPTY_RESPONSE");
          let data;
          try{data=JSON.parse(text);}catch(_){throw rcError("RC 回應不是有效 JSON。",true,false,"INVALID_JSON_RESPONSE");}
          if(!response.ok||!data||data.ok!==true){throw rcError(data&&data.message||"RC API 失敗",false,true,data&&data.code||("HTTP_"+response.status));}
          return data;
        }

        async function rcPost(api,payload){
          if(!rcConfigured())throw rcError("Return Backend RC 尚未設定；目前只完成前端介面，不會修改正式資料。",false,true,"RC_NOT_CONFIGURED");
          const body=Object.assign({},payload||{},{api:api,token:BETA_API_TOKEN,client_version:BETA_CLIENT_VERSION});
          const response=await rcFetch(RETURN_RC_API_URL,{method:"POST",cache:"no-store",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(body)},60000);
          return rcParse(response);
        }

        async function rcSubmissionStatus(submissionId){
          if(!rcConfigured())throw rcError("Return Backend RC 尚未設定",false,true,"RC_NOT_CONFIGURED");
          const query=new URLSearchParams({api:"wip_submission_status",token:BETA_API_TOKEN,client_version:BETA_CLIENT_VERSION,submission_id:String(submissionId||""),request_nonce:String(Date.now())});
          const response=await rcFetch(RETURN_RC_API_URL+"?"+query.toString(),{method:"GET",cache:"no-store"},12000);
          return rcParse(response);
        }

        function ensureCard(){
          let card=document.getElementById("dsReturnToWipRcCard");if(card)return card;
          const history=document.getElementById("historyList");const historyCard=history&&history.closest(".card");if(!historyCard||!historyCard.parentNode)return null;
          card=document.createElement("section");card.id="dsReturnToWipRcCard";card.className="card";
          card.innerHTML='<div class="return-head"><div class="section-title">↩ HT／DCYL 退回 Grinding</div><span class="return-rc-mark">RC2｜補償交易</span></div><div class="muted" style="margin-top:6px">原始 HT/DCYL 歷史保留；退回時恢復該筆交易離開 Grinding 前的原狀態。</div><div id="dsReturnToWipRcStatus"></div><div id="dsReturnToWipRcList"></div>';
          historyCard.parentNode.insertBefore(card,historyCard);return card;
        }
        function setStatus(text,bad){const el=document.getElementById("dsReturnToWipRcStatus");if(!el)return;el.textContent=String(text||"");el.className="show"+(bad?" bad":"");}
        function itemLabel(item){return String(item&&item.trackingType||"").toUpperCase()==="BUNDLE_LOT"?`集束來源 ${item.sourceCtn||item.assetCtn||"-"}`:(item.assetCtn||item.sourceCtn||item.assetKey||"-");}
        function currentItems(){const list=state&&state.wip&&Array.isArray(state.wip.dispositions)?state.wip.dispositions:[];return list.filter(isReturnable);}

        function render(){
          const card=ensureCard();if(!card)return;
          const host=document.getElementById("dsReturnToWipRcList");const items=currentItems();if(!host)return;
          if(!rcConfigured())setStatus("前端 RC 已完成｜等待獨立 Apps Script Return Backend RC URL；目前按鈕不會寫正式資料。",false);
          host.innerHTML=items.length?items.map((item,index)=>'<article class="ds-return-row"><div><div class="name">'+escapeHtml(itemLabel(item))+'</div><div class="sub">目前：'+escapeHtml(upper(item.lifecycleStatus))+'｜'+Number(item.qty||0)+' 支｜RT '+escapeHtml(item.rt||"-")+'</div></div><button class="ds-return-btn" type="button" data-return-index="'+index+'" '+(busy?'disabled':'')+'>↩ 退回 Grinding</button></article>').join(""):'<div class="empty">目前沒有可從 HT／DCYL 退回的項目。</div>';
        }

        function makeSubmissionId(){return 'GRDRET_'+Date.now()+'_'+Math.random().toString(36).slice(2,10).toUpperCase();}
        async function resolveAmbiguous(body){
          let sawNotFound=false;
          for(let i=0;i<4;i++){
            try{
              const status=await rcSubmissionStatus(body.submission_id);
              if(status&&status.found){const s=String(status.status||"").toLowerCase();if(s==="completed")return status.result||status;if(s==="failed")throw rcError(status.message||"後端確認退回交易失敗",false,true,"BACKEND_FAILED");}
              else if(status&&status.status==="not_found")sawNotFound=true;
            }catch(err){if(err&&err.definitive)throw err;}
            if(i<3)await sleep(1600);
          }
          if(sawNotFound)return rcPost("grinding_return",body);
          throw rcError("目前仍無法確認退回交易結果；submission_id 已保留，請勿重複操作。",true,false,"RETURN_UNKNOWN");
        }

        async function submitReturn(index){
          if(busy)return;const item=currentItems()[index];if(!item)return;
          if(!rcConfigured()){setStatus("Return Backend RC 尚未部署／設定。前端按鈕已就緒，但現在不會修改任何正式資料。",true);return;}
          const lifecycle=upper(item.lifecycleStatus);const action=lifecycle==="DCYL"?"RETURN_FROM_DCYL":"RETURN_FROM_HT";const label=itemLabel(item);
          const reason=prompt('請輸入退回 Grinding 原因（必填）','現場確認需退回 Grinding');if(reason===null)return;const note=String(reason||"").trim();if(!note){showToast("退回原因必填",true);return;}
          if(!confirm('確認將 '+label+'（'+Number(item.qty||0)+' 支）從 '+lifecycle+' 退回 Grinding？\\n\\n系統會保留原始 '+lifecycle+' 交易並新增補償交易。'))return;
          const body={submission_id:makeSubmissionId(),report_date:state.reportDate,operator:state.operator,base_revision:Number(state.revision||0),action:action,items:[{asset_key:String(item.assetKey||""),qty:Number(item.qty||0),expected_version:Number(item.stateVersion||0)}],note:note};
          busy=true;render();setStatus("正在送出退回補償交易，請勿重複操作…",false);
          try{
            let result;
            try{result=await rcPost("grinding_return",body);}catch(err){if(err&&err.ambiguous){setStatus("網路回應不完整，正在用 submission_id 確認退回結果…",false);result=await resolveAmbiguous(body);}else throw err;}
            setStatus(result&&result.message||"退回 Grinding 完成",false);showToast(result&&result.message||"退回 Grinding 完成");await refreshAll(false);
          }catch(err){setStatus(err&&err.message||"退回 Grinding 失敗",true);showToast(err&&err.message||"退回 Grinding 失敗",true);}
          finally{busy=false;render();}
        }

        document.addEventListener("click",event=>{const btn=event.target.closest&&event.target.closest("[data-return-index]");if(btn)submitReturn(Number(btn.dataset.returnIndex||0));},true);
        const originalRenderHistory=renderHistory;renderHistory=function(){originalRenderHistory();setTimeout(render,0);};
        const originalApplyBootstrap=applyBootstrap;applyBootstrap=function(r){originalApplyBootstrap(r);setTimeout(render,0);};
        window.__DS_GRINDING_RETURN_TO_WIP_RC_V2={version:VERSION,backendUrlConfigured:rcConfigured(),render:render};setTimeout(render,0);
      })();
    `;
    doc.body.appendChild(script);return true;
  }

  function attach(frame){
    if(!frame||String(frame.dataset.moduleKey||"")!=="grinding")return;
    const tryInstall=()=>{let count=0;const timer=setInterval(()=>{count++;if(injectIntoGrinding(frame)||count>=100)clearInterval(timer);},100);};
    frame.addEventListener("load",tryInstall);tryInstall();
  }

  const host=document.getElementById("moduleFrameHost");
  if(host){host.querySelectorAll("iframe").forEach(attach);const observer=new MutationObserver(mutations=>{mutations.forEach(m=>m.addedNodes.forEach(node=>{if(node&&node.tagName==="IFRAME")attach(node);}));});observer.observe(host,{childList:true});window.__DS_GRINDING_RETURN_RC_V2_OBSERVER=observer;}
  window.__DS_GRINDING_RETURN_RC_V2={version:VERSION,backendUrlConfigured:!!RETURN_RC_API_URL,repatch:()=>{const frame=document.querySelector("#moduleFrameHost iframe[data-module-key='grinding']");return frame?injectIntoGrinding(frame):false;}};
})();

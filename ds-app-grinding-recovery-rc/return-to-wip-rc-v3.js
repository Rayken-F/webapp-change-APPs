"use strict";

(function installGrindingReturnToWipRcV3(){
  const VERSION="GRINDING_RETURN_TO_WIP_UI_RC_V3_1_20260820";
  const CFG=window.DS_GRINDING_RETURN_RC_CONFIG||{};

  function getFrame(){return document.querySelector("#moduleFrameHost iframe[data-module-key='grinding']");}

  function install(){
    const frame=getFrame();
    if(!frame)return false;
    let doc;
    try{doc=frame.contentDocument;}catch(_){return false;}
    if(!doc||!doc.body)return false;
    if(doc.getElementById("dsGrindingReturnV31Script"))return true;
    if(!doc.getElementById("historyList"))return false;

    const style=doc.createElement("style");
    style.id="dsGrindingReturnV31Style";
    style.textContent=`
      #dsReturnV31Card{border-color:rgba(88,214,141,.38);background:linear-gradient(180deg,rgba(38,113,105,.24),rgba(32,42,114,.25))}
      #dsReturnV31Card .head{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}
      #dsReturnV31List{display:grid;gap:8px;margin-top:10px}
      .ds-ret-row{padding:11px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(255,255,255,.055);display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center}
      .ds-ret-name{font-weight:900;overflow-wrap:anywhere}.ds-ret-sub{margin-top:4px;color:var(--sub);font-size:12px;line-height:1.45}
      .ds-ret-btn{min-height:38px;padding:7px 10px;border-radius:11px;background:rgba(88,214,141,.16);border:1px solid rgba(88,214,141,.42);color:#d8ffe5;font-weight:900}
      .ds-ret-btn:disabled{opacity:.45}
      .ds-ret-status{margin-top:9px;padding:9px 10px;border-radius:12px;background:rgba(67,198,232,.10);border:1px solid rgba(67,198,232,.30);color:#d7f8ff;font-size:12px;line-height:1.5}
      .ds-ret-status.bad{background:rgba(255,113,136,.10);border-color:rgba(255,113,136,.35);color:#ffd0d8}
      @media(max-width:620px){.ds-ret-row{grid-template-columns:1fr}.ds-ret-btn{width:100%}}
    `;
    doc.head.appendChild(style);

    const script=doc.createElement("script");
    script.id="dsGrindingReturnV31Script";
    script.textContent=`
      (function(){
        if(window.__DS_GRINDING_RETURN_TO_WIP_RC_V31)return;
        const VERSION=${JSON.stringify(VERSION)};
        const RETURN_RC_API_URL=${JSON.stringify(String(CFG.API_URL||""))};
        const upper=v=>String(v||"").trim().toUpperCase();
        const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
        const configured=()=>/^https:\\/\\/script\\.google\\.com\\/macros\\/s\\/.+\\/exec$/.test(RETURN_RC_API_URL);
        let busy=false;

        async function parseRc(response){
          let text="";try{text=await response.text();}catch(_){const e=new Error("RC 回應讀取中斷");e.ambiguous=true;throw e;}
          if(!String(text||"").trim()){const e=new Error("RC 回應為空白");e.ambiguous=true;throw e;}
          let data;try{data=JSON.parse(text);}catch(_){const e=new Error("RC 回應不是有效 JSON");e.ambiguous=true;throw e;}
          if(!response.ok||!data||data.ok!==true){const e=new Error(data&&data.message||"RC API 失敗");e.definitive=true;e.code=data&&data.code||"RC_API_FAILED";throw e;}
          return data;
        }
        async function rcPost(api,payload){
          if(!configured())throw new Error("Return Backend RC 尚未部署／設定；目前不會修改資料。");
          const controller=typeof AbortController==="function"?new AbortController():null;const timer=controller?setTimeout(()=>controller.abort(),60000):0;
          try{return await parseRc(await fetch(RETURN_RC_API_URL,{method:"POST",cache:"no-store",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(Object.assign({},payload,{api:api,token:BETA_API_TOKEN,client_version:BETA_CLIENT_VERSION})),signal:controller?controller.signal:undefined}));}
          catch(err){if(err&&err.name==="AbortError"){const e=new Error("RC 退回交易逾時，需確認 submission_id");e.ambiguous=true;throw e;}throw err;}
          finally{if(timer)clearTimeout(timer);}
        }
        async function rcStatus(id){
          const q=new URLSearchParams({api:"wip_submission_status",token:BETA_API_TOKEN,client_version:BETA_CLIENT_VERSION,submission_id:String(id||""),request_nonce:String(Date.now())});
          return parseRc(await fetch(RETURN_RC_API_URL+"?"+q.toString(),{method:"GET",cache:"no-store"}));
        }

        function ensureCard(){
          let card=document.getElementById("dsReturnV31Card");if(card)return card;
          const history=document.getElementById("historyList");const historyCard=history&&history.closest(".card");if(!historyCard||!historyCard.parentNode)return null;
          card=document.createElement("section");card.id="dsReturnV31Card";card.className="card";
          card.innerHTML='<div class="head"><div class="section-title">↩ HT／DCYL 退回 Grinding</div><span class="api-pill">RC3.1｜補償交易</span></div><div class="muted" style="margin-top:6px">原始 HT/DCYL 紀錄保留；退回後恢復離開 Grinding 前的製程狀態。</div><div id="dsReturnV31Status" class="ds-ret-status"></div><div id="dsReturnV31List"></div>';
          historyCard.parentNode.insertBefore(card,historyCard);return card;
        }
        const items=()=>((state&&state.wip&&Array.isArray(state.wip.dispositions))?state.wip.dispositions:[]).filter(x=>["HT","DCYL"].includes(upper(x&&x.lifecycleStatus)));
        const label=item=>upper(item&&item.trackingType)==="BUNDLE_LOT"?('集束來源 '+(item.sourceCtn||item.assetCtn||'-')):(item.assetCtn||item.sourceCtn||item.assetKey||'-');
        function setStatus(text,bad){const el=document.getElementById("dsReturnV31Status");if(el){el.textContent=String(text||"");el.className="ds-ret-status"+(bad?" bad":"");}}
        function render(){
          const card=ensureCard();if(!card)return;
          const host=document.getElementById("dsReturnV31List");if(!host)return;
          setStatus(configured()?"Return Backend RC 已設定，可進行退回測試。":"前端退回功能已完成；等待獨立 Apps Script Return Backend RC URL。",false);
          const list=items();host.innerHTML=list.length?list.map((item,i)=>'<article class="ds-ret-row"><div><div class="ds-ret-name">'+escapeHtml(label(item))+'</div><div class="ds-ret-sub">目前：'+escapeHtml(upper(item.lifecycleStatus))+'｜'+Number(item.qty||0)+' 支｜RT '+escapeHtml(item.rt||'-')+'</div></div><button type="button" class="ds-ret-btn" data-ret-i="'+i+'" '+(busy||!configured()?'disabled':'')+'>↩ 退回 Grinding</button></article>').join(""):'<div class="empty">目前沒有可從 HT／DCYL 退回的項目。</div>';
        }
        async function confirmUnknown(body){
          for(let i=0;i<4;i++){try{const s=await rcStatus(body.submission_id);if(s&&s.found){const st=String(s.status||"").toLowerCase();if(st==="completed")return s.result||s;if(st==="failed")throw new Error(s.message||"後端確認交易失敗");}}catch(err){if(err&&err.definitive)throw err;}if(i<3)await sleep(1500);}throw new Error("仍無法確認退回交易結果；submission_id 已保留，請勿重複操作。");
        }
        async function submit(index){
          if(busy)return;const item=items()[index];if(!item)return;
          if(!configured()){setStatus("Return Backend RC 尚未設定，不會修改資料。",true);return;}
          const life=upper(item.lifecycleStatus);const reason=prompt("請輸入退回 Grinding 原因（必填）","現場確認需退回 Grinding");if(reason===null)return;const note=String(reason||"").trim();if(!note){showToast("退回原因必填",true);return;}
          if(!confirm('確認將 '+label(item)+'（'+Number(item.qty||0)+' 支）從 '+life+' 退回 Grinding？\\n原始 '+life+' 紀錄會保留。'))return;
          const body={submission_id:'GRDRET_'+Date.now()+'_'+Math.random().toString(36).slice(2,10).toUpperCase(),report_date:state.reportDate,operator:state.operator,base_revision:Number(state.revision||0),action:life==="DCYL"?"RETURN_FROM_DCYL":"RETURN_FROM_HT",items:[{asset_key:String(item.assetKey||""),qty:Number(item.qty||0),expected_version:Number(item.stateVersion||0)}],note:note};
          busy=true;render();setStatus("正在送出退回補償交易…",false);
          try{let result;try{result=await rcPost("grinding_return",body);}catch(err){if(err&&err.ambiguous){setStatus("回應不完整，正在用 submission_id 確認…",false);result=await confirmUnknown(body);}else throw err;}setStatus(result&&result.message||"退回 Grinding 完成",false);showToast(result&&result.message||"退回 Grinding 完成");await refreshAll(false);}catch(err){setStatus(err&&err.message||"退回失敗",true);showToast(err&&err.message||"退回失敗",true);}finally{busy=false;render();}
        }
        document.addEventListener("click",event=>{const btn=event.target.closest&&event.target.closest("[data-ret-i]");if(btn)submit(Number(btn.dataset.retI||0));},true);
        const oldHistory=renderHistory;renderHistory=function(){const r=oldHistory.apply(this,arguments);setTimeout(render,0);return r;};
        const oldBootstrap=applyBootstrap;applyBootstrap=function(){const r=oldBootstrap.apply(this,arguments);setTimeout(render,0);return r;};
        window.__DS_GRINDING_RETURN_TO_WIP_RC_V31={version:VERSION,render:render,backendConfigured:configured()};
        render();
      })();
    `;
    doc.body.appendChild(script);
    return true;
  }

  function schedule(){[200,650,1300,2300,3800].forEach(ms=>setTimeout(install,ms));}
  document.addEventListener("click",event=>{const nav=event.target.closest&&event.target.closest("[data-nav='grinding']");if(nav)schedule();},true);
  setTimeout(schedule,3400);
  window.__DS_GRINDING_RETURN_RC_V31={version:VERSION,install};
})();

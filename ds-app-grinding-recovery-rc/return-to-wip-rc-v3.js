"use strict";

(function installGrindingReturnToWipRcV3(){
  const VERSION="GRINDING_RETURN_TO_WIP_UI_RC_V3_20260820";
  const CFG=window.DS_GRINDING_RETURN_RC_CONFIG||{};
  let runtimeAuthPromise=null;

  function getFrame(){return document.querySelector("#moduleFrameHost iframe[data-module-key='grinding']");}
  function upper(v){return String(v||"").trim().toUpperCase();}
  function backendConfigured(){return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(String(CFG.API_URL||""));}
  function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

  async function loadRuntimeAuth(){
    if(runtimeAuthPromise)return runtimeAuthPromise;
    runtimeAuthPromise=fetch("../ds-report-pwa-beta/api.js?return_rc_auth=20260820",{cache:"no-store"})
      .then(r=>r.text())
      .then(text=>{
        const token=(text.match(/const\s+BETA_API_TOKEN\s*=\s*["']([^"']+)["']/)||[])[1]||"";
        const client=(text.match(/const\s+BETA_CLIENT_VERSION\s*=\s*["']([^"']+)["']/)||[])[1]||"";
        if(!token||!client)throw new Error("RC 無法取得 Grinding API 驗證設定");
        return {token,client};
      });
    return runtimeAuthPromise;
  }

  async function parseJson(response){
    let text="";
    try{text=await response.text();}catch(_){const e=new Error("RC 回應讀取中斷");e.ambiguous=true;throw e;}
    if(!String(text||"").trim()){const e=new Error("RC 回應為空白");e.ambiguous=true;throw e;}
    let data;
    try{data=JSON.parse(text);}catch(_){const e=new Error("RC 回應不是有效 JSON");e.ambiguous=true;throw e;}
    if(!response.ok||!data||data.ok!==true){const e=new Error(data&&data.message||"RC API 失敗");e.definitive=true;e.code=data&&data.code||"RC_API_FAILED";throw e;}
    return data;
  }

  async function rcPost(api,payload){
    if(!backendConfigured())throw new Error("Return Backend RC 尚未部署／設定；目前只顯示介面，不會修改資料。");
    const auth=await loadRuntimeAuth();
    const controller=typeof AbortController==="function"?new AbortController():null;
    const timer=controller?setTimeout(()=>controller.abort(),60000):0;
    try{
      const response=await fetch(CFG.API_URL,{method:"POST",cache:"no-store",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(Object.assign({},payload,{api,token:auth.token,client_version:auth.client})),signal:controller?controller.signal:undefined});
      return await parseJson(response);
    }catch(err){if(err&&err.name==="AbortError"){const e=new Error("RC 退回交易逾時，需確認 submission_id");e.ambiguous=true;throw e;}throw err;}
    finally{if(timer)clearTimeout(timer);}
  }

  async function rcStatus(submissionId){
    const auth=await loadRuntimeAuth();
    const q=new URLSearchParams({api:"wip_submission_status",token:auth.token,client_version:auth.client,submission_id:String(submissionId||""),request_nonce:String(Date.now())});
    const response=await fetch(CFG.API_URL+"?"+q.toString(),{method:"GET",cache:"no-store"});
    return parseJson(response);
  }

  function install(){
    const frame=getFrame();
    if(!frame)return false;
    let w,doc;
    try{w=frame.contentWindow;doc=frame.contentDocument;}catch(_){return false;}
    if(!w||!doc||!doc.body||!w.state)return false;
    if(w.__DS_GRINDING_RETURN_TO_WIP_RC_V3)return true;

    const history=doc.getElementById("historyList");
    const historyCard=history&&history.closest(".card");
    if(!historyCard||!historyCard.parentNode)return false;

    const style=doc.createElement("style");
    style.id="dsGrindingReturnV3Style";
    style.textContent=`
      #dsReturnV3Card{border-color:rgba(88,214,141,.38);background:linear-gradient(180deg,rgba(38,113,105,.24),rgba(32,42,114,.25))}
      #dsReturnV3Card .head{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}
      #dsReturnV3List{display:grid;gap:8px;margin-top:10px}
      .ds-ret-row{padding:11px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(255,255,255,.055);display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center}
      .ds-ret-name{font-weight:900;overflow-wrap:anywhere}.ds-ret-sub{margin-top:4px;color:var(--sub);font-size:12px}
      .ds-ret-btn{min-height:38px;padding:7px 10px;border-radius:11px;background:rgba(88,214,141,.16);border:1px solid rgba(88,214,141,.42);color:#d8ffe5;font-weight:900}
      .ds-ret-status{margin-top:9px;padding:9px 10px;border-radius:12px;background:rgba(67,198,232,.10);border:1px solid rgba(67,198,232,.30);color:#d7f8ff;font-size:12px;line-height:1.5}
      .ds-ret-status.bad{background:rgba(255,113,136,.10);border-color:rgba(255,113,136,.35);color:#ffd0d8}
      @media(max-width:620px){.ds-ret-row{grid-template-columns:1fr}.ds-ret-btn{width:100%}}
    `;
    doc.head.appendChild(style);

    const card=doc.createElement("section");
    card.id="dsReturnV3Card";card.className="card";
    card.innerHTML='<div class="head"><div class="section-title">↩ HT／DCYL 退回 Grinding</div><span class="api-pill">RC3｜補償交易</span></div><div class="muted" style="margin-top:6px">原始 HT/DCYL 紀錄保留；退回時恢復離開 Grinding 前的製程狀態。</div><div id="dsReturnV3Status" class="ds-ret-status"></div><div id="dsReturnV3List"></div>';
    historyCard.parentNode.insertBefore(card,historyCard);

    let busy=false;
    const getItems=()=>((w.state&&w.state.wip&&Array.isArray(w.state.wip.dispositions))?w.state.wip.dispositions:[]).filter(x=>["HT","DCYL"].includes(upper(x&&x.lifecycleStatus)));
    const label=item=>upper(item&&item.trackingType)==="BUNDLE_LOT"?`集束來源 ${item.sourceCtn||item.assetCtn||"-"}`:(item.assetCtn||item.sourceCtn||item.assetKey||"-");
    const statusEl=()=>doc.getElementById("dsReturnV3Status");
    const listEl=()=>doc.getElementById("dsReturnV3List");
    const setStatus=(text,bad)=>{const el=statusEl();if(el){el.textContent=text;el.className="ds-ret-status"+(bad?" bad":"");}};

    function render(){
      const host=listEl();if(!host)return;
      const items=getItems();
      setStatus(backendConfigured()?"Return Backend RC 已設定，可進行測試交易。":"前端退回功能已完成；等待獨立 Apps Script Return Backend RC URL。",false);
      host.innerHTML=items.length?items.map((item,i)=>`<article class="ds-ret-row"><div><div class="ds-ret-name">${w.escapeHtml(label(item))}</div><div class="ds-ret-sub">目前：${w.escapeHtml(upper(item.lifecycleStatus))}｜${Number(item.qty||0)} 支｜RT ${w.escapeHtml(item.rt||"-")}</div></div><button type="button" class="ds-ret-btn" data-ret-i="${i}" ${busy||!backendConfigured()?"disabled":""}>↩ 退回 Grinding</button></article>`).join(""):'<div class="empty">目前沒有可從 HT／DCYL 退回的項目。</div>';
    }

    async function confirmUnknown(body){
      for(let i=0;i<4;i++){
        try{const s=await rcStatus(body.submission_id);if(s&&s.found){const st=String(s.status||"").toLowerCase();if(st==="completed")return s.result||s;if(st==="failed")throw new Error(s.message||"後端確認交易失敗");}}catch(err){if(err&&err.definitive)throw err;}
        if(i<3)await sleep(1500);
      }
      throw new Error("仍無法確認退回交易結果；submission_id 已保留，請勿重複操作。");
    }

    async function submit(index){
      if(busy)return;
      const item=getItems()[index];if(!item)return;
      if(!backendConfigured()){setStatus("Return Backend RC 尚未設定，不會修改資料。",true);return;}
      const life=upper(item.lifecycleStatus);
      const reason=prompt("請輸入退回 Grinding 原因（必填）","現場確認需退回 Grinding");
      if(reason===null)return;
      const note=String(reason||"").trim();if(!note){w.showToast("退回原因必填",true);return;}
      if(!confirm(`確認將 ${label(item)}（${Number(item.qty||0)} 支）從 ${life} 退回 Grinding？\n原始 ${life} 紀錄會保留。`))return;
      const body={submission_id:"GRDRET_"+Date.now()+"_"+Math.random().toString(36).slice(2,10).toUpperCase(),report_date:w.state.reportDate,operator:w.state.operator,base_revision:Number(w.state.revision||0),action:life==="DCYL"?"RETURN_FROM_DCYL":"RETURN_FROM_HT",items:[{asset_key:String(item.assetKey||""),qty:Number(item.qty||0),expected_version:Number(item.stateVersion||0)}],note};
      busy=true;render();setStatus("正在送出退回補償交易…",false);
      try{let result;try{result=await rcPost("grinding_return",body);}catch(err){if(err&&err.ambiguous){setStatus("回應不完整，正在用 submission_id 確認…",false);result=await confirmUnknown(body);}else throw err;}setStatus(result&&result.message||"退回 Grinding 完成",false);w.showToast(result&&result.message||"退回 Grinding 完成");await w.refreshAll(false);}catch(err){setStatus(err&&err.message||"退回失敗",true);w.showToast(err&&err.message||"退回失敗",true);}finally{busy=false;render();}
    }

    card.addEventListener("click",event=>{const btn=event.target.closest&&event.target.closest("[data-ret-i]");if(btn)submit(Number(btn.dataset.retI||0));});

    if(typeof w.renderHistory==="function"){const original=w.renderHistory;w.renderHistory=function(){const r=original.apply(w,arguments);setTimeout(render,0);return r;};}
    if(typeof w.applyBootstrap==="function"){const original=w.applyBootstrap;w.applyBootstrap=function(){const r=original.apply(w,arguments);setTimeout(render,0);return r;};}
    w.__DS_GRINDING_RETURN_TO_WIP_RC_V3={version:VERSION,render,backendConfigured:backendConfigured()};
    render();
    return true;
  }

  function schedule(){[150,500,1000,1800,3000].forEach(ms=>setTimeout(install,ms));}
  document.addEventListener("click",event=>{const nav=event.target.closest&&event.target.closest("[data-nav='grinding']");if(nav)schedule();},true);
  setTimeout(schedule,3200);
  window.__DS_GRINDING_RETURN_RC_V3={version:VERSION,install,backendConfigured};
})();

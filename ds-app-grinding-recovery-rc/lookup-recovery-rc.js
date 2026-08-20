"use strict";

(function installGrindingLookupRecoveryRc(){
  const VERSION="GRINDING_LOOKUP_RECOVERY_RC_V3_20260820";
  const badge=document.getElementById("grindingRecoveryBadge");
  const stats={batches:0,retries:0,recovered:0,failed:0,lastError:"",faultsInjected:0};
  const fault={remaining:0,armedMode:""};
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function setBadge(text,kind){
    if(!badge)return;
    badge.textContent=text;
    badge.className="grinding-recovery-badge"+(kind?" "+kind:"");
  }

  function injectControlPanel(){
    if(document.getElementById("grindingRecoveryFaultPanel"))return;
    const style=document.createElement("style");
    style.textContent=`
      #grindingRecoveryFaultPanel{position:fixed;z-index:99991;right:12px;top:calc(env(safe-area-inset-top,0px) + 82px);display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;max-width:min(420px,calc(100vw - 24px));padding:7px;border-radius:14px;background:rgba(7,17,43,.94);border:1px solid rgba(255,202,100,.34);box-shadow:0 8px 24px rgba(0,0,0,.28)}
      #grindingRecoveryFaultPanel button{min-height:32px;padding:6px 9px;border:1px solid rgba(255,255,255,.15);border-radius:10px;background:rgba(255,255,255,.08);color:#fff;font-size:11px;font-weight:900;cursor:pointer}
      #grindingRecoveryFaultPanel button[data-fault]{border-color:rgba(255,202,100,.42);color:#ffe4a3}
      #grindingRecoveryFaultPanel .fault-state{width:100%;color:#b9c8f6;font-size:10px;font-weight:800;text-align:right;padding:0 2px 1px}
      @media(max-width:620px){#grindingRecoveryFaultPanel{top:calc(env(safe-area-inset-top,0px) + 78px);left:10px;right:10px;max-width:none;justify-content:center}.grinding-recovery-badge{max-width:calc(100vw - 24px)}}
    `;
    document.head.appendChild(style);

    const panel=document.createElement("div");
    panel.id="grindingRecoveryFaultPanel";
    panel.innerHTML=`
      <button type="button" data-fault="1">🧪 模擬 1 次 JSON 中斷</button>
      <button type="button" data-fault="2">🧪 模擬連續 2 次</button>
      <button type="button" data-cancel="1">取消模擬</button>
      <div class="fault-state" id="grindingRecoveryFaultState">故障模擬：關閉</div>
    `;
    document.body.appendChild(panel);

    panel.addEventListener("click",event=>{
      const btn=event.target.closest("button");
      if(!btn)return;
      if(btn.dataset.cancel){
        fault.remaining=0;
        fault.armedMode="";
        updateFaultState();
        setBadge(`Grinding Recovery RC 已啟用｜故障模擬已取消`);
        return;
      }
      const count=Number(btn.dataset.fault||0);
      if(count>0){
        fault.remaining=count;
        fault.armedMode=`INVALID_JSON_X${count}`;
        updateFaultState();
        setBadge(`🧪 已排程 ${count} 次 JSON 中斷｜下一批辨識開始生效`,"wait");
      }
    });
  }

  function updateFaultState(){
    const el=document.getElementById("grindingRecoveryFaultState");
    if(!el)return;
    el.textContent=fault.remaining>0
      ? `故障模擬：已排程 ${fault.remaining} 次 INVALID_JSON_RESPONSE`
      : `故障模擬：關閉｜已注入 ${stats.faultsInjected} 次`;
  }

  function retryable(err,w){
    if(!err)return false;
    try{
      if(typeof w.isBetaAmbiguousApiError==="function"&&w.isBetaAmbiguousApiError(err))return true;
    }catch(_){ }
    return ["NETWORK_TIMEOUT","NETWORK_ERROR","RESPONSE_READ_FAILED","EMPTY_RESPONSE","INVALID_JSON_RESPONSE"].includes(String(err.code||""));
  }

  function makeInjectedJsonError(){
    const err=new Error("RC 人工注入：模擬 Apps Script 回應不是有效 JSON");
    err.code="INVALID_JSON_RESPONSE";
    err.ambiguous=true;
    err.definitive=false;
    err.rcInjected=true;
    return err;
  }

  function maybeInjectFault(){
    if(fault.remaining<=0)return;
    fault.remaining--;
    stats.faultsInjected++;
    updateFaultState();
    setBadge(`🧪 人工 JSON 中斷已觸發｜剩餘 ${fault.remaining} 次`,"wait");
    throw makeInjectedJsonError();
  }

  function patchGrindingFrame(frame){
    if(!frame||String(frame.dataset.moduleKey||"")!=="grinding")return false;
    let w;
    try{w=frame.contentWindow;}catch(_){return false;}
    if(!w||typeof w.fetchBetaWipLookupBatch!=="function")return false;
    if(w.__DS_LOOKUP_RECOVERY_RC_V3_INSTALLED){
      setBadge(`Grinding Recovery RC 已啟用｜批次 ${stats.batches}｜恢復 ${stats.recovered}`);
      return true;
    }

    const original=w.fetchBetaWipLookupBatch;

    async function patchedFetchBetaWipLookupBatch(ctns){
      stats.batches++;
      const count=Array.isArray(ctns)?ctns.length:0;
      const retryDelays=[0,850,1800];
      let lastErr=null;

      for(let attempt=0;attempt<retryDelays.length;attempt++){
        if(attempt===0){
          setBadge(`RC 已啟用｜辨識中 ${count} 筆`);
        }else{
          stats.retries++;
          setBadge(`回應待確認｜${count} 筆｜自動重試 ${attempt}/2`,"wait");
          await sleep(retryDelays[attempt]);
        }

        try{
          maybeInjectFault();
          const result=await original.call(w,ctns);
          if(attempt>0)stats.recovered++;
          setBadge(attempt>0
            ? `✅ 已恢復｜${count} 筆辨識完成｜重試 ${attempt} 次`
            : `✅ RC 已啟用｜${count} 筆辨識完成`);
          setTimeout(()=>setBadge(`Grinding Recovery RC 已啟用｜批次 ${stats.batches}｜重試 ${stats.retries}｜恢復 ${stats.recovered}｜注入 ${stats.faultsInjected}`),1600);
          return result;
        }catch(err){
          lastErr=err;
          stats.lastError=String(err&&err.code||err&&err.message||err||"");
          if(!retryable(err,w)){
            setBadge(`後端明確回應｜不重試｜${String(err&&err.message||"業務錯誤").slice(0,46)}`,"bad");
            throw err;
          }
          if(attempt===retryDelays.length-1)break;
        }
      }

      stats.failed++;
      setBadge("傳輸仍不穩｜已自動重試 2 次｜可按重新辨識","bad");
      if(lastErr){
        try{lastErr.message="辨識回應連續不完整；已自動重試 2 次。這是傳輸異常，不代表 CTN 資料錯誤，請稍後按『重新辨識』。";}catch(_){ }
        throw lastErr;
      }
      throw new Error("Grinding lookup transport failed after recovery retries");
    }

    w.fetchBetaWipLookupBatch=patchedFetchBetaWipLookupBatch;
    w.__DS_LOOKUP_RECOVERY_RC_V3_INSTALLED=true;
    w.__DS_LOOKUP_RECOVERY_RC_V3={version:VERSION,stats:stats,fault:fault};

    if(w.fetchBetaWipLookupBatch!==patchedFetchBetaWipLookupBatch){
      setBadge("RC 注入驗證失敗｜請勿測試","bad");
      return false;
    }

    setBadge(`Grinding Recovery RC 已啟用｜${VERSION}`);
    return true;
  }

  function attachFrame(frame){
    if(!frame||String(frame.dataset.moduleKey||"")!=="grinding")return;
    const tryPatch=()=>{
      let attempts=0;
      const timer=setInterval(()=>{
        attempts++;
        if(patchGrindingFrame(frame)||attempts>=100){
          clearInterval(timer);
          if(attempts>=100){
            let ok=false;
            try{ok=!!frame.contentWindow.__DS_LOOKUP_RECOVERY_RC_V3_INSTALLED;}catch(_){ }
            if(!ok)setBadge("Grinding Recovery RC 注入失敗｜請重整 RC","bad");
          }
        }
      },100);
    };
    frame.addEventListener("load",tryPatch);
    tryPatch();
  }

  const host=document.getElementById("moduleFrameHost");
  if(host){
    host.querySelectorAll("iframe").forEach(attachFrame);
    const observer=new MutationObserver(mutations=>{
      mutations.forEach(m=>m.addedNodes.forEach(node=>{
        if(node&&node.tagName==="IFRAME")attachFrame(node);
      }));
    });
    observer.observe(host,{childList:true});
    window.__DS_GRINDING_RECOVERY_RC_OBSERVER=observer;
  }

  document.addEventListener("click",event=>{
    const nav=event.target.closest&&event.target.closest("[data-nav='grinding']");
    if(!nav)return;
    setTimeout(()=>{
      const frame=document.querySelector("#moduleFrameHost iframe[data-module-key='grinding']");
      if(frame)patchGrindingFrame(frame);
    },350);
  },true);

  injectControlPanel();
  updateFaultState();
  setBadge(`Grinding Recovery RC Shell｜${VERSION}`);
  window.__DS_GRINDING_RECOVERY_RC={version:VERSION,stats:stats,fault:fault,repatch:()=>{
    const frame=document.querySelector("#moduleFrameHost iframe[data-module-key='grinding']");
    return frame?patchGrindingFrame(frame):false;
  }};
})();

(function loadGrindingRcExtensions(){
  function load(src,next){
    const s=document.createElement("script");
    s.src=src;
    s.onload=()=>{if(next)next();};
    s.onerror=()=>console.warn("Grinding RC extension load failed",src);
    document.head.appendChild(s);
  }
  load("./return-rc-config.js?v=20260820-2",()=>{
    load("./grinding-ui-safe-rc.js?v=20260820-2");
    load("./return-to-wip-rc-v3.js?v=20260820-4");
  });
})();

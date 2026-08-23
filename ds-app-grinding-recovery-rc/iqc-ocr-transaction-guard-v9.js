"use strict";
(function installIqcOcrTransactionGuardV10(){
  const VERSION="IQC_OCR_TRANSACTION_GUARD_V10_20260823";
  if(window.__DS_IQC_OCR_TX_GUARD_V10)return;
  let ingestBusy=false;
  let ingestStartedAt=0;
  let ocrBusy=false;
  let ocrStartedAt=0;
  let settleUntil=0;
  let expectedPhotoCount=0;
  let lastObservedCount=0;
  let stableTicks=0;
  let noticeTimer=0;
  let taskTicker=0;

  function panel(){return document.getElementById("iqcImageRc");}
  function photoCount(){return document.querySelectorAll("#iqcRcPhotoList .iqc-photo").length;}
  function analyzeBtn(){return document.getElementById("iqcRcAnalyze");}
  function progressText(){return String(document.getElementById("iqcRcProgressText")?.textContent||"");}
  function badgeText(){return String(document.getElementById("iqcRcOcrBadge")?.textContent||"");}
  function terminalFailure(){return /辨識失敗|初始化失敗|超過\s*\d+\s*秒|本次任務已停止/.test(progressText())||/失敗/.test(badgeText());}
  function terminalSuccess(){return /完成：|Honeywell 影像辨識完成|已完成多輪 OCR/.test(progressText());}
  function baseLooksBusy(){
    if(terminalFailure()||terminalSuccess())return false;
    const btn=analyzeBtn();
    if(btn&&btn.disabled)return true;
    if(/第\s*\d+\/\d+\s*張.*辨識中|^OCR\s+.*\d+%|Worker 初始化中|本機 OCR Worker 初始化中/.test(progressText()))return true;
    return Array.from(document.querySelectorAll("#iqcRcPhotoList .iqc-photo .meta small")).some(el=>/辨識中/.test(String(el.textContent||"")));
  }
  function locked(){return ingestBusy||ocrBusy||baseLooksBusy()||Date.now()<settleUntil;}
  function ensureNotice(){
    if(!panel()||document.getElementById("iqcRcTxGuardNotice"))return;
    const card=document.querySelector("#iqcRcAnalyze")?.closest(".iqc-rc-card");if(!card)return;
    const div=document.createElement("div");div.id="iqcRcTxGuardNotice";div.className="iqc-issue";div.style.display="none";div.style.marginTop="10px";card.appendChild(div);
  }
  function showNotice(text,bad=false,persist=false){
    ensureNotice();const el=document.getElementById("iqcRcTxGuardNotice");if(!el)return;
    el.textContent=text;el.className=`iqc-issue ${bad?"bad":""}`;el.style.display="block";
    clearTimeout(noticeTimer);if(!persist)noticeTimer=setTimeout(()=>{el.style.display="none";},4200);
  }
  function lockControls(){
    const busy=locked();const btn=analyzeBtn();
    if(btn){btn.setAttribute("aria-disabled",busy?"true":"false");btn.style.opacity=busy?".58":"";}
    ["iqcRcCameraBtn","iqcRcGalleryBtn","iqcRcNewBatch"].forEach(id=>{const el=document.getElementById(id);if(el)el.style.opacity=busy?".58":"";});
  }
  function beginSettle(ms,msg){ingestBusy=true;ingestStartedAt=Date.now();settleUntil=Math.max(settleUntil,Date.now()+ms);stableTicks=0;lastObservedCount=photoCount();if(msg)showNotice(msg,false);lockControls();}
  function finishIngest(message,bad=false){ingestBusy=false;ingestStartedAt=0;expectedPhotoCount=0;stableTicks=0;showNotice(message,bad);lockControls();}
  function pollIngest(){
    if(!ingestBusy)return;
    const count=photoCount();if(count===lastObservedCount)stableTicks++;else{stableTicks=0;lastObservedCount=count;}
    const enough=expectedPhotoCount<=0||count>=expectedPhotoCount;
    if(enough&&stableTicks>=3&&Date.now()>=settleUntil){finishIngest("照片已完成本機整理，可以開始辨識。",false);return;}
    if(ingestStartedAt&&Date.now()-ingestStartedAt>12000){finishIngest(`照片整理超過 12 秒，已停止等待。目前可見 ${count} 張；請確認照片數量後再辨識。`,true);return;}
    setTimeout(pollIngest,180);
  }
  function stopTaskTicker(){clearInterval(taskTicker);taskTicker=0;}
  function startTaskTicker(){
    stopTaskTicker();ocrStartedAt=Date.now();
    taskTicker=setInterval(()=>{
      if(!ocrBusy){stopTaskTicker();return;}
      const sec=Math.floor((Date.now()-ocrStartedAt)/1000);
      if(!terminalFailure())showNotice(`本機 OCR 執行中 ${sec} 秒。照片與批次已鎖定；若 Worker 初始化超時會自動取消，不會無限等待。`,false,true);
    },1000);
  }
  function finishOcr(ok,message){
    ocrBusy=false;ocrStartedAt=0;stopTaskTicker();settleUntil=Date.now()+500;
    document.querySelectorAll("#iqcRcPhotoList .iqc-photo .meta small").forEach(el=>{if(/辨識中/.test(el.textContent||""))el.innerHTML=el.innerHTML.replace(/辨識中/g,ok?"整理中":"待重試");});
    showNotice(message,!ok,true);setTimeout(lockControls,550);
  }
  function deny(reason){showNotice(reason,true);lockControls();}

  document.addEventListener("change",e=>{
    const el=e.target;
    if(!(el instanceof HTMLInputElement)||!["iqcRcCameraInput","iqcRcGalleryInput"].includes(el.id))return;
    if(ocrBusy||baseLooksBusy()){
      e.preventDefault();e.stopImmediatePropagation();try{el.value="";}catch(_){}
      deny("上一個辨識任務尚未完成，這次照片加入已取消，避免同批任務重疊。");return;
    }
    const add=Number(el.files?.length||0);expectedPhotoCount=photoCount()+add;beginSettle(850,"照片正在壓縮並寫入本機，完成前暫停辨識。");setTimeout(pollIngest,120);
  },true);

  document.addEventListener("click",e=>{
    const target=e.target.closest&&e.target.closest("#iqcRcAnalyze,[data-photo-delete],#iqcRcNewBatch,#iqcRcCameraBtn,#iqcRcGalleryBtn");if(!target)return;
    if(target.id==="iqcRcAnalyze"){
      if(locked()){
        e.preventDefault();e.stopImmediatePropagation();
        deny(baseLooksBusy()||ocrBusy?"上一個辨識任務仍在執行，這次辨識請求已取消。":"照片資料還在整理，這次辨識請求已取消，請等提示後再按。");return;
      }
      ocrBusy=true;startTaskTicker();showNotice("本機 OCR 已啟動。本批完成前會鎖住刪除、重選與重複辨識。",false,true);lockControls();return;
    }
    if(ocrBusy||baseLooksBusy()){
      e.preventDefault();e.stopImmediatePropagation();deny("辨識尚未完成，這次操作已取消；請勿刪除或重選照片，以免同批資料互相覆寫。");return;
    }
    if(target.matches("[data-photo-delete]")){expectedPhotoCount=Math.max(0,photoCount()-1);beginSettle(700,"正在移除照片並重建批次，完成前暫停辨識。");setTimeout(pollIngest,120);}
    if(target.id==="iqcRcNewBatch"){expectedPhotoCount=0;beginSettle(700,"正在建立新批次，完成前暫停辨識。");setTimeout(pollIngest,120);}
  },true);

  function reconcileTaskState(){
    ensureNotice();
    if(ocrBusy&&terminalFailure()){
      finishOcr(false,"本機 OCR 本次執行失敗，任務已停止並解鎖。照片仍保留，可直接再次按「開始辨識」。");return;
    }
    if(ocrBusy&&terminalSuccess()){
      finishOcr(true,"本機 OCR 已完成，批次已解鎖，可繼續複查、刪除或重新辨識。");return;
    }
    lockControls();
  }
  const observer=new MutationObserver(()=>{clearTimeout(observer.t);observer.t=setTimeout(reconcileTaskState,60);});
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["disabled","class"]});
  setInterval(reconcileTaskState,350);
  window.__DS_IQC_OCR_TX_GUARD_V10={version:VERSION,isLocked:locked};
})();

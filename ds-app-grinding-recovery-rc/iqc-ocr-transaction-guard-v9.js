"use strict";
(function installIqcOcrTransactionGuardV9(){
  const VERSION="IQC_OCR_TRANSACTION_GUARD_V9_1_20260823";
  if(window.__DS_IQC_OCR_TX_GUARD_V9)return;
  let ingestBusy=false;
  let ingestStartedAt=0;
  let ocrBusy=false;
  let settleUntil=0;
  let expectedPhotoCount=0;
  let lastObservedCount=0;
  let stableTicks=0;
  let noticeTimer=0;

  function panel(){return document.getElementById("iqcImageRc");}
  function photoCount(){return document.querySelectorAll("#iqcRcPhotoList .iqc-photo").length;}
  function analyzeBtn(){return document.getElementById("iqcRcAnalyze");}
  function progressText(){return String(document.getElementById("iqcRcProgressText")?.textContent||"");}
  function baseLooksBusy(){
    const btn=analyzeBtn();
    if(btn&&btn.disabled)return true;
    if(/第\s*\d+\/\d+\s*張.*辨識中|^OCR\s+.*\d+%/.test(progressText()))return true;
    return Array.from(document.querySelectorAll("#iqcRcPhotoList .iqc-photo .meta small")).some(el=>/辨識中/.test(String(el.textContent||"")));
  }
  function locked(){return ingestBusy||ocrBusy||baseLooksBusy()||Date.now()<settleUntil;}
  function ensureNotice(){
    const p=panel();if(!p||document.getElementById("iqcRcTxGuardNotice"))return;
    const card=document.querySelector("#iqcRcAnalyze")?.closest(".iqc-rc-card");if(!card)return;
    const div=document.createElement("div");div.id="iqcRcTxGuardNotice";div.className="iqc-issue";div.style.display="none";div.style.marginTop="10px";card.appendChild(div);
  }
  function showNotice(text,bad=false){
    ensureNotice();const el=document.getElementById("iqcRcTxGuardNotice");if(!el)return;
    el.textContent=text;el.className=`iqc-issue ${bad?"bad":""}`;el.style.display="block";
    clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{el.style.display="none";},3600);
  }
  function lockControls(){
    const busy=locked();const btn=analyzeBtn();if(btn)btn.setAttribute("aria-disabled",busy?"true":"false");
    ["iqcRcCameraBtn","iqcRcGalleryBtn","iqcRcNewBatch"].forEach(id=>{const el=document.getElementById(id);if(el)el.style.opacity=busy?".58":"";});
  }
  function beginSettle(ms,msg){
    ingestBusy=true;ingestStartedAt=Date.now();settleUntil=Math.max(settleUntil,Date.now()+ms);stableTicks=0;lastObservedCount=photoCount();
    if(msg)showNotice(msg,false);lockControls();
  }
  function finishIngest(message,bad=false){
    ingestBusy=false;ingestStartedAt=0;expectedPhotoCount=0;stableTicks=0;showNotice(message,bad);lockControls();
  }
  function pollIngest(){
    if(!ingestBusy)return;
    const count=photoCount();
    if(count===lastObservedCount)stableTicks++;else{stableTicks=0;lastObservedCount=count;}
    const enough=expectedPhotoCount<=0||count>=expectedPhotoCount;
    if(enough&&stableTicks>=3&&Date.now()>=settleUntil){
      finishIngest("照片已完成本機整理，可以開始辨識。",false);return;
    }
    if(ingestStartedAt&&Date.now()-ingestStartedAt>12000){
      finishIngest(`照片整理超過 12 秒，已停止等待。目前可見 ${count} 張；請確認照片數量後再辨識。`,true);return;
    }
    setTimeout(pollIngest,180);
  }
  function deny(reason){showNotice(reason,true);lockControls();}

  document.addEventListener("change",e=>{
    const el=e.target;
    if(!(el instanceof HTMLInputElement)||!['iqcRcCameraInput','iqcRcGalleryInput'].includes(el.id))return;
    if(ocrBusy||baseLooksBusy()){
      e.preventDefault();e.stopImmediatePropagation();try{el.value="";}catch(_){}
      deny("上一個辨識任務尚未完成，這次照片加入已取消，避免同批任務重疊。");return;
    }
    const add=Number(el.files?.length||0);expectedPhotoCount=photoCount()+add;beginSettle(850,"照片正在壓縮並寫入本機，完成前暫停辨識。");setTimeout(pollIngest,120);
  },true);

  document.addEventListener("click",e=>{
    const target=e.target.closest&&e.target.closest("#iqcRcAnalyze,[data-photo-delete],#iqcRcNewBatch,#iqcRcCameraBtn,#iqcRcGalleryBtn");
    if(!target)return;
    if(target.id==="iqcRcAnalyze"){
      if(locked()){
        e.preventDefault();e.stopImmediatePropagation();
        deny(baseLooksBusy()||ocrBusy?"上一個辨識任務仍在執行，這次辨識請求已取消。":"照片資料還在整理，這次辨識請求已取消，請等提示後再按。");return;
      }
      ocrBusy=true;showNotice("辨識已送出，本批完成前會鎖住刪除、重選與重複辨識。",false);lockControls();
      return;
    }
    if(ocrBusy||baseLooksBusy()){
      e.preventDefault();e.stopImmediatePropagation();
      deny("辨識尚未完成，這次操作已取消；請勿刪除或重選照片，以免同批資料互相覆寫。");return;
    }
    if(target.matches("[data-photo-delete]")){
      expectedPhotoCount=Math.max(0,photoCount()-1);beginSettle(700,"正在移除照片並重建批次，完成前暫停辨識。");setTimeout(pollIngest,120);
    }
    if(target.id==="iqcRcNewBatch"){
      expectedPhotoCount=0;beginSettle(700,"正在建立新批次，完成前暫停辨識。");setTimeout(pollIngest,120);
    }
  },true);

  const observer=new MutationObserver(()=>{
    ensureNotice();
    const btn=analyzeBtn();
    if(ocrBusy&&btn&&!btn.disabled&&!baseLooksBusy()&&/完成|辨識失敗/.test(progressText())){
      ocrBusy=false;settleUntil=Date.now()+650;
      showNotice("上一個辨識任務已結束；正在完成最後整理，稍後即可再次操作。",false);
      setTimeout(lockControls,700);
    }
    lockControls();
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["disabled","class"]});
  setInterval(()=>{if(ocrBusy&&!baseLooksBusy()&&/完成|辨識失敗/.test(progressText())){ocrBusy=false;settleUntil=Date.now()+650;}lockControls();},350);
  window.__DS_IQC_OCR_TX_GUARD_V9={version:VERSION,isLocked:locked};
})();

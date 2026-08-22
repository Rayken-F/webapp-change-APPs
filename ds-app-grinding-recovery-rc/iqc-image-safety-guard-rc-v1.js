"use strict";

(function installIqcImageSafetyGuard(){
  const VERSION="IQC_IMAGE_SAFETY_GUARD_RC_V1_20260823";

  function notify(message){
    try{
      if(typeof toast==="function") return toast(message,true);
    }catch(_){}
    alert(message);
  }

  function normalizeCandidate(raw){
    const original=String(raw||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    if(original.length!==7)return"";
    const a=original.split("");
    const letterMap={"0":"O","1":"I","2":"Z","5":"S","8":"B","6":"G"};
    const digitMap={"O":"0","Q":"0","D":"0","I":"1","L":"1","Z":"2","S":"5","B":"8","G":"6","T":"7"};
    [0,1,4,5].forEach(i=>{if(/\d/.test(a[i])&&letterMap[a[i]])a[i]=letterMap[a[i]]});
    [2,3].forEach(i=>{if(/[A-Z]/.test(a[i])&&digitMap[a[i]])a[i]=digitMap[a[i]]});
    const value=a.join("");
    return /^[A-Z]{2}\d{2}[A-Z]{2}[A-Z0-9]$/.test(value)?value:"";
  }

  function descriptionDerivedCandidates(group){
    const sub=group.querySelector(".iqc-group-sub");
    if(!sub)return new Set();
    const text=String(sub.textContent||"").toUpperCase();
    const tokens=text.match(/[A-Z0-9]{7}/g)||[];
    return new Set(tokens.map(normalizeCandidate).filter(Boolean));
  }

  function auditVisibleGroups(){
    document.querySelectorAll("#iqcImageRc .iqc-group").forEach(group=>{
      const forbidden=descriptionDerivedCandidates(group);
      let suspect=[];
      group.querySelectorAll(".iqc-ctn-input").forEach(input=>{
        const value=String(input.value||"").trim().toUpperCase();
        const bad=forbidden.has(value);
        input.classList.toggle("ds-iqc-description-suspect",bad);
        if(bad){
          input.style.borderColor="rgba(255,113,136,.8)";
          input.style.color="#ffd0d8";
          input.title="疑似由 RT 敘述中的 7 碼片段誤判為 CTN，請確認／刪除";
          suspect.push(value);
        }else if(input.title&&input.title.includes("RT 敘述")){
          input.style.borderColor="";
          input.style.color="";
          input.title="";
        }
      });

      let warning=group.querySelector(".ds-iqc-description-warning");
      if(suspect.length){
        if(!warning){
          warning=document.createElement("div");
          warning.className="iqc-issue bad ds-iqc-description-warning";
          const grid=group.querySelector(".iqc-ctn-grid");
          if(grid)group.insertBefore(warning,grid);else group.appendChild(warning);
        }
        warning.textContent="防誤判："+Array.from(new Set(suspect)).join("、")+" 疑似由 RT 敘述片段產生，禁止自動視為可信 CTN，請人工確認。";
      }else if(warning){
        warning.remove();
      }
    });
  }

  function markReadOnly(){
    const panel=document.getElementById("iqcImageRc");
    if(!panel)return;
    const banner=panel.querySelector(".iqc-rc-banner");
    if(banner&&!banner.dataset.dsSafetyMarked){
      banner.dataset.dsSafetyMarked="1";
      banner.insertAdjacentHTML("beforeend",'<br><strong style="color:#ffe4a3">RC READ ONLY：目前正式 IQC 寫入已鎖住；待獨立 Backend RC URL 建立後才解鎖。</strong>');
    }
    const commit=document.getElementById("iqcRcCommit");
    if(commit){
      commit.dataset.dsProductionWriteLocked="1";
      commit.textContent="🔒 RC 複查完成（正式寫入暫鎖）";
    }
    auditVisibleGroups();
  }

  // Capture phase 比影像模組本身的 click listener 更早執行，保證不會誤寫正式 IQC_Log。
  document.addEventListener("click",event=>{
    const button=event.target.closest&&event.target.closest("#iqcRcCommit");
    if(!button)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    auditVisibleGroups();
    notify("目前為 IQC 影像辨識 RC：照片、OCR、跨頁合併與複查可測試；正式 IQC 寫入已安全鎖住。待 Backend RC 獨立部署後再開放測試寫入。");
  },true);

  const observer=new MutationObserver(()=>{
    clearTimeout(observer.t);
    observer.t=setTimeout(markReadOnly,80);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setInterval(markReadOnly,1000);
  markReadOnly();

  window.__DS_IQC_IMAGE_SAFETY_GUARD={version:VERSION,audit:auditVisibleGroups};
})();

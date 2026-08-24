"use strict";

(function installIqcIntakeRuntimeV23(){
  const VERSION="IQC_INTAKE_RUNTIME_RC_V23_20260825";
  const DB_NAME="ds_iqc_image_rc_v1";
  const DB_VERSION=1;
  const ACTIVE_BATCH_KEY="ds_iqc_image_rc_active_batch";
  const TESSERACT_WORKER="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js";
  const TESSERACT_CORE="https://cdn.jsdelivr.net/npm/tesseract.js-core@5";
  const TESSERACT_LANG="https://tessdata.projectnaptha.com/4.0.0";
  const BETWEEN_PHOTO_MS=900;
  if(window.__DS_IQC_INTAKE_RUNTIME_V23)return;

  let busy=false;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const nowIso=()=>new Date().toISOString();
  const localYmd=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
  const activeBatch=()=>String(localStorage.getItem(ACTIVE_BATCH_KEY)||"").trim();
  const clean=v=>String(v||"").trim().toUpperCase();

  function toastMsg(message,error=false){
    try{if(typeof toast==="function")return toast(message,error);}catch(_){ }
    console[error?"error":"log"]("[IQC V23]",message);
  }
  function setBadge(text,bad=false,good=false){
    const el=document.getElementById("iqcRcOcrBadge");
    if(!el)return;
    el.textContent=text;
    el.className=`iqc-rc-status ${bad?"bad":good?"good":"warn"}`;
  }
  function setProgress(text,pct=null){
    const el=document.getElementById("iqcRcProgressText");if(el)el.textContent=text;
    if(pct!==null){const bar=document.getElementById("iqcRcProgressBar");if(bar)bar.style.width=`${Math.max(0,Math.min(100,pct))}%`;}
  }

  function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  function getBatch(batchId){return openDb().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction("batches","readonly"),req=tx.objectStore("batches").get(batchId);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();}));}
  function putBatch(batch){return openDb().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction("batches","readwrite");tx.objectStore("batches").put(batch);tx.oncomplete=()=>{db.close();resolve(batch);};tx.onerror=()=>{db.close();reject(tx.error);};}));}
  function getPhotos(batchId){return openDb().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction("photos","readonly"),req=tx.objectStore("photos").index("batchId").getAll(batchId);req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>Number(a.seq)-Number(b.seq)));req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();}));}
  function putPhoto(photo){return openDb().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction("photos","readwrite");tx.objectStore("photos").put(photo);tx.oncomplete=()=>{db.close();resolve(photo);};tx.onerror=()=>{db.close();reject(tx.error);};}));}

  function normalizeCtn(raw){
    const original=clean(raw).replace(/[^A-Z0-9]/g,"");if(original.length!==7)return"";
    const a=original.split(""),lm={"0":"O","1":"I","2":"Z","5":"S","8":"B","6":"G"},dm={"O":"0","Q":"0","D":"0","I":"1","L":"1","Z":"2","S":"5","B":"8","G":"6","T":"7"};
    [0,1,4,5].forEach(i=>{if(/\d/.test(a[i])&&lm[a[i]])a[i]=lm[a[i]];});
    [2,3].forEach(i=>{if(/[A-Z]/.test(a[i])&&dm[a[i]])a[i]=dm[a[i]];});
    const value=a.join("");return /^[A-Z]{2}\d{2}[A-Z]{2}[A-Z0-9]$/.test(value)?value:"";
  }
  function normalizeRt(raw){
    const src=clean(raw).replace(/[^A-Z0-9]/g,""),map={"O":"0","Q":"0","D":"0","I":"1","L":"1","Z":"2","S":"5","B":"8","G":"6","T":"7"};
    const digits=src.split("").map(c=>/\d/.test(c)?c:(map[c]||"?")).join("");return /^\d{5,8}$/.test(digits)?digits:"";
  }
  function parseEvents(text){
    const events=[];
    String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean).forEach((line,lineIndex)=>{
      const upper=clean(line).replace(/[|]/g," "),first=upper.match(/^\s*([A-Z0-9]{5,8})\b/);
      if(first&&/(CYL|OCYL|CYLINDER)/.test(upper)){
        const rt=normalizeRt(first[1]);
        if(rt){const nums=upper.match(/\b\d{1,3}\b/g)||[];let expected=0;for(let i=nums.length-1;i>=0;i--){const n=Number(nums[i]);if(n>0&&n<=200){expected=n;break;}}events.push({type:"header",rt,expected,line:upper,lineIndex});return;}
      }
      const tokens=upper.match(/\b[A-Z0-9]{7}\b/g)||[];
      tokens.forEach(token=>{const ctn=normalizeCtn(token);if(ctn)events.push({type:"ctn",ctn,raw:token,corrected:ctn!==token,lineIndex});});
    });
    return events;
  }

  function patchAutoMeta(){
    const panel=document.getElementById("iqcImageRc");if(!panel)return;
    const date=document.getElementById("iqcRcDate"),operator=document.getElementById("iqcRcOperator");
    [date,operator].forEach(el=>{const field=el?.closest?.(".iqc-rc-field");if(field)field.style.display="none";});
    if(date&&date.value!==localYmd()){
      date.value=localYmd();
      date.dispatchEvent(new Event("change",{bubbles:true}));
    }
    let note=document.getElementById("iqcV23AutoMetaNote");
    const grid=panel.querySelector(".iqc-rc-card .iqc-rc-grid");
    if(grid&&!note){note=document.createElement("div");note.id="iqcV23AutoMetaNote";note.style.cssText="grid-column:1/-1;padding:9px 10px;border-radius:12px;background:rgba(88,214,141,.08);border:1px solid rgba(88,214,141,.22);color:#d8ffe8;font-size:11px;line-height:1.5";note.textContent="IQC 日期自動使用當日；操作人員直接取 DS 登入 Session，不需人工輸入。";grid.appendChild(note);}
  }

  function paintPhoto(photo,label){
    const cards=Array.from(document.querySelectorAll("#iqcRcPhotoList .iqc-photo"));
    const card=cards.find(el=>String(el.querySelector("strong")?.textContent||"").includes(`第 ${photo.seq} 張`));
    const small=card?.querySelector(".meta small");if(!small)return;
    const kb=Math.round(Number(photo.size||photo.blob?.size||0)/1024),ctns=(photo.events||[]).filter(e=>e.type==="ctn").length;
    small.innerHTML=`${label}<br>${kb} KB｜${ctns} 個 CTN候選`;
  }

  async function makeWorker(photoNo){
    if(!window.Tesseract||typeof window.Tesseract.createWorker!=="function")throw new Error("Tesseract OCR 尚未載入");
    setBadge(`OCR 第 ${photoNo} 張 · 建立獨立 Worker`);
    const worker=await window.Tesseract.createWorker("eng",1,{
      workerPath:TESSERACT_WORKER,corePath:TESSERACT_CORE,langPath:TESSERACT_LANG,
      logger:m=>{if(typeof m?.progress==="number")setProgress(`第 ${photoNo} 張｜${m.status||"OCR"} ${Math.round(m.progress*100)}%`);}
    });
    await worker.setParameters({tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_:-. ",preserve_interword_spaces:"1",tessedit_pageseg_mode:"6"});
    return worker;
  }

  async function runBatch(){
    if(busy)return;
    const batchId=activeBatch();if(!batchId)return toastMsg("找不到目前 IQC 影像批次",true);
    let photos=await getPhotos(batchId);if(!photos.length)return toastMsg("請先加入 Honeywell 照片",true);
    busy=true;
    const btn=document.getElementById("iqcRcAnalyze");if(btn)btn.disabled=true;
    let success=0,failed=0;
    try{
      // 全批先標 PROCESSING，避免 Hybrid 在照片間隙過早把尚未輪到的照片送 Cloud。
      for(const p of photos){
        if(p.status==="RECOGNIZED"&&String(p.ocrText||"").trim())continue;
        p.status="PROCESSING";p.localFailure="";p.updatedAt=nowIso();await putPhoto(p);paintPhoto(p,"排隊辨識");
      }
      photos=await getPhotos(batchId);

      for(let i=0;i<photos.length;i++){
        const p=photos[i];
        if(p.status==="RECOGNIZED"&&String(p.ocrText||"").trim()){success++;continue;}
        let worker=null;
        try{
          paintPhoto(p,"辨識中");
          setProgress(`第 ${i+1}/${photos.length} 張：獨立 Local OCR 執行中…`,Math.round(i/photos.length*100));
          worker=await makeWorker(i+1);
          // V23 不再走 intake 舊版的大型 Canvas preprocess，直接使用已壓縮 JPEG。
          const result=await worker.recognize(p.blob);
          const failedResult=!!result?.data?.dsLocalFailure;
          const text=String(result?.data?.text||"").trim();
          if(failedResult||!text)throw new Error(result?.data?.dsLocalFailureMessage||"Local OCR 無可用文字");
          p.ocrText=text;p.confidence=Number(result?.data?.confidence||0);p.events=parseEvents(text);p.status="RECOGNIZED";p.localFailure="";p.updatedAt=nowIso();await putPhoto(p);success++;
          paintPhoto(p,`已辨識 ${Math.round(p.confidence||0)}%`);
          setBadge(`OCR 第 ${i+1} 張 · 完成`,false,true);
        }catch(err){
          failed++;
          p.status="LOCAL_FAILED";p.ocrText="";p.confidence=0;p.events=[];p.localFailure=String(err?.message||err||"LOCAL_OCR_FAILED");p.updatedAt=nowIso();await putPhoto(p);
          paintPhoto(p,"Local 失敗｜待 AI/複查");
          setBadge(`OCR 第 ${i+1} 張 · Local 失敗`,true);
          setProgress(`第 ${i+1} 張 Local 失敗，已記錄並跳下一張；不會停止整批。`);
        }finally{
          try{await worker?.terminate?.();}catch(_){ }
          worker=null;
          if(i<photos.length-1)await sleep(BETWEEN_PHOTO_MS);
        }
      }

      setProgress(`完成：Local 成功 ${success} 張、失敗 ${failed} 張；失敗照片才交由 V21 判定是否需要 Cloud。`,100);
      setBadge(failed?`Local ${success}/${photos.length}｜${failed} 張待補`:`Local ${success}/${photos.length} 完成`,false,!failed);
      toastMsg(failed?`本機 OCR 完成：${success} 張成功、${failed} 張待第二讀者`:`本機 OCR ${success} 張全部完成`,false);
    }catch(err){
      console.error("[IQC V23 batch]",err);
      setBadge("Local OCR 批次控制失敗",true);
      setProgress(`批次控制失敗：${err?.message||err}。照片仍保留。`);
      toastMsg("Local OCR 批次控制失敗，照片仍保留",true);
    }finally{
      busy=false;if(btn)btn.disabled=false;
      try{await window.__DS_IQC_IMAGE_RC?.open?.();}catch(_){ }
      try{await window.__DS_IQC_META_GROUPING_V8?.refresh?.();}catch(_){ }
      patchAutoMeta();
    }
  }

  // 載入順序放在 Meta V8 之後：V8 第一次 replay 完成後，由 V23 接管真正的 OCR，阻止舊 analyzeAll 執行。
  document.addEventListener("click",event=>{
    const btn=event.target.closest?.("#iqcRcAnalyze");if(!btn)return;
    event.preventDefault();event.stopImmediatePropagation();
    runBatch().catch(err=>console.error("[IQC V23]",err));
  },true);

  const observer=new MutationObserver(()=>patchAutoMeta());
  observer.observe(document.documentElement,{subtree:true,childList:true});
  document.addEventListener("click",e=>{if(e.target.closest?.("#iqcImageRcTool,#iqcRcNewBatch"))setTimeout(patchAutoMeta,250);},true);
  setInterval(patchAutoMeta,1200);
  patchAutoMeta();

  window.__DS_IQC_INTAKE_RUNTIME_V23={version:VERSION,runBatch,patchAutoMeta};
})();

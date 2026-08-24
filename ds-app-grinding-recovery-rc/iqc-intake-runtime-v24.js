"use strict";

(function installIqcIntakeRuntimeV24(){
  const VERSION="IQC_INTAKE_RUNTIME_RC_V24_20260825";
  const DB_NAME="ds_iqc_image_rc_v1";
  const DB_VERSION=1;
  const ACTIVE_BATCH_KEY="ds_iqc_image_rc_active_batch";
  const TESSERACT_WORKER="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js";
  const TESSERACT_CORE="https://cdn.jsdelivr.net/npm/tesseract.js-core@5";
  const TESSERACT_LANG="https://tessdata.projectnaptha.com/4.0.0";
  const BETWEEN_PHOTO_MS=1200;
  const PREFLIGHT_TIMEOUT_MS=45000;
  if(window.__DS_IQC_INTAKE_RUNTIME_V24)return;

  let busy=false,ready=false,preflightPromise=null;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const nowIso=()=>new Date().toISOString();
  const localYmd=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
  const activeBatch=()=>String(localStorage.getItem(ACTIVE_BATCH_KEY)||"").trim();
  const clean=v=>String(v||"").trim().toUpperCase();

  function toastMsg(message,error=false){try{if(typeof toast==="function")return toast(message,error);}catch(_){ }console[error?"error":"log"]("[IQC V24]",message);}
  function setBadge(text,bad=false,good=false){const el=document.getElementById("iqcRcOcrBadge");if(!el)return;el.textContent=text;el.className=`iqc-rc-status ${bad?"bad":good?"good":"warn"}`;}
  function setProgress(text,pct=null){const el=document.getElementById("iqcRcProgressText");if(el)el.textContent=text;if(pct!==null){const bar=document.getElementById("iqcRcProgressBar");if(bar)bar.style.width=`${Math.max(0,Math.min(100,pct))}%`;}}
  function withTimeout(promise,ms,label){let timer;const t=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label}超過 ${Math.round(ms/1000)} 秒`)),ms);});return Promise.race([promise,t]).finally(()=>clearTimeout(timer));}

  function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  function getPhotos(batchId){return openDb().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction("photos","readonly"),req=tx.objectStore("photos").index("batchId").getAll(batchId);req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>Number(a.seq)-Number(b.seq)));req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();}));}
  function putPhoto(photo){return openDb().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction("photos","readwrite");tx.objectStore("photos").put(photo);tx.oncomplete=()=>{db.close();resolve(photo);};tx.onerror=()=>{db.close();reject(tx.error);};}));}

  function normalizeCtn(raw){const original=clean(raw).replace(/[^A-Z0-9]/g,"");if(original.length!==7)return"";const a=original.split(""),lm={"0":"O","1":"I","2":"Z","5":"S","8":"B","6":"G"},dm={"O":"0","Q":"0","D":"0","I":"1","L":"1","Z":"2","S":"5","B":"8","G":"6","T":"7"};[0,1,4,5].forEach(i=>{if(/\d/.test(a[i])&&lm[a[i]])a[i]=lm[a[i]];});[2,3].forEach(i=>{if(/[A-Z]/.test(a[i])&&dm[a[i]])a[i]=dm[a[i]];});const value=a.join("");return /^[A-Z]{2}\d{2}[A-Z]{2}[A-Z0-9]$/.test(value)?value:"";}
  function normalizeRt(raw){const src=clean(raw).replace(/[^A-Z0-9]/g,""),map={"O":"0","Q":"0","D":"0","I":"1","L":"1","Z":"2","S":"5","B":"8","G":"6","T":"7"};const digits=src.split("").map(c=>/\d/.test(c)?c:(map[c]||"?")).join("");return /^\d{5,8}$/.test(digits)?digits:"";}
  function parseEvents(text){const events=[];String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean).forEach((line,lineIndex)=>{const upper=clean(line).replace(/[|]/g," "),first=upper.match(/^\s*([A-Z0-9]{5,8})\b/);if(first&&/(CYL|OCYL|CYLINDER)/.test(upper)){const rt=normalizeRt(first[1]);if(rt){const nums=upper.match(/\b\d{1,3}\b/g)||[];let expected=0;for(let i=nums.length-1;i>=0;i--){const n=Number(nums[i]);if(n>0&&n<=200){expected=n;break;}}events.push({type:"header",rt,expected,line:upper,lineIndex});return;}}if(/^RT[_\s]/.test(upper)||((upper.match(/_/g)||[]).length>=2))return;const tokens=upper.split(/[^A-Z0-9]+/).filter(Boolean);tokens.forEach(token=>{const ctn=normalizeCtn(token);if(ctn)events.push({type:"ctn",ctn,raw:token,corrected:ctn!==token,lineIndex});});});return events;}

  function patchAutoMeta(){
    const panel=document.getElementById("iqcImageRc");if(!panel)return;
    const date=document.getElementById("iqcRcDate"),operator=document.getElementById("iqcRcOperator");
    [date,operator].forEach(el=>{const field=el?.closest?.(".iqc-rc-field");if(field)field.style.display="none";});
    if(date&&date.value!==localYmd()){date.value=localYmd();date.dispatchEvent(new Event("change",{bubbles:true}));}
    const grid=panel.querySelector(".iqc-rc-card .iqc-rc-grid");
    let note=document.getElementById("iqcV24AutoMetaNote");
    if(grid&&!note){note=document.createElement("div");note.id="iqcV24AutoMetaNote";note.style.cssText="grid-column:1/-1;padding:9px 10px;border-radius:12px;background:rgba(88,214,141,.08);border:1px solid rgba(88,214,141,.22);color:#d8ffe8;font-size:11px;line-height:1.5";note.textContent="IQC 日期自動使用當日；操作人員直接取 DS 登入 Session，不需人工輸入。";grid.appendChild(note);}
  }

  function panelVisible(){const p=document.getElementById("iqcImageRc");return !!p&&!p.classList.contains("hidden");}
  function analyzeBtn(){return document.getElementById("iqcRcAnalyze");}
  function applyReadyUi(){const btn=analyzeBtn();if(!btn)return;if(ready){btn.disabled=false;btn.textContent="開始辨識";setBadge("OCR 已就緒",false,true);}else if(preflightPromise){btn.disabled=true;btn.textContent="OCR 準備中…";setBadge("OCR 準備中…");}}

  async function preflight(force=false){
    if(ready&&!force)return true;
    if(preflightPromise&&!force)return preflightPromise;
    const nativeCreate=window.__DS_TESSERACT_NATIVE_CREATE_WORKER_V24;
    if(typeof nativeCreate!=="function"){ready=false;setBadge("OCR 啟動失敗",true);setProgress("OCR 原生 Worker 未載入，請重新開啟 RC。");return false;}
    preflightPromise=(async()=>{
      let worker=null;
      try{
        ready=false;applyReadyUi();setProgress("正在自動初始化本機 OCR 核心；完成後才開放開始辨識。",0);
        worker=await withTimeout(nativeCreate("eng",1,{workerPath:TESSERACT_WORKER,corePath:TESSERACT_CORE,langPath:TESSERACT_LANG}),PREFLIGHT_TIMEOUT_MS,"OCR 初始化");
        await worker.setParameters({tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_:-. ",preserve_interword_spaces:"1",tessedit_pageseg_mode:"6"});
        ready=true;setProgress("OCR 核心已完成初始化，可開始本機辨識。",0);setBadge("OCR 已就緒",false,true);return true;
      }catch(err){ready=false;setBadge("OCR 啟動失敗",true);setProgress(`OCR 初始化失敗：${err?.message||err}。按「重試 OCR 啟動」後再作業。`);return false;
      }finally{
        try{await worker?.terminate?.();}catch(_){ }
        worker=null;preflightPromise=null;
        const btn=analyzeBtn();if(btn){btn.disabled=false;btn.textContent=ready?"開始辨識":"重試 OCR 啟動";}
      }
    })();
    return preflightPromise;
  }

  async function createBitmap(blob){if(typeof createImageBitmap==="function"){try{return await createImageBitmap(blob,{imageOrientation:"from-image"});}catch(_){ }}return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(blob);img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};img.onerror=e=>{URL.revokeObjectURL(url);reject(e);};img.src=url;});}
  async function preprocessForOcr(blob){
    let b=null,c=null;
    try{
      b=await createBitmap(blob);c=document.createElement("canvas");c.width=b.width;c.height=b.height;
      const ctx=c.getContext("2d",{willReadFrequently:true,alpha:false});ctx.drawImage(b,0,0);if(b.close)b.close();b=null;
      const im=ctx.getImageData(0,0,c.width,c.height),d=im.data;
      for(let i=0;i<d.length;i+=4){const y=.299*d[i]+.587*d[i+1]+.114*d[i+2],v=Math.max(0,Math.min(255,(y-128)*1.28+138));d[i]=d[i+1]=d[i+2]=v;}
      ctx.putImageData(im,0,0);
      return await new Promise(resolve=>c.toBlob(x=>resolve(x||blob),"image/jpeg",.86));
    }finally{
      try{b?.close?.();}catch(_){ }
      if(c){c.width=1;c.height=1;c.remove();}
      b=null;c=null;
    }
  }

  function paintPhoto(photo,label){const cards=Array.from(document.querySelectorAll("#iqcRcPhotoList .iqc-photo"));const card=cards.find(el=>String(el.querySelector("strong")?.textContent||"").includes(`第 ${photo.seq} 張`));const small=card?.querySelector(".meta small");if(!small)return;const kb=Math.round(Number(photo.size||photo.blob?.size||0)/1024),ctns=(photo.events||[]).filter(e=>e.type==="ctn").length;small.innerHTML=`${label}<br>${kb} KB｜${ctns} 個 CTN候選`;}

  async function makeWorker(photoNo){
    if(!window.Tesseract||typeof window.Tesseract.createWorker!=="function")throw new Error("Tesseract OCR 尚未載入");
    const worker=await window.Tesseract.createWorker("eng",1,{workerPath:TESSERACT_WORKER,corePath:TESSERACT_CORE,langPath:TESSERACT_LANG,logger:m=>{if(typeof m?.progress==="number")setProgress(`第 ${photoNo} 張｜${m.status||"OCR"} ${Math.round(m.progress*100)}%`);}});
    await worker.setParameters({tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_:-. ",preserve_interword_spaces:"1",tessedit_pageseg_mode:"6"});
    return worker;
  }

  async function runBatch(){
    if(busy)return;
    if(!ready){const ok=await preflight(true);if(!ok)return;}
    const batchId=activeBatch();if(!batchId)return toastMsg("找不到目前 IQC 影像批次",true);
    let photos=await getPhotos(batchId);if(!photos.length)return toastMsg("請先加入 Honeywell 照片",true);
    busy=true;const btn=analyzeBtn();if(btn)btn.disabled=true;let success=0,failed=0;
    try{
      for(const p of photos){if(p.status==="RECOGNIZED"&&String(p.ocrText||"").trim())continue;p.status="PROCESSING";p.localFailure="";p.updatedAt=nowIso();await putPhoto(p);paintPhoto(p,"排隊辨識");}
      photos=await getPhotos(batchId);
      for(let i=0;i<photos.length;i++){
        const p=photos[i];if(p.status==="RECOGNIZED"&&String(p.ocrText||"").trim()){success++;continue;}
        let worker=null,prepared=null;
        try{
          paintPhoto(p,"辨識中");setProgress(`第 ${i+1}/${photos.length} 張：Local OCR 執行中…`,Math.round(i/photos.length*100));
          prepared=await preprocessForOcr(p.blob);
          worker=await makeWorker(i+1);
          const result=await worker.recognize(prepared);
          const text=String(result?.data?.text||"").trim();if(!text)throw new Error("Local OCR 無可用文字");
          p.ocrText=text;p.confidence=Number(result?.data?.confidence||0);p.events=parseEvents(text);p.status="RECOGNIZED";p.localFailure="";p.updatedAt=nowIso();await putPhoto(p);success++;paintPhoto(p,`已辨識 ${Math.round(p.confidence||0)}%`);
        }catch(err){
          failed++;p.status="LOCAL_FAILED";p.ocrText="";p.confidence=0;p.events=[];p.localFailure=String(err?.message||err||"LOCAL_OCR_FAILED");p.updatedAt=nowIso();await putPhoto(p);paintPhoto(p,"Local 失敗｜待 AI/複查");setProgress(`第 ${i+1} 張 Local 失敗，已記錄並繼續下一張。`);
        }finally{
          try{await worker?.terminate?.();}catch(_){ }
          worker=null;prepared=null;
          if(i<photos.length-1)await sleep(BETWEEN_PHOTO_MS);
        }
      }
      setProgress(`完成：Local 成功 ${success} 張、失敗 ${failed} 張；失敗照片才交由 V21 判定是否需要 Cloud。`,100);
      setBadge(failed?`Local ${success}/${photos.length}｜${failed} 張待補`:`Local ${success}/${photos.length} 完成`,false,!failed);
      toastMsg(failed?`本機 OCR 完成：${success} 張成功、${failed} 張待第二讀者`:`本機 OCR ${success} 張全部完成`);
    }catch(err){setBadge("Local OCR 批次控制失敗",true);setProgress(`批次控制失敗：${err?.message||err}。照片仍保留。`);toastMsg("Local OCR 批次控制失敗，照片仍保留",true);}
    finally{busy=false;if(btn)btn.disabled=false;try{await window.__DS_IQC_IMAGE_RC?.open?.();}catch(_){ }try{await window.__DS_IQC_META_GROUPING_V8?.refresh?.();}catch(_){ }patchAutoMeta();}
  }

  document.addEventListener("click",event=>{
    const target=event.target.closest?.("#iqcRcAnalyze");if(!target)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(!ready){preflight(true).then(ok=>{if(ok)runBatch();});return;}
    runBatch().catch(err=>console.error("[IQC V24]",err));
  },true);

  document.addEventListener("click",e=>{if(e.target.closest?.("#iqcImageRcTool,#iqcRcNewBatch")){setTimeout(()=>{patchAutoMeta();if(panelVisible())preflight(false);},180);}},true);
  const observer=new MutationObserver(()=>{patchAutoMeta();if(panelVisible()&&!ready&&!preflightPromise)preflight(false);});observer.observe(document.documentElement,{subtree:true,childList:true});
  setInterval(()=>{patchAutoMeta();if(panelVisible()&&!ready&&!preflightPromise)preflight(false);},1200);
  patchAutoMeta();
  window.__DS_IQC_INTAKE_RUNTIME_V24={version:VERSION,runBatch,patchAutoMeta,preflight,isReady:()=>ready};
})();

"use strict";

(function installIqcIntakeRuntimeV25(){
  const VERSION="IQC_INTAKE_RUNTIME_RC_V25_20260825";
  const DB_NAME="ds_iqc_image_rc_v1";
  const DB_VERSION=1;
  const ACTIVE_BATCH_KEY="ds_iqc_image_rc_active_batch";
  const TESSERACT_WORKER="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js";
  const TESSERACT_CORE="https://cdn.jsdelivr.net/npm/tesseract.js-core@5";
  const TESSERACT_LANG="https://tessdata.projectnaptha.com/4.0.0";
  const INIT_TIMEOUT_MS=45000;
  const RECOGNIZE_TIMEOUT_MS=55000;
  const BETWEEN_PHOTO_MS=2600;
  if(window.__DS_IQC_INTAKE_RUNTIME_V25)return;

  let busy=false,ready=false,preflightPromise=null;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const nowIso=()=>new Date().toISOString();
  const localYmd=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
  const activeBatch=()=>String(localStorage.getItem(ACTIVE_BATCH_KEY)||"").trim();
  const clean=v=>String(v||"").trim().toUpperCase();

  function toastMsg(message,error=false){try{if(typeof toast==="function")return toast(message,error);}catch(_){ }console[error?"error":"log"]("[IQC V25]",message);}
  function setBadge(text,bad=false,good=false){const el=document.getElementById("iqcRcOcrBadge");if(!el)return;el.textContent=text;el.className=`iqc-rc-status ${bad?"bad":good?"good":"warn"}`;}
  function setProgress(text,pct=null){const el=document.getElementById("iqcRcProgressText");if(el)el.textContent=text;if(pct!==null){const bar=document.getElementById("iqcRcProgressBar");if(bar)bar.style.width=`${Math.max(0,Math.min(100,pct))}%`;}}
  function withTimeout(promise,ms,label){let timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label}超過 ${Math.round(ms/1000)} 秒`)),ms);});return Promise.race([promise,timeout]).finally(()=>clearTimeout(timer));}

  function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error("IndexedDB 開啟失敗"));});}
  function getPhotos(batchId){return openDb().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction("photos","readonly"),req=tx.objectStore("photos").index("batchId").getAll(batchId);req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>Number(a.seq)-Number(b.seq)));req.onerror=()=>reject(req.error||new Error("讀取照片失敗"));tx.oncomplete=()=>db.close();}));}
  function putPhoto(photo){return openDb().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction("photos","readwrite");tx.objectStore("photos").put(photo);tx.oncomplete=()=>{db.close();resolve(photo);};tx.onerror=()=>{const err=tx.error||new Error("照片狀態寫入失敗");db.close();reject(err);};tx.onabort=()=>{const err=tx.error||new Error("照片狀態寫入被中止");db.close();reject(err);};}));}

  function normalizeCtn(raw){const original=clean(raw).replace(/[^A-Z0-9]/g,"");if(original.length!==7)return"";const a=original.split(""),lm={"0":"O","1":"I","2":"Z","5":"S","8":"B","6":"G"},dm={"O":"0","Q":"0","D":"0","I":"1","L":"1","Z":"2","S":"5","B":"8","G":"6","T":"7"};[0,1,4,5].forEach(i=>{if(/\d/.test(a[i])&&lm[a[i]])a[i]=lm[a[i]];});[2,3].forEach(i=>{if(/[A-Z]/.test(a[i])&&dm[a[i]])a[i]=dm[a[i]];});const value=a.join("");return /^[A-Z]{2}\d{2}[A-Z]{2}[A-Z0-9]$/.test(value)?value:"";}
  function normalizeRt(raw){const src=clean(raw).replace(/[^A-Z0-9]/g,""),map={"O":"0","Q":"0","D":"0","I":"1","L":"1","Z":"2","S":"5","B":"8","G":"6","T":"7"};const digits=src.split("").map(c=>/\d/.test(c)?c:(map[c]||"?")).join("");return /^\d{5,8}$/.test(digits)?digits:"";}
  function readHeader(upper){const first=upper.match(/^\s*([A-Z0-9]{5,8})\b/);if(!first)return null;const rt=normalizeRt(first[1]);if(!rt)return null;const tokens=upper.match(/[A-Z0-9]+/g)||[];let marker=tokens.findIndex(t=>t==="CYLINDER"||t==="CYL"),status="",plant="";if(marker>=0){const a=String(tokens[marker+1]||""),b=String(tokens[marker+2]||"");if(/^[A-Z][A-Z0-9]{2,9}$/.test(a)&&!/^\d+$/.test(a))status=a;if(/^(?=.*\d)[A-Z0-9]{3,8}$/.test(b))plant=b;if(!plant&&/^(?=.*\d)[A-Z0-9]{3,8}$/.test(a)){plant=a;status="";}}else{const oi=tokens.findIndex((t,i)=>i>0&&/^(?:OCYL|MNT1|[A-Z]{2,5}\d{0,2})$/.test(t));if(oi<0)return null;status=String(tokens[oi]||"");const b=String(tokens[oi+1]||"");if(/^(?=.*\d)[A-Z0-9]{3,8}$/.test(b))plant=b;}const nums=upper.match(/\b\d{1,3}\b/g)||[];let expected=0;for(let i=nums.length-1;i>=0;i--){const n=Number(nums[i]);if(n>0&&n<=200){expected=n;break;}}return{rt,status,plant,expected};}
  function parseText(text){const lines=String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean),groups=[],leading=[];let current=null;for(const line of lines){const upper=line.toUpperCase().replace(/[|]/g," "),header=readHeader(upper);if(header){current={...header,ctns:[]};groups.push(current);continue;}if(/^RT[_\s]/.test(upper)||((upper.match(/_/g)||[]).length>=2))continue;const tokens=upper.split(/[^A-Z0-9]+/).filter(Boolean),ctns=[];tokens.forEach(token=>{const c=normalizeCtn(token);if(c&&!ctns.includes(c))ctns.push(c);});ctns.forEach(ctn=>{if(current){if(!current.ctns.includes(ctn))current.ctns.push(ctn);}else if(!leading.includes(ctn))leading.push(ctn);});}return{groups,leading};}
  function sameGroup(a,b){if(!a||!b||a.rt!==b.rt)return false;if(a.status&&b.status&&a.status!==b.status)return false;if(a.plant&&b.plant&&a.plant!==b.plant)return false;return true;}
  function parseScore(parsed){const groups=parsed?.groups||[],expected=groups.filter(g=>g.expected>0).length,ctns=groups.reduce((n,g)=>n+(g.ctns||[]).length,0);return groups.length*100+expected*30+ctns*2;}
  function mergeParsedPasses(results){const passes=results.map(r=>({parsed:parseText(r?.data?.text||"")}));if(!passes.length)return"";passes.sort((a,b)=>parseScore(b.parsed)-parseScore(a.parsed));const skeleton=passes[0].parsed,groups=(skeleton.groups||[]).map(g=>({...g,ctns:Array.from(new Set(g.ctns||[]))})),candidates=new Map();const ensure=ctn=>{if(!candidates.has(ctn))candidates.set(ctn,{total:0,byGroup:new Map()});return candidates.get(ctn);};passes.forEach(({parsed})=>{(parsed.groups||[]).forEach(pg=>{const matches=groups.map((g,i)=>sameGroup(g,pg)?i:-1).filter(i=>i>=0);if(matches.length!==1)return;const gi=matches[0],dst=groups[gi];(pg.ctns||[]).forEach(ctn=>{const rec=ensure(ctn);rec.total++;rec.byGroup.set(gi,(rec.byGroup.get(gi)||0)+1);});if(!dst.expected&&pg.expected)dst.expected=pg.expected;if(!dst.status&&pg.status)dst.status=pg.status;if(!dst.plant&&pg.plant)dst.plant=pg.plant;});});groups.forEach((g,gi)=>{const selected=new Set(g.ctns),ranked=[];candidates.forEach((rec,ctn)=>{const here=rec.byGroup.get(gi)||0;if(!here)return;let bestOther=0;rec.byGroup.forEach((v,k)=>{if(k!==gi)bestOther=Math.max(bestOther,v);});if(bestOther>here)return;ranked.push({ctn,here,total:rec.total,conflict:bestOther===here&&bestOther>0});});ranked.sort((a,b)=>b.here-a.here||b.total-a.total||a.ctn.localeCompare(b.ctn));ranked.forEach(item=>{if(!item.conflict)selected.add(item.ctn);});g.ctns=Array.from(selected);});const lines=[];groups.forEach(g=>{lines.push([g.rt,"CYLINDER",g.status||"UNKNOWN",g.plant||"UNKNOWN","TOTAL",String(g.expected||0)].join(" "));g.ctns.forEach(ctn=>lines.push(ctn));});if(!groups.length){const leading=new Set();passes.forEach(p=>(p.parsed.leading||[]).forEach(ctn=>leading.add(ctn)));leading.forEach(ctn=>lines.push(ctn));}return lines.join("\n");}

  function structuralState(text){
    const parsed=parseText(text),groups=parsed.groups||[],leading=parsed.leading||[];
    if(groups.length){
      const complete=groups.every(g=>!!g.rt&&!!g.status&&!!g.plant&&Number(g.expected||0)>0&&(g.ctns||[]).length>=Number(g.expected||0));
      const found=groups.reduce((n,g)=>n+(g.ctns||[]).length,0);
      const expected=groups.reduce((n,g)=>n+Number(g.expected||0),0);
      return {kind:complete?"COMPLETE":"GROUP_GAP",complete,groups,leading,found,expected};
    }
    if(leading.length)return {kind:"CONTINUATION",complete:false,groups,leading,found:leading.length,expected:0};
    return {kind:"NO_DATA",complete:false,groups,leading,found:0,expected:0};
  }
  function needsSparse(text){return !structuralState(text).complete;}
  function needsHighContrast(text){const s=structuralState(text);if(s.complete)return false;if(s.kind==="CONTINUATION"&&s.found>0)return false;return true;}
  function qualityLabel(text){const s=structuralState(text);if(s.kind==="COMPLETE")return `資料完整｜${s.found}/${s.expected}`;if(s.kind==="GROUP_GAP")return `已辨識｜${s.found}/${s.expected} 待補`;if(s.kind==="CONTINUATION")return `已辨識｜${s.found} CTN（續頁）`;return "已辨識｜待複查";}

  function parseEvents(text){const events=[];String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean).forEach((line,lineIndex)=>{const upper=clean(line).replace(/[|]/g," "),h=readHeader(upper);if(h){events.push({type:"header",rt:h.rt,expected:h.expected,line:upper,lineIndex});return;}if(/^RT[_\s]/.test(upper)||((upper.match(/_/g)||[]).length>=2))return;upper.split(/[^A-Z0-9]+/).filter(Boolean).forEach(token=>{const ctn=normalizeCtn(token);if(ctn)events.push({type:"ctn",ctn,raw:token,corrected:ctn!==token,lineIndex});});});return events;}

  function patchAutoMeta(){const panel=document.getElementById("iqcImageRc");if(!panel)return;const date=document.getElementById("iqcRcDate"),operator=document.getElementById("iqcRcOperator");[date,operator].forEach(el=>{const field=el?.closest?.(".iqc-rc-field");if(field)field.style.display="none";});if(date&&date.value!==localYmd()){date.value=localYmd();date.dispatchEvent(new Event("change",{bubbles:true}));}const grid=panel.querySelector(".iqc-rc-card .iqc-rc-grid");let note=document.getElementById("iqcV25AutoMetaNote");if(grid&&!note){note=document.createElement("div");note.id="iqcV25AutoMetaNote";note.style.cssText="grid-column:1/-1;padding:9px 10px;border-radius:12px;background:rgba(88,214,141,.08);border:1px solid rgba(88,214,141,.22);color:#d8ffe8;font-size:11px;line-height:1.5";note.textContent="IQC 日期自動使用當日；操作人員直接取 DS 登入 Session，不需人工輸入。";grid.appendChild(note);}}
  function panelVisible(){const p=document.getElementById("iqcImageRc");return !!p&&!p.classList.contains("hidden");}
  function analyzeBtn(){return document.getElementById("iqcRcAnalyze");}

  async function nativeWorker(logger){const create=window.__DS_TESSERACT_NATIVE_CREATE_WORKER_V24;if(typeof create!=="function")throw new Error("OCR 原生 Worker 未載入");const w=await withTimeout(create("eng",1,{workerPath:TESSERACT_WORKER,corePath:TESSERACT_CORE,langPath:TESSERACT_LANG,logger}),INIT_TIMEOUT_MS,"OCR Worker 初始化");await w.setParameters({tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_:-. ",preserve_interword_spaces:"1",tessedit_pageseg_mode:"6"});return w;}
  async function preflight(force=false){if(ready&&!force)return true;if(preflightPromise&&!force)return preflightPromise;preflightPromise=(async()=>{let worker=null;const btn=analyzeBtn();try{ready=false;if(btn){btn.disabled=true;btn.textContent="OCR 準備中…";}setBadge("OCR 準備中…");setProgress("正在自動初始化本機 OCR 核心；完成後才開放開始辨識。",0);worker=await nativeWorker();ready=true;setBadge("OCR 已就緒",false,true);setProgress("OCR 核心已完成初始化，可開始本機辨識。",0);return true;}catch(err){ready=false;setBadge("OCR 啟動失敗",true);setProgress(`OCR 初始化失敗：${err?.message||err||"UNKNOWN"}。請按「重試 OCR 啟動」。`);return false;}finally{try{await worker?.terminate?.();}catch(_){ }worker=null;preflightPromise=null;if(btn){btn.disabled=false;btn.textContent=ready?"開始辨識":"重試 OCR 啟動";}}})();return preflightPromise;}

  async function createBitmap(blob){if(typeof createImageBitmap==="function"){try{return await createImageBitmap(blob,{imageOrientation:"from-image"});}catch(_){ }}return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(blob);img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};img.onerror=e=>{URL.revokeObjectURL(url);reject(e||new Error("圖片解碼失敗"));};img.src=url;});}
  async function preprocessForOcr(blob){let b=null,c=null;try{b=await createBitmap(blob);c=document.createElement("canvas");c.width=b.width;c.height=b.height;const ctx=c.getContext("2d",{willReadFrequently:true,alpha:false});ctx.drawImage(b,0,0);try{b.close?.();}catch(_){ }b=null;const im=ctx.getImageData(0,0,c.width,c.height),d=im.data;for(let i=0;i<d.length;i+=4){const y=.299*d[i]+.587*d[i+1]+.114*d[i+2],v=Math.max(0,Math.min(255,(y-128)*1.28+138));d[i]=d[i+1]=d[i+2]=v;}ctx.putImageData(im,0,0);return await new Promise(resolve=>c.toBlob(x=>resolve(x||blob),"image/jpeg",.86));}finally{try{b?.close?.();}catch(_){ }if(c){c.width=1;c.height=1;c.remove();}b=null;c=null;}}
  async function makeVariant(image){let src=null,canvas=null;try{src=await createBitmap(image);const sw=Number(src.width||src.naturalWidth||0),sh=Number(src.height||src.naturalHeight||0);if(!sw||!sh)throw new Error("影像尺寸無效");const sx=Math.round(sw*.04),sy=Math.round(sh*.06),cw=Math.round(sw*.92),ch=Math.round(sh*.92),scale=Math.min(1.5,2100/Math.max(cw,ch)),w=Math.max(1,Math.round(cw*scale)),h=Math.max(1,Math.round(ch*scale));canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;const ctx=canvas.getContext("2d",{willReadFrequently:true,alpha:false});ctx.drawImage(src,sx,sy,cw,ch,0,0,w,h);try{src.close?.();}catch(_){ }src=null;const im=ctx.getImageData(0,0,w,h),d=im.data;for(let i=0;i<d.length;i+=4){const y=.299*d[i]+.587*d[i+1]+.114*d[i+2],v=y>182?255:(y>104?Math.min(255,Math.round((y-104)*3.1)):0);d[i]=d[i+1]=d[i+2]=v;}ctx.putImageData(im,0,0);return await new Promise(resolve=>canvas.toBlob(b=>resolve(b||image),"image/jpeg",.9));}finally{try{src?.close?.();}catch(_){ }if(canvas){canvas.width=1;canvas.height=1;canvas.remove();}src=null;canvas=null;}}

  async function recognizeProvenPipeline(image,photoNo){let worker=null;const results=[];try{worker=await nativeWorker(m=>{if(typeof m?.progress==="number")setProgress(`第 ${photoNo} 張｜${m.status||"OCR"} ${Math.round(m.progress*100)}%`);});await worker.setParameters({tessedit_pageseg_mode:"6"});const primary=await withTimeout(worker.recognize(image),RECOGNIZE_TIMEOUT_MS,"主辨識");results.push(primary);let merged=mergeParsedPasses(results)||String(primary?.data?.text||"");if(needsSparse(merged)){setProgress(`第 ${photoNo} 張有結構缺口，補跑 Sparse Text。`);await worker.setParameters({tessedit_pageseg_mode:"11"});try{results.push(await withTimeout(worker.recognize(image),RECOGNIZE_TIMEOUT_MS,"Sparse 補辨識"));}catch(err){console.warn("[IQC V25 sparse]",err);}merged=mergeParsedPasses(results)||merged;}if(needsHighContrast(merged)){setProgress(`第 ${photoNo} 張仍有結構缺口，最後跑裁切高對比辨識。`);try{const variant=await makeVariant(image);await worker.setParameters({tessedit_pageseg_mode:"6"});results.push(await withTimeout(worker.recognize(variant),RECOGNIZE_TIMEOUT_MS,"高對比補辨識"));merged=mergeParsedPasses(results)||merged;}catch(err){console.warn("[IQC V25 high contrast]",err);}}if(primary?.data){primary.data.dsPrimaryText=String(primary.data.text||"");primary.data.dsEngineConfidence=Number(primary.data.confidence||0);primary.data.text=merged;primary.data.dsPassCount=results.length;primary.data.dsStrategy="v13-proven-pipeline-v25-batch-control";}return primary;}finally{try{await worker?.terminate?.();}catch(_){ }worker=null;results.length=0;}}

  function paintPhoto(photo,label){const cards=Array.from(document.querySelectorAll("#iqcRcPhotoList .iqc-photo")),card=cards.find(el=>String(el.querySelector("strong")?.textContent||"").includes(`第 ${photo.seq} 張`)),small=card?.querySelector(".meta small");if(!small)return;const kb=Math.round(Number(photo.size||photo.blob?.size||0)/1024),ctns=(photo.events||[]).filter(e=>e.type==="ctn").length;small.innerHTML=`${label}<br>${kb} KB｜${ctns} 個 CTN候選`;}

  async function runBatch(){
    if(busy)return;
    if(!ready){const ok=await preflight(true);if(!ok)return;}
    const batchId=activeBatch();
    if(!batchId)return toastMsg("找不到目前 IQC 影像批次",true);
    let photos=await getPhotos(batchId);
    if(!photos.length)return toastMsg("請先加入 Honeywell 照片",true);
    busy=true;
    const btn=analyzeBtn();if(btn)btn.disabled=true;
    let success=0,failed=0;
    try{
      for(let i=0;i<photos.length;i++){
        const p=photos[i];
        if(p.status==="RECOGNIZED"&&String(p.ocrText||"").trim()){success++;paintPhoto(p,qualityLabel(p.ocrText));continue;}
        let prepared=null;
        try{
          p.status="PROCESSING";p.localFailure="";p.updatedAt=nowIso();
          await putPhoto(p);
          paintPhoto(p,"辨識中");
          setProgress(`第 ${i+1}/${photos.length} 張：Local OCR 執行中…`,Math.round(i/photos.length*100));
          prepared=await preprocessForOcr(p.blob);
          const result=await recognizeProvenPipeline(prepared,i+1),text=String(result?.data?.text||"").trim();
          if(!text)throw new Error("Local OCR 無可用文字");
          p.ocrText=text;
          p.engineConfidence=Number(result?.data?.dsEngineConfidence??result?.data?.confidence??0);
          p.confidence=p.engineConfidence;
          p.events=parseEvents(text);
          p.status="RECOGNIZED";
          p.localFailure="";
          p.updatedAt=nowIso();
          await putPhoto(p);
          success++;
          paintPhoto(p,qualityLabel(text));
        }catch(err){
          failed++;
          p.status="LOCAL_FAILED";p.ocrText="";p.confidence=0;p.engineConfidence=0;p.events=[];
          p.localFailure=String(err?.message||err||"LOCAL_OCR_FAILED");p.updatedAt=nowIso();
          try{await putPhoto(p);}catch(writeErr){console.error("[IQC V25 failure write]",writeErr);}
          paintPhoto(p,"Local 失敗｜待 AI/複查");
          setProgress(`第 ${i+1} 張 Local 失敗：${p.localFailure}；已記錄並繼續下一張。`);
        }finally{
          prepared=null;
          if(i<photos.length-1){setProgress(`第 ${i+1} 張已結束，釋放 OCR 資源後再處理下一張…`);await sleep(BETWEEN_PHOTO_MS);}
        }
      }
      setProgress(`完成：Local 成功 ${success} 張、失敗 ${failed} 張；是否需要 Cloud 交由 V21 依資料缺口判定。`,100);
      setBadge(failed?`Local ${success}/${photos.length}｜${failed} 張待補`:`Local ${success}/${photos.length} 完成`,false,!failed);
      toastMsg(failed?`本機 OCR 完成：${success} 張成功、${failed} 張待第二讀者`:`本機 OCR ${success} 張全部完成`);
    }catch(err){
      const message=String(err?.message||err||"UNKNOWN_BATCH_ERROR");
      console.error("[IQC V25 batch]",err);
      setBadge("Local OCR 批次控制失敗",true);
      setProgress(`批次控制失敗：${message}。照片仍保留，可再次辨識。`);
      toastMsg(`Local OCR 批次控制失敗：${message}`,true);
    }finally{
      busy=false;if(btn)btn.disabled=false;
      try{await window.__DS_IQC_IMAGE_RC?.open?.();}catch(_){ }
      try{await window.__DS_IQC_META_GROUPING_V8?.refresh?.();}catch(_){ }
      patchAutoMeta();
    }
  }

  document.addEventListener("click",event=>{const btn=event.target.closest?.("#iqcRcAnalyze");if(!btn)return;event.preventDefault();event.stopImmediatePropagation();if(!ready){preflight(true).then(ok=>{if(ok)runBatch();});return;}runBatch().catch(err=>console.error("[IQC V25]",err));},true);
  document.addEventListener("click",e=>{if(e.target.closest?.("#iqcImageRcTool,#iqcRcNewBatch"))setTimeout(()=>{patchAutoMeta();if(panelVisible())preflight(false);},180);},true);
  const observer=new MutationObserver(()=>patchAutoMeta());observer.observe(document.documentElement,{subtree:true,childList:true});
  setInterval(()=>{patchAutoMeta();if(panelVisible()&&!ready&&!preflightPromise)preflight(false);},700);
  patchAutoMeta();const initialBtn=analyzeBtn();if(initialBtn){initialBtn.disabled=true;initialBtn.textContent="OCR 準備中…";}setBadge("OCR 準備待命");
  window.__DS_IQC_INTAKE_RUNTIME_V25={version:VERSION,runBatch,patchAutoMeta,preflight,isReady:()=>ready,structuralState};
})();

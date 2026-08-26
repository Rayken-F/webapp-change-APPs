"use strict";

(function installIqcSinglePhotoBatchV31(){
  const VERSION="IQC_SINGLE_PHOTO_BATCH_RC_V31_20260826";
  const DB_NAME="ds_iqc_image_rc_v1";
  const DB_VERSION=1;
  const ACTIVE_BATCH_KEY="ds_iqc_image_rc_active_batch";
  const TESSERACT_WORKER="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js";
  const TESSERACT_CORE="https://cdn.jsdelivr.net/npm/tesseract.js-core@5";
  const TESSERACT_LANG="https://tessdata.projectnaptha.com/4.0.0";
  const INIT_TIMEOUT_MS=45000;
  const RECOGNIZE_TIMEOUT_MS=55000;
  const ATTEMPTED_PREFIX="ds_iqc_hybrid_v15_local_attempted_";
  if(window.__DS_IQC_SINGLE_PHOTO_V31)return;

  let busyPhotoId="";
  const nowIso=()=>new Date().toISOString();
  const activeBatch=()=>String(localStorage.getItem(ACTIVE_BATCH_KEY)||"").trim();
  const clean=v=>String(v||"").trim().toUpperCase();

  function toastMsg(message,error=false){
    try{if(typeof toast==="function")return toast(message,error);}catch(_){ }
    console[error?"error":"log"]("[IQC V31]",message);
  }
  function setBadge(text,bad=false,good=false){
    const el=document.getElementById("iqcRcOcrBadge");
    if(!el)return;
    el.textContent=text;
    el.className=`iqc-rc-status ${bad?"bad":good?"good":"warn"}`;
  }
  function setProgress(text,pct=null){
    const el=document.getElementById("iqcRcProgressText");
    if(el)el.textContent=text;
    if(pct!==null){
      const bar=document.getElementById("iqcRcProgressBar");
      if(bar)bar.style.width=`${Math.max(0,Math.min(100,pct))}%`;
    }
  }
  function withTimeout(promise,ms,label){
    let timer;
    const timeout=new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error(`${label}超過 ${Math.round(ms/1000)} 秒`)),ms);
    });
    return Promise.race([promise,timeout]).finally(()=>clearTimeout(timer));
  }

  function openDb(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error("IndexedDB 開啟失敗"));
    });
  }
  function getPhotos(batchId){
    return openDb().then(db=>new Promise((resolve,reject)=>{
      const tx=db.transaction("photos","readonly");
      const req=tx.objectStore("photos").index("batchId").getAll(batchId);
      req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>Number(a.seq)-Number(b.seq)));
      req.onerror=()=>reject(req.error||new Error("讀取照片失敗"));
      tx.oncomplete=()=>db.close();
    }));
  }
  function getPhoto(photoId){
    return openDb().then(db=>new Promise((resolve,reject)=>{
      const tx=db.transaction("photos","readonly");
      const req=tx.objectStore("photos").get(photoId);
      req.onsuccess=()=>resolve(req.result||null);
      req.onerror=()=>reject(req.error||new Error("讀取照片失敗"));
      tx.oncomplete=()=>db.close();
    }));
  }
  function putPhoto(photo){
    return openDb().then(db=>new Promise((resolve,reject)=>{
      const tx=db.transaction("photos","readwrite");
      tx.objectStore("photos").put(photo);
      tx.oncomplete=()=>{db.close();resolve(photo);};
      tx.onerror=()=>{const err=tx.error||new Error("照片狀態寫入失敗");db.close();reject(err);};
      tx.onabort=()=>{const err=tx.error||new Error("照片狀態寫入被中止");db.close();reject(err);};
    }));
  }

  function normalizeCtn(raw){
    const original=clean(raw).replace(/[^A-Z0-9]/g,"");
    if(original.length!==7)return"";
    const a=original.split("");
    const lm={"0":"O","1":"I","2":"Z","5":"S","8":"B","6":"G"};
    const dm={"O":"0","Q":"0","D":"0","I":"1","L":"1","Z":"2","S":"5","B":"8","G":"6","T":"7"};
    [0,1,4,5].forEach(i=>{if(/\d/.test(a[i])&&lm[a[i]])a[i]=lm[a[i]];});
    [2,3].forEach(i=>{if(/[A-Z]/.test(a[i])&&dm[a[i]])a[i]=dm[a[i]];});
    const value=a.join("");
    return /^[A-Z]{2}\d{2}[A-Z]{2}[A-Z0-9]$/.test(value)?value:"";
  }
  function normalizeRt(raw){
    const src=clean(raw).replace(/[^A-Z0-9]/g,"");
    const map={"O":"0","Q":"0","D":"0","I":"1","L":"1","Z":"2","S":"5","B":"8","G":"6","T":"7"};
    const digits=src.split("").map(c=>/\d/.test(c)?c:(map[c]||"?")).join("");
    return /^\d{5,8}$/.test(digits)?digits:"";
  }
  function readHeader(upper){
    const first=upper.match(/^\s*([A-Z0-9]{5,8})\b/);
    if(!first)return null;
    const rt=normalizeRt(first[1]);
    if(!rt)return null;
    const tokens=upper.match(/[A-Z0-9]+/g)||[];
    let marker=tokens.findIndex(t=>t==="CYLINDER"||t==="CYL"),status="",plant="";
    if(marker>=0){
      const a=String(tokens[marker+1]||""),b=String(tokens[marker+2]||"");
      if(/^[A-Z][A-Z0-9]{2,9}$/.test(a)&&!/^\d+$/.test(a))status=a;
      if(/^(?=.*\d)[A-Z0-9]{3,8}$/.test(b))plant=b;
      if(!plant&&/^(?=.*\d)[A-Z0-9]{3,8}$/.test(a)){plant=a;status="";}
    }else{
      const oi=tokens.findIndex((t,i)=>i>0&&/^(?:OCYL|MNT1|[A-Z]{2,5}\d{0,2})$/.test(t));
      if(oi<0)return null;
      status=String(tokens[oi]||"");
      const b=String(tokens[oi+1]||"");
      if(/^(?=.*\d)[A-Z0-9]{3,8}$/.test(b))plant=b;
    }
    const nums=upper.match(/\b\d{1,3}\b/g)||[];
    let expected=0;
    for(let i=nums.length-1;i>=0;i--){const n=Number(nums[i]);if(n>0&&n<=200){expected=n;break;}}
    return{rt,status,plant,expected};
  }
  function parseText(text){
    const lines=String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean),groups=[],leading=[];
    let current=null;
    for(const line of lines){
      const upper=line.toUpperCase().replace(/[|]/g," "),header=readHeader(upper);
      if(header){current={...header,ctns:[]};groups.push(current);continue;}
      if(/^RT[_\s]/.test(upper)||((upper.match(/_/g)||[]).length>=2))continue;
      const tokens=upper.split(/[^A-Z0-9]+/).filter(Boolean),ctns=[];
      tokens.forEach(token=>{const c=normalizeCtn(token);if(c&&!ctns.includes(c))ctns.push(c);});
      ctns.forEach(ctn=>{if(current){if(!current.ctns.includes(ctn))current.ctns.push(ctn);}else if(!leading.includes(ctn))leading.push(ctn);});
    }
    return{groups,leading};
  }
  function sameGroup(a,b){
    if(!a||!b||a.rt!==b.rt)return false;
    if(a.status&&b.status&&a.status!==b.status)return false;
    if(a.plant&&b.plant&&a.plant!==b.plant)return false;
    return true;
  }
  function parseScore(parsed){
    const groups=parsed?.groups||[];
    const expected=groups.filter(g=>g.expected>0).length;
    const ctns=groups.reduce((n,g)=>n+(g.ctns||[]).length,0);
    return groups.length*100+expected*30+ctns*2;
  }
  function mergeParsedPasses(results){
    const passes=results.map(r=>({parsed:parseText(r?.data?.text||"")}));
    if(!passes.length)return"";
    passes.sort((a,b)=>parseScore(b.parsed)-parseScore(a.parsed));
    const skeleton=passes[0].parsed;
    const groups=(skeleton.groups||[]).map(g=>({...g,ctns:Array.from(new Set(g.ctns||[]))}));
    const candidates=new Map();
    const ensure=ctn=>{if(!candidates.has(ctn))candidates.set(ctn,{total:0,byGroup:new Map()});return candidates.get(ctn);};
    passes.forEach(({parsed})=>{
      (parsed.groups||[]).forEach(pg=>{
        const matches=groups.map((g,i)=>sameGroup(g,pg)?i:-1).filter(i=>i>=0);
        if(matches.length!==1)return;
        const gi=matches[0],dst=groups[gi];
        (pg.ctns||[]).forEach(ctn=>{const rec=ensure(ctn);rec.total++;rec.byGroup.set(gi,(rec.byGroup.get(gi)||0)+1);});
        if(!dst.expected&&pg.expected)dst.expected=pg.expected;
        if(!dst.status&&pg.status)dst.status=pg.status;
        if(!dst.plant&&pg.plant)dst.plant=pg.plant;
      });
    });
    groups.forEach((g,gi)=>{
      const selected=new Set(g.ctns),ranked=[];
      candidates.forEach((rec,ctn)=>{
        const here=rec.byGroup.get(gi)||0;if(!here)return;
        let bestOther=0;rec.byGroup.forEach((v,k)=>{if(k!==gi)bestOther=Math.max(bestOther,v);});
        if(bestOther>here)return;
        ranked.push({ctn,here,total:rec.total,conflict:bestOther===here&&bestOther>0});
      });
      ranked.sort((a,b)=>b.here-a.here||b.total-a.total||a.ctn.localeCompare(b.ctn));
      ranked.forEach(item=>{if(!item.conflict)selected.add(item.ctn);});
      g.ctns=Array.from(selected);
    });
    const lines=[];
    groups.forEach(g=>{lines.push([g.rt,"CYLINDER",g.status||"UNKNOWN",g.plant||"UNKNOWN","TOTAL",String(g.expected||0)].join(" "));g.ctns.forEach(ctn=>lines.push(ctn));});
    if(!groups.length){const leading=new Set();passes.forEach(p=>(p.parsed.leading||[]).forEach(ctn=>leading.add(ctn)));leading.forEach(ctn=>lines.push(ctn));}
    return lines.join("\n");
  }
  function structuralState(text){
    const parsed=parseText(text),groups=parsed.groups||[],leading=parsed.leading||[];
    if(groups.length){
      const complete=groups.every(g=>!!g.rt&&!!g.status&&!!g.plant&&Number(g.expected||0)>0&&(g.ctns||[]).length>=Number(g.expected||0));
      const found=groups.reduce((n,g)=>n+(g.ctns||[]).length,0);
      const expected=groups.reduce((n,g)=>n+Number(g.expected||0),0);
      return{kind:complete?"COMPLETE":"GROUP_GAP",complete,groups,leading,found,expected};
    }
    if(leading.length)return{kind:"CONTINUATION",complete:false,groups,leading,found:leading.length,expected:0};
    return{kind:"NO_DATA",complete:false,groups,leading,found:0,expected:0};
  }
  function needsSparse(text){return !structuralState(text).complete;}
  function needsHighContrast(text){const s=structuralState(text);if(s.complete)return false;if(s.kind==="CONTINUATION"&&s.found>0)return false;return true;}
  function qualityLabel(text){
    const s=structuralState(text);
    if(s.kind==="COMPLETE")return`資料完整｜${s.found}/${s.expected}`;
    if(s.kind==="GROUP_GAP")return`已辨識｜${s.found}/${s.expected}｜可再加下一張`;
    if(s.kind==="CONTINUATION")return`已辨識｜${s.found} CTN（續頁）`;
    return"已辨識｜待複查";
  }
  function parseEvents(text){
    const events=[];
    String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean).forEach((line,lineIndex)=>{
      const upper=clean(line).replace(/[|]/g," "),h=readHeader(upper);
      if(h){events.push({type:"header",rt:h.rt,expected:h.expected,line:upper,lineIndex});return;}
      if(/^RT[_\s]/.test(upper)||((upper.match(/_/g)||[]).length>=2))return;
      upper.split(/[^A-Z0-9]+/).filter(Boolean).forEach(token=>{const ctn=normalizeCtn(token);if(ctn)events.push({type:"ctn",ctn,raw:token,corrected:ctn!==token,lineIndex});});
    });
    return events;
  }

  async function createBitmap(blob){
    if(typeof createImageBitmap==="function"){try{return await createImageBitmap(blob,{imageOrientation:"from-image"});}catch(_){ }}
    return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(blob);img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};img.onerror=e=>{URL.revokeObjectURL(url);reject(e||new Error("圖片解碼失敗"));};img.src=url;});
  }
  async function preprocessForOcr(blob){
    let b=null,c=null;
    try{
      b=await createBitmap(blob);c=document.createElement("canvas");c.width=b.width;c.height=b.height;
      const ctx=c.getContext("2d",{willReadFrequently:true,alpha:false});ctx.drawImage(b,0,0);
      try{b.close?.();}catch(_){ }b=null;
      const im=ctx.getImageData(0,0,c.width,c.height),d=im.data;
      for(let i=0;i<d.length;i+=4){const y=.299*d[i]+.587*d[i+1]+.114*d[i+2],v=Math.max(0,Math.min(255,(y-128)*1.28+138));d[i]=d[i+1]=d[i+2]=v;}
      ctx.putImageData(im,0,0);
      return await new Promise(resolve=>c.toBlob(x=>resolve(x||blob),"image/jpeg",.86));
    }finally{
      try{b?.close?.();}catch(_){ }
      if(c){c.width=1;c.height=1;c.remove();}
    }
  }
  async function makeVariant(image){
    let src=null,canvas=null;
    try{
      src=await createBitmap(image);
      const sw=Number(src.width||src.naturalWidth||0),sh=Number(src.height||src.naturalHeight||0);
      if(!sw||!sh)throw new Error("影像尺寸無效");
      const sx=Math.round(sw*.04),sy=Math.round(sh*.06),cw=Math.round(sw*.92),ch=Math.round(sh*.92),scale=Math.min(1.5,2100/Math.max(cw,ch)),w=Math.max(1,Math.round(cw*scale)),h=Math.max(1,Math.round(ch*scale));
      canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext("2d",{willReadFrequently:true,alpha:false});ctx.drawImage(src,sx,sy,cw,ch,0,0,w,h);
      try{src.close?.();}catch(_){ }src=null;
      const im=ctx.getImageData(0,0,w,h),d=im.data;
      for(let i=0;i<d.length;i+=4){const y=.299*d[i]+.587*d[i+1]+.114*d[i+2],v=y>182?255:(y>104?Math.min(255,Math.round((y-104)*3.1)):0);d[i]=d[i+1]=d[i+2]=v;}
      ctx.putImageData(im,0,0);
      return await new Promise(resolve=>canvas.toBlob(b=>resolve(b||image),"image/jpeg",.9));
    }finally{
      try{src?.close?.();}catch(_){ }
      if(canvas){canvas.width=1;canvas.height=1;canvas.remove();}
    }
  }
  async function nativeWorker(photoNo){
    const create=window.__DS_TESSERACT_NATIVE_CREATE_WORKER_V24;
    if(typeof create!=="function")throw new Error("OCR 原生 Worker 未載入");
    const w=await withTimeout(create("eng",1,{workerPath:TESSERACT_WORKER,corePath:TESSERACT_CORE,langPath:TESSERACT_LANG,logger:m=>{if(typeof m?.progress==="number")setProgress(`第 ${photoNo} 張｜${m.status||"OCR"} ${Math.round(m.progress*100)}%`,Math.round(m.progress*100));}}),INIT_TIMEOUT_MS,"OCR Worker 初始化");
    await w.setParameters({tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_:-. ",preserve_interword_spaces:"1",tessedit_pageseg_mode:"6"});
    return w;
  }
  async function recognizeOne(image,photoNo){
    let worker=null;const results=[];
    try{
      worker=await nativeWorker(photoNo);
      await worker.setParameters({tessedit_pageseg_mode:"6"});
      const primary=await withTimeout(worker.recognize(image),RECOGNIZE_TIMEOUT_MS,"主辨識");
      results.push(primary);
      let merged=mergeParsedPasses(results)||String(primary?.data?.text||"");
      if(needsSparse(merged)){
        setProgress(`第 ${photoNo} 張有結構缺口，補跑 Sparse Text。`);
        await worker.setParameters({tessedit_pageseg_mode:"11"});
        try{results.push(await withTimeout(worker.recognize(image),RECOGNIZE_TIMEOUT_MS,"Sparse 補辨識"));}catch(err){console.warn("[IQC V31 sparse]",err);}
        merged=mergeParsedPasses(results)||merged;
      }
      if(needsHighContrast(merged)){
        setProgress(`第 ${photoNo} 張仍有結構缺口，最後跑裁切高對比辨識。`);
        try{
          const variant=await makeVariant(image);
          await worker.setParameters({tessedit_pageseg_mode:"6"});
          results.push(await withTimeout(worker.recognize(variant),RECOGNIZE_TIMEOUT_MS,"高對比補辨識"));
          merged=mergeParsedPasses(results)||merged;
        }catch(err){console.warn("[IQC V31 high contrast]",err);}
      }
      return{text:merged,engineConfidence:Number(primary?.data?.confidence||0),passCount:results.length};
    }finally{
      try{await worker?.terminate?.();}catch(_){ }
      results.length=0;
    }
  }

  async function refreshPanel(){
    try{await window.__DS_IQC_IMAGE_RC?.open?.();}catch(_){ }
    try{await window.__DS_IQC_META_GROUPING_V8?.refresh?.();}catch(_){ }
    setTimeout(patchUi,80);
  }

  function attemptedKey(batchId){return ATTEMPTED_PREFIX+batchId;}
  async function escalateFailedPhoto(batchId){
    const hybrid=window.__DS_IQC_HYBRID_V21||window.__DS_IQC_HYBRID_V15;
    if(!hybrid)return;
    localStorage.setItem(attemptedKey(batchId),"1");
    try{
      await hybrid.queueSelectiveForAi?.(batchId,"V31_SINGLE_PHOTO_LOCAL_FAILED");
      if(navigator.onLine)await hybrid.syncAiQueue?.({manual:false});
    }catch(err){console.warn("[IQC V31 cloud handoff]",err);}
  }

  async function runPhoto(photoId){
    if(busyPhotoId)return toastMsg("目前已有一張照片正在辨識，請等它完成",true);
    const batchId=activeBatch();
    if(!batchId)return toastMsg("找不到目前 IQC 批次",true);
    const p=await getPhoto(photoId);
    if(!p)return toastMsg("找不到這張照片",true);
    if(p.status==="RECOGNIZED"&&String(p.ocrText||"").trim())return toastMsg(`第 ${p.seq} 張已完成並鎖定`);
    busyPhotoId=photoId;
    let prepared=null;
    try{
      p.status="PROCESSING";p.localFailure="";p.updatedAt=nowIso();
      await putPhoto(p);patchUi();
      setBadge(`第 ${p.seq} 張辨識中`);
      setProgress(`第 ${p.seq} 張：只處理這一張，其他照片保持鎖定。`,5);
      prepared=await preprocessForOcr(p.blob);
      const result=await recognizeOne(prepared,p.seq),text=String(result.text||"").trim();
      if(!text)throw new Error("Local OCR 無可用文字");
      p.localOcrText=text;p.ocrText=text;
      p.engineConfidence=Number(result.engineConfidence||0);p.confidence=p.engineConfidence;
      p.events=parseEvents(text);p.status="RECOGNIZED";p.localFailure="";p.localStrategy="V31_SINGLE_PHOTO";p.updatedAt=nowIso();
      await putPhoto(p);
      setBadge(`第 ${p.seq} 張 Local 完成`,false,true);
      setProgress(`${qualityLabel(text)}。結果已寫回本批；可加入／辨識下一張。`,100);
      toastMsg(`第 ${p.seq} 張 Local OCR 完成`);
      await refreshPanel();
    }catch(err){
      const message=String(err?.message||err||"LOCAL_OCR_FAILED");
      p.status="LOCAL_FAILED";p.localOcrText="";p.ocrText="";p.confidence=0;p.engineConfidence=0;p.events=[];p.localFailure=message;p.localStrategy="V31_SINGLE_PHOTO";p.updatedAt=nowIso();
      try{await putPhoto(p);}catch(writeErr){console.error("[IQC V31 failure write]",writeErr);}
      setBadge(`第 ${p.seq} 張 Local NG`,true);
      setProgress(`第 ${p.seq} 張 Local 失敗：${message}。只交這個缺口給 Hybrid 第二讀者，不重跑其他照片。`);
      toastMsg(`第 ${p.seq} 張 Local NG，轉第二讀者`,true);
      await refreshPanel();
      await escalateFailedPhoto(batchId);
    }finally{
      prepared=null;busyPhotoId="";patchUi();
    }
  }

  async function finalizeBatch(){
    if(busyPhotoId)return toastMsg("單張辨識尚未完成",true);
    const batchId=activeBatch();if(!batchId)return;
    const photos=await getPhotos(batchId);
    if(!photos.length)return toastMsg("本批尚未加入照片",true);
    if(photos.some(p=>p.status==="PROCESSING"))return toastMsg("仍有照片處理中",true);
    const waiting=photos.filter(p=>!["RECOGNIZED","LOCAL_FAILED"].includes(String(p.status||"")));
    if(waiting.length)return toastMsg(`還有 ${waiting.length} 張尚未辨識，請逐張完成`,true);
    const hybrid=window.__DS_IQC_HYBRID_V21||window.__DS_IQC_HYBRID_V15;
    if(!hybrid)return toastMsg("Hybrid 第二讀者尚未載入",true);
    localStorage.setItem(attemptedKey(batchId),"1");
    setProgress("正在做整批免費對帳；只有仍有資料缺口時才挑最少必要照片送 Cloud。",100);
    try{
      await window.__DS_IQC_META_GROUPING_V8?.refresh?.();
      const selected=await hybrid.selectCloudCandidate?.(batchId)||[];
      if(!selected.length){
        setBadge("整批 Local PASS",false,true);
        setProgress("整批對帳完成：目前沒有照片需要 Cloud。",100);
        toastMsg("整批 Local PASS，Cloud 0 張");
        return;
      }
      const n=await hybrid.queueSelectiveForAi?.(batchId,"V31_FINAL_BATCH_RECONCILE");
      setBadge(`Hybrid 補洞 ${selected.length} 張`);
      setProgress(n?`整批仍有缺口：先升級最少必要的 1 張至 AI_PENDING；Cloud 回來後再重新對帳。`:`缺口照片已在 AI Queue，等待補完。`,100);
      if(navigator.onLine)await hybrid.syncAiQueue?.({manual:false});
    }catch(err){
      setBadge("整批檢查失敗",true);
      setProgress(`整批檢查失敗：${String(err?.message||err)}。照片與已辨識結果仍保留。`);
    }
  }

  function installStyle(){
    if(document.getElementById("iqcV31Style"))return;
    const s=document.createElement("style");s.id="iqcV31Style";
    s.textContent=`#iqcRcAnalyze{display:none!important}.iqc-v31-photo-btn{margin-top:7px;min-height:34px!important;padding:6px 10px!important;font-size:11px}.iqc-v31-photo-btn.done{color:#baffd1;border-color:rgba(88,214,141,.35)}#iqcV31Finalize{width:100%;margin-top:10px}.iqc-v31-mode-note{margin-top:8px;padding:9px 10px;border-radius:12px;background:rgba(67,198,232,.08);border:1px solid rgba(67,198,232,.22);color:#cceffc;font-size:11px;line-height:1.55}`;
    document.head.appendChild(s);
  }

  async function patchPhotoButtons(){
    const batchId=activeBatch();if(!batchId)return;
    const photos=await getPhotos(batchId).catch(()=>[]);
    const bySeq=new Map(photos.map(p=>[String(p.seq),p]));
    document.querySelectorAll("#iqcRcPhotoList .iqc-photo").forEach(card=>{
      const title=String(card.querySelector("strong")?.textContent||"");
      const m=title.match(/第\s*(\d+)\s*張/);if(!m)return;
      const p=bySeq.get(m[1]);if(!p)return;
      const meta=card.querySelector(".meta");if(!meta)return;
      let btn=meta.querySelector(".iqc-v31-photo-btn");
      if(!btn){btn=document.createElement("button");btn.type="button";btn.className="iqc-rc-btn iqc-v31-photo-btn";meta.appendChild(btn);}
      btn.dataset.v31PhotoId=p.id;
      if(busyPhotoId===p.id||p.status==="PROCESSING"){btn.disabled=true;btn.className="iqc-rc-btn iqc-v31-photo-btn";btn.textContent="辨識中…";}
      else if(p.status==="RECOGNIZED"&&String(p.ocrText||"").trim()){btn.disabled=true;btn.className="iqc-rc-btn iqc-v31-photo-btn done";btn.textContent="✓ Local 已鎖定";}
      else if(p.status==="LOCAL_FAILED"){btn.disabled=false;btn.className="iqc-rc-btn iqc-v31-photo-btn";btn.textContent="重試此張 Local";}
      else{btn.disabled=false;btn.className="iqc-rc-btn good iqc-v31-photo-btn";btn.textContent="辨識此張";}
    });
  }

  function patchUi(){
    installStyle();
    const panel=document.getElementById("iqcImageRc");if(!panel)return;
    const gallery=document.getElementById("iqcRcGalleryInput");if(gallery)gallery.removeAttribute("multiple");
    const galleryBtn=document.getElementById("iqcRcGalleryBtn");if(galleryBtn)galleryBtn.textContent="🖼️ 相簿選1張";
    const section=document.getElementById("iqcRcAnalyze")?.closest?.(".iqc-rc-card");
    if(section){
      const strong=section.querySelector(".iqc-rc-row strong");if(strong)strong.textContent="2. 單張辨識＋批次累積";
      let note=document.getElementById("iqcV31ModeNote");
      if(!note){note=document.createElement("div");note.id="iqcV31ModeNote";note.className="iqc-v31-mode-note";note.textContent="V31：一次只辨識 1 張。成功結果鎖定在同一批次；再加入下一張即可跨頁累積。Local 成功但數量尚未湊齊時不急著送 Cloud。";section.insertBefore(note,document.getElementById("iqcRcResultList"));}
      if(!document.getElementById("iqcV31Finalize")){
        const btn=document.createElement("button");btn.id="iqcV31Finalize";btn.type="button";btn.className="iqc-rc-btn primary";btn.textContent="完成照片加入｜檢查整批";btn.addEventListener("click",finalizeBatch);section.appendChild(btn);
      }
    }
    const banner=panel.querySelector(".iqc-rc-banner");if(banner&&!banner.dataset.v31){banner.dataset.v31="1";banner.insertAdjacentHTML("beforeend",`<br><strong>${VERSION}</strong>｜單張 OCR、同批累積、最後才做最小必要 Cloud 補洞。`);}
    setBadge(busyPhotoId?"單張辨識中":"單張模式就緒",false,!busyPhotoId);
    patchPhotoButtons();
  }

  document.addEventListener("click",event=>{
    const btn=event.target.closest?.(".iqc-v31-photo-btn");if(!btn)return;
    event.preventDefault();event.stopImmediatePropagation();runPhoto(btn.dataset.v31PhotoId).catch(err=>console.error("[IQC V31]",err));
  },true);
  document.addEventListener("click",event=>{if(event.target.closest?.("#iqcImageRcTool,#iqcRcCameraBtn,#iqcRcGalleryBtn,#iqcRcNewBatch"))setTimeout(patchUi,180);},true);
  const observer=new MutationObserver(()=>patchUi());observer.observe(document.documentElement,{subtree:true,childList:true});
  setInterval(patchUi,900);
  patchUi();

  window.__DS_IQC_SINGLE_PHOTO_V31={version:VERSION,runPhoto,finalizeBatch,patchUi};
})();

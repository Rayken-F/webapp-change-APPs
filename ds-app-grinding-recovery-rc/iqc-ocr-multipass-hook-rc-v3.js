"use strict";

(function installIqcOcrMultipassHookRcV10(){
  const VERSION="IQC_OCR_MULTIPASS_HOOK_RC_V10_20260823";
  const INIT_TIMEOUT_MS=45000;
  const MAX_INIT_ATTEMPTS=2;
  if(window.__DS_IQC_OCR_MULTIPASS_V10)return;
  if(!window.Tesseract||typeof window.Tesseract.createWorker!=="function"){
    console.warn("[IQC OCR V10] Tesseract 尚未載入");
    return;
  }

  const originalCreateWorker=window.Tesseract.createWorker.bind(window.Tesseract);
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function setInitBadge(text,bad=false){
    const badge=document.getElementById("iqcRcOcrBadge");
    if(badge){badge.textContent=text;badge.className=`iqc-rc-status ${bad?"bad":"warn"}`;}
  }
  function setInitProgress(text){
    const el=document.getElementById("iqcRcProgressText");
    if(el)el.textContent=text;
  }
  function normalizeCtn(raw){
    const original=String(raw||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
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
    const src=String(raw||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    const map={"O":"0","Q":"0","D":"0","I":"1","L":"1","Z":"2","S":"5","B":"8","G":"6","T":"7"};
    const digits=src.split("").map(c=>/\d/.test(c)?c:(map[c]||"?")).join("");
    return /^\d{5,8}$/.test(digits)?digits:"";
  }
  function readHeader(upper){
    const first=upper.match(/^\s*([A-Z0-9]{5,8})\b/);
    if(!first||!/(?:^|\s)(CYLINDER|CYL)(?:\s|$)/.test(upper))return null;
    const rt=normalizeRt(first[1]);if(!rt)return null;
    const tokens=upper.match(/[A-Z0-9]+/g)||[];
    const cylIndex=tokens.findIndex(t=>t==="CYLINDER"||t==="CYL");
    let status="",plant="";
    if(cylIndex>=0){
      const a=String(tokens[cylIndex+1]||""),b=String(tokens[cylIndex+2]||"");
      if(/^[A-Z][A-Z0-9]{2,9}$/.test(a)&&!/^\d+$/.test(a))status=a;
      if(/^(?=.*\d)[A-Z0-9]{3,8}$/.test(b))plant=b;
      if(!plant&&/^(?=.*\d)[A-Z0-9]{3,8}$/.test(a)){plant=a;status="";}
    }
    const nums=upper.match(/\b\d{1,3}\b/g)||[];let expected=0;
    for(let i=nums.length-1;i>=0;i--){const n=Number(nums[i]);if(n>0&&n<=200){expected=n;break;}}
    return{rt,status,plant,expected};
  }
  function parsePass(text){
    const lines=String(text||"").split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
    const leading=[],groups=[];let current=null;
    lines.forEach(line=>{
      const upper=line.toUpperCase().replace(/[|]/g," ");
      const header=readHeader(upper);
      if(header){current={...header,ctns:[]};groups.push(current);return;}
      const compact=upper.replace(/[^A-Z0-9]/g,"");
      const ctn=normalizeCtn(compact);if(!ctn)return;
      if(current){if(!current.ctns.includes(ctn))current.ctns.push(ctn);}else if(!leading.includes(ctn))leading.push(ctn);
    });
    return{leading,groups};
  }
  function sameLogicalGroup(a,b){
    if(!a||!b||a.rt!==b.rt)return false;
    if(a.status&&b.status&&a.status!==b.status)return false;
    if(a.plant&&b.plant&&a.plant!==b.plant)return false;
    return true;
  }
  function mergeConservative(results){
    const parsed=results.map(r=>parsePass(r?.data?.text||""));
    let base=parsed[0];if(!base?.groups?.length)base=parsed.find(p=>p.groups.length)||{leading:[],groups:[]};
    const groups=(base.groups||[]).map(g=>({...g,expected:Number(g.expected||0),ctns:Array.from(new Set(g.ctns||[]))}));
    const owner=new Map();groups.forEach((g,gi)=>g.ctns.forEach(ctn=>{if(!owner.has(ctn))owner.set(ctn,gi);}));
    for(let pi=1;pi<parsed.length;pi++){
      for(const sg of parsed[pi].groups||[]){
        const candidates=groups.map((g,idx)=>sameLogicalGroup(g,sg)?idx:-1).filter(idx=>idx>=0);
        if(candidates.length!==1)continue;
        const gi=candidates[0],dst=groups[gi];
        if(!dst.status&&sg.status)dst.status=sg.status;if(!dst.plant&&sg.plant)dst.plant=sg.plant;if(!dst.expected&&sg.expected)dst.expected=Number(sg.expected||0);
        const missing=dst.expected?Math.max(0,dst.expected-dst.ctns.length):Infinity;if(missing<=0)continue;
        const extras=(sg.ctns||[]).filter(ctn=>!dst.ctns.includes(ctn)&&!owner.has(ctn));
        if(dst.expected&&extras.length>missing)continue;
        extras.slice(0,missing).forEach(ctn=>{dst.ctns.push(ctn);owner.set(ctn,gi);});
      }
    }
    const lines=[];(base.leading||[]).forEach(ctn=>lines.push(ctn));
    groups.forEach(g=>{lines.push([g.rt,"CYLINDER",g.status||"UNKNOWN",g.plant||"UNKNOWN","TOTAL",String(g.expected||0)].join(" "));g.ctns.forEach(ctn=>lines.push(ctn));});
    return lines.join("\n");
  }
  function needsSupplement(result){
    const confidence=Number(result?.data?.confidence||0),parsed=parsePass(result?.data?.text||"");
    if(!parsed.groups.length||confidence<82)return true;
    return parsed.groups.some(g=>g.expected&&g.ctns.length!==Number(g.expected));
  }
  async function bitmapFrom(image){
    if(typeof createImageBitmap==="function"){try{return await createImageBitmap(image,{imageOrientation:"from-image"});}catch(_){}}
    if(image instanceof Blob)return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(image);img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};img.onerror=e=>{URL.revokeObjectURL(url);reject(e);};img.src=url;});
    throw new Error("不支援的影像來源");
  }
  async function makeScreenVariant(image,threshold){
    const src=await bitmapFrom(image);const sw=Number(src.width||src.naturalWidth||0),sh=Number(src.height||src.naturalHeight||0);if(!sw||!sh)throw new Error("影像尺寸無效");
    const sx=Math.round(sw*.08),sy=Math.round(sh*.12),cw=Math.round(sw*.84),ch=Math.round(sh*.86),scale=Math.min(1.45,2000/Math.max(cw,ch));
    const w=Math.max(1,Math.round(cw*scale)),h=Math.max(1,Math.round(ch*scale)),canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext("2d",{willReadFrequently:true,alpha:false});ctx.drawImage(src,sx,sy,cw,ch,0,0,w,h);if(src.close)src.close();
    if(threshold){const im=ctx.getImageData(0,0,w,h),d=im.data;for(let i=0;i<d.length;i+=4){const y=.299*d[i]+.587*d[i+1]+.114*d[i+2],v=y>168?255:(y>112?Math.min(255,Math.round((y-112)*3.5)):0);d[i]=d[i+1]=d[i+2]=v;}ctx.putImageData(im,0,0);}
    return new Promise(resolve=>canvas.toBlob(blob=>resolve(blob||image),"image/jpeg",.9));
  }

  async function createWorkerAttempt(args,attempt){
    let timedOut=false;const started=Date.now();
    const pending=originalCreateWorker.apply(window.Tesseract,args);
    const ticker=setInterval(()=>{
      const sec=Math.floor((Date.now()-started)/1000);
      setInitBadge(`OCR 初始化 ${attempt}/${MAX_INIT_ATTEMPTS} · ${sec}s`);
      setInitProgress(`本機 OCR Worker 初始化中：第 ${attempt}/${MAX_INIT_ATTEMPTS} 次，${sec}s / ${Math.round(INIT_TIMEOUT_MS/1000)}s。若超時會自動取消並重試，不會無限卡住。`);
    },1000);
    let timer;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;reject(new Error(`OCR Worker 初始化超過 ${Math.round(INIT_TIMEOUT_MS/1000)} 秒`));},INIT_TIMEOUT_MS);});
    try{return await Promise.race([pending,timeout]);}
    finally{
      clearInterval(ticker);clearTimeout(timer);
      if(timedOut)pending.then(w=>{try{w?.terminate?.();}catch(_){}}).catch(()=>{});
    }
  }
  async function createWorkerWithRetry(args){
    let lastErr=null;
    for(let attempt=1;attempt<=MAX_INIT_ATTEMPTS;attempt++){
      try{return await createWorkerAttempt(args,attempt);}
      catch(err){lastErr=err;console.warn(`[IQC OCR V10] worker init attempt ${attempt} failed`,err);setInitBadge(`OCR 初始化失敗 ${attempt}/${MAX_INIT_ATTEMPTS}`,true);if(attempt<MAX_INIT_ATTEMPTS){setInitProgress(`第 ${attempt} 次初始化失敗，1 秒後自動重試。`);await sleep(1000);}}
    }
    setInitProgress(`OCR 初始化失敗：${lastErr?.message||lastErr||"未知錯誤"}。本次任務已停止，可直接再次按「開始辨識」。`);
    throw lastErr||new Error("OCR worker 初始化失敗");
  }

  window.Tesseract.createWorker=async function(){
    const worker=await createWorkerWithRetry(arguments);
    const rawRecognize=worker.recognize.bind(worker),rawSet=worker.setParameters.bind(worker);let busy=false;
    worker.recognize=async function(image){
      if(busy)return rawRecognize.apply(worker,arguments);
      busy=true;const all=[];let primary=null;
      try{
        primary=await rawRecognize.apply(worker,arguments);all.push(primary);
        if(needsSupplement(primary)){
          try{await rawSet({tessedit_pageseg_mode:"11"});all.push(await rawRecognize(image));}catch(err){console.warn("[IQC OCR V10] sparse pass failed",err);}
          try{const crop=await makeScreenVariant(image,true);await rawSet({tessedit_pageseg_mode:"6"});all.push(await rawRecognize(crop));}catch(err){console.warn("[IQC OCR V10] crop pass failed",err);}
        }
        if(all.length>1&&primary?.data){const merged=mergeConservative(all);if(merged){primary.data.dsPrimaryText=String(primary.data.text||"");primary.data.text=merged;primary.data.dsMultipass=true;primary.data.dsPassCount=all.length;}}
        return primary;
      }finally{try{await rawSet({tessedit_pageseg_mode:"6"});}catch(_){}busy=false;}
    };
    return worker;
  };

  function relabel(){document.querySelectorAll("#iqcImageRc .iqc-photo .meta small").forEach(el=>{if(/已辨識\s*\d+%/.test(el.textContent||""))el.innerHTML=el.innerHTML.replace(/已辨識\s*(\d+)%/g,"OCR原始信心 $1%");});}
  const observer=new MutationObserver(()=>{clearTimeout(observer.t);observer.t=setTimeout(relabel,70);});observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});setInterval(relabel,1000);
  window.__DS_IQC_OCR_MULTIPASS_V10={version:VERSION,parsePass,mergeConservative};
})();

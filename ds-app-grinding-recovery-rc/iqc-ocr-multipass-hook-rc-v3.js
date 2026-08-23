"use strict";

(function installIqcOcrMultipassHookRcV3(){
  const VERSION="IQC_OCR_MULTIPASS_HOOK_RC_V3_20260823";
  if(window.__DS_IQC_OCR_MULTIPASS_V3)return;
  if(!window.Tesseract||typeof window.Tesseract.createWorker!=="function"){
    console.warn("[IQC OCR V3] Tesseract 尚未載入");
    return;
  }

  const originalCreateWorker=window.Tesseract.createWorker.bind(window.Tesseract);
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

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
    const rt=normalizeRt(first[1]);
    if(!rt)return null;
    const tokens=(upper.match(/[A-Z0-9]+/g)||[]);
    let cylIndex=tokens.findIndex(t=>t==="CYLINDER"||t==="CYL");
    let status="",plant="";
    if(cylIndex>=0){
      const a=String(tokens[cylIndex+1]||"");
      const b=String(tokens[cylIndex+2]||"");
      if(/^[A-Z][A-Z0-9]{2,9}$/.test(a)&&!/^\d+$/.test(a))status=a;
      if(/^(?=.*\d)[A-Z0-9]{3,8}$/.test(b))plant=b;
      // 某些 OCR 會漏狀態，但廠區仍緊接 CYLINDER。
      if(!plant&&/^(?=.*\d)[A-Z0-9]{3,8}$/.test(a)){plant=a;status="";}
    }
    const nums=upper.match(/\b\d{1,3}\b/g)||[];
    let expected=0;
    for(let i=nums.length-1;i>=0;i--){const n=Number(nums[i]);if(n>0&&n<=200){expected=n;break;}}
    return {rt,status,plant,expected};
  }

  function groupKey(g){return [g.rt||"",g.status||"",g.plant||""].join("|");}

  function parsePass(text){
    const lines=String(text||"").split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
    const leading=[];const groups=[];let current=null;
    lines.forEach(line=>{
      const upper=line.toUpperCase().replace(/[|]/g," ");
      const header=readHeader(upper);
      if(header){
        current={rt:header.rt,status:header.status,plant:header.plant,expected:header.expected,ctns:[]};
        groups.push(current);return;
      }
      // CTN 補辨識只接受「整行主要就是 CTN」，避免 RT 敘述內 7 碼片段混進來。
      const compact=upper.replace(/[^A-Z0-9]/g,"");
      const ctn=normalizeCtn(compact);
      if(!ctn)return;
      if(current){if(!current.ctns.includes(ctn))current.ctns.push(ctn);}
      else if(!leading.includes(ctn))leading.push(ctn);
    });
    return {leading,groups};
  }

  function sameLogicalGroup(a,b){
    if(!a||!b||a.rt!==b.rt)return false;
    if(a.status&&b.status&&a.status!==b.status)return false;
    if(a.plant&&b.plant&&a.plant!==b.plant)return false;
    return true;
  }

  function mergeConservative(results){
    const parsed=results.map(r=>parsePass(r&&r.data&&r.data.text||""));
    // Primary pass owns segmentation. Supplemental passes may fill missing CTNs but never redraw RT boundaries.
    let base=parsed[0];
    if(!base||!base.groups.length){base=parsed.find(p=>p.groups.length)||{leading:[],groups:[]};}
    const groups=(base.groups||[]).map(g=>({rt:g.rt,status:g.status,plant:g.plant,expected:Number(g.expected||0),ctns:Array.from(new Set(g.ctns||[]))}));
    const owner=new Map();
    groups.forEach((g,gi)=>g.ctns.forEach(ctn=>{if(!owner.has(ctn))owner.set(ctn,gi);}));

    for(let pi=1;pi<parsed.length;pi++){
      const pass=parsed[pi];
      (pass.groups||[]).forEach(sg=>{
        const candidates=groups.map((g,idx)=>sameLogicalGroup(g,sg)?idx:-1).filter(idx=>idx>=0);
        if(candidates.length!==1)return; // 資訊不足時不猜群組。
        const gi=candidates[0],dst=groups[gi];
        if(!dst.status&&sg.status)dst.status=sg.status;
        if(!dst.plant&&sg.plant)dst.plant=sg.plant;
        if(!dst.expected&&sg.expected)dst.expected=Number(sg.expected||0);
        const missing=dst.expected?Math.max(0,dst.expected-dst.ctns.length):Infinity;
        if(missing<=0)return;
        const extras=(sg.ctns||[]).filter(ctn=>!dst.ctns.includes(ctn)&&!owner.has(ctn));
        // 補辨識若候選數比缺口更多，不自動亂選；維持人工/AI 第二讀者複查。
        if(dst.expected&&extras.length>missing)return;
        extras.slice(0,missing).forEach(ctn=>{dst.ctns.push(ctn);owner.set(ctn,gi);});
      });
    }

    const lines=[];
    // 只有 primary 本來就沒有 header 時，leading 才保留作未歸屬提示；不把它塞進任一 RT。
    (base.leading||[]).forEach(ctn=>lines.push(ctn));
    groups.forEach(g=>{
      const meta=[g.rt,"CYLINDER",g.status||"UNKNOWN",g.plant||"UNKNOWN","TOTAL",String(g.expected||0)].join(" ");
      lines.push(meta);
      g.ctns.forEach(ctn=>lines.push(ctn));
    });
    return lines.join("\n");
  }

  function needsSupplement(result){
    const confidence=Number(result&&result.data&&result.data.confidence||0);
    const parsed=parsePass(result&&result.data&&result.data.text||"");
    if(!parsed.groups.length)return true;
    if(confidence<82)return true;
    return parsed.groups.some(g=>g.expected&&g.ctns.length!==Number(g.expected));
  }

  async function bitmapFrom(image){
    if(typeof createImageBitmap==="function"){
      try{return await createImageBitmap(image,{imageOrientation:"from-image"});}catch(_){ }
    }
    if(image instanceof Blob){
      return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(image);img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};img.onerror=e=>{URL.revokeObjectURL(url);reject(e);};img.src=url;});
    }
    throw new Error("不支援的影像來源");
  }

  async function makeScreenVariant(image,threshold){
    const src=await bitmapFrom(image);
    const sw=Number(src.width||src.naturalWidth||0),sh=Number(src.height||src.naturalHeight||0);
    if(!sw||!sh)throw new Error("影像尺寸無效");
    const sx=Math.round(sw*.08),sy=Math.round(sh*.12),cw=Math.round(sw*.84),ch=Math.round(sh*.86);
    const scale=Math.min(1.45,2000/Math.max(cw,ch));
    const w=Math.max(1,Math.round(cw*scale)),h=Math.max(1,Math.round(ch*scale));
    const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext("2d",{willReadFrequently:true,alpha:false});ctx.drawImage(src,sx,sy,cw,ch,0,0,w,h);if(src.close)src.close();
    if(threshold){const im=ctx.getImageData(0,0,w,h),d=im.data;for(let i=0;i<d.length;i+=4){const y=.299*d[i]+.587*d[i+1]+.114*d[i+2];const v=y>168?255:(y>112?Math.min(255,Math.round((y-112)*3.5)):0);d[i]=d[i+1]=d[i+2]=v;}ctx.putImageData(im,0,0);}
    return new Promise(resolve=>canvas.toBlob(blob=>resolve(blob||image),"image/jpeg",.9));
  }

  async function createWorkerWithRetry(args){
    let lastErr=null;
    for(let attempt=1;attempt<=3;attempt++){
      try{return await originalCreateWorker.apply(window.Tesseract,args);}catch(err){lastErr=err;console.warn(`[IQC OCR V3] worker init attempt ${attempt} failed`,err);if(attempt<3)await sleep(attempt===1?900:1800);}
    }
    throw lastErr||new Error("OCR worker 初始化失敗");
  }

  window.Tesseract.createWorker=async function(){
    const worker=await createWorkerWithRetry(arguments);
    const rawRecognize=worker.recognize.bind(worker),rawSet=worker.setParameters.bind(worker);
    let busy=false;
    worker.recognize=async function(image){
      if(busy)return rawRecognize.apply(worker,arguments);
      busy=true;const all=[];let primary=null;
      try{
        primary=await rawRecognize.apply(worker,arguments);all.push(primary);
        if(needsSupplement(primary)){
          try{await rawSet({tessedit_pageseg_mode:"11"});all.push(await rawRecognize(image));}catch(err){console.warn("[IQC OCR V3] sparse pass failed",err);}
          try{const crop=await makeScreenVariant(image,true);await rawSet({tessedit_pageseg_mode:"6"});all.push(await rawRecognize(crop));}catch(err){console.warn("[IQC OCR V3] crop pass failed",err);}
        }
        if(all.length>1&&primary&&primary.data){
          const merged=mergeConservative(all);
          if(merged){primary.data.dsPrimaryText=String(primary.data.text||"");primary.data.text=merged;primary.data.dsMultipass=true;primary.data.dsPassCount=all.length;}
        }
        return primary;
      }finally{try{await rawSet({tessedit_pageseg_mode:"6"});}catch(_){ }busy=false;}
    };
    return worker;
  };

  function relabel(){
    document.querySelectorAll("#iqcImageRc .iqc-photo .meta small").forEach(el=>{if(/已辨識\s*\d+%/.test(el.textContent||""))el.innerHTML=el.innerHTML.replace(/已辨識\s*(\d+)%/g,"OCR原始信心 $1%");});
  }
  const observer=new MutationObserver(()=>{clearTimeout(observer.t);observer.t=setTimeout(relabel,70);});observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});setInterval(relabel,1000);

  window.__DS_IQC_OCR_MULTIPASS_V3={version:VERSION,parsePass,mergeConservative};
})();

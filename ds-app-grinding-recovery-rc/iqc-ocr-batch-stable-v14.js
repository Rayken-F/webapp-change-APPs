"use strict";

(function installIqcOcrBatchStableV14(){
  const VERSION="IQC_OCR_BATCH_STABLE_RC_V14_20260823";
  const INIT_TIMEOUT_MS=45000;
  const RECOGNIZE_TIMEOUT_MS=55000;
  const WORKER_RETRY_SETTLE_MS=900;
  const IDLE_RELEASE_MS=6000;
  const MAX_PHOTOS_PER_WORKER=4;
  const BATCH_RERUN_COOLDOWN_MS=3000;
  if(window.__DS_IQC_OCR_BATCH_STABLE_V14)return;
  if(!window.Tesseract||typeof window.Tesseract.createWorker!=="function"){
    console.warn("[IQC OCR V14] Tesseract 尚未載入");
    return;
  }

  const nativeCreateWorker=window.Tesseract.createWorker.bind(window.Tesseract);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let lastBatchActivityAt=0;

  function toastMsg(message,error=false){
    try{if(typeof toast==="function")return toast(message,error);}catch(_){ }
    console[error?"error":"log"]("[IQC OCR V14]",message);
  }
  function setBadge(text,bad=false){
    const el=document.getElementById("iqcRcOcrBadge");
    if(el){el.textContent=text;el.className=`iqc-rc-status ${bad?"bad":"warn"}`;}
  }
  function setProgress(text){const el=document.getElementById("iqcRcProgressText");if(el)el.textContent=text;}
  function withTimeout(promise,ms,label){
    let timer;
    const t=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label}超過 ${Math.round(ms/1000)} 秒`)),ms);});
    return Promise.race([promise,t]).finally(()=>clearTimeout(timer));
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
    if(!first)return null;
    const rt=normalizeRt(first[1]);
    if(!rt)return null;
    const tokens=upper.match(/[A-Z0-9]+/g)||[];
    const marker=tokens.findIndex(t=>t==="CYLINDER"||t==="CYL");
    let status="",plant="";
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
  function sameGroup(a,b){
    if(!a||!b||a.rt!==b.rt)return false;
    if(a.status&&b.status&&a.status!==b.status)return false;
    if(a.plant&&b.plant&&a.plant!==b.plant)return false;
    return true;
  }
  function parseText(text){
    const lines=String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const groups=[],leading=[];let current=null;
    for(const line of lines){
      const upper=line.toUpperCase().replace(/[|]/g," ");
      const header=readHeader(upper);
      if(header){current={...header,ctns:[]};groups.push(current);continue;}
      if(/^RT[_\s]/.test(upper)||((upper.match(/_/g)||[]).length>=2))continue;
      const tokens=upper.split(/[^A-Z0-9]+/).filter(Boolean);
      const ctns=[];
      tokens.forEach(token=>{const c=normalizeCtn(token);if(c&&!ctns.includes(c))ctns.push(c);});
      ctns.forEach(ctn=>{
        if(current){if(!current.ctns.includes(ctn))current.ctns.push(ctn);}
        else if(!leading.includes(ctn))leading.push(ctn);
      });
    }
    return{groups,leading};
  }
  function parseScore(parsed){
    const groups=parsed?.groups||[];
    const expected=groups.filter(g=>g.expected>0).length;
    const ctns=groups.reduce((n,g)=>n+g.ctns.length,0);
    return groups.length*100+expected*30+ctns*2;
  }
  function mergeParsedPasses(results){
    const passes=results.map((r,index)=>({index,parsed:parseText(r?.data?.text||"")}));
    if(!passes.length)return"";
    passes.sort((a,b)=>parseScore(b.parsed)-parseScore(a.parsed));
    const skeleton=passes[0].parsed;
    const groups=skeleton.groups.map(g=>({...g,ctns:Array.from(new Set(g.ctns||[]))}));
    const candidates=new Map();
    function ensureCandidate(ctn){if(!candidates.has(ctn))candidates.set(ctn,{total:0,byGroup:new Map()});return candidates.get(ctn);}
    passes.forEach(({parsed})=>{
      parsed.groups.forEach(pg=>{
        const matches=groups.map((g,i)=>sameGroup(g,pg)?i:-1).filter(i=>i>=0);
        if(matches.length!==1)return;
        const gi=matches[0],dst=groups[gi];
        pg.ctns.forEach(ctn=>{const rec=ensureCandidate(ctn);rec.total++;rec.byGroup.set(gi,(rec.byGroup.get(gi)||0)+1);});
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
    groups.forEach(g=>{
      lines.push([g.rt,"CYLINDER",g.status||"UNKNOWN",g.plant||"UNKNOWN","TOTAL",String(g.expected||0)].join(" "));
      g.ctns.forEach(ctn=>lines.push(ctn));
    });
    if(!groups.length){
      const leading=new Set();passes.forEach(p=>p.parsed.leading.forEach(ctn=>leading.add(ctn)));
      leading.forEach(ctn=>lines.push(ctn));
    }
    return lines.join("\n");
  }
  function incomplete(text,confidence=100){
    const p=parseText(text);
    if(!p.groups.length)return true;
    if(confidence<80)return true;
    return p.groups.some(g=>g.expected&&g.ctns.length<Number(g.expected));
  }

  async function imageBitmap(image){
    if(typeof createImageBitmap==="function"){
      try{return await createImageBitmap(image,{imageOrientation:"from-image"});}catch(_){ }
    }
    if(image instanceof Blob){
      return new Promise((resolve,reject)=>{
        const img=new Image(),url=URL.createObjectURL(image);
        img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};
        img.onerror=e=>{URL.revokeObjectURL(url);reject(e);};
        img.src=url;
      });
    }
    throw new Error("不支援的影像來源");
  }
  async function makeVariant(image){
    const src=await imageBitmap(image);
    const sw=Number(src.width||src.naturalWidth||0),sh=Number(src.height||src.naturalHeight||0);
    if(!sw||!sh)throw new Error("影像尺寸無效");
    const sx=Math.round(sw*.04),sy=Math.round(sh*.06),cw=Math.round(sw*.92),ch=Math.round(sh*.92);
    const scale=Math.min(1.5,2100/Math.max(cw,ch));
    const w=Math.max(1,Math.round(cw*scale)),h=Math.max(1,Math.round(ch*scale));
    const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext("2d",{willReadFrequently:true,alpha:false});
    ctx.drawImage(src,sx,sy,cw,ch,0,0,w,h);if(src.close)src.close();
    const im=ctx.getImageData(0,0,w,h),d=im.data;
    for(let i=0;i<d.length;i+=4){const y=.299*d[i]+.587*d[i+1]+.114*d[i+2];const v=y>182?255:(y>104?Math.min(255,Math.round((y-104)*3.1)):0);d[i]=d[i+1]=d[i+2]=v;}
    ctx.putImageData(im,0,0);
    const blob=await new Promise(resolve=>canvas.toBlob(b=>resolve(b||image),"image/jpeg",.9));
    canvas.width=1;canvas.height=1;canvas.remove();return blob;
  }

  window.Tesseract.createWorker=async function(){
    const factoryArgs=Array.from(arguments);
    let parameters={},proxyTerminated=false,nativeWorker=null,nativePhotoCount=0,photoNo=0;
    let queue=Promise.resolve(),idleTimer=null;

    async function releaseNative(reason){
      if(idleTimer){clearTimeout(idleTimer);idleTimer=null;}
      const w=nativeWorker;nativeWorker=null;nativePhotoCount=0;
      if(w){
        try{await w.terminate?.();}catch(err){console.warn("[IQC OCR V14] terminate",reason,err);}
        await sleep(250);
      }
    }
    function scheduleIdleRelease(){
      if(idleTimer)clearTimeout(idleTimer);
      idleTimer=setTimeout(()=>{releaseNative("idle").catch(()=>{});},IDLE_RELEASE_MS);
    }
    async function ensureNative(){
      if(nativeWorker)return nativeWorker;
      setBadge("OCR 引擎啟動中…");
      setProgress("建立本批共用 OCR Worker；同一批照片依序處理，整批完成後自動釋放。");
      nativeWorker=await withTimeout(nativeCreateWorker(...factoryArgs),INIT_TIMEOUT_MS,"OCR Worker 初始化");
      if(Object.keys(parameters).length)await nativeWorker.setParameters(parameters);
      nativePhotoCount=0;
      return nativeWorker;
    }
    async function runPhoto(worker,image,currentNo){
      const results=[];
      setBadge(`OCR 第 ${currentNo} 張 · 主辨識`);
      await worker.setParameters({...parameters,tessedit_pageseg_mode:"6"});
      const primary=await withTimeout(worker.recognize(image),RECOGNIZE_TIMEOUT_MS,"主辨識");
      results.push(primary);
      let merged=mergeParsedPasses(results)||String(primary?.data?.text||"");
      if(incomplete(merged,Number(primary?.data?.confidence||0))){
        setProgress(`第 ${currentNo} 張有數量缺口，補跑 Sparse Text。`);
        try{await worker.setParameters({...parameters,tessedit_pageseg_mode:"11"});results.push(await withTimeout(worker.recognize(image),RECOGNIZE_TIMEOUT_MS,"Sparse 補辨識"));}catch(err){console.warn("[IQC OCR V14] sparse",err);}
        merged=mergeParsedPasses(results)||merged;
      }
      if(incomplete(merged,100)){
        setProgress(`第 ${currentNo} 張仍有缺口，最後跑一次裁切高對比辨識。`);
        try{const variant=await makeVariant(image);await worker.setParameters({...parameters,tessedit_pageseg_mode:"6"});results.push(await withTimeout(worker.recognize(variant),RECOGNIZE_TIMEOUT_MS,"高對比補辨識"));merged=mergeParsedPasses(results)||merged;}catch(err){console.warn("[IQC OCR V14] variant",err);}
      }
      if(primary?.data){primary.data.dsPrimaryText=String(primary.data.text||"");primary.data.text=merged;primary.data.dsPassCount=results.length;primary.data.dsStrategy="single-worker-per-batch";}
      return primary;
    }

    const proxy={
      async setParameters(p){parameters={...parameters,...(p||{})};if(nativeWorker)await nativeWorker.setParameters(parameters);return proxy;},
      recognize(image){
        const task=async()=>{
          if(proxyTerminated)throw new Error("OCR Worker 已結束");
          if(idleTimer){clearTimeout(idleTimer);idleTimer=null;}
          photoNo++;
          let lastErr=null;
          for(let attempt=1;attempt<=2;attempt++){
            try{
              const worker=await ensureNative();
              setProgress(`第 ${photoNo} 張：使用本批共用 Worker（${attempt===1?"正常":"重建後重試"}）。`);
              const result=await runPhoto(worker,image,photoNo);
              nativePhotoCount++;
              setBadge(`OCR 第 ${photoNo} 張 · 完成`);
              lastBatchActivityAt=Date.now();
              if(nativePhotoCount>=MAX_PHOTOS_PER_WORKER)await releaseNative("rotation");
              else scheduleIdleRelease();
              return result;
            }catch(err){
              lastErr=err;console.warn(`[IQC OCR V14] photo ${photoNo} attempt ${attempt}`,err);
              setBadge(`OCR 第 ${photoNo} 張 · 第 ${attempt} 次失敗`,true);
              await releaseNative("failure");
              if(attempt<2){setProgress(`第 ${photoNo} 張失敗，已丟棄異常 Worker；${WORKER_RETRY_SETTLE_MS/1000} 秒後重建一次。`);await sleep(WORKER_RETRY_SETTLE_MS);}
            }
          }
          throw lastErr||new Error("OCR 辨識失敗");
        };
        const run=queue.then(task,task);queue=run.catch(()=>{});return run;
      },
      async terminate(){proxyTerminated=true;await queue.catch(()=>{});await releaseNative("proxy terminate");return true;}
    };

    const releaseOnHide=()=>{if(document.hidden)releaseNative("page hidden").catch(()=>{});};
    const releaseOnClose=e=>{if(e.target.closest?.("#iqcRcClose,#iqcRcNewBatch"))releaseNative("panel close/new batch").catch(()=>{});};
    document.addEventListener("visibilitychange",releaseOnHide);
    document.addEventListener("click",releaseOnClose,true);
    return proxy;
  };

  document.addEventListener("click",event=>{
    const btn=event.target.closest?.("#iqcRcAnalyze");if(!btn)return;
    const remain=BATCH_RERUN_COOLDOWN_MS-(Date.now()-lastBatchActivityAt);
    if(lastBatchActivityAt&&remain>0){
      event.preventDefault();event.stopImmediatePropagation();
      const sec=Math.max(1,Math.ceil(remain/1000));
      setProgress(`上一輪剛完成，請等 ${sec} 秒再重辨識，避免 iPhone 在 Worker 收尾時重入。`);
      toastMsg(`請等 ${sec} 秒再重新辨識。`,true);
    }
  },true);

  window.__DS_IQC_OCR_BATCH_STABLE_V14={version:VERSION,idleReleaseMs:IDLE_RELEASE_MS,maxPhotosPerWorker:MAX_PHOTOS_PER_WORKER,batchCooldownMs:BATCH_RERUN_COOLDOWN_MS};
})();

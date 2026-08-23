"use strict";

(function installIqcOcrStableV13(){
  const VERSION="IQC_OCR_STABLE_RC_V13_20260823";
  const INIT_TIMEOUT_MS=45000;
  const RECOGNIZE_TIMEOUT_MS=55000;
  const PHOTO_GAP_MS=1100;
  const BATCH_RERUN_COOLDOWN_MS=3500;
  const WARMUP_SETTLE_MS=900;
  if(window.__DS_IQC_OCR_STABLE_V13)return;
  if(!window.Tesseract||typeof window.Tesseract.createWorker!=="function"){
    console.warn("[IQC OCR V13] Tesseract 尚未載入");
    return;
  }

  const nativeCreateWorker=window.Tesseract.createWorker.bind(window.Tesseract);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let warmupPromise=null;
  let lastPhotoFinishedAt=0;
  let lastBatchActivityAt=0;

  function toastMsg(message,error=false){
    try{if(typeof toast==="function")return toast(message,error);}catch(_){ }
    console[error?"error":"log"]("[IQC OCR V13]",message);
  }
  function setBadge(text,bad=false){
    const el=document.getElementById("iqcRcOcrBadge");
    if(el){el.textContent=text;el.className=`iqc-rc-status ${bad?"bad":"warn"}`;}
  }
  function setProgress(text){const el=document.getElementById("iqcRcProgressText");if(el)el.textContent=text;}
  function withTimeout(promise,ms,label){
    let timer;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label}超過 ${Math.round(ms/1000)} 秒`)),ms);});
    return Promise.race([promise,timeout]).finally(()=>clearTimeout(timer));
  }
  async function waitPhotoGap(){
    const remain=PHOTO_GAP_MS-(Date.now()-lastPhotoFinishedAt);
    if(remain>0)await sleep(remain);
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
    let marker=tokens.findIndex(t=>t==="CYLINDER"||t==="CYL");
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
  function keyOf(g){return `${g.rt}|${g.status||""}|${g.plant||""}`;}
  function sameGroup(a,b){
    if(!a||!b||a.rt!==b.rt)return false;
    if(a.status&&b.status&&a.status!==b.status)return false;
    if(a.plant&&b.plant&&a.plant!==b.plant)return false;
    return true;
  }
  function parseText(text){
    const lines=String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const groups=[];let current=null;
    const leading=[];
    for(const line of lines){
      const upper=line.toUpperCase().replace(/[|]/g," ");
      const header=readHeader(upper);
      if(header){current={...header,ctns:[]};groups.push(current);continue;}
      if(/^RT[_\s]/.test(upper)||((upper.match(/_/g)||[]).length>=2))continue;
      const tokens=upper.split(/[^A-Z0-9]+/).filter(Boolean);
      const ctns=[];
      tokens.forEach(token=>{const c=normalizeCtn(token);if(c&&!ctns.includes(c))ctns.push(c);});
      if(!ctns.length)continue;
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

    function ensureCandidate(ctn){
      if(!candidates.has(ctn))candidates.set(ctn,{total:0,byGroup:new Map()});
      return candidates.get(ctn);
    }
    passes.forEach(({parsed})=>{
      parsed.groups.forEach(pg=>{
        const matches=groups.map((g,i)=>sameGroup(g,pg)?i:-1).filter(i=>i>=0);
        if(matches.length!==1)return;
        const gi=matches[0];
        pg.ctns.forEach(ctn=>{
          const rec=ensureCandidate(ctn);rec.total++;
          rec.byGroup.set(gi,(rec.byGroup.get(gi)||0)+1);
        });
        const dst=groups[gi];
        if(!dst.expected&&pg.expected)dst.expected=pg.expected;
        if(!dst.status&&pg.status)dst.status=pg.status;
        if(!dst.plant&&pg.plant)dst.plant=pg.plant;
      });
    });

    groups.forEach((g,gi)=>{
      const selected=new Set(g.ctns);
      const ranked=[];
      candidates.forEach((rec,ctn)=>{
        const here=rec.byGroup.get(gi)||0;
        if(!here)return;
        let bestOther=0;
        rec.byGroup.forEach((v,k)=>{if(k!==gi)bestOther=Math.max(bestOther,v);});
        if(bestOther>here)return;
        ranked.push({ctn,here,total:rec.total,conflict:bestOther===here&&bestOther>0});
      });
      ranked.sort((a,b)=>b.here-a.here||b.total-a.total||a.ctn.localeCompare(b.ctn));
      ranked.forEach(item=>{
        if(item.conflict)return;
        selected.add(item.ctn);
      });
      g.ctns=Array.from(selected);
    });

    const lines=[];
    groups.forEach(g=>{
      lines.push([g.rt,"CYLINDER",g.status||"UNKNOWN",g.plant||"UNKNOWN","TOTAL",String(g.expected||0)].join(" "));
      g.ctns.forEach(ctn=>lines.push(ctn));
    });
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
    ctx.drawImage(src,sx,sy,cw,ch,0,0,w,h);
    if(src.close)src.close();
    const im=ctx.getImageData(0,0,w,h),d=im.data;
    for(let i=0;i<d.length;i+=4){
      const y=.299*d[i]+.587*d[i+1]+.114*d[i+2];
      const v=y>182?255:(y>104?Math.min(255,Math.round((y-104)*3.1)):0);
      d[i]=d[i+1]=d[i+2]=v;
    }
    ctx.putImageData(im,0,0);
    const blob=await new Promise(resolve=>canvas.toBlob(b=>resolve(b||image),"image/jpeg",.9));
    canvas.width=1;canvas.height=1;canvas.remove();
    return blob;
  }

  async function warmup(factoryArgs,parameters){
    if(warmupPromise)return warmupPromise;
    warmupPromise=(async()=>{
      let worker=null;
      try{
        setBadge("OCR 預熱中…");
        setProgress("第一次辨識前先預熱本機 OCR 核心；完成後才處理正式照片。");
        worker=await withTimeout(nativeCreateWorker(...factoryArgs),INIT_TIMEOUT_MS,"OCR 預熱");
        if(Object.keys(parameters).length)await worker.setParameters(parameters);
      }finally{
        try{await worker?.terminate?.();}catch(_){ }
        worker=null;
        await sleep(WARMUP_SETTLE_MS);
      }
      return true;
    })().catch(err=>{warmupPromise=null;throw err;});
    return warmupPromise;
  }

  window.Tesseract.createWorker=async function(){
    const factoryArgs=Array.from(arguments);
    let parameters={};
    let terminated=false;
    let queue=Promise.resolve();
    let photoNo=0;

    const proxy={
      async setParameters(p){parameters={...parameters,...(p||{})};return proxy;},
      recognize(image){
        const task=async()=>{
          if(terminated)throw new Error("OCR Worker 已結束");
          await warmup(factoryArgs,parameters);
          await waitPhotoGap();
          photoNo++;
          let worker=null;
          try{
            setBadge(`OCR 第 ${photoNo} 張 · 初始化`);
            setProgress(`第 ${photoNo} 張：逐張辨識；不並行。完成後會釋放 Worker 並等待 ${PHOTO_GAP_MS/1000} 秒。`);
            worker=await withTimeout(nativeCreateWorker(...factoryArgs),INIT_TIMEOUT_MS,"OCR Worker 初始化");
            if(Object.keys(parameters).length)await worker.setParameters(parameters);
            const results=[];

            await worker.setParameters({...parameters,tessedit_pageseg_mode:"6"});
            const primary=await withTimeout(worker.recognize(image),RECOGNIZE_TIMEOUT_MS,"主辨識");
            results.push(primary);
            let merged=mergeParsedPasses(results)||String(primary?.data?.text||"");

            if(incomplete(merged,Number(primary?.data?.confidence||0))){
              setProgress(`第 ${photoNo} 張有數量缺口，補跑 Sparse Text；不是整批重跑。`);
              await worker.setParameters({...parameters,tessedit_pageseg_mode:"11"});
              try{results.push(await withTimeout(worker.recognize(image),RECOGNIZE_TIMEOUT_MS,"Sparse 補辨識"));}catch(err){console.warn("[IQC OCR V13] sparse failed",err);}
              merged=mergeParsedPasses(results)||merged;
            }

            if(incomplete(merged,100)){
              setProgress(`第 ${photoNo} 張仍有缺口，最後跑一次裁切高對比辨識。`);
              try{
                const variant=await makeVariant(image);
                await worker.setParameters({...parameters,tessedit_pageseg_mode:"6"});
                results.push(await withTimeout(worker.recognize(variant),RECOGNIZE_TIMEOUT_MS,"高對比補辨識"));
                merged=mergeParsedPasses(results)||merged;
              }catch(err){console.warn("[IQC OCR V13] high contrast failed",err);}
            }

            if(primary?.data){
              primary.data.dsPrimaryText=String(primary.data.text||"");
              primary.data.text=merged;
              primary.data.dsPassCount=results.length;
              primary.data.dsStrategy="sequential-warmup-vote";
            }
            setBadge(`OCR 第 ${photoNo} 張 · 完成`);
            return primary;
          }finally{
            try{await worker?.terminate?.();}catch(_){ }
            worker=null;
            lastPhotoFinishedAt=Date.now();
            lastBatchActivityAt=lastPhotoFinishedAt;
            await sleep(PHOTO_GAP_MS);
          }
        };
        const run=queue.then(task,task);
        queue=run.catch(()=>{});
        return run;
      },
      async terminate(){terminated=true;await queue.catch(()=>{});return true;}
    };
    return proxy;
  };

  document.addEventListener("click",event=>{
    const btn=event.target.closest?.("#iqcRcAnalyze");
    if(!btn)return;
    const remain=BATCH_RERUN_COOLDOWN_MS-(Date.now()-lastBatchActivityAt);
    if(lastBatchActivityAt&&remain>0){
      event.preventDefault();event.stopImmediatePropagation();
      const sec=Math.max(1,Math.ceil(remain/1000));
      setProgress(`上一輪 OCR 剛完成，等待 ${sec} 秒讓 iPhone 釋放資源後再重辨識。`);
      toastMsg(`請等 ${sec} 秒再重新辨識，避免本機 OCR 疊加負載。`,true);
    }
  },true);

  window.__DS_IQC_OCR_STABLE_V13={version:VERSION,photoGapMs:PHOTO_GAP_MS,batchCooldownMs:BATCH_RERUN_COOLDOWN_MS};
})();

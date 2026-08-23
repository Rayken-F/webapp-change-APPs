"use strict";

(function installIqcOcrIsolatedMultipassRcV12(){
  const VERSION="IQC_OCR_ISOLATED_MULTIPASS_RC_V12_20260823";
  const INIT_TIMEOUT_MS=45000;
  const RECOGNIZE_TIMEOUT_MS=55000;
  const MAX_ATTEMPTS=2;
  if(window.__DS_IQC_OCR_ISOLATED_V12)return;
  if(!window.Tesseract||typeof window.Tesseract.createWorker!=="function"){
    console.warn("[IQC OCR V12] Tesseract 尚未載入");
    return;
  }

  const nativeCreateWorker=window.Tesseract.createWorker.bind(window.Tesseract);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  function setBadge(text,bad=false){
    const el=document.getElementById("iqcRcOcrBadge");
    if(el){el.textContent=text;el.className=`iqc-rc-status ${bad?"bad":"warn"}`;}
  }
  function setProgress(text){const el=document.getElementById("iqcRcProgressText");if(el)el.textContent=text;}
  function timeout(promise,ms,label){
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
    const tokens=upper.match(/[A-Z0-9]+/g)||[];
    const rt=normalizeRt(first[1]);
    if(!rt)return null;
    let markerIndex=tokens.findIndex(t=>t==="CYLINDER"||t==="CYL");
    let status="",plant="";
    if(markerIndex>=0){
      const a=String(tokens[markerIndex+1]||""),b=String(tokens[markerIndex+2]||"");
      if(/^[A-Z][A-Z0-9]{2,9}$/.test(a)&&!/^\d+$/.test(a))status=a;
      if(/^(?=.*\d)[A-Z0-9]{3,8}$/.test(b))plant=b;
      if(!plant&&/^(?=.*\d)[A-Z0-9]{3,8}$/.test(a)){plant=a;status="";}
    }else{
      // Honeywell OCR 偶爾會漏掉 CYLINDER，只留下 OCYL/MNT1 + 廠區。
      const oi=tokens.findIndex((t,i)=>i>0&&/^(?:OCYL|MNT1|[A-Z]{2,5}\d{0,2})$/.test(t));
      if(oi<0)return null;
      const a=String(tokens[oi]||""),b=String(tokens[oi+1]||"");
      status=a;
      if(/^(?=.*\d)[A-Z0-9]{3,8}$/.test(b))plant=b;
    }
    const nums=upper.match(/\b\d{1,3}\b/g)||[];
    let expected=0;
    for(let i=nums.length-1;i>=0;i--){const n=Number(nums[i]);if(n>0&&n<=200){expected=n;break;}}
    return{rt,status,plant,expected};
  }

  function parsePass(text){
    const lines=String(text||"").split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
    const leading=[],groups=[];
    let current=null;
    lines.forEach(line=>{
      const upper=line.toUpperCase().replace(/[|]/g," ");
      const header=readHeader(upper);
      if(header){current={...header,ctns:[]};groups.push(current);return;}
      const compact=upper.replace(/[^A-Z0-9]/g,"");
      const ctn=normalizeCtn(compact);
      if(!ctn)return;
      if(current){if(!current.ctns.includes(ctn))current.ctns.push(ctn);}
      else if(!leading.includes(ctn))leading.push(ctn);
    });
    return{leading,groups};
  }

  function sameLogicalGroup(a,b){
    if(!a||!b||a.rt!==b.rt)return false;
    if(a.status&&b.status&&a.status!==b.status)return false;
    if(a.plant&&b.plant&&a.plant!==b.plant)return false;
    return true;
  }
  function passScore(parsed){
    const groups=parsed?.groups||[];
    const ctns=groups.reduce((n,g)=>n+(g.ctns||[]).length,0)+(parsed?.leading||[]).length;
    const complete=groups.reduce((n,g)=>n+(g.expected&&g.ctns.length===Number(g.expected)?1:0),0);
    return groups.length*40+ctns*3+complete*20;
  }
  function mergePasses(results){
    const parsed=results.map(r=>parsePass(r?.data?.text||""));
    if(!parsed.length)return"";
    let baseIndex=0,best=-1;
    parsed.forEach((p,i)=>{const s=passScore(p);if(s>best){best=s;baseIndex=i;}});
    const base=parsed[baseIndex]||{leading:[],groups:[]};
    const groups=(base.groups||[]).map(g=>({...g,expected:Number(g.expected||0),ctns:Array.from(new Set(g.ctns||[]))}));
    const owner=new Map();
    groups.forEach((g,gi)=>g.ctns.forEach(ctn=>{if(!owner.has(ctn))owner.set(ctn,gi);}));

    parsed.forEach((p,pi)=>{
      if(pi===baseIndex)return;
      for(const sg of p.groups||[]){
        let candidates=groups.map((g,idx)=>sameLogicalGroup(g,sg)?idx:-1).filter(idx=>idx>=0);
        if(!candidates.length&&sg.rt&&sg.expected&&Array.isArray(sg.ctns)&&sg.ctns.length){
          const ng={...sg,expected:Number(sg.expected||0),ctns:[]};
          groups.push(ng);candidates=[groups.length-1];
        }
        if(candidates.length!==1)continue;
        const gi=candidates[0],dst=groups[gi];
        if(!dst.status&&sg.status)dst.status=sg.status;
        if(!dst.plant&&sg.plant)dst.plant=sg.plant;
        if(!dst.expected&&sg.expected)dst.expected=Number(sg.expected||0);
        const missing=dst.expected?Math.max(0,dst.expected-dst.ctns.length):Infinity;
        if(missing<=0)continue;
        const extras=(sg.ctns||[]).filter(ctn=>!dst.ctns.includes(ctn)&&!owner.has(ctn));
        // 若補辨識突然多出超過缺口的內容，整批放棄該 pass，避免湊假 CTN。
        if(dst.expected&&extras.length>missing)continue;
        extras.slice(0,missing).forEach(ctn=>{dst.ctns.push(ctn);owner.set(ctn,gi);});
      }
    });

    const lines=[];
    (base.leading||[]).forEach(ctn=>{if(!owner.has(ctn))lines.push(ctn);});
    groups.forEach(g=>{
      const capped=g.expected?g.ctns.slice(0,g.expected):g.ctns;
      lines.push([g.rt,"CYLINDER",g.status||"UNKNOWN",g.plant||"UNKNOWN","TOTAL",String(g.expected||0)].join(" "));
      capped.forEach(ctn=>lines.push(ctn));
    });
    return lines.join("\n");
  }

  function needsSupplement(result){
    const confidence=Number(result?.data?.confidence||0),p=parsePass(result?.data?.text||"");
    const ctnCount=(p.leading||[]).length+(p.groups||[]).reduce((n,g)=>n+(g.ctns||[]).length,0);
    if(!p.groups.length||ctnCount===0||confidence<82)return true;
    return (p.groups||[]).some(g=>g.expected&&g.ctns.length<Number(g.expected));
  }
  function needsThirdPass(mergedText){
    const p=parsePass(mergedText);
    if(!p.groups.length)return true;
    return p.groups.some(g=>g.expected&&g.ctns.length<Number(g.expected));
  }

  async function bitmapFrom(image){
    if(typeof createImageBitmap==="function"){
      try{return await createImageBitmap(image,{imageOrientation:"from-image"});}catch(_){ }
    }
    if(image instanceof Blob)return new Promise((resolve,reject)=>{
      const img=new Image(),url=URL.createObjectURL(image);
      img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};
      img.onerror=e=>{URL.revokeObjectURL(url);reject(e);};
      img.src=url;
    });
    throw new Error("不支援的影像來源");
  }
  async function makeScreenVariant(image){
    const src=await bitmapFrom(image);
    const sw=Number(src.width||src.naturalWidth||0),sh=Number(src.height||src.naturalHeight||0);
    if(!sw||!sh)throw new Error("影像尺寸無效");
    const sx=Math.round(sw*.06),sy=Math.round(sh*.08),cw=Math.round(sw*.88),ch=Math.round(sh*.90);
    const scale=Math.min(1.45,2000/Math.max(cw,ch));
    const w=Math.max(1,Math.round(cw*scale)),h=Math.max(1,Math.round(ch*scale));
    const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext("2d",{willReadFrequently:true,alpha:false});
    ctx.drawImage(src,sx,sy,cw,ch,0,0,w,h);
    if(src.close)src.close();
    const im=ctx.getImageData(0,0,w,h),d=im.data;
    for(let i=0;i<d.length;i+=4){
      const y=.299*d[i]+.587*d[i+1]+.114*d[i+2];
      const v=y>174?255:(y>108?Math.min(255,Math.round((y-108)*3.45)):0);
      d[i]=d[i+1]=d[i+2]=v;
    }
    ctx.putImageData(im,0,0);
    const blob=await new Promise(resolve=>canvas.toBlob(b=>resolve(b||image),"image/jpeg",.9));
    canvas.width=1;canvas.height=1;canvas.remove();
    return blob;
  }

  async function runPhoto(worker,image,parameters,photoNo){
    const results=[];
    setBadge(`OCR 第 ${photoNo} 張 · 主辨識`);
    await worker.setParameters({...parameters,tessedit_pageseg_mode:"6"});
    const primary=await timeout(worker.recognize(image),RECOGNIZE_TIMEOUT_MS,"主辨識");
    results.push(primary);

    if(needsSupplement(primary)){
      setProgress(`第 ${photoNo} 張主辨識完成，正在用 Sparse Text 補抓 RT/CTN。`);
      try{
        await worker.setParameters({...parameters,tessedit_pageseg_mode:"11"});
        results.push(await timeout(worker.recognize(image),RECOGNIZE_TIMEOUT_MS,"Sparse 補辨識"));
      }catch(err){console.warn("[IQC OCR V12] sparse pass failed",err);}
    }

    let merged=mergePasses(results)||String(primary?.data?.text||"");
    if(needsThirdPass(merged)){
      setProgress(`第 ${photoNo} 張仍有數量缺口，正在做裁切＋高對比最後補辨識。`);
      try{
        const variant=await makeScreenVariant(image);
        await worker.setParameters({...parameters,tessedit_pageseg_mode:"6"});
        results.push(await timeout(worker.recognize(variant),RECOGNIZE_TIMEOUT_MS,"高對比補辨識"));
        merged=mergePasses(results)||merged;
      }catch(err){console.warn("[IQC OCR V12] high contrast pass failed",err);}
    }

    if(primary?.data&&merged){
      primary.data.dsPrimaryText=String(primary.data.text||"");
      primary.data.text=merged;
      primary.data.dsMultipass=results.length>1;
      primary.data.dsPassCount=results.length;
    }
    return primary;
  }

  window.Tesseract.createWorker=async function(){
    const factoryArgs=Array.from(arguments);
    let parameters={};
    let terminated=false;
    let sequence=Promise.resolve();
    let photoNo=0;

    const proxy={
      async setParameters(p){parameters={...parameters,...(p||{})};return proxy;},
      async recognize(image){
        if(terminated)throw new Error("OCR Worker 已結束");
        const run=async()=>{
          photoNo++;
          let lastErr=null;
          for(let attempt=1;attempt<=MAX_ATTEMPTS;attempt++){
            let worker=null;
            try{
              setBadge(`OCR 第 ${photoNo} 張 · 初始化 ${attempt}/${MAX_ATTEMPTS}`);
              setProgress(`第 ${photoNo} 張：建立獨立 OCR Worker（${attempt}/${MAX_ATTEMPTS}）。本張完成後立即釋放。`);
              worker=await timeout(nativeCreateWorker.apply(window.Tesseract,factoryArgs),INIT_TIMEOUT_MS,"OCR Worker 初始化");
              if(Object.keys(parameters).length)await worker.setParameters(parameters);
              const result=await runPhoto(worker,image,parameters,photoNo);
              setBadge(`OCR 第 ${photoNo} 張 · 完成`);
              return result;
            }catch(err){
              lastErr=err;
              console.warn(`[IQC OCR V12] photo ${photoNo} attempt ${attempt} failed`,err);
              setBadge(`OCR 第 ${photoNo} 張 · 第 ${attempt} 次失敗`,true);
              if(attempt<MAX_ATTEMPTS){setProgress(`第 ${photoNo} 張失敗，已釋放 Worker；0.8 秒後用全新 Worker重試。`);await sleep(800);}
            }finally{
              try{await worker?.terminate?.();}catch(_){ }
              worker=null;
              // 給 iOS WebKit 一個事件循環，把 WASM/Canvas 解除引用後的資源排入回收。
              await sleep(180);
            }
          }
          setBadge(`OCR 第 ${photoNo} 張 · 失敗`,true);
          throw lastErr||new Error("OCR 辨識失敗");
        };
        const job=sequence.then(run,run);
        sequence=job.catch(()=>{});
        return job;
      },
      async terminate(){terminated=true;try{await sequence;}catch(_){ }return true;},
      async load(){return proxy;},async loadLanguage(){return proxy;},async initialize(){return proxy;}
    };
    return proxy;
  };

  function relabel(){
    document.querySelectorAll("#iqcImageRc .iqc-photo .meta small").forEach(el=>{
      if(/已辨識\s*\d+%/.test(el.textContent||""))el.innerHTML=el.innerHTML.replace(/已辨識\s*(\d+)%/g,"OCR原始信心 $1%");
    });
  }
  const observer=new MutationObserver(()=>{clearTimeout(observer.t);observer.t=setTimeout(relabel,80);});
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  setInterval(relabel,1100);

  window.__DS_IQC_OCR_ISOLATED_V12={version:VERSION,parsePass,mergePasses};
})();

"use strict";

(function installIqcOcrIsolatedWorkerRcV11(){
  const VERSION="IQC_OCR_ISOLATED_WORKER_RC_V11_20260823";
  const INIT_TIMEOUT_MS=45000;
  const RECOGNIZE_TIMEOUT_MS=55000;
  if(window.__DS_IQC_OCR_ISOLATED_V11)return;
  if(!window.Tesseract||typeof window.Tesseract.createWorker!=="function"){
    console.warn("[IQC OCR V11] Tesseract 尚未載入");
    return;
  }

  const nativeCreateWorker=window.Tesseract.createWorker.bind(window.Tesseract);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  function setBadge(text,bad=false){const el=document.getElementById("iqcRcOcrBadge");if(el){el.textContent=text;el.className=`iqc-rc-status ${bad?"bad":"warn"}`;}}
  function setProgress(text){const el=document.getElementById("iqcRcProgressText");if(el)el.textContent=text;}
  function timeout(promise,ms,label){let timer;const t=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label}超過 ${Math.round(ms/1000)} 秒`)),ms);});return Promise.race([promise,t]).finally(()=>clearTimeout(timer));}

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
    const ci=tokens.findIndex(t=>t==="CYLINDER"||t==="CYL");
    let status="",plant="";
    if(ci>=0){const a=String(tokens[ci+1]||""),b=String(tokens[ci+2]||"");if(/^[A-Z][A-Z0-9]{2,9}$/.test(a)&&!/^\d+$/.test(a))status=a;if(/^(?=.*\d)[A-Z0-9]{3,8}$/.test(b))plant=b;if(!plant&&/^(?=.*\d)[A-Z0-9]{3,8}$/.test(a)){plant=a;status="";}}
    const nums=upper.match(/\b\d{1,3}\b/g)||[];let expected=0;for(let i=nums.length-1;i>=0;i--){const n=Number(nums[i]);if(n>0&&n<=200){expected=n;break;}}
    return{rt,status,plant,expected};
  }
  function parsePass(text){
    const lines=String(text||"").split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
    const leading=[],groups=[];let current=null;
    lines.forEach(line=>{
      const upper=line.toUpperCase().replace(/[|]/g," ");
      const header=readHeader(upper);
      if(header){current={...header,ctns:[]};groups.push(current);return;}
      const ctn=normalizeCtn(upper.replace(/[^A-Z0-9]/g,""));if(!ctn)return;
      if(current){if(!current.ctns.includes(ctn))current.ctns.push(ctn);}else if(!leading.includes(ctn))leading.push(ctn);
    });
    return{leading,groups};
  }
  function sameLogicalGroup(a,b){if(!a||!b||a.rt!==b.rt)return false;if(a.status&&b.status&&a.status!==b.status)return false;if(a.plant&&b.plant&&a.plant!==b.plant)return false;return true;}
  function mergeConservative(primary,supplement){
    const p=parsePass(primary?.data?.text||""),s=parsePass(supplement?.data?.text||"");
    const groups=(p.groups||[]).map(g=>({...g,ctns:Array.from(new Set(g.ctns||[]))}));
    const owner=new Set(groups.flatMap(g=>g.ctns));
    for(const sg of s.groups||[]){
      const matches=groups.filter(g=>sameLogicalGroup(g,sg));if(matches.length!==1)continue;
      const dst=matches[0];if(!dst.status&&sg.status)dst.status=sg.status;if(!dst.plant&&sg.plant)dst.plant=sg.plant;if(!dst.expected&&sg.expected)dst.expected=sg.expected;
      const missing=dst.expected?Math.max(0,Number(dst.expected)-dst.ctns.length):2;
      const extras=(sg.ctns||[]).filter(c=>!owner.has(c));
      if(dst.expected&&extras.length>missing)continue;
      extras.slice(0,missing).forEach(c=>{dst.ctns.push(c);owner.add(c);});
    }
    const lines=[];(p.leading||[]).forEach(c=>lines.push(c));groups.forEach(g=>{lines.push([g.rt,"CYLINDER",g.status||"UNKNOWN",g.plant||"UNKNOWN","TOTAL",String(g.expected||0)].join(" "));g.ctns.forEach(c=>lines.push(c));});
    return lines.join("\n")||String(primary?.data?.text||"");
  }
  function needsSupplement(result){
    const confidence=Number(result?.data?.confidence||0),p=parsePass(result?.data?.text||"");
    const ctnCount=(p.leading||[]).length+(p.groups||[]).reduce((n,g)=>n+(g.ctns||[]).length,0);
    if(ctnCount===0)return true;
    if(confidence<55)return true;
    return (p.groups||[]).some(g=>g.expected&&g.ctns.length===0);
  }
  async function bitmapFrom(image){
    if(typeof createImageBitmap==="function"){try{return await createImageBitmap(image,{imageOrientation:"from-image"});}catch(_){}}
    if(image instanceof Blob)return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(image);img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};img.onerror=e=>{URL.revokeObjectURL(url);reject(e);};img.src=url;});
    throw new Error("不支援的影像來源");
  }
  async function makeVariant(image){
    const src=await bitmapFrom(image);const sw=Number(src.width||src.naturalWidth||0),sh=Number(src.height||src.naturalHeight||0);if(!sw||!sh)throw new Error("影像尺寸無效");
    const sx=Math.round(sw*.07),sy=Math.round(sh*.10),cw=Math.round(sw*.86),ch=Math.round(sh*.88),scale=Math.min(1.35,1900/Math.max(cw,ch));
    const w=Math.max(1,Math.round(cw*scale)),h=Math.max(1,Math.round(ch*scale)),canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext("2d",{willReadFrequently:true,alpha:false});ctx.drawImage(src,sx,sy,cw,ch,0,0,w,h);if(src.close)src.close();
    const im=ctx.getImageData(0,0,w,h),d=im.data;for(let i=0;i<d.length;i+=4){const y=.299*d[i]+.587*d[i+1]+.114*d[i+2],v=y>170?255:(y>115?Math.min(255,Math.round((y-115)*3.4)):0);d[i]=d[i+1]=d[i+2]=v;}ctx.putImageData(im,0,0);
    return new Promise(resolve=>canvas.toBlob(b=>resolve(b||image),"image/jpeg",.88));
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
          let worker=null;
          let lastErr=null;
          for(let attempt=1;attempt<=2;attempt++){
            try{
              setBadge(`OCR 第 ${photoNo} 張 · 初始化 ${attempt}/2`);
              setProgress(`第 ${photoNo} 張照片：建立獨立 OCR Worker（${attempt}/2）。每張辨識完成後會立即釋放，避免多張照片累積記憶體。`);
              worker=await timeout(nativeCreateWorker.apply(window.Tesseract,factoryArgs),INIT_TIMEOUT_MS,"OCR Worker 初始化");
              if(Object.keys(parameters).length)await worker.setParameters(parameters);
              setBadge(`OCR 第 ${photoNo} 張 · 辨識中`);
              const primary=await timeout(worker.recognize(image),RECOGNIZE_TIMEOUT_MS,"照片辨識");
              if(needsSupplement(primary)){
                try{
                  setProgress(`第 ${photoNo} 張主辨識完成，信心偏低／資料不足，正在做一次局部補辨識。`);
                  const variant=await makeVariant(image);
                  await worker.setParameters({...parameters,tessedit_pageseg_mode:"6"});
                  const supplement=await timeout(worker.recognize(variant),RECOGNIZE_TIMEOUT_MS,"補辨識");
                  const merged=mergeConservative(primary,supplement);
                  if(primary?.data&&merged){primary.data.dsPrimaryText=String(primary.data.text||"");primary.data.text=merged;primary.data.dsMultipass=true;primary.data.dsPassCount=2;}
                }catch(err){console.warn("[IQC OCR V11] supplemental pass skipped",err);}
              }
              setBadge(`OCR 第 ${photoNo} 張 · 完成`);
              return primary;
            }catch(err){
              lastErr=err;console.warn(`[IQC OCR V11] photo ${photoNo} attempt ${attempt} failed`,err);
              try{await worker?.terminate?.();}catch(_){}worker=null;
              if(attempt<2){setProgress(`第 ${photoNo} 張辨識失敗，已釋放 Worker；0.8 秒後用全新 Worker 重試一次。`);await sleep(800);continue;}
              setBadge(`OCR 第 ${photoNo} 張 · 失敗`,true);
              throw lastErr;
            }finally{
              try{await worker?.terminate?.();}catch(_){}
              worker=null;
            }
          }
          throw lastErr||new Error("OCR 辨識失敗");
        };
        const job=sequence.then(run,run);
        sequence=job.catch(()=>{});
        return job;
      },
      async terminate(){terminated=true;try{await sequence;}catch(_){}return true;},
      async load(){return proxy;},async loadLanguage(){return proxy;},async initialize(){return proxy;}
    };
    return proxy;
  };

  function relabel(){document.querySelectorAll("#iqcImageRc .iqc-photo .meta small").forEach(el=>{if(/已辨識\s*\d+%/.test(el.textContent||""))el.innerHTML=el.innerHTML.replace(/已辨識\s*(\d+)%/g,"OCR原始信心 $1%");});}
  const observer=new MutationObserver(()=>{clearTimeout(observer.t);observer.t=setTimeout(relabel,80);});observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});setInterval(relabel,1100);
  window.__DS_IQC_OCR_ISOLATED_V11={version:VERSION,parsePass};
})();

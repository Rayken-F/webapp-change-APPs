"use strict";

(function installIqcOcrIsolatedV22(){
  const VERSION="IQC_OCR_ISOLATED_RC_V22_20260825";
  const INIT_TIMEOUT_MS=35000;
  const PRIMARY_TIMEOUT_MS=40000;
  const FALLBACK_TIMEOUT_MS=35000;
  const PHOTO_HARD_TIMEOUT_MS=85000;
  const BETWEEN_PHOTO_MS=750;
  const BATCH_RERUN_COOLDOWN_MS=3000;
  if(window.__DS_IQC_OCR_ISOLATED_V22)return;
  if(!window.Tesseract||typeof window.Tesseract.createWorker!=="function"){
    console.warn("[IQC OCR V22] Tesseract 尚未載入");
    return;
  }

  const nativeCreateWorker=window.Tesseract.createWorker.bind(window.Tesseract);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let lastBatchActivityAt=0;

  function setBadge(text,bad=false){
    const el=document.getElementById("iqcRcOcrBadge");
    if(el){el.textContent=text;el.className=`iqc-rc-status ${bad?"bad":"warn"}`;}
  }
  function setProgress(text){
    const el=document.getElementById("iqcRcProgressText");
    if(el)el.textContent=text;
  }
  function toastMsg(message,error=false){
    try{if(typeof toast==="function")return toast(message,error);}catch(_){ }
    console[error?"error":"log"]("[IQC OCR V22]",message);
  }
  function withTimeout(promise,ms,label){
    let timer;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label}超過 ${Math.round(ms/1000)} 秒`)),ms);});
    return Promise.race([promise,timeout]).finally(()=>clearTimeout(timer));
  }
  async function safeTerminate(worker,reason){
    if(!worker)return;
    try{await withTimeout(Promise.resolve(worker.terminate?.()),2500,`Worker terminate ${reason||""}`);}catch(err){console.warn("[IQC OCR V22] terminate",reason,err);}
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
    }
    const nums=upper.match(/\b\d{1,3}\b/g)||[];
    let expected=0;
    for(let i=nums.length-1;i>=0;i--){const n=Number(nums[i]);if(n>0&&n<=200){expected=n;break;}}
    return {rt,status,plant,expected};
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
      ctns.forEach(ctn=>{if(current){if(!current.ctns.includes(ctn))current.ctns.push(ctn);}else if(!leading.includes(ctn))leading.push(ctn);});
    }
    return {groups,leading};
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
    const meta=groups.filter(g=>g.status&&g.plant).length;
    const ctns=groups.reduce((n,g)=>n+(g.ctns||[]).length,0);
    return groups.length*100+expected*30+meta*25+ctns*2;
  }
  function mergePasses(results){
    const passes=results.map(r=>parseText(r?.data?.text||"")).filter(Boolean);
    if(!passes.length)return"";
    passes.sort((a,b)=>parseScore(b)-parseScore(a));
    const skeleton=passes[0];
    const groups=(skeleton.groups||[]).map(g=>({...g,ctns:Array.from(new Set(g.ctns||[]))}));
    passes.slice(1).forEach(parsed=>{
      (parsed.groups||[]).forEach(pg=>{
        const matches=groups.map((g,i)=>sameGroup(g,pg)?i:-1).filter(i=>i>=0);
        if(matches.length!==1)return;
        const dst=groups[matches[0]];
        if(!dst.status&&pg.status)dst.status=pg.status;
        if(!dst.plant&&pg.plant)dst.plant=pg.plant;
        if(!dst.expected&&pg.expected)dst.expected=pg.expected;
        (pg.ctns||[]).forEach(ctn=>{if(!dst.ctns.includes(ctn))dst.ctns.push(ctn);});
      });
    });
    const lines=[];
    groups.forEach(g=>{
      lines.push([g.rt,"CYLINDER",g.status||"UNKNOWN",g.plant||"UNKNOWN","TOTAL",String(g.expected||0)].join(" "));
      g.ctns.forEach(ctn=>lines.push(ctn));
    });
    if(!groups.length){
      const leading=new Set();passes.forEach(p=>(p.leading||[]).forEach(ctn=>leading.add(ctn)));
      leading.forEach(ctn=>lines.push(ctn));
    }
    return lines.join("\n");
  }
  function needsFallback(text,confidence=100){
    const parsed=parseText(text);
    if(!parsed.groups.length)return true;
    if(confidence<72)return true;
    return parsed.groups.some(g=>!g.status||!g.plant||!g.expected||(g.expected&&g.ctns.length<Number(g.expected)));
  }
  function syntheticFailure(message,photoNo){
    return {data:{text:"",confidence:0,dsPrimaryText:"",dsPassCount:0,dsStrategy:"isolated-worker-per-photo-v22",dsLocalFailure:true,dsLocalFailureMessage:String(message||"LOCAL_OCR_FAILED"),dsPhotoNo:photoNo}};
  }

  window.Tesseract.createWorker=async function(){
    const factoryArgs=Array.from(arguments);
    let parameters={},proxyTerminated=false,photoNo=0,queue=Promise.resolve();

    const proxy={
      async setParameters(p){parameters={...parameters,...(p||{})};return proxy;},
      recognize(image){
        const task=async()=>{
          if(proxyTerminated)return syntheticFailure("OCR proxy 已結束",photoNo+1);
          photoNo++;
          const currentNo=photoNo;
          let worker=null;
          let primary=null;
          const results=[];
          try{
            setBadge(`OCR 第 ${currentNo} 張 · 建立獨立 Worker`);
            setProgress(`第 ${currentNo} 張：建立獨立 OCR Worker。完成後立即釋放，不與下一張共用記憶體。`);
            const execute=async()=>{
              worker=await withTimeout(nativeCreateWorker(...factoryArgs),INIT_TIMEOUT_MS,"OCR Worker 初始化");
              if(Object.keys(parameters).length)await worker.setParameters(parameters);
              await worker.setParameters({...parameters,tessedit_pageseg_mode:"6"});
              setBadge(`OCR 第 ${currentNo} 張 · 主辨識`);
              primary=await withTimeout(worker.recognize(image),PRIMARY_TIMEOUT_MS,"主辨識");
              results.push(primary);
              let merged=mergePasses(results)||String(primary?.data?.text||"");

              if(needsFallback(merged,Number(primary?.data?.confidence||0))){
                setProgress(`第 ${currentNo} 張：主辨識仍有缺口，只補跑一次 Sparse Text；不再做第三輪高對比 OCR。`);
                try{
                  await worker.setParameters({...parameters,tessedit_pageseg_mode:"11"});
                  const sparse=await withTimeout(worker.recognize(image),FALLBACK_TIMEOUT_MS,"Sparse 補辨識");
                  results.push(sparse);
                  merged=mergePasses(results)||merged;
                }catch(err){console.warn(`[IQC OCR V22] photo ${currentNo} sparse`,err);}
              }

              if(primary?.data){
                primary.data.dsPrimaryText=String(primary.data.text||"");
                primary.data.text=merged;
                primary.data.dsPassCount=results.length;
                primary.data.dsStrategy="isolated-worker-per-photo-v22";
                primary.data.dsPhotoNo=currentNo;
              }
              return primary;
            };

            const result=await withTimeout(execute(),PHOTO_HARD_TIMEOUT_MS,"單張 OCR 任務");
            setBadge(`OCR 第 ${currentNo} 張 · 完成`);
            setProgress(`第 ${currentNo} 張 Local OCR 完成；正在釋放本張 Worker，再處理下一張。`);
            lastBatchActivityAt=Date.now();
            return result;
          }catch(err){
            console.warn(`[IQC OCR V22] photo ${currentNo} isolated failure`,err);
            setBadge(`OCR 第 ${currentNo} 張 · Local 失敗`,true);
            setProgress(`第 ${currentNo} 張 Local OCR 已停止：${err?.message||err}。本張交由 Hybrid 判定是否需要 AI，批次繼續下一張。`);
            lastBatchActivityAt=Date.now();
            return syntheticFailure(err?.message||err,currentNo);
          }finally{
            await safeTerminate(worker,`photo-${currentNo}`);
            worker=null;primary=null;results.length=0;
            await sleep(BETWEEN_PHOTO_MS);
          }
        };
        const run=queue.then(task,task);
        queue=run.catch(()=>{});
        return run;
      },
      async terminate(){
        proxyTerminated=true;
        try{await withTimeout(queue.catch(()=>{}),3500,"OCR proxy 收尾");}catch(_){ }
        return true;
      }
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
      setProgress(`上一輪剛完成，請等 ${sec} 秒再重辨識，讓 iPhone 完成 Worker 記憶體回收。`);
      toastMsg(`請等 ${sec} 秒再重新辨識。`,true);
    }
  },true);

  window.__DS_IQC_OCR_ISOLATED_V22={
    version:VERSION,
    initTimeoutMs:INIT_TIMEOUT_MS,
    primaryTimeoutMs:PRIMARY_TIMEOUT_MS,
    fallbackTimeoutMs:FALLBACK_TIMEOUT_MS,
    photoHardTimeoutMs:PHOTO_HARD_TIMEOUT_MS,
    betweenPhotoMs:BETWEEN_PHOTO_MS,
    strategy:"one-native-worker-per-photo"
  };
})();

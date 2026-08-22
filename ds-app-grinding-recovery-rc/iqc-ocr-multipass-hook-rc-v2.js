"use strict";

(function installIqcOcrMultipassHookRcV2(){
  const VERSION="IQC_OCR_MULTIPASS_HOOK_RC_V2_20260823";
  if(window.__DS_IQC_OCR_MULTIPASS_V2)return;
  if(!window.Tesseract||typeof window.Tesseract.createWorker!=="function"){
    console.warn("[IQC OCR V2] Tesseract 尚未載入，multipass hook 未安裝");
    return;
  }

  const originalCreateWorker=window.Tesseract.createWorker.bind(window.Tesseract);

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

  function parsePass(text){
    const lines=String(text||"").split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
    const leading=[];
    const groups=[];
    let current=null;
    lines.forEach(line=>{
      const upper=line.toUpperCase().replace(/[|]/g," ");
      const first=upper.match(/^\s*([A-Z0-9]{5,8})\b/);
      if(first&&/(CYL|OCYL|CYLINDER)/.test(upper)){
        const rt=normalizeRt(first[1]);
        if(rt){
          const nums=upper.match(/\b\d{1,3}\b/g)||[];
          let expected=0;
          for(let i=nums.length-1;i>=0;i--){
            const n=Number(nums[i]);
            if(n>0&&n<=200){expected=n;break;}
          }
          current={rt,expected,ctns:[]};
          groups.push(current);
          return;
        }
      }

      // 補辨識只接受「這一行主要就是一支 CTN」；RT 敘述中的 7 碼片段不吃。
      const compact=upper.replace(/[^A-Z0-9]/g,"");
      const ctn=normalizeCtn(compact);
      if(!ctn)return;
      if(current){if(!current.ctns.includes(ctn))current.ctns.push(ctn);}
      else if(!leading.includes(ctn))leading.push(ctn);
    });
    return {leading,groups};
  }

  function mergePasses(results){
    const parsed=results.map(r=>parsePass(r&&r.data&&r.data.text||""));
    const leading=[];
    parsed.forEach(p=>p.leading.forEach(ctn=>{if(!leading.includes(ctn))leading.push(ctn);}));

    const order=[];
    const map=new Map();
    parsed.forEach(p=>p.groups.forEach(g=>{
      if(!map.has(g.rt)){
        map.set(g.rt,{rt:g.rt,expected:Number(g.expected||0),ctns:[]});
        order.push(g.rt);
      }
      const dst=map.get(g.rt);
      if(!dst.expected&&g.expected)dst.expected=Number(g.expected||0);
      g.ctns.forEach(ctn=>{if(!dst.ctns.includes(ctn))dst.ctns.push(ctn);});
    }));

    const lines=[];
    leading.forEach(ctn=>lines.push(ctn));
    order.forEach(rt=>{
      const g=map.get(rt);
      lines.push(`${g.rt} CYLINDER TOTAL ${g.expected||0}`);
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
      return new Promise((resolve,reject)=>{
        const img=new Image();
        const url=URL.createObjectURL(image);
        img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};
        img.onerror=e=>{URL.revokeObjectURL(url);reject(e);};
        img.src=url;
      });
    }
    throw new Error("不支援的影像來源");
  }

  async function makeScreenVariant(image,threshold){
    const src=await bitmapFrom(image);
    const sw=Number(src.width||src.naturalWidth||0),sh=Number(src.height||src.naturalHeight||0);
    if(!sw||!sh)throw new Error("影像尺寸無效");
    const sx=Math.round(sw*.10),sy=Math.round(sh*.14),cw=Math.round(sw*.80),ch=Math.round(sh*.82);
    const scale=Math.min(1.35,1900/Math.max(cw,ch));
    const w=Math.max(1,Math.round(cw*scale)),h=Math.max(1,Math.round(ch*scale));
    const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext("2d",{willReadFrequently:true,alpha:false});
    ctx.drawImage(src,sx,sy,cw,ch,0,0,w,h);
    if(src.close)src.close();
    if(threshold){
      const im=ctx.getImageData(0,0,w,h),d=im.data;
      for(let i=0;i<d.length;i+=4){
        const y=.299*d[i]+.587*d[i+1]+.114*d[i+2];
        const v=y>170?255:(y>118?Math.min(255,Math.round((y-118)*3.2)):0);
        d[i]=d[i+1]=d[i+2]=v;
      }
      ctx.putImageData(im,0,0);
    }
    return new Promise(resolve=>canvas.toBlob(blob=>resolve(blob||image),"image/jpeg",.9));
  }

  window.Tesseract.createWorker=async function(){
    const worker=await originalCreateWorker.apply(this,arguments);
    const rawRecognize=worker.recognize.bind(worker);
    const rawSet=worker.setParameters.bind(worker);
    let busy=false;

    worker.recognize=async function(image){
      if(busy)return rawRecognize.apply(worker,arguments);
      busy=true;
      const args=arguments;
      let primary=null;
      const all=[];
      try{
        primary=await rawRecognize.apply(worker,args);
        all.push(primary);
        if(!needsSupplement(primary))return primary;

        try{
          await rawSet({tessedit_pageseg_mode:"11"});
          all.push(await rawRecognize(image));
        }catch(err){console.warn("[IQC OCR V2] sparse pass failed",err);}

        try{
          const crop=await makeScreenVariant(image,true);
          await rawSet({tessedit_pageseg_mode:"6"});
          all.push(await rawRecognize(crop));
        }catch(err){console.warn("[IQC OCR V2] crop pass failed",err);}

        const merged=mergePasses(all);
        if(merged&&primary&&primary.data){
          primary.data.dsPrimaryText=String(primary.data.text||"");
          primary.data.text=merged;
          primary.data.dsMultipass=true;
          primary.data.dsPassCount=all.length;
        }
        return primary;
      }finally{
        try{await rawSet({tessedit_pageseg_mode:"6"});}catch(_){ }
        busy=false;
      }
    };
    return worker;
  };

  function relabelConfidence(){
    document.querySelectorAll("#iqcImageRc .iqc-photo .meta small").forEach(el=>{
      const text=String(el.textContent||"");
      if(/已辨識\s*\d+%/.test(text))el.innerHTML=el.innerHTML.replace(/已辨識\s*(\d+)%/g,"OCR原始信心 $1%");
    });
    const progress=document.getElementById("iqcRcProgressText");
    if(progress&&progress.textContent.includes("已自動跨頁合併")){
      progress.textContent=progress.textContent.replace("已自動跨頁合併與 CTN 去重。","已完成多輪 OCR、跨頁合併與 CTN 去重；數量不符仍會維持複查狀態。");
    }
  }
  const observer=new MutationObserver(()=>{clearTimeout(observer.t);observer.t=setTimeout(relabelConfidence,60);});
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  setInterval(relabelConfidence,900);

  window.__DS_IQC_OCR_MULTIPASS_V2={version:VERSION,parsePass,mergePasses};
})();

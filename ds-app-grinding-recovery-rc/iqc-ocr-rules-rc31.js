/* RC30 recognition rules, isolated for RC31 orchestration. */
(function(){
"use strict";
const clean=v=>String(v||" ").trim().toUpperCase();
  function normalizeCtn(raw){const original=clean(raw).replace(/[^A-Z0-9]/g,"");if(original.length!==7)return"";const a=original.split(""),lm={"0":"O","1":"I","2":"Z","5":"S","8":"B","6":"G"},dm={"O":"0","Q":"0","D":"0","I":"1","L":"1","Z":"2","S":"5","B":"8","G":"6","T":"7"};[0,1,4,5].forEach(i=>{if(/\d/.test(a[i])&&lm[a[i]])a[i]=lm[a[i]];});[2,3].forEach(i=>{if(/[A-Z]/.test(a[i])&&dm[a[i]])a[i]=dm[a[i]];});const value=a.join("");return /^[A-Z]{2}\d{2}[A-Z]{2}[A-Z0-9]$/.test(value)?value:"";}
  function normalizeRt(raw){const src=clean(raw).replace(/[^A-Z0-9]/g,""),map={"O":"0","Q":"0","D":"0","I":"1","L":"1","Z":"2","S":"5","B":"8","G":"6","T":"7"};const digits=src.split("").map(c=>/\d/.test(c)?c:(map[c]||"?")).join("");return /^\d{5,8}$/.test(digits)?digits:"";}
  function readHeader(upper){const first=upper.match(/^\s*([A-Z0-9]{5,8})\b/);if(!first)return null;const rt=normalizeRt(first[1]);if(!rt)return null;const tokens=upper.match(/[A-Z0-9]+/g)||[];let marker=tokens.findIndex(t=>t==="CYLINDER"||t==="CYL"),status="",plant="";if(marker>=0){const a=String(tokens[marker+1]||""),b=String(tokens[marker+2]||"");if(/^[A-Z][A-Z0-9]{2,9}$/.test(a)&&!/^\d+$/.test(a))status=a;if(/^(?=.*\d)[A-Z0-9]{3,8}$/.test(b))plant=b;if(!plant&&/^(?=.*\d)[A-Z0-9]{3,8}$/.test(a)){plant=a;status="";}}else{const oi=tokens.findIndex((t,i)=>i>0&&/^(?:OCYL|MNT1|[A-Z]{2,5}\d{0,2})$/.test(t));if(oi<0)return null;status=String(tokens[oi]||"");const b=String(tokens[oi+1]||"");if(/^(?=.*\d)[A-Z0-9]{3,8}$/.test(b))plant=b;}const nums=upper.match(/\b\d{1,3}\b/g)||[];let expected=0;for(let i=nums.length-1;i>=0;i--){const n=Number(nums[i]);if(n>0&&n<=200){expected=n;break;}}return{rt,status,plant,expected};}
  function parseText(text){const lines=String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean),groups=[],leading=[];let current=null;for(const line of lines){const upper=line.toUpperCase().replace(/[|]/g," "),header=readHeader(upper);if(header){current={...header,ctns:[]};groups.push(current);continue;}if(/^RT[_\s]/.test(upper)||((upper.match(/_/g)||[]).length>=2))continue;const tokens=upper.split(/[^A-Z0-9]+/).filter(Boolean),ctns=[];tokens.forEach(token=>{const c=normalizeCtn(token);if(c&&!ctns.includes(c))ctns.push(c);});ctns.forEach(ctn=>{if(current){if(!current.ctns.includes(ctn))current.ctns.push(ctn);}else if(!leading.includes(ctn))leading.push(ctn);});}return{groups,leading};}
  function sameGroup(a,b){if(!a||!b||a.rt!==b.rt)return false;if(a.status&&b.status&&a.status!==b.status)return false;if(a.plant&&b.plant&&a.plant!==b.plant)return false;return true;}
  function parseScore(parsed){const groups=parsed?.groups||[],expected=groups.filter(g=>g.expected>0).length,ctns=groups.reduce((n,g)=>n+(g.ctns||[]).length,0);return groups.length*100+expected*30+ctns*2;}
  function mergeParsedPasses(results){const passes=results.map(r=>({parsed:parseText(r?.data?.text||"")}));if(!passes.length)return"";passes.sort((a,b)=>parseScore(b.parsed)-parseScore(a.parsed));const skeleton=passes[0].parsed,groups=(skeleton.groups||[]).map(g=>({...g,ctns:Array.from(new Set(g.ctns||[]))})),candidates=new Map();const ensure=ctn=>{if(!candidates.has(ctn))candidates.set(ctn,{total:0,byGroup:new Map()});return candidates.get(ctn);};passes.forEach(({parsed})=>{(parsed.groups||[]).forEach(pg=>{const matches=groups.map((g,i)=>sameGroup(g,pg)?i:-1).filter(i=>i>=0);if(matches.length!==1)return;const gi=matches[0],dst=groups[gi];(pg.ctns||[]).forEach(ctn=>{const rec=ensure(ctn);rec.total++;rec.byGroup.set(gi,(rec.byGroup.get(gi)||0)+1);});if(!dst.expected&&pg.expected)dst.expected=pg.expected;if(!dst.status&&pg.status)dst.status=pg.status;if(!dst.plant&&pg.plant)dst.plant=pg.plant;});});groups.forEach((g,gi)=>{const selected=new Set(g.ctns),ranked=[];candidates.forEach((rec,ctn)=>{const here=rec.byGroup.get(gi)||0;if(!here)return;let bestOther=0;rec.byGroup.forEach((v,k)=>{if(k!==gi)bestOther=Math.max(bestOther,v);});if(bestOther>here)return;ranked.push({ctn,here,total:rec.total,conflict:bestOther===here&&bestOther>0});});ranked.sort((a,b)=>b.here-a.here||b.total-a.total||a.ctn.localeCompare(b.ctn));ranked.forEach(item=>{if(!item.conflict)selected.add(item.ctn);});g.ctns=Array.from(selected);});const lines=[],assigned=new Set(groups.flatMap(g=>g.ctns)),unassigned=new Set();passes.forEach(p=>p.parsed.leading.forEach(ctn=>{if(!assigned.has(ctn))unassigned.add(ctn);}));unassigned.forEach(ctn=>lines.push(ctn));groups.forEach(g=>{lines.push([g.rt,"CYLINDER",g.status||"UNKNOWN",g.plant||"UNKNOWN","TOTAL",String(g.expected||0)].join(" "));g.ctns.forEach(ctn=>lines.push(ctn));});return lines.join("\n");}

  function structuralState(text){
    const parsed=parseText(text),groups=parsed.groups||[],leading=parsed.leading||[];
    const found=new Set([...leading,...groups.flatMap(g=>g.ctns||[])]).size;
    if(groups.length){
      const known=v=>!!v&&v!=="UNKNOWN";
      const complete=!leading.length&&groups.every(g=>known(g.rt)&&known(g.status)&&known(g.plant)&&Number(g.expected||0)>0&&(g.ctns||[]).length>=Number(g.expected||0));
      const expected=groups.reduce((n,g)=>n+Number(g.expected||0),0);
      return {kind:complete?"COMPLETE":"GROUP_GAP",complete,groups,leading,found,expected};
    }
    if(leading.length)return {kind:"CONTINUATION",complete:false,groups,leading,found:leading.length,expected:0};
    return {kind:"NO_DATA",complete:false,groups,leading,found:0,expected:0};
  }
  // Missing grouping metadata is a review task, not evidence that OCR must run again.
  // Retry only when no CTNs were extracted or a visible total indicates missing CTNs.
  function needsMoreCandidates(text){const s=structuralState(text);return !s.found||s.groups.some(g=>g.expected>0&&g.ctns.length<g.expected);}
  function needsSparse(text){return needsMoreCandidates(text);}
  function needsHighContrast(text){return needsMoreCandidates(text);}
  function qualityLabel(text){const s=structuralState(text);if(s.kind==="COMPLETE")return `資料完整｜${s.found}/${s.expected}`;if(s.kind==="GROUP_GAP")return `已辨識｜${s.found}/${s.expected} 待補`;if(s.kind==="CONTINUATION")return `已辨識｜${s.found} CTN（續頁）`;return "已辨識｜待複查";}

  function parseEvents(text){const events=[];String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean).forEach((line,lineIndex)=>{const upper=clean(line).replace(/[|]/g," "),h=readHeader(upper);if(h){events.push({type:"header",rt:h.rt,expected:h.expected,line:upper,lineIndex});return;}if(/^RT[_\s]/.test(upper)||((upper.match(/_/g)||[]).length>=2))return;upper.split(/[^A-Z0-9]+/).filter(Boolean).forEach(token=>{const ctn=normalizeCtn(token);if(ctn)events.push({type:"ctn",ctn,raw:token,corrected:ctn!==token,lineIndex});});});return events;}


  async function createBitmap(blob){if(typeof createImageBitmap==="function"){try{return await createImageBitmap(blob,{imageOrientation:"from-image"});}catch(_){ }}return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(blob);img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};img.onerror=e=>{URL.revokeObjectURL(url);reject(e||new Error("圖片解碼失敗"));};img.src=url;});}
  async function preprocessForOcr(blob){let b=null,c=null;try{b=await createBitmap(blob);c=document.createElement("canvas");c.width=b.width;c.height=b.height;const ctx=c.getContext("2d",{willReadFrequently:true,alpha:false});ctx.drawImage(b,0,0);try{b.close?.();}catch(_){ }b=null;const im=ctx.getImageData(0,0,c.width,c.height),d=im.data;for(let i=0;i<d.length;i+=4){const y=.299*d[i]+.587*d[i+1]+.114*d[i+2],v=Math.max(0,Math.min(255,(y-128)*1.28+138));d[i]=d[i+1]=d[i+2]=v;}ctx.putImageData(im,0,0);return await new Promise(resolve=>c.toBlob(x=>resolve(x||blob),"image/jpeg",.86));}finally{try{b?.close?.();}catch(_){ }if(c){c.width=1;c.height=1;c.remove();}b=null;c=null;}}
  async function makeVariant(image){let src=null,canvas=null;try{src=await createBitmap(image);const sw=Number(src.width||src.naturalWidth||0),sh=Number(src.height||src.naturalHeight||0);if(!sw||!sh)throw new Error("影像尺寸無效");const sx=Math.round(sw*.04),sy=Math.round(sh*.06),cw=Math.round(sw*.92),ch=Math.round(sh*.92),scale=Math.min(1.5,2100/Math.max(cw,ch)),w=Math.max(1,Math.round(cw*scale)),h=Math.max(1,Math.round(ch*scale));canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;const ctx=canvas.getContext("2d",{willReadFrequently:true,alpha:false});ctx.drawImage(src,sx,sy,cw,ch,0,0,w,h);try{src.close?.();}catch(_){ }src=null;const im=ctx.getImageData(0,0,w,h),d=im.data;for(let i=0;i<d.length;i+=4){const y=.299*d[i]+.587*d[i+1]+.114*d[i+2],v=y>182?255:(y>104?Math.min(255,Math.round((y-104)*3.1)):0);d[i]=d[i+1]=d[i+2]=v;}ctx.putImageData(im,0,0);return await new Promise(resolve=>canvas.toBlob(b=>resolve(b||image),"image/jpeg",.9));}finally{try{src?.close?.();}catch(_){ }if(canvas){canvas.width=1;canvas.height=1;canvas.remove();}src=null;canvas=null;}}


  // Locate the largest light, neutral screen region; dark device frames and blue UI
  // bars otherwise dominate segmentation on short continuation photos.
  async function makeTextRegion(blob){
    let source,small,canvas;try{
      source=await createBitmap(blob);const sw=source.width||source.naturalWidth,sh=source.height||source.naturalHeight;
      small=document.createElement('canvas');const scale=Math.min(1,320/Math.max(sw,sh));small.width=Math.max(1,Math.round(sw*scale));small.height=Math.max(1,Math.round(sh*scale));
      const ctx=small.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,small.width,small.height);
      const w=small.width,h=small.height,pixels=ctx.getImageData(0,0,w,h).data,mask=new Uint8Array(w*h),queue=new Int32Array(w*h);let best=null;
      for(let i=0;i<mask.length;i++){const r=pixels[i*4],g=pixels[i*4+1],b=pixels[i*4+2];mask[i]=Math.min(r,g,b)>132&&Math.max(r,g,b)-Math.min(r,g,b)<55?1:0;}
      for(let i=0;i<mask.length;i++){if(mask[i]!==1)continue;let start=0,end=1,count=0,left=w,right=0,top=h,bottom=0;queue[0]=i;mask[i]=0;
        while(start<end){const n=queue[start++],x=n%w,y=Math.floor(n/w);count++;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
          for(const next of [x>0?n-1:-1,x<w-1?n+1:-1,y>0?n-w:-1,y<h-1?n+w:-1])if(next>=0&&mask[next]===1){mask[next]=0;queue[end++]=next;}
        }
        if(!best||count>best.count)best={count,left,right,top,bottom};
      }
      if(!best||best.count<w*h*.035||best.right-best.left<w*.2||best.bottom-best.top<h*.06)return null;
      const pad=Math.max(2,Math.round(Math.min(w,h)*.012)),sx=Math.max(0,best.left-pad)/scale,sy=Math.max(0,best.top-pad)/scale,cw=Math.min(sw-sx,(best.right-best.left+1+pad*2)/scale),ch=Math.min(sh-sy,(best.bottom-best.top+1+pad*2)/scale);
      const zoom=Math.min(2,2000/Math.max(cw,ch));canvas=document.createElement('canvas');canvas.width=Math.round(cw*zoom)+40;canvas.height=Math.round(ch*zoom)+40;const out=canvas.getContext('2d',{alpha:false});out.fillStyle='white';out.fillRect(0,0,canvas.width,canvas.height);out.drawImage(source,sx,sy,cw,ch,20,20,canvas.width-40,canvas.height-40);
      return await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    }finally{source?.close?.();if(small)small.width=small.height=1;if(canvas)canvas.width=canvas.height=1;}
  }
const api={parseText,normalizeCtn,parseEvents,mergeParsedPasses,structuralState,qualityLabel,needsSparse,needsHighContrast,preprocessForOcr,makeVariant,makeTextRegion};
if(typeof module==="object"&&module.exports)module.exports=api;else window.IqcOcrRules31=api;
})();

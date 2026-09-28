/* RC30 recognition rules, isolated for RC31 orchestration. */
(function(){
"use strict";
const clean=v=>String(v||" ").trim().toUpperCase();
  function normalizeCtn(raw){const original=clean(raw).replace(/[^A-Z0-9]/g,"");if(original.length!==7)return"";const a=original.split(""),lm={"0":"O","1":"I","2":"Z","5":"S","8":"B","6":"G"},dm={"O":"0","Q":"0","D":"0","I":"1","L":"1","Z":"2","S":"5","B":"8","G":"6","T":"7"};[0,1,4,5].forEach(i=>{if(/\d/.test(a[i])&&lm[a[i]])a[i]=lm[a[i]];});[2,3].forEach(i=>{if(/[A-Z]/.test(a[i])&&dm[a[i]])a[i]=dm[a[i]];});const value=a.join("");return /^[A-Z]{2}\d{2}[A-Z]{2}[A-Z0-9]$/.test(value)?value:"";}
  function normalizeRt(raw){const src=clean(raw).replace(/[^A-Z0-9]/g,""),map={"O":"0","Q":"0","D":"0","I":"1","L":"1","Z":"2","S":"5","B":"8","G":"6","T":"7"};const digits=src.split("").map(c=>/\d/.test(c)?c:(map[c]||"?")).join("");return /^\d{5,8}$/.test(digits)?digits:"";}
  const headerWords=v=>clean(v).replace(/\bCYL[1I]NDER\b/g,"CYLINDER").replace(/[|]/g," ");
  const markerStart=/^(?:CYLINDER|CYL|OCYL|VCYL|DCYL|MNT1)\b/;
  function rtPrefix(value){
    const match=headerWords(value).match(/^[^A-Z0-9]*(RT[\s:#-]+)?([0-9OQDILZSBGT]+(?:[ \t]+[0-9OQDILZSBGT]+)*)(?=\s|$)/);
    if(!match)return null;const raw=match[2].trim(),parts=raw.split(/\s+/),rt=normalizeRt(raw);
    // A complete RT beside a separate digit must not be concatenated with it.
    // The positioned OCR path can distinguish a nearby split token from noise.
    if(parts.length>1&&parts.some(p=>normalizeRt(p)))return null;
    // A CTN, date, plant or a word resembling digits is not an RT label.
    if(!rt||(raw.match(/\d/g)||[]).length<4)return null;
    return {rt,explicit:!!match[1],rest:headerWords(value).slice(match[0].length).trim()};
  }
  function readHeader(value){
    const p=rtPrefix(value);if(!p||(!p.explicit&&!markerStart.test(p.rest)))return null;
    const tokens=p.rest.match(/[A-Z0-9]+/g)||[];let index=/^(CYLINDER|CYL)$/.test(tokens[0]||"")?1:0,status="",plant="";
    const a=tokens[index]||"",b=tokens[index+1]||"";
    if((/^[A-Z][A-Z0-9]{2,9}$/.test(a)&&a!=="TOTAL")||(index===1&&/^\d{4}$/.test(a)&&/^(?=.*\d)[A-Z0-9]{3,8}$/.test(b)))status=a;
    if(status&&/^(?=.*\d)[A-Z0-9]{3,8}$/.test(b))plant=b;
    if(!status&&/^(?=.*\d)[A-Z0-9]{3,8}$/.test(a))plant=a;
    const nums=p.rest.match(/\b\d{1,3}\b/g)||[];let expected=0;
    for(let i=nums.length-1;i>=0;i--){const n=Number(nums[i]);if(n>0&&n<=200){expected=n;break;}}
    return {rt:p.rt,status,plant,expected};
  }
  function headerLines(text){
    const lines=String(text||"").split(/\r?\n/).map(headerWords);
    for(let i=0;i<lines.length;i++)for(let attempt=0;attempt<2;attempt++){
      const p=rtPrefix(lines[i]);if(!p)break;
      // Sparse OCR can separate the green RT from its black heading. Join only
      // the immediately following non-empty heading, never across a CTN row.
      let j=i+1;while(j<lines.length&&!lines[j])j++;
      if(j<lines.length&&((!p.rest&&markerStart.test(lines[j]))||(/^(CYLINDER|CYL)$/.test(p.rest)&&/^(OCYL|VCYL|DCYL|MNT1)\b/.test(lines[j])))){lines[i]=lines[i]+" "+lines[j];lines[j]="";}else break;
    }
    return lines;
  }
  function parseText(text){const lines=headerLines(text),groups=[],leading=[];let current=null;for(const upper of lines){const header=readHeader(upper);if(header){current={...header,ctns:[]};groups.push(current);continue;}if(/^RT[_\s]/.test(upper)||((upper.match(/_/g)||[]).length>=2))continue;const tokens=upper.split(/[^A-Z0-9]+/).filter(Boolean),ctns=[];tokens.forEach(token=>{const c=normalizeCtn(token);if(c&&!ctns.includes(c))ctns.push(c);});ctns.forEach(ctn=>{if(current){if(!current.ctns.includes(ctn))current.ctns.push(ctn);}else if(!leading.includes(ctn))leading.push(ctn);});}return{groups,leading};}
  function sameGroup(a,b){if(!a||!b||a.rt!==b.rt)return false;if(a.status&&b.status&&a.status!==b.status)return false;if(a.plant&&b.plant&&a.plant!==b.plant)return false;return true;}
  function parseScore(parsed){const groups=parsed?.groups||[],expected=groups.filter(g=>g.expected>0).length,ctns=groups.reduce((n,g)=>n+(g.ctns||[]).length,0);return groups.length*100+expected*30+ctns*2;}
  function mergeParsedPasses(results){const passes=results.map(r=>({parsed:parseText(r?.data?.text||"")}));if(!passes.length)return"";passes.sort((a,b)=>parseScore(b.parsed)-parseScore(a.parsed));const skeleton=passes[0].parsed,groups=(skeleton.groups||[]).map(g=>({...g,ctns:Array.from(new Set(g.ctns||[]))})),candidates=new Map();const ensure=ctn=>{if(!candidates.has(ctn))candidates.set(ctn,{total:0,byGroup:new Map()});return candidates.get(ctn);};passes.forEach(({parsed})=>{(parsed.groups||[]).forEach(pg=>{const matches=groups.map((g,i)=>sameGroup(g,pg)?i:-1).filter(i=>i>=0);if(matches.length!==1)return;const gi=matches[0],dst=groups[gi];(pg.ctns||[]).forEach(ctn=>{const rec=ensure(ctn);rec.total++;rec.byGroup.set(gi,(rec.byGroup.get(gi)||0)+1);});if(!dst.expected&&pg.expected)dst.expected=pg.expected;if(!dst.status&&pg.status)dst.status=pg.status;if(!dst.plant&&pg.plant)dst.plant=pg.plant;});});groups.forEach((g,gi)=>{const selected=new Set(g.ctns),ranked=[];candidates.forEach((rec,ctn)=>{const here=rec.byGroup.get(gi)||0;if(!here)return;let bestOther=0;rec.byGroup.forEach((v,k)=>{if(k!==gi)bestOther=Math.max(bestOther,v);});if(bestOther>here)return;ranked.push({ctn,here,total:rec.total,conflict:bestOther===here&&bestOther>0});});ranked.sort((a,b)=>b.here-a.here||b.total-a.total||a.ctn.localeCompare(b.ctn));ranked.forEach(item=>{if(!item.conflict)selected.add(item.ctn);});g.ctns=Array.from(selected);});const lines=[],assigned=new Set(groups.flatMap(g=>g.ctns)),unassigned=new Set();passes.forEach(p=>[...p.parsed.leading,...p.parsed.groups.flatMap(g=>g.ctns)].forEach(ctn=>{if(!assigned.has(ctn))unassigned.add(ctn);}));unassigned.forEach(ctn=>lines.push(ctn));groups.forEach(g=>{lines.push([g.rt,"CYLINDER",g.status||"UNKNOWN",g.plant||"UNKNOWN","TOTAL",String(g.expected||0)].join(" "));g.ctns.forEach(ctn=>lines.push(ctn));});return lines.join("\n");}

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
  function serialize(parsed){return [...parsed.leading,...parsed.groups.flatMap(g=>[[g.rt,"CYLINDER",g.status||"UNKNOWN",g.plant||"UNKNOWN","TOTAL",g.expected||0].join(" "),...g.ctns])].join("\n");}
  // First retain exact-CTN metadata from this photo; then use positioned header
  // boundaries to recover lower rows outside a crop. Never borrow another photo.
  function restoreMetadata(text,results){
    const parsed=parseText(text),evidence=new Map();
    results.forEach(r=>parseText(r?.data?.text).groups.forEach(g=>g.ctns.forEach(ctn=>{
      if(!evidence.has(ctn))evidence.set(ctn,[]);evidence.get(ctn).push(g);
    })));
    parsed.leading=parsed.leading.filter(ctn=>{
      const choices=evidence.get(ctn)||[];if(!choices.length)return true;
      const meta={ctns:[]};
      for(const key of ['rt','status','plant']){
        const values=[...new Set(choices.map(g=>g[key]).filter(v=>v&&v!=="UNKNOWN"))];if(values.length>1)return true;meta[key]=values[0]||"";
      }
      meta.expected=choices.find(g=>g.expected>0)?.expected||0;
      let dst=parsed.groups.find(g=>sameGroup(g,meta));if(!dst){dst=meta;parsed.groups.push(dst);}
      if(!dst.ctns.includes(ctn))dst.ctns.push(ctn);return false;
    });
    parsed.groups.forEach(g=>{
      const choices=g.ctns.flatMap(ctn=>evidence.get(ctn)||[]).filter(other=>sameGroup(g,other));
      for(const key of ['status','plant','expected']){
        if(g[key]&&g[key]!=="UNKNOWN")continue;
        const values=[...new Set(choices.map(other=>other[key]).filter(v=>v&&v!=="UNKNOWN"))];if(values.length===1)g[key]=values[0];
      }
    });
    return restoreSpatialMetadata(serialize(parsed),results);
  }
  const ocrLines=r=>(r?.data?.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>p.lines||[]));
  const center=b=>(b.y0+b.y1)/2;
  const known=v=>v&&v!=="UNKNOWN";
  // Each header is a boundary on this photo, including headers whose RT failed
  // to read. Unknown boundaries prevent cylinders leaking into the previous RT.
  function spatialHeaders(results){
    const headers=[];
    for(const result of results){
      if(result.rc31Space===false)continue;
      const lines=ocrLines(result),words=lines.flatMap(line=>(line.words||[]).map(word=>({...word,line}))).filter(w=>w.bbox);
      for(const anchor of words.filter(w=>/^(CYLINDER|CYL)$/.test(headerWords(w.text)))){
        const a=anchor.bbox,h=a.y1-a.y0;if(h<=0)continue;
        const near=words.filter(w=>Math.abs(center(w.bbox)-center(a))<h*1.2||w.line===anchor.line);
        const left=near.filter(w=>w.bbox.x1<a.x0&&a.x0-w.bbox.x1<h*10&&w.bbox.y1-w.bbox.y0<h*1.8&&/^[0-9OQDILZSBGT]+$/.test(clean(w.text))).sort((x,y)=>y.bbox.x1-x.bbox.x1);
        let rt="",rtBox=null;
        if(left.length){
          let raw=clean(left[0].text),box={...left[0].bbox};
          for(let j=1;j<left.length&&j<3;j++){
            const prev=left[j].bbox;if(box.x0-prev.x1>h*.6)break;
            raw=clean(left[j].text)+raw;box.x0=prev.x0;box.y0=Math.min(box.y0,prev.y0);box.y1=Math.max(box.y1,prev.y1);
          }
          if(normalizeRt(raw)&&(raw.match(/\d/g)||[]).length>=4){rt=normalizeRt(raw);rtBox=box;}
        }
        const right=near.filter(w=>w.bbox.x0>=a.x1&&w.bbox.x0-a.x1<h*35&&!String(w.text).includes('_')).sort((x,y)=>x.bbox.x0-y.bbox.x0);
        const tokens=right.map(w=>clean(w.text));
        if(tokens[1]?.length===2&&tokens[2]?.length===2&&/^[A-Z0-9]{4}$/.test(tokens[1]+tokens[2])&&right[2].bbox.x0-right[1].bbox.x1<h*.8)tokens.splice(1,2,tokens[1]+tokens[2]);
        const meta=readHeader((rt||'99999')+' CYLINDER '+tokens.join(' '))||{};meta.rt=rt;
        let dst=headers.find(g=>sameRow(g.bbox,a));
        if(!dst){dst={bbox:{...a},readings:[]};headers.push(dst);}
        dst.readings.push({meta,rtBox,focused:!!result.rc31HeaderOnly});
      }
    }
    for(const r of results){if(r.rc31RtReading){const dst=headers.find(h=>sameRow(h.bbox,r.rc31RtReading.bbox));if(dst&&r.rc31RtReading.rt)dst.readings.push({meta:{rt:r.rc31RtReading.rt},focused:true});}}
    for(const header of headers){
      header.meta={};header.conflict=false;
      for(const key of ['rt','status','plant','expected']){
        let rows=header.readings.filter(r=>known(r.meta[key]));
        if(rows.some(r=>r.focused))rows=rows.filter(r=>r.focused);
        const values=[...new Set(rows.map(r=>r.meta[key]))];
        header.meta[key]=values.length===1?values[0]:key==='expected'?0:'';
        if(values.length>1)header.conflict=true;
      }
    }
    return headers.sort((a,b)=>center(a.bbox)-center(b.bbox));
  }
  function restoreSpatialMetadata(text,results){
    const headers=spatialHeaders(results);if(!headers.length)return text;
    const parsed=parseText(text),ctns=[...new Set([...parsed.leading,...parsed.groups.flatMap(g=>g.ctns)])];
    const rows=results.filter(r=>r.rc31Space!==false&&!r.rc31HeaderOnly).flatMap(ctnRows).filter(r=>r.ctn&&r.bbox);
    if(!rows.length)return text;
    const leading=[],groups=headers.map(h=>({...h.meta,ctns:[]}));
    for(const ctn of ctns){
      const positions=rows.filter(r=>r.ctn===ctn),owners=new Set(positions.map(r=>headers.findLastIndex(h=>center(r.bbox)>center(h.bbox))));
      if(!positions.length){const old=parsed.groups.find(g=>g.ctns.includes(ctn));if(old){let g=groups.find(g=>g.rt&&sameGroup(g,old));if(!g){g={...old,ctns:[]};groups.push(g);}g.ctns.push(ctn);}else leading.push(ctn);continue;}
      const index=[...owners][0];
      if(owners.size!==1||index<0||!groups[index].rt){leading.push(ctn);continue;}
      groups[index].ctns.push(ctn);
    }
    return serialize({leading,groups:groups.filter(g=>g.ctns.length)});
  }
  function headerTargets(results){
    const headers=spatialHeaders(results),rows=results.filter(r=>r.rc31Space!==false&&!r.rc31HeaderOnly).flatMap(ctnRows).filter(r=>r.ctn&&r.bbox);
    return headers.filter((h,i)=>{
      const below=new Set(rows.filter(r=>center(r.bbox)>center(h.bbox)&&(!headers[i+1]||center(r.bbox)<center(headers[i+1].bbox))).map(r=>r.ctn));
      return !h.meta.rt||!h.meta.status||!h.meta.plant||!h.meta.expected||h.conflict||below.size>h.meta.expected;
    }).slice(0,4);
  }
  function lateOnlyRows(results,height){
    if(spatialHeaders(results).length)return false;
    const rows=results.filter(r=>r.rc31Space!==false).flatMap(ctnRows).filter(r=>r.ctn&&r.bbox);
    return height>0&&rows.length>0&&Math.min(...rows.map(r=>r.bbox.y0))>height*.5;
  }
  function needsHeaderPass(text,results){
    if(!parseText(text).leading.length)return false;
    // One bounded extra pass for a visible heading clue; plain continuation
    // photos do not incur extra OCR work merely because they have no RT.
    return results.some(r=>/\b(?:CYL[1I]NDER|CYL|OCYL|VCYL|DCYL|MNT1)\b|\bRT[\s:#-]+[0-9]/.test(clean(r?.data?.text)));
  }
  // Missing grouping metadata is a review task, not evidence that OCR must run again.
  // Retry only when no CTNs were extracted or a visible total indicates missing CTNs.
  function needsMoreCandidates(text){const s=structuralState(text);return !s.found||s.groups.some(g=>g.expected>0&&g.ctns.length<g.expected);}
  function needsSparse(text){return needsMoreCandidates(text);}
  function needsHighContrast(text){return needsMoreCandidates(text);}
  function qualityLabel(text){const s=structuralState(text);if(s.kind==="COMPLETE")return `資料完整｜${s.found}/${s.expected}`;if(s.kind==="GROUP_GAP")return `已辨識｜${s.found}/${s.expected} 待補`;if(s.kind==="CONTINUATION")return `已辨識｜${s.found} CTN（續頁）`;return "已辨識｜待複查";}

  // Keep rejected CTN-shaped rows visible to the controller. Counting only parsed
  // tokens hides a missed row as soon as any other token was successfully read.
  function ctnRows(result){
    const lines=(result?.data?.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>p.lines||[]));
    const source=lines.length?lines:String(result?.data?.text||'').split(/\r?\n/).map(text=>({text}));
    const rows=[];
    source.forEach((line,index)=>{
      if(readHeader(clean(line.text)))return;
      const words=line.words?.length?line.words:(String(line.text||'').match(/[A-Z0-9]+/gi)||[]).map(text=>({text}));
      words.forEach(word=>{
        const raw=clean(word.text),ctn=normalizeCtn(raw);
        if(!ctn&&!(/^[A-Z]{2}[A-Z0-9]{4,7}$/.test(raw)&&/\d/.test(raw)))return;
        rows.push({raw,ctn,bbox:word.bbox||line.bbox||null,confidence:Number(word.confidence??line.confidence??100),line:index});
      });
    });
    return rows;
  }
  function sameRow(a,b){
    if(!a||!b)return false;
    const w=Math.min(a.x1-a.x0,b.x1-b.x0),h=Math.min(a.y1-a.y0,b.y1-b.y0);
    return w>0&&h>0&&Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0)>w*.5&&Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0)>h*.5;
  }
  function needsRowCheck(result){return ctnRows(result).some(r=>!r.ctn||r.confidence<60);}
  // These passes must use the SAME image coordinates (block and sparse modes).
  // An alternative reading at the same position is not an additional cylinder.
  function reconcileRows(results){
    const slots=[],maps=[];
    results.forEach(result=>{
      const rows=ctnRows(result);maps.push(rows);
      rows.forEach(row=>{
        let slot=slots.find(s=>sameRow(s.bbox,row.bbox));
        if(!slot){slot={bbox:row.bbox,ctn:'',readings:[]};slots.push(slot);}
        slot.readings.push(row);if(!slot.ctn&&row.ctn)slot.ctn=row.ctn;row.slot=slot;
      });
    });
    // Prefer the stronger reading at the same position, but retain every
    // conflicting candidate in the warning for operator confirmation.
    slots.forEach(slot=>{
      const valid=slot.readings.filter(r=>r.ctn).sort((a,b)=>b.confidence-a.confidence);
      if(valid.length)slot.ctn=valid[0].ctn;
    });
    const passes=results.map((result,i)=>{
      const lines=(result?.data?.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>p.lines||[]));
      const textLines=lines.length?lines.map(l=>String(l.text||'')):String(result?.data?.text||'').split(/\r?\n/);
      maps[i].forEach(row=>{if(row.slot.ctn)textLines[row.line]=textLines[row.line].replace(row.raw,row.slot.ctn);});
      return {data:{text:textLines.join('\n')}};
    });
    const unread=[],uncertain=[];
    slots.forEach(slot=>{
      const alternatives=[...new Set(slot.readings.map(r=>r.ctn).filter(Boolean))];
      if(!slot.ctn)unread.push({raw:slot.readings[0].raw,bbox:slot.bbox});
      else if(alternatives.length>1||Math.max(...slot.readings.filter(r=>r.ctn===slot.ctn).map(r=>r.confidence))<60||/[O0S5]$/.test(slot.ctn)){
        if(!uncertain.some(r=>r.ctn===slot.ctn))uncertain.push({ctn:slot.ctn,alternatives,reason:alternatives.length>1?'CONFLICT':/[O0S5]$/.test(slot.ctn)?'AMBIGUOUS_END':'LOW_CONFIDENCE'});
      }
    });
    const order=[...new Set(slots.filter(s=>s.ctn&&s.bbox).sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0).map(s=>s.ctn))];
    return {text:mergeParsedPasses(passes),unread,uncertain,order};
  }

  function parseEvents(text){const events=[];headerLines(text).forEach((upper,lineIndex)=>{const h=readHeader(upper);if(h){events.push({type:"header",rt:h.rt,expected:h.expected,line:upper,lineIndex});return;}if(/^RT[_\s]/.test(upper)||((upper.match(/_/g)||[]).length>=2))return;upper.split(/[^A-Z0-9]+/).filter(Boolean).forEach(token=>{const ctn=normalizeCtn(token);if(ctn)events.push({type:"ctn",ctn,raw:token,corrected:ctn!==token,lineIndex});});});return events;}


  async function createBitmap(blob){if(typeof createImageBitmap==="function"){try{return await createImageBitmap(blob,{imageOrientation:"from-image"});}catch(_){ }}return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(blob);img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};img.onerror=()=>{URL.revokeObjectURL(url);reject(Object.assign(new Error("DECODE_ERROR"),{code:"DECODE_ERROR"}));};img.src=url;});}
  async function preprocessForOcr(blob){let b=null,c=null;try{b=await createBitmap(blob);c=document.createElement("canvas");c.width=b.width;c.height=b.height;const ctx=c.getContext("2d",{willReadFrequently:true,alpha:false});ctx.drawImage(b,0,0);try{b.close?.();}catch(_){ }b=null;const im=ctx.getImageData(0,0,c.width,c.height),d=im.data;for(let i=0;i<d.length;i+=4){const y=.299*d[i]+.587*d[i+1]+.114*d[i+2],v=Math.max(0,Math.min(255,(y-128)*1.28+138));d[i]=d[i+1]=d[i+2]=v;}ctx.putImageData(im,0,0);return await new Promise(resolve=>c.toBlob(x=>resolve(Object.assign(x||blob,{rc31Height:c.height})),"image/jpeg",.86));}finally{try{b?.close?.();}catch(_){ }if(c){c.width=1;c.height=1;c.remove();}b=null;c=null;}}
  async function makeVariant(image){let src=null,canvas=null;try{src=await createBitmap(image);const sw=Number(src.width||src.naturalWidth||0),sh=Number(src.height||src.naturalHeight||0);if(!sw||!sh)throw new Error("影像尺寸無效");const sx=Math.round(sw*.04),sy=Math.round(sh*.06),cw=Math.round(sw*.92),ch=Math.round(sh*.92),scale=Math.min(1.5,2100/Math.max(cw,ch)),w=Math.max(1,Math.round(cw*scale)),h=Math.max(1,Math.round(ch*scale));canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;const ctx=canvas.getContext("2d",{willReadFrequently:true,alpha:false});ctx.drawImage(src,sx,sy,cw,ch,0,0,w,h);try{src.close?.();}catch(_){ }src=null;const im=ctx.getImageData(0,0,w,h),d=im.data;for(let i=0;i<d.length;i+=4){const y=.299*d[i]+.587*d[i+1]+.114*d[i+2],v=y>182?255:(y>104?Math.min(255,Math.round((y-104)*3.1)):0);d[i]=d[i+1]=d[i+2]=v;}ctx.putImageData(im,0,0);return await new Promise(resolve=>canvas.toBlob(b=>resolve(b||image),"image/jpeg",.9));}finally{try{src?.close?.();}catch(_){ }if(canvas){canvas.width=1;canvas.height=1;canvas.remove();}src=null;canvas=null;}}


  // Suppress fine display stripes, then compare each pixel with its local background.
  // Keep the original coordinates so block/sparse readings can be reconciled by row.
  async function makeScreenReadable(blob){
    let source,canvas;try{
      source=await createBitmap(blob);canvas=document.createElement('canvas');canvas.width=source.width||source.naturalWidth;canvas.height=source.height||source.naturalHeight;
      const w=canvas.width,h=canvas.height,ctx=canvas.getContext('2d',{willReadFrequently:true,alpha:false});ctx.drawImage(source,0,0);source.close?.();source=null;
      const pixels=ctx.getImageData(0,0,w,h),gray=new Float32Array(w*h),sum=new Float64Array((w+1)*(h+1));
      for(let i=0;i<gray.length;i++)gray[i]=.299*pixels.data[i*4]+.587*pixels.data[i*4+1]+.114*pixels.data[i*4+2];
      const average=(src,radius)=>{
        sum.fill(0);const out=new Float32Array(w*h);
        for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){row+=src[y*w+x];sum[(y+1)*(w+1)+x+1]=sum[y*(w+1)+x+1]+row;}}
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
          const l=Math.max(0,x-radius),r=Math.min(w,x+radius+1),t=Math.max(0,y-radius),b=Math.min(h,y+radius+1);
          out[y*w+x]=(sum[b*(w+1)+r]-sum[t*(w+1)+r]-sum[b*(w+1)+l]+sum[t*(w+1)+l])/((b-t)*(r-l));
        }return out;
      };
      const smooth=average(gray,1),background=average(smooth,22);
      for(let i=0;i<gray.length;i++){const v=smooth[i]<background[i]-16?0:255;pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=v;}
      ctx.putImageData(pixels,0,0);return await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    }finally{source?.close?.();if(canvas)canvas.width=canvas.height=1;}
  }

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
  // Focus the observed heading (or its RT token) at its original location.
  // Only text-only fallback results use the former upper-half crop.
  async function makeHeaderRegion(blob,target=null,digitsOnly=false){
    let source,canvas;try{
      source=await createBitmap(blob);const sw=source.width||source.naturalWidth,sh=source.height||source.naturalHeight;
      let sx=0,sy=0,cw=sw,ch=Math.ceil(sh*.5);
      if(target){const a=target.bbox,h=a.y1-a.y0,rtBox=target.readings.find(r=>r.rtBox)?.rtBox;
        if(digitsOnly&&rtBox){const pad=h*.5;sx=Math.max(0,rtBox.x0-pad);sy=Math.max(0,rtBox.y0-pad);cw=Math.min(sw-sx,rtBox.x1+pad-sx);ch=Math.min(sh-sy,rtBox.y1+pad-sy);}
        else{sx=Math.max(0,a.x0-h*10);sy=Math.max(0,a.y0-h*1.5);cw=Math.min(sw-sx,h*42);ch=Math.min(sh-sy,h*5);}
      }
      const scale=Math.min(target?3:2,2000/cw);
      canvas=document.createElement('canvas');canvas.width=Math.round(cw*scale)+32;canvas.height=Math.round(ch*scale)+32;
      const ctx=canvas.getContext('2d',{willReadFrequently:true,alpha:false});ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,sx,sy,cw,ch,16,16,canvas.width-32,canvas.height-32);
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),d=pixels.data;
      for(let i=0;i<d.length;i+=4){const v=d[i];d[i]=d[i+1]=d[i+2]=v;}
      ctx.putImageData(pixels,0,0);const image=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      return {image,transform:{sx,sy,scaleX:(canvas.width-32)/cw,scaleY:(canvas.height-32)/ch,pad:16},target,digitsOnly};
    }finally{source?.close?.();if(canvas)canvas.width=canvas.height=1;}
  }
  function mapHeaderResult(result,region){
    const t=region.transform,map=b=>({x0:(b.x0-t.pad)/t.scaleX+t.sx,x1:(b.x1-t.pad)/t.scaleX+t.sx,y0:(b.y0-t.pad)/t.scaleY+t.sy,y1:(b.y1-t.pad)/t.scaleY+t.sy});
    for(const line of ocrLines(result)){if(line.bbox)line.bbox=map(line.bbox);for(const w of line.words||[])if(w.bbox)w.bbox=map(w.bbox);}
    result.rc31HeaderOnly=true;
    if(region.digitsOnly){const raw=clean(result.data?.text);result.rc31RtReading={bbox:region.target.bbox,rt:/^[0-9OQDILZSBGT]{5,8}$/.test(raw)&&(raw.match(/\d/g)||[]).length>=4?normalizeRt(raw):''};}
    return result;
  }
const api={parseText,normalizeCtn,parseEvents,mergeParsedPasses,restoreMetadata,restoreSpatialMetadata,spatialHeaders,headerTargets,lateOnlyRows,mapHeaderResult,needsHeaderPass,structuralState,qualityLabel,needsSparse,needsHighContrast,ctnRows,needsRowCheck,reconcileRows,preprocessForOcr,makeVariant,makeScreenReadable,makeTextRegion,makeHeaderRegion};
if(typeof module==="object"&&module.exports)module.exports=api;else window.IqcOcrRules31=api;
})();

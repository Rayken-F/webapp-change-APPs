/* RC31.1: retain every candidate and keep operator decisions separate from OCR text. */
(function(root,factory){
  if(typeof module==="object"&&module.exports)module.exports=factory(require("./iqc-ocr-rules-rc31.js"));
  else root.IqcReviewModel31=factory(root.IqcOcrRules31);
})(typeof window!=="undefined"?window:this,function(rules){
  "use strict";
  const clean=v=>String(v||"").trim().toUpperCase();
  const field=v=>['UNKNOWN','-'].includes(clean(v))?'':clean(v);
  const validCtn=v=>/^[A-Z]{2}\d{2}[A-Z]{2}[A-Z0-9]$/.test(v);
  function candidates(photo){
    const parsed=rules.parseText(photo.ocrText||""),map=new Map();
    const add=(original,meta)=>{
      const old=map.get(original);
      if(old){if(old.rt!==meta.rt||old.status!==meta.status||old.plant!==meta.plant){old.rt="";old.ambiguous=true;}return;}
      map.set(original,{original,ctn:original,rt:meta.rt||"",status:field(meta.status),plant:field(meta.plant),expected:Number(meta.expected)||0});
    };
    parsed.leading.forEach(ctn=>add(ctn,{}));parsed.groups.forEach(g=>g.ctns.forEach(ctn=>add(ctn,g)));
    // OCR retries must not silently delete a previously reviewed candidate.
    Object.entries(photo.rc31Review?.ctns||{}).forEach(([original,review])=>{
      const row=map.get(original)||{original,ctn:original,stale:!review.added};map.set(original,{...row,...review,manual:true});
    });
    return [...map.values()];
  }
  function build(photos,legacyDecisions=[]){
    const groups=[],byKey=new Map(),rows=[];
    photos.forEach(photo=>candidates(photo).forEach(raw=>{
      let row={...raw};
      if(!row.manual){const older=legacyDecisions.find(d=>d.original===row.original&&d.photoIds.includes(photo.id));if(older)row={...row,...older.review,legacy:true};}
      row.status=field(row.status);row.plant=field(row.plant);row.photoId=photo.id;row.seq=Number(photo.seq)||0;
      rows.push(row);
    }));
    const compatible=(a,b)=>a.rt===b.rt&&(!a.status||!b.status||a.status===b.status)&&(!a.plant||!b.plant||a.plant===b.plant);
    // Resolve missing fields against complete alternatives, independent of photo order.
    // Never let an empty row bridge two explicitly different status/plant groups.
    const keys=[...new Map(rows.filter(r=>r.rt).map(r=>[[r.rt,r.status,r.plant].join('|'),{rt:r.rt,status:r.status,plant:r.plant}])).values()];
    const destinations=[];
    for(const rt of new Set(keys.map(k=>k.rt))){const same=keys.filter(k=>k.rt===rt),statuses=[...new Set(same.map(k=>k.status).filter(Boolean))],plants=[...new Set(same.map(k=>k.plant).filter(Boolean))];
      if(statuses.length<=1&&plants.length<=1)destinations.push({rt,status:statuses[0]||'',plant:plants[0]||''});
      else destinations.push(...same.filter(k=>!same.some(other=>compatible(k,other)&&(other.status===k.status||!k.status)&&(other.plant===k.plant||!k.plant)&&((!k.status&&other.status)||(!k.plant&&other.plant)))));
    }
    rows.forEach(row=>{
      if(row.rt){const matches=destinations.filter(k=>compatible(k,row));if(matches.length===1){row.status=row.status||matches[0].status;row.plant=row.plant||matches[0].plant;}else if(matches.length>1)row.groupAmbiguous=true;}
      const key=row.rt?[row.rt,row.status,row.plant].join("|"):"UNASSIGNED|"+row.photoId;
      if(!byKey.has(key)){const g={key,rt:row.rt,status:row.status,plant:row.plant,expected:row.expected||0,ctns:[],rows:[],photoIds:[],photoSeqs:[],warnings:[]};groups.push(g);byKey.set(key,g);}
      const g=byKey.get(key);g.rows.push(row);if(!g.ctns.includes(row.ctn))g.ctns.push(row.ctn);
      if(!g.photoIds.includes(row.photoId))g.photoIds.push(row.photoId);if(!g.photoSeqs.includes(row.seq))g.photoSeqs.push(row.seq);
      if(g.expected&&row.expected&&g.expected!==row.expected)g.warnings.push("來源總量不一致，請核對各張歸類。");else if(!g.expected&&row.expected)g.expected=row.expected;
      if(row.stale)g.warnings.push("保留先前人工核對 CTN，本次 OCR 未再讀到；請確認原照片。");
      if(row.ambiguous&&!row.manual)g.warnings.push("同一 CTN 有多個 OCR 歸屬，請手動歸類。");
      if(row.groupAmbiguous)g.warnings.push("此 RT 有不同狀態／廠區，請選定歸屬後再合併。");
      if(!validCtn(row.ctn))g.warnings.push("有 CTN 格式未完成，請人工核對。");
    });
    const owners=new Map();groups.forEach(g=>g.ctns.forEach(ctn=>{if(!owners.has(ctn))owners.set(ctn,[]);owners.get(ctn).push(g);}));
    owners.forEach(list=>{if(list.length>1)list.forEach(g=>g.warnings.push("相同 CTN 出現在其他群組，請核對歸屬；尚未自動刪除。"));});
    groups.forEach(g=>{g.overlapCount=g.rows.length-g.ctns.length;g.warnings=[...new Set(g.warnings)];g.ready=!!g.rt&&!!g.status&&!!g.plant&&g.expected>0&&g.ctns.length===g.expected&&!g.warnings.length;});
    return groups;
  }
  function updateReview(photo,selection,meta,{clear=false}={}){
    const all=candidates(photo),available=new Set(all.map(x=>x.original));
    if(!selection.length)throw new Error("請至少勾選一筆 CTN。");
    if(selection.some(x=>!available.has(x.original)&&!(x.added&&!clear&&validCtn(x.original)&&x.original===clean(x.ctn))))throw new Error("照片候選已變更，請重新開啟手動歸類。");
    const values={rt:clean(meta.rt),status:clean(meta.status),plant:clean(meta.plant),expected:Number(meta.expected)||0};
    if(!clear){
      if(!/^\d{5,8}$/.test(values.rt))throw new Error("請輸入正確的 5～8 位 RT 數字。");
      if(values.status.length>50||values.plant.length>20)throw new Error("狀態或廠區文字過長。");
      if(values.expected<0||!Number.isInteger(values.expected)||values.expected>10000)throw new Error("總量請填正整數，未知時可留空。");
      if(selection.some(x=>!validCtn(clean(x.ctn))))throw new Error("請核對勾選 CTN 格式，例如 AB12CDE。");
      if(new Set(selection.map(x=>clean(x.ctn))).size!==selection.length)throw new Error("勾選的 CTN 有重複，請先核對。");
    }
    const previous=photo.rc31Review||{},ctns={...(previous.ctns||{})},at=new Date().toISOString();
    const before={};selection.forEach(x=>{before[x.original]=ctns[x.original]||null;if(clear)delete ctns[x.original];else ctns[x.original]={...values,ctn:clean(x.ctn),added:!!(x.added||ctns[x.original]?.added),at};});
    const proposed=all.map(x=>ctns[x.original]?.ctn||x.original).concat(selection.filter(x=>!available.has(x.original)).map(x=>clean(x.ctn)));if(!clear&&new Set(proposed).size!==proposed.length)throw new Error("修改後與同張其他 CTN 重複，請先核對。");
    return {ctns,history:[...(previous.history||[]),{at,action:clear?"CLEAR":"ASSIGN",originals:selection.map(x=>x.original),before,after:clear?null:values}]};
  }
  const normalizeCtn=rules.normalizeCtn,unknown=v=>!v||v==="UNKNOWN"||v==="-";
  function parseHeader(line){
    const u=clean(line).replace(/[|]/g," "),tokens=u.match(/[A-Z0-9]+/g)||[];
    const rt=tokens[0]&&/^\d{5,8}$/.test(tokens[0])?tokens[0]:"";if(!rt||!tokens.some(t=>t==="CYLINDER"||t==="CYL"))return null;
    const ci=tokens.findIndex(t=>t==="CYLINDER"||t==="CYL");
    let status=clean(tokens[ci+1]||""),plant=clean(tokens[ci+2]||"");
    if(status==="TOTAL"){status="";plant="";}
    if(plant==="TOTAL")plant="";
    if(unknown(status))status="";if(unknown(plant))plant="";
    let expected=0;const ti=tokens.indexOf("TOTAL");if(ti>=0&&/^\d{1,3}$/.test(tokens[ti+1]||""))expected=Number(tokens[ti+1]);
    if(!expected){for(let i=tokens.length-1;i>=0;i--){if(/^\d{1,3}$/.test(tokens[i])){const n=Number(tokens[i]);if(n>0&&n<=200){expected=n;break;}}}}
    return {rt,status,plant,expected};
  }

  function parsePhoto(photo){
    const records=[];let current=null;const leading=[];
    String(photo.ocrText||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean).forEach(line=>{
      const h=parseHeader(line);if(h){current={...h,ctns:[],photoIds:[photo.id],photoSeqs:[Number(photo.seq)||0],warnings:[]};records.push(current);return;}
      const ctn=normalizeCtn(line);if(!ctn)return;if(current){if(!current.ctns.includes(ctn))current.ctns.push(ctn);}else if(!leading.includes(ctn))leading.push(ctn);
    });
    return {records,leading};
  }

  function compatible(a,b){
    if(a.rt!==b.rt)return false;
    if(a.status&&b.status&&a.status!==b.status)return false;
    if(a.plant&&b.plant&&a.plant!==b.plant)return false;
    return true;
  }

  function legacyModel(photos){
    const groups=[];const owner=new Map();let previous=null;
    photos.forEach(photo=>{
      const parsed=parsePhoto(photo);
      if(parsed.leading.length&&previous&&(!previous.expected||previous.ctns.length<previous.expected)){
        parsed.leading.forEach(ctn=>{if(!owner.has(ctn)&&(!previous.expected||previous.ctns.length<previous.expected)){previous.ctns.push(ctn);owner.set(ctn,previous);}});
      }else if(parsed.leading.length){groups.push({rt:"",status:"",plant:"",expected:0,ctns:parsed.leading.slice(),photoIds:[photo.id],photoSeqs:[Number(photo.seq)||0],warnings:[`有 ${parsed.leading.length} 支 CTN 在 RT 標題之前，暫不歸屬`]});}

      parsed.records.forEach(rec=>{
        let candidates=groups.filter(g=>g.rt&&compatible(g,rec));
        // 完全相同 RT+狀態+廠區優先；若其中一邊 OCR 漏欄位，只有唯一相容群組時才合併。
        const exact=candidates.filter(g=>g.rt===rec.rt&&g.status===rec.status&&g.plant===rec.plant);
        let dst=exact.length===1?exact[0]:(candidates.length===1?candidates[0]:null);
        if(!dst){dst={rt:rec.rt,status:rec.status,plant:rec.plant,expected:Number(rec.expected||0),ctns:[],photoIds:[],photoSeqs:[],warnings:[]};groups.push(dst);}
        if(!dst.status&&rec.status)dst.status=rec.status;if(!dst.plant&&rec.plant)dst.plant=rec.plant;
        if(dst.expected&&rec.expected&&dst.expected!==rec.expected)dst.warnings.push(`標籤總量跨照片不一致：${dst.expected} / ${rec.expected}`);else if(!dst.expected&&rec.expected)dst.expected=Number(rec.expected||0);
        rec.photoIds.forEach(id=>{if(!dst.photoIds.includes(id))dst.photoIds.push(id);});rec.photoSeqs.forEach(n=>{if(!dst.photoSeqs.includes(n))dst.photoSeqs.push(n);});
        rec.ctns.forEach(ctn=>{
          const other=owner.get(ctn);
          if(other&&other!==dst){dst.warnings.push(`CTN ${ctn} 已屬於其他 RT/狀態/廠區群組，未重複計入`);return;}
          if(!dst.ctns.includes(ctn)){dst.ctns.push(ctn);owner.set(ctn,dst);}
        });
        previous=dst;
      });
    });
    return groups;
  }


  function legacyDecisions(photos,overrides={}){
    if(!Object.keys(overrides).length)return [];
    const decisions=[];
    legacyModel(photos.filter(p=>p.ocrText)).forEach((g,i)=>{
      const entry=overrides[(g.rt||'ORPHAN')+'|'+(g.photoSeqs?.[0]||0)+'|'+i];if(!entry)return;
      g.ctns.forEach((original,j)=>{const photoIds=photos.filter(p=>candidates(p).some(r=>r.original===original)).map(p=>p.id);
        decisions.push({original,photoIds,review:{rt:g.rt,status:entry.status!==undefined?entry.status:g.status,plant:entry.plant!==undefined?entry.plant:g.plant,expected:entry.expected!==undefined?entry.expected:g.expected,ctn:entry.ctns?.[j]||original}});
      });
    });return decisions;
  }
  return {candidates,build,updateReview,legacyDecisions};
});

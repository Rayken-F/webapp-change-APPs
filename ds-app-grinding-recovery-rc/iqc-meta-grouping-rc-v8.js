"use strict";

(function installIqcMetaGroupingRcV8(){
  const VERSION="IQC_META_GROUPING_RC_V8_20260823";
  const DB_NAME="ds_iqc_image_rc_v1";
  const ACTIVE_BATCH_KEY="ds_iqc_image_rc_active_batch";
  if(window.__DS_IQC_META_GROUPING_V8)return;

  const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;","[":"[",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
  const clean=v=>String(v||"").trim().toUpperCase();
  const unknown=v=>!v||v==="UNKNOWN"||v==="-";
  let running=false,lastSignature="",lastModel=[];

  function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  async function getPhotos(batchId){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction("photos","readonly"),req=tx.objectStore("photos").index("batchId").getAll(batchId);req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>Number(a.seq)-Number(b.seq)));req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();});}

  function normalizeCtn(raw){
    const original=clean(raw).replace(/[^A-Z0-9]/g,"");if(original.length!==7)return"";
    const a=original.split(""),lm={"0":"O","1":"I","2":"Z","5":"S","8":"B","6":"G"},dm={"O":"0","Q":"0","D":"0","I":"1","L":"1","Z":"2","S":"5","B":"8","G":"6","T":"7"};
    [0,1,4,5].forEach(i=>{if(/\d/.test(a[i])&&lm[a[i]])a[i]=lm[a[i]];});[2,3].forEach(i=>{if(/[A-Z]/.test(a[i])&&dm[a[i]])a[i]=dm[a[i]];});
    const v=a.join("");return /^[A-Z]{2}\d{2}[A-Z]{2}[A-Z0-9]$/.test(v)?v:"";
  }

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

  function buildModel(photos){
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

  function batchOverrideKey(){return `ds_iqc_v8_meta_override_${localStorage.getItem(ACTIVE_BATCH_KEY)||"none"}`;}
  function loadOverrides(){try{return JSON.parse(localStorage.getItem(batchOverrideKey())||"{}");}catch(_){return{};}}
  function saveOverrides(v){try{localStorage.setItem(batchOverrideKey(),JSON.stringify(v));}catch(_){ }}
  function baseId(g,index){return `${g.rt||"ORPHAN"}|${g.photoSeqs&&g.photoSeqs[0]||0}|${index}`;}

  function hideBatchMeta(){
    const panel=document.getElementById("iqcImageRc");if(!panel)return;
    panel.querySelectorAll(".iqc-rc-field").forEach(field=>{const label=clean(field.querySelector("label")?.textContent||"");if(label.startsWith("區域")||label.startsWith("鋼瓶狀態"))field.style.display="none";});
    const grid=panel.querySelector(".iqc-rc-grid");if(grid&&!grid.querySelector(".ds-iqc-v8-meta-note")){const note=document.createElement("div");note.className="ds-iqc-v8-meta-note";note.style.cssText="grid-column:1/-1;padding:9px 10px;border-radius:12px;background:rgba(67,198,232,.08);border:1px solid rgba(67,198,232,.22);color:#d7f8ff;font-size:11px;line-height:1.5";note.textContent="RC v8：廠區與鋼瓶狀態改由每個 RT/照片群組辨識與複查，不再用整批單一值概括。";grid.appendChild(note);}
  }

  function renderModel(model){
    const host=document.getElementById("iqcRcResultList");if(!host)return;
    const overrides=loadOverrides();
    host.innerHTML=model.map((g,i)=>{
      const id=baseId(g,i),ov=overrides[id]||{};
      const status=clean(ov.status!==undefined?ov.status:g.status),plant=clean(ov.plant!==undefined?ov.plant:g.plant),expected=Math.max(0,Number(ov.expected!==undefined?ov.expected:g.expected||0));
      const ctns=Array.isArray(ov.ctns)?ov.ctns:g.ctns;
      const ready=!!g.rt&&!!status&&!!plant&&expected>0&&ctns.length===expected&&!g.warnings.length;
      const cls=ready?"good":"bad";
      const warnings=[];if(!g.rt)warnings.push("未辨識到 RT 標題");if(!status)warnings.push("未辨識鋼瓶狀態，請複查");if(!plant)warnings.push("未辨識廠區，請複查");if(expected&&ctns.length!==expected)warnings.push(`標籤總量 ${expected}，目前唯一 CTN ${ctns.length} 支`);g.warnings.forEach(w=>warnings.push(w));
      return `<div class="iqc-group ${cls} ds-iqc-v8-group" data-v8-id="${esc(id)}"><div class="iqc-group-title"><div><strong>RT ${esc(g.rt||"待辨識")}</strong><div class="iqc-group-sub">來源照片：${esc((g.photoSeqs||[]).sort((a,b)=>a-b).map(n=>`第${n}張`).join("、")||"-")}<br>群組鍵：RT + 狀態 + 廠區</div></div><span class="iqc-rc-status ${ready?"good":"bad"}">${ctns.length}/${expected||"?"} ${ready?"PASS":"複查"}</span></div><div class="iqc-rc-grid" style="margin-top:10px"><div class="iqc-rc-field"><label>鋼瓶狀態</label><input data-v8-field="status" value="${esc(status)}" placeholder="例如 OCYL" autocapitalize="characters"></div><div class="iqc-rc-field"><label>廠區</label><input data-v8-field="plant" value="${esc(plant)}" placeholder="例如 7A44" autocapitalize="characters"></div><div class="iqc-rc-field"><label>標籤總量</label><input data-v8-field="expected" type="number" min="1" value="${expected||""}"></div></div>${warnings.map(w=>`<div class="iqc-issue bad">${esc(w)}</div>`).join("")}<div class="iqc-ctn-grid">${ctns.map((ctn,ci)=>`<input class="iqc-ctn-input" data-v8-ctn-index="${ci}" value="${esc(ctn)}" autocapitalize="characters">`).join("")}</div></div>`;
    }).join("")||'<div class="iqc-empty">尚未形成可辨識的 RT／狀態／廠區群組。</div>';
    host.dataset.dsV8Rendered="1";
    host.querySelectorAll(".ds-iqc-v8-group").forEach(group=>{
      const id=group.dataset.v8Id;
      group.addEventListener("input",e=>{
        const all=loadOverrides(),entry=all[id]||{};
        if(e.target.dataset.v8Field){const f=e.target.dataset.v8Field;entry[f]=f==="expected"?Number(e.target.value||0):clean(e.target.value);}
        if(e.target.dataset.v8CtnIndex!==undefined){const modelGroup=model[Array.from(host.querySelectorAll('.ds-iqc-v8-group')).indexOf(group)];const current=Array.isArray(entry.ctns)?entry.ctns.slice():modelGroup.ctns.slice();current[Number(e.target.dataset.v8CtnIndex)]=normalizeCtn(e.target.value)||clean(e.target.value);entry.ctns=current;}
        all[id]=entry;saveOverrides(all);lastSignature="";setTimeout(refresh,80);
      });
    });
    const hint=document.getElementById("iqcRcCommitHint");if(hint)hint.textContent="RC v8：必須逐群確認 RT＋狀態＋廠區＋標籤總量＋CTN；正式寫入仍由 RC Safety Guard 鎖住。";
  }

  async function refresh(){
    if(running)return;const panel=document.getElementById("iqcImageRc");if(!panel||panel.classList.contains("hidden"))return;
    running=true;try{
      hideBatchMeta();const batchId=localStorage.getItem(ACTIVE_BATCH_KEY)||"";if(!batchId)return;
      const photos=await getPhotos(batchId);const sig=photos.map(p=>`${p.id}:${p.updatedAt}:${p.status}:${String(p.ocrText||"").length}`).join("|");
      const host=document.getElementById("iqcRcResultList");if(sig===lastSignature&&host&&host.querySelector(".ds-iqc-v8-group"))return;
      lastSignature=sig;lastModel=buildModel(photos.filter(p=>p.status==="RECOGNIZED"&&p.ocrText));renderModel(lastModel);
    }catch(err){console.warn("[IQC META V8]",err);}finally{running=false;}
  }

  // v8 測試期間「開始辨識」視為重新跑最新規則，避免舊 v7 OCR 結果殘留造成假分組。
  document.addEventListener("click",async e=>{
    const btn=e.target.closest&&e.target.closest("#iqcRcAnalyze");if(!btn||btn.dataset.dsV8Replay==="1")return;
    const batchId=localStorage.getItem(ACTIVE_BATCH_KEY)||"";if(!batchId)return;
    e.preventDefault();e.stopImmediatePropagation();btn.dataset.dsV8Replay="1";
    try{
      const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction("photos","readwrite"),store=tx.objectStore("photos"),req=store.index("batchId").getAll(batchId);req.onsuccess=()=>{(req.result||[]).forEach(p=>{p.status="LOCAL";p.ocrText="";p.events=[];p.updatedAt=new Date().toISOString();store.put(p);});};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});
      lastSignature="";btn.click();
    }catch(err){console.warn("[IQC META V8 replay]",err);btn.click();}finally{setTimeout(()=>delete btn.dataset.dsV8Replay,120);}
  },true);

  const observer=new MutationObserver(()=>{clearTimeout(observer.t);observer.t=setTimeout(refresh,100);});observer.observe(document.documentElement,{subtree:true,childList:true});
  setInterval(refresh,900);refresh();
  window.__DS_IQC_META_GROUPING_V8={version:VERSION,refresh,getModel:()=>lastModel};
})();

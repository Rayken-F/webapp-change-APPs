"use strict";

(function installIqcHybridSecondReaderV21(){
  const VERSION="IQC_HYBRID_SECOND_READER_RC_V21_20260825";
  const SOURCE_DB="ds_iqc_image_rc_v1";
  const SOURCE_DB_VERSION=1;
  const HYBRID_DB="ds_iqc_hybrid_rc_v15";
  const HYBRID_DB_VERSION=1;
  const ACTIVE_BATCH_KEY="ds_iqc_image_rc_active_batch";
  const STATUS_CACHE_MS=60000;
  const AUTO_RETRY_MS=60000;
  const SEND_GAP_MS=700;
  const ACTIVE_QUEUE_STATES=new Set(["AI_PENDING","AI_RETRY","AI_SENDING"]);
  const LOCKED_STATE="LOCAL_LOCKED";
  if(window.__DS_IQC_HYBRID_V15)return;

  let cloudStatus=null,cloudStatusAt=0,syncing=false,localAttemptedAt=0,lastEvaluatedSignature="",evaluationTimer=null,lastHintText="",lastHintBad=false;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const nowIso=()=>new Date().toISOString();
  const activeBatch=()=>String(localStorage.getItem(ACTIVE_BATCH_KEY)||"").trim();
  const attemptedKey=batchId=>`ds_iqc_hybrid_v15_local_attempted_${batchId}`;
  const evaluatedKey=batchId=>`ds_iqc_hybrid_v15_local_evaluated_${batchId}`;
  const clean=v=>String(v||"").trim().toUpperCase();

  function toastHybrid(message,error=false){
    try{if(typeof toast==="function")return toast(message,error);}catch(_){ }
    console[error?"error":"log"]("[IQC HYBRID V21]",message);
  }

  function openSourceDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(SOURCE_DB,SOURCE_DB_VERSION);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  function sourcePhotos(batchId){return openSourceDb().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction("photos","readonly"),req=tx.objectStore("photos").index("batchId").getAll(batchId);req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>Number(a.seq)-Number(b.seq)));req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();}));}
  function sourcePhoto(photoId){return openSourceDb().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction("photos","readonly"),req=tx.objectStore("photos").get(photoId);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();}));}
  function putSourcePhoto(photo){return openSourceDb().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction("photos","readwrite");tx.objectStore("photos").put(photo);tx.oncomplete=()=>{db.close();resolve(photo);};tx.onerror=()=>{db.close();reject(tx.error);};}));}

  function openHybridDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(HYBRID_DB,HYBRID_DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains("ai_jobs")){const s=db.createObjectStore("ai_jobs",{keyPath:"jobId"});s.createIndex("status","status",{unique:false});s.createIndex("batchId","batchId",{unique:false});}};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  function putJob(job){return openHybridDb().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction("ai_jobs","readwrite");tx.objectStore("ai_jobs").put(job);tx.oncomplete=()=>{db.close();resolve(job);};tx.onerror=()=>{db.close();reject(tx.error);};}));}
  function getJobs(){return openHybridDb().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction("ai_jobs","readonly"),req=tx.objectStore("ai_jobs").getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();}));}
  async function pendingJobs(batchId=""){const jobs=await getJobs();return jobs.filter(j=>(!batchId||j.batchId===batchId)&&["AI_PENDING","AI_RETRY"].includes(j.status));}

  function jobId(batchId,photoId){const safe=v=>String(v||"").replace(/[^A-Za-z0-9_.:-]/g,"_");return `IQCAI_${safe(batchId)}_${safe(photoId)}`;}
  function blobToBase64(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const value=String(reader.result||"");resolve(value.includes(",")?value.split(",").pop():value);};reader.onerror=()=>reject(reader.error||new Error("圖片轉 Base64 失敗"));reader.readAsDataURL(blob);});}

  function setHint(text,bad=false){const next=String(text||"");if(next===lastHintText&&bad===lastHintBad)return;lastHintText=next;lastHintBad=bad;const el=document.getElementById("iqcHybridHint");if(el){el.textContent=next;el.style.color=bad?"#ffd1d8":"#aab8df";}}

  function ensureUi(){
    const panel=document.getElementById("iqcImageRc");if(!panel||document.getElementById("iqcHybridV15Card"))return;
    const card=document.createElement("section");card.id="iqcHybridV15Card";card.className="iqc-rc-card";
    card.innerHTML=`<div class="iqc-rc-row iqc-rc-between"><strong>3. Hybrid 第二讀者</strong><span id="iqcHybridCloudStatus" class="iqc-rc-status warn">Cloud 檢查中…</span></div><div class="iqc-sync-summary"><div class="iqc-sync-box"><span>LOCAL PASS</span><strong id="iqcHybridLocalPass">0</strong></div><div class="iqc-sync-box"><span>AI待辨識</span><strong id="iqcHybridPending">0</strong></div><div class="iqc-sync-box"><span>AI已補完</span><strong id="iqcHybridVerified">0</strong></div></div><div class="iqc-rc-row" style="margin-top:10px"><button id="iqcHybridSyncBtn" class="iqc-rc-btn" type="button">☁️ 同步 AI 待辨識</button></div><div id="iqcHybridHint" class="iqc-rc-note">RC v21：Local 已完整的照片不送 Cloud；只有無法唯一歸屬的最小必要照片才升級 AI。</div>`;
    const progress=document.getElementById("iqcRcProgressText"),anchor=progress?.closest?.(".iqc-rc-card");if(anchor&&anchor.parentNode)anchor.insertAdjacentElement("afterend",card);else panel.querySelector(".iqc-rc-wrap")?.appendChild(card);
    document.getElementById("iqcHybridSyncBtn")?.addEventListener("click",()=>syncAiQueue({manual:true}));refreshUi();
  }

  async function getCloudStatus(force=false){
    if(!force&&cloudStatus&&Date.now()-cloudStatusAt<STATUS_CACHE_MS)return cloudStatus;
    if(typeof portalPost!=="function"){cloudStatus={ready:false,enabled:false,configured:false,message:"Portal API 尚未載入"};cloudStatusAt=Date.now();return cloudStatus;}
    try{const res=await portalPost("portal_iqc_cloud_ocr_status_rc",{});cloudStatus={...res,ready:!!res.ready};}
    catch(err){cloudStatus={ready:false,enabled:false,configured:false,message:String(err?.message||err||"Cloud backend 尚未啟用")};}
    cloudStatusAt=Date.now();refreshUi();return cloudStatus;
  }

  function parseHeader(line){
    const tokens=clean(line).replace(/[|]/g," ").match(/[A-Z0-9]+/g)||[];
    const rt=tokens[0]&&/^\d{5,8}$/.test(tokens[0])?tokens[0]:"";const ci=tokens.findIndex(t=>t==="CYLINDER"||t==="CYL");if(!rt||ci<0)return null;
    let status=clean(tokens[ci+1]||""),plant=clean(tokens[ci+2]||"");if(status==="TOTAL"){status="";plant="";}if(plant==="TOTAL")plant="";
    let expected=0;const ti=tokens.indexOf("TOTAL");if(ti>=0&&/^\d{1,3}$/.test(tokens[ti+1]||""))expected=Number(tokens[ti+1]);
    if(!expected){for(let i=tokens.length-1;i>=0;i--){if(/^\d{1,3}$/.test(tokens[i])){const n=Number(tokens[i]);if(n>0&&n<=200){expected=n;break;}}}}
    return {rt,status,plant,expected,complete:!!rt&&!!status&&!!plant&&expected>0};
  }
  function photoHeaderInfo(photo){const headers=String(photo.ocrText||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(parseHeader).filter(Boolean);return {headers,hasComplete:headers.some(h=>h.complete)};}
  function modelReady(model){return Array.isArray(model)&&model.length>0&&model.every(g=>!!g.rt&&!!g.status&&!!g.plant&&Number(g.expected||0)>0&&Array.isArray(g.ctns)&&g.ctns.length===Number(g.expected)&&!(g.warnings||[]).length);}
  async function metaModel(){const meta=window.__DS_IQC_META_GROUPING_V8;try{await meta?.refresh?.();}catch(_){ }return meta?.getModel?.()||[];}

  async function localBatchComplete(batchId){
    const photos=await sourcePhotos(batchId);if(!photos.length||photos.some(p=>p.status!=="RECOGNIZED"||!String(p.ocrText||"").trim()))return false;
    return modelReady(await metaModel());
  }

  async function selectCloudCandidate(batchId){
    const photos=await sourcePhotos(batchId);if(!photos.length)return [];
    const model=await metaModel();if(modelReady(model))return [];
    const jobs=await getJobs();const verified=new Set(jobs.filter(j=>j.batchId===batchId&&j.status==="AI_VERIFIED").map(j=>j.photoId));
    const available=photos.filter(p=>!verified.has(p.id));
    if(!available.length)return [];

    // Priority 1: Local engine failed / no usable text. Only one photo escalates at a time.
    const engineFail=available.find(p=>p.status!=="RECOGNIZED"||!String(p.ocrText||"").trim());if(engineFail)return [engineFail.id];

    // Priority 2: photo has CTNs/text but no complete RT+status+plant+total header.
    // This is the common continuation-photo case; if free continuity rules already made the batch PASS, modelReady() above returned early and Cloud cost is zero.
    const weak=available.find(p=>!photoHeaderInfo(p).hasComplete);if(weak)return [weak.id];

    // Priority 3: all photos have complete headers but the batch still cannot reconcile.
    // Escalate only ONE photo from an unresolved group, preferably the last source photo, then re-evaluate before spending on another.
    const unresolved=(model||[]).filter(g=>!(!!g.rt&&!!g.status&&!!g.plant&&Number(g.expected||0)>0&&Array.isArray(g.ctns)&&g.ctns.length===Number(g.expected)&&!(g.warnings||[]).length));
    const ids=[];unresolved.forEach(g=>(g.photoIds||[]).forEach(id=>{if(!ids.includes(id)&&!verified.has(id))ids.push(id);}));
    if(ids.length){const chosen=available.filter(p=>ids.includes(p.id)).sort((a,b)=>Number(b.seq)-Number(a.seq))[0];if(chosen)return [chosen.id];}
    return [];
  }

  async function reconcileSelectiveQueue(batchId,allowedIds){
    const allowed=new Set(allowedIds||[]),jobs=await getJobs();
    for(const job of jobs.filter(j=>j.batchId===batchId)){
      if(job.status==="AI_VERIFIED")continue;
      if(ACTIVE_QUEUE_STATES.has(job.status)&&!allowed.has(job.photoId)){
        job.status=LOCKED_STATE;job.lastError="";job.nextAttemptAt=0;job.updatedAt=nowIso();await putJob(job);
      }
    }
  }

  async function queueSelectiveForAi(batchId,reason){
    const selected=await selectCloudCandidate(batchId);await reconcileSelectiveQueue(batchId,selected);if(!selected.length){await refreshUi();return 0;}
    const jobs=await getJobs(),byId=new Map(jobs.map(j=>[j.jobId,j]));let added=0;
    for(const photoId of selected){
      const id=jobId(batchId,photoId),existing=byId.get(id);if(existing?.status==="AI_VERIFIED"||ACTIVE_QUEUE_STATES.has(existing?.status))continue;
      const job={jobId:id,batchId,photoId,status:"AI_PENDING",attempts:Number(existing?.attempts||0),reason:String(reason||"SELECTIVE_LOCAL_GAP"),lastError:"",nextAttemptAt:0,createdAt:existing?.createdAt||nowIso(),updatedAt:nowIso()};await putJob(job);added++;
      const photo=await sourcePhoto(photoId);if(photo&&photo.aiStatus!=="AI_PENDING"){photo.aiStatus="AI_PENDING";photo.updatedAt=nowIso();await putSourcePhoto(photo);}
    }
    await refreshUi();return added;
  }

  async function evaluateLocalResult(){
    const batchId=activeBatch();if(!batchId||localStorage.getItem(attemptedKey(batchId))!=="1")return;
    const btn=document.getElementById("iqcRcAnalyze");if(btn?.disabled)return;if(localAttemptedAt&&Date.now()-localAttemptedAt<2200)return;
    const photos=await sourcePhotos(batchId).catch(()=>[]);if(!photos.length||photos.some(p=>p.status==="PROCESSING"))return;
    const signature=photos.map(p=>`${p.id}:${p.status}:${p.aiStatus||""}:${String(p.ocrText||"").length}`).join("|");if(!signature||signature===lastEvaluatedSignature)return;lastEvaluatedSignature=signature;

    const pass=await localBatchComplete(batchId).catch(()=>false);
    if(pass){localStorage.setItem(evaluatedKey(batchId),"LOCAL_PASS");await reconcileSelectiveQueue(batchId,[]);setHint("LOCAL PASS：本批已由 Local OCR + 免費連續照片規則完整對帳；0 張送 Cloud。",false);refreshUi();return;}

    localStorage.setItem(evaluatedKey(batchId),"AI_PENDING");
    const selected=await selectCloudCandidate(batchId);const n=await queueSelectiveForAi(batchId,"SELECTIVE_LOCAL_GAP");
    if(selected.length){const photosNow=await sourcePhotos(batchId);const seq=photosNow.find(p=>p.id===selected[0])?.seq||"?";setHint(n?`本批尚未完整，只升級第 ${seq} 張至 AI_PENDING；其餘 Local 結果鎖住，不重複付費。`:`第 ${seq} 張已在 AI Queue；其餘 Local 結果不送 Cloud。`,false);if(navigator.onLine)syncAiQueue({manual:false});}
    else setHint("本批仍有歧義，但沒有值得再次送 Cloud 的照片；請人工複查，避免無效重複辨識費。",false);
    refreshUi();
  }

  async function applyCloudResult(job,photo,text){
    const localText=String(photo.localOcrText!==undefined?photo.localOcrText:(photo.ocrText||"")),cloudText=String(text||"").trim();photo.localOcrText=localText;photo.cloudOcrText=cloudText;photo.ocrText=[localText,cloudText].filter(Boolean).join("\n");photo.status="RECOGNIZED";photo.aiStatus="AI_VERIFIED";photo.aiUpdatedAt=nowIso();photo.updatedAt=nowIso();await putSourcePhoto(photo);job.status="AI_VERIFIED";job.lastError="";job.updatedAt=nowIso();await putJob(job);
  }

  async function sendJob(job){
    const photo=await sourcePhoto(job.photoId);if(!photo||!photo.blob)throw new Error("找不到本機原始照片");let base64="";
    try{base64=await blobToBase64(photo.blob);const res=await portalPost("portal_iqc_cloud_ocr_rc",{job_id:job.jobId,batch_id:job.batchId,photo_id:job.photoId,mime_type:String(photo.blob.type||"image/jpeg"),image_base64:base64});if(res.status==="PROCESSING"){job.status="AI_RETRY";job.nextAttemptAt=Date.now()+10000;job.updatedAt=nowIso();await putJob(job);return false;}if(res.status!=="DONE"||!String(res.text||"").trim())throw new Error("Cloud OCR 未回傳可用文字");await applyCloudResult(job,photo,res.text);return true;}finally{base64="";}
  }

  async function syncAiQueue({manual=false}={}){
    if(syncing)return;if(!navigator.onLine){setHint("目前離線：AI_PENDING 安全留在本機。",false);return;}
    const batchId=activeBatch();if(!batchId)return;const selected=await selectCloudCandidate(batchId);await reconcileSelectiveQueue(batchId,selected);
    syncing=true;const btn=document.getElementById("iqcHybridSyncBtn");if(btn)btn.disabled=true;
    try{
      const status=await getCloudStatus(manual);if(!status.ready){setHint(`Cloud 第二讀者尚未啟用：${status.message||"Backend 未就緒"}。Queue 不會遺失。`,false);return;}
      const jobs=(await pendingJobs(batchId)).filter(j=>!j.nextAttemptAt||Number(j.nextAttemptAt)<=Date.now()).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
      if(!jobs.length){if(await localBatchComplete(batchId).catch(()=>false))setHint("LOCAL PASS：目前沒有照片需要 Cloud。",false);return;}
      let done=0;
      for(const job of jobs){job.status="AI_SENDING";job.attempts=Number(job.attempts||0)+1;job.updatedAt=nowIso();await putJob(job);try{if(await sendJob(job))done++;}catch(err){job.status="AI_RETRY";job.lastError=String(err?.message||err||"Cloud OCR 失敗");job.nextAttemptAt=Date.now()+AUTO_RETRY_MS;job.updatedAt=nowIso();await putJob(job);if(/不支援|尚未|未啟用|configured|API Key/i.test(job.lastError)){cloudStatus={ready:false,enabled:false,configured:false,message:job.lastError};cloudStatusAt=Date.now();break;}}await refreshUi();await sleep(SEND_GAP_MS);}
      if(done){setHint(`Cloud 只補辨識 ${done} 張；正在重新做整批免費對帳，不會重送已完整的 Local 照片。`,false);lastEvaluatedSignature="";setTimeout(()=>evaluateLocalResult().catch(()=>{}),800);}
    }catch(err){setHint(`AI Queue 同步暫停：${err?.message||err}。照片仍在本機。`,true);}
    finally{syncing=false;if(btn)btn.disabled=false;refreshUi();}
  }

  async function refreshUi(){
    ensureUi();const batchId=activeBatch(),jobs=await getJobs().catch(()=>[]),batchJobs=batchId?jobs.filter(j=>j.batchId===batchId):[];const pending=batchJobs.filter(j=>ACTIVE_QUEUE_STATES.has(j.status)).length,verified=batchJobs.filter(j=>j.status==="AI_VERIFIED").length,localPass=batchId&&localStorage.getItem(evaluatedKey(batchId))==="LOCAL_PASS"?1:0;
    const p=document.getElementById("iqcHybridPending");if(p)p.textContent=String(pending);const v=document.getElementById("iqcHybridVerified");if(v)v.textContent=String(verified);const l=document.getElementById("iqcHybridLocalPass");if(l)l.textContent=String(localPass);const s=document.getElementById("iqcHybridCloudStatus");if(s){if(cloudStatus?.ready){s.className="iqc-rc-status good";s.textContent="Cloud 已就緒";}else if(cloudStatus){s.className="iqc-rc-status warn";s.textContent="Cloud 待啟用";}else{s.className="iqc-rc-status warn";s.textContent="Cloud 未檢查";}}
  }

  document.addEventListener("click",event=>{
    const btn=event.target.closest?.("#iqcRcAnalyze");if(!btn||btn.dataset.dsV8Replay==="1")return;const batchId=activeBatch();if(!batchId)return;
    if(localStorage.getItem(attemptedKey(batchId))==="1"){event.preventDefault();event.stopImmediatePropagation();setHint("Local OCR 已跑過；只重新評估最小必要 AI 照片，不重跑整批。",false);toastHybrid("改走選擇性 Cloud 第二讀者");lastEvaluatedSignature="";evaluateLocalResult().then(()=>syncAiQueue({manual:true}));return;}
    localStorage.setItem(attemptedKey(batchId),"1");localAttemptedAt=Date.now();lastEvaluatedSignature="";clearTimeout(evaluationTimer);evaluationTimer=setTimeout(()=>evaluateLocalResult().catch(console.warn),2500);
  },true);

  document.addEventListener("click",event=>{if(event.target.closest?.("#iqcRcNewBatch")){setTimeout(()=>{localAttemptedAt=0;lastEvaluatedSignature="";lastHintText="";refreshUi();},250);}},true);
  window.addEventListener("online",()=>{setHint("網路已恢復，檢查最小必要 AI Queue…",false);setTimeout(()=>syncAiQueue({manual:false}),1000);});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)setTimeout(()=>syncAiQueue({manual:false}),1200);});
  setInterval(()=>{ensureUi();evaluateLocalResult().catch(()=>{});refreshUi();},1200);
  setInterval(()=>{if(navigator.onLine)syncAiQueue({manual:false});},60000);

  ensureUi();getCloudStatus(false).catch(()=>{});refreshUi();
  window.__DS_IQC_HYBRID_V21={version:VERSION,syncAiQueue,queueSelectiveForAi,getCloudStatus,selectCloudCandidate};
  window.__DS_IQC_HYBRID_V15={version:VERSION,syncAiQueue,queueBatchForAi:queueSelectiveForAi,queueSelectiveForAi,getCloudStatus,selectCloudCandidate};
})();

"use strict";

(function installIqcHybridSecondReaderV15(){
  const VERSION="IQC_HYBRID_SECOND_READER_RC_V15_20260824";
  const SOURCE_DB="ds_iqc_image_rc_v1";
  const SOURCE_DB_VERSION=1;
  const HYBRID_DB="ds_iqc_hybrid_rc_v15";
  const HYBRID_DB_VERSION=1;
  const ACTIVE_BATCH_KEY="ds_iqc_image_rc_active_batch";
  const STATUS_CACHE_MS=60000;
  const AUTO_RETRY_MS=60000;
  const SEND_GAP_MS=700;
  if(window.__DS_IQC_HYBRID_V15)return;

  let cloudStatus=null;
  let cloudStatusAt=0;
  let syncing=false;
  let localAttemptedAt=0;
  let lastEvaluatedSignature="";
  let evaluationTimer=null;

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const nowIso=()=>new Date().toISOString();
  const activeBatch=()=>String(localStorage.getItem(ACTIVE_BATCH_KEY)||"").trim();
  const attemptedKey=batchId=>`ds_iqc_hybrid_v15_local_attempted_${batchId}`;
  const evaluatedKey=batchId=>`ds_iqc_hybrid_v15_local_evaluated_${batchId}`;

  function toastHybrid(message,error=false){
    try{if(typeof toast==="function")return toast(message,error);}catch(_){ }
    console[error?"error":"log"]("[IQC HYBRID V15]",message);
  }

  function openSourceDb(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(SOURCE_DB,SOURCE_DB_VERSION);
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }
  function sourcePhotos(batchId){
    return openSourceDb().then(db=>new Promise((resolve,reject)=>{
      const tx=db.transaction("photos","readonly");
      const req=tx.objectStore("photos").index("batchId").getAll(batchId);
      req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>Number(a.seq)-Number(b.seq)));
      req.onerror=()=>reject(req.error);
      tx.oncomplete=()=>db.close();
    }));
  }
  function sourcePhoto(photoId){
    return openSourceDb().then(db=>new Promise((resolve,reject)=>{
      const tx=db.transaction("photos","readonly");
      const req=tx.objectStore("photos").get(photoId);
      req.onsuccess=()=>resolve(req.result||null);
      req.onerror=()=>reject(req.error);
      tx.oncomplete=()=>db.close();
    }));
  }
  function putSourcePhoto(photo){
    return openSourceDb().then(db=>new Promise((resolve,reject)=>{
      const tx=db.transaction("photos","readwrite");
      tx.objectStore("photos").put(photo);
      tx.oncomplete=()=>{db.close();resolve(photo);};
      tx.onerror=()=>{db.close();reject(tx.error);};
    }));
  }

  function openHybridDb(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(HYBRID_DB,HYBRID_DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains("ai_jobs")){
          const s=db.createObjectStore("ai_jobs",{keyPath:"jobId"});
          s.createIndex("status","status",{unique:false});
          s.createIndex("batchId","batchId",{unique:false});
        }
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }
  function putJob(job){
    return openHybridDb().then(db=>new Promise((resolve,reject)=>{
      const tx=db.transaction("ai_jobs","readwrite");
      tx.objectStore("ai_jobs").put(job);
      tx.oncomplete=()=>{db.close();resolve(job);};
      tx.onerror=()=>{db.close();reject(tx.error);};
    }));
  }
  function getJobs(){
    return openHybridDb().then(db=>new Promise((resolve,reject)=>{
      const tx=db.transaction("ai_jobs","readonly");
      const req=tx.objectStore("ai_jobs").getAll();
      req.onsuccess=()=>resolve(req.result||[]);
      req.onerror=()=>reject(req.error);
      tx.oncomplete=()=>db.close();
    }));
  }
  async function pendingJobs(batchId=""){
    const jobs=await getJobs();
    return jobs.filter(j=>(!batchId||j.batchId===batchId)&&["AI_PENDING","AI_RETRY"].includes(j.status));
  }

  function jobId(batchId,photoId){
    const clean=v=>String(v||"").replace(/[^A-Za-z0-9_.:-]/g,"_");
    return `IQCAI_${clean(batchId)}_${clean(photoId)}`;
  }

  function blobToBase64(blob){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>{
        const value=String(reader.result||"");
        resolve(value.includes(",")?value.split(",").pop():value);
      };
      reader.onerror=()=>reject(reader.error||new Error("圖片轉 Base64 失敗"));
      reader.readAsDataURL(blob);
    });
  }

  function ensureUi(){
    const panel=document.getElementById("iqcImageRc");
    if(!panel||document.getElementById("iqcHybridV15Card"))return;
    const card=document.createElement("section");
    card.id="iqcHybridV15Card";
    card.className="iqc-rc-card";
    card.innerHTML=`
      <div class="iqc-rc-row iqc-rc-between">
        <strong>3. Hybrid 第二讀者</strong>
        <span id="iqcHybridCloudStatus" class="iqc-rc-status warn">Cloud 檢查中…</span>
      </div>
      <div class="iqc-sync-summary">
        <div class="iqc-sync-box"><span>LOCAL PASS</span><strong id="iqcHybridLocalPass">0</strong></div>
        <div class="iqc-sync-box"><span>AI待辨識</span><strong id="iqcHybridPending">0</strong></div>
        <div class="iqc-sync-box"><span>AI已補完</span><strong id="iqcHybridVerified">0</strong></div>
      </div>
      <div class="iqc-rc-row" style="margin-top:10px">
        <button id="iqcHybridSyncBtn" class="iqc-rc-btn" type="button">☁️ 同步 AI 待辨識</button>
      </div>
      <div id="iqcHybridHint" class="iqc-rc-note">Local OCR 只跑一次。完整對帳直接複查；不完整才排 Cloud 第二讀者。弱網時 AI_PENDING 會留在本機。</div>`;

    const progress=document.getElementById("iqcRcProgressText");
    const anchor=progress?.closest?.(".iqc-rc-card");
    if(anchor&&anchor.parentNode)anchor.insertAdjacentElement("afterend",card);
    else panel.querySelector(".iqc-rc-wrap")?.appendChild(card);

    document.getElementById("iqcHybridSyncBtn")?.addEventListener("click",()=>syncAiQueue({manual:true}));
    refreshUi();
  }

  function setHint(text,bad=false){
    const el=document.getElementById("iqcHybridHint");
    if(el){el.textContent=text;el.style.color=bad?"#ffd1d8":"#aab8df";}
  }

  async function getCloudStatus(force=false){
    if(!force&&cloudStatus&&Date.now()-cloudStatusAt<STATUS_CACHE_MS)return cloudStatus;
    if(typeof portalPost!=="function"){
      cloudStatus={ready:false,enabled:false,configured:false,message:"Portal API 尚未載入"};
      cloudStatusAt=Date.now();
      return cloudStatus;
    }
    try{
      const res=await portalPost("portal_iqc_cloud_ocr_status_rc",{});
      cloudStatus={...res,ready:!!res.ready};
    }catch(err){
      cloudStatus={ready:false,enabled:false,configured:false,message:String(err?.message||err||"Cloud backend 尚未啟用")};
    }
    cloudStatusAt=Date.now();
    refreshUi();
    return cloudStatus;
  }

  function domLocalComplete(){
    const host=document.getElementById("iqcRcResultList");
    if(!host)return false;
    const groups=Array.from(host.querySelectorAll(".ds-iqc-v8-group"));
    if(!groups.length)return false;
    if(host.querySelector(".iqc-issue.bad"))return false;
    return groups.every(g=>!!g.querySelector(".iqc-rc-status.good"));
  }

  async function localBatchComplete(batchId){
    const photos=await sourcePhotos(batchId);
    if(!photos.length)return false;
    if(photos.some(p=>p.status!=="RECOGNIZED"||!String(p.ocrText||"").trim()))return false;
    return domLocalComplete();
  }

  async function queueBatchForAi(batchId,reason){
    const photos=await sourcePhotos(batchId);
    if(!photos.length)return 0;
    let added=0;
    for(const photo of photos){
      const id=jobId(batchId,photo.id);
      const jobs=await getJobs();
      const existing=jobs.find(j=>j.jobId===id);
      if(existing&&existing.status==="AI_VERIFIED")continue;
      const job={
        jobId:id,batchId,photoId:photo.id,status:"AI_PENDING",attempts:Number(existing?.attempts||0),
        reason:String(reason||"LOCAL_INCOMPLETE"),lastError:"",nextAttemptAt:0,
        createdAt:existing?.createdAt||nowIso(),updatedAt:nowIso()
      };
      await putJob(job);added++;
      photo.aiStatus="AI_PENDING";
      photo.updatedAt=nowIso();
      await putSourcePhoto(photo);
    }
    await refreshUi();
    return added;
  }

  async function evaluateLocalResult(){
    const batchId=activeBatch();
    if(!batchId||localStorage.getItem(attemptedKey(batchId))!=="1")return;
    const btn=document.getElementById("iqcRcAnalyze");
    if(btn?.disabled)return;
    if(localAttemptedAt&&Date.now()-localAttemptedAt<2200)return;

    const photos=await sourcePhotos(batchId).catch(()=>[]);
    if(!photos.length||photos.some(p=>p.status==="PROCESSING"))return;
    const signature=photos.map(p=>`${p.id}:${p.status}:${p.updatedAt}:${String(p.ocrText||"").length}`).join("|");
    if(!signature||signature===lastEvaluatedSignature)return;
    lastEvaluatedSignature=signature;

    const pass=await localBatchComplete(batchId).catch(()=>false);
    localStorage.setItem(evaluatedKey(batchId),pass?"LOCAL_PASS":"AI_PENDING");
    if(pass){
      setHint("LOCAL PASS：本批已由本機 OCR + DS 規則完整對帳，不送 Cloud，不產生第二讀者費用。",false);
    }else{
      const n=await queueBatchForAi(batchId,"LOCAL_INCOMPLETE_OR_ENGINE_FAILURE");
      setHint(`本機結果未完整對帳，已排入 AI_PENDING（${n} 張）。有網路且 Cloud RC 啟用後才會逐張補辨識。`,false);
      if(navigator.onLine)syncAiQueue({manual:false});
    }
    refreshUi();
  }

  async function applyCloudResult(job,photo,text){
    const localText=String(photo.localOcrText!==undefined?photo.localOcrText:(photo.ocrText||""));
    const cloudText=String(text||"").trim();
    photo.localOcrText=localText;
    photo.cloudOcrText=cloudText;
    // RC 先保留雙讀者文字，meta-grouping 會依 RT+狀態+廠區與 CTN 去重。
    photo.ocrText=[localText,cloudText].filter(Boolean).join("\n");
    photo.status="RECOGNIZED";
    photo.aiStatus="AI_VERIFIED";
    photo.aiUpdatedAt=nowIso();
    photo.updatedAt=nowIso();
    await putSourcePhoto(photo);
    job.status="AI_VERIFIED";
    job.lastError="";
    job.updatedAt=nowIso();
    await putJob(job);
  }

  async function sendJob(job){
    const photo=await sourcePhoto(job.photoId);
    if(!photo||!photo.blob)throw new Error("找不到本機原始照片");
    let base64="";
    try{
      base64=await blobToBase64(photo.blob);
      const res=await portalPost("portal_iqc_cloud_ocr_rc",{
        job_id:job.jobId,
        batch_id:job.batchId,
        photo_id:job.photoId,
        mime_type:String(photo.blob.type||"image/jpeg"),
        image_base64:base64
      });
      if(res.status==="PROCESSING"){
        job.status="AI_RETRY";
        job.nextAttemptAt=Date.now()+10000;
        job.updatedAt=nowIso();
        await putJob(job);
        return false;
      }
      if(res.status!=="DONE"||!String(res.text||"").trim())throw new Error("Cloud OCR 未回傳可用文字");
      await applyCloudResult(job,photo,res.text);
      return true;
    } finally {
      base64=""; // 不在 JS state 長期保留大型 Base64 字串
    }
  }

  async function syncAiQueue({manual=false}={}){
    if(syncing)return;
    if(!navigator.onLine){
      setHint("目前離線：AI_PENDING 已安全留在本機，網路恢復後再同步。",false);
      return;
    }
    syncing=true;
    const btn=document.getElementById("iqcHybridSyncBtn");if(btn)btn.disabled=true;
    try{
      const status=await getCloudStatus(manual);
      if(!status.ready){
        setHint(`Cloud 第二讀者尚未啟用：${status.message||`enabled=${!!status.enabled}, configured=${!!status.configured}`}。Queue 不會遺失，也不會產生費用。`,false);
        return;
      }
      const jobs=(await pendingJobs()).filter(j=>!j.nextAttemptAt||Number(j.nextAttemptAt)<=Date.now()).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
      if(!jobs.length){setHint("目前沒有需要 Cloud 補辨識的照片。",false);return;}
      let done=0;
      for(const job of jobs){
        job.status="AI_SENDING";job.attempts=Number(job.attempts||0)+1;job.updatedAt=nowIso();await putJob(job);
        try{
          if(await sendJob(job))done++;
        }catch(err){
          job.status="AI_RETRY";
          job.lastError=String(err?.message||err||"Cloud OCR 失敗");
          job.nextAttemptAt=Date.now()+AUTO_RETRY_MS;
          job.updatedAt=nowIso();
          await putJob(job);
          // backend 尚未整合/停用時不要連續轟 API。
          if(/不支援|尚未|未啟用|configured|API Key/i.test(job.lastError)){
            cloudStatus={ready:false,enabled:false,configured:false,message:job.lastError};cloudStatusAt=Date.now();
            break;
          }
        }
        await refreshUi();
        await sleep(SEND_GAP_MS);
      }
      setHint(done?`Cloud 第二讀者已補完 ${done} 張；DS 正在重新依 RT／狀態／廠區／CTN 規則分組。`:`本輪沒有完成新的 Cloud OCR；待網路或 Backend RC 就緒後再續傳。`,false);
    }catch(err){
      setHint(`AI Queue 同步暫停：${err?.message||err}。照片仍在本機。`,true);
    }finally{
      syncing=false;if(btn)btn.disabled=false;refreshUi();
    }
  }

  async function refreshUi(){
    ensureUi();
    const batchId=activeBatch();
    const jobs=await getJobs().catch(()=>[]);
    const batchJobs=batchId?jobs.filter(j=>j.batchId===batchId):[];
    const pending=batchJobs.filter(j=>["AI_PENDING","AI_RETRY","AI_SENDING"].includes(j.status)).length;
    const verified=batchJobs.filter(j=>j.status==="AI_VERIFIED").length;
    const localPass=batchId&&localStorage.getItem(evaluatedKey(batchId))==="LOCAL_PASS"?1:0;
    const p=document.getElementById("iqcHybridPending");if(p)p.textContent=String(pending);
    const v=document.getElementById("iqcHybridVerified");if(v)v.textContent=String(verified);
    const l=document.getElementById("iqcHybridLocalPass");if(l)l.textContent=String(localPass);
    const s=document.getElementById("iqcHybridCloudStatus");
    if(s){
      if(cloudStatus?.ready){s.className="iqc-rc-status good";s.textContent="Cloud 已就緒";}
      else if(cloudStatus){s.className="iqc-rc-status warn";s.textContent="Cloud 待啟用";}
      else{s.className="iqc-rc-status warn";s.textContent="Cloud 未檢查";}
    }
  }

  // 必須比 meta-grouping v8 更早載入：第二次人工點擊不再重跑 Local OCR。
  document.addEventListener("click",event=>{
    const btn=event.target.closest?.("#iqcRcAnalyze");
    if(!btn)return;
    if(btn.dataset.dsV8Replay==="1")return; // v8 第一次內部 replay 仍允許
    const batchId=activeBatch();
    if(!batchId)return;
    if(localStorage.getItem(attemptedKey(batchId))==="1"){
      event.preventDefault();event.stopImmediatePropagation();
      setHint("本批 Local OCR 已跑過一次，不再重複消耗手機資源；現在改走 AI 第二讀者 Queue。",false);
      toastHybrid("本機 OCR 已跑過，改走 Cloud 第二讀者 Queue");
      queueBatchForAi(batchId,"MANUAL_SECOND_READER").then(()=>syncAiQueue({manual:true}));
      return;
    }
    localStorage.setItem(attemptedKey(batchId),"1");
    localAttemptedAt=Date.now();
    lastEvaluatedSignature="";
    clearTimeout(evaluationTimer);
    evaluationTimer=setTimeout(()=>evaluateLocalResult().catch(console.warn),2500);
  },true);

  document.addEventListener("click",event=>{
    if(event.target.closest?.("#iqcRcNewBatch")){
      setTimeout(()=>{localAttemptedAt=0;lastEvaluatedSignature="";refreshUi();},250);
    }
  },true);

  window.addEventListener("online",()=>{
    setHint("網路已恢復，正在檢查 AI_PENDING Queue…",false);
    setTimeout(()=>syncAiQueue({manual:false}),1000);
  });
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)setTimeout(()=>syncAiQueue({manual:false}),1200);});

  setInterval(()=>{
    ensureUi();
    evaluateLocalResult().catch(()=>{});
    refreshUi();
  },1200);
  setInterval(()=>{if(navigator.onLine)syncAiQueue({manual:false});},60000);

  ensureUi();
  getCloudStatus(false).catch(()=>{});
  refreshUi();
  window.__DS_IQC_HYBRID_V15={version:VERSION,syncAiQueue,queueBatchForAi,getCloudStatus};
})();

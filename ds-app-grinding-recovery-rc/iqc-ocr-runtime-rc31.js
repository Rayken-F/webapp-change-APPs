/* RC31.4 / OCR-S5-20260923. Loaded before intake/legacy click handlers. */
(function(){
  "use strict";
  const BUILD="RC31.4 / OCR-S5-20260923",DB="ds_iqc_image_rc_v1",ACTIVE="ds_iqc_image_rc_active_batch";
  const LOG="ds_iqc_ocr_rc31_diagnostics",LIB="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  const WORKER=new URL("./iqc-ocr-worker-rc31.js?v=20260920-1",document.currentScript.src).href;
  const rules=window.IqcOcrRules31,$=id=>document.getElementById(id);
  let operation=null,sequence=0,currentPhoto=0,trace=[],uiTimer,queuedStart=null,refreshSequence=0,viewSignature="";
  try{trace=JSON.parse(localStorage.getItem(LOG)||"[]").slice(-100);}catch(_){}
  const activeBatch=()=>localStorage.getItem(ACTIVE)||"";
  const api=()=>window.__DS_IQC_IMAGE_RC?.rc31;
  const now=()=>new Date().toISOString();
  function text(id,value){const e=$(id);if(e&&e.textContent!==value)e.textContent=value;}
  let progressMessage="尚未開始辨識",batchProgress={done:0,total:0,failed:0};
  function progress(value){progressMessage=value;text("iqcRcProgressText",value);text("iqc31ActionStatus",value);text("iqc31LivePhase",value);updateLive();}
  function updateLive(){
    const b=batchProgress,task=operation?.task;
    text("iqc31LiveCount",b.total?`已處理 ${b.done}/${b.total}${task&&!task.ended?`｜第 ${currentPhoto} 張 · ${Math.floor((Date.now()-task.started)/1000)} 秒`:`｜未完成 ${b.failed} 張`}`:"加入照片後即可開始辨識");
    const bar=$("iqcRcProgressBar");if(bar)bar.style.width=(b.total?Math.round(b.done/b.total*100):0)+"%";
    if($("iqc31Skip"))$("iqc31Skip").disabled=!task||task.ended;
  }
  function record(event){
    // No account, token, filename, CTN, OCR text or image in diagnostic exports.
    trace.push({at:now(),run:operation?.id||0,photo:currentPhoto,...event});trace=trace.slice(-100);
    try{localStorage.setItem(LOG,JSON.stringify(trace));}catch(_){}
    if($("iqc31LogText"))$("iqc31LogText").value=JSON.stringify(diagnosticSnapshot(),null,2);
  }
  function diagnosticSnapshot(){return {build:BUILD,queue:{busy:!!operation,kind:operation?.kind||"",photo:currentPhoto,...batchProgress},events:trace.slice()};}
  function errorLabel(e){
    const code=e?.code||"WORKER_ERROR";
    return /TIMEOUT/.test(code)?"等候逾時，已停止舊引擎；照片保留，請重試":code==="CANCELLED"?"已停止，照片與完成結果保留":code==="LIB_LOAD"?"OCR 程式下載失敗，請檢查網路後重試":code==="DECODE_ERROR"?"照片無法解碼，請改用原始 JPEG／PNG 照片":code==="NO_TEXT"?"引擎已完成辨識，但沒有讀到可用文字；請檢查照片或手動補辨識":/^STORAGE_/.test(code)?"本機儲存失敗，請保留原照片並複製辨識紀錄":code==="OTHER_TAB_BUSY"?"另一個 RC31 分頁正在處理照片，請先完成或停止該分頁":"辨識中斷，已停止舊引擎；請複製辨識紀錄或重試";
  }
  const fail=window.IqcOcrEngine31.fault;
  function createOwnedWorker(logger){
    let native=null,wrapper=null,dead=false,script=null,rejectLoad;
    const terminate=()=>{
      dead=true;if(script){script.onload=null;script.onerror=null;script.remove();script=null;rejectLoad?.(fail("CANCELLED"));}
      try{native?.terminate();}catch(_){}try{Promise.resolve(wrapper?.terminate()).catch(()=>{});}catch(_){}
    };
    const library=window.Tesseract?Promise.resolve():new Promise((resolve,reject)=>{
      rejectLoad=reject;script=document.createElement("script");script.src=LIB;script.crossOrigin="anonymous";
      script.onload=()=>{script.remove();script=null;resolve();};script.onerror=()=>reject(fail("LIB_LOAD"));document.head.appendChild(script);
    });
    const ready=library.then(()=>{
      if(dead)throw fail("CANCELLED");
      return new Promise((resolve,reject)=>{
        const NativeWorker=window.Worker;
        // Tesseract 5.1.1 synchronously spawns its native Worker before its first await.
        // Capture only our same-origin entry, and restore the constructor immediately.
        window.Worker=new Proxy(NativeWorker,{construct(target,args){
          const w=Reflect.construct(target,args);
          if(String(args[0])===WORKER){native=w;w.addEventListener("error",()=>{reject(fail("WORKER_CRASH"));if(!dead)engine.dispose("WORKER_CRASH");});}
          return w;
        }});
        let pending;
        try{
          pending=window.Tesseract.createWorker("eng",1,{workerPath:WORKER,workerBlobURL:false,
            corePath:"https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1",langPath:"https://tessdata.projectnaptha.com/4.0.0",
            logger,errorHandler:()=>{reject(fail("WORKER_ERROR"));if(!dead)engine.dispose("WORKER_ERROR");}});
        }catch(e){reject(e);}finally{window.Worker=NativeWorker;}
        if(!native){Promise.resolve(pending).then(w=>w?.terminate()).catch(()=>{});reject(fail("WORKER_CAPTURE"));return;}
        Promise.resolve(pending).then(w=>{wrapper=w;if(dead){terminate();reject(fail("CANCELLED"));}else resolve(w);},reject);
      });
    });
    return {ready,terminate};
  }
  let lastPhase="";
  const engine=new window.IqcOcrEngine31.Engine({create:createOwnedWorker,onEvent:event=>{
    if(event.stage==="engine_progress"){
      const phase=String(event.status||"");
      if(phase!==lastPhase){lastPhase=phase;record({stage:"engine_progress",status:phase});}
      const label={"loading tesseract core":"載入辨識核心","initializing tesseract":"初始化辨識核心","loading language traineddata":"載入英數字模型","initializing api":"準備辨識","recognizing text":"辨識文字"}[phase]||"準備辨識";
      progress(`第 ${currentPhoto} 張｜第 ${operation?.task?.pass||1} 次讀取｜${label}${Number.isFinite(event.progress)?" "+Math.round(event.progress*100)+"%":""}`);
    }else record(event);
  }});
  function openDb(){return new Promise((resolve,reject)=>{let ended=false;const r=indexedDB.open(DB,1),timer=setTimeout(()=>{ended=true;reject(fail("STORAGE_OPEN_TIMEOUT"));},15000);r.onsuccess=()=>{clearTimeout(timer);if(ended)r.result.close();else resolve(r.result);};r.onerror=()=>{clearTimeout(timer);reject(fail("STORAGE_ERROR"));};});}
  async function photoTransaction(mode,work){const db=await openDb();return new Promise((resolve,reject)=>{
    let value,tx,timeout=false;try{tx=db.transaction("photos",mode);}catch(_){db.close();reject(fail("STORAGE_ERROR"));return;}
    const timer=setTimeout(()=>{timeout=true;try{tx.abort();}catch(_){}db.close();reject(fail("STORAGE_TRANSACTION_TIMEOUT"));},15000);
    tx.oncomplete=()=>{clearTimeout(timer);db.close();resolve(value);};
    tx.onabort=tx.onerror=event=>{clearTimeout(timer);const name=tx.error?.name||event.target?.error?.name;db.close();reject(fail(timeout?"STORAGE_TRANSACTION_TIMEOUT":["QuotaExceededError","UnknownError","DataCloneError","AbortError"].includes(name)?"STORAGE_"+name:"STORAGE_ERROR"));};
    try{work(tx.objectStore("photos"),v=>{value=v;});}catch(_){try{tx.abort();}catch(_){}clearTimeout(timer);db.close();reject(fail("STORAGE_ERROR"));}
  });}
  // Keep only metadata and small thumbnails in the queue/UI. Read one full image for OCR.
  const photos=batch=>photoTransaction("readonly",(s,done)=>{const list=[],r=s.index("batchId").openCursor(IDBKeyRange.only(batch));r.onsuccess=()=>{const c=r.result;if(c){const {blob,...meta}=c.value;list.push(meta);c.continue();}else done(list.sort((a,b)=>a.seq-b.seq));};});
  const getPhoto=id=>photoTransaction("readonly",(s,done)=>{const r=s.get(id);r.onsuccess=()=>done(r.result);});
  const put=photo=>photoTransaction("readwrite",s=>s.put(photo));
  function check(run){const parent=run.parent||run;if(parent.cancelled||operation!==parent||activeBatch()!==parent.batch)throw fail("CANCELLED");if(run.parent&&(run.ended||parent.task!==run))throw fail(run.reason||"PHOTO_SKIPPED");}
  function stopPhoto(reason="PHOTO_SKIPPED"){
    const task=operation?.task;if(!task||task.ended)return;
    task.reason=reason;task.ended=true;task.abort.abort();engine.dispose(reason);
  }
  function claim(kind){
    if(operation)return null;
    const run={id:++sequence,kind,batch:activeBatch(),cancelled:false,abort:new AbortController()};operation=run;
    record({stage:kind,outcome:"started"});paint();return run;
  }
  function cancel(){
    const run=operation;if(!run||run.kind==="cloud")return;
    queuedStart=null;run.cancelled=true;run.abort.abort();stopPhoto("CANCELLED");engine.dispose("CANCELLED");progress("正在停止；已保存的照片與完成結果會保留。");
  }
  async function exclusive(run,work){
    if(navigator.locks)return navigator.locks.request("ds-iqc-ocr-rc31",{ifAvailable:true},async lock=>{if(!lock)throw fail("OTHER_TAB_BUSY");check(run);return work();});
    check(run);return work();
  }
  async function refresh(){const id=++refreshSequence,batch=activeBatch(),list=batch?await photos(batch):[];
    if(id!==refreshSequence||batch!==activeBatch())return;
    try{const signature=batch+"|"+JSON.stringify(list.map(p=>[p.id,p.status,p.updatedAt]));if(signature!==viewSignature){viewSignature=signature;api()?.renderPhotos(list);}installUi();await window.__DS_IQC_META_GROUPING_V8?.refresh(list);paint();}
    catch(_){record({stage:"render",outcome:"error",code:"UI_RENDER_ERROR"});}
  }
  async function finish(run){
    // Storage has settled before this point. UI repaint must not keep the start button locked.
    if(operation!==run)return;operation=null;currentPhoto=0;engine.release();paint();
    record({stage:"released",kind:run.kind,outcome:run.cancelled?"cancelled":run.failed?"error":"ok"});
    const next=queuedStart;queuedStart=null;
    if(next&&next.after===run.id&&!run.cancelled&&!run.failed){record({stage:"queued_start",outcome:"accepted"});runBatch(next.photoId);}
    else refresh().catch(e=>record({stage:"refresh",outcome:"error",code:e.code||"STORAGE_ERROR"}));
  }
  function requestStart(photoId){
    record({stage:"start_request",outcome:operation?"busy":"accepted",busyKind:operation?.kind||""});
    if(operation){
      if(["save_photos","open_panel","edit_batch","review"].includes(operation.kind)){
        queuedStart={after:operation.id,photoId};progress("已收到開始指令，照片保存／整理完成後會自動辨識，不需要連按。");paint();
      }else if(operation.kind==="local_ocr")progress(`已在辨識第 ${currentPhoto||1} 張，請稍候；不用再按開始。`);
      else progress("正在補辨識，完成後可再開始本機辨識。");
      return;
    }
    progress("已收到開始指令，正在準備照片…");runBatch(photoId);
  }
  async function timed(run,label,work,ms=30000){
    check(run);const started=Date.now();record({stage:label,outcome:"started"});let timer,abort;
    const gate=new Promise((_,reject)=>{abort=()=>reject(fail(run.reason||"CANCELLED"));run.abort.signal.addEventListener("abort",abort,{once:true});timer=setTimeout(()=>reject(fail(label+"_TIMEOUT")),ms);});
    try{const result=await Promise.race([Promise.resolve().then(work),gate]);check(run);record({stage:label,outcome:"ok",ms:Date.now()-started});return result;}
    catch(e){record({stage:label,outcome:"error",ms:Date.now()-started,code:e.code||"IMAGE_ERROR"});throw e;}
    finally{clearTimeout(timer);run.abort.signal.removeEventListener("abort",abort);}
  }
  async function ingest(files){
    const run=claim("save_photos");if(!run)return;
    let saved=0;
    try{await exclusive(run,async()=>{
      if(!run.batch){await api().refresh();run.batch=activeBatch();}
      const existing=await photos(run.batch);let seq=existing.reduce((n,p)=>Math.max(n,Number(p.seq)||0),0);
      for(const file of files){
        check(run);currentPhoto=seq+1;progress(`正在保存第 ${currentPhoto} 張照片…`);
        const {blob,thumbnail}=await decodeAndCompress(file,run);check(run);
        await put({id:"PHOTO_"+crypto.randomUUID(),batchId:run.batch,seq:++seq,name:file.name||`photo_${seq}.jpg`,blob,thumbnail,size:blob.size,status:"LOCAL",ocrText:"",confidence:0,events:[],createdAt:now(),updatedAt:now()});saved++;
      }
    });progress(`已保存 ${saved} 張照片，可按「開始辨識未完成照片」。`);}
    catch(e){run.failed=true;record({stage:"save_photos",outcome:"error",code:e.code||"IMAGE_ERROR"});progress(`已保存 ${saved} 張。${errorLabel(e)}`);}
    finally{await finish(run);}
  }
  async function decodeAndCompress(file,run){
    const img=new Image(),url=URL.createObjectURL(file);let canvas;
    try{
      await timed(run,"decode",()=>new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(fail("DECODE_ERROR"));img.src=url;}));
      check(run);const scale=Math.min(1,1800/Math.max(img.naturalWidth,img.naturalHeight));canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));canvas.getContext("2d",{alpha:false}).drawImage(img,0,0,canvas.width,canvas.height);
      const blob=await timed(run,"compress",()=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(fail("DECODE_ERROR")),"image/jpeg",.78)));
      const small=Math.min(1,160/Math.max(img.naturalWidth,img.naturalHeight));canvas.width=Math.max(1,Math.round(img.naturalWidth*small));canvas.height=Math.max(1,Math.round(img.naturalHeight*small));canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
      const thumbnail=await timed(run,"thumbnail",()=>new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.65)));
      return {blob,thumbnail};
    }finally{img.onload=null;img.onerror=null;img.src="";URL.revokeObjectURL(url);if(canvas){canvas.width=canvas.height=1;}}
  }
  async function pipeline(photo,run){
    // One retry per user-started run for a transient startup/download failure.
    // Timeouts, cancellation and recognition failures are not blindly retried.
    try{await engine.ensure();check(run);}catch(e){
      check(run);
      const parent=run.parent||run;if(parent.initRetried||! /^(LIB_LOAD|WORKER_ERROR|WORKER_CRASH)$/.test(e.code||""))throw e;
      parent.initRetried=true;record({stage:"initialize_retry",code:e.code});
      progress(`第 ${currentPhoto} 張｜辨識核心連線中斷，正在重新準備一次…`);
      await engine.ensure();check(run);
    }
    const recognize=(image,mode)=>{check(run);run.pass=(run.pass||0)+1;record({stage:"pass",number:run.pass,mode});return engine.recognize(image,mode);};
    const image=await timed(run,"preprocess",()=>rules.preprocessForOcr(photo.blob));check(run);
    const results=[];results.push(await recognize(image,"6"));check(run);
    let merged=rules.mergeParsedPasses(results)||String(results[0]?.data?.text||"");
    if(rules.needsSparse(merged)){results.push(await recognize(image,"11"));check(run);merged=rules.mergeParsedPasses(results)||merged;}
    if(rules.needsHighContrast(merged)){
      const variant=await timed(run,"contrast",()=>rules.makeVariant(image));check(run);
      results.push(await recognize(variant,"6"));check(run);merged=rules.mergeParsedPasses(results)||merged;
    }
    if(rules.structuralState(merged).found===0){
      const region=await timed(run,"text_region",()=>rules.makeTextRegion(photo.blob));check(run);
      if(region){results.push(await recognize(region,"6"));check(run);merged=rules.mergeParsedPasses(results)||merged;
        if(rules.structuralState(merged).found===0){results.push(await recognize(region,"11"));check(run);merged=rules.mergeParsedPasses(results)||merged;}}
    }
    return {text:merged,confidence:Number(results[0]?.data?.confidence||0),passes:results.map((r,i)=>({pass:i+1,text:String(r?.data?.text||""),confidence:Number(r?.data?.confidence||0)}))};
  }
  async function runBatch(photoId){
    const run=claim("local_ocr");if(!run)return;
    let done=0,total=0,failed=0;
    try{await exclusive(run,async()=>{
      const all=await photos(run.batch),pending=all.filter(p=>p.aiStatus!=="AI_VERIFIED"&&(photoId?p.id===photoId:!(p.status==="RECOGNIZED"&&rules.structuralState(p.ocrText).found>0)));total=pending.length;
      batchProgress={done:0,total,failed:0};record({stage:"selection",total,skipped:all.length-total});if(!total){progress("沒有尚未完成的照片；如需重試已讀到 CTN 的照片，請按該張「重新辨識」。");return;}
      for(const item of pending){
        check(run);currentPhoto=item.seq;
        // Release the WASM heap regularly; model files remain in the browser cache.
        if(batchProgress.done&&batchProgress.done%4===0)engine.dispose("BATCH_RECYCLE");
        const original=await getPhoto(item.id);check(run);if(!original||original.batchId!==run.batch)throw fail("STORAGE_PHOTO_MISSING");
        await put({...original,status:"PROCESSING",updatedAt:now()});
        const task={parent:run,batch:run.batch,abort:new AbortController(),started:Date.now(),ended:false};run.task=task;
        const deadline=setTimeout(()=>stopPhoto("PHOTO_TIMEOUT"),120000);
        try{
          check(run);progress(`第 ${currentPhoto} 張｜準備辨識…`);
          const result=await pipeline(original,task);check(task);
          clearTimeout(deadline);task.ended=true;run.task=null;
          if(!result.text.trim())throw fail("NO_TEXT");
          const found=rules.structuralState(result.text).found;
          await put({...original,ocrText:result.text,events:rules.parseEvents(result.text),status:found?"RECOGNIZED":"NEEDS_REVIEW",confidence:result.confidence,engineConfidence:result.confidence,
            rc31RawPasses:result.passes,localFailure:found?"":"NO_CTN",ocrBuild:BUILD,updatedAt:now()});
          if(found)done++;else failed++;record({stage:"photo_saved",outcome:found?"ok":"needs_review",candidates:found,passes:result.passes.length});await refresh();
        }catch(e){
          // Keep any earlier valid result. A failed retry must not erase it or its Cloud result.
          const keep=original.status==="RECOGNIZED"&&rules.structuralState(original.ocrText).found>0;
          await put({...original,status:keep?"RECOGNIZED":"LOCAL_FAILED",localFailure:e.code||"WORKER_ERROR",updatedAt:now()});
          failed++;record({stage:"photo_failed",outcome:"error",code:e.code||"WORKER_ERROR"});
          if(run.cancelled||/^STORAGE_|^initialize_|^LIB_LOAD$|^CANCELLED$/.test(e.code||""))throw e;
          engine.dispose(e.code||"WORKER_ERROR");await refresh();
          // A blank/failed individual photo must not prevent the other saved photos being attempted.
        }finally{clearTimeout(deadline);task.ended=true;run.task=null;batchProgress={done:done+failed,total,failed};updateLive();}
      }
      if(total)progress(`本輪完成 ${done}/${total} 張${failed?`，${failed} 張未完成，可依照片狀態重試`:""}。缺 RT 的 CTN 請按「手動歸類」，辨識字元仍需複查。`);
    });record({stage:"local_ocr",outcome:"finished",done,failed,total});}
    catch(e){run.failed=true;engine.dispose(e.code||"WORKER_ERROR");record({stage:"local_ocr",outcome:"error",code:e.code||"WORKER_ERROR",done,failed,total});progress(`本輪完成 ${done}/${total} 張。${errorLabel(e)}`);}
    finally{await finish(run);}
  }
  function paint(){
    const panel=$("iqcImageRc");if(!panel)return;
    text("iqcRcAnalyze",queuedStart?"已排定，保存後開始":operation?.kind==="local_ocr"?"辨識中…":operation?"保存／整理後開始辨識":"開始辨識未完成照片");
    ["iqcRcAnalyze","iqc31StartTop"].forEach(id=>{if($(id)){$(id).disabled=false;$(id).setAttribute("aria-busy",String(!!operation));if(id!=="iqcRcAnalyze")text(id,$("iqcRcAnalyze").textContent);}});
    ["iqcRcNewBatch","iqcRcCameraBtn","iqcRcGalleryBtn","iqcRcCameraInput","iqcRcGalleryInput","iqcHybridSyncBtn"].forEach(id=>{if($(id))$(id).disabled=!!operation;});
    panel.querySelectorAll("[data-photo-delete],[data-ocr31-photo],[data-review-photo]").forEach(e=>{if(operation)e.disabled=true;else if(!e.hasAttribute("data-review-photo"))e.disabled=false;});
    if($("iqc31Cancel"))$("iqc31Cancel").disabled=!operation||operation.kind==="cloud";
    updateLive();
    if($("iqcRcCommit"))$("iqcRcCommit").disabled=true;
    if($("iqcRcSyncPending"))$("iqcRcSyncPending").disabled=true;
    text("iqcRcOcrBadge",operation?({local_ocr:"本機辨識中",save_photos:"保存照片中",cloud:"補辨識中"}[operation.kind]||"處理中"):"RC31｜本機辨識");
  }
  function installUi(){
    const button=$("iqcRcAnalyze"),panel=$("iqcImageRc");if(!button||!panel)return;
    if(!$("iqc31StartTop")){
      const start=document.createElement('button');start.id='iqc31StartTop';start.type='button';start.className='iqc-rc-btn good';$("iqcRcGalleryBtn").parentElement.appendChild(start);
      const status=document.createElement('p');status.id='iqc31ActionStatus';status.className='iqc-rc-note';status.setAttribute('role','status');$("iqcRcGalleryBtn").parentElement.after(status);
    }
    if(!$("iqc31Tools")){
      const style=document.createElement("style");style.textContent="#iqcImageRc [data-ocr31-photo]{grid-column:2 / 4;justify-self:start}#iqc31LogText{background:#08112f;color:#dbe8ff}#iqc31Tools{font-size:13px}#iqcRcAnalyze,#iqc31StartTop,#iqcImageRc [data-ocr31-photo]{touch-action:manipulation;min-height:48px;min-width:150px}";document.head.appendChild(style);
      const tools=document.createElement("div");tools.id="iqc31Tools";tools.className="iqc-rc-note";
      tools.innerHTML='<strong>RC31.4 / OCR-S5-20260923</strong><p>可一次加入多張或分次補照片。辨識中請保持此頁開啟；切到背景會停止並保留照片。初次使用需下載辨識核心與英數字模型。</p><button id="iqc31Cancel" class="iqc-rc-btn" type="button">停止本輪辨識</button><details><summary>辨識紀錄</summary><p>紀錄不含帳密、照片或 CTN；保留最近 100 個處理事件。</p><button id="iqc31Copy" class="iqc-rc-btn" type="button">複製辨識紀錄</button><textarea id="iqc31LogText" readonly rows="7" style="width:100%;box-sizing:border-box;font-size:12px" aria-label="辨識紀錄"></textarea></details>';
      const review=document.createElement("p");review.textContent="請逐筆核對 CTN、RT 與數量；辨識結果仍可能有字元誤讀。";tools.appendChild(review);
      button.parentElement.insertAdjacentElement("afterend",tools);
      $("iqc31LogText").value=JSON.stringify(diagnosticSnapshot(),null,2);
    }
    if(!$("iqc31Live")){
      const top=panel.querySelector(".iqc-rc-top"),live=document.createElement("div");live.id="iqc31Live";
      live.innerHTML='<strong id="iqc31LiveCount" role="status"></strong><details id="iqc31LiveDetails"><summary>進度／操作</summary><div class="iqc31-live-menu"><div id="iqc31LivePhase" role="status"></div><div class="iqc-rc-row"><button id="iqc31Skip" type="button" class="iqc-rc-btn">略過此張，繼續下一張</button></div></div></details>';
      top.style.flexWrap="wrap";top.appendChild(live);live.querySelector(".iqc-rc-row").appendChild($("iqc31Cancel"));live.querySelector(".iqc-rc-row").appendChild($("iqc31Copy"));
      const style=document.createElement("style");style.textContent='#iqcImageRc .iqc-rc-top{gap:0 8px;padding:4px 0}#iqcImageRc .iqc-rc-top>div:first-child>small{display:none}#iqcImageRc .iqc-rc-top h2{font-size:16px}#iqc31Live{flex-basis:100%;display:flex;align-items:center;justify-content:space-between;gap:6px;min-width:0;font-size:12px;line-height:1.4}#iqc31LiveCount{min-width:0}#iqc31LiveDetails{flex:none}#iqc31LiveDetails summary{cursor:pointer;min-height:40px;display:flex;align-items:center;padding:0 5px;border-radius:8px;color:#c8dcf2}#iqc31LiveDetails summary::before{content:"▸";margin-right:4px}#iqc31LiveDetails[open] summary::before{content:"▾"}.iqc31-live-menu{position:absolute;left:0;right:0;top:100%;padding:10px;background:#101b42;border:1px solid #526394;border-radius:12px;box-shadow:0 8px 18px #02072288}#iqc31LivePhase{color:#c8dcf2;overflow-wrap:anywhere}#iqc31Live .iqc-rc-row{gap:5px;margin-top:8px}#iqc31Live button{min-height:42px;font-size:12px;padding:5px 8px}';document.head.appendChild(style);
      text("iqc31LivePhase",progressMessage);
    }
    const heading=panel.querySelector(".iqc-rc-top h2");if(heading&&heading.textContent!=="📷 Honeywell 影像 RC31.4")heading.textContent="📷 Honeywell 影像 RC31.4";
    const gallery=$("iqcRcGalleryInput");if(gallery)gallery.multiple=true;
    text("iqcHybridSyncBtn","補辨識缺漏（Cloud）");
    const hint=$("iqcHybridHint");if(hint&&!hint.dataset.rc31){hint.dataset.rc31="1";text("iqcHybridHint","RC31 先完成本機辨識；如有缺漏，再按「補辨識缺漏（Cloud）」。");}
    panel.querySelectorAll("[data-photo-delete]").forEach(del=>{
      const card=del.closest(".iqc-photo");if(card&&!card.querySelector("[data-ocr31-photo]")){
        const retry=document.createElement("button");retry.type="button";retry.className="iqc-rc-btn";retry.dataset.ocr31Photo=del.dataset.photoDelete;retry.textContent="重新辨識";card.appendChild(retry);
      }
    });
    paint();
  }
  window.__DS_IQC_RC31={build:BUILD,runBatch:requestStart,ingest,cancel,isBusy:()=>!!operation,
    async saveReview(photoId,change){const run=claim("review");if(!run)throw fail("OCR_BUSY");try{await exclusive(run,async()=>{
      const p=await getPhoto(photoId);if(!p||p.batchId!==run.batch)throw fail("PHOTO_MISSING");check(run);
      const review=change(p);await put({...p,rc31Review:review,updatedAt:now()});record({stage:"manual_review",outcome:"saved"});
    });}catch(e){run.failed=true;throw e;}finally{await finish(run);}},
    async mergeReviews(keys,meta){const run=claim("review");if(!run)throw fail("OCR_BUSY");try{await exclusive(run,async()=>{
      const list=await photos(run.batch);check(run);let legacy={};try{legacy=JSON.parse(localStorage.getItem('ds_iqc_v8_meta_override_'+run.batch)||'{}');}catch(_){}
      const model=window.IqcReviewModel31,updates=model.mergeReviews(list,keys,meta,model.legacyDecisions(list,legacy));
      // All affected reviews commit together. Full images are read one at a time by ID.
      await photoTransaction("readwrite",s=>{updates.forEach(u=>{const r=s.get(u.id);r.onsuccess=()=>{const p=r.result;
        if(!p||p.batchId!==run.batch||p.updatedAt!==u.updatedAt){s.transaction.abort();return;}
        s.put({...p,rc31Review:u.review,updatedAt:now()});
      };});});record({stage:"merge_review",outcome:"saved",photos:updates.length});
    });}catch(e){run.failed=true;throw e;}finally{await finish(run);}},
    readPhotos:(batch=activeBatch())=>photos(batch),readPhoto:getPhoto,
    claimCloud(manual){if(!manual||operation)return false;return !!claim("cloud");},
    releaseCloud(){const run=operation;if(run?.kind==="cloud")finish(run);},
    diagnostics:diagnosticSnapshot};
  // Main and per-photo actions share one completed-gesture path. A layout scroll
  // while a stationary finger is down must not discard the user's action.
  const startAction=el=>{const button=el?.closest?.('#iqcRcAnalyze,#iqc31StartTop,[data-ocr31-photo]');return button&&!button.disabled?{button,photoId:button.dataset.ocr31Photo||'',key:button.dataset.ocr31Photo||'all'}:null;};
  let finger=null,lastTap=null;
  document.addEventListener("pointerdown",e=>{
    const action=startAction(e.target);if(e.pointerType!=="touch"||!action)return;
    finger={...action,id:e.pointerId,x:e.clientX,y:e.clientY,at:Date.now()};
    record({stage:"start_touch",outcome:"down",action:action.photoId?'photo':'batch',busyKind:operation?.kind||""});
  },true);
  document.addEventListener("pointercancel",()=>{if(finger)record({stage:'start_touch',outcome:'cancelled'});finger=null;},true);
  document.addEventListener("pointerup",e=>{
    const f=finger;finger=null;if(!f||e.pointerId!==f.id)return;
    if(Math.hypot(e.clientX-f.x,e.clientY-f.y)>14||Date.now()-f.at>1000){record({stage:'start_touch',outcome:'gesture_ignored'});return;}
    e.preventDefault();e.stopImmediatePropagation();lastTap={key:f.key,at:Date.now()};requestStart(f.photoId);
  },true);
  document.addEventListener("change",e=>{
    if(!e.target.matches?.("#iqcRcCameraInput,#iqcRcGalleryInput"))return;
    e.preventDefault();e.stopImmediatePropagation();const files=Array.from(e.target.files||[]);e.target.value="";
    if(!operation&&files.length)ingest(files);
  },true);
  document.addEventListener("click",e=>{
    const target=e.target.closest?.("button");if(!target)return;
    if(target.matches('#iqcRcAnalyze,#iqc31StartTop,[data-ocr31-photo]')&&lastTap?.key===(target.dataset.ocr31Photo||"all")&&Date.now()-lastTap.at<700&&e.detail!==0){e.preventDefault();e.stopImmediatePropagation();return;}
    if(target.id==="iqc31Copy"){
      e.preventDefault();const box=$("iqc31LogText");box.value=JSON.stringify(diagnosticSnapshot(),null,2);
      if(navigator.clipboard)navigator.clipboard.writeText(box.value).then(()=>text("iqc31Copy","已複製辨識紀錄")).catch(()=>{box.focus();box.select();});else{box.focus();box.select();}return;
    }
    if(target.id==="iqcRcClose"||target.id==="logoutBtn"){cancel();engine.dispose("PANEL_CLOSED");return;}
    const handled=target.id==="iqcImageRcTool"||target.id==="iqcRcAnalyze"||target.id==="iqc31StartTop"||target.dataset.ocr31Photo||target.id==="iqc31Cancel"||target.id==="iqcRcCommit"||target.id==="iqcRcSyncPending"||target.id==="iqcRcNewBatch"||target.dataset.photoDelete;
    if(handled){e.preventDefault();e.stopImmediatePropagation();}
    if(target.id==="iqc31Skip"){e.preventDefault();e.stopImmediatePropagation();stopPhoto();return;}
    if(target.id==="iqc31Cancel"){cancel();return;}
    if(target.id==="iqcRcAnalyze"||target.id==="iqc31StartTop"||target.dataset.ocr31Photo){requestStart(target.dataset.ocr31Photo);return;}
    if(operation){if(target.closest("#iqcImageRc")&&!target.closest("#iqc31Tools")){e.preventDefault();e.stopImmediatePropagation();}return;}
    if(target.id==="iqcImageRcTool"){
      const run=claim("open_panel");window.__DS_IQC_IMAGE_RC.open().then(()=>{run.batch=activeBatch();}).catch(()=>progress("本機批次讀取失敗，請稍後再開啟。")).finally(()=>finish(run));return;
    }
    if(target.id==="iqcRcNewBatch"||target.dataset.photoDelete){
      const run=claim("edit_batch");exclusive(run,async()=>{if(target.dataset.photoDelete)await api().deletePhoto(target.dataset.photoDelete);else await api().newBatch();}).catch(()=>progress("批次更新失敗，請稍後重試。")).finally(()=>finish(run));
    }
  },true);
  document.addEventListener("visibilitychange",()=>{if(document.hidden){cancel();engine.dispose("BACKGROUND");}});
  addEventListener("pagehide",()=>{cancel();engine.dispose("PAGEHIDE");});
  setInterval(()=>{if(operation?.task)updateLive();},1000);
  document.addEventListener("DOMContentLoaded",()=>{
    installUi();const panel=$("iqcImageRc");if(!panel)return;
    const observer=new MutationObserver(()=>{if(!uiTimer)uiTimer=setTimeout(()=>{uiTimer=null;installUi();},100);});
    observer.observe(panel,{childList:true,subtree:true});
  },{once:true});
})();

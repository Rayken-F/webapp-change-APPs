const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),artifacts=fs.mkdtempSync(path.join(require('os').tmpdir(),'iqc-rc31-'));console.log('ARTIFACTS '+artifacts);let checks=0;
const ok=(label,value)=>{assert.ok(value,label);checks++;console.log('PASS '+label)};
const dbPhotos=page=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('ds_iqc_image_rc_v1',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('photos'),q=tx.objectStore('photos').index('batchId').getAll(localStorage.getItem('ds_iqc_image_rc_active_batch'));q.onsuccess=()=>resolve(q.result.sort((a,b)=>a.seq-b.seq).map(({blob,...p})=>p));tx.oncomplete=()=>db.close();};}));
(async()=>{
 const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://local').pathname),file=path.resolve(root,'.'+name);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=process.env.DS_WEBKIT==='1'?await webkit.launch({headless:true}):await chromium.launch({headless:true,executablePath:process.env.EDGE_EXECUTABLE||undefined});
 try{
 const context=await browser.newContext({viewport:{width:402,height:874},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 let business=0,cloudPhotos=0,workerRequests=0,blockWorker=false,blockLibrary=false;const errors=[],network=[];
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.origin===origin){if(u.pathname.endsWith('iqc-ocr-worker-rc31.js')){workerRequests++;if(blockWorker)return route.abort();}return route.continue();}
  if(u.hostname==='cdn.jsdelivr.net'||u.hostname==='tessdata.projectnaptha.com'){
   network.push(u.pathname);if(blockLibrary&&u.pathname.includes('/tesseract.min.js'))return route.abort();return route.continue();
  }
  if(u.hostname==='script.google.com'){
   if(route.request().resourceType()==='document')return route.fulfill({contentType:'text/html',body:'Fixture: Google iframe transport unavailable, use fetch.'});
   const p=route.request().method()==='POST'?JSON.parse(route.request().postData()):Object.fromEntries(u.searchParams);
   let out={ok:true,items:[],regions:[],priorities:[]};
   if(p.api==='workstation_login'||p.api==='workstation_bootstrap')out={ok:true,sessionToken:'SYNTHETIC_ONLY',user:{account:'TEST',displayName:'測試',role:'ADMIN'},permissions:{home_enabled:true,daily_report_enabled:true,grinding_enabled:true,iqc_correction_enabled:true}};
   else if(p.api==='portal_iqc_cloud_ocr_status_rc')out={ok:true,ready:true,enabled:true,configured:true};
   else if(p.api==='portal_iqc_cloud_ocr_rc'){cloudPhotos++;out={ok:true,status:'DONE',text:'113374 CYLINDER OCYL 7209 TOTAL 2\nAB12CDE\nFG34HIJ'};}
   else if(p.api==='portal_rt_master')out={ok:true,items:[{rtNo:'113374',description:'X40S',unit:'支',rtType:'loose'}]};
   else if(!['workstation_home_data','iqc_regions','health'].includes(p.api))business++;
   return route.fulfill({contentType:'application/json',body:JSON.stringify(out)});
  }
  return route.abort();
 });
 const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR '+e.message)});page.on('requestfailed',r=>console.log('NETFAIL '+r.url().split('?')[0]+' '+r.failure()?.errorText));
 page.on('console',m=>{if(m.type()==='warning'||m.type()==='error')console.log('CONSOLE '+m.text())});
 await page.goto(origin+'/ds-app-grinding-recovery-rc/v31.html');
 if(process.env.DS_WEBKIT){console.log('BLOB_PROBE '+JSON.stringify(await page.evaluate(()=>new Promise(resolve=>{
  const r=indexedDB.open('isolated-blob-probe',1);r.onupgradeneeded=()=>r.result.createObjectStore('s');r.onsuccess=()=>{
   const db=r.result,tx=db.transaction('s','readwrite'),q=tx.objectStore('s').put(new Blob(['abc'],{type:'text/plain'}),'test');
   q.onerror=()=>resolve({name:q.error.name,message:q.error.message});tx.oncomplete=()=>{db.close();resolve({ok:true})};tx.onabort=()=>db.close();
  };
 }))));}
 await page.locator('#loginAccount').fill('TEST');await page.locator('#loginPassword').fill('SYNTHETIC_ONLY');await page.locator('#loginBtn').click();
 await page.locator('#appShell').waitFor({state:'visible'});await page.locator('#navMore').click();await page.locator('#iqcImageRcTool').click();await page.locator('#iqc31Tools').waitFor();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());
 ok('RC31 works with current shared DS login DOM and transport',await page.locator('#iqcImageRc').isVisible());
 ok('old initialization did not run before photos',workerRequests===0);
 const idleMutations=await page.evaluate(()=>new Promise(resolve=>{let n=0;const o=new MutationObserver(()=>n++);o.observe(document.getElementById('iqcRcCommit'),{childList:true});setTimeout(()=>{o.disconnect();resolve(n);},1100);}));
 ok('read-only label does not recursively mutate and starve control updates',idleMutations===0);
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1500;c.height=600;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,1500,600);g.fillStyle='black';g.font='32px Arial';g.fillText('113374 CYLINDER OCYL 7209 TOTAL 2',70,110);g.font='50px Arial';g.fillText('AB12CDE',80,240);g.fillText('FG34HIJ',80,340);return c.toDataURL('image/png').split(',')[1];});
 const image={name:'synthetic-honeywell.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')};fs.writeFileSync(path.join(artifacts,'synthetic-honeywell.png'),image.buffer);
 await page.evaluate(()=>{const original=HTMLCanvasElement.prototype.toBlob;let first=true;HTMLCanvasElement.prototype.toBlob=function(callback,...args){const delay=first?1800:0;first=false;return original.call(this,b=>setTimeout(()=>callback(b),delay),...args);};});
 const start=Date.now();await page.locator('#iqcRcGalleryInput').setInputFiles([image,image,image]);
 await page.locator('#iqcRcAnalyze').tap();await page.locator('#iqcRcAnalyze').tap();
 await page.waitForFunction(()=>window.__DS_IQC_RC31.diagnostics().events.some(e=>e.stage==='local_ocr'&&e.outcome==='finished')&&!window.__DS_IQC_RC31.isBusy(),{},{timeout:150000});
 ok('touch start during photo saving queues one OCR run without repeated clicking',await page.evaluate(()=>window.__DS_IQC_RC31.diagnostics().events.filter(e=>e.stage==='local_ocr'&&e.outcome==='started').length===1));
 if((await dbPhotos(page)).length!==3)console.log('INGESTFAIL '+JSON.stringify({photos:await dbPhotos(page),diagnostics:await page.evaluate(()=>window.__DS_IQC_RC31.diagnostics()),text:await page.locator('#iqcRcProgressText').textContent()}));
 ok('batch of three photos saved with unique sequence',(await dbPhotos(page)).map(p=>p.seq).join(',')==='1,2,3');
 let photos=await dbPhotos(page);console.log('OCRRESULT '+JSON.stringify(photos.map(p=>({seq:p.seq,status:p.status,failure:p.localFailure,text:p.ocrText}))));
 fs.writeFileSync(path.join(artifacts,'browser-'+(process.env.DS_WEBKIT?'webkit':'edge')+'-initial.json'),JSON.stringify({elapsedMs:Date.now()-start,photos,diagnostics:await page.evaluate(()=>window.__DS_IQC_RC31.diagnostics()),errors,network},null,2));
 ok('real Tesseract recognizes the first, second and third synthetic photos',photos.every(p=>p.status==='RECOGNIZED'&&p.ocrText.includes('AB12CDE')&&p.ocrText.includes('FG34HIJ')));
 const initialWorkers=workerRequests;
 ok('three actual photos share one successfully initialized worker',initialWorkers<=2&&await page.evaluate(()=>window.__DS_IQC_RC31.diagnostics().events.filter(e=>e.stage==='initialize'&&e.outcome==='ok').length===1));ok('raw OCR passes remain available locally',photos.every(p=>p.rc31RawPasses?.length));
 ok('Cloud never automatically received a photo',cloudPhotos===0);
 await page.locator('#iqcRcAnalyze').click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());ok('repeat start preserves already completed results',workerRequests===initialWorkers&&(await dbPhotos(page)).every((p,i)=>p.updatedAt===photos[i].updatedAt));
 await page.locator('#iqcRcGalleryInput').setInputFiles(image);await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());await page.locator('#iqcRcAnalyze').click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy(),{},{timeout:90000});
 photos=await dbPhotos(page);ok('later fourth photo completes with same engine',photos.length===4&&photos.every(p=>p.status==='RECOGNIZED')&&workerRequests===initialWorkers);
 const keep=photos[0].ocrText;
 await page.evaluate(()=>{window.originalWorkerPost=Worker.prototype.postMessage;Worker.prototype.postMessage=function(message,...args){if(message?.action==='recognize')return;return window.originalWorkerPost.call(this,message,...args);};});
 await page.locator('[data-ocr31-photo]').first().click();await page.locator('#iqc31Cancel').click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());photos=await dbPhotos(page);
 await page.evaluate(()=>{Worker.prototype.postMessage=window.originalWorkerPost;});
 ok('cancel of a retry retains previously recognized text',photos[0].ocrText===keep&&photos[0].status==='RECOGNIZED');
 await page.locator('[data-ocr31-photo]').first().click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy(),{},{timeout:90000});ok('retry after cancel starts a fresh engine',(await dbPhotos(page))[0].status==='RECOGNIZED'&&workerRequests===initialWorkers+1);
 await page.locator('#iqcRcClose').click();await page.reload();await page.locator('#appShell').waitFor({state:'visible'});await page.locator('#navMore').click();await page.locator('#iqcImageRcTool').click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());
 ok('reload retains all four photos and OCR results',(await dbPhotos(page)).length===4&&(await dbPhotos(page)).every(p=>p.status==='RECOGNIZED'));
 ok('read-only RC has no business submissions',business===0);
 await page.locator('#iqc31Tools').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifacts,'rc31-'+(process.env.DS_WEBKIT?'webkit':'edge')+'.png')});
 blockWorker=true;await page.locator('[data-ocr31-photo]').first().click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy(),{},{timeout:90000});
 ok('startup download failure is reported and preserves existing photo result',(await dbPhotos(page))[0].ocrText===keep&&/中斷|失敗|未完成/.test(await page.locator('#iqcRcProgressText').textContent()));
 blockWorker=false;await page.locator('[data-ocr31-photo]').first().click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy(),{},{timeout:90000});ok('first photo retry recovers after failed startup',(await dbPhotos(page))[0].localFailure==='');
 await page.locator('#iqcRcNewBatch').click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());ok('new batch can be created without deleting earlier photos',(await dbPhotos(page)).length===0);
 const blank=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=300;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,400,300);return c.toDataURL('image/png').split(',')[1];});
 await page.locator('#iqcRcGalleryInput').setInputFiles({name:'blank.png',mimeType:'image/png',buffer:Buffer.from(blank,'base64')});await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());await page.locator('#iqcRcAnalyze').click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy(),{},{timeout:90000});
 ok('unreadable image is distinct from startup failure',(await dbPhotos(page))[0].localFailure==='NO_TEXT');
 ok('failed local result still does not trigger automatic Cloud upload',cloudPhotos===0);
 await page.locator('#iqcHybridSyncBtn').click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy(),{},{timeout:20000});
 ok('manual selective Cloud request updates exactly one photo',cloudPhotos===1&&(await dbPhotos(page))[0].aiStatus==='AI_VERIFIED');
 await page.locator('[data-ocr31-photo]').first().click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());ok('manual retry preserves Cloud-verified result',(await dbPhotos(page))[0].aiStatus==='AI_VERIFIED'&&(await dbPhotos(page))[0].ocrText.includes('AB12CDE'));
 await page.reload();await page.locator('#appShell').waitFor({state:'visible'});await page.locator('#navMore').click();await page.locator('#iqcImageRcTool').click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());
 blockLibrary=true;await page.locator('#iqcRcGalleryInput').setInputFiles(image);await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());await page.locator('#iqcRcAnalyze').click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy(),{},{timeout:15000});
 ok('main library download failure releases busy state',(await dbPhotos(page))[1].localFailure==='LIB_LOAD');
 blockLibrary=false;await page.locator('#iqcRcAnalyze').click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy(),{},{timeout:90000});ok('main library download retry succeeds on the same photo',(await dbPhotos(page))[1].status==='RECOGNIZED');
 // A queued submission from an earlier RC must remain untouched by the read-only trial.
 await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('ds_iqc_image_rc_v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('submissions','readwrite');tx.objectStore('submissions').put({submissionId:'TEST_KEEP_PENDING',status:'PENDING',payload:{test:true}});tx.oncomplete=()=>{db.close();resolve();};};}));
 await page.evaluate(async()=>{await window.__DS_IQC_IMAGE_RC.sync(true);window.dispatchEvent(new Event('online'));});
 ok('legacy pending submissions cannot be sent by RC31',business===0);
 await page.locator('#iqcRcNewBatch').click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());
 const series=await page.evaluate(()=>['113374 CYLINDER OCYL 7209 TOTAL 6\nAB12CDE\nFG34HIJ','KL56MNO\nPQ78RST','UV90WXY\nZA12BCD'].map(text=>{const c=document.createElement('canvas');c.width=1500;c.height=600;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,1500,600);g.fillStyle='black';g.font='32px Arial';text.split('\n').forEach((s,i)=>g.fillText(s,70,110+i*110));return c.toDataURL('image/png').split(',')[1];}));
 await page.locator('#iqcRcGalleryInput').setInputFiles(series.map((s,i)=>({name:`continuation-${i}.png`,mimeType:'image/png',buffer:Buffer.from(s,'base64')})));await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());
 await page.locator('#iqcRcAnalyze').click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy(),{},{timeout:90000});
 console.log('CONTINUATION '+JSON.stringify((await dbPhotos(page)).map(p=>({seq:p.seq,status:p.status,text:p.ocrText}))));
 await page.waitForFunction(()=>window.__DS_IQC_META_GROUPING_V8.getModel().reduce((n,g)=>n+g.ctns.length,0)===6,{},{timeout:5000});
 ok('all continuation candidates remain visible; absent RT awaits operator classification',await page.evaluate(()=>{const m=window.__DS_IQC_META_GROUPING_V8.getModel();return m.length===3&&m.filter(g=>!g.rt).length===2&&m.reduce((n,g)=>n+g.ctns.length,0)===6;}));
 const continuationPhotos=await dbPhotos(page);
 for(const p of continuationPhotos.slice(1)){
   await page.locator('[data-review-photo="'+p.id+'"]').first().click();
   if(p.seq===2){await page.locator('#iqc31Review_rt').fill('113');await page.waitForTimeout(1250);ok('periodic status refresh does not replace manual input or lose focus',await page.locator('#iqc31Review_rt').inputValue()==='113'&&await page.locator('#iqc31Review_rt').evaluate(el=>document.activeElement===el));}
   if(p.seq===2)await page.locator('#iqc31Review_rt').fill('113374');
   else await page.locator('#iqc31TargetGroup').selectOption({label:'RT 113374｜OCYL｜7209'});
   await page.locator('[data-review-save]').click();await page.waitForFunction(()=>document.getElementById('iqc31ReviewMessage').textContent.includes('已保存'));
   await page.locator('[data-review-close]').click();
 }
 ok('manual whole-photo classification joins all six CTNs and keeps source photos',await page.evaluate(()=>{const m=window.__DS_IQC_META_GROUPING_V8.getModel();return m.length===1&&m[0].ctns.length===6&&m[0].photoIds.length===3&&m[0].ready;}));
 await page.locator('[data-review-photo="'+continuationPhotos[1].id+'"]').first().click();
 await page.locator('[data-review-all="0"]').click();await page.locator('[data-review-key]').first().check();await page.locator('#iqc31Review_rt').fill('113407');await page.locator('#iqc31Review_expected').fill('1');
 await page.locator('[data-review-save]').click();await page.waitForFunction(()=>document.getElementById('iqc31ReviewMessage').textContent.includes('已保存'));await page.locator('[data-review-close]').click();
 ok('selected CTN can move to a different RT while the other CTNs remain',await page.evaluate(()=>{const m=window.__DS_IQC_META_GROUPING_V8.getModel();return m.some(g=>g.rt==='113407'&&g.ctns.length===1)&&m.some(g=>g.rt==='113374'&&g.ctns.length===5);}));
 await page.reload();await page.locator('#appShell').waitFor({state:'visible'});await page.locator('#navMore').click();await page.locator('#iqcImageRcTool').click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());
 await page.waitForFunction(()=>window.__DS_IQC_META_GROUPING_V8.getModel().some(g=>g.rt==='113407'));
 ok('manual decisions and originals survive reload',(await dbPhotos(page)).every((p,i)=>p.ocrText===continuationPhotos[i].ocrText)&&(await dbPhotos(page))[1].rc31Review.history.length===2);
 await page.locator('[data-review-photo="'+continuationPhotos[1].id+'"]').first().click();await page.locator('#iqc31TargetGroup').selectOption({label:'RT 113374｜OCYL｜7209'});await page.locator('[data-review-save]').click();await page.waitForFunction(()=>document.getElementById('iqc31ReviewMessage').textContent.includes('已保存'));await page.locator('[data-review-close]').click();
 await page.locator('#iqcHybridSyncBtn').click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());ok('complete local batch does not incur a Cloud request',cloudPhotos===1);
 await page.locator('#iqc31Tools').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifacts,'rc31-final-edge.png')});
 await page.locator('[data-review-photo]').first().click();await page.screenshot({path:path.join(artifacts,'rc31-manual-review.png')});await page.locator('[data-review-close]').click();
 await page.locator('#iqcRcNewBatch').click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());
 await page.locator('#iqcRcGalleryInput').setInputFiles([{name:'blank-first.png',mimeType:'image/png',buffer:Buffer.from(blank,'base64')},image,image]);await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());
 await page.locator('#iqcRcAnalyze').tap();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy(),{},{timeout:90000});
 const mixed=await dbPhotos(page);ok('one unreadable photo does not skip the other two, and failure stays explicit',mixed[0].localFailure==='NO_TEXT'&&mixed[0].status==='LOCAL_FAILED'&&mixed.slice(1).every(p=>p.status==='RECOGNIZED'));

 // Zero-candidate legacy "recognized" photos must be eligible on the next Start.
 await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('ds_iqc_image_rc_v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('photos','readwrite'),store=tx.objectStore('photos'),q=store.index('batchId').getAll(localStorage.getItem('ds_iqc_image_rc_active_batch'));q.onsuccess=()=>{const p=q.result.find(p=>p.seq===1);p.status='RECOGNIZED';p.ocrText='NEXT PAGE';p.updatedAt=new Date().toISOString();store.put(p);};tx.oncomplete=()=>{db.close();resolve();};};}));
 await page.locator('#iqc31StartTop').tap();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy(),{},{timeout:90000});
 ok('Start retries old nonempty OCR with zero CTNs rather than silently skipping it',(await dbPhotos(page))[0].localFailure==='NO_TEXT');
 const zero=(await dbPhotos(page))[0];await page.locator('[data-review-photo="'+zero.id+'"]').first().tap();
 await page.locator('#iqc31Review_rt').fill('113374');await page.locator('#iqc31Review_status').fill('OCYL');await page.locator('#iqc31Review_plant').fill('7209');await page.locator('#iqc31Review_expected').fill('3');await page.locator('#iqc31ManualCtns').fill('KL56MNP');
 await page.locator('[data-review-save]').click();await page.waitForFunction(()=>document.getElementById('iqc31ReviewMessage').textContent.includes('已保存'));await page.locator('[data-review-close]').click();
 ok('zero-candidate photo supports manual entry without discarding original',!!(await dbPhotos(page))[0].rc31Review.ctns.KL56MNP.added);
 // Pointerdown / pointerup remain one action if the layout scrolls slightly while stationary.
 await page.evaluate(()=>{window.__beforeGesture=new Set(window.__DS_IQC_RC31.diagnostics().events.filter(e=>e.stage==='start_request').map(e=>JSON.stringify(e)));const button=document.querySelectorAll('[data-ocr31-photo]')[1],rect=button.getBoundingClientRect(),x=rect.x+5,y=rect.y+5;button.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',pointerId:41,clientX:x,clientY:y,isPrimary:true}));document.getElementById('iqcImageRc').scrollTop+=5;button.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch',pointerId:41,clientX:x,clientY:y,isPrimary:true}));button.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));});
 await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy(),{},{timeout:90000});
 ok('per-photo touch accepts one action across layout scroll and suppresses duplicate click',await page.evaluate(()=>window.__DS_IQC_RC31.diagnostics().events.filter(e=>e.stage==='start_request'&&!window.__beforeGesture.has(JSON.stringify(e))).length===1));
 const beforeCancelled=await page.evaluate(()=>window.__DS_IQC_RC31.diagnostics().events.filter(e=>e.stage==='start_request').length);
 await page.evaluate(()=>{const b=document.getElementById('iqc31StartTop');b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',pointerId:42,clientX:10,clientY:10}));b.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:42}));b.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch',pointerId:42,clientX:10,clientY:10}));});
 ok('cancelled scroll gesture never starts recognition',beforeCancelled===await page.evaluate(()=>window.__DS_IQC_RC31.diagnostics().events.filter(e=>e.stage==='start_request').length));
 ok('thumbnail Blob remains usable for mobile preview',await page.locator('#iqcRcPhotoList img').last().evaluate(async img=>(await fetch(img.src)).ok));
 // Keep successful first photo, append two, then a single top-button touch starts both.
 await page.locator('#iqcRcGalleryInput').setInputFiles([image,image]);await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());await page.locator('#iqc31StartTop').tap();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy(),{},{timeout:90000});
 ok('two appended photos start from one top-button tap',(await dbPhotos(page)).slice(-2).every(p=>p.status==='RECOGNIZED'));
 // One user start must process a larger saved queue, with each result persisted.
 await page.locator('#iqcRcNewBatch').click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());
 const bulk=await page.evaluate(()=>Array.from({length:30},(_,i)=>{const c=document.createElement('canvas');c.width=1100;c.height=360;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,1100,360);g.fillStyle='black';g.font='32px Arial';g.fillText('113374 CYLINDER OCYL 7209 TOTAL 30',30,75);g.font='50px Arial';g.fillText('AB'+String(i+10)+'CDE',70,190);return c.toDataURL('image/png').split(',')[1];}));
 const bulkStarted=Date.now(),bulkWorkers=workerRequests;
 await page.locator('#iqcRcGalleryInput').setInputFiles(bulk.map((s,i)=>({name:`bulk-${i+1}.png`,mimeType:'image/png',buffer:Buffer.from(s,'base64')})));
 await page.locator('#iqc31StartTop').tap();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy(),{},{timeout:240000});
 const bulkPhotos=await dbPhotos(page);
 ok('one touch processes and saves all 30 synthetic photos',bulkPhotos.length===30&&bulkPhotos.every(p=>p.status==='RECOGNIZED'&&p.rc31RawPasses?.length));
 ok('30-photo queue uses the same warm worker',workerRequests===bulkWorkers);
 fs.writeFileSync(path.join(artifacts,'bulk-30.json'),JSON.stringify({elapsedMs:Date.now()-bulkStarted,photos:bulkPhotos.map(p=>({seq:p.seq,status:p.status,text:p.ocrText})),diagnostics:await page.evaluate(()=>window.__DS_IQC_RC31.diagnostics())},null,2));
 await page.reload();await page.locator('#appShell').waitFor({state:'visible'});await page.locator('#navMore').click();await page.locator('#iqcImageRcTool').click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());
 ok('all 30 saved results survive reload',(await dbPhotos(page)).length===30&&(await dbPhotos(page)).every(p=>p.status==='RECOGNIZED'));
 // Exercise actual text-region fallback after three deliberately empty segmentation outputs.
 await page.locator('#iqcRcNewBatch').click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());
 const device=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1800;c.height=1500;const g=c.getContext('2d');g.fillStyle='#141414';g.fillRect(0,0,1800,1500);g.fillStyle='#f0f0f0';g.fillRect(420,80,960,540);g.fillStyle='#151515';g.font='50px Arial';['AB12CDE','FG34HIJ','KL56MNP'].forEach((t,i)=>g.fillText(t,670,190+i*120));g.fillStyle='#04a9df';g.fillRect(460,520,860,65);g.fillStyle='#bbbbbb';g.font='55px Arial';g.fillText('NEXT',650,800);return c.toDataURL('image/png').split(',')[1];});
 await page.evaluate(()=>{const old=IqcOcrEngine31.Engine.prototype.recognize;let n=0;IqcOcrEngine31.Engine.prototype.recognize=async function(...args){if(n++<3)return {data:{text:'NEXT',confidence:0}};return old.apply(this,args);};});
 await page.locator('#iqcRcGalleryInput').setInputFiles({name:'synthetic-headerless-device.png',mimeType:'image/png',buffer:Buffer.from(device,'base64')});await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());await page.locator('#iqc31StartTop').tap();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy(),{},{timeout:90000});
 const fallback=(await dbPhotos(page))[0];ok('actual text-region fallback reads CTNs without RT or status',fallback.ocrText.includes('AB12CDE')&&fallback.ocrText.includes('FG34HIJ')&&fallback.ocrText.includes('KL56MNP')&&fallback.rc31RawPasses.length>=4);
 ok('headerless photo still requires explicit RT grouping',await page.evaluate(()=>window.__DS_IQC_REVIEW31.getModel().every(g=>!g.rt)));
 await page.locator('[data-review-photo]').first().click();await page.screenshot({path:path.join(artifacts,'rc312-review.png')});await page.locator('[data-review-close]').click();
 await page.locator('#iqc31StartTop').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifacts,'rc312-start.png')});
 // Abort generates a browser worker error; it must not become an uncaught page error.
 ok('no uncaught frontend errors',errors.length===0);
 console.log('TOTAL '+checks);fs.writeFileSync(path.join(artifacts,'browser-'+(process.env.DS_WEBKIT?'webkit':'edge')+'-summary.json'),JSON.stringify({checks,workerRequests,business,cloudPhotos,errors,diagnostics:await page.evaluate(()=>window.__DS_IQC_RC31.diagnostics())},null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});

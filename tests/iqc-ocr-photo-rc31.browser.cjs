const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),artifacts=fs.mkdtempSync(path.join(require('os').tmpdir(),'iqc-rc319-storage-'));console.log('ARTIFACTS '+artifacts);let checks=0;
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
 let business=0,cloudPhotos=0,workerRequests=0,blockWorker=false,blockLibrary=false,bootstrapRejectOnce=false;const errors=[],network=[];
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.origin===origin){if(u.pathname.endsWith('iqc-ocr-worker-rc31.js')){workerRequests++;if(blockWorker)return route.abort();if(bootstrapRejectOnce){bootstrapRejectOnce=false;return route.fulfill({contentType:'text/javascript',body:`self.addEventListener('message',e=>{if(e.data?.action==='load'){e.stopImmediatePropagation();Promise.reject(new Error('WebAssembly bootstrap failure SECRET_TEST'));}});\n`+fs.readFileSync(path.join(root,u.pathname),'utf8')});}}return route.continue();}
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
   else if(p.api==='iqc_regions')out={ok:true,regions:[{code:'TEST_REGION',name:'測試區域'}]};
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
 ok('fixed header is compact before recognition',(await page.locator('.iqc-rc-top').boundingBox()).height<=100&&await page.locator('#iqc31LiveDetails').getAttribute('open')===null);
 ok('old initialization did not run before photos',workerRequests===0);
 ok('batch card only asks for region, without date/operator/batch-status inputs',await page.locator('#iqcRcDate,#iqcRcOperator,#iqcRcStatus').count()===0&&await page.locator('#iqcRcRegion').count()===1);
 await page.waitForFunction(()=>document.querySelector('#iqcRcRegion option[value="TEST_REGION"]'));
 await page.locator('#iqcRcRegion').selectOption('TEST_REGION');
 const batchMeta=()=>page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('ds_iqc_image_rc_v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('batches'),q=tx.objectStore('batches').get(localStorage.getItem('ds_iqc_image_rc_active_batch'));q.onsuccess=()=>resolve(q.result);tx.oncomplete=()=>db.close();};}));
 await page.waitForTimeout(100);const initialMeta=await batchMeta();
 ok('batch records current date and verified DS identity automatically',initialMeta.operatorAccount==='TEST'&&initialMeta.operatorName==='測試'&&initialMeta.regionCode==='TEST_REGION'&&initialMeta.reportDate===await page.evaluate(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}));
 await page.evaluate(async()=>{const D=Date;try{window.Date=class extends D{constructor(...args){super(...(args.length?args:[2030,0,2,12]));}};await window.__DS_IQC_IMAGE_RC.rc31.prepareMetadata();}finally{window.Date=D;}});
 const nextDay=await batchMeta();ok('resumed draft uses current operation date while preserving original creation and region',nextDay.reportDate==='2030-01-02'&&nextDay.createdAt===initialMeta.createdAt&&nextDay.regionCode==='TEST_REGION');
 const idleMutations=await page.evaluate(()=>new Promise(resolve=>{let n=0;const o=new MutationObserver(()=>n++);o.observe(document.getElementById('iqcRcCommit'),{childList:true});setTimeout(()=>{o.disconnect();resolve(n);},1100);}));
 ok('read-only label does not recursively mutate and starve control updates',idleMutations===0);

 // Exercise real IndexedDB and image decoding. OCR results here are synthetic;
 // the existing full browser suite separately exercises real Tesseract.
 await page.evaluate(()=>{IqcOcrEngine31.Engine.prototype.ensure=async()=>{};IqcOcrEngine31.Engine.prototype.recognize=async()=>({data:{text:'113374 CYLINDER OCYL 7209 TOTAL 2\nAB12CDE\nFG34HIJ',confidence:98}});});
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=500;c.getContext('2d').fillRect(0,0,400,500);return c.toDataURL('image/png').split(',')[1];});
 const image={name:'storage-fixture.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')};
 const idle=()=>page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());
 const ingest=async(n=3)=>{await page.locator('#iqcRcGalleryInput').setInputFiles(Array(n).fill(image));await idle();};
 const start=async()=>{await page.locator('#iqc31StartTop').tap();await idle();};
 const raw=()=>page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('ds_iqc_image_rc_v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('photos'),q=tx.objectStore('photos').index('batchId').getAll(localStorage.getItem('ds_iqc_image_rc_active_batch'));q.onsuccess=()=>resolve(q.result.sort((a,b)=>a.seq-b.seq).map(p=>({seq:p.seq,status:p.status,hasBlob:p.blob instanceof Blob,hasThumbnail:p.thumbnail instanceof Blob,bytes:p.rc31Image?.bytes?.byteLength,review:p.rc31Review})));tx.oncomplete=()=>db.close();};}));
 await ingest();ok('new photos store byte arrays without IDB Blob handles',(await raw()).length===3&&(await raw()).every(p=>p.bytes>0&&!p.hasBlob&&!p.hasThumbnail));
 await start();ok('one tap processes all three byte-backed photos',(await dbPhotos(page)).every(p=>p.status==='RECOGNIZED'));
 const first=(await dbPhotos(page))[0];await page.evaluate(id=>window.__DS_IQC_RC31.saveReview(id,()=>({version:1,history:['preserved']})),first.id);
 ok('manual review saves without introducing persistent Blob handles',(await raw())[0].review.history[0]==='preserved'&&(await raw()).every(p=>!p.hasBlob));
 await page.locator('[data-preview-photo]').first().tap();await page.locator('#iqc31PhotoPreview img').evaluate(img=>img.decode());ok('byte-backed preview decodes and keeps its bottom close button',await page.locator('[data-preview-close]').isVisible());await page.locator('[data-preview-close]').tap();
 // Fail any attempt to persist a native Blob: byte-backed OCR must still succeed.
 await page.evaluate(()=>{window.__savedPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(v,...args){if(this.name==='photos'&&(v.blob instanceof Blob||v.thumbnail instanceof Blob))throw new DOMException('Error preparing Blob/File data','UnknownError');return window.__savedPut.call(this,v,...args);};});
 await ingest(2);await start();ok('additional photos and status writes work when Blob persistence is unavailable',(await dbPhotos(page)).length===5&&(await dbPhotos(page)).every(p=>p.status==='RECOGNIZED'));
 // Broken legacy read, decode failure, then healthy next photo; no worker retry.
 await page.locator('#iqcRcNewBatch').click();await idle();await ingest();
 await page.evaluate(()=>{window.__originalEncode=IqcOcrPhoto31.encode;window.__originalPreprocess=IqcOcrRules31.preprocessForOcr;
   IqcOcrPhoto31.encode=async p=>{if(p.seq===1)throw Object.assign(new Error('IMAGE_READ_ERROR'),{code:'IMAGE_READ_ERROR'});return window.__originalEncode(p);};
   IqcOcrRules31.preprocessForOcr=async b=>{if(window.__DS_IQC_RC31.diagnostics().queue.photo===2)throw new Event('error');return window.__originalPreprocess(b);};});
 await start();const failed=await page.evaluate(()=>window.__DS_IQC_RC31.readPhotos());const diag=await page.evaluate(()=>window.__DS_IQC_RC31.diagnostics());
 ok('unreadable image and raw decode event both advance to the next photo',failed[0].localFailure==='IMAGE_READ_ERROR'&&failed[1].localFailure==='IMAGE_PREPROCESS_ERROR'&&failed[2].status==='RECOGNIZED');
 ok('image failure is not falsely reported as WORKER_ERROR',!diag.events.some(e=>e.run===diag.events.filter(e=>e.stage==='local_ocr'&&e.outcome==='started').at(-1).run&&e.code==='WORKER_ERROR'));
 ok('unreadable original remains stored unchanged',(await raw())[0].status==='LOCAL'&&(await raw())[0].bytes>0);
 ok('photo card explains unreadable content and continuation',/內容無法讀取/.test(await page.locator('.rc31-photo-result').first().textContent()));
 await page.evaluate(()=>{IqcOcrPhoto31.encode=window.__originalEncode;IqcOcrRules31.preprocessForOcr=window.__originalPreprocess;});await start();ok('retry recovers only failed photos and retains the completed successor',(await dbPhotos(page)).every(p=>p.status==='RECOGNIZED')&&(await dbPhotos(page))[2].updatedAt===failed[2].updatedAt);

 // Real invalid image bytes must fail before OCR, not be labelled as a worker fault.
 await page.locator('#iqcRcNewBatch').click();await idle();await ingest(2);
 await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('ds_iqc_image_rc_v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('photos','readwrite'),s=tx.objectStore('photos'),q=s.index('batchId').getAll(localStorage.getItem('ds_iqc_image_rc_active_batch'));q.onsuccess=()=>{const p=q.result.sort((a,b)=>a.seq-b.seq)[0];p.rc31Image.bytes=new TextEncoder().encode('not a jpeg').buffer;s.put(p);};tx.oncomplete=()=>{db.close();resolve();};};}));
 await start();ok('native image decode failure is explicit and the next photo succeeds',(await dbPhotos(page))[0].localFailure==='DECODE_ERROR'&&(await dbPhotos(page))[1].status==='RECOGNIZED');
 // If persisting an error state also fails, both errors remain in diagnostics.
 await page.evaluate(()=>{IqcOcrRules31.preprocessForOcr=async()=>{throw new Event('error');};IDBObjectStore.prototype.put=function(v,...args){if(this.name==='photos'&&v.status==='LOCAL_FAILED')throw new DOMException('Synthetic storage fault','UnknownError');return window.__savedPut.call(this,v,...args);};});
 await page.locator('#iqcRcNewBatch').click();await idle();await ingest(1);await start();
 const both=await page.evaluate(()=>window.__DS_IQC_RC31.diagnostics());ok('secondary status-save error preserves the primary image diagnosis',both.events.some(e=>e.stage==='photo_failed'&&e.code==='IMAGE_PREPROCESS_ERROR')&&both.events.some(e=>e.stage==='failure_save'&&e.primaryCode==='IMAGE_PREPROCESS_ERROR'&&/^STORAGE_/.test(e.code)));
 await page.evaluate(()=>{IqcOcrRules31.preprocessForOcr=window.__originalPreprocess;IDBObjectStore.prototype.put=window.__savedPut;});
 await page.waitForFunction(()=>/本輪結果尚未保存/.test(document.querySelector('.rc31-photo-result')?.textContent||''));
 ok('failed storage never claims current results were saved',/本輪結果尚未保存/.test(await page.locator('.rc31-photo-result').first().textContent()));
 // Legacy conversion is tested on Chromium; this Windows WebKit build cannot
 // create a persistent Blob fixture. New byte storage is tested on both engines.
 if(process.env.DS_WEBKIT!=='1'){
   await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('ds_iqc_image_rc_v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('photos','readwrite'),s=tx.objectStore('photos'),q=s.index('batchId').getAll(localStorage.getItem('ds_iqc_image_rc_active_batch'));q.onsuccess=()=>{const p=q.result[0],h=IqcOcrPhoto31.hydrate(p);delete h.rc31Image;delete h.rc31Thumbnail;h.ocrText='KEEP_ORIGINAL';h.rc31Review={history:['legacy-review']};h.status='LOCAL';s.put(h);};tx.oncomplete=()=>{db.close();resolve();};};}));
   await start();ok('legacy Blob converts without losing identity or manual history',(await raw())[0].review.history[0]==='legacy-review'&&!(await raw())[0].hasBlob&&(await raw())[0].bytes>0&&(await dbPhotos(page))[0].status==='RECOGNIZED');
 }
 await page.reload();await page.locator('#appShell').waitFor({state:'visible'});await page.locator('#navMore').click();await page.locator('#iqcImageRcTool').click();await idle();
 await page.locator('[data-preview-photo]').first().tap();await page.locator('#iqc31PhotoPreview img').evaluate(img=>img.decode());ok('saved bytes remain readable after page reload',await page.locator('#iqc31PhotoPreview img').isVisible());
 const compatibility=await page.evaluate(async()=>{const p=await window.__DS_IQC_RC31.readPhoto((await window.__DS_IQC_RC31.readPhotos())[0].id),raw=window.__DS_IQC_IMAGE_RC.storedPhoto(p),restored=window.__DS_IQC_IMAGE_RC.restorePhoto(raw);return !raw.blob&&restored.blob.size===p.blob.size&&restored.blob.type===p.blob.type;});ok('shared intake reads byte records for older RC consumers',compatibility);
 ok('storage tests never upload images or submit business records',business===0&&cloudPhotos===0);ok('no uncaught frontend errors',errors.length===0);
 console.log('TOTAL '+checks);fs.writeFileSync(path.join(artifacts,'storage-summary.json'),JSON.stringify({checks,browser:process.env.DS_WEBKIT?'webkit':'edge',errors,business,cloudPhotos,diagnostics:await page.evaluate(()=>window.__DS_IQC_RC31.diagnostics())},null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

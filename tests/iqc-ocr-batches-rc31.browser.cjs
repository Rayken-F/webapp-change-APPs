const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),artifacts=fs.mkdtempSync(path.join(require('os').tmpdir(),'iqc-rc3110-batches-'));console.log('ARTIFACTS '+artifacts);let checks=0;
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
 await page.waitForFunction(()=>document.querySelector('#iqc31BatchSelect')?.options.length>0);
 const batchA=(await batchMeta()).id;
 await page.locator('#iqc31BatchControls summary').click();await page.locator('#iqc31BatchName').fill('框架 A');await page.locator('#iqc31BatchRename').click();await idle();
 await page.waitForFunction(()=>document.getElementById('iqc31BatchMessage').textContent.includes('已儲存'));
 ok('batch label is persisted and selection includes its photo count',(await batchMeta()).label==='框架 A'&&(await page.locator('#iqc31BatchSelect option:checked').textContent()).includes('5 張'));
 const beforeA=await dbPhotos(page);
 await page.locator('#iqcRcNewBatch').click();await idle();await ingest(2);const batchB=(await batchMeta()).id;
 ok('new batch starts its own photos and leaves the earlier batch accessible',batchB!==batchA&&(await dbPhotos(page)).length===2&&await page.locator('#iqc31BatchSelect option').count()===2);
 await page.locator('#iqc31BatchName').fill('框架 B');await page.locator('#iqc31BatchRename').click();await idle();
 await start();const beforeB=await dbPhotos(page);
 await page.locator('#iqc31BatchSelect').selectOption(batchA);await idle();await page.waitForFunction(()=>document.getElementById('iqcRcPhotoCount').textContent==='5');
 ok('switch back restores original region, photos, OCR and saved review',(await batchMeta()).regionCode==='TEST_REGION'&&JSON.stringify(await dbPhotos(page))===JSON.stringify(beforeA));
 ok('duplicate summary reports distinct repeated CTNs and only one visible chip per CTN',/重複 2 個 CTN/.test(await page.locator('#iqc31DuplicateSummary').textContent())&&await page.locator('#iqcRcResultList .iqc-ctn-input').count()===2);
 await page.locator('#iqc31BatchSelect').selectOption(batchB);await idle();await page.waitForFunction(()=>document.getElementById('iqcRcPhotoCount').textContent==='2');
 ok('OCR only changes the chosen batch and photo numbering restarts per batch',JSON.stringify(await dbPhotos(page))===JSON.stringify(beforeB)&&(await dbPhotos(page))[0].seq===1);
 await page.reload();await page.locator('#appShell').waitFor({state:'visible'});await page.locator('#navMore').click();await page.locator('#iqcImageRcTool').click();await idle();
 await page.waitForFunction(()=>document.querySelector('#iqc31BatchSelect')?.options.length===2);
 ok('reloading preserves both named batches and the selected batch',await page.locator('#iqc31BatchSelect').inputValue()===batchB&&(await page.locator('#iqc31BatchSelect').textContent()).includes('框架 A')&&(await page.locator('#iqc31BatchSelect').textContent()).includes('框架 B'));
 // Set realistic source metadata and two independent per-CTN warnings.
 await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('ds_iqc_image_rc_v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('photos','readwrite'),s=tx.objectStore('photos'),q=s.index('batchId').getAll(localStorage.getItem('ds_iqc_image_rc_active_batch'));q.onsuccess=()=>{const list=q.result.sort((a,b)=>a.seq-b.seq);list.forEach((p,i)=>{p.ocrText=i?'AB12CDE\nFG34HIJ':'113374 CYLINDER OCYL 7209 TOTAL 2\nAB12CDE\nFG34HIJ';p.rc31Quality={unread:[],uncertain:i?[]:[{ctn:'AB12CDE',reason:'LOW_CONFIDENCE'},{ctn:'FG34HIJ',reason:'CONFLICT',alternatives:['FG34HIJ','FG34HII']}]};p.updatedAt=new Date().toISOString();s.put(p);});};tx.oncomplete=()=>{db.close();resolve();};};}));
 await page.evaluate(()=>window.__DS_IQC_RC31.refresh());
 ok('unassigned repeated CTNs disappear from lower lists without losing source candidates',await page.locator('#iqcRcResultList .iqc-ctn-input').count()===2&&!/待歸類/.test(await page.locator('#iqcRcResultList').textContent())&&await page.evaluate(()=>window.__DS_IQC_REVIEW31.getModel().flatMap(g=>g.rows).length===4));
 await page.locator('[data-review-quality]').first().click();
 ok('character warnings are separate list items for each CTN',await page.locator('[data-character-warnings] li').count()===2&&(await page.locator('[data-character-warnings] li').nth(1).textContent()).includes('FG34HIJ'));
 await page.locator('[data-review-close]').click();
 const photoB=(await dbPhotos(page))[1];await page.locator('#iqcRcPhotoList [data-review-photo="'+photoB.id+'"]').click();
 ok('collapsed duplicate sources remain manually reviewable',await page.locator('[data-review-key]').count()===2);
 await page.locator('#iqc31TargetGroup').selectOption({label:'RT 113374｜OCYL｜7209'});
 // Hold a real exclusive operation briefly to verify a visible save state.
 await page.evaluate(()=>{window.__lockRequest=navigator.locks.request.bind(navigator.locks);navigator.locks.request=(name,options,work)=>window.__lockRequest(name,options,async lock=>{if(window.__DS_IQC_RC31.diagnostics().queue.kind==='review')await new Promise(r=>window.__releaseReview=r);return work(lock);});});
 await page.locator('[data-review-save]').click();await page.waitForFunction(()=>typeof window.__releaseReview==='function');
 ok('saving is explicit in the fixed header and other group buttons are temporarily locked',/正在保存歸類/.test(await page.locator('#iqc31LiveCount').textContent())&&await page.locator('#iqcRcResultList [data-review-photo]').first().isDisabled()&&await page.locator('#iqc31BatchSelect').isDisabled());
 await page.waitForTimeout(1100);ok('save progress includes elapsed time',/秒/.test(await page.locator('#iqc31LiveCount').textContent()));
 await page.evaluate(()=>{navigator.locks.request=window.__lockRequest;window.__releaseReview();});await idle();await page.waitForFunction(()=>document.getElementById('iqc31ReviewMessage').textContent.includes('已保存'));
 ok('save restores every group button without a page reload and clears old failure banner',await page.locator('#iqcRcResultList [data-review-photo]:disabled').count()===0&&/歸類已保存/.test(await page.locator('#iqc31LiveCount').textContent()));
 await page.locator('[data-review-close]').click();await page.locator('#iqcRcResultList [data-review-photo]').last().click();
 await page.locator('#iqc31Review_status').fill('MNT1');const beforeFailure=await dbPhotos(page);
 await page.evaluate(()=>{window.__putBeforeFailure=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(v,...args){if(this.name==='photos'&&v.rc31Review)throw new DOMException('Synthetic storage fault','UnknownError');return window.__putBeforeFailure.call(this,v,...args);};});
 await page.locator('[data-review-save]').click();await idle();await page.waitForFunction(()=>document.getElementById('iqc31ReviewMessage').textContent.includes('STORAGE'));
 ok('failed save preserves previous records and releases all manual buttons',JSON.stringify(await dbPhotos(page))===JSON.stringify(beforeFailure)&&await page.locator('#iqcRcResultList [data-review-photo]:disabled').count()===0&&/歸類未保存/.test(await page.locator('#iqc31LiveCount').textContent()));
 await page.evaluate(()=>{IDBObjectStore.prototype.put=window.__putBeforeFailure;});await page.locator('[data-review-save]').click();await idle();await page.waitForFunction(()=>document.getElementById('iqc31ReviewMessage').textContent.includes('已保存'));
 ok('retry saves once and restores the group buttons again',await page.locator('#iqcRcResultList [data-review-photo]:disabled').count()===0&&(await dbPhotos(page)).at(-1).rc31Review.history.length===2);
 await page.locator('[data-review-close]').click();
 ok('true status conflict displays each CTN once in an explicit conflict list',await page.locator('#iqc31Conflicts .iqc31-conflict-ctn').count()===2&&await page.locator('#iqcRcResultList .iqc-ctn-input').count()===0&&/尚未決定/.test(await page.locator('#iqc31Conflicts').textContent()));
 await page.locator('[data-merge-rt]').first().click();await page.locator('[data-merge-key]').evaluateAll(es=>es.forEach(e=>e.checked=true));await page.locator('[data-merge-field="status"]').fill('OCYL');await page.locator('[data-merge-field="plant"]').fill('7209');await page.locator('[data-merge-field="expected"]').fill('2');
 const beforeMerge=await dbPhotos(page);
 await page.evaluate(()=>{window.__mergeWrites=0;IDBObjectStore.prototype.put=function(v,...args){if(this.name==='photos'&&v.rc31Review&&++window.__mergeWrites===2)throw new DOMException('Synthetic second-photo failure','UnknownError');return window.__putBeforeFailure.call(this,v,...args);};});
 await page.locator('[data-merge-save]').click();await idle();await page.waitForFunction(()=>document.getElementById('iqc31ReviewMessage').textContent.includes('STORAGE'));
 ok('a second-photo save failure rolls back the whole multi-photo reconciliation',JSON.stringify(await dbPhotos(page))===JSON.stringify(beforeMerge)&&await page.locator('#iqcRcResultList [data-review-photo]:disabled').count()===0);
 await page.evaluate(()=>{IDBObjectStore.prototype.put=window.__putBeforeFailure;});await page.locator('[data-merge-save]').click();await idle();await page.waitForFunction(()=>!document.getElementById('iqc31ReviewEditor'));
 ok('explicit reconciliation keeps source histories, restores controls and removes resolved conflict',await page.locator('#iqc31Conflicts').count()===0&&await page.locator('#iqcRcResultList .iqc-ctn-input').count()===2&&await page.locator('#iqcRcResultList [data-review-photo]:disabled').count()===0);
 await page.locator('#iqcRcResultList [data-review-photo]').first().click();await page.locator('#iqc31Review_rt').fill('113407');
 page.once('dialog',d=>d.dismiss());await page.locator('#iqc31BatchSelect').selectOption(batchA);
 ok('declining a switch keeps an unsaved manual form and current batch',await page.locator('#iqc31BatchSelect').inputValue()===batchB&&await page.locator('#iqc31Review_rt').inputValue()==='113407');
 page.once('dialog',d=>d.accept());await page.locator('#iqc31BatchSelect').selectOption(batchA);await idle();await page.waitForFunction(()=>!document.getElementById('iqc31ReviewEditor'));
 ok('accepted switch cannot apply an old editor to the new batch',await page.locator('#iqc31BatchSelect').inputValue()===batchA&&JSON.stringify(await dbPhotos(page))===JSON.stringify(beforeA));
 await page.locator('#iqc31BatchSelect').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifacts,'batch-selector.png')});
 await page.locator('#iqc31BatchSelect').selectOption(batchB);await idle();await page.waitForFunction(()=>document.getElementById('iqcRcPhotoCount').textContent==='2');
 await page.locator('[data-review-quality]').first().click();await page.screenshot({path:path.join(artifacts,'character-warnings.png')});
 await page.locator('[data-review-close]').click();await page.locator('#iqcRcResultList').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifacts,'duplicate-summary.png')});
 ok('batch/review changes never submit business records or upload photos',business===0&&cloudPhotos===0);
 ok('no uncaught frontend errors',errors.length===0);
 console.log('TOTAL '+checks);fs.writeFileSync(path.join(artifacts,'batch-summary.json'),JSON.stringify({checks,errors,business,cloudPhotos,diagnostics:await page.evaluate(()=>window.__DS_IQC_RC31.diagnostics())},null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});

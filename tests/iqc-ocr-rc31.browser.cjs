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
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1500;c.height=600;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,1500,600);g.fillStyle='black';g.font='32px Arial';g.fillText('113374 CYLINDER OCYL 7209 TOTAL 2',70,110);g.font='50px Arial';g.fillText('AB12CDE',80,240);g.fillText('FG34HIJ',80,340);return c.toDataURL('image/png').split(',')[1];});
 const image={name:'synthetic-honeywell.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')};fs.writeFileSync(path.join(artifacts,'synthetic-honeywell.png'),image.buffer);
 await page.locator('#iqcRcGalleryInput').setInputFiles([image,image,image]);await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());
 if((await dbPhotos(page)).length!==3)console.log('INGESTFAIL '+JSON.stringify({photos:await dbPhotos(page),diagnostics:await page.evaluate(()=>window.__DS_IQC_RC31.diagnostics()),text:await page.locator('#iqcRcProgressText').textContent()}));
 ok('batch of three photos saved with unique sequence',(await dbPhotos(page)).map(p=>p.seq).join(',')==='1,2,3');
 const start=Date.now();await page.locator('#iqcRcAnalyze').click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy(),{},{timeout:150000});
 let photos=await dbPhotos(page);console.log('OCRRESULT '+JSON.stringify(photos.map(p=>({seq:p.seq,status:p.status,failure:p.localFailure,text:p.ocrText}))));
 fs.writeFileSync(path.join(artifacts,'browser-'+(process.env.DS_WEBKIT?'webkit':'edge')+'-initial.json'),JSON.stringify({elapsedMs:Date.now()-start,photos,diagnostics:await page.evaluate(()=>window.__DS_IQC_RC31.diagnostics()),errors,network},null,2));
 ok('real Tesseract recognizes the first, second and third synthetic photos',photos.every(p=>p.status==='RECOGNIZED'&&p.ocrText.includes('AB12CDE')&&p.ocrText.includes('FG34HIJ')));
 ok('three actual photos reuse one worker',workerRequests===1);ok('raw OCR passes remain available locally',photos.every(p=>p.rc31RawPasses?.length));
 ok('Cloud never automatically received a photo',cloudPhotos===0);
 await page.locator('#iqcRcAnalyze').click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());ok('repeat start preserves already completed results',workerRequests===1&&(await dbPhotos(page)).every((p,i)=>p.updatedAt===photos[i].updatedAt));
 await page.locator('#iqcRcGalleryInput').setInputFiles(image);await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());await page.locator('#iqcRcAnalyze').click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy(),{},{timeout:90000});
 photos=await dbPhotos(page);ok('later fourth photo completes with same engine',photos.length===4&&photos.every(p=>p.status==='RECOGNIZED')&&workerRequests===1);
 const keep=photos[0].ocrText;
 await page.evaluate(()=>{window.originalWorkerPost=Worker.prototype.postMessage;Worker.prototype.postMessage=function(message,...args){if(message?.action==='recognize')return;return window.originalWorkerPost.call(this,message,...args);};});
 await page.locator('[data-ocr31-photo]').first().click();await page.locator('#iqc31Cancel').click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());photos=await dbPhotos(page);
 await page.evaluate(()=>{Worker.prototype.postMessage=window.originalWorkerPost;});
 ok('cancel of a retry retains previously recognized text',photos[0].ocrText===keep&&photos[0].status==='RECOGNIZED');
 await page.locator('[data-ocr31-photo]').first().click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy(),{},{timeout:90000});ok('retry after cancel starts a fresh engine',(await dbPhotos(page))[0].status==='RECOGNIZED'&&workerRequests===2);
 await page.locator('#iqcRcClose').click();await page.reload();await page.locator('#appShell').waitFor({state:'visible'});await page.locator('#navMore').click();await page.locator('#iqcImageRcTool').click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());
 ok('reload retains all four photos and OCR results',(await dbPhotos(page)).length===4&&(await dbPhotos(page)).every(p=>p.status==='RECOGNIZED'));
 ok('read-only RC has no business submissions',business===0);
 await page.locator('#iqc31Tools').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifacts,'rc31-'+(process.env.DS_WEBKIT?'webkit':'edge')+'.png')});
 blockWorker=true;await page.locator('[data-ocr31-photo]').first().click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy(),{},{timeout:90000});
 ok('startup download failure is reported and preserves existing photo result',(await dbPhotos(page))[0].ocrText===keep&&/中斷|失敗/.test(await page.locator('#iqcRcProgressText').textContent()));
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
 await page.waitForFunction(()=>window.__DS_IQC_META_GROUPING_V8.getModel().some(g=>g.ctns.length===6),{},{timeout:5000});
 ok('real OCR groups three continuation pages by count (not a character-accuracy assertion)',await page.evaluate(()=>{const m=window.__DS_IQC_META_GROUPING_V8.getModel();return m.length===1&&m[0].expected===6&&m[0].ctns.length===6;}));
 await page.locator('#iqcHybridSyncBtn').click();await page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());ok('complete local batch does not incur a Cloud request',cloudPhotos===1);
 await page.locator('#iqc31Tools').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifacts,'rc31-final-edge.png')});
 // Abort generates a browser worker error; it must not become an uncaught page error.
 ok('no uncaught frontend errors',errors.length===0);
 console.log('TOTAL '+checks);fs.writeFileSync(path.join(artifacts,'browser-'+(process.env.DS_WEBKIT?'webkit':'edge')+'-summary.json'),JSON.stringify({checks,workerRequests,business,cloudPhotos,errors,diagnostics:await page.evaluate(()=>window.__DS_IQC_RC31.diagnostics())},null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});

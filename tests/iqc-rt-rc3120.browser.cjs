const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),artifacts=fs.mkdtempSync(path.join(require('os').tmpdir(),'iqc-rc3120-rt-'));console.log('ARTIFACTS '+artifacts);let checks=0;
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
   else if(p.api==='portal_iqc_cloud_ocr_rc'){cloudPhotos++;out={ok:true,status:'DONE',text:'914322 CYLINDER OCYL 7209 TOTAL 2\nAB12CDE\nFG34HIJ'};}
   else if(p.api==='portal_rt_master')out={ok:true,items:[{rtNo:'914322',description:'X40S',unit:'支',rtType:'loose'}]};
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


 // The OCR outputs below are controlled, but the pipeline, image transforms,
 // gestures, IndexedDB and review UI are real. No business writes are allowed.
 await page.evaluate(()=>{
  window.rtCalls=[];window.rtMode='split';
  IqcOcrEngine31.Engine.prototype.ensure=async()=>{};
  IqcOcrEngine31.Engine.prototype.recognize=async function(image,psm){
   const photo=window.__DS_IQC_RC31.diagnostics().queue.photo;
   const n=rtCalls.filter(c=>c.photo===photo).length+1;rtCalls.push({photo,n,psm});
   const ctn='AB12CDE\nFG34HIJ';let text=ctn;
   if(photo!==2){
    text='CYLINDER OCYL 7209\n'+ctn;
    if((rtMode==='split'&&n===2)||(rtMode==='crop'&&n===3))text='914321\nCYLINDER OCYL 7209 TOTAL 18\n'+ctn;
    if(rtMode==='failure'&&n===3)throw Object.assign(new Error('recognize_TIMEOUT'),{code:'recognize_TIMEOUT'});
   }
   return {data:{text,confidence:98}};
  };
 });
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=1200;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,800,1200);x.fillStyle='green';x.font='26px Arial';x.fillText('914321',2,80);return c.toDataURL('image/png').split(',')[1];});
 const file={name:'rt-fixture.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')};
 const idle=()=>page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());
 async function batch(mode){
  await page.locator('#iqcRcNewBatch').click();await idle();await page.evaluate(mode=>{rtMode=mode;rtCalls=[];},mode);
  await page.locator('#iqcRcGalleryInput').setInputFiles([file,file,file]);await idle();await page.locator('#iqc31StartTop').tap();await idle();
  return {photos:await dbPhotos(page),calls:await page.evaluate(()=>rtCalls)};
 }
 let out=await batch('split');
 ok('one tap processes all three photos despite a missing RT in the middle',out.photos.every(p=>p.status==='RECOGNIZED'));
 ok('split RT is recovered by the single sparse pass',out.photos[0].ocrText.startsWith('914321 CYLINDER OCYL 7209')&&out.calls.filter(c=>c.photo===1).length===2);
 ok('the headerless continuation is not given another photo RT',!out.photos[1].ocrText.includes('914321')&&out.calls.filter(c=>c.photo===2).length===1);
 ok('the third photo continues normally',out.photos[2].ocrText.startsWith('914321 CYLINDER OCYL 7209'));
 out=await batch('crop');
 ok('focused header recovery succeeds in at most three passes',out.photos[0].ocrText.startsWith('914321 CYLINDER OCYL 7209')&&out.calls.filter(c=>c.photo===1).length===3);
 ok('header recovery retains both CTNs without duplicate candidates',await page.evaluate(text=>IqcOcrRules31.structuralState(text).found,out.photos[0].ocrText)===2);
 ok('header recovery phase is recorded without CTN/RT contents',await page.evaluate(()=>__DS_IQC_RC31.diagnostics().events.some(e=>e.stage==='rt_header'&&e.outcome==='ok')));
 const oldId=out.photos[0].id;
 await page.evaluate(async id=>{const p=await __DS_IQC_RC31.readPhoto(id);await __DS_IQC_RC31.saveReview(id,()=>IqcReviewModel31.updateReview(p,[{original:'AB12CDE',ctn:'AB12CDE'}],{rt:'914322',status:'MNT1',plant:'7A44',expected:1}));},oldId);
 await page.locator('[data-ocr31-photo="'+oldId+'"]').tap();await idle();
 ok('retry keeps the operator manual RT decision',await page.evaluate(async id=>IqcReviewModel31.candidates(await __DS_IQC_RC31.readPhoto(id)).find(r=>r.ctn==='AB12CDE').rt,oldId)==='914322');
 out=await batch('failure');
 ok('failed header recovery preserves extracted CTNs and advances',out.photos[0].status==='NEEDS_REVIEW'&&out.photos[0].ocrText.includes('AB12CDE')&&out.photos[0].localFailure==='recognize_TIMEOUT'&&out.photos[1].status==='RECOGNIZED'&&out.photos[2].ocrText.includes('AB12CDE'));
 out=await batch('unreadable');
 ok('unreadable RT stops after one crop pass, without repeated starts',out.photos.every(p=>p.status==='RECOGNIZED')&&out.calls.filter(c=>c.photo===1).length===3&&!out.photos[0].ocrText.includes('914321'));
 await page.reload();await page.locator('#appShell').waitFor({state:'visible'});await page.locator('#navMore').click();await page.locator('#iqcImageRcTool').click();await idle();
 ok('saved candidates survive reopening', (await dbPhotos(page)).length===3&&(await dbPhotos(page))[0].ocrText.includes('AB12CDE'));
 ok('no backend writes or image uploads',business===0&&cloudPhotos===0);
 ok('no uncaught page errors',errors.length===0);
 await page.screenshot({path:path.join(artifacts,'rt-review.png')});
 fs.writeFileSync(path.join(artifacts,'summary.json'),JSON.stringify({checks,errors,business,cloudPhotos},null,2));console.log('TOTAL '+checks);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

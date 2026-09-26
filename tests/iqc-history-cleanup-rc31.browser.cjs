// Real page, IndexedDB and controls. Only Google responses/OCR output are fixtures.
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(require('os').tmpdir(),'iqc-intake-test-'));
const endpoint='https://script.google.com/macros/s/IQC_TEST_FIXTURE/exec',protocol='IQC_IMAGE_V1',environment='IQC_IMAGE_TEST_20260925';
let checks=0;const ok=(label,x)=>{assert.ok(x,label);console.log('PASS '+label);checks++;};
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();try{let b=fs.readFileSync(file);if(file.endsWith('iqc-submit-rc31.js'))b=String(b).replace(/const endpoint='[^']+';/,`const endpoint='${endpoint}';`);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(b);}catch(_){res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=process.env.DS_WEBKIT==='1'?await webkit.launch():await chromium.launch({executablePath:process.env.EDGE_EXECUTABLE||undefined});
 try{
 const context=await browser.newContext({viewport:{width:402,height:874},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 let mode='success',submits=0,queries=0,formalWrites=0,hold;const receipts=new Map(),posted=[];
 await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(u.origin===origin)return route.continue();
   if(u.hostname!=='script.google.com')return route.abort();
   if(req.resourceType()==='document')return route.fulfill({contentType:'text/html',body:'Synthetic fetch transport'});
   const p=req.method()==='POST'?JSON.parse(req.postData()):Object.fromEntries(u.searchParams);let result={ok:true,items:[],regions:[],priorities:[]};
   if(u.pathname.includes('IQC_TEST_FIXTURE')){
     assert.equal(p.session_token,'FIXTURE_SESSION');result={ok:true,protocol,environment};
     if(p.api==='iqc_image_submit'){
       submits++;posted.push(p);const q=p.payload,hash=crypto.createHash('sha256').update(JSON.stringify(q)).digest('hex');
       if(mode==='reject')result={...result,ok:false,confirmedRejected:true,submissionId:q.submissionId,payloadHash:hash,message:'測試 RT 已停用'};
       else if(mode==='pending')result={...result,pending:true,receipt:null};
       else{
         if(mode==='hold')await new Promise(r=>hold=r);
         const receipt=receipts.get(q.submissionId)||{receiptId:crypto.randomUUID(),submissionId:q.submissionId,payloadHash:hash,account:'TEST',station:'IQC',sheetName:'IQC_Log',startRow:2,endRow:q.items.length+1,rowCount:q.items.length,writtenAt:'2026-09-25 12:00:00',environment};receipts.set(q.submissionId,receipt);
         if(mode==='lose')return route.abort();result.receipt=receipt;
       }
     }else{assert.equal(p.api,'iqc_image_status');queries++;result.receipt=receipts.get(p.submissionId)||null;result.found=!!result.receipt;}
   }else if(['workstation_login','workstation_bootstrap'].includes(p.api))result={ok:true,sessionToken:'FIXTURE_SESSION',user:{account:'TEST',displayName:'測試者',role:'ADMIN'},permissions:{home_enabled:true,daily_report_enabled:true}};
   else if(p.api==='iqc_regions')result={ok:true,regions:[{code:'B3',name:'測試區域'}]};
   else if(p.api==='portal_rt_master')result={ok:true,items:[{rtNo:'113353',description:'X40S',unit:'支',rtType:'loose'}]};
   else if(p.iqc_cards||p.api==='iqc_ctn_check')formalWrites++;
   return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
 await page.goto(origin+'/ds-app-grinding-recovery-rc/v31.html');await page.locator('#loginAccount').fill('TEST');await page.locator('#loginPassword').fill('FIXTURE');await page.locator('#loginBtn').click();
 const idle=()=>page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());
 const open=async()=>{await page.locator('#appShell').waitFor({state:'visible'});await page.locator('#navMore').click();await page.locator('#iqcImageRcTool').click();await idle();await page.locator('#iqcRcRegion option[value="B3"]').waitFor({state:'attached'});};await open();
 const prefs='ds_iqc_history_photo_cleanup_v1:TEST';
 async function seed(names){await page.evaluate(async names=>{
   const all=names.map(([id,kind='SYNCED'])=>{const account=kind==='OTHER'?'OTHER':'TEST',submissionId='IQCIMG_TEST_'+id,payloadHash='fixture-hash-'+id;
     const payload={batchId:id,submissionId,regionCode:'B3',items:[{ctn:'AB12CDE',rtNo:'113353',cylinderStatus:'OCYL'}]};
     const batch={id,label:id,status:['OTHER','INVALID'].includes(kind)?'SYNCED':kind,submissionId,rowCount:1,createdAt:new Date().toISOString()};
     const receipt={receiptId:'receipt-'+id,submissionId,payloadHash,account,station:'IQC',sheetName:'IQC_Log',startRow:2,endRow:2,rowCount:kind==='INVALID'?99:1,writtenAt:'2026-09-26 12:00:00',environment:'IQC_IMAGE_TEST_20260925'};
     const r={batchId:id,submissionId,payloadHash,account,payload,receipt,status:batch.status==='SYNCED'?'SYNCED':'PENDING',protocol:'IQC_IMAGE_V1',environment:'IQC_IMAGE_TEST_20260925',endpoint:'https://script.google.com/macros/s/IQC_TEST_FIXTURE/exec'};
     const photo={id:id+'_P',batchId:id,seq:1,status:'RECOGNIZED',ocrText:'113353 CYLINDER OCYL 7209 TOTAL 1\nAB12CDE',rc31Image:{type:'image/png',bytes:new Uint8Array(1048576).buffer},rc31Thumbnail:{type:'image/png',bytes:new Uint8Array(16).buffer}};
     return {batch,r,photo};});
   await new Promise((resolve,reject)=>{const q=indexedDB.open('ds_iqc_image_rc_v1',1);q.onsuccess=()=>{const db=q.result,tx=db.transaction(['batches','photos','submissions'],'readwrite');all.forEach(({batch,r,photo})=>{tx.objectStore('batches').put(batch);tx.objectStore('photos').put(photo);if(batch.status!=='DRAFT')tx.objectStore('submissions').put(r);});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});await __DS_IQC_BATCHES31.reload();
 },names);}
 const assets=()=>page.evaluate(()=>new Promise(resolve=>{const q=indexedDB.open('ds_iqc_image_rc_v1',1);q.onsuccess=()=>{const db=q.result,tx=db.transaction('photos'),r=tx.objectStore('photos').getAll();r.onsuccess=()=>resolve(r.result.map(p=>({id:p.batchId,has:!!p.rc31Image,hasThumb:!!p.rc31Thumbnail,text:p.ocrText,cleared:!!p.photosClearedAt})));tx.oncomplete=()=>db.close();};}));
 const cleanupIdle=()=>page.waitForFunction(()=>!__DS_IQC_RC31.isBusy()&&!document.getElementById('iqc31ClearAllHistoryPhotos').disabled);
 ok('working keeps new batch and one visible start beside photo selection',await page.locator('#iqcRcNewBatch').isVisible()&&await page.locator('#iqc31StartTop').isVisible()&&!await page.locator('#iqcRcAnalyze').isVisible());
 await page.locator('#iqc31History').click();await idle();
 ok('empty history offers cleanup instead of new batch or camera tools',!await page.locator('#iqcRcNewBatch').isVisible()&&await page.locator('#iqc31ClearAllHistoryPhotos').isVisible()&&!await page.locator('#iqc31StartTop').isVisible());
 ok('weekly cleanup defaults off and does not write preferences',!await page.locator('#iqc31WeeklyCleanup').isChecked()&&await page.evaluate(k=>localStorage.getItem(k),prefs)===null);
 await seed([...Array.from({length:23},(_,i)=>['H'+i]),['DRAFT','DRAFT'],['PENDING','QUEUED'],['OTHER','OTHER'],['INVALID','INVALID']]);
 await page.locator('#iqc31History').click();await idle();
 ok('fixture spans multiple history pages',await page.locator('#iqc31HistoryNext').isEnabled());
 const before=await assets();page.once('dialog',d=>d.dismiss());await page.locator('#iqc31ClearAllHistoryPhotos').click();
 ok('cancel all-photo cleanup leaves every asset unchanged',JSON.stringify(await assets())===JSON.stringify(before));
 await page.evaluate(()=>{const original=IqcSubmitStore31.clearPhotos;window.__restoreClear=()=>IqcSubmitStore31.clearPhotos=original;let n=0;IqcSubmitStore31.clearPhotos=async(...args)=>{if(++n===2)throw Error('Synthetic storage failure');return original(...args);};});
 page.once('dialog',d=>d.accept());await page.locator('#iqc31ClearAllHistoryPhotos').click();await cleanupIdle();
 ok('mid-run failure reports committed count and preserves remaining assets',/未全部完成.*1 張.*1.00 MB/.test(await page.locator('#iqc31CleanupResult').textContent())&&(await assets()).filter(p=>p.cleared).length===1);
 await page.evaluate(()=>window.__restoreClear());page.once('dialog',d=>d.accept());await page.locator('#iqc31ClearAllHistoryPhotos').click();await cleanupIdle();
 let result=await assets();
 ok('manual retry clears every eligible history page exactly once',result.filter(p=>p.id.startsWith('H')).every(p=>!p.has&&!p.hasThumb&&p.text.includes('AB12CDE'))&&/22 張.*22.00 MB/.test(await page.locator('#iqc31CleanupResult').textContent()));
 ok('draft pending other-account and invalid-receipt photos stay intact',result.filter(p=>!p.id.startsWith('H')).every(p=>p.has&&p.hasThumb)&&/2 批/.test(await page.locator('#iqc31CleanupResult').textContent()));
 ok('history receipts survive global image cleanup',await page.locator('#iqc31HistoryReceipt tbody tr').count()===1&&(await page.evaluate(()=>__DS_IQC_RC31.listBatches())).filter(b=>b.status==='SYNCED').length===25);
 await page.screenshot({path:path.join(out,'history-cleanup.png')});
 await page.locator('#iqc31WeeklyCleanup').check();let p=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),prefs);
 ok('opt-in schedules first run seven days ahead without deleting new photos',p.enabled&&Math.abs(p.nextAt-Date.now()-7*86400000)<10000);
 await page.reload();await open();await page.locator('#iqc31History').click();await idle();
 ok('opt-in persists across reload',await page.locator('#iqc31WeeklyCleanup').isChecked()&&/下次清理/.test(await page.locator('#iqc31CleanupSchedule').textContent()));
 await seed([['WEEK']]);await page.evaluate(async()=>__DS_IQC_CLEANUP31.check());
 ok('before due date automatic check leaves photos intact',(await assets()).find(p=>p.id==='WEEK').has);
 await page.locator('#iqc31WeeklyCleanup').uncheck();await page.evaluate(k=>{const p=JSON.parse(localStorage.getItem(k));localStorage.setItem(k,JSON.stringify({...p,nextAt:Date.now()-1}));},prefs);await page.evaluate(()=>__DS_IQC_CLEANUP31.check());
 ok('disabled schedule never cleans even when date is past',(await assets()).find(p=>p.id==='WEEK').has);
 await page.evaluate(k=>{const p=JSON.parse(localStorage.getItem(k));localStorage.setItem(k,JSON.stringify({...p,enabled:true,nextAt:Date.now()-1}));},prefs);
 await page.locator('#iqcRcClose').click();await page.evaluate(()=>__DS_IQC_CLEANUP31.check());
 ok('closed image page defers overdue cleanup',(await assets()).find(p=>p.id==='WEEK').has);
 // Reopen before making the schedule due, then hold a real operation lock.
 await page.evaluate(k=>{const p=JSON.parse(localStorage.getItem(k));localStorage.setItem(k,JSON.stringify({...p,nextAt:Date.now()+86400000}));},prefs);
 await page.locator('#iqcImageRcTool').click();await idle();
 await page.evaluate(()=>{window.__heldOperation=__DS_IQC_RC31.submissionOperation(()=>new Promise(r=>window.__releaseOperation=r));});
 await page.evaluate(k=>{const p=JSON.parse(localStorage.getItem(k));localStorage.setItem(k,JSON.stringify({...p,nextAt:Date.now()-1}));},prefs);await page.evaluate(()=>__DS_IQC_CLEANUP31.check());
 ok('busy OCR/edit/submission lock defers overdue cleanup',(await assets()).find(p=>p.id==='WEEK').has);
 await page.evaluate(()=>window.__releaseOperation());await idle();await page.evaluate(()=>__DS_IQC_CLEANUP31.check());
 await page.waitForFunction(()=>document.getElementById('iqc31CleanupResult').textContent.includes('每週清理完成'));await cleanupIdle();
 result=await assets();p=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),prefs);
 ok('overdue opt-in runs when open and idle, retaining text and protection',!result.find(p=>p.id==='WEEK').has&&result.find(p=>p.id==='PENDING').has&&p.nextAt>Date.now()&&/1 張/.test(p.lastResult));
 await seed([['LATER']]);await page.evaluate(()=>__DS_IQC_CLEANUP31.check());
 ok('successful schedule advances and does not immediately clean new receipts',(await assets()).find(p=>p.id==='LATER').has);
 await page.locator('#iqc31WeeklyCleanup').uncheck();
 await page.evaluate(()=>{navigator.locks.request('ds-iqc-ocr-rc31',()=>new Promise(r=>window.__releaseTabLock=r));});await page.waitForFunction(()=>!!window.__releaseTabLock);
 page.once('dialog',d=>d.accept());await page.locator('#iqc31ClearAllHistoryPhotos').click();await cleanupIdle();
 ok('shared browser lock rejects cleanup without deleting any photos',(await assets()).find(p=>p.id==='LATER').has&&/另一分頁/.test(await page.locator('#iqc31CleanupResult').textContent()));
 await page.evaluate(()=>window.__releaseTabLock());
 await page.evaluate(()=>{const original=DS_PORTAL_BRIDGE.getSessionContext;window.__restoreContext=()=>DS_PORTAL_BRIDGE.getSessionContext=original;DS_PORTAL_BRIDGE.getSessionContext=()=>({...original(),profile:{...original().profile,user:{account:'OTHER'}}});__DS_IQC_CLEANUP31.render();});
 ok('another operator has separate default-off settings',!await page.locator('#iqc31WeeklyCleanup').isChecked()&&/已關閉/.test(await page.locator('#iqc31CleanupSchedule').textContent()));
 await page.evaluate(()=>{window.__restoreContext();__DS_IQC_CLEANUP31.render();});
 await page.locator('#iqc31Working').click();await idle();
 ok('working returns new-batch action and hides cleanup-only controls',await page.locator('#iqcRcNewBatch').isVisible()&&!await page.locator('#iqc31ClearAllHistoryPhotos').isVisible());
 await page.screenshot({path:path.join(out,'working-single-start.png')});
 ok('local cleanup never posts business data or photos',submits===0&&formalWrites===0);
 ok('no uncaught frontend errors',errors.length===0);console.log(JSON.stringify({checks,errors,artifacts:out}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

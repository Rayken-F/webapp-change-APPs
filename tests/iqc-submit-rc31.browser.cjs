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
 const snapshot=()=>page.evaluate(()=>IqcSubmitStore31.snapshot(localStorage.getItem('ds_iqc_image_rc_active_batch')));
 async function seed(){await page.locator('#iqcRcRegion').selectOption('B3');await page.waitForTimeout(100);await page.evaluate(async()=>{
   const id=localStorage.getItem('ds_iqc_image_rc_active_batch');await new Promise((resolve,reject)=>{const q=indexedDB.open('ds_iqc_image_rc_v1',1);q.onsuccess=()=>{const db=q.result,tx=db.transaction('photos','readwrite');tx.objectStore('photos').put({id:id+'_PHOTO',batchId:id,seq:1,status:'RECOGNIZED',updatedAt:new Date().toISOString(),ocrText:'113353 CYLINDER OCYL 7209 TOTAL 2\nAB12CDE\nFG34HIJ',rc31Image:{type:'image/png',bytes:new Uint8Array([1,2,3]).buffer}});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});await __DS_IQC_RC31.refresh();});}
 const preview=async()=>{await page.locator('#iqcRcCommit').tap();await idle();await page.locator('#iqc31SubmitPreview ol').waitFor();};
 const commit=async()=>{await page.locator('#iqc31SubmitConfirm').check();await page.locator('#iqc31SubmitAccept').tap();};
 const next=async()=>{await page.locator('#iqcRcNewBatch').click();await idle();await seed();};
 ok('empty batch cannot be submitted',await page.locator('#iqcRcCommit').isDisabled());
 await seed();
 // Some mobile taps never produce the compatibility click. Exercise the completed
 // touch itself; locator.click() alone cannot cover that failure.
 await page.evaluate(()=>{window.__dropSubmitClick=true;window.addEventListener('click',e=>{if(window.__dropSubmitClick&&e.target.closest?.('#iqcRcCommit')){e.preventDefault();e.stopImmediatePropagation();}},true);});
 await page.locator('#iqcRcCommit').tap();await page.locator('#iqc31SubmitPreview').waitFor();await idle();
 ok('one completed mobile tap opens preview even without a compatibility click',await page.locator('#iqc31SubmitPreview').count()===1&&submits===0);
 await page.evaluate(()=>{window.__dropSubmitClick=false;});
 ok('preview has exact CTNs and explicit unchecked confirmation',await page.locator('#iqc31SubmitPreview ol li').count()===2&&await page.locator('#iqc31SubmitAccept').isDisabled());
 await page.waitForTimeout(200);
 const bounds=await page.locator('#iqc31SubmitPreview h3').boundingBox();
 ok('preview title is visible without test code scrolling to it',bounds.y>=0&&bounds.y+bounds.height<874);
 const mutations=await page.evaluate(()=>new Promise(resolve=>{let n=0;const o=new MutationObserver(()=>n++);for(const selector of ['.iqc-rc-top h2','#iqcRcCommit'])o.observe(document.querySelector(selector),{childList:true,attributes:true,attributeFilter:['disabled']});__DS_IQC_RC31.refresh().then(()=>setTimeout(()=>{o.disconnect();resolve(n);},1100));}));ok('refresh does not toggle preview disabled or repaint stable labels',mutations===0&&/RC31.14/.test(await page.locator('.iqc-rc-top h2').textContent()));
 await page.screenshot({path:path.join(out,'preview.png')});await page.locator('#iqc31SubmitBack').click();ok('returning to edit has no submission',submits===0&&(await snapshot()).submissions.length===0);
 await page.locator('#iqcRcRegion').selectOption('');await page.waitForFunction(async()=>!(await IqcSubmitStore31.snapshot(localStorage.getItem('ds_iqc_image_rc_active_batch'))).batch.regionCode);
 await page.locator('#iqcRcCommit').tap();await idle();
 ok('missing region gives a visible explanation and never sends',/請先選擇區域/.test(await page.locator('#iqc31SubmitPreview [role="alert"]').textContent())&&submits===0);
 const errorBounds=await page.locator('#iqc31SubmitPreview [role="alert"]').boundingBox();ok('validation message is in mobile viewport',errorBounds.y>=0&&errorBounds.y+errorBounds.height<874);
 await page.screenshot({path:path.join(out,'validation.png')});await page.locator('#iqc31SubmitBack').tap();await page.locator('#iqcRcRegion').selectOption('B3');await page.waitForTimeout(150);
 await page.evaluate(()=>{const read=IqcSubmitStore31.snapshot;let first=true;IqcSubmitStore31.snapshot=async id=>{if(first){first=false;await new Promise(resolve=>window.__releaseSnapshot=resolve);}return read(id);};window.__restoreSnapshot=()=>IqcSubmitStore31.snapshot=read;});
 await page.locator('#iqcRcCommit').tap();await page.waitForFunction(()=>typeof window.__releaseSnapshot==='function');
 ok('slow local read immediately shows progress before it settles',await page.locator('#iqc31SubmitPreview').getAttribute('aria-busy')==='true'&&/正在整理預覽/.test(await page.locator('#iqc31SubmitPreview').textContent())&&await page.locator('#iqcRcCommit').isDisabled());
 await page.evaluate(()=>window.__releaseSnapshot());await idle();await page.locator('#iqc31SubmitConfirm').check();
 await page.locator('#iqcRcCommit').dispatchEvent('click',{detail:1});
 ok('late compatibility click does not create a second preview or reset confirmation',await page.locator('#iqc31SubmitConfirm').isChecked()&&await page.locator('#iqc31SubmitPreview').count()===1);
 await page.evaluate(()=>window.__restoreSnapshot());await page.locator('#iqc31SubmitBack').tap();
 const touch={identifier:1,clientX:120,clientY:600};
 await page.locator('#iqcRcCommit').dispatchEvent('touchstart',{touches:[touch],changedTouches:[touch]});
 await page.locator('#iqcRcCommit').dispatchEvent('touchmove',{touches:[{...touch,clientY:640}],changedTouches:[{...touch,clientY:640}]});
 await page.locator('#iqcRcCommit').dispatchEvent('touchend',{touches:[],changedTouches:[{...touch,clientY:640}]});
 ok('scroll gesture over submit never opens preview or submits',await page.locator('#iqc31SubmitPreview').count()===0&&submits===0);
 await page.locator('#iqcRcCommit').focus();await page.keyboard.press('Enter');await idle();await page.locator('#iqc31SubmitPreview ol').waitFor();
 ok('keyboard activation still works',await page.locator('#iqc31SubmitPreview ol li').count()===2);await page.locator('#iqc31SubmitBack').click();
 await preview();mode='hold';await commit();await page.waitForFunction(()=>document.getElementById('iqc31SubmitMessage').textContent.includes('正在送至'));
 for(let i=0;i<40&&!hold;i++)await page.waitForTimeout(50);ok('busy state visible and double submission blocked',!!hold&&await page.locator('#iqcRcCommit').isDisabled()&&await page.locator('#iqcRcRegion').isDisabled()&&submits===1);
 let s=await snapshot();ok('one immutable pending record exists before network completion',s.batch.status==='QUEUED'&&s.submissions.length===1&&s.submissions[0].status==='PENDING');
 const guarded=await page.evaluate(async s=>{let n=0;for(const f of [()=>IqcBatchStore31.updateBatch({...s.batch,regionCode:'OTHER'}),()=>IqcBatchStore31.deleteDraftPhoto(s.photos[0].id),()=>__DS_IQC_RC31.saveReview(s.photos[0].id,()=>({version:1}))])try{await f();}catch(_){n++;}return n;},s);ok('pending parent blocks metadata, deletion and manual changes',guarded===3);
 hold();await idle();await page.waitForFunction(()=>document.getElementById('iqc31SubmitMessage').textContent.includes('已寫入 2 筆'));s=await snapshot();
 ok('only verified complete receipt marks batch synced',s.batch.status==='SYNCED'&&s.submissions[0].receipt.rowCount===2);const original=s.submissions[0].submissionId;
 await page.screenshot({path:path.join(out,'receipt.png')});await page.locator('#iqcRcSyncPending').click();await idle();ok('receipt query never resubmits completed batch',submits===1&&queries===1);
 await page.reload();await open();s=await snapshot();ok('reload preserves photos, immutable payload and receipt',s.photos.length===1&&s.submissions[0].submissionId===original&&s.batch.status==='SYNCED');
 await next();mode='lose';await preview();await commit();await idle();s=await snapshot();const lostId=s.submissions[0].submissionId;
 ok('lost response retains one pending batch and every source photo',s.batch.status==='QUEUED'&&s.photos.length===1&&s.submissions[0].status==='PENDING'&&receipts.has(lostId));
 mode='success';await page.locator('#iqcRcSyncPending').click();await idle();s=await snapshot();ok('retry first recovers receipt without another submit',s.batch.status==='SYNCED'&&s.submissions[0].submissionId===lostId&&submits===2);
 await next();mode='pending';await preview();await commit();await idle();s=await snapshot();const pendingId=s.submissions[0].submissionId;ok('ok pending with no receipt never shows success',s.batch.status==='QUEUED'&&s.submissions[0].receipt===null);
 mode='success';await page.locator('#iqcRcSyncPending').click();await idle();s=await snapshot();ok('missing receipt retry uses same frozen submission ID and payload',s.batch.status==='SYNCED'&&posted.at(-1).payload.submissionId===pendingId&&JSON.stringify(posted.at(-1).payload)===JSON.stringify(posted.at(-2).payload));
 await next();mode='reject';await preview();await commit();await idle();s=await snapshot();ok('confirmed rejection unlocks draft without claiming a receipt',s.batch.status==='DRAFT'&&s.submissions[0].status==='REJECTED'&&await page.locator('#iqcRcCommit').isEnabled());
 const before=submits;await preview();await page.evaluate(()=>new Promise(resolve=>{const q=indexedDB.open('ds_iqc_image_rc_v1',1);q.onsuccess=()=>{const db=q.result,tx=db.transaction('batches','readwrite'),st=tx.objectStore('batches'),r=st.get(localStorage.getItem('ds_iqc_image_rc_active_batch'));r.onsuccess=()=>st.put({...r.result,label:'Changed in second tab'});tx.oncomplete=()=>{db.close();resolve();};};}));await commit();await idle();ok('stale preview cannot freeze changed batch or send network request',submits===before&&/已變更/.test(await page.locator('#iqc31SubmitMessage').textContent()));await page.locator('#iqc31SubmitBack').click();
 const scoped=await page.evaluate(()=>{const original=DS_PORTAL_BRIDGE.getSessionContext;window.DS_PORTAL_BRIDGE={...DS_PORTAL_BRIDGE,getSessionContext:()=>({...original(),profile:{...original().profile,user:{account:'OTHER'}}})};return DS_PORTAL_BRIDGE.getSessionContext().profile.user.account==='OTHER';});ok('identity fixture installed',scoped);
 // Completed batch remains owned by the original account even after another login.
 await page.locator('#iqc31BatchSelect').selectOption(posted[0].payload.batchId);await idle();const qbefore=queries;await page.locator('#iqcRcSyncPending').click();await idle();ok('another account cannot query/replay original account record',queries===qbefore&&/原送出帳號/.test(await page.locator('#iqc31SubmitMessage').textContent()));
 ok('no legacy formal endpoint write or photo upload',formalWrites===0&&posted.every(p=>!JSON.stringify(p).includes('rc31Image')&&!JSON.stringify(p).includes('operator')));
 ok('no uncaught frontend errors',errors.length===0);console.log(JSON.stringify({checks,submits,queries,formalWrites,errors,artifacts:out}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

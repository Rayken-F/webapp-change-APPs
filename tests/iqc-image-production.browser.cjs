// Production shell + actual image module/IndexedDB. Network responses are synthetic.
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=process.env.IQC_TEST_OUTPUT||require('os').tmpdir();
const env='IQC_IMAGE_PRODUCTION_V1';let checks=0;function ok(name,value){assert.ok(value,name);console.log('PASS '+name);checks++;}
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));let f=file;if(req.url.split('?')[0].endsWith('/'))f=path.join(file,'index.html');if(!f.startsWith(root+path.sep))return res.writeHead(403).end();try{let b=fs.readFileSync(f);if(f.endsWith('production.js'))b=String(b).replace(/const endpoint='[^']+';/,"const endpoint='https://script.google.com/macros/s/PRODUCTION_FIXTURE/exec';");res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.html')?'text/html':f.endsWith('.css')?'text/css':'application/octet-stream');res.end(b);}catch(_){res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.EDGE_EXECUTABLE});
 try{
  const ctx=await browser.newContext({viewport:{width:402,height:874},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  let allowed=false,account='TEST',submits=0,mode='success';const receipts=new Map(),posts=[],errors=[];
  await ctx.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();
   if(url.hostname!=='script.google.com')return route.abort();
   if(req.resourceType()==='document')return route.fulfill({contentType:'text/html',body:'fixture'});
   const body=req.method()==='POST'?JSON.parse(req.postData()):{};let result={ok:true,items:[],priorities:[]};
   if(url.pathname.includes('PRODUCTION_FIXTURE')){
    posts.push(body);result={ok:true,protocol:'IQC_IMAGE_V1',environment:env};
    if(body.api==='iqc_image_masters')Object.assign(result,{items:[{rtNo:'113353',description:'X40S',rtType:'loose',unit:'支'}],regions:[{code:'B3',label:'收貨區'}]});
    else if(body.api==='iqc_image_submit'){
     submits++;const p=body.payload;assert.equal(p.environment,env);assert.match(p.submissionId,/^IQCIMG_PROD_/);assert.equal(body.session_token,'FIXTURE');
     const normalized={...p,items:p.items.slice().sort((a,b)=>a.ctn.localeCompare(b.ctn))};
     const receipt=receipts.get(p.submissionId)||{receiptId:crypto.randomUUID(),submissionId:p.submissionId,payloadHash:crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex'),account,station:'IQC',sheetName:'IQC_Log',startRow:2,endRow:p.items.length+1,rowCount:p.items.length,writtenAt:'2026-09-27 16:30:00',environment:env};receipts.set(p.submissionId,receipt);
     if(mode==='lose')return route.abort();result.receipt=receipt;
    }else if(body.api==='iqc_image_status'){result.receipt=receipts.get(body.submissionId)||null;result.found=!!result.receipt;if(result.receipt&&body.payloadHash!==result.receipt.payloadHash)result={...result,ok:false,receipt:null,code:'PAYLOAD_CONFLICT',message:'核對碼不符'};}else throw Error('unexpected route');
   }else if(['workstation_login','workstation_bootstrap','portal_profile'].includes(body.api))result={ok:true,sessionToken:'FIXTURE',user:{account,displayName:'測試人員',role:'ADMIN'},permissions:{home_enabled:true,iqc_image_enabled:allowed,daily_report_enabled:false}};
   return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
  });
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto(origin+'/ds-app/');await page.locator('#loginAccount').fill('TEST');await page.locator('#loginPassword').fill('fixture');await page.locator('#loginBtn').click();await page.locator('#appShell').waitFor({state:'visible'});await page.locator('#navMore').click();
  ok('ADMIN without independent permission has no image entry',await page.getByText('IQC 圖像辨識',{exact:true}).count()===0);
  const direct=await ctx.newPage();await direct.goto(origin+'/DS-IQC-IMAGE/');ok('direct access cannot initialize image data',await direct.locator('#entryMessage').isVisible()&&await direct.locator('#iqcImageRc').count()===0);await direct.close();
  allowed=true;await page.reload();await page.locator('#appShell').waitFor({state:'visible'});await page.locator('#navMore').click();await page.getByText('IQC 圖像辨識',{exact:true}).click();
  let frame=await page.locator('iframe[data-module-key="iqcImage"]').elementHandle().then(x=>x.contentFrame());await frame.locator('#iqcRcRegion option[value="B3"]').waitFor({state:'attached'});const idle=()=>frame.waitForFunction(()=>!__DS_IQC_RC31.isBusy());await idle();
  ok('independent permission opens image without daily permission',await frame.locator('#iqcImageRc').isVisible());
  ok('production title and one start button',/V1\.3/.test(await frame.locator('.iqc-rc-top h2').textContent())&&await frame.getByRole('button',{name:'開始辨識',exact:true}).count()===1);
  const key=await frame.evaluate(()=>IqcProduction.key('ds_iqc_image_rc_active_batch'));
  const snap=()=>frame.evaluate(()=>IqcSubmitStore31.snapshot(localStorage.getItem(IqcProduction.key('ds_iqc_image_rc_active_batch'))));
  const batch=(await snap()).batch.id;
  await frame.locator('#iqcRcRegion').selectOption('B3');await frame.waitForTimeout(120);
  await frame.evaluate(()=>{IqcOcrEngine31.Engine.prototype.ensure=async()=>{};IqcOcrEngine31.Engine.prototype.recognize=async()=>({data:{text:'113353 CYLINDER OCYL 7209 TOTAL 6\nAB12CDE\nFG34HIJ\nKL56MNP\nQR78STU\nUV90WXY\nZA12BCD',confidence:98}});});
  const png=await frame.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=500;c.getContext('2d').fillRect(0,0,400,500);return c.toDataURL('image/png').split(',')[1];});
  await frame.locator('#iqcRcGalleryInput').setInputFiles(Array(3).fill({name:'local-fixture.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')}));await idle();
  await frame.getByRole('button',{name:'開始辨識',exact:true}).tap();await idle();
  ok('one tap processes three photos in the production account database',(await snap()).photos.length===3&&(await snap()).photos.every(p=>p.status==='RECOGNIZED'));

  const first=(await snap()).photos[0].id;
  const imageHash=()=>frame.evaluate(async id=>{const p=await __DS_IQC_RC31.readPhoto(id);return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await p.blob.arrayBuffer()))].join(',');},first),hash=await imageHash();
  // Simulate an existing V1.0 batch without saved row order, preserving its byte-backed photos.
  await frame.evaluate(id=>new Promise(resolve=>{const r=indexedDB.open(IqcProduction.key('ds_iqc_image_rc_v1'),1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('photos','readwrite'),s=tx.objectStore('photos'),q=s.getAll();q.onsuccess=()=>q.result.forEach(p=>{delete p.rc31Order;if(p.id===id)p.rc31Quality={unread:[],uncertain:[{ctn:'AB12CDE',reason:'LOW_CONFIDENCE'}]};p.updatedAt=new Date().toISOString();s.put(p);});tx.oncomplete=()=>{db.close();resolve();};};}),first);
  await frame.evaluate(()=>__DS_IQC_RC31.refresh());await idle();
  ok('legacy formal photos retain their original ordered candidates',JSON.stringify(await frame.locator('[data-result-ctn]').evaluateAll(es=>es.map(e=>e.dataset.resultCtn)))===JSON.stringify(['AB12CDE','FG34HIJ','KL56MNP','QR78STU','UV90WXY','ZA12BCD']));
  await frame.locator('[data-review-quality="'+first+'"]').tap();await frame.locator('[aria-label="核對 CTN"]').first().fill('AB62CDE');await frame.locator('[data-review-save]').tap();await idle();
  await frame.locator('#iqc31ReviewEditor [data-preview-photo]').tap();await frame.locator('#iqc31PhotoPreview img').evaluate(img=>img.decode());
  ok('saved correction opens the original photo inline in the formal iframe',await frame.locator('#iqc31PhotoPreview').evaluate(p=>p.parentElement.id==='iqc31ReviewEditor'&&getComputedStyle(p).position==='static'&&!p.hasAttribute('aria-modal')));
  await frame.locator('[data-preview-zoom="1"]').tap();await frame.locator('[data-preview-zoom="1"]').tap();await frame.locator('.iqc31-photo-viewport').scrollIntoViewIfNeeded();
  const box=await frame.locator('.iqc31-photo-viewport').boundingBox(),before=await frame.locator('.iqc31-photo-viewport').evaluate(v=>v.scrollTop);
  await page.mouse.move(box.x+box.width*.6,box.y+box.height*.6);await page.mouse.down();await page.mouse.move(box.x+box.width*.6-30,box.y+box.height*.6-50,{steps:5});await page.mouse.up();
  ok('formal photo zoom and drag remain usable',await frame.locator('.iqc31-photo-viewport').evaluate((v,b)=>v.dataset.zoom==='2'&&v.scrollTop>b,before));
  await frame.locator('[data-preview-close]').tap();await frame.locator('[data-review-close]').tap();
  ok('formal result retains corrected yellow CTN',await frame.locator('[data-result-ctn="AB62CDE"]').evaluate(e=>getComputedStyle(e).backgroundColor==='rgb(255, 228, 154)'));
  const group=frame.locator('[data-ctn-group]').filter({has:frame.locator('[data-ctn-select="AB12CDE"]')});
  ok('formal CTNs are column-first numbered with one group action',await group.evaluate(g=>{const tiles=[...g.querySelectorAll('[data-result-ctn]')],b=tiles.map(e=>e.getBoundingClientRect()),n=Math.ceil(b.length/2);return tiles.length===7&&tiles.every((e,i)=>e.querySelector('.iqc31-row-number').textContent===(i+1)+'.')&&b[1].top>b[0].top&&Math.abs(b[n].top-b[0].top)<1&&b[n].left>b[0].right&&g.querySelectorAll('[data-ctn-remove-selected]').length===1&&!g.querySelector('[data-ctn-remove]');}));
  await frame.locator('[data-ctn-select="AB12CDE"]').tap();await frame.locator('[data-ctn-select="FG34HIJ"]').tap();
  ok('formal group remove counts the selected CTNs',await group.locator('[data-ctn-remove-selected]').textContent()==='移除所選（2）');
  await group.locator('[data-ctn-remove-selected]').tap();await idle();
  ok('formal multi-removal updates every duplicate source without changing image',await frame.locator('[data-result-ctn="AB12CDE"],[data-result-ctn="FG34HIJ"]').count()===0&&(await snap()).photos.every(p=>p.rc31Review.excluded.FG34HIJ)&&await imageHash()===hash);
  await frame.locator('#iqc31Excluded summary').tap();await frame.locator('[data-ctn-restore="FG34HIJ"]').tap();await idle();
  ok('formal undo restores selected CTN while keeping the unwanted original excluded',await frame.locator('[data-result-ctn]').count()===6&&await frame.locator('[data-result-ctn="FG34HIJ"]').count()===1&&await frame.locator('[data-result-ctn="AB12CDE"]').count()===0);
  await frame.locator('#iqc31SaveNotice').waitFor({state:'hidden'});await frame.locator('[data-ctn-select="AB62CDE"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'production-ctn-grid.png')});
  await page.reload();await page.locator('#appShell').waitFor({state:'visible'});await page.locator('#navMore').click();await page.getByText('IQC 圖像辨識',{exact:true}).click();frame=await page.locator('iframe[data-module-key="iqcImage"]').elementHandle().then(x=>x.contentFrame());await frame.locator('#iqcRcRegion option[value="B3"]').waitFor({state:'attached'});await idle();
  ok('formal reload retains old batch, correction, exclusions and photo',(await snap()).batch.id===batch&&await frame.locator('[data-result-ctn="AB62CDE"]').count()===1&&await frame.locator('[data-result-ctn="AB12CDE"]').count()===0&&await imageHash()===hash);

  await frame.evaluate(()=>{const payload=IqcSubmitModel31.payload;IqcSubmitModel31.payload=(...args)=>{const p=payload(...args);return {...p,items:p.items.slice().reverse()};};});
  await frame.locator('#iqcRcCommit').tap();await frame.locator('#iqc31SubmitPreview table').waitFor();await idle();
  ok('preview has six reviewed rows with formal destination and no excluded CTN',await frame.locator('#iqc31SubmitPreview tbody tr').count()===6&&/正式 IQC/.test(await frame.locator('#iqc31SubmitPreview').textContent())&&!/AB12CDE/.test(await frame.locator('#iqc31SubmitPreview tbody').textContent()));
  ok('preview requires unchecked human confirmation',await frame.locator('#iqc31SubmitAccept').isDisabled());
  await page.screenshot({path:path.join(out,'production-preview.png')});
  mode='lose';await frame.locator('#iqc31SubmitConfirm').check();await frame.locator('#iqc31SubmitAccept').tap();await idle();
  // Recreate a V1.1 pending record: preserve its photo-order payload and legacy hash.
  const legacyHash=await frame.evaluate(async()=>{const id=localStorage.getItem(IqcProduction.key('ds_iqc_image_rc_active_batch')),s=await IqcSubmitStore31.snapshot(id),v=s.submissions[0];v.payloadHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(v.payload))))].map(n=>n.toString(16).padStart(2,'0')).join('');delete v.canonicalPayloadHash;await new Promise((resolve,reject)=>{const r=indexedDB.open(IqcProduction.key('ds_iqc_image_rc_v1'),1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('submissions','readwrite');tx.objectStore('submissions').put(v);tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});return v.payloadHash;});
  // The accepted flow may immediately recover the receipt, or retain SENT_UNKNOWN until retry.
  mode='success';if((await snap()).submissions[0]?.status!=='SYNCED'){await frame.locator('#iqcRcSyncPending').tap();await idle();}
  await frame.waitForFunction(async()=>{const s=await IqcSubmitStore31.snapshot(localStorage.getItem(IqcProduction.key('ds_iqc_image_rc_active_batch')));return s.submissions[0]?.status==='SYNCED';});
  ok('lost response resolves to permanent receipt without duplicate write',submits===1&&receipts.size===1&&(await snap()).batch.status==='SYNCED');
  const recovered=(await snap()).submissions[0];ok('legacy hash is preserved and canonical receipt recovered without changing payload order',recovered.payloadHash===legacyHash&&recovered.canonicalPayloadHash===recovered.receipt.payloadHash&&legacyHash!==recovered.receipt.payloadHash&&recovered.payload.items[0].ctn==='ZA12BCD');
  ok('request contains no photos or client identity',posts.filter(x=>x.api==='iqc_image_submit').every(x=>!JSON.stringify(x).includes('base64')&&!x.payload.operator&&!x.payload.date));
  await frame.locator('#iqc31History').click();await idle();
  ok('confirmed production batch appears in history',(await snap()).batch.id===batch&&/已入帳/.test(await frame.locator('#iqc31BatchSelect').textContent()));
  await page.screenshot({path:path.join(out,'production-history.png')});
  ok('RC storage is not used',await frame.evaluate(()=>localStorage.getItem('ds_iqc_image_rc_active_batch')===null));
  ok('confirmed batch cannot add CTNs',await frame.locator('[data-add-ctn-group]:enabled').count()===0);
  // Reload with a different account must select a separate database and active batch.
  account='OTHER';await page.reload();await page.locator('#appShell').waitFor({state:'visible'});await page.locator('#navMore').click();await page.getByText('IQC 圖像辨識',{exact:true}).click();frame=await page.locator('iframe[data-module-key="iqcImage"]').elementHandle().then(x=>x.contentFrame());await frame.locator('#iqcImageRc').waitFor();await idle();
  ok('other account cannot see prior account batches',await frame.evaluate(async()=>{const x=await __DS_IQC_RC31.listBatches();return x.length===1&&x[0].status==='DRAFT';}));
  ok('other account has distinct active key',await frame.evaluate(()=>IqcProduction.key('ds_iqc_image_rc_active_batch'))!==key);
  await frame.locator('#iqcRcRegion').selectOption('B3');
  await frame.locator('#iqcRcGalleryInput').setInputFiles({name:'manual-fixture.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await idle();
  const manualPhoto=(await snap()).photos[0].id;
  await frame.locator('[data-review-photo="'+manualPhoto+'"]').tap();await frame.locator('[data-add-ctn-photo]').tap();
  await frame.locator('#iqc31AddText').fill('XY12ABC\nXY34DEF');await frame.locator('#iqc31Add_rt').fill('113353');await frame.locator('#iqc31Add_status').fill('OCYL');await frame.locator('#iqc31Add_plant').fill('7209');
  await frame.locator('#iqc31AddPreview').tap();await frame.locator('#iqc31PhotoPreview img').evaluate(img=>img.decode());await frame.locator('[data-preview-close]').tap();
  await frame.locator('[data-add-manual-save]').tap();await idle();
  ok('manual supplement saves an unread photo and makes it reviewable',(await snap()).photos[0].status==='NEEDS_REVIEW'&&await frame.locator('[data-result-ctn]').count()===2);
  await frame.locator('[data-add-ctn-group]').tap();await frame.locator('#iqc31AddText').fill('XY56GHI');await frame.locator('#iqc31AddBefore').selectOption('XY34DEF');
  await frame.locator('#iqc31ReviewEditor').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'manual-add-form.png')});
  await frame.locator('[data-add-manual-save]').tap();await idle();
  ok('group manual supplement inherits RT and inserts at photo position',JSON.stringify(await frame.locator('[data-result-ctn]').evaluateAll(es=>es.map(e=>e.dataset.resultCtn)))===JSON.stringify(['XY12ABC','XY56GHI','XY34DEF']));
  await frame.locator('[data-add-ctn-group]').tap();await frame.locator('#iqc31AddText').fill('XY56GHI');await frame.locator('[data-add-manual-save]').tap();await idle();
  ok('duplicate manual CTN keeps the form and does not add another row',/已存在|重複/.test(await frame.locator('#iqc31ReviewMessage').textContent())&&await frame.locator('#iqc31AddText').inputValue()==='XY56GHI'&&await frame.locator('[data-result-ctn]').count()===3);
  await frame.locator('#iqc31AddText').fill('');page.once('dialog',d=>d.accept());await frame.locator('[data-review-close]').tap();
  await page.reload();await page.locator('#appShell').waitFor({state:'visible'});await page.locator('#navMore').click();await page.getByText('IQC 圖像辨識',{exact:true}).click();frame=await page.locator('iframe[data-module-key="iqcImage"]').elementHandle().then(x=>x.contentFrame());await frame.locator('#iqcRcRegion option[value="B3"]').waitFor({state:'attached'});await idle();
  ok('manual supplement survives real IndexedDB reload in photo order',JSON.stringify(await frame.locator('[data-result-ctn]').evaluateAll(es=>es.map(e=>e.dataset.resultCtn)))===JSON.stringify(['XY12ABC','XY56GHI','XY34DEF']));
  await frame.locator('#iqcRcCommit').tap();await frame.locator('#iqc31SubmitPreview table').waitFor();await idle();
  ok('manual-only photo reaches submission preview',await frame.locator('#iqc31SubmitPreview tbody tr').count()===3&&/XY56GHI/.test(await frame.locator('#iqc31SubmitPreview tbody').textContent()));
  await page.screenshot({path:path.join(out,'manual-added-preview.png')});
  await frame.locator('#iqc31SubmitConfirm').check();await frame.locator('#iqc31SubmitAccept').tap();await idle();
  ok('manual CTNs reach backend payload and receipt',posts.filter(p=>p.api==='iqc_image_submit').at(-1).payload.items.some(r=>r.ctn==='XY56GHI'&&r.rtNo==='113353')&&(await snap()).submissions[0].receipt.rowCount===3);
  allowed=false;await page.evaluate(()=>DS_PORTAL_BRIDGE.reauthenticate());await page.waitForFunction(()=>!document.querySelector('iframe[data-module-key="iqcImage"]'));
  ok('revoked permission removes existing image frame',await page.locator('iframe[data-module-key="iqcImage"]').count()===0);
  ok('no page runtime errors',errors.length===0);
  console.log(JSON.stringify({checks,submits,screenshots:out}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

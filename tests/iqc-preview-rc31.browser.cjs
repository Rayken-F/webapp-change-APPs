const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),artifacts=fs.mkdtempSync(path.join(require('os').tmpdir(),'iqc-rc3123-preview-'));console.log('ARTIFACTS '+artifacts);let checks=0;
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
 const image=process.env.DS_PREVIEW_PHOTO?{name:'preview-fixture.jpg',mimeType:'image/jpeg',buffer:fs.readFileSync(process.env.DS_PREVIEW_PHOTO)}:{name:'storage-fixture.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')};
 const idle=()=>page.waitForFunction(()=>!window.__DS_IQC_RC31.isBusy());
 const ingest=async(n=3)=>{await page.locator('#iqcRcGalleryInput').setInputFiles(Array(n).fill(image));await idle();};
 const start=async()=>{await page.locator('#iqc31StartTop').tap();await idle();};
 const raw=()=>page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('ds_iqc_image_rc_v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('photos'),q=tx.objectStore('photos').index('batchId').getAll(localStorage.getItem('ds_iqc_image_rc_active_batch'));q.onsuccess=()=>resolve(q.result.sort((a,b)=>a.seq-b.seq).map(p=>({seq:p.seq,status:p.status,hasBlob:p.blob instanceof Blob,hasThumbnail:p.thumbnail instanceof Blob,bytes:p.rc31Image?.bytes?.byteLength,review:p.rc31Review})));tx.oncomplete=()=>db.close();};}));

 await ingest(7);await start();
 const selected=(await dbPhotos(page))[5];
 const imageHash=()=>page.evaluate(async id=>{const p=await window.__DS_IQC_RC31.readPhoto(id);return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await p.blob.arrayBuffer()))].join(',');},selected.id);
 const beforeHash=await imageHash();
 await page.evaluate(id=>new Promise(resolve=>{const r=indexedDB.open('ds_iqc_image_rc_v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('photos','readwrite'),s=tx.objectStore('photos'),q=s.get(id);q.onsuccess=()=>{const p=q.result;p.rc31Quality={unread:[],uncertain:[{ctn:'AB12CDE',reason:'LOW_CONFIDENCE'}]};p.updatedAt=new Date().toISOString();s.put(p);};tx.oncomplete=()=>{db.close();resolve();};};}),selected.id);
 await page.evaluate(()=>window.__DS_IQC_RC31.refresh());
 await page.locator('[data-review-quality="'+selected.id+'"]').tap();
 await page.locator('[aria-label="核對 CTN"]').first().fill('AB62CDE');
 await page.locator('[data-review-save]').tap();await idle();
 await page.waitForFunction(()=>document.getElementById('iqc31ReviewMessage').textContent.includes('已保存'));
 const saved=(await dbPhotos(page))[5];
 await page.locator('#iqc31ReviewEditor [data-preview-photo]').tap();
 await page.locator('#iqc31PhotoPreview img').evaluate(img=>img.decode());
 const fits=()=>page.evaluate(()=>{const panel=document.getElementById('iqc31PhotoPreview').getBoundingClientRect(),image=document.querySelector('#iqc31PhotoPreview img').getBoundingClientRect(),close=document.querySelector('[data-preview-close]').getBoundingClientRect();return image.top>=panel.top&&image.left>=panel.left&&image.right<=panel.right+1&&close.bottom<=panel.bottom&&close.top>=image.bottom;});
 ok('saved CTN correction opens an inline centered photo with close below',await fits()&&await page.evaluate(()=>{const p=document.getElementById('iqc31PhotoPreview'),img=p.querySelector('img').getBoundingClientRect(),box=p.getBoundingClientRect();return p.parentElement.id==='iqc31ReviewEditor'&&getComputedStyle(p).position==='static'&&!p.hasAttribute('aria-modal')&&Math.abs((img.left+img.right-box.left-box.right)/2)<2;}));
 ok('warning box and view button have a visible gap',await page.evaluate(()=>document.querySelector('#iqc31ReviewEditor [data-preview-photo]').getBoundingClientRect().top-document.querySelector('[data-character-warnings]').getBoundingClientRect().bottom>=12));
 await page.locator('[data-preview-zoom="1"]').tap();await page.locator('[data-preview-zoom="1"]').tap();
 ok('plus enlarges the image inside a bounded viewport with controls below',await page.evaluate(()=>{const v=document.querySelector('.iqc31-photo-viewport'),i=v.querySelector('img');return v.dataset.zoom==='2'&&i.getBoundingClientRect().height>v.clientHeight&&v.scrollHeight>v.clientHeight&&document.querySelector('[data-preview-close]').getBoundingClientRect().top>=v.getBoundingClientRect().bottom;}));
 await page.locator('.iqc31-photo-viewport').scrollIntoViewIfNeeded();
 const panBox=await page.locator('.iqc31-photo-viewport').boundingBox(),panBefore=await page.locator('.iqc31-photo-viewport').evaluate(v=>({x:v.scrollLeft,y:v.scrollTop}));
 const touch=await context.newCDPSession(page),x=panBox.x+panBox.width*.6,y=panBox.y+panBox.height*.6;
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-45,y:y-60}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const panAfter=await page.locator('.iqc31-photo-viewport').evaluate(v=>({x:v.scrollLeft,y:v.scrollTop}));
 ok('touch dragging pans the enlarged photo horizontally and vertically',panAfter.x>panBefore.x+30&&panAfter.y>panBefore.y+40);
 for(let i=0;i<4;i++)await page.locator('[data-preview-zoom="1"]').tap();
 ok('zoom is bounded at four times',await page.locator('[data-preview-zoom="1"]').isDisabled());
 for(let i=0;i<6;i++)await page.locator('[data-preview-zoom="-1"]').tap();
 ok('minus returns to fit and restores normal vertical page gestures',await fits()&&await page.locator('[data-preview-zoom="-1"]').isDisabled()&&await page.locator('.iqc31-photo-viewport').evaluate(v=>v.scrollTop===0&&v.scrollLeft===0&&getComputedStyle(v).touchAction==='pan-y'));
 await page.screenshot({path:path.join(artifacts,'after-edit-preview.png')});
 const changes=await page.evaluate(async()=>{let mutations=0;const o=new MutationObserver(records=>mutations+=records.length);o.observe(document.getElementById('iqc31PhotoPreview'),{attributes:true,subtree:true});for(let i=0;i<200;i++){visualViewport.dispatchEvent(new Event('resize'));visualViewport.dispatchEvent(new Event('scroll'));}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));o.disconnect();return mutations;});
 ok('unchanged viewport events do not repeatedly rewrite viewer geometry',changes===0);
 await page.locator('[data-preview-close]').tap();
 ok('saved editor opens and closes photo',await page.locator('[aria-label="核對 CTN"]').first().inputValue()==='AB62CDE');
 // Safari can leave focus on an input when a toolbar button is activated.
 await page.locator('[aria-label="核對 CTN"]').first().fill('AB72CDE');
 await page.evaluate(()=>{window.__previewViewport={height:350,width:402,offsetTop:120,offsetLeft:0};for(const key of Object.keys(window.__previewViewport))Object.defineProperty(visualViewport,key,{configurable:true,get:()=>window.__previewViewport[key]});document.querySelector('#iqc31ReviewEditor [data-preview-photo]').click();});
 await page.locator('#iqc31PhotoPreview img').waitFor();
 ok('opening from focused input dismisses editing without forcing focus to a modal',await page.evaluate(()=>!document.activeElement.matches('input,textarea,select')&&document.querySelector('#iqc31PhotoPreview').getAttribute('role')==='region'));
 ok('photo and close button fit the reduced keyboard viewport',await fits());
 await page.evaluate(()=>{window.__previewViewport.height=874;window.__previewViewport.offsetTop=0;visualViewport.dispatchEvent(new Event('resize'));});
 await page.waitForTimeout(100);
 ok('viewer follows keyboard dismissal without scrolling or losing the form',await fits());
 await page.locator('[data-preview-close]').tap();
 ok('unsaved CTN text remains in the same editor after viewing',await page.locator('[aria-label="核對 CTN"]').first().inputValue()==='AB72CDE'&&JSON.stringify((await dbPhotos(page))[5].rc31Review)===JSON.stringify(saved.rc31Review));
 await page.evaluate(()=>{for(const key of Object.keys(window.__previewViewport))delete visualViewport[key];});
 await context.setOffline(true);
 await page.locator('#iqc31ReviewEditor [data-preview-photo]').tap();await page.locator('#iqc31PhotoPreview img').waitFor();
 ok('photo opens offline without any OCR or backend request',await fits());
 await page.setViewportSize({width:874,height:402});await page.waitForTimeout(100);
 ok('landscape photo keeps its close button visible',await fits());
 await page.keyboard.press('Escape');await context.setOffline(false);await page.setViewportSize({width:402,height:874});
 // A malformed image must have a bounded error state, never an invisible trap.
 await page.evaluate(()=>{window.__previewRead=window.__DS_IQC_RC31.readPhoto;window.__DS_IQC_RC31.readPhoto=async()=>({seq:6,blob:new Blob(['invalid jpeg'],{type:'image/jpeg'})});});
 await page.locator('#iqc31ReviewEditor [data-preview-photo]').tap();
 await page.waitForFunction(()=>document.querySelector('#iqc31PhotoPreview [role="status"]')?.textContent.includes('無法顯示'));
 ok('decode failure explains recovery and leaves close available',await page.locator('[data-preview-close]').isVisible());
 await page.locator('[data-preview-close]').tap();
 // Close while IDB is delayed, then resolve the old request after a new preview.
 await page.evaluate(()=>{window.__DS_IQC_RC31.readPhoto=id=>new Promise(resolve=>window.__releasePreviewRead=()=>window.__previewRead(id).then(resolve));});
 await page.locator('#iqc31ReviewEditor [data-preview-photo]').tap();await page.locator('[data-preview-close]').tap();
 ok('pending read can be closed immediately',await page.locator('#iqc31PhotoPreview').count()===0);
 await page.evaluate(()=>{window.__DS_IQC_RC31.readPhoto=window.__previewRead;});
 await page.locator('#iqc31ReviewEditor [data-preview-photo]').tap();await page.locator('#iqc31PhotoPreview img').waitFor();
 await page.evaluate(()=>window.__releasePreviewRead());
 ok('late read cannot replace or duplicate the current viewer',await page.locator('#iqc31PhotoPreview img').count()===1&&await fits());
 await page.locator('[data-preview-close]').tap();
 await page.evaluate(()=>{window.__DS_IQC_RC31.readPhoto=()=>new Promise(()=>{});});
 await page.locator('#iqc31ReviewEditor [data-preview-photo]').tap();
 await page.waitForFunction(()=>document.querySelector('#iqc31PhotoPreview [role="status"]')?.textContent.includes('逾時'),null,{timeout:18000});
 ok('stalled photo read times out with a working close button',await page.locator('[data-preview-close]').isVisible());
 await page.locator('#iqcRcClose').tap();
 ok('main close remains tappable while photo reading has failed',await page.locator('#iqcImageRc').isHidden()&&await page.locator('#iqc31PhotoPreview').count()===0);
 await page.locator('#iqcImageRcTool').click();await idle();
 await page.locator('[data-review-quality="'+selected.id+'"]').tap();
 await page.locator('#iqc31ReviewEditor [data-preview-photo]').tap();
 await page.locator('#iqcRcClose').tap();
 ok('main close works before a stalled photo read completes',await page.locator('#iqcImageRc').isHidden()&&await page.locator('#iqc31PhotoPreview').count()===0);
 await page.locator('#iqcImageRcTool').click();await idle();
 await page.locator('[data-review-quality="'+selected.id+'"]').tap();
 await page.locator('[aria-label="核對 CTN"]').first().fill('AB72CDE');
 await page.locator('#iqc31ReviewEditor [data-preview-photo]').tap();
 await page.locator('[data-preview-close]').tap();await page.evaluate(()=>{window.__DS_IQC_RC31.readPhoto=window.__previewRead;});
 for(let i=0;i<5;i++){await page.locator('#iqc31ReviewEditor [data-preview-photo]').tap();await page.locator('#iqc31PhotoPreview img').waitFor();await page.locator('[data-preview-close]').tap();}
 ok('repeated open and close retains form, saved correction and original image',await page.locator('[aria-label="核對 CTN"]').first().inputValue()==='AB72CDE'&&await imageHash()===beforeHash);
 // Gallery entry must use the same non-blocking flow, even with a live editor.
 await page.locator('.iqc-photo [data-preview-photo]').first().tap();await page.locator('#iqc31PhotoPreview img').waitFor();
 ok('gallery opens inline within the photo list and keeps main close usable',await page.evaluate(()=>document.getElementById('iqc31PhotoPreview').parentElement.id==='iqcRcPhotoList'));
 await page.locator('#iqcRcClose').tap();
 ok('main close removes an already loaded photo without blocking',await page.locator('#iqcImageRc').isHidden()&&await page.locator('#iqc31PhotoPreview').count()===0);
 await page.locator('#iqcImageRcTool').click();await idle();
 await page.locator('[data-review-quality="'+selected.id+'"]').tap();
 await page.locator('#iqc31ReviewEditor [data-preview-photo]').tap();await page.locator('#iqc31PhotoPreview img').waitFor();
 const closedBefore=await page.evaluate(()=>__DS_IQC_RC31.diagnostics().events.filter(e=>e.stage==='photo_preview'&&e.outcome==='closed').length);
 await page.locator('[data-review-close]').tap();
 await page.waitForFunction(n=>__DS_IQC_RC31.diagnostics().events.filter(e=>e.stage==='photo_preview'&&e.outcome==='closed').length>n,closedBefore);
 ok('closing the editor also releases its embedded photo',await page.locator('#iqc31PhotoPreview').count()===0);
 await page.reload();await page.locator('#appShell').waitFor({state:'visible'});await page.locator('#navMore').click();await page.locator('#iqcImageRcTool').click();await idle();
 await page.locator('[data-review-quality="'+selected.id+'"]').tap();
 ok('reload preserves the saved correction and original OCR, not an unsaved draft',await page.locator('[aria-label="核對 CTN"]').first().inputValue()==='AB62CDE'&&(await dbPhotos(page))[5].ocrText===saved.ocrText);
 const events=(await page.evaluate(()=>window.__DS_IQC_RC31.diagnostics())).events.filter(e=>e.stage==='photo_preview');
 ok('diagnostics distinguish decode error, timeout and ready without recording CTNs',events.some(e=>e.code==='PHOTO_PREVIEW_DECODE')&&events.some(e=>e.code==='PHOTO_PREVIEW_TIMEOUT')&&events.some(e=>e.outcome==='ready')&&!/AB12CDE|AB62CDE|blob:/.test(JSON.stringify(events)));
 ok('uncertain corrected CTN is yellow in result and editor',await page.locator('[data-result-ctn="AB62CDE"]').evaluate(e=>getComputedStyle(e).backgroundColor==='rgb(255, 228, 154)')&&await page.locator('[data-review-key="AB12CDE"]').evaluate(e=>e.parentElement.classList.contains('iqc31-uncertain')));
 await page.locator('[data-review-close]').tap();
 await page.locator('[data-result-ctn="AB62CDE"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifacts,'ctn-tools.png')});
 await page.locator('[data-ctn-select="AB62CDE"]').tap();await page.locator('[data-ctn-select="AB62CDE"]').locator('xpath=ancestor::*[@data-ctn-group]').locator('[data-ctn-remove-selected]').tap();await idle();
 ok('removing corrected CTN updates results and preserves original OCR and photo',await page.locator('[data-result-ctn="AB62CDE"]').count()===0&&await imageHash()===beforeHash&&(await dbPhotos(page))[5].ocrText===saved.ocrText);
 await page.locator('#iqc31Excluded summary').tap();await page.locator('[data-ctn-restore="AB62CDE"]').tap();await idle();
 ok('undo restores the corrected value in its original position',await page.locator('[data-result-ctn="AB62CDE"]').count()===1&&(await dbPhotos(page))[5].rc31Review.ctns.AB12CDE.ctn==='AB62CDE');
 await page.locator('[data-ctn-select="AB12CDE"]').tap();await page.locator('[data-ctn-select="AB12CDE"]').locator('xpath=ancestor::*[@data-ctn-group]').locator('[data-ctn-remove-selected]').tap();await idle();
 const removedPhotos=await dbPhotos(page);
 ok('one removal excludes every deduplicated occurrence in the batch',removedPhotos.filter(p=>p.rc31Review?.excluded?.AB12CDE).length===6&&await page.locator('[data-result-ctn="AB12CDE"]').count()===0);
 const submitCtns=await page.evaluate(async()=>IqcSubmitModel31.draft({batch:{id:'test',status:'DRAFT',regionCode:'TEST_REGION'},photos:await __DS_IQC_RC31.readPhotos()}).items.map(i=>i.ctn));
 ok('removed CTN is absent from the real current-batch draft',!submitCtns.includes('AB12CDE')&&submitCtns.includes('AB62CDE')&&submitCtns.includes('FG34HIJ'));
 await page.reload();await page.locator('#appShell').waitFor({state:'visible'});await page.locator('#navMore').click();await page.locator('#iqcImageRcTool').click();await idle();
 ok('removed candidates stay excluded after reload',await page.locator('[data-result-ctn="AB12CDE"]').count()===0&&(await dbPhotos(page)).filter(p=>p.rc31Review?.excluded?.AB12CDE).length===6);
 await page.locator('#iqc31Excluded summary').tap();await page.locator('[data-ctn-restore="AB12CDE"]').tap();await idle();
 ok('restoring duplicate CTN restores all sources and still displays it only once',await page.locator('[data-result-ctn="AB12CDE"]').count()===1&&(await dbPhotos(page)).every(p=>!p.rc31Review?.excluded?.AB12CDE));
 // Six candidates make column direction and multi-selection visible in a small viewport.
 await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('ds_iqc_image_rc_v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('photos','readwrite'),store=tx.objectStore('photos'),q=store.index('batchId').getAll(localStorage.getItem('ds_iqc_image_rc_active_batch'));q.onsuccess=()=>{const p=q.result.sort((a,b)=>a.seq-b.seq)[0];p.ocrText+='\nKL56MNP\nQR78STU\nUV90WXY';p.updatedAt=new Date().toISOString();store.put(p);};tx.oncomplete=()=>{db.close();resolve();};};}));
 await page.evaluate(()=>__DS_IQC_RC31.refresh());await idle();
 const group=page.locator('[data-ctn-group]').filter({has:page.locator('[data-ctn-select="AB12CDE"]')}),remove=group.locator('[data-ctn-remove-selected]');
 ok('one shared remove button per group, no repeated per-CTN buttons',await page.locator('[data-ctn-remove]').count()===0&&await group.locator('[data-ctn-remove-selected]').count()===1&&await remove.isDisabled());
 for(const width of [402,375,320]){
  await page.setViewportSize({width,height:874});
  ok('numbered two-column tiles fill left top-to-bottom before right at '+width+'px',await group.evaluate(g=>{const nodes=[...g.querySelectorAll('[data-result-ctn]')],boxes=nodes.map(n=>n.getBoundingClientRect()),n=Math.ceil(boxes.length/2),bound=g.getBoundingClientRect();return boxes.length===6&&nodes.every((node,i)=>node.querySelector('.iqc31-row-number').textContent===(i+1)+'.')&&boxes.every((b,i)=>b.left>=bound.left&&b.right<=bound.right&&Math.abs(b.left-boxes[i<n?0:n].left)<1)&&(boxes[1].top>boxes[0].top)&&Math.abs(boxes[0].top-boxes[n].top)<1&&boxes[n].left>boxes[0].right&&nodes.every(node=>node.querySelector('strong').getBoundingClientRect().right<=node.getBoundingClientRect().right); }));
 }
 await page.setViewportSize({width:402,height:874});
 ok('shared remove is below count on the group upper-right',await group.evaluate(g=>{const b=g.querySelector('[data-ctn-remove-selected]').getBoundingClientRect(),badge=g.querySelector('.iqc-rc-status').getBoundingClientRect(),tile=g.querySelector('[data-ctn-select]').getBoundingClientRect();return b.top>=badge.bottom&&Math.abs(b.right-badge.right)<1&&b.bottom<tile.top;}));
 ok('result DOM sequence still equals photo-based model sequence',await page.evaluate(()=>JSON.stringify([...document.querySelectorAll('[data-result-ctn]')].map(e=>e.dataset.resultCtn))===JSON.stringify(IqcReviewModel31.presentation(__DS_IQC_REVIEW31.getModel()).groups.flatMap(g=>g.displayCtns))));
 await page.locator('[data-ctn-select="AB62CDE"]').tap();
 ok('selected uncertain tile keeps yellow and exposes selection',await page.locator('[data-ctn-select="AB62CDE"]').evaluate(e=>e.getAttribute('aria-pressed')==='true'&&getComputedStyle(e).backgroundColor==='rgb(255, 228, 154)')&&await remove.textContent()==='移除所選（1）');
 await page.locator('[data-ctn-select="AB62CDE"]').tap();ok('tap again cancels selection and disables empty removal',await remove.isDisabled());
 await page.locator('[data-ctn-select="AB12CDE"]').tap();await page.locator('[data-ctn-select="FG34HIJ"]').tap();
 ok('multiple selections share the same action with a count',await remove.textContent()==='移除所選（2）');
 await group.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifacts,'ctn-grid-selected.png')});
 const beforeBulk=JSON.stringify(await dbPhotos(page));
 await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;let writes=0;window.__restorePut=()=>IDBObjectStore.prototype.put=original;IDBObjectStore.prototype.put=function(v,...args){if(this.name==='photos'&&v.rc31Review?.excluded?.FG34HIJ&&++writes===2)throw new DOMException('Synthetic quota failure','QuotaExceededError');return original.call(this,v,...args);};});
 await remove.tap();await idle();await page.waitForFunction(()=>document.querySelector('#iqc31SaveNotice')&&!document.querySelector('#iqc31SaveNotice').hidden);
 await page.evaluate(()=>window.__restorePut());
 ok('mid-write failure rolls back every selected CTN and preserves retry selection',JSON.stringify(await dbPhotos(page))===beforeBulk&&await group.locator('[aria-pressed="true"]').count()===2&&!(await remove.isDisabled())&&!/已移除/.test(await page.locator('#iqc31SaveNotice').textContent()));
 await remove.tap();await idle();
 const bulkPhotos=await dbPhotos(page);
 ok('one click removes both CTNs across all sources with one history entry per photo',bulkPhotos.every((p,i)=>p.rc31Review.history.length===JSON.parse(beforeBulk)[i].rc31Review.history.length+1)&&await page.locator('[data-result-ctn="AB12CDE"],[data-result-ctn="FG34HIJ"]').count()===0&&await imageHash()===beforeHash);
 await page.locator('#iqc31Excluded summary').tap();await page.locator('[data-ctn-restore="AB12CDE"]').tap();await idle();await page.locator('#iqc31Excluded summary').tap();await page.locator('[data-ctn-restore="FG34HIJ"]').tap();await idle();
 ok('both removed CTNs can be restored with six ordered candidates',await page.locator('[data-result-ctn]').count()===6&&(await dbPhotos(page)).every(p=>!p.rc31Review?.excluded?.AB12CDE&&!p.rc31Review?.excluded?.FG34HIJ));
 await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('ds_iqc_image_rc_v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('batches','readwrite'),s=tx.objectStore('batches'),q=s.get(localStorage.getItem('ds_iqc_image_rc_active_batch'));q.onsuccess=()=>s.put({...q.result,status:'PENDING'});tx.oncomplete=()=>{db.close();resolve();};};}));
 await page.evaluate(()=>__DS_IQC_RC31.refresh());await idle();
 ok('pending upload disables removal and storage rejects direct mutation',await page.locator('[data-ctn-remove-selected]').first().isDisabled()&&await page.locator('[data-ctn-select]').first().isDisabled()&&await page.evaluate(()=>__DS_IQC_RC31.excludeCtn('AB12CDE').then(()=>false,()=>true))&&(await dbPhotos(page)).every(p=>!p.rc31Review?.excluded?.AB12CDE));
 ok('preview and correction tests do not write business data or upload photos',business===0&&cloudPhotos===0);
 ok('no uncaught errors',errors.length===0);
 fs.writeFileSync(path.join(artifacts,'preview-summary.json'),JSON.stringify({checks,errors,business,cloudPhotos,viewportMutations:changes,events},null,2));
 console.log('TOTAL '+checks);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

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
     const receipt=receipts.get(p.submissionId)||{receiptId:crypto.randomUUID(),submissionId:p.submissionId,payloadHash:crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex'),account,station:'IQC',sheetName:'IQC_Log',startRow:2,endRow:p.items.length+1,rowCount:p.items.length,writtenAt:'2026-09-27 16:30:00',environment:env};receipts.set(p.submissionId,receipt);
     if(mode==='lose')return route.abort();result.receipt=receipt;
    }else if(body.api==='iqc_image_status'){result.receipt=receipts.get(body.submissionId)||null;result.found=!!result.receipt;}else throw Error('unexpected route');
   }else if(['workstation_login','workstation_bootstrap','portal_profile'].includes(body.api))result={ok:true,sessionToken:'FIXTURE',user:{account,displayName:'測試人員',role:'ADMIN'},permissions:{home_enabled:true,iqc_image_enabled:allowed,daily_report_enabled:false}};
   return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
  });
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto(origin+'/ds-app/');await page.locator('#loginAccount').fill('TEST');await page.locator('#loginPassword').fill('fixture');await page.locator('#loginBtn').click();await page.locator('#appShell').waitFor({state:'visible'});await page.locator('#navMore').click();
  ok('ADMIN without independent permission has no image entry',await page.getByText('IQC 影像辨識',{exact:true}).count()===0);
  const direct=await ctx.newPage();await direct.goto(origin+'/DS-IQC-IMAGE/');ok('direct access cannot initialize image data',await direct.locator('#entryMessage').isVisible()&&await direct.locator('#iqcImageRc').count()===0);await direct.close();
  allowed=true;await page.reload();await page.locator('#appShell').waitFor({state:'visible'});await page.locator('#navMore').click();await page.getByText('IQC 影像辨識',{exact:true}).click();
  let frame=await page.locator('iframe[data-module-key="iqcImage"]').elementHandle().then(x=>x.contentFrame());await frame.locator('#iqcRcRegion option[value="B3"]').waitFor({state:'attached'});const idle=()=>frame.waitForFunction(()=>!__DS_IQC_RC31.isBusy());await idle();
  ok('independent permission opens image without daily permission',await frame.locator('#iqcImageRc').isVisible());
  ok('production title and one start button',/V1\.0/.test(await frame.locator('.iqc-rc-top h2').textContent())&&await frame.getByRole('button',{name:'開始辨識',exact:true}).count()===1);
  const key=await frame.evaluate(()=>IqcProduction.key('ds_iqc_image_rc_active_batch'));
  const snap=()=>frame.evaluate(()=>IqcSubmitStore31.snapshot(localStorage.getItem(IqcProduction.key('ds_iqc_image_rc_active_batch'))));
  const batch=(await snap()).batch.id;
  await frame.locator('#iqcRcRegion').selectOption('B3');await frame.waitForTimeout(120);
  await frame.evaluate(()=>{IqcOcrEngine31.Engine.prototype.ensure=async()=>{};IqcOcrEngine31.Engine.prototype.recognize=async()=>({data:{text:'113353 CYLINDER OCYL 7209 TOTAL 2\nAB12CDE\nFG34HIJ',confidence:98}});});
  const png=await frame.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=500;c.getContext('2d').fillRect(0,0,400,500);return c.toDataURL('image/png').split(',')[1];});
  await frame.locator('#iqcRcGalleryInput').setInputFiles(Array(3).fill({name:'local-fixture.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')}));await idle();
  await frame.getByRole('button',{name:'開始辨識',exact:true}).tap();await idle();
  ok('one tap processes three photos in the production account database',(await snap()).photos.length===3&&(await snap()).photos.every(p=>p.status==='RECOGNIZED'));

  await frame.locator('#iqcRcCommit').tap();await frame.locator('#iqc31SubmitPreview table').waitFor();await idle();
  ok('preview has exact two rows with formal destination',await frame.locator('#iqc31SubmitPreview tbody tr').count()===2&&/正式 IQC/.test(await frame.locator('#iqc31SubmitPreview').textContent()));
  ok('preview requires unchecked human confirmation',await frame.locator('#iqc31SubmitAccept').isDisabled());
  await page.screenshot({path:path.join(out,'production-preview.png')});
  mode='lose';await frame.locator('#iqc31SubmitConfirm').check();await frame.locator('#iqc31SubmitAccept').tap();await idle();
  // The accepted flow may immediately recover the receipt, or retain SENT_UNKNOWN until retry.
  mode='success';if((await snap()).submissions[0]?.status!=='SYNCED'){await frame.locator('#iqcRcSyncPending').tap();await idle();}
  await frame.waitForFunction(async()=>{const s=await IqcSubmitStore31.snapshot(localStorage.getItem(IqcProduction.key('ds_iqc_image_rc_active_batch')));return s.submissions[0]?.status==='SYNCED';});
  ok('lost response resolves to permanent receipt without duplicate write',submits===1&&receipts.size===1&&(await snap()).batch.status==='SYNCED');
  ok('request contains no photos or client identity',posts.filter(x=>x.api==='iqc_image_submit').every(x=>!JSON.stringify(x).includes('base64')&&!x.payload.operator&&!x.payload.date));
  await frame.locator('#iqc31History').click();await idle();
  ok('confirmed production batch appears in history',(await snap()).batch.id===batch&&/已入帳/.test(await frame.locator('#iqc31BatchSelect').textContent()));
  await page.screenshot({path:path.join(out,'production-history.png')});
  ok('RC storage is not used',await frame.evaluate(()=>localStorage.getItem('ds_iqc_image_rc_active_batch')===null));
  // Reload with a different account must select a separate database and active batch.
  account='OTHER';await page.reload();await page.locator('#appShell').waitFor({state:'visible'});await page.locator('#navMore').click();await page.getByText('IQC 影像辨識',{exact:true}).click();frame=await page.locator('iframe[data-module-key="iqcImage"]').elementHandle().then(x=>x.contentFrame());await frame.locator('#iqcImageRc').waitFor();await idle();
  ok('other account cannot see prior account batches',await frame.evaluate(async()=>{const x=await __DS_IQC_RC31.listBatches();return x.length===1&&x[0].status==='DRAFT';}));
  ok('other account has distinct active key',await frame.evaluate(()=>IqcProduction.key('ds_iqc_image_rc_active_batch'))!==key);
  allowed=false;await page.evaluate(()=>DS_PORTAL_BRIDGE.reauthenticate());await page.waitForFunction(()=>!document.querySelector('iframe[data-module-key="iqcImage"]'));
  ok('revoked permission removes existing image frame',await page.locator('iframe[data-module-key="iqcImage"]').count()===0);
  ok('no page runtime errors',errors.length===0);
  console.log(JSON.stringify({checks,submits,screenshots:out}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

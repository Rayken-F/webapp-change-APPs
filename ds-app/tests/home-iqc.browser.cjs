// Isolated synthetic data only. All non-loopback requests are blocked.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..'),out=process.env.DS_LAYOUT_OUTPUT||process.cwd();
const results=[],errors=[];let homeDelay=1800,homeFail=false,regionFail=false,regionDelay=0,homeCalls=0,regionCalls=0,submissions=[];
const fixturePriority={priorityId:'QA-P1',rtNo:'123456',demandQty:18,demandSource:'MRP',plantCode:'7209',status:'緊急',description:'QA X40S',capacity:'X40S',unit:'支'};
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');let raw='';for await(const c of req)raw+=c;
 if(u.pathname==='/fixture-api'){
  const b=JSON.parse(raw||'{}'),api=u.searchParams.get('api')||b.api;let data={ok:true,items:[]};
  if(['workstation_login','workstation_bootstrap'].includes(api))data={ok:true,sessionToken:'fixture-only',user:{account:'FIXTURE',displayName:'本機測試',role:'ADMIN'},permissions:{home_enabled:true,daily_report_enabled:true,production_priority_edit_enabled:true}};
  else if(['workstation_home_data','portal_home_data'].includes(api)){homeCalls++;await new Promise(r=>setTimeout(r,homeDelay));data=homeFail?{ok:false,message:'fixture failure'}:{ok:true,priorities:[fixturePriority],rtMaster:[fixturePriority]};}
  else if(api==='iqc_regions'){regionCalls++;await new Promise(r=>setTimeout(r,regionDelay));data=regionFail?{ok:false,message:'fixture region failure'}:{ok:true,regions:[{code:'QA',label:'Test area',applicableType:'全部',sort:1}]};}
  else if(api==='iqc_rt_master')data={ok:true,bundle:[{rtNo:'234567',description:'12X40S'}],loose:[{rtNo:'123456',description:'X40S'}]};
  else if(api==='iqc_ctn_check')data={ok:true,duplicates:[],duplicateDetails:[],frameCardConflicts:[],capacityConflicts:[]};
  else if(req.method==='POST'&&!api){submissions.push(b);data={ok:true,receipt:{receiptId:'LOCAL-'+submissions.length,sheetName:'IQC_Log',startRow:2,endRow:2}};}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;
 }
 let rel=decodeURIComponent(u.pathname).slice(1);if(!rel||rel.endsWith('/'))rel+='index.html';const file=path.resolve(root,rel);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 let body=fs.readFileSync(file);
 if(rel==='ds-report-pwa/index.html'&&process.env.DS_DAILY_BASELINE)body=fs.readFileSync(process.env.DS_DAILY_BASELINE);
 if(['ds-app/config.js','ds-report-pwa/api.js'].includes(rel))body=body.toString().replace(/https:\/\/script\.google\.com\/macros\/s\/[^"']+\/exec/g,'http://127.0.0.1:8776/fixture-api');
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html;charset=utf-8':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(body);
});
function check(name,pass,detail){results.push({name,pass:!!pass,...(detail?{detail}: {})});console.log((pass?'PASS ':'FAIL ')+name);}
(async()=>{
 await new Promise(r=>server.listen(8776,'127.0.0.1',r));
 const browser=await(process.env.DS_WEBKIT?webkit:chromium).launch({headless:true,...(!process.env.DS_WEBKIT&&process.env.DS_BROWSER_EXECUTABLE?{executablePath:process.env.DS_BROWSER_EXECUTABLE}:{})});
 try{
  const context=await browser.newContext({viewport:{width:402,height:874},isMobile:!!process.env.DS_WEBKIT,hasTouch:!!process.env.DS_WEBKIT,serviceWorkers:'block'});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto('http://127.0.0.1:8776/ds-app/');await page.locator('#loginAccount').fill('FIXTURE');await page.locator('#loginPassword').fill('fixture');await page.locator('#loginBtn').click();await page.locator('#appShell').waitFor({state:'visible'});
  check('home loading is not a false empty list',(await page.locator('#priorityList').innerText()).includes('讀取'));
  await page.waitForFunction(()=>window.__DS_PROD_ENH_R5__);
  const geometry=await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:812});window.__DS_PROD_ENH_R5__.syncNavGeometry();const n=document.querySelector('.bottom-nav').getBoundingClientRect();return{bottom:n.bottom,body:document.body.getBoundingClientRect().bottom,viewport:innerHeight};});
  check('short home and stale visual viewport keep nav at full screen bottom',geometry.bottom>=858&&geometry.bottom<=874&&geometry.body>=874,geometry);
  await page.evaluate(()=>{delete visualViewport.height;window.__DS_PROD_ENH_R5__.syncNavGeometry();});
  await page.locator('.priority-card').waitFor();check('home fresh data renders',await page.locator('.priority-card').count()===1);
  homeDelay=50;homeFail=true;await page.locator('#refreshPriorityBtn').click();await page.waitForFunction(()=>document.querySelector('#homeLoadStatus').textContent.includes('失敗'));
  check('failed refresh keeps prior data and gives retry message',await page.locator('.priority-card').count()===1);homeFail=false;
  await page.locator('#refreshPriorityBtn').click();await page.waitForFunction(()=>document.querySelector('#homeLoadStatus').textContent==='');
  check('home refresh recovers',homeCalls===3);
  await page.locator('#navDaily').click();let daily=page.frames().find(f=>f.url().includes('/ds-report-pwa/'));
  if(!daily){await page.frameLocator('iframe[data-module-key="daily"]').locator('#date').waitFor();daily=page.frames().find(f=>f.url().includes('/ds-report-pwa/'));}
  const enter=async()=>{await daily.locator('#date').fill('2026-09-19');await daily.locator('input[name="site"][value="IQC"]').check();await daily.getByRole('button',{name:'下一步',exact:true}).click();await daily.locator('#pageIQC.active').waitFor();};
  const preview=()=>daily.locator('#pageIQC').getByRole('button',{name:'預覽',exact:true}).click();
  const fillBundle=async(ctn='AB12CD3')=>{await daily.locator('input[name="iqc_type_0"][value="集束"]').check();await daily.locator('.iqc-region-code').selectOption('QA');await daily.locator('.iqc-bundle-rt').fill('234567');await daily.locator('.iqc-bundle-ctn').fill(ctn);await daily.locator('.iqc-bundle-frame-id').fill('TEST-FRAME');await daily.locator('.iqc-bundle-status').fill('OCYL');await daily.locator('.iqc-bundle-status').blur();};
  await enter();await fillBundle();await daily.locator('.iqc-bundle-status').fill('');await preview();
  check('invalid IQC remains blocked with explanation',(await daily.locator('#iqc-error').innerText()).includes('集束狀態')&&await daily.locator('#pageIQC.active').count()===1);
  await daily.locator('#pageIQC').getByRole('button',{name:'返回',exact:true}).click();await enter();await daily.locator('.iqc-bundle-status').fill('OCYL');await preview();
  const recovered=await daily.locator('#page7.active').count()===1;check('error then return then correct can preview',recovered);
  if(!recovered&&process.env.DS_DAILY_BASELINE){await daily.evaluate(()=>document.querySelectorAll('[data-has-visible-error]').forEach(e=>e.removeAttribute('data-has-visible-error')));await preview();}
  for(let i=0;i<3;i++){
   await daily.locator('#page7').getByRole('button',{name:'返回',exact:true}).click();await daily.locator('.iqc-bundle-frame-id').fill('TEST-'+i);await daily.locator('.iqc-bundle-frame-id').blur();await preview();check('preview back edit loop '+i,await daily.locator('#page7.active').count()===1);
  }
  await daily.locator('#page7').getByRole('button',{name:'返回',exact:true}).click();await page.locator('#navHome').click();await page.locator('#navDaily').click();await preview();check('module switch retains valid IQC preview',await daily.locator('#page7.active').count()===1);
  await daily.locator('#page7').getByRole('button',{name:'返回',exact:true}).click();
  await daily.evaluate(()=>{const hidden=document.querySelector('#pageProject .form-card');hidden.classList.add('error-card');hidden.setAttribute('data-has-visible-error','true');});await preview();
  const hiddenPass=await daily.locator('#page7.active').count()===1;check('hidden station error cannot block valid IQC',hiddenPass);
  if(!hiddenPass&&process.env.DS_DAILY_BASELINE){await daily.evaluate(()=>document.querySelectorAll('[data-has-visible-error]').forEach(e=>e.removeAttribute('data-has-visible-error')));await preview();}
  // Exercise the real success/reset/reload path, with POST confined to this fixture.
  await daily.locator('#page7').getByRole('button',{name:'送出',exact:true}).click();
  await daily.locator('#loadingBox').filter({hasText:'送出成功'}).waitFor();await daily.waitForLoadState('load');
  await daily.locator('#page1.active').waitFor();await page.waitForTimeout(2600);
  daily=page.frames().find(f=>f.url().includes('/ds-report-pwa/'));await enter();await fillBundle('AB12CD4');await preview();
  check('next record after successful submit can preview',submissions.length===1&&await daily.locator('#page7.active').count()===1);
  await daily.locator('#page7').getByRole('button',{name:'返回',exact:true}).click();
  const before=await daily.locator('.iqc-bundle-ctn').inputValue(),countBefore=regionCalls;regionDelay=200;
  await daily.evaluate(()=>{loadIqcRegions();loadIqcRegions();});await daily.locator('.iqc-bundle-frame-id').fill('EDIT-DURING-REFRESH');await page.waitForTimeout(350);
  check('master refresh preserves current entries',await daily.locator('.iqc-bundle-ctn').inputValue()===before&&await daily.locator('.iqc-bundle-frame-id').inputValue()==='EDIT-DURING-REFRESH');
  check('concurrent master refresh sends one request',regionCalls-countBefore===1);
  await preview();check('preview works after master refresh',await daily.locator('#page7.active').count()===1);
  await daily.locator('#page7').getByRole('button',{name:'返回',exact:true}).click();
  await daily.locator('.iqc-bundle-rt').fill('123456');await preview();
  check('wrong RT type still blocks preview',(await daily.locator('#iqc-error').innerText()).includes('散支')&&await daily.locator('#pageIQC.active').count()===1);
  await daily.locator('.iqc-bundle-rt').fill('234567');await daily.locator('#iqc_card_count').fill('2');await daily.locator('#iqc_card_count').press('Tab');await preview();
  await page.waitForTimeout(220);
  check('invalid later card is selected with visible message',(await daily.locator('#iqc-error').innerText()).includes('第2筆')&&await daily.locator('#iqc-card-1.iqc-card-active').count()===1);
  if(!process.env.DS_DAILY_BASELINE){
   // Simulate a new device with no LKG master, then recover via the real retry UI.
   await daily.evaluate(()=>{localStorage.removeItem(DS_IQC_REGION_LKG_KEY);iqcRegionsLoaded=false;iqcRegionOptions=[];});regionFail=true;
   await daily.locator('input[name="iqc_type_1"][value="集束"]').check();await daily.evaluate(()=>loadIqcRegions());await preview();
   check('master failure offers retry',await daily.locator('#iqc-master-retry').isVisible());regionFail=false;
   await daily.locator('#iqc-master-retry').click();await daily.locator('#iqc-master-retry').waitFor({state:'hidden'});
   check('master retry preserves original first card',await daily.locator('.iqc-bundle-ctn').first().inputValue()===before);
  }
  check('no uncaught JavaScript exceptions',errors.length===0,errors);
  await page.screenshot({path:path.join(out,(process.env.DS_DAILY_BASELINE?'baseline':'candidate')+(process.env.DS_WEBKIT?'-webkit':'-edge')+'-iqc.png')});
 }finally{await browser.close();server.close();fs.writeFileSync(path.join(out,(process.env.DS_DAILY_BASELINE?'baseline':'candidate')+(process.env.DS_WEBKIT?'-webkit':'-edge')+'-home-iqc.json'),JSON.stringify(results,null,2));}
 if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

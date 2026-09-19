// Isolated fixture: no real accounts, CTN records, or network writes.
const fs=require('fs'),path=require('path'),http=require('http'),vm=require('vm');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..'),out=process.env.DS_LAYOUT_OUTPUT||process.cwd(),baseline=process.env.DS_K7_BASELINE;
const html=fs.readFileSync(path.join(root,'DS-OQC-SHIPPING/index.html'),'utf8'),ctx=vm.createContext({});
vm.runInContext([...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).find(x=>x.includes('const VERSION=')),ctx);
vm.runInContext(fs.readFileSync(path.join(root,'DS-OQC-SHIPPING/domain-h2-g1.js'),'utf8'),ctx);const D=ctx.OqcDomain;
const docs={},requests=[],errors=[],results=[];let releaseHome,homeReceived=false;
const homeReady=new Promise(r=>releaseHome=r);
const server=http.createServer((req,res)=>{let rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);if(rel.endsWith('/'))rel+='index.html';const p=path.resolve(root,rel);if(!p.startsWith(root+path.sep)||!fs.existsSync(p)){res.writeHead(404);return res.end();}let data=fs.readFileSync(p);if(baseline){const map={'ds-app/production-enhancements.css':'baseline-enhancements.css','ds-app/production-enhancements.js':'baseline-enhancements.js','DS-OQC-SHIPPING/history-h1.js':'baseline-history.js'};if(map[rel])data=fs.readFileSync(path.join(baseline,map[rel]));}res.setHeader('Content-Type',p.endsWith('.html')?'text/html;charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'application/octet-stream');res.end(data);});
const check=(name,pass,detail)=>{results.push({name,pass:!!pass,detail});console.log((pass?'PASS ':'FAIL ')+name);};
(async()=>{await new Promise(r=>server.listen(8778,'127.0.0.1',r));const browser=await(process.env.DS_WEBKIT?webkit:chromium).launch({headless:true,...(!process.env.DS_WEBKIT&&process.env.DS_BROWSER_EXECUTABLE?{executablePath:process.env.DS_BROWSER_EXECUTABLE}:{})});try{
 const context=await browser.newContext({viewport:{width:402,height:874},isMobile:!!process.env.DS_WEBKIT,hasTouch:!!process.env.DS_WEBKIT,serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.hostname==='127.0.0.1')return route.continue();if(url.hostname!=='script.google.com'||req.method()!=='POST')return route.abort();const b=req.postDataJSON();requests.push(b.api);let data;
 if(b.api==='workstation_login'||b.api==='workstation_bootstrap')data={ok:true,sessionToken:'fixture-only',user:{account:'FIXTURE',displayName:'測試',role:'ADMIN'},permissions:{home_enabled:true,daily_report_enabled:true,stamp_shipping_enabled:true}};
 else if(b.api==='workstation_home_data'){homeReceived=true;await homeReady;data={ok:true,priorities:[],rtMaster:[]};}
 else {data={ok:true,environment:D.VERSION};if(['health','profile'].includes(b.api))Object.assign(data,{productionEnabled:true,productionBuild:'OQC-PROD-20260918-01',backendVersion:'0.2.3',rtMasterPatch:D.RT_PATCH,batchRemovalPatch:'RM1-20260916',rtGatePatch:'RT-G1-20260916',actor:'測試'});
 else if(b.api==='batches')data.docs=Object.values(docs);
 else if(b.api==='batch_sync'){let doc=docs[b.batchId]||null;for(const c of b.operations)doc=D.run(doc,c,{actor:'測試',authoritative:true,time:c.at,number:c.data.number});docs[b.batchId]=doc;Object.assign(data,{doc,requestId:b.requestId,ackIds:b.operations.map(c=>c.id)});}
 else if(b.api==='iqc_lookup')Object.assign(data,{result:{state:'NOT_FOUND',rt:'',status:'',message:'fixture'},proof:'fixture'});
 else throw Error('Unexpected fixture API '+b.api);}
 await route.fulfill({json:data});});
 await page.goto('http://127.0.0.1:8778/ds-app/');await page.locator('#loginAccount').fill('FIXTURE');await page.locator('#loginPassword').fill('fixture');await page.locator('#loginBtn').click();await page.locator('#appShell').waitFor({state:'visible'});await page.waitForFunction(()=>window.__DS_PROD_ENH_R5__);
 // CSS still sees the full PWA surface while all JS height readings retain login height.
 await page.evaluate(()=>{for(const [o,k] of [[window,'innerHeight'],[document.documentElement,'clientHeight'],[visualViewport,'height']])Object.defineProperty(o,k,{configurable:true,value:812});document.documentElement.style.setProperty('--ds-shell-vh','812px');window.__DS_PROD_ENH_R5__.syncNavGeometry();});
 const rect=()=>page.locator('.bottom-nav').evaluate(e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom}));
 let nav=await rect();check('home nav at viewport bottom before response',homeReceived&&nav.bottom>=858&&nav.bottom<=874,nav);await page.screenshot({path:path.join(out,(baseline?'baseline':'candidate')+'-home-pending.png')});
 await page.locator('#navDaily').click();await page.frameLocator('iframe[data-module-key="daily"]').locator('#date').waitFor();nav=await rect();let frame=await page.locator('iframe[data-module-key="daily"]').boundingBox();check('switching modules before home resolves leaves no bottom gap',nav.bottom>=858&&frame.y+frame.height>=874,{nav,frame});
 await page.locator('#navMore').click();await page.getByRole('button',{name:/OQC 庫存/}).click();const oqc=page.frameLocator('iframe[data-module-key="oqc"]');await oqc.locator('#scanInput').waitFor();await oqc.locator('#newBatch').waitFor({state:'visible'});await page.waitForFunction(()=>{const f=document.querySelector('iframe[data-module-key="oqc"]');return f?.contentWindow.OqcDemoTest?.getConnectionState().ready;});
 const oqcFrame=page.frames().find(f=>f.url().includes('/DS-OQC-SHIPPING/'));
 await oqcFrame.evaluate(()=>OqcDailyBatchD1.check());const previousBatch=await oqcFrame.evaluate(async()=>(await OqcDemoTest.getRoot()).active);await oqc.locator('#newBatch').click();await page.waitForTimeout(200);check('manual new batch button changes active batch',previousBatch!==(await oqcFrame.evaluate(async()=>(await OqcDemoTest.getRoot()).active)));await oqc.locator('#scanInput').fill('FD56WAE');await oqc.locator('#scanBtn').click();await page.waitForTimeout(1300);
 let r=await oqcFrame.evaluate(()=>OqcDemoTest.getRoot());check('real production submit event captures CTN in manual batch',Object.values(r.docs).some(d=>d.items.some(i=>i.ctn==='FD56WAE')),r.pending.map(x=>x.type));
 check('technical daily login card absent when connected',!(await oqc.locator('#oqcDailyD1').isVisible()));
 await page.screenshot({path:path.join(out,(baseline?'baseline':'candidate')+'-oqc.png')});
 if(!baseline){
  await oqc.locator('#scanInput').fill('FD56WAE');await oqc.locator('#scanBtn').click();await page.waitForTimeout(150);r=await oqcFrame.evaluate(()=>OqcDemoTest.getRoot());check('repeat CTN does not double count',Object.values(r.docs).flatMap(d=>d.items).filter(i=>i.ctn==='FD56WAE').length===1);
  await context.setOffline(true);await oqc.locator('#scanInput').fill('QA10AA2');await oqc.locator('#scanBtn').click();await page.waitForTimeout(150);r=await oqcFrame.evaluate(()=>OqcDemoTest.getRoot());check('verified current batch still captures offline',Object.values(r.docs).some(d=>d.items.some(i=>i.ctn==='QA10AA2'))&&r.pending.length>0);await context.setOffline(false);
  await oqcFrame.evaluate(()=>OqcDemoTest.sync());r=await oqcFrame.evaluate(()=>OqcDemoTest.getRoot());check('restored connection acknowledges queued scans',r.pending.length===0);
  await oqcFrame.evaluate(async()=>{await OqcStore.change(OqcDemoTest.getKey(),r=>delete r.dailyOpenedDate);});await oqc.locator('#scanInput').fill('QA10AA3');await oqc.locator('#scanBtn').click();await page.waitForTimeout(500);r=await oqcFrame.evaluate(()=>OqcDemoTest.getRoot());check('daily preparation replay keeps input and captures once',Object.values(r.docs).flatMap(d=>d.items).filter(i=>i.ctn==='QA10AA3').length===1);
 }
 releaseHome();await page.locator('#navHome').click();await page.waitForTimeout(200);nav=await rect();check('home response does not move navigation',nav.bottom>=858&&nav.bottom<=874,nav);check('no uncaught exceptions',errors.length===0,errors);
 fs.writeFileSync(path.join(out,(baseline?'baseline':'candidate')+(process.env.DS_WEBKIT?'-webkit':'-edge')+'-oqc-viewport.json'),JSON.stringify(results,null,2));if(!baseline&&results.some(x=>!x.pass))process.exitCode=1;
 }finally{releaseHome();await browser.close();server.close();}})().catch(e=>{releaseHome();console.error(e.stack);server.close();process.exitCode=1;});

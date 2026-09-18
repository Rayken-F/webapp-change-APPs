const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..');
const output=process.env.DS_LAYOUT_OUTPUT||process.cwd();
const mode=process.argv[2]||'candidate',results=[];
const fixture='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#263372;color:white;font:18px sans-serif}main{padding:20px}textarea{width:95%;height:120px;font-size:18px}button{padding:18px}#modal{position:fixed;inset:10px;overflow:auto;background:#18252e;padding:20px;box-sizing:border-box}</style><main><h1>Module fixture</h1><div style="height:1100px"></div><textarea id="note"></textarea><button id="last">最後按鈕</button></main>';
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 if(u.pathname==='/fixture'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(fixture);return;}
 if(u.pathname==='/fixture-api'){
  let raw='';for await(const c of req)raw+=c;const b=JSON.parse(raw||'{}');
  const data=b.api?.startsWith('workstation_')?{ok:true,sessionToken:'fixture-only',user:{account:'FIXTURE',displayName:'本機測試',role:'ADMIN',allowedActions:['CREATE_REQUEST','VIEW']},permissions:{home_enabled:true,daily_report_enabled:true,grinding_enabled:true,iqc_correction_enabled:true}}:{ok:true,priorities:[],rtMaster:[]};
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;
 }
 let rel=decodeURIComponent(u.pathname).slice(1);if(!rel||rel.endsWith('/'))rel+='index.html';const file=path.resolve(root,rel);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 let body=fs.readFileSync(file);
 if(rel==='ds-app/config.js'||rel==='DS-IQC-WIP/api.js')body=body.toString().replace(/https:\/\/script\.google\.com\/macros\/s\/[^"']+\/exec/g,'http://127.0.0.1:8772/fixture-api');
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html;charset=utf-8':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(body);
});
const crossServer=http.createServer(server.listeners('request')[0]);
(async()=>{
 await new Promise(r=>server.listen(8772,'127.0.0.1',r));
 await new Promise(r=>crossServer.listen(8773,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.DS_BROWSER_EXECUTABLE?{executablePath:process.env.DS_BROWSER_EXECUTABLE}:{})});
 try{
 const context=await browser.newContext({viewport:{width:402,height:874},serviceWorkers:'block'});
 const page=await context.newPage();await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('http://127.0.0.1:8772/ds-app/');await page.locator('#loginAccount').fill('FIXTURE');await page.locator('#loginPassword').fill('fixture-only');await page.locator('#loginBtn').click();await page.locator('#appShell').waitFor({state:'visible'});
 await page.waitForFunction(()=>window.__DS_PROD_ENH_R5__&&window.__DS_RC_QUICKBAR_KEEPER_V6);
 await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
 const rect=selector=>page.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}});
 const short=await rect('.bottom-nav');await page.evaluate(()=>document.querySelector('#priorityList').innerHTML='<div style="height:1800px">載入後的資料</div>');const long=await rect('.bottom-nav');
 results.push({check:'home-short-long',short,long,stable:Math.abs(short.bottom-long.bottom)<1});
 for(const key of ['daily','grinding','iqc','dashboard']){
  await page.evaluate(key=>openModule(key,key==='dashboard'?'http://127.0.0.1:8773/fixture':'/fixture',key,key),key);await page.frameLocator('.module-frame:not(.hidden)').locator('#last').waitFor();const frame=page.frames().find(f=>f.url().includes('/fixture?'));
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.bottom-nav')).visibility==='visible');
  await frame.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await page.evaluate(()=>window.__DS_PROD_ENH_R5__.syncNavGeometry());
  if(key==='dashboard'){await frame.evaluate(()=>{window.receivedInsets=0;window.addEventListener('message',e=>{if(e.data?.type==='DS_SHELL_NAV_INSET'){window.receivedInsets++;window.parent.postMessage({channel:'DS_SHELL_LAYOUT_V1',type:'DS_SHELL_NAV_INSET_ACK'},'*');}});window.parent.postMessage({channel:'DS_SHELL_LAYOUT_V1',type:'DS_SHELL_NAV_INSET_READY'},'*');});await page.waitForFunction(()=>document.querySelector('.module-frame:not(.hidden)').dataset.dsInsetAck==='1');}
  const nav=await rect('.bottom-nav'),fr=await rect('.module-frame:not(.hidden)'),last=await frame.locator('#last').boundingBox();
  results.push({check:key+'-last',nav,frame:fr,last,visible:last.y+last.height<=nav.top});
  await frame.evaluate(()=>{document.body.innerHTML='<section id="modal"><h1>Modal</h1><div style="height:1500px"></div><textarea id="note"></textarea><button id="last">送出</button></section>';const m=document.querySelector('#modal');m.scrollTop=m.scrollHeight;});
  const modalLast=await frame.locator('#last').boundingBox();results.push({check:key+'-modal',visible:modalLast.y+modalLast.height<=nav.top,button:modalLast});
  const before=await rect('.module-frame:not(.hidden)');await frame.locator('#note').focus();await page.evaluate(()=>{document.documentElement.classList.add('ds-keyboard-open','ds-child-input-focus');window.__DS_PROD_ENH_R5__.syncNavGeometry();});
  const focused=await rect('.module-frame:not(.hidden)');await frame.locator('#note').fill('中文連續輸入測試');const typed=await rect('.module-frame:not(.hidden)');
  results.push({check:key+'-typing',before,focused,typed,stable:before.height===focused.height&&focused.height===typed.height});
  await frame.locator('#note').evaluate(e=>e.blur());await page.evaluate(()=>document.documentElement.classList.remove('ds-keyboard-open','ds-child-input-focus'));
  if(key==='dashboard')results.push({check:'dashboard-ack-no-loop',stable:await frame.evaluate(()=>window.receivedInsets<40),messages:await frame.evaluate(()=>window.receivedInsets)});
  if(key==='iqc')await page.screenshot({path:path.join(output,mode+'-modal.png')});
  await page.evaluate(()=>{document.querySelector('#moduleFrameHost').replaceChildren();switchView('home');});
 }
 await page.evaluate(()=>openModule('iqc','/DS-IQC-WIP/','IQC 異常處理','more'));const real=page.frameLocator('.module-frame:not(.hidden)');await real.locator('#mobileRequestToggle').click();await real.locator('#requestPanel').evaluate(e=>new Promise(resolve=>{function poll(){if(e.getBoundingClientRect().x<40&&getComputedStyle(e).opacity==='1'){e.scrollTop=e.scrollHeight;resolve();}else requestAnimationFrame(poll);}poll();}));const actual=await real.locator('#submitRequestBtn').boundingBox(),navActual=await rect('.bottom-nav');results.push({check:'actual-iqc-modal-submit',button:actual,nav:navActual,visible:actual.x>=0&&actual.x+actual.width<=402&&actual.y+actual.height<=navActual.top});await page.locator('#toast').evaluate(e=>e.classList.add('hidden'));await page.screenshot({path:path.join(output,mode+'-actual-iqc.png')});
 await page.setViewportSize({width:402,height:790});await page.evaluate(()=>{syncShellViewport();window.__DS_PROD_ENH_R5__.syncNavGeometry();});const smaller=await rect('.bottom-nav'),smallerFrame=await rect('.module-frame:not(.hidden)');results.push({check:'viewport-height-change',nav:smaller,frame:smallerFrame,visible:smaller.bottom<=790&&smallerFrame.bottom<=smaller.top});
 fs.writeFileSync(path.join(output,mode+'-layout.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 if(mode!=='baseline')for(const r of results)assert.ok(r.visible??r.stable,r.check);
 }finally{await browser.close();server.close();crossServer.close();}
})().catch(e=>{console.error(e.message);server.close();crossServer.close();process.exitCode=1;});

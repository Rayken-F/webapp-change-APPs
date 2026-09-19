const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..');
const output=process.env.DS_LAYOUT_OUTPUT||process.cwd();
const dashboardReceiver=process.env.DS_DASHBOARD_RECEIVER?fs.readFileSync(process.env.DS_DASHBOARD_RECEIVER,'utf8').replace('https://rayken-f.github.io','http://127.0.0.1:8772'):null;
const mode=process.argv[2]||'candidate',results=[];
let failNextAuth=true,authCalls=0;
const fixture='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#263372;color:white;font:18px sans-serif}main{padding:20px}textarea{width:95%;height:120px;font-size:18px}button{padding:18px}#modal{position:fixed;inset:10px;overflow:auto;background:#18252e;padding:20px;box-sizing:border-box}</style><main class="wrap"><section class="page active"><h1>Module fixture</h1><div style="height:1100px"></div><textarea id="note"></textarea><button id="last">最後按鈕</button></section></main>';
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 if(u.pathname==='/fixture'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(fixture);return;}
 if(u.pathname==='/fixture-api'){
  let raw='';for await(const c of req)raw+=c;const b=JSON.parse(raw||'{}');
  if(['workstation_login','workstation_bootstrap'].includes(b.api)){authCalls++;if(failNextAuth){failNextAuth=false;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:false,code:'AUTH_BRIDGE_FAILED',message:'登入通道未能完成回應，請重試。'}));return;}}
  const data=['workstation_login','workstation_bootstrap'].includes(b.api)?{ok:true,sessionToken:'fixture-only',user:{account:'FIXTURE',displayName:'本機測試',role:'ADMIN',allowedActions:['CREATE_REQUEST','VIEW']},permissions:{home_enabled:true,daily_report_enabled:true,grinding_enabled:true,iqc_correction_enabled:true}}:{ok:true,priorities:[],rtMaster:[]};
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;
 }
 let rel=decodeURIComponent(u.pathname).slice(1);if(!rel||rel.endsWith('/'))rel+='index.html';const file=path.resolve(root,rel);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 let body=fs.readFileSync(file);
 if(rel==='ds-app/production-enhancements.js'&&process.env.DS_LAYOUT_BASELINE_JS)body=fs.readFileSync(process.env.DS_LAYOUT_BASELINE_JS);
 if(rel==='ds-app/config.js'||rel==='DS-IQC-WIP/api.js')body=body.toString().replace(/https:\/\/script\.google\.com\/macros\/s\/[^"']+\/exec/g,'http://127.0.0.1:8772/fixture-api');
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html;charset=utf-8':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(body);
});
const crossServer=http.createServer(server.listeners('request')[0]);
(async()=>{
 await new Promise(r=>server.listen(8772,'127.0.0.1',r));
 await new Promise(r=>crossServer.listen(8773,'127.0.0.1',r));
 const browser=await (process.env.DS_WEBKIT?webkit:chromium).launch({headless:true,...(!process.env.DS_WEBKIT&&process.env.DS_BROWSER_EXECUTABLE?{executablePath:process.env.DS_BROWSER_EXECUTABLE}:{})});
 try{
 const context=await browser.newContext({viewport:{width:402,height:874},isMobile:!!process.env.DS_WEBKIT,hasTouch:!!process.env.DS_WEBKIT,serviceWorkers:'block'});
 const page=await context.newPage();await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(dashboardReceiver&&url.href.startsWith('https://script.google.com/dashboard-fixture'))return route.fulfill({contentType:'text/html',body:'<style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0}</style><iframe src="https://k5-fixture-script.googleusercontent.com/userCodeAppPanel"></iframe>'});
  if(dashboardReceiver&&url.hostname==='k5-fixture-script.googleusercontent.com'&&url.pathname==='/userCodeAppPanel')return route.fulfill({contentType:'text/html',body:'<style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0}</style><iframe src="https://k5-fixture-script.googleusercontent.com/dashboard-content"></iframe>'});
  if(dashboardReceiver&&url.hostname==='k5-fixture-script.googleusercontent.com')return route.fulfill({contentType:'text/html',body:fixture.replace('class="wrap"','class="app-shell"')+'<script>window.receivedInsets=0;window.addEventListener("message",e=>{if(e.data?.type==="DS_SHELL_NAV_INSET")window.receivedInsets++;});</script>'+dashboardReceiver});
  return url.hostname==='127.0.0.1'?route.continue():route.abort();
 });
 await page.goto('http://127.0.0.1:8772/ds-app/');await page.locator('#loginAccount').fill('FIXTURE');await page.locator('#loginPassword').fill('fixture-only');await page.locator('#loginBtn').click();
 await page.locator('#authFailureDialog').waitFor({state:'visible'});await page.locator('#loadingOverlay').waitFor({state:'hidden'});
 results.push({check:'failed-login-visible-error',visible:await page.locator('#loginView').isVisible()&&!(await page.locator('#appShell').isVisible())&&authCalls===1});
 await page.screenshot({path:path.join(output,mode+'-login-error.png')});
 await page.locator('#closeAuthFailureBtn').click();assert.equal(authCalls,1);await page.locator('#loginBtn').click();await page.locator('#appShell').waitFor({state:'visible'});
 results.push({check:'explicit-login-retry',visible:authCalls===2&&!(await page.locator('#authFailureDialog').isVisible())});
 await page.waitForFunction(()=>window.__DS_PROD_ENH_R5__&&window.__DS_RC_QUICKBAR_KEEPER_V6);
 await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
 const rect=selector=>page.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}});
 const short=await rect('.bottom-nav');await page.evaluate(()=>document.querySelector('#priorityList').innerHTML='<div style="height:1800px">載入後的資料</div>');const long=await rect('.bottom-nav');
 results.push({check:'home-short-long',short,long,stable:Math.abs(short.bottom-long.bottom)<1});
 // Use the actual Daily source, including its final row, not only a short fixture.
 // Model iPhone safe areas and a child frame taller than its clipped host.
 const phoneStyle=await page.addStyleTag({content:':root{--ds-module-context-h:96px!important;--ds-shell-nav-bottom:12px!important}'});
 await page.locator('#navDaily').click();
 await page.frameLocator('iframe.module-frame:not(.hidden)').getByRole('button',{name:'下一步',exact:true}).waitFor();
 const daily=page.frames().find(f=>f.url().includes('/ds-report-pwa/'));
 await daily.getByRole('button',{name:'下一步',exact:true}).waitFor();
 for(const extra of [0,96]){
  const mismatch=await page.addStyleTag({content:`#appShell.module-mode .module-frame:not(.hidden){height:calc(100% + ${extra}px)!important;max-height:none!important}`});
  await page.evaluate(()=>window.__DS_PROD_ENH_R5__.syncNavGeometry());
  await daily.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
  const button=await daily.getByRole('button',{name:'下一步',exact:true}).boundingBox(),nav=await rect('.bottom-nav');
  results.push({check:'actual-daily-safe-area-extra-'+extra,button,nav,visible:button.y+button.height<=nav.top});
  await page.screenshot({path:path.join(output,mode+'-daily-extra-'+extra+'.png')});await mismatch.evaluate(e=>e.remove());
 }
 await page.locator('#navHome').click();await page.locator('#navDaily').click();
 await page.waitForFunction(()=>Number(document.querySelector('iframe[data-module-key="daily"]').dataset.dsStableInset||0)>0).catch(()=>{});
 await daily.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
 const dailyAgain=await daily.getByRole('button',{name:'下一步',exact:true}).boundingBox();
 results.push({check:'actual-daily-revisit',visible:dailyAgain.y+dailyAgain.height<=(await rect('.bottom-nav')).top});
 // Exercise the actual station navigation. Page 1 alone cannot prove that the
 // clearance belongs to the station and confirmation pages after HTML parsing.
 await daily.addStyleTag({content:'*,*::before,*::after{animation-duration:0s!important;transition:none!important}html{scroll-behavior:auto!important}'});
 const settleDaily=()=>page.waitForFunction(()=>{const r=document.documentElement,n=document.querySelector('.bottom-nav');return !r.classList.contains('ds-child-input-focus')&&!r.classList.contains('ds-keyboard-open')&&n.getBoundingClientRect().bottom<=innerHeight&&getComputedStyle(n).visibility==='visible';});
 const stations=[['自動噴砂站','pageSandblast'],['UT站','pageUT'],['鋼印鎖瓶站','pageStamp'],['集束中心','pageBundle'],['IQC','pageIQC'],['專案','pageProject']];
 for(const [site,id] of stations){
  await daily.locator('#date').fill('2026-09-19');
  await daily.locator('input[name="site"][value="'+site+'"]').check();
  await daily.getByRole('button',{name:'下一步',exact:true}).click();
  await daily.locator('#'+id+'.active').waitFor();await settleDaily();
  for(const extra of [0,96]){
   const mismatch=await page.addStyleTag({content:`#appShell.module-mode .module-frame:not(.hidden){height:calc(100% + ${extra}px)!important;max-height:none!important}`});
   await page.evaluate(()=>window.__DS_PROD_ENH_R5__.syncNavGeometry());
   await daily.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
   const buttons=await daily.locator('#'+id+' .btn-row').last().boundingBox(),nav=await rect('.bottom-nav');
   const placement=await daily.locator('#'+id).evaluate(e=>({parent:e.parentElement.className,inWrap:!!e.closest('.wrap'),bottom:document.scrollingElement.scrollHeight,tail:getComputedStyle(e,'::after').height}));
   results.push({check:'daily-station-'+id+'-extra-'+extra,buttons,nav,placement,visible:buttons.y>=96&&buttons.y+buttons.height<=nav.top});
   if(extra===0)await page.screenshot({path:path.join(output,mode+'-'+id+'.png')});
   await mismatch.evaluate(e=>e.remove());
  }
  const back=daily.locator('#'+id).getByRole('button',{name:'返回',exact:true});
  if(mode==='baseline')await back.evaluate(e=>e.click());else await back.click();
  await daily.locator('#page1.active').waitFor();
 }
 await daily.locator('input[name="site"][value="UT站"]').check();await daily.getByRole('button',{name:'下一步',exact:true}).click();
 const preview=daily.locator('#pageUT').getByRole('button',{name:'預覽',exact:true});
 if(mode==='baseline')await preview.evaluate(e=>e.click());else await preview.click();
 await daily.locator('#page7.active').waitFor();await settleDaily();
 for(const extra of [0,96]){
  const mismatch=await page.addStyleTag({content:`#appShell.module-mode .module-frame:not(.hidden){height:calc(100% + ${extra}px)!important;max-height:none!important}`});
  await page.evaluate(()=>window.__DS_PROD_ENH_R5__.syncNavGeometry());
  await daily.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
  const buttons=await daily.locator('#page7 .btn-row').boundingBox(),nav=await rect('.bottom-nav');
  results.push({check:'daily-confirmation-extra-'+extra,buttons,nav,visible:buttons.y>=96&&buttons.y+buttons.height<=nav.top});
  if(extra===0)await page.screenshot({path:path.join(output,mode+'-page7.png')});await mismatch.evaluate(e=>e.remove());
 }
 // Baseline navigation may be covered; only bypass its pointer hit test to
 // collect remaining failures. Candidate uses normal clicks throughout.
 const confirmBack=daily.locator('#page7').getByRole('button',{name:'返回',exact:true});
 if(mode==='baseline')await confirmBack.evaluate(e=>e.click());else await confirmBack.click();
 const utBack=daily.locator('#pageUT').getByRole('button',{name:'返回',exact:true});
 if(mode==='baseline')await utBack.evaluate(e=>e.click());else await utBack.click();
 await daily.locator('input[name="site"][value="集束中心"]').check();await daily.getByRole('button',{name:'下一步',exact:true}).click();
 await daily.locator('#bundle_frame_count').fill('2');await daily.locator('#bundle_frame_count').press('Tab');
 await daily.locator('.bundle-note-textarea').last().fill('站別切換與中文備註測試');
 const focusedFrame=await rect('.module-frame:not(.hidden)');await daily.locator('.bundle-note-textarea').last().press('End');
 results.push({check:'daily-bundle-typing-geometry',stable:focusedFrame.height===(await rect('.module-frame:not(.hidden)')).height});
 await daily.locator('.bundle-note-textarea').last().evaluate(e=>e.blur());
 await page.locator('#navHome').click();await page.locator('#navDaily').click();await settleDaily();
 await page.evaluate(()=>window.__DS_PROD_ENH_R5__.syncNavGeometry());await daily.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
 const bundleAgain=await daily.locator('#pageBundle > .btn-row').boundingBox();
 results.push({check:'daily-bundle-multiple-revisit',buttons:bundleAgain,visible:bundleAgain.y+bundleAgain.height<=(await rect('.bottom-nav')).top});
 await phoneStyle.evaluate(e=>e.remove());await page.evaluate(()=>{document.querySelector('#moduleFrameHost').replaceChildren();switchView('home');});
 for(const key of ['daily','grinding','oqc']){
  await page.evaluate(key=>openModule(key,'/fixture',key,key),key);await page.frameLocator('.module-frame:not(.hidden)').locator('#last').waitFor();const frame=page.frames().find(f=>f.url().includes('/fixture?'));
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.bottom-nav')).visibility==='visible');
  await page.evaluate(()=>window.__DS_PROD_ENH_R5__.syncNavGeometry());await frame.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
  const nav=await rect('.bottom-nav'),fr=await rect('.module-frame:not(.hidden)'),last=await frame.locator('#last').boundingBox();
  results.push({check:key+'-last',nav,frame:fr,last,visible:last.y+last.height<=nav.top});results.push({check:key+'-floating',frame:fr,nav,visible:fr.bottom>=nav.bottom&&fr.bottom===874});
  if(key==='grinding')await frame.evaluate(()=>{document.body.innerHTML='<section id="modal" class="modal-panel"><h1>Modal</h1><div style="height:1500px"></div><textarea id="note"></textarea><button id="last">送出</button></section>';const m=document.querySelector('#modal');m.scrollTop=m.scrollHeight;});
  const modalLast=await frame.locator('#last').boundingBox();if(key==='grinding')results.push({check:key+'-modal',visible:modalLast.y+modalLast.height<=nav.top,button:modalLast});
  const before=await rect('.module-frame:not(.hidden)');await frame.locator('#note').focus();await page.evaluate(()=>{document.documentElement.classList.add('ds-keyboard-open','ds-child-input-focus');window.__DS_PROD_ENH_R5__.syncNavGeometry();});
  const focused=await rect('.module-frame:not(.hidden)');await frame.locator('#note').fill('中文連續輸入測試');const typed=await rect('.module-frame:not(.hidden)');
  results.push({check:key+'-typing',before,focused,typed,stable:before.height===focused.height&&focused.height===typed.height});
  await frame.locator('#note').evaluate(e=>e.blur());await page.evaluate(()=>document.documentElement.classList.remove('ds-keyboard-open','ds-child-input-focus'));
  await page.evaluate(()=>{document.querySelector('#moduleFrameHost').replaceChildren();switchView('home');});
 }
 if(dashboardReceiver){
  await page.evaluate(()=>openModule('dashboard','https://script.google.com/dashboard-fixture','Dashboard','dashboard'));
  await page.waitForFunction(()=>document.querySelector('.module-frame:not(.hidden)').dataset.dsInsetAck==='1');
  const dash=page.frames().find(f=>f.url().includes('k5-fixture-script.googleusercontent.com/dashboard-content'));
  await dash.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
  const last=await dash.locator('#last').boundingBox(),nav=await rect('.bottom-nav'),fr=await rect('.module-frame:not(.hidden)');
  results.push({check:'nested-dashboard-last',button:last,nav,visible:last.y+last.height<=nav.top});
  results.push({check:'nested-dashboard-floating',visible:fr.bottom===874});
  results.push({check:'dashboard-body-inherits-inset',visible:await dash.evaluate(()=>parseFloat(getComputedStyle(document.body).getPropertyValue('--ds-shell-nav-inset'))>=82)});
  results.push({check:'dashboard-no-message-loop',visible:await dash.evaluate(()=>window.receivedInsets<40)});
  const mismatch=await page.addStyleTag({content:'#appShell.module-mode .module-frame:not(.hidden){height:calc(100% + 96px)!important;max-height:none!important}'});
  await page.evaluate(()=>window.__DS_PROD_ENH_R5__.syncNavGeometry());
  await dash.waitForFunction(()=>parseFloat(getComputedStyle(document.body).getPropertyValue('--ds-shell-nav-inset'))>=178).catch(()=>{});
  await dash.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
  const mismatchLast=await dash.locator('#last').boundingBox();results.push({check:'dashboard-clipped-child-viewport',button:mismatchLast,nav,visible:mismatchLast.y+mismatchLast.height<=nav.top});
  await mismatch.evaluate(e=>e.remove());
  await page.evaluate(()=>{document.querySelector('#moduleFrameHost').replaceChildren();switchView('home');});
 }
 await page.evaluate(()=>openModule('iqc','/DS-IQC-WIP/','IQC 異常處理','more'));const real=page.frameLocator('.module-frame:not(.hidden)');await real.locator('#mobileRequestToggle').click();await real.locator('#requestPanel').evaluate(e=>new Promise(resolve=>{function poll(){if(e.getBoundingClientRect().x<40&&getComputedStyle(e).opacity==='1'){e.scrollTop=e.scrollHeight;resolve();}else requestAnimationFrame(poll);}poll();}));const actual=await real.locator('#submitRequestBtn').boundingBox(),navActual=await rect('.bottom-nav');results.push({check:'actual-iqc-modal-submit',button:actual,nav:navActual,visible:actual.x>=0&&actual.x+actual.width<=402&&actual.y+actual.height<=navActual.top});results.push({check:'actual-iqc-full-viewport',visible:(await rect('.module-frame:not(.hidden)')).bottom===874});await page.locator('#toast').evaluate(e=>e.classList.add('hidden'));await page.screenshot({path:path.join(output,mode+'-actual-iqc.png')});
 await page.setViewportSize({width:402,height:790});await page.evaluate(()=>{syncShellViewport();window.__DS_PROD_ENH_R5__.syncNavGeometry();});const smaller=await rect('.bottom-nav'),smallerFrame=await rect('.module-frame:not(.hidden)');results.push({check:'viewport-height-change',nav:smaller,frame:smallerFrame,visible:smaller.bottom<=790&&smallerFrame.bottom>=smaller.bottom});
 fs.writeFileSync(path.join(output,mode+'-layout.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 if(mode!=='baseline')for(const r of results)assert.ok(r.visible??r.stable,r.check);
 }finally{await browser.close();server.close();crossServer.close();}
})().catch(e=>{console.error(e.message);server.close();crossServer.close();process.exitCode=1;});

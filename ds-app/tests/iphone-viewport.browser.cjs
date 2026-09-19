// Controlled fault model, not an iPhone simulator: CSS and JS both retain a
// shorter login viewport while the installed app surface remains 402 x 874.
// Real app files, synthetic responses only; external requests are blocked.
const fs=require('fs'),path=require('path'),http=require('http');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..'),out=process.env.DS_LAYOUT_OUTPUT||process.cwd(),baseline=process.env.DS_K8_BASELINE;
const results=[],errors=[];let releaseHome,releaseLogin,homeReceived=false;
const homeReady=new Promise(r=>releaseHome=r),loginReady=new Promise(r=>releaseLogin=r);
const check=(name,pass,detail)=>{results.push({name,pass:!!pass,detail});console.log((pass?'PASS ':'FAIL ')+name);};
const server=http.createServer((req,res)=>{let rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);if(rel.endsWith('/'))rel+='index.html';const p=path.resolve(root,rel);if(!p.startsWith(root+path.sep)||!fs.existsSync(p)){res.writeHead(404);return res.end();}let data=fs.readFileSync(p);if(baseline){const map={'ds-app/production-enhancements.css':'baseline-enhancements.css','ds-app/production-enhancements.js':'baseline-enhancements.js'};if(map[rel])data=fs.readFileSync(path.join(baseline,map[rel]));}res.setHeader('Content-Type',p.endsWith('.html')?'text/html;charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'application/octet-stream');res.end(data);});
(async()=>{await new Promise(r=>server.listen(8779,'127.0.0.1',r));const browser=await(process.env.DS_WEBKIT?webkit:chromium).launch({headless:true,...(!process.env.DS_WEBKIT&&process.env.DS_BROWSER_EXECUTABLE?{executablePath:process.env.DS_BROWSER_EXECUTABLE}:{})});try{
 const context=await browser.newContext({viewport:{width:402,height:874},screen:{width:402,height:874},isMobile:true,hasTouch:true,serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'});
 await context.addInitScript(()=>{Object.defineProperty(navigator,'standalone',{configurable:true,value:true});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.hostname==='127.0.0.1')return route.continue();if(url.hostname!=='script.google.com'||req.method()!=='POST')return route.abort();const b=req.postDataJSON();let data;
 if(b.api==='workstation_login'){await loginReady;data={ok:true,sessionToken:'secret-fixture-token',user:{account:'SECRET_FIXTURE_ACCOUNT',displayName:'測試',role:'ADMIN'},permissions:{home_enabled:true,daily_report_enabled:true}};}
 else if(b.api==='workstation_home_data'){homeReceived=true;await homeReady;data={ok:true,priorities:[],rtMaster:[]};}
 else return route.abort();await route.fulfill({json:data});});
 await page.goto('http://127.0.0.1:8779/ds-app/');await page.locator('#loginAccount').fill('SECRET_FIXTURE_ACCOUNT');await page.locator('#loginPassword').fill('secret-fixture-password');await page.locator('#loginPassword').press('Enter');
 check('Enter submission releases login input before authentication returns',await page.evaluate(()=>!document.querySelector('#loginForm').contains(document.activeElement)));releaseLogin();
 await page.locator('#appShell').waitFor({state:'visible'});await page.waitForFunction(()=>window.__DS_PROD_ENH_R5__);
 await page.evaluate(()=>{
   const probe=[...document.body.children].find(e=>e.style.height==='100dvh'&&e.getAttribute('aria-hidden')==='true');probe.id='dsViewportProbe';probe.style.height='812px';
   for(const [o,k] of [[window,'innerHeight'],[document.documentElement,'clientHeight'],[visualViewport,'height']])Object.defineProperty(o,k,{configurable:true,value:812});
   // Model native fixed-bottom anchoring 62px above the physical surface.
   const style=document.createElement('style');style.textContent='html:not(.ds-iphone-standalone-layout) #appShell .bottom-nav{bottom:70px!important}';document.head.appendChild(style);
   window.__DS_PROD_ENH_R5__.syncNavGeometry();
 });
 const rect=()=>page.locator('.bottom-nav').evaluate(e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom}));
 let nav=await rect();check('short CSS and JS viewport: nav covers full PWA surface before home data',homeReceived&&nav.bottom>=858&&nav.bottom<=874,nav);
 await page.screenshot({path:path.join(out,(baseline?'baseline':'candidate')+'-iphone-home-pending.png')});
 await page.locator('#navDaily').click();await page.frameLocator('iframe[data-module-key="daily"]').locator('#date').waitFor();nav=await rect();const frame=await page.locator('iframe[data-module-key="daily"]').boundingBox();
 check('early module switch keeps full surface without home response',nav.bottom>=858&&frame.y+frame.height>=874,{nav,frame});
 await page.screenshot({path:path.join(out,(baseline?'baseline':'candidate')+'-iphone-daily-pending.png')});
 if(!baseline){
   const frozen=await page.evaluate(()=>{const r=document.documentElement;r.classList.add('ds-child-input-focus');document.querySelector('#dsViewportProbe').style.height='430px';window.__DS_PROD_ENH_R5__.syncNavGeometry();return {height:r.style.getPropertyValue('--ds-shell-layout-height'),visible:getComputedStyle(document.querySelector('.bottom-nav')).visibility};});check('child keyboard freezes module height and hides nav',frozen.height==='874px'&&frozen.visible==='hidden',frozen);
   await page.evaluate(()=>{document.documentElement.classList.remove('ds-child-input-focus');document.querySelector('#dsViewportProbe').style.height='812px';window.__DS_PROD_ENH_R5__.syncNavGeometry();});
   const excluded=await page.evaluate(()=>{const test=(name,setup,reset)=>{setup();window.__DS_PROD_ENH_R5__.syncNavGeometry();const result={name,screenMode:document.documentElement.classList.contains('ds-iphone-standalone-layout'),height:document.documentElement.style.getPropertyValue('--ds-shell-layout-height')};reset();return result;};return [
     test('browser tab',()=>Object.defineProperty(navigator,'standalone',{configurable:true,value:false}),()=>Object.defineProperty(navigator,'standalone',{configurable:true,value:true})),
     test('zoomed',()=>Object.defineProperty(visualViewport,'scale',{configurable:true,value:1.5}),()=>Object.defineProperty(visualViewport,'scale',{configurable:true,value:1})),
     test('not full width',()=>Object.defineProperty(screen,'width',{configurable:true,value:800}),()=>Object.defineProperty(screen,'width',{configurable:true,value:402})),
     test('large height discrepancy',()=>document.querySelector('#dsViewportProbe').style.height='600px',()=>document.querySelector('#dsViewportProbe').style.height='812px')];});
   for(const x of excluded)check('screen correction excluded: '+x.name,!x.screenMode,x);
   await page.evaluate(()=>window.__DS_PROD_ENH_R5__.syncNavGeometry());
   await page.locator('#navMore').click();await page.getByText('畫面診斷',{exact:true}).click();await page.locator('#copyLayoutDiagnosticBtn').click();await page.locator('#layoutDiagnosticText').waitFor({state:'visible'});
   const text=await page.locator('#layoutDiagnosticText').textContent(),report=JSON.parse(text);check('copy diagnostic gives version and geometry without account or token',report.build==='DS_PROD_LAYOUT_K8_20260919'&&report.cssBuild==='K8'&&report.samples.length>0&&!/secret|fixture|password|sessionToken|CTN/.test(text),report.samples.length);
   const count=await page.evaluate(()=>{for(let i=0;i<40;i++){Object.defineProperty(window,'innerHeight',{configurable:true,value:800+i});window.__DS_PROD_ENH_R5__.layoutReport();}return window.__DS_PROD_ENH_R5__.layoutReport().samples.length;});check('diagnostic history stays bounded',count===24,count);
 }
 releaseHome();await page.locator('#navHome').click();await page.waitForTimeout(200);nav=await rect();check('late home response does not reposition nav',nav.bottom>=858&&nav.bottom<=874,nav);check('no uncaught exceptions',errors.length===0,errors);
 fs.writeFileSync(path.join(out,(baseline?'baseline':'candidate')+(process.env.DS_WEBKIT?'-webkit':'-edge')+'-iphone-viewport.json'),JSON.stringify(results,null,2));if(!baseline&&results.some(x=>!x.pass))process.exitCode=1;
 }finally{releaseHome();releaseLogin();await browser.close();server.close();}})().catch(e=>{releaseHome();releaseLogin();console.error(e.stack);server.close();process.exitCode=1;});

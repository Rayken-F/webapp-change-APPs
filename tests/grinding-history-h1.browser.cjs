// Actual Grinding page, synthetic read-only API responses; external network blocked.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=process.env.IQC_TEST_OUTPUT||require('node:os').tmpdir();
const fixture='<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{width:100%;height:100vh;border:0}</style><script>window.DS_PORTAL_BRIDGE={getToken:()=>"fixture",getProfile:()=>({user:{displayName:"測試員"},permissions:{grinding_enabled:true}})};</script><iframe src="/ds-report-pwa-beta/?ds_shell=1&embedded=1"></iframe>';
let checks=0;const ok=(name,value)=>{assert.ok(value,name);checks++;console.log('PASS '+name);};
(async()=>{
 const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://local');if(u.pathname==='/fixture')return res.setHeader('Content-Type','text/html;charset=utf-8'),res.end(fixture);let file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(u.pathname.endsWith('/'))file=path.join(file,'index.html');if(!file.startsWith(root+path.sep))return res.writeHead(403).end();try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html;charset=utf-8');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.EDGE_EXECUTABLE});
 try{
  const page=await browser.newPage({viewport:{width:402,height:874},isMobile:true,hasTouch:true,serviceWorkers:'block'}),errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,items:[],frames:[],revision:'fixture'})}));
  await page.goto(origin+'/fixture');const frame=await page.locator('iframe').elementHandle().then(e=>e.contentFrame());await frame.waitForFunction(()=>typeof loadHistoryMonth==='function'&&typeof fetchBetaWipHistory==='function');
  await frame.evaluate(()=>{
   window.historyCalls=[];window.monthCalls=[];window.failMonth=false;window.failHistory=false;
   window.fetchBetaWipHistory=async q=>{historyCalls.push(q);if(q.q==='SLOW')await new Promise(r=>setTimeout(r,600));if(failHistory)throw Error('測試網路中斷，請重試');const all=Array.from({length:q.q?1:125},(_,i)=>({submissionId:'fixture',operationIndex:i,assetKey:String(i),assetCtn:q.q||('AB12C'+String(i).padStart(2,'0')),actionType:'GRINDING_CHECK_IN',qty:1,operatedAt:q.start_date+' 09:00:00',reportDate:q.start_date,operator:'測試員'}));return {ok:true,items:all.slice(q.offset,q.offset+q.limit),hasMore:all.length>q.offset+q.limit,nextOffset:all.length>q.offset+q.limit?q.offset+q.limit:null};};
   const original=window.betaGetApi;window.betaGetApi=async(api,p)=>{if(api!=='wip_monthly')return original(api,p);monthCalls.push(p.month);if(p.month==='2026-08')await new Promise(r=>setTimeout(r,600));if(failMonth)return {ok:false,message:'月統計讀取失敗，請重試'};const count=new Date(Date.UTC(+p.month.slice(0,4),+p.month.slice(5),0)).getUTCDate(),daily=Array.from({length:count},(_,i)=>({date:p.month+'-'+String(i+1).padStart(2,'0'),checkInQty:i===0?125:0,releasedQty:i===0?36:0,releasedFrames:i===0?2:0}));return {ok:true,month:p.month,daily,totals:{checkInQty:125,releasedQty:36,releasedFrames:2},serverTime:'fixture'};};
   document.getElementById('historyMonth').value='2026-09';openHistoryModal();
  });
  await frame.locator('#historyMonthly tbody tr').last().waitFor();await frame.waitForFunction(()=>!state.historyLoading);
  ok('month opens all 30 days and full-month detail range',await frame.locator('#historyMonthly tbody tr').count()===30&&await frame.locator('#historyStartDate').inputValue()==='2026-09-01'&&await frame.locator('#historyEndDate').inputValue()==='2026-09-30');
  ok('monthly totals are independent of 50-row history page',/125 支/.test(await frame.locator('.history-month-totals').textContent())&&await frame.locator('.history-item').count()===50);
  await frame.locator('#historyMoreBtn').tap();await frame.waitForFunction(()=>!state.historyLoading);await frame.locator('#historyMoreBtn').tap();await frame.waitForFunction(()=>!state.historyLoading);
  ok('history loads all 125 distinct same-second transactions',await frame.locator('.history-item').count()===125&&await frame.locator('#historyMoreBtn').isHidden()&&/全部載入/.test(await frame.locator('#historyCount').textContent()));
  await frame.locator('[data-history-date="2026-09-01"]').tap();await frame.waitForFunction(()=>!state.historyLoading);
  ok('daily drilldown queries the selected date',await frame.evaluate(()=>historyCalls.at(-1).start_date==='2026-09-01'&&historyCalls.at(-1).end_date==='2026-09-01'&&historyCalls.at(-1).offset===0));
  await frame.evaluate(()=>{document.getElementById('historyQuery').value='SLOW';loadHistory(true);document.getElementById('historyQuery').value='FAST';loadHistory(true);});await page.waitForTimeout(750);
  ok('stale detail response does not replace newer filter',await frame.locator('#historyTimeline').textContent().then(t=>t.includes('FAST')&&!t.includes('SLOW')));
  await frame.evaluate(()=>{document.getElementById('historyMonth').value='2026-08';loadHistoryMonth();document.getElementById('historyMonth').value='2026-09';loadHistoryMonth();});await page.waitForTimeout(750);
  ok('stale month response does not replace selected month',await frame.locator('[data-history-date="2026-09-01"]').count()===1&&await frame.locator('[data-history-date="2026-08-01"]').count()===0);
  await frame.locator('#historyModal .modal-panel').evaluate(e=>e.scrollTop=0);await page.screenshot({path:path.join(out,'grinding-monthly-mobile.png')});
  for(const width of [320,402]){await page.setViewportSize({width,height:874});ok('history fits '+width+'px screen',await frame.locator('#historyModal .modal-panel').evaluate(e=>e.scrollWidth<=e.clientWidth+1));}
  await frame.evaluate(()=>{failMonth=true;failHistory=true;loadHistoryMonth();});await frame.locator('#historyMonthly .error-box').waitFor();await frame.waitForFunction(()=>!state.historyLoading);
  ok('network errors are visible and not shown as zero totals',await frame.locator('#historyMonthly tbody').count()===0&&/網路中斷/.test(await frame.locator('#historyCount').textContent()));
  ok('no runtime errors',errors.length===0);console.log(JSON.stringify({checks,backend:'synthetic',errors}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

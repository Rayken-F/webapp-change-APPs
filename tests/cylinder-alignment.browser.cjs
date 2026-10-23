const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=process.env.REG_ARTIFACTS||fs.mkdtempSync(path.join(require('os').tmpdir(),'alignment-'));
fs.mkdirSync(out,{recursive:true});let checks=0;const ok=(label,value)=>{assert.ok(value,label);checks++;console.log('PASS '+label);};
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_EXECUTABLE});
 try{
  const context=await browser.newContext({viewport:{width:402,height:874},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await context.route('**/*',r=>{if(!r.request().url().startsWith(base)){external.push(r.request().url());return r.abort();}return r.continue();});
  await page.goto(base+'/DS-CYLINDER-REGISTRATION-DEMO/index.html');
  const image=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.width=640;c.height=800;const x=c.getContext('2d'),m=RegistrationAlignment.transform([[.08,.22],[.86,.10],[.96,.77],[.18,.89]]);x.fillStyle='white';x.fillRect(0,0,640,800);x.strokeStyle='#222';x.lineWidth=2;
    const line=(a,b)=>{a=RegistrationAlignment.project(m,...a);b=RegistrationAlignment.project(m,...b);x.beginPath();x.moveTo(a[0]*640,a[1]*800);x.lineTo(b[0]*640,b[1]*800);x.stroke();};
    for(const v of [0,.18,.42,.76,1])line([v,0],[v,1]);for(let i=0;i<=16;i++)line([0,i/16],[1,i/16]);return c.toDataURL();
  });
  const state=async()=>{if((await page.locator('#save-state').textContent()).includes('正在'))await page.locator('#save-state').filter({hasText:'草稿已保存'}).waitFor();return page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('ds-cylinder-registration-demo-v1');r.onsuccess=()=>{const q=r.result.transaction('draft').objectStore('draft').get('active');q.onsuccess=()=>{resolve(q.result);r.result.close();};};}));};
  await page.locator('#file').setInputFiles({name:'tilted.png',mimeType:'image/png',buffer:Buffer.from(image.split(',')[1],'base64')});await page.locator('#alignment-dialog').waitFor();
  ok('loading tilted image automatically opens rectified candidate',(await page.locator('#alignment-message').textContent()).includes('已找到')&&await page.locator('#align-target option').count()===16);
  ok('automatic candidate requires confirmation before building rows',await page.locator('#build').isDisabled());
  await page.screenshot({path:path.join(out,'auto-mobile.png')});
  await page.locator('#close-alignment').click();ok('cancel does not apply proposed geometry',!(await state()).alignmentConfirmed);
  await page.locator('#set-region').click();await page.locator('#auto-align').click();await page.locator('#alignment-dialog').waitFor();await page.locator('#accept-alignment').click();const aligned=await state();
  ok('accept commits projective geometry and original photo',aligned.geometry==='perspective'&&aligned.rowLines.length===17&&aligned.alignmentConfirmed&&aligned.photo===image);
  await page.locator('#build').click();ok('calibrated grid builds exactly 16 row pairs',await page.locator('.row-card').count()===16);
  await page.locator('[data-field=ctn]').first().fill('AR60CDE');await page.locator('[data-field=steel]').first().fill('000123');await page.locator('.check-label input').first().check();await state();
  await page.locator('#adjust-align').click();await page.locator('#align-right').click();await page.locator('#close-alignment').click();
  ok('cancelled manual changes preserve geometry, text and confirmation',JSON.stringify((await state()).quad)===JSON.stringify(aligned.quad)&&await page.locator('.check-label input').first().isChecked());
  await page.locator('#adjust-align').click();const corner=await page.locator('#alignment-overlay .hit[data-index="0"]').boundingBox();
  await page.mouse.move(corner.x+corner.width/2,corner.y+corner.height/2);await page.mouse.down();await page.mouse.move(corner.x+corner.width/2+4,corner.y+corner.height/2+3,{steps:4});await page.mouse.up();
  await page.locator('#align-grid').click();await page.locator('#alignment-overlay .hit[data-index="split"]').click();await page.locator('#align-right').click();await page.locator('#alignment-overlay .hit[data-index="1"]').click();await page.locator('#align-down').click();
  await page.locator('#align-zoom-in').click();ok('calibration zoom supports fine positioning',await page.locator('#align-zoom-label').textContent()==='150%');
  await page.locator('#accept-alignment').click();const modified=await state();
  ok('dragged corner, row boundary and column boundary are applied',modified.quad[0][0]>aligned.quad[0][0]&&modified.rowLines[1]>aligned.rowLines[1]&&modified.split>aligned.split);
  ok('changed crop retains manual text but requires review again',await page.locator('[data-field=ctn]').first().inputValue()==='AR60CDE'&&await page.locator('[data-field=steel]').first().inputValue()==='000123'&&!(await page.locator('.check-label input').first().isChecked()));
  await page.reload();await page.locator('.row-card').first().waitFor();const reloaded=await state();ok('reload retains nonuniform row lines and original image',JSON.stringify(reloaded.rowLines)===JSON.stringify(modified.rowLines)&&reloaded.photo===image);
  const download=page.waitForEvent('download');await page.locator('#backup').click();const saved=fs.readFileSync(await (await download).path());await page.locator('#restore').setInputFiles({name:'draft.json',mimeType:'application/json',buffer:saved});await page.locator('#status').filter({hasText:'草稿已匯入'}).waitFor();ok('export/import round trips calibrated geometry',JSON.stringify((await state()).quad)===JSON.stringify(modified.quad));
  const invalid=JSON.parse(saved);invalid.rowLines[2]=invalid.rowLines[1]-.01;await page.locator('#restore').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});await page.locator('#status').filter({hasText:'匯入失敗'}).waitFor();ok('crossed boundaries in imported draft are rejected without replacing work',JSON.stringify((await state()).rowLines)===JSON.stringify(modified.rowLines));
  const legacy=JSON.parse(saved);legacy.version='CYL-REG-DEMO-0.4-20261022';delete legacy.geometry;delete legacy.rowLines;delete legacy.alignmentConfirmed;legacy.rows[0].confirmed=true;
  await page.locator('#restore').setInputFiles({name:'demo04.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});await page.locator('#status').filter({hasText:'草稿已匯入'}).waitFor();const old=await state();ok('0.4 draft keeps legacy cropping and confirmed data without auto recalibration',old.geometry==='bilinear'&&old.rows[0].confirmed&&old.rows[0].steel==='000123'&&!(await page.locator('#alignment-dialog').isVisible()));
  const blank=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=600;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,400,600);return c.toDataURL();});
  await page.locator('#file').setInputFiles({name:'blank.png',mimeType:'image/png',buffer:Buffer.from(blank.split(',')[1],'base64')});await page.locator('#alignment-dialog').waitFor();
  ok('missing grid falls back to explicit four-corner editing',(await page.locator('#alignment-message').textContent()).includes('沒有找到')&&await page.locator('#align-target option').count()===4);
  await page.locator('#accept-alignment').click();ok('manual corners require rectified preview before acceptance',await page.locator('#alignment-dialog').isVisible()&&(await page.locator('#alignment-message').textContent()).includes('再確認'));
  await page.locator('#accept-alignment').click();ok('manual fallback permits local workflow',await page.locator('#build').isEnabled());
  ok('alignment never contacts an external service',external.length===0);ok('mobile page has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));ok('no browser errors',errors.length===0);
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({checks,errors,external,synthetic:true},null,2));console.log(JSON.stringify({checks,artifacts:out}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});


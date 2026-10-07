// Actual production store and IndexedDB; fixtures contain no business data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.EDGE_EXECUTABLE});let checks=0;
  const ok=(name,value)=>{assert.ok(value,name);checks++;console.log('PASS '+name);};
  try{
    const page=await browser.newPage();
    await page.route('http://iqc.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Storage fixture</title>'}));
    await page.goto('http://iqc.test/');
    await page.evaluate(async()=>{
      window.IqcProduction={allowed:true,owner:'TEST',endpoint:'https://script.google.com/macros/s/FIXTURE/exec',key:s=>'fixture:'+s};
      window.IqcSubmitModel31={protocol:'IQC_IMAGE_V1',environment:'IQC_IMAGE_PRODUCTION_V1'};
      window.IqcReviewModel31={candidates:p=>p.ocrText?[p.ocrText]:[]};
      await new Promise((resolve,reject)=>{const r=indexedDB.open(IqcProduction.key('ds_iqc_image_rc_v1'),1);r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('batches',{keyPath:'id'});d.createObjectStore('photos',{keyPath:'id'}).createIndex('batchId','batchId');d.createObjectStore('submissions',{keyPath:'submissionId'});};r.onerror=()=>reject(r.error);r.onsuccess=()=>{r.result.close();resolve();};});
    });
    await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../DS-IQC-IMAGE/iqc-ocr-batch-storage-rc31.js'),'utf8')});
    const write=(store,value)=>page.evaluate(({store,value})=>new Promise((resolve,reject)=>{const r=indexedDB.open(IqcProduction.key('ds_iqc_image_rc_v1'),1);r.onsuccess=()=>{const db=r.result,tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value);tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error);};};}),{store,value});
    const list=store=>page.evaluate(store=>new Promise(resolve=>{const r=indexedDB.open(IqcProduction.key('ds_iqc_image_rc_v1'),1);r.onsuccess=()=>{const db=r.result,tx=db.transaction(store),q=tx.objectStore(store).getAll();q.onsuccess=()=>resolve(q.result);tx.oncomplete=()=>db.close();};}),store);
    const inspect=id=>page.evaluate(id=>IqcBatchStore31.inspect(id),id);
    const remove=s=>page.evaluate(async s=>{try{await IqcBatchStore31.remove(s);return '';}catch(e){return e.message;}},s);
    const base={protocol:'IQC_IMAGE_V1',environment:'IQC_IMAGE_PRODUCTION_V1',endpoint:'https://script.google.com/macros/s/FIXTURE/exec',account:'TEST',payloadHash:'canonical-hash',status:'REJECTED',receipt:null,updatedAt:'2026-10-07T00:00:00Z'};
    async function seed(id,change={},batchChange={}){
      const record={...base,submissionId:id+'-submit',batchId:id,...change};
      await write('batches',{id,status:'DRAFT',submissionId:record.submissionId,...batchChange});
      for(let i=1;i<=2;i++)await write('photos',{id:id+'-photo'+i,batchId:id,status:'RECOGNIZED',ocrText:'AB12CDE',blob:new Uint8Array([1,2,3])});
      await write('submissions',record);return record;
    }
    for(const status of ['PENDING','SENDING','SENT_UNKNOWN','SYNCED','UNKNOWN']){
      const id='guard-'+status;await seed(id,{status});const s=await inspect(id);
      ok(status+' remains protected with no data loss',s.protected&&(await remove(s)).includes('不能移除')&&(await inspect(id)).photos.length===2);
    }
    const invalid=[['receipt',{receipt:{receiptId:'existing'}}],['account',{account:'OTHER'}],['endpoint',{endpoint:'another'}],['environment',{environment:'TEST'}],['protocol',{protocol:'OLD'}],['hash',{payloadHash:''}]];
    for(const [name,change] of invalid){const id='invalid-'+name;await seed(id,change);const s=await inspect(id);ok('rejected record with conflicting '+name+' stays protected',s.protected&&(await remove(s)).includes('不能移除'));}
    await seed('synced-batch',{}, {status:'SYNCED'});ok('accepted batch stays protected even if its record is inconsistent',(await inspect('synced-batch')).protected);
    await seed('queued-batch',{}, {status:'QUEUED'});ok('queued batch cannot be mistaken for a removable draft',(await inspect('queued-batch')).protected);
    await seed('missing-record',{}, {submissionId:'missing'});ok('missing latest submission cannot unlock a batch',(await inspect('missing-record')).protected);
    await seed('mixed');await write('submissions',{...base,submissionId:'older-pending',batchId:'mixed',status:'PENDING'});
    ok('all submission attempts are checked, including an older pending attempt',(await inspect('mixed')).protected);
    await seed('retry');await write('submissions',{...base,submissionId:'older-rejected',batchId:'retry'});
    const retry=await inspect('retry');ok('legacy rejection records without new flags are removable',!retry.protected&&retry.rejectedCount===2);
    const preflight=await page.evaluate(()=>IqcBatchStore31.preflight(['retry','mixed']));
    ok('confirmed rejection can be corrected and previewed while pending stays blocked',preflight.nonempty.includes('retry')&&preflight.blocked.some(b=>b.id==='mixed'));
    const changed=await seed('changed'),beforeChange=await inspect('changed');await write('submissions',{...changed,lastError:'different rejection'});
    ok('changed submission evidence invalidates an old confirmation',(await remove(beforeChange)).includes('已變更')&&(await inspect('changed')).photos.length===2);
    const late=await seed('late'),beforeLate=await inspect('late');await write('submissions',{...late,status:'SYNCED',receipt:{receiptId:'late'}});
    ok('a receipt arriving after confirmation blocks the transaction',(await remove(beforeLate)).includes('不能移除')&&(await inspect('late')).photos.length===2);
    await seed('late-new');const beforeNew=await inspect('late-new');await write('submissions',{...base,batchId:'late-new',submissionId:'late-new-pending',status:'PENDING'});
    ok('new pending attempt arriving after confirmation blocks deletion',(await remove(beforeNew)).includes('不能移除'));
    await seed('atomic');const atomic=await inspect('atomic');
    await page.evaluate(()=>{window.originalDelete=IDBObjectStore.prototype.delete;let count=0;IDBObjectStore.prototype.delete=function(...args){if(this.name==='photos'&&++count===2)throw Error('fixture write failure');return originalDelete.apply(this,args);};});
    ok('failed second-photo deletion rolls back the whole batch',await remove(atomic)==='fixture write failure'&&JSON.stringify(await inspect('atomic'))===JSON.stringify(atomic));
    await page.evaluate(()=>{IDBObjectStore.prototype.delete=originalDelete;});
    const allBefore=await list('submissions'),otherBefore=await inspect('atomic');
    ok('confirmed rejected draft and its photos are removed',await remove(retry)===''&&!(await inspect('retry')).batch&&(await inspect('retry')).photos.length===0);
    ok('all submission evidence and other batches remain unchanged',JSON.stringify(await list('submissions'))===JSON.stringify(allBefore)&&JSON.stringify(await inspect('atomic'))===JSON.stringify(otherBefore));
    console.log(JSON.stringify({checks}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

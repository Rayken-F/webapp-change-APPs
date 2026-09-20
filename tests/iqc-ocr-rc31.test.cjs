const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.join(__dirname,'../ds-app-grinding-recovery-rc');
const {Engine}=require(path.join(dir,'iqc-ocr-engine-rc31.js'));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function deferred(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};}
function setup(options={}){
  const stats={created:0,killed:0,images:[],parameters:[],active:0,max:0};
  const engine=new Engine({initMs:100,jobMs:60,idleMs:20,...options,create:()=>{
    stats.created++;let dead=false;
    const worker={setParameters:async p=>stats.parameters.push(p),recognize:async image=>{
      stats.images.push(image);stats.active++;stats.max=Math.max(stats.max,stats.active);
      try{return options.recognize?await options.recognize(image):{data:{text:image}};}finally{stats.active--;}
    }};
    const ready=options.ready?options.ready(worker):Promise.resolve(worker);
    return {ready,terminate:()=>{if(!dead)stats.killed++;dead=true;}};
  }});return {engine,stats};
}
test('three photos and a later addition use one actual initialization',async()=>{
  const {engine:e,stats:s}=setup();const a=e.ensure(),b=e.ensure();assert.equal(a,b);await a;
  for(const p of ['first','second','third','later'])assert.equal((await e.recognize(p)).data.text,p);
  assert.equal(s.created,1);assert.deepEqual(s.images,['first','second','third','later']);assert.equal(s.max,1);e.dispose();assert.equal(s.killed,1);
});
test('cancel before initialization starts does not spawn an orphan',async()=>{
  const {engine:e,stats:s}=setup();const p=e.ensure();e.dispose();await assert.rejects(p,{code:'CANCELLED'});assert.equal(s.created,0);
});
test('initialization timeout terminates pending native worker, next try is fresh',async()=>{
  const gate=deferred();let first=true;const {engine:e,stats:s}=setup({initMs:15,ready:w=>{if(first){first=false;return gate.promise.then(()=>w);}return Promise.resolve(w);}});
  await assert.rejects(e.ensure(),{code:'initialize_TIMEOUT'});assert.equal(s.killed,1);
  await e.recognize('retry first photo');gate.resolve();await delay(5);assert.equal(s.created,2);assert.equal(s.killed,1);e.dispose();
});
test('recognition timeout disposes worker; late result cannot become the next result',async()=>{
  const late=deferred();let first=true;const {engine:e,stats:s}=setup({jobMs:15,recognize:async image=>{if(first){first=false;return late.promise;}return {data:{text:image}};}});
  await assert.rejects(e.recognize('old'),{code:'recognize_TIMEOUT'});assert.equal(s.killed,1);
  const next=await e.recognize('new');late.resolve({data:{text:'stale'}});await delay(5);assert.equal(next.data.text,'new');assert.equal(s.created,2);e.dispose();
});
test('duplicate clicks cannot execute recognition concurrently',async()=>{
  const gate=deferred();const {engine:e,stats:s}=setup({recognize:()=>gate.promise});const first=e.recognize('one');
  await assert.rejects(e.recognize('two'),{code:'OCR_BUSY'});gate.resolve({data:{text:'one'}});await first;assert.deepEqual(s.images,['one']);e.dispose();
});
test('cancellation rejects active recognition and is safe to repeat',async()=>{
  const {engine:e,stats:s}=setup({recognize:()=>new Promise(()=>{})});const pending=e.recognize('one');await delay(5);e.dispose();e.dispose();await assert.rejects(pending,{code:'CANCELLED'});assert.equal(s.killed,1);
});
test('idle release frees engine, a later batch can restart',async()=>{
  const {engine:e,stats:s}=setup();await e.recognize('one');e.release();await delay(35);assert.equal(s.killed,1);await e.recognize('two');assert.equal(s.created,2);e.dispose();
});
test('worker initialization error is retryable',async()=>{
  let first=true;const {engine:e,stats:s}=setup({ready:w=>{if(first){first=false;return Promise.reject(Error('download failed'));}return Promise.resolve(w);}});
  await assert.rejects(e.ensure());assert.equal(s.killed,1);await e.recognize('retry');assert.equal(s.created,2);e.dispose();
});
test('RC31 entry selects only one OCR controller and keeps read-only guard',()=>{
  const html=fs.readFileSync(path.join(dir,'v31.html'),'utf8');
  assert.match(html,/iqc-ocr-runtime-rc31/);assert.match(html,/iqc-image-safety-guard-rc-v1/);
  for(const s of ['iqc-intake-runtime-v25','iqc-single-photo-batch-v31','iqc-hybrid-stuck-guard-v15','iqc-ocr-transaction-guard-v9','iqc-hybrid-button-stability-v19'])assert.ok(!html.includes(s));
  assert.ok(html.indexOf('iqc-ocr-runtime-rc31')<html.indexOf('iqc-image-intake-rc-v1'));
  assert.ok(html.indexOf('__DS_IQC_RC31={booting:true')<html.indexOf('iqc-ocr-engine-rc31'));
});
test('RC30 rules still retain ordered group headers and continuation CTNs',()=>{
  const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(dir,'iqc-ocr-rules-rc31.js'),'utf8'),context);const r=context.window.IqcOcrRules31;
  const text='113374 CYLINDER OCYL 7209 TOTAL 2\nAB12CDE\nFG34HIJ';
  assert.equal(r.structuralState(text).complete,true);assert.equal(r.parseEvents(text).length,3);assert.equal(r.structuralState('AB12CDE').kind,'CONTINUATION');
});

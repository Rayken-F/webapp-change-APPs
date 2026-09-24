const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.join(__dirname,'../ds-app-grinding-recovery-rc');
const {Engine}=require(path.join(dir,'iqc-ocr-engine-rc31.js'));
const {workerFault,recoverable}=require(path.join(dir,'iqc-ocr-engine-rc31.js'));
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

test('worker failures retain a safe category and action without raw error contents',()=>{
  const inputs=[['TypeError: Failed to fetch https://example.invalid/?token=SECRET','WORKER_ASSET_NETWORK'],['initialization failed','WORKER_MODEL'],['RuntimeError: memory access out of bounds','WORKER_MEMORY'],['CompileError: WebAssembly module','WORKER_WASM'],['Error in pixReadMem: image not read','WORKER_IMAGE'],['unexpected private details','WORKER_ENGINE']];
  for(const [raw,code] of inputs){const e=workerFault(raw,'recognize');assert.equal(e.code,code);assert.equal(e.workerAction,'recognize');assert.equal(e.message,code);assert.ok(!JSON.stringify(e).includes(raw));}
  assert.equal(workerFault('unknown','PRIVATE_ACTION').workerAction,'unknown');
});

test('only explicit worker faults permit recovery; bad images and cancellation do not',()=>{
  for(const code of ['WORKER_ASSET_NETWORK','WORKER_MODEL','WORKER_MEMORY','WORKER_ENGINE','WORKER_CRASH','LIB_LOAD'])assert.equal(recoverable({code}),true);
  for(const code of ['WORKER_IMAGE','CANCELLED','PHOTO_TIMEOUT','recognize_TIMEOUT','STORAGE_ERROR','OCR_BUSY'])assert.equal(recoverable({code}),false);
});

test('raw recognition rejection is categorized before releasing the worker',async()=>{
  const {engine,stats}=setup({recognize:()=>Promise.reject('RuntimeError: memory access out of bounds')});
  await assert.rejects(engine.recognize('test'),{code:'WORKER_MEMORY'});assert.equal(stats.killed,1);assert.equal(engine.slot,null);
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

const rules=require(path.join(dir,'iqc-ocr-rules-rc31.js'));
test('CTN-only photo finishes extraction without repeated OCR for absent RT',()=>{
  const text='EX71MHT\nBH20EPJ\nBH19XQX';
  assert.equal(rules.structuralState(text).found,3);
  assert.equal(rules.structuralState(text).complete,false);
  assert.equal(rules.needsSparse(text),false);
  assert.equal(rules.needsHighContrast(text),false);
  assert.deepEqual(rules.parseText(text).groups,[]);
});
test('missing status, plant or quantity does not make existing CTNs an OCR failure',()=>{
  for(const text of ['113374 CYLINDER\nAB12CDE','113374 CYLINDER OCYL\nAB12CDE','113374 CYLINDER UNKNOWN UNKNOWN TOTAL 1\nAB12CDE']){
    assert.equal(rules.structuralState(text).found,1);
    assert.equal(rules.structuralState(text).complete,false);
    assert.equal(rules.needsSparse(text),false);
    assert.equal(rules.needsHighContrast(text),false);
  }
});
test('leading CTNs survive a later empty header and remain unassigned',()=>{
  const text='EX71MHT\nBH20EPJ\n113374 CYLINDER OCYL 7209';
  const merged=rules.mergeParsedPasses([{data:{text}}]);
  assert.equal(rules.structuralState(merged).found,2);
  assert.deepEqual(rules.parseText(merged).leading,['EX71MHT','BH20EPJ']);
  assert.equal(rules.needsSparse(merged),false);
});
test('zero candidates and known quantity gaps still permit bounded OCR fallbacks',()=>{
  for(const text of ['NEXT PAGE','113374 CYLINDER OCYL 7209 TOTAL 2\nAB12CDE']){
    assert.equal(rules.needsSparse(text),true);assert.equal(rules.needsHighContrast(text),true);
  }
  assert.equal(rules.needsSparse('113374 CYLINDER OCYL 7209 TOTAL 2\nAB12CDE\nFG34HIJ'),false);
});
test('candidate total counts unique CTNs including unassigned leading entries',()=>{
  const s=rules.structuralState('EX71MHT\n113374 CYLINDER OCYL 7209 TOTAL 2\nEX71MHT\nBH20EPJ');
  assert.equal(s.found,2);assert.equal(s.complete,false);
});

function positioned(rows){return {data:{text:rows.map(r=>r[0]).join('\n'),blocks:[{paragraphs:[{lines:rows.map(([text,y,confidence=90])=>({text:text+'\n',confidence,bbox:{x0:20,y0:y,x1:200,y1:y+30},words:[{text,confidence,bbox:{x0:20,y0:y,x1:200,y1:y+30}}]}))}]}]}};}

test('rejected CTN-shaped row triggers another read despite other valid CTNs and absent RT',()=>{
  const p=positioned([['AB12CDE',10],['FGB34HIJ',60]]);
  assert.equal(rules.structuralState(p.data.text).found,1);
  assert.equal(rules.needsRowCheck(p),true);
  const recovered=rules.reconcileRows([p,positioned([['AB12CDE',10],['FG34HIJ',60]])]);
  assert.deepEqual(rules.parseText(recovered.text).leading,['AB12CDE','FG34HIJ']);
  assert.equal(recovered.unread.length,0);
});

test('different readings of the same physical row are a conflict, not two CTNs',()=>{
  const out=rules.reconcileRows([positioned([['AB12CD5',10]]),positioned([['AB12CDS',11]])]);
  assert.equal(rules.structuralState(out.text).found,1);
  assert.deepEqual(out.uncertain[0].alternatives,['AB12CD5','AB12CDS']);
  assert.equal(out.uncertain[0].reason,'CONFLICT');
});

test('a stronger later reading replaces a low-confidence guess but keeps a visible conflict',()=>{
  const out=rules.reconcileRows([positioned([['AB12CDO',10,0]]),positioned([['AB12CD9',10,45]])]);
  assert.deepEqual(rules.parseText(out.text).leading,['AB12CD9']);
  assert.equal(out.uncertain[0].ctn,'AB12CD9');assert.equal(out.uncertain[0].reason,'CONFLICT');
  assert.deepEqual(out.uncertain[0].alternatives,['AB12CDO','AB12CD9']);
});

test('two adjacent real rows remain distinct even with similar characters',()=>{
  const out=rules.reconcileRows([positioned([['AB12CD5',10],['AB12CDS',60]])]);
  assert.equal(rules.structuralState(out.text).found,2);
});

test('missing RT alone does not trigger row check; low confidence and unresolved rows remain explicit',()=>{
  assert.equal(rules.needsRowCheck(positioned([['AB12CDE',10],['FG34HIJ',60]])),false);
  const out=rules.reconcileRows([positioned([['AB12CDE',10,20],['FGB34HIJ',60]])]);
  assert.equal(out.unread[0].raw,'FGB34HIJ');assert.equal(out.uncertain[0].ctn,'AB12CDE');
  assert.equal(out.uncertain[0].reason,'LOW_CONFIDENCE');
});

test('row reconciliation retains RT headers, leading entries and groups',()=>{
  const out=rules.reconcileRows([positioned([['AB12CDE',10],['113374 CYLINDER OCYL 7209 TOTAL 1',60],['FG34HIJ',110]])]);
  assert.deepEqual(rules.parseText(out.text),{leading:['AB12CDE'],groups:[{rt:'113374',status:'OCYL',plant:'7209',expected:1,ctns:['FG34HIJ']}]});
});

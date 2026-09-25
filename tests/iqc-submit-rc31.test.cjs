const {test}=require('node:test'),assert=require('node:assert/strict');
const m=require('../ds-app-grinding-recovery-rc/iqc-submit-model-rc31.js');
const photo=(id,text)=>({id,seq:id==='a'?1:2,status:'RECOGNIZED',ocrText:text});
const snap=(photos)=>({batch:{id:'IQCIMG_TEST',status:'DRAFT',regionCode:'B3'},photos});
const first='113353 CYLINDER OCYL 7209 TOTAL 2\nAB12CDE\nFG34HIJ';
test('saved manual CTN and RT are used; duplicate photos count once',()=>{
  const a=photo('a',first),b=photo('b','AB12CDE');
  b.rc31Review={ctns:{AB12CDE:{ctn:'AB12CDE',rt:'113353',status:'OCYL',plant:'7209',expected:2}}};
  const d=m.draft(snap([a,b]));assert.equal(d.items.length,2);assert.equal(d.duplicateCount,1);
});
test('unassigned duplicate hidden in presentation still blocks submission',()=>assert.throws(()=>m.draft(snap([photo('a',first),photo('b','AB12CDE')])),/歸屬/));
test('conflicting source assignment blocks all rows',()=>assert.throws(()=>m.draft(snap([photo('a',first),photo('b','113374 CYLINDER OCYL 7209 TOTAL 1\nAB12CDE')])),/不同 RT/));
test('empty, missing region, failed image, and unfinished image are not submissions',()=>{
  assert.throws(()=>m.draft(snap([])),/空批次/);
  assert.throws(()=>m.draft({...snap([photo('a',first)]),batch:{status:'DRAFT'}}),/區域/);
  assert.throws(()=>m.draft(snap([photo('a',first),photo('b','')])),/尚無 CTN/);
  assert.throws(()=>m.draft(snap([{...photo('a',first),status:'FAILED'}])),/未完成/);
});
test('frozen batch and incomplete status are blocked',()=>{
  assert.throws(()=>m.draft({...snap([photo('a',first)]),batch:{status:'QUEUED'}}),/查收據/);
  const a=photo('a','AB12CDE');a.rc31Review={ctns:{AB12CDE:{ctn:'AB12CDE',rt:'113353',status:'',plant:''}}};assert.throws(()=>m.draft(snap([a])),/歸屬/);
});
test('count discrepancy is shown for explicit manual confirmation, not silently dropped',()=>{
  const d=m.draft(snap([photo('a',first.replace('TOTAL 2','TOTAL 18'))]));assert.equal(d.items.length,2);assert.match(d.warnings[0],/18/);
});
test('payload excludes image bytes, user name, and client date',()=>{
  const s=snap([photo('a',first)]),p=m.payload(s,m.draft(s),'id');
  assert.deepEqual(Object.keys(p),['protocol','environment','submissionId','batchId','regionCode','reviewed','items']);
});
test('ok pending/null receipt cannot complete, mismatched receipt cannot complete',()=>{
  const r={submissionId:'id',account:'tester',payloadHash:'hash',payload:{items:[{},{}]}};
  const receipt={receiptId:'r',submissionId:'id',account:'tester',payloadHash:'hash',rowCount:2,startRow:2,endRow:3,writtenAt:'now',environment:m.environment,station:'IQC',sheetName:'IQC_Log'};
  const d={ok:true,protocol:m.protocol,environment:m.environment,receipt};assert.equal(m.receipt(d,r),true);
  for(const patch of [{pending:true},{receipt:null},{environment:'production'},{receipt:{...receipt,rowCount:1}},{receipt:{...receipt,account:'other'}},{receipt:{...receipt,payloadHash:'different'}},{receipt:{...receipt,submissionId:'other'}},{receipt:{...receipt,endRow:4}}])assert.equal(m.receipt({...d,...patch},r),false);
});

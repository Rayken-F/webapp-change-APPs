const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const folder=path.join(__dirname,'../DS-CYLINDER-REGISTRATION-DEMO');
const R=require(folder+'/rules.js'),M=require(folder+'/model.js'),H=require(folder+'/handwriting-core.js');
test('complete identifiers use all positional rules and steel has no fixed length',()=>{
  for(const c of ['AB00CD0','AB12CDZ','LJ21KH0'])assert(R.ctnValid(c));
  for(const c of ['AB12CDE8','AB12CD','1B12CDE','A112CDE','ABO1CDE','AB1ICDE','AB121DE','AB12C1E','AB12CD$'])assert(!R.ctnValid(c),c);
  for(const s of ['00A','21A0','26A000123','00Z'+'0'.repeat(100)])assert(R.steelValid(s),s);
  for(const s of ['21','A1A000','21A0O0','210000','21AA00','21A-00'])assert(!R.steelValid(s),s);
});
test('invalid rules prevent confirmation and output without modifying original values',()=>{
  for(const [ctn,steel]of [['AB12C1E','21A000'],['AB12CDE','21A0O0']]){
    const r={...M.row(),ctn,steel,confirmed:true};assert(!M.ready([r]));assert.throws(()=>M.complete([r],'123',0));assert.equal(r.ctn,ctn);assert.equal(r.steel,steel);
  }
});
test('scanner rejects wrong types, embedded whitespace, duplicate and missing target without mutation',()=>{
  const rows=[M.row(0),M.row(1)];M.scanCtn(rows,0,'ab12cd0\r\n');const before=JSON.stringify(rows);
  for(const value of ['AB12CD0','AB12C10','AB12CD','AB12CD00','AB 12CD1','AB12CD$'])assert.throws(()=>M.scanCtn(rows,1,value));
  assert.throws(()=>M.scanCtn(rows,3,'AB12CD1'));assert.equal(JSON.stringify(rows),before);
});
test('scanning locks only CTN and a late OCR reply cannot overwrite it',()=>{
  const rows=[M.row(0)],r=rows[0];M.scanCtn(rows,0,'AB12CD0');
  assert.equal(M.locked(r,'ctn'),true);assert.equal(M.locked(r,'steel'),false);
  assert(M.applyCandidate(r,{text:'AB12CDO',score:.99},{text:'21A000123',score:.99}));
  assert.equal(r.ctn,'AB12CD0');assert.equal(r.steel,'21A000123');assert.equal(r.confirmed,false);
  assert.equal(M.confidence(r).length,0,'scanner is not flagged for missing OCR score');
  assert.equal(M.scanCtn(rows,0,'AB12CD0'),false,'repeated same-row scan is idempotent');
});
test('independent manual edits protect their field while OCR can fill the other',()=>{
  for(const field of ['ctn','steel']){
    const r=M.row(),value=field==='ctn'?'AB12CDE':'21A0123';M.edit(r,field,value);
    assert(M.applyCandidate(r,'CD34EF0','00A0001'));assert.equal(r[field],value);
    assert.equal(r[field==='ctn'?'steel':'ctn'],field==='ctn'?'00A0001':'CD34EF0');
  }
});
test('manual scanner corrections and replacements invalidate completion, then bind new barcode values',()=>{
  const rows=[{...M.row(),steel:'00A001'}],r=rows[0];M.scanCtn(rows,0,'AB12CD0');r.confirmed=true;M.complete(rows,'00123',0);
  M.scanCtn(rows,0,'AB12CD1');assert(!r.confirmed);assert.equal(r.registered,null);
  M.edit(r,'ctn','AB12CDZ');assert.equal(r.ctnSource,'manual');assert(M.locked(r,'ctn'));
  r.confirmed=true;M.complete(rows,'00123',0);assert(M.csv(rows,'00123').includes('AB12CDZ'));
});
test('candidate ranking follows full CTN and steel rules without text substitutions or fixed steel length',()=>{
  assert.equal(H.choose([{text:'AB12C10',score:.99},{text:'AB12CL0',score:.8}],'ctn').text,'AB12CL0');
  assert.equal(H.choose([{text:'21AOO01',score:.99},{text:'21A0001',score:.8}],'steel').text,'21A0001');
  assert.equal(H.choose([{text:'21AOO01',score:.99}],'steel').text,'21AOO01');
  assert.equal(H.choose([{text:'00A'+'0'.repeat(100),score:.99}],'steel').text.length,103);
});
test('format constrained decoding uses observed glyph alternatives and keeps originals for review',()=>{
  const chars=['','A','B','I','1','2','C','D','0'],ids=[1,2,5,3,6,7,8],n=chars.length,data=new Float32Array(ids.length*n);
  ids.forEach((v,i)=>{data[i*n+v]=.8;});data[3*n+4]=.18;
  const decoded=H.decode({dims:[1,7,n],data},chars),alt=H.constrain(decoded,'ctn');
  assert.equal(decoded.text,'AB2ICD0');assert.equal(alt.text,'AB21CD0');assert(alt.lowConfidence&&alt.glyphReview);
  const chosen=H.choose([decoded,alt],'ctn');assert.equal(chosen.text,'AB21CD0');assert(chosen.alternatives.includes('AB2ICD0'));
  data[3*n+4]=.01;assert.equal(H.constrain(H.decode({dims:[1,7,n],data},chars),'ctn'),null,'weak unsupported replacement is rejected');
});
test('position constraints cannot insert or delete characters to make a CTN fit',()=>{
  for(const text of ['AB12CD','AB12CD00'])assert.equal(H.constrain({text,tokens:[...text].map(text=>({text,score:.9,options:[]}))},'ctn'),null);
});
test('CTN last character conflicts stay explicit even when both codes match the format',()=>{
  const picked=H.choose([{text:'AB12CD0',score:.95},{text:'AB12CDO',score:.94}],'ctn');
  assert(picked.lastReview);assert.equal(picked.alternatives.length,2);
  const r=M.row();M.applyCandidate(r,picked,{text:'21A0',score:.99});assert(M.confidence(r).some(v=>v.includes('最後一碼')));assert(!r.confirmed);
});
test('active worker uses shared rules and independent model rereads for both fields, without slashed-zero processing',async()=>{
  const calls=[],messages=[],imports=[];
  const context={self:{},Uint8Array,Uint8ClampedArray,Float32Array,TextEncoder,URL,importScripts:(...p)=>imports.push(...p),postMessage:v=>messages.push(v),RegistrationHandwriting:H};
  vm.createContext(context);vm.runInContext(fs.readFileSync(folder+'/handwriting-worker.js','utf8'),context);
  assert.deepEqual(imports,['rules.js','handwriting-core.js']);
  context.call=(engine)=>{calls.push(engine);return {text:engine==='main'?'AB12CD0':'AB12CDO',score:.95,tokens:[]};};
  vm.runInContext("session='main';reviewSession='review';reread=async(source,engine)=>call(engine);",context);
  for(const field of ['ctn','steel'])await context.self.onmessage({data:{id:field,type:'recognize',field,image:{width:10,height:10,data:new Uint8Array(300).fill(255)}}});
  assert.equal(calls.length,8);assert.equal(calls.filter(v=>v==='review').length,4);assert(messages[0].result.lastReview);assert(messages.every(v=>!v.error));
});

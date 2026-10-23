const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const H=require('../DS-CYLINDER-REGISTRATION-DEMO/handwriting-core.js'),M=require('../DS-CYLINDER-REGISTRATION-DEMO/model.js');
test('CTC collapses adjacent repeats but preserves repeated digits separated by blank',()=>{
  const ids=[0,1,1,0,1,2,2,0],data=new Float32Array(ids.length*3);ids.forEach((v,i)=>data[i*3+v]=.9);
  assert.equal(H.decode({dims:[1,8,3],data},['','0','A']).text,'00A');
  assert.throws(()=>H.decode({dims:[1,8,4],data},['','0','A']),/MODEL_FORMAT/);
});
test('candidate selection never substitutes O/0, removes punctuation, or claims confirmation',()=>{
  const picked=H.choose([{text:'AB12CD$',score:.99},{text:'AB12CD0',score:.8}],'ctn');
  assert.equal(picked.text,'AB12CD0');assert.deepEqual(picked.alternatives,['AB12CD0','AB12CD$']);
  const letters=H.choose([{text:'YPO',score:.9},{text:'YP0',score:.8}],'ctn');assert.equal(letters.text,'YPO');assert.equal(letters.alternatives.length,2);
  const r=M.row(0);M.applyCandidate(r,letters,{text:'000123',alternatives:['000123','000I23']});assert.equal(r.steel,'000123');assert.equal(r.confirmed,false);
  r.edited=true;assert.equal(M.applyCandidate(r,{text:'ZZZ'},'999999'),false);assert.equal(r.ctn,'YPO');
});
test('full CTN requires digits in positions 3 and 4 when ranking observed candidates',()=>{
  const picked=H.choose([{text:'ABJICDE',score:.99},{text:'AB21CDE',score:.64}],'ctn');
  assert.equal(picked.text,'AB21CDE');assert(picked.alternatives.includes('ABJICDE'));
  for(const text of ['ABOICDE','AB1ICDE','ABI1CDE'])assert.equal(H.choose([{text,score:.99}],'ctn').text,text,'no fabricated numeric substitutions');
  assert.equal(H.choose([{text:'AB2ICDE',score:.6},{text:'AB2CDE',score:.99}],'ctn').text,'AB2ICDE','no shorter candidate replaces complete-length evidence when none passes positions');
  assert.equal(H.choose([{text:'AB00OI0',score:.8}],'ctn').text,'AB00OI0','zeros and letters outside numeric positions stay intact');
  assert.equal(H.choose([{text:'YPO',score:.9}],'ctn').text,'YPO','legacy suffix is not mistaken for full CTN positions');
  assert.equal(H.choose([{text:'ABJICDE',score:.99},{text:'AB21CDE',score:.64}],'steel').text,'ABJICDE','CTN rule never constrains steel');
});
test('blue ink extraction removes disconnected adjacent-row fragments without changing source',()=>{
  const w=80,h=55,data=new Uint8ClampedArray(w*h*3).fill(255);
  const blue=(x,y)=>{const i=(y*w+x)*3;data[i]=40;data[i+1]=50;data[i+2]=100;};
  for(let y=2;y<5;y++)for(let x=10;x<15;x++)blue(x,y);
  for(let y=22;y<45;y++)for(let x=30;x<45;x++)blue(x,y);
  const original=data.slice(),ink=H.blueInk({width:w,height:h,data});assert.equal(ink.width,39);assert.equal(ink.height,47);assert.deepEqual(data,original);
  assert.equal(H.blueInk({width:w,height:h,data:new Uint8ClampedArray(w*h*3).fill(255)}),null);
});
test('model tensor uses BGR, aspect ratio and zero padding',()=>{
  const t=H.tensor({width:1,height:1,data:Uint8ClampedArray.of(255,0,0)});assert.deepEqual(t.dims,[1,3,48,320]);
  assert.equal(t.data[0],-1);assert.equal(t.data[2*48*320],1);assert.equal(t.data[48],0);
});
test('glyph rereads must agree above threshold and change only the designated ambiguity',()=>{
  const base=H.choose([{text:'AR61BC2',score:.99}],'ctn'),snapshot=JSON.stringify(base);
  const same=text=>[{text,score:.95},{text,score:.94}];
  assert.equal(H.refine(base,same('AR61BC2'),'R','Y',.65),base,'genuine R stays R');
  assert.equal(H.refine(base,same('AR61BC2'),'6','0',.9),base,'genuine 6 stays 6');
  for(const text of ['AY01BC2','AY61BC','AY61BC2X','A�61BC2','AY61BZ2'])assert.equal(H.refine(base,same(text),'R','Y',.65),base,text);
  assert.equal(H.refine(base,[{text:'AY61BC2',score:.99}],'R','Y',.65),base);
  assert.equal(H.refine(base,[{text:'AY61BC2',score:.99},{text:'AR61BC2',score:.99}],'R','Y',.65),base);
  assert.equal(H.refine(base,[{text:'AY61BC2',score:.99},{text:'AY61BC2',score:.64}],'R','Y',.65),base);
  const revised=H.refine(base,same('AY61BC2'),'R','Y',.65);
  assert.equal(revised.text,'AY61BC2');assert(revised.alternatives.includes('AR61BC2'));assert.equal(revised.glyphReview,true);assert.equal(JSON.stringify(base),snapshot);
});
test('second model zero review preserves prefix, zeros, slashed evidence and manual confirmation boundary',()=>{
  const base={text:'6A0067',alternatives:['6A0067'],slashedZeros:2};
  const revised=H.refine(base,[{text:'0A0067',score:.99},{text:'0A0067',score:.99}],'6','0',.9);
  assert.equal(revised.text,'0A0067');assert.equal(revised.unverifiedZeros,1);assert.equal(revised.slashedZeros,2);
  const r=M.row(0);M.applyCandidate(r,{text:'AB12CDE'},revised);assert.equal(r.steelGlyphReview,true);assert.equal(r.confirmed,false);
  r.confirmed=true;assert.equal(M.applyCandidate(r,'AB12CDF','99'),false);assert.equal(r.steel,'0A0067');
  for(const score of [NaN,Infinity,undefined])assert.equal(H.refine(base,[{text:'0A0067',score},{text:'0A0067',score:1}],'6','0',.9),base);
});
test('stroke reread copies source, uses circular bounds, and cannot invent ink on blank input',()=>{
  const s={width:9,height:9,data:new Uint8Array(9*9*3).fill(255)};s.data.fill(30,(4*9+4)*3,(4*9+4)*3+3);const before=s.data.slice();
  const a=H.thicken(s,1),b=H.thicken(s,2);
  assert.deepEqual(s.data,before);assert.equal([...a.data].filter(v=>v===0).length,5*3);assert.equal([...b.data].filter(v=>v===0).length,13*3);
  assert.throws(()=>H.thicken(s,8),/STROKE_RADIUS/);
  assert.equal(H.thicken({...s,data:new Uint8Array(s.data.length).fill(255)},2).data.every(v=>v===255),true);
  const padded=H.padded(s);assert.equal(padded.width,33);assert.equal(padded.data[((4+12)*33+4+12)*3],30);
});
test('review model dictionary retains explicit invalid characters instead of deleting unknown output',()=>{
  const meta=JSON.parse(fs.readFileSync(path.join(__dirname,'../DS-CYLINDER-REGISTRATION-DEMO/handwriting-review-model.json'))),chars=Array(meta.size).fill('�');chars[0]='';
  for(const [i,c]of meta.ascii)chars[i]=c;
  const unknown=chars.indexOf('�'),data=new Float32Array(meta.size);data[unknown]=.99;
  const decoded=H.decode({dims:[1,1,meta.size],data},chars);assert.equal(decoded.text,'�');
  assert.equal(new Set(meta.ascii.map(v=>v[0])).size,meta.ascii.length);assert.equal(chars.length,18710);
});
function harness(){
  const workers=[],timers=new Map();let id=0;
  class Worker{constructor(){workers.push(this);}postMessage(m){this.sent??=[];this.sent.push(m);}terminate(){this.dead=true;}emit(data){this.onmessage({data});}}
  const context={URL,Worker,document:{currentScript:{src:'http://local/ocr.js'}},window:{dispatchEvent(){}},CustomEvent:class{},setTimeout(fn){timers.set(++id,fn);return id;},clearTimeout(i){timers.delete(i);}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../DS-CYLINDER-REGISTRATION-DEMO/ocr.js'),'utf8'),context);
  return {api:context.window.RegistrationOcr,workers,timers,canvas:{width:1,height:1,getContext:()=>({getImageData:()=>({width:1,height:1,data:Uint8ClampedArray.of(0,0,0,255)})})}};
}
test('stop during model loading rejects promptly and late old-worker reply cannot fill new job',async()=>{
  const h=harness(),first=h.api.recognize(h.canvas),reject=assert.rejects(first,{code:'CANCELLED'}),old=h.workers[0];h.api.stop();await reject;assert.equal(old.dead,true);
  const second=h.api.recognize(h.canvas),current=h.workers[1];old.emit({id:old.sent[0].id,result:true});assert.equal(current.sent.length,1);
  current.emit({id:current.sent[0].id,result:true});await new Promise(setImmediate);assert.equal(current.sent[1].type,'recognize');
  current.emit({id:current.sent[1].id,result:{text:'AB12CDE'}});assert.equal((await second).text,'AB12CDE');h.api.stop();
});
test('model failure and initialization timeout release worker and permit retry',async()=>{
  const h=harness(),first=h.api.recognize(h.canvas),fail=assert.rejects(first,{code:'LIB_LOAD'});h.workers[0].emit({id:1,error:'LIB_LOAD'});await fail;assert.equal(h.workers[0].dead,true);
  const second=h.api.recognize(h.canvas),timeout=assert.rejects(second,{code:'MODEL_TIMEOUT'});[...h.timers.values()][0]();await timeout;assert.equal(h.workers[1].dead,true);
});

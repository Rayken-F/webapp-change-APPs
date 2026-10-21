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

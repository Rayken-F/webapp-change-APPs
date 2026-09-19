const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {create}=require('../auth-transport.js');
function fixture(){
 let receive,frame;const calls=[];const origin='https://n-fixture-script.googleusercontent.com';
 const window={crypto,addEventListener:(_n,f)=>receive=f};
 const document={createElement:()=>({setAttribute(){},remove(){}}),body:{appendChild:f=>frame=f}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../auth-bridge.js'),'utf8'),{window,document,URL,Map,Date,Error,setTimeout,clearTimeout});
 const bridge=window.DsAuthBridge.create({url:'https://script.google.com/macros/s/fixture/exec'}),nonce=new URL(frame.src).searchParams.get('bridge_nonce');
 const respond=(source,type,id,data,extra={})=>receive({origin,source,data:{channel:'DS_AUTH_BRIDGE_K4',nonce,type,id,data},...extra});
 const peer={postMessage(m,target){assert.equal(target,origin);calls.push(m);queueMicrotask(()=>{if(m.type==='PING')respond(peer,'PONG',m.id);else respond(peer,'RESULT',m.id,{ok:true,authDiagnostic:{requestId:m.payload.request_id,totalMs:10,phases:{session:10}}});});}};
 return {bridge,calls,peer,respond,ready:()=>respond(peer,'READY',''),nonce,currentNonce:()=>new URL(frame.src).searchParams.get('bridge_nonce')};
}
test('a ready connection handles consecutive authentications with no HTTP credential resubmission',async()=>{
 const f=fixture();f.ready();let fetches=0;const records=[];
 const t=create({url:'fixture',bridge:f.bridge,onDiagnostic:r=>records.push(r),fetch:async()=>{fetches++;throw Error('Unexpected POST');}});
 for(let i=0;i<5;i++)assert.equal((await t.post('workstation_bootstrap',{session_token:'fixture-secret'})).ok,true);
 assert.equal(fetches,0);assert.equal(f.calls.filter(c=>c.type==='AUTH').length,5);assert.equal(records.every(r=>r.transport==='google_rpc'&&r.server.totalMs===10),true);
 assert.equal(JSON.stringify(records).includes('fixture-secret'),false);
});
test('an unready bridge falls back immediately and sends exactly one authentication',async()=>{
 const f=fixture();let fetches=0;const records=[];
 const t=create({url:'fixture',bridge:f.bridge,onDiagnostic:r=>records.push(r),fetch:async()=>{fetches++;return {ok:true,text:async()=>'{"ok":true}'};}});
 await t.post('workstation_login',{password:'fixture'});assert.equal(fetches,1);assert.equal(f.calls.length,0);assert.equal(records[0].bridge,'not_ready');assert.equal(records[0].transport,'fetch');
});
test('wrong origin, wrong nonce and a different window cannot supply authentication results',async()=>{
 const f=fixture();f.respond(f.peer,'READY','',null,{origin:'https://evil.example'});
 assert.equal(await f.bridge.send({},new AbortController().signal,{}),null);
 f.ready();f.peer.postMessage=m=>{
  if(m.type==='PING')return f.respond(f.peer,'PONG',m.id);
  f.respond({},'RESULT',m.id,{ok:true,forged:true});
  f.respond(f.peer,'RESULT',m.id,{ok:true,forged:true},{origin:'https://evil.example'});
  f.respond(f.peer,'RESULT',m.id,{ok:true,forged:true},{data:{channel:'DS_AUTH_BRIDGE_K4',nonce:'wrong',type:'RESULT',id:m.id,data:{ok:true,forged:true}}});
  f.respond(f.peer,'RESULT',m.id,{ok:false,code:'DENIED'});
 };
 const r=await f.bridge.send({api:'workstation_login'},new AbortController().signal,{});assert.equal(r.ok,false);assert.equal(r.forged,undefined);
});
test('RPC validation errors are returned without silently resending the password through fetch',async()=>{
 const f=fixture();f.ready();let fetches=0;f.peer.postMessage=m=>f.respond(f.peer,m.type==='PING'?'PONG':'RESULT',m.id,m.type==='AUTH'?{ok:false,code:'DENIED',message:'拒絕'}:undefined);
 const t=create({url:'fixture',bridge:f.bridge,fetch:()=>{fetches++;}});await assert.rejects(t.post('workstation_login',{password:'fixture'}),e=>e.code==='DENIED');assert.equal(fetches,0);
});
test('a lost preflight probe may fall back, but sends no credentials to the stalled bridge',async()=>{
 const f=fixture();f.ready();f.peer.postMessage=m=>f.calls.push(m);let fetches=0;
 const t=create({url:'fixture',bridge:f.bridge,fetch:async()=>{fetches++;return {ok:true,text:async()=>'{"ok":true}'};}});
 await t.post('workstation_login',{password:'fixture'});assert.deepEqual(f.calls.map(x=>x.type),['PING']);assert.equal(fetches,1);
});
test('cancelled RPC ignores late results; a new explicit attempt can still use the connection',async()=>{
 const f=fixture();f.ready();let held;f.peer.postMessage=m=>m.type==='PING'?f.respond(f.peer,'PONG',m.id):held=m;
 let fetches=0;const t=create({url:'fixture',bridge:f.bridge,fetch:()=>{fetches++;}}),controller=new AbortController();
 const p=t.post('workstation_login',{password:'fixture'},{signal:controller.signal});await new Promise(r=>setImmediate(r));controller.abort();await assert.rejects(p,e=>e.code==='AUTH_CANCELLED');
 f.respond(f.peer,'RESULT',held.id,{ok:true});await assert.rejects(p,e=>e.code==='AUTH_CANCELLED');assert.equal(fetches,0);
 const next=t.post('workstation_bootstrap');await new Promise(r=>setImmediate(r));f.respond(f.peer,'RESULT',held.id,{ok:true});assert.equal((await next).ok,true);
});
test('an RPC timeout leaves no hidden fetch retry',async()=>{
 const f=fixture();f.ready();let sent=0;f.peer.postMessage=m=>{if(m.type==='PING')f.respond(f.peer,'PONG',m.id);else sent++;};
 let fetches=0;const t=create({url:'fixture',bridge:f.bridge,timeoutMs:20,fetch:()=>{fetches++;}});
 await assert.rejects(t.post('workstation_login'),e=>e.code==='NETWORK_TIMEOUT');assert.equal(sent,1);assert.equal(fetches,0);
});

test('a failed Google RPC session creates a new bridge for the next explicit attempt without replaying credentials',async()=>{
 const f=fixture();f.ready();let authentications=0;
 f.peer.postMessage=m=>{if(m.type==='PING')f.respond(f.peer,'PONG',m.id);else{authentications++;f.respond(f.peer,'RESULT',m.id,{ok:false,code:'AUTH_BRIDGE_FAILED'});}};
 const result=await f.bridge.send({api:'workstation_login',password:'fixture'},new AbortController().signal,{});
 assert.equal(result.code,'AUTH_BRIDGE_FAILED');assert.notEqual(f.currentNonce(),f.nonce);assert.equal(authentications,1);
 // A stale success from the old connection cannot attach to the fresh nonce.
 f.ready();assert.equal(await f.bridge.send({},new AbortController().signal,{}),null);
});

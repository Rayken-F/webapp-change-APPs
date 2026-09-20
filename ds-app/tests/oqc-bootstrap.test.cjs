const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../oqc-bootstrap.js'),'utf8');
function fixture(){const c=vm.createContext({AbortController,setTimeout,clearTimeout});vm.runInContext(source,c);let identity={token:'fixture-a',account:'A',allowed:true},clock=1000,calls=[];
 const reply={ok:true,environment:c.DsOqcBootstrap.ENV,productionEnabled:true,productionBuild:'OQC-PROD-20260918-01',bootstrapPatch:c.DsOqcBootstrap.PATCH,actor:'A',docs:[]};
 const fetcher=(_url,options)=>new Promise((resolve,reject)=>calls.push({options,resolve:data=>resolve({ok:true,json:async()=>data||reply}),reject}));
 const client=c.DsOqcBootstrap.create({url:'https://fixture.invalid',context:()=>identity,fetcher,now:()=>clock,timeoutMs:300});
 return {c,client,reply,calls,setIdentity:x=>identity=x,tick:n=>clock+=n};}
test('clicking while preload is pending shares one authenticated read',async()=>{const f=fixture(),pre=f.client.get(),entered=f.client.take();assert.equal(f.calls.length,1);const body=JSON.parse(f.calls[0].options.body);assert.equal(body.api,'bootstrap');assert.equal(body.session_token,'fixture-a');assert.ok(!('operations' in body));f.calls[0].resolve();assert.equal((await pre).data.actor,'A');assert.equal((await entered).data.actor,'A');});
test('ready preload is consumed once without a second request',async()=>{const f=fixture(),pre=f.client.get();f.calls[0].resolve();await pre;await f.client.take();assert.equal(f.calls.length,1);const next=f.client.get();assert.equal(f.calls.length,2);f.calls[1].resolve();await next;});
test('old prepared read expires including transfer time',async()=>{const f=fixture(),pre=f.client.get();f.calls[0].resolve();await pre;f.tick(60000);const entered=f.client.take();assert.equal(f.calls.length,2);f.calls[1].resolve();await entered;});
test('logout cancels request and rejects a late response even if network ignores abort',async()=>{const f=fixture(),pre=f.client.get();f.client.clear();assert.equal(f.calls[0].options.signal.aborted,true);f.calls[0].resolve();await assert.rejects(pre,{code:'CONTEXT_CHANGED'});});
test('switching account cannot consume prior data',async()=>{const f=fixture(),pre=f.client.get();f.setIdentity({token:'fixture-b',account:'B',allowed:true});const next=f.client.take();assert.equal(f.calls.length,2);f.calls[0].resolve();await assert.rejects(pre,{code:'CONTEXT_CHANGED'});f.calls[1].resolve({...f.reply,actor:'B'});assert.equal((await next).data.actor,'B');});
test('no preload for denied permission or missing login',async()=>{for(const identity of [{token:'fixture',allowed:false},{token:'',allowed:true}]){const f=fixture();f.setIdentity(identity);await assert.rejects(f.client.get(),{code:'SESSION_REQUIRED'});assert.equal(f.calls.length,0);}});
test('expired or revoked backend identity stays rejected and can be explicitly retried',async()=>{const f=fixture(),p=f.client.get();f.calls[0].resolve({ok:false,code:'FORBIDDEN',message:'denied'});await assert.rejects(p,{code:'FORBIDDEN'});assert.equal(f.calls.length,1);const retry=f.client.take();f.calls[1].resolve();await retry;});
test('timeout ends pending wait; late reply stays discarded and explicit retry works',async()=>{const f=fixture();await assert.rejects(f.client.take(),{code:'TIMEOUT'});assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.signal.aborted,true);f.calls[0].resolve();await Promise.resolve();const retry=f.client.take();assert.equal(f.calls.length,2);f.calls[1].resolve();await retry;});
test('incompatible environment is not accepted as prepared data',async()=>{const f=fixture(),p=f.client.get();f.calls[0].resolve({...f.reply,environment:'DEMO'});await assert.rejects(p,{code:'BOOTSTRAP_INCOMPATIBLE'});});
test('clear between cached get and take continuation cannot reuse invalidated snapshot',async()=>{const f=fixture(),pre=f.client.get();f.calls[0].resolve();await pre;const taken=f.client.take();f.client.clear();await assert.rejects(taken,{code:'CONTEXT_CHANGED'});});
test('prepared batch data cannot overwrite pending, in-flight, blocked or newer local work',()=>{const f=fixture(),merge=f.c.DsOqcBootstrap.mergeDocs;for(const flag of [{pending:[{id:'scan'}]},{inflight:{id:'request'}},{blocked:'conflict'}]){const root={docs:{a:{id:'a',revision:4}},receipts:{},pending:[],...flag};assert.equal(merge(root,[{id:'a',revision:5}]),false);assert.equal(root.docs.a.revision,4);}
 const root={docs:{a:{id:'a',revision:4}},receipts:{},pending:[]};assert.equal(merge(root,[{id:'a',revision:3},{id:'b',revision:2,receipt:{id:'receipt'}}]),true);assert.equal(root.docs.a.revision,4);assert.equal(root.docs.b.revision,2);assert.equal(root.receipts.b.id,'receipt');});
test('manual refresh click always reads fresh batches; only daily initialization may reuse preparation',async()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../DS-OQC-SHIPPING/index.html'),'utf8');
 const fn=html.split(/\r?\n/).find(x=>x.startsWith('async function readRemote('));
 for(const [input,expectedCalls] of [[{type:'click'},1],[undefined,1],[true,0]]){
  let calls=0;const root={pending:[],docs:{},receipts:{}};
  const c=vm.createContext({bootstrapRead:Date.now(),root,syncTask:null,key:'fixture',verify:async()=>{},reload:async()=>{},pump(){},api:async()=>{calls++;return {docs:[]};},S:{change:async(_k,f)=>f(root)}});
  vm.runInContext(fn,c);await c.readRemote(input);assert.equal(calls,expectedCalls);
 }
});

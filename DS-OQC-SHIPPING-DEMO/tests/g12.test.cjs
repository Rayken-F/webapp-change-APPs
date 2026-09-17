const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(base,f),'utf8');
const html=read('index.html'),scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const ctx=vm.createContext({});vm.runInContext(scripts[0],ctx);vm.runInContext(read('domain-h2-g1.js'),ctx);vm.runInContext(read('rt-catalog-g12.js'),ctx);
const D=ctx.OqcDomain,C=ctx.OqcRtCatalogG12,clone=x=>JSON.parse(JSON.stringify(x));
const master=D.parseRtRows([['6016995','12X40S','','113407','X44S']]);
const catalog=()=>({schema:C.SCHEMA,complete:true,validForMs:30000,entries:Object.values(master).map(entry=>({entry,proof:'fixture'})),errors:[{rt:'113333',code:'RT_MASTER_CONFLICT',message:'主檔衝突'}]});
function setup(fetcher){let tick=1000,identity='a',calls=0;const cache=C.create({scope:()=>identity,now:()=>tick,fetchCatalog:async()=>{calls++;return fetcher?fetcher():{rtCatalog:catalog()};}});return {cache,clock:n=>tick=n,scope:s=>identity=s,get calls(){return calls;}};}
test('catalog JavaScript parses and is included in both HTML and service worker',()=>{new vm.Script(read('rt-catalog-g12.js'));assert.match(html,/rt-catalog-g12\.js\?v=20260917-g1-03/);assert.match(read('sw.js'),/rt-catalog-g12\.js\?v=20260917-g1-03/);assert.match(html,/id="rtRetry"/);});
test('preloaded catalog validates several different RTs without another server request',async()=>{
 const s=setup();s.cache.prime(catalog());
 for(let n=0;n<50;n++){assert.equal((await s.cache.get('113407')).entry.assetType,'BOTTLE');assert.equal((await s.cache.get('6016995')).entry.assetType,'BUNDLE');}
 assert.equal(s.calls,0);
});
test('a complete catalog rejects unknown RT and conflicting master without network calls',async()=>{
 const s=setup();s.cache.prime(catalog());
 await assert.rejects(s.cache.get('111111'),{code:'RT_NOT_FOUND'});await assert.rejects(s.cache.get('113333'),{code:'RT_MASTER_CONFLICT'});assert.equal(s.calls,0);
});
test('malformed RT is rejected before fetching a catalog',async()=>{const s=setup();await assert.rejects(s.cache.get('12x'),{code:'INVALID_RT'});assert.equal(s.calls,0);});
test('concurrent different RT checks share one catalog request',async()=>{
 let resolve;const s=setup(()=>new Promise(r=>resolve=r));const a=s.cache.get('113407'),b=s.cache.get('6016995');await Promise.resolve();await Promise.resolve();resolve({rtCatalog:catalog()});await Promise.all([a,b]);assert.equal(s.calls,1);
});
test('catalog freshness expires after 30 seconds and an expired value cannot authorize an input',async()=>{
 const s=setup();s.cache.prime(catalog());s.clock(30999);assert.ok(s.cache.peek('113407'));s.clock(31000);assert.equal(s.cache.peek('113407'),null);await s.cache.get('113407');assert.equal(s.calls,1);
});
test('catalog lifetime cannot be extended by a server value or transfer time',()=>{
 const s=setup(),raw=catalog();raw.validForMs=999999;s.clock(25000);s.cache.prime(raw,'a',1000);s.clock(31000);assert.equal(s.cache.peek('113407'),null);
 assert.throws(()=>s.cache.prime(catalog(),'a',1000),{code:'RT_CATALOG_EXPIRED'});
});
test('scope change drops the old account/backend snapshot and rejects late replies',async()=>{
 let resolve;const s=setup(()=>new Promise(r=>resolve=r));s.cache.prime(catalog());s.scope('b');assert.equal(s.cache.peek('113407'),null);
 const waiting=s.cache.get('113407');await Promise.resolve();await Promise.resolve();s.scope('c');resolve({rtCatalog:catalog()});await assert.rejects(waiting,{code:'RT_CHECK_CONTEXT_CHANGED'});assert.equal(s.cache.peek('113407'),null);
});
test('an older pending request cannot clear the newer identity request',async()=>{
 const replies=[];const s=setup(()=>new Promise(r=>replies.push(r)));const old=s.cache.get('113407');await Promise.resolve();await Promise.resolve();s.scope('b');const current=s.cache.get('113407');await Promise.resolve();await Promise.resolve();
 replies[0]({rtCatalog:catalog()});await assert.rejects(old,{code:'RT_CHECK_CONTEXT_CHANGED'});assert.equal(s.cache.status().loading,true);replies[1]({rtCatalog:catalog()});await current;assert.equal(s.cache.status().loading,false);
});
test('partial, empty, duplicate, unsigned and malformed catalogs never replace a valid snapshot',()=>{
 const variants=[r=>r.complete=false,r=>r.entries=[],r=>r.entries.push(r.entries[0]),r=>delete r.entries[0].proof,r=>r.entries[0].entry.source='unknown',r=>r.errors[0].code='OK',r=>r.validForMs=0];
 for(const alter of variants){const s=setup();s.cache.prime(catalog());const raw=clone(catalog());alter(raw);if(!raw.entries.length)raw.errors=[];assert.throws(()=>s.cache.prime(raw));assert.ok(s.cache.peek('113407'));}
});
test('network failure never becomes not-found and retries are bounded until explicit reset',async()=>{
 const s=setup(()=>{const e=Error('timeout');e.code='TIMEOUT';throw e;});await assert.rejects(s.cache.get('111111'),{code:'TIMEOUT'});await assert.rejects(s.cache.get('113407'),{code:'TIMEOUT'});assert.equal(s.calls,1);
 s.cache.clear();await assert.rejects(s.cache.get('113407'),{code:'TIMEOUT'});assert.equal(s.calls,2);
});
test('failed background refresh keeps a still-fresh snapshot, but not after expiration',async()=>{
 const s=setup(()=>{throw Error('network');});s.cache.prime(catalog());await assert.rejects(s.cache.refresh());assert.ok(s.cache.peek('113407'));s.clock(32000);assert.equal(s.cache.peek('113407'),null);
});
test('returned metadata is cloned and catalog data never contains a credential store',async()=>{
 const s=setup();s.cache.prime(catalog());const r=await s.cache.get('113407');r.entry.description='tampered';assert.notEqual(s.cache.peek('113407').entry.description,'tampered');assert.doesNotMatch(read('rt-catalog-g12.js'),/localStorage|sessionStorage|indexedDB/);
});

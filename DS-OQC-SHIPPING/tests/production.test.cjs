const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(base,f),'utf8'),html=read('index.html');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(s=>s.trim());
const ctx=vm.createContext({});vm.runInContext(scripts.find(s=>s.includes('const VERSION=')),ctx);
for(const f of ['domain-h2-g1.js','rt-gate-g1.js','rt-catalog-g12.js'])vm.runInContext(read(f),ctx);
vm.runInContext(read('batch-removal-rm1.js').split('/* RM1-H2-UI')[0],ctx);
const D=ctx.OqcDomain;
test('production scripts parse and service worker assets exist',()=>{
 scripts.forEach(s=>new vm.Script(s));for(const f of ['domain-h2-g1.js','rt-gate-g1.js','rt-catalog-g12.js','history-h1.js','batch-removal-rm1.js','sw.js'])new vm.Script(read(f));
 const sw=read('sw.js'),m=sw.match(/const FILES=(\[[^;]+\]);/);assert.ok(m);for(const f of vm.runInNewContext(m[1]))assert.ok(fs.existsSync(path.join(base,f.split('?')[0])));
});
test('production always uses bound endpoint and a separate environment/local database',()=>{
 assert.equal(D.VERSION,'OQC_SHIPPING_PROD_V1_20260918');assert.match(html,/Object\.freeze\(\{mode:'RC',endpoint:'https:\/\/script\.google\.com/);
 assert.match(html,/name='ds_oqc_shipping_production_v1'/);assert.doesNotMatch(html,/ds_oqc_shipping_demo_v02|oqc_stage1_config|client-rc-/);
 assert.match(html,/const envKey=\(\)=>'client-production-20260918-'/);assert.match(read('batch-removal-rm1.js'),/'client-production-20260918-'/);
 assert.doesNotMatch(html,/params.get\('mode'\)/);assert.match(html,/const offline=\(\)=>navigator.onLine===false/);
});
test('shell permission gate denies direct navigation and ungranted embedded access',()=>{
 const code=fs.readFileSync(path.join(base,'../ds-app/portal-gate.js'),'utf8');
 for(const embedded of [false,true])for(const granted of [false,true]){
  const redirects=[],classes=new Set(),events=[],storage=[];
  const loc={pathname:'/webapp-change-APPs/DS-OQC-SHIPPING/',search:embedded?'?ds_shell=1':'',hash:'',href:'https://rayken-f.github.io/webapp-change-APPs/DS-OQC-SHIPPING/',replace:u=>redirects.push(u)};
  const c=vm.createContext({URL,URLSearchParams,location:loc,sessionStorage:{setItem:(...a)=>storage.push(a)},CustomEvent:function(t,x){this.type=t;this.detail=x.detail;},document:{documentElement:{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}},createElement:()=>({}),head:{appendChild(){}}}});
  c.window=c;c.DS_PORTAL_CONFIG={AUTH_TOKEN_KEY:'fixture'};c.dispatchEvent=e=>events.push(e);
  c.parent=embedded?{DS_PORTAL_BRIDGE:{getToken:()=>'test-session',getProfile:()=>({permissions:{stamp_shipping_enabled:granted}})}}:c;c.top=embedded?{location:loc}:c;
  vm.runInContext(code,c);
  assert.equal(redirects.length,embedded&&granted?0:1);assert.equal(events.length,embedded&&granted?1:0);
 }
});
test('fresh production CTN plus RT change closes with matching totals and one receipt',()=>{
 let doc=null,n=0;const ops=[],batchId='b_production_fixture';const add=(type,data={})=>{const c={id:'op_'+String(++n).padStart(12,'0'),batchId,base:doc?.revision||0,type,data,at:'2026-09-18T02:00:00Z',ruleset:D.RULE};doc=D.run(doc,c,{actor:'fixture',authoritative:true});ops.push(c);return c;};
 add('CREATE',{number:'OQC-20260918-01'});const scan=add('SCAN',{ctn:'QA10AA1'});
 add('IQC_RESULT',{ctn:'QA10AA1',scanId:scan.id,proof:'fixture',result:{state:'FOUND',rt:'113399',status:'VCYL',assetType:'BOTTLE',cylinderQty:1,lookupRuleset:D.legacy023.RULE}});
 const m=D.parseRtRows([['','','','113407','X40S']])['113407'];add('RT_CHANGE',{rt:'113407',items:[{ctn:'QA10AA1',fromRt:'113399'}],rtMaster:m,proof:'fixture'});
 add('SETTINGS',{shippingRef:'fixture-frame'});const close=add('CLOSE',{signature:D.signature(doc),acknowledge:true});
 assert.equal(doc.receipt.total,1);assert.equal(doc.receipt.packingStatus,'PACKED');assert.equal(doc.receipt.shippingStatus,'UNCONFIRMED');assert.equal(doc.receipt.environment,D.VERSION);assert.match(doc.receipt.id,/^OQC-OQC-/);
 const replay=D.run(doc,close,{actor:'fixture',authoritative:true});assert.equal(D.canonical(replay),D.canonical(doc));assert.equal(doc.items[0].iqc.rt,'113399');assert.equal(doc.items[0].rt,'113407');
});
test('RT catalog/gate implementations match accepted DEMO and no DEMO recovery is run',()=>{
 for(const f of ['rt-catalog-g12.js','rt-gate-g1.js'])assert.equal(read(f),fs.readFileSync(path.join(base,'../DS-OQC-SHIPPING-DEMO',f),'utf8'));
 assert.match(html,/async function findRecovery\(\)\{candidates=\[\];\}/);assert.match(html,/productionEnabled!==true/);
});

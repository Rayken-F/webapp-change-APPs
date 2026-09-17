const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(base,f),'utf8');
const html=read('index.html'),scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const ctx=vm.createContext({});
vm.runInContext(scripts[0],ctx);vm.runInContext(read('domain-h2-g1.js'),ctx);
vm.runInContext(read('batch-removal-rm1.js').split('/* RM1-H2-UI')[0],ctx);
vm.runInContext(read('rt-gate-g1.js'),ctx);
const D=ctx.OqcDomain,G=ctx.OqcRtGateG1,L=D.legacy023,clone=x=>JSON.parse(JSON.stringify(x));
const at='2026-09-17T04:00:00.000Z',actor='G1 automated fixture';let seq=0;
const id=p=>p+'_'+String(++seq).padStart(12,'0');
const rows=[['6016995','12X40S','','113399','X40S'],['','','','113407','X44S'],['6017000','TRANSPORT FRAME','','','']];
const master=D.parseRtRows(rows),bottle=master['113407'],bundle=master['6016995'];
function scenario(rule=D.RULE){
 let doc=null;const ops=[];const batchId=id('b');
 function add(type,data={},ruleset=rule){const c={id:id('op'),batchId,base:doc?.revision||0,type,data,at,ruleset};doc=D.run(doc,c,{actor,authoritative:true});ops.push(c);return c;}
 add('CREATE',{number:'OQC-20260917-01'});
 return {add,ops,get doc(){return doc;}};
}
function scanned(s,state='FOUND',ctn='QA10AA1',assetType='BOTTLE'){
 const scan=s.add('SCAN',{ctn});s.add('IQC_RESULT',{ctn,scanId:scan.id,proof:'fixture',result:{state,rt:state==='FOUND'?'113399':'',status:state==='FOUND'?'VCYL':'',assetType:state==='FOUND'?assetType:state==='NON_CYLINDER'?'TRANSPORT_FRAME':'UNKNOWN',cylinderQty:state==='FOUND'?1:null,lookupRuleset:L.RULE,checkedAt:at}});return ctn;
}
function change(s,rt,ctn='QA10AA1',ruleset=D.RULE){return s.add('RT_CHANGE',{rt,items:[{ctn,fromRt:s.doc.items.find(i=>i.ctn===ctn).rt}],...(ruleset===D.RULE?{rtMaster:master[rt],proof:'fixture'}:{})},ruleset);}
function fixture({initial=false,legal=true}={}){
 const s=scenario(L.RULE);scanned(s);const server=initial?null:clone(s.doc),offset=initial?0:s.ops.length;
 const invalid=change(s,'11333333','QA10AA1',L.RULE);
 if(legal)change(s,'113407','QA10AA1',L.RULE);
 const scan=s.add('SCAN',{ctn:'QA10AA2'});
 s.add('IQC_RESULT',{ctn:'QA10AA2',scanId:scan.id,result:{state:'NOT_FOUND',rt:'',status:'',assetType:'UNKNOWN',cylinderQty:null},proof:'fixture'});
 const voided=s.add('VOID',{ctn:'QA10AA2',scanId:scan.id});s.add('RESTORE',{ctn:'QA10AA2',voidId:voided.id});
 s.add('SETTINGS',{shippingRef:'fixture-frame',targetQty:2,note:'retain me',workDate:'2026-09-17',workers:actor});
 const pending=clone(s.ops.slice(offset));const packet={requestId:id('req'),batchId:s.doc.id,operations:clone(pending.slice(0,12))};
 const other={id:id('op'),batchId:id('b'),type:'SETTINGS',data:{note:'other batch untouched'}};
 const root={actor,active:s.doc.id,docs:{[s.doc.id]:clone(s.doc)},pending:[pending[0],other,...pending.slice(1)],inflight:clone(packet),receipts:{},blocked:'old failure'};
 const reply={ok:true,recoveryPatch:G.PATCH,requestId:packet.requestId,accepted:false,ackIds:[],doc:server,rejection:{kind:'RT_G1_REJECTED_REQUEST',requestId:packet.requestId,invalid:[{id:invalid.id,rt:'11333333',ctns:['QA10AA1'],code:'RT_NOT_FOUND'}]}};
 return {root,packet,reply,other,s,invalid};
}
function repair(f){return G.reconcile(f.root,f.packet,f.reply,G.recoveryState(f.root,f.packet.batchId),id,at);}
test('all production scripts parse',()=>{scripts.forEach(s=>new vm.Script(s));for(const f of ['domain-h2-g1.js','rt-gate-g1.js','history-h1.js','batch-removal-rm1.js','sw.js'])new vm.Script(read(f));});
test('RT master rejects malformed, conflicting and non-cylinder entries',()=>{
 for(const rt of ['1133','113407000000','11x407'])assert.throws(()=>D.validRtMeta({...bottle,rt},rt),{code:'RT_MASTER_INVALID'});
 assert.throws(()=>D.validRtMeta(master['6017000'],'6017000'),{code:'RT_MASTER_INVALID'});
 const conflict=D.parseRtRows([...rows,['','','','113407','X50S']]);assert.throws(()=>D.validRtMeta(conflict['113407'],'113407'),{code:'RT_MASTER_INVALID'});
});
test('RT validation requires a proof, selected eligible CTNs and matching IQC type',()=>{
 const s=scenario();scanned(s);const items=s.doc.items;
 assert.throws(()=>G.validateReply('113407',items,{entry:bottle}),{code:'RT_PROOF_MISSING'});
 assert.throws(()=>G.validateReply('113407',[],{entry:bottle,proof:'x'}),{code:'EMPTY_SELECTION'});
 assert.throws(()=>G.validateReply('6016995',items,{entry:bundle,proof:'x'}),{code:'RT_TYPE_MISMATCH'});
 assert.equal(G.validateReply('113407',items,{entry:bottle,proof:'x'}).rtMaster.assetType,'BOTTLE');
});
test('NOT_FOUND keeps original IQC blank and derives bundle quantity from RT master',()=>{
 const s=scenario();scanned(s,'NOT_FOUND');change(s,'6016995');const i=s.doc.items[0];
 assert.equal(i.iqc.state,'NOT_FOUND');assert.equal(i.iqc.rt,'');assert.equal(i.iqc.status,'');assert.equal(D.source(i).rt,'');assert.equal(i.rt,'6016995');assert.equal(D.kind(i),'BUNDLE');assert.equal(D.quantity(i),12);assert.equal(D.summary(s.doc).missing,1);
 s.add('SETTINGS',{shippingRef:'fixture'});const close=s.add('CLOSE',{signature:D.signature(s.doc),acknowledge:true});
 assert.equal(s.doc.receipt.bundleCylinders,12);assert.equal(s.doc.receipt.packingStatus,'PACKED');assert.equal(s.doc.shippingStatus,'UNCONFIRMED');
 assert.equal(D.canonical(D.run(s.doc,close,{actor,authoritative:true})),D.canonical(s.doc));
});
test('legacy 0.2.3 journal replay remains byte-for-byte canonical compatible',()=>{
 const s=scenario(L.RULE);scanned(s);change(s,'113407','QA10AA1',L.RULE);s.add('SETTINGS',{shippingRef:'fixture'});s.add('CLOSE',{signature:L.signature(s.doc),acknowledge:true});
 let old=null;for(const c of s.ops)old=L.run(old,c,{actor,authoritative:true});assert.equal(D.canonical(s.doc),D.canonical(old));
});
for(const rule of [D.RULE,L.RULE])test('RM1 accepts the correct signature and preserves receipt rules: '+rule,()=>{
 const s=scenario(rule);scanned(s);const contract=rule===D.RULE?D:L;
 const before=clone(s.doc),c=s.add('REMOVE_BATCH',{patch:'RM1-20260916',confirmed:true,number:before.number,signature:contract.signature(before),reason:'fixture'});
 assert.equal(s.doc.phase,'REMOVED');assert.equal(s.doc.removal.state,'CONFIRMED');assert.equal(s.doc.items[0].iqc.rt,before.items[0].iqc.rt);assert.equal(s.doc.receipt,null);assert.equal(D.canonical(D.run(s.doc,c,{actor})),D.canonical(s.doc));
});
for(const initial of [false,true])test('fenced recovery preserves legal edits, CTNs, dependencies, other batches and audit; initial='+initial,()=>{
 const f=fixture({initial}),original=clone(f.root);const audit=repair(f);const doc=f.root.docs[f.packet.batchId];
 assert.equal(doc.items.length,2);assert.equal(doc.items[0].rt,'113407');assert.equal(doc.items[0].iqc.rt,'113399');assert.equal(doc.items[1].voided,false);assert.equal(doc.note,'retain me');assert.equal(doc.shippingRef,'fixture-frame');
 assert.equal(doc.items[0].rtChanges.length,1);assert.equal(doc.items[0].rtChanges[0].oldRt,'113399');assert.equal(f.root.inflight,null);assert.equal(f.root.blocked,'');
 assert.deepEqual(f.root.pending.find(c=>c.id===f.other.id),f.other);assert.equal(D.canonical(audit.originalPending),D.canonical(original.pending.filter(c=>c.batchId===f.packet.batchId)));
 assert.equal(D.canonical(audit.packet),D.canonical(f.packet));assert.ok(f.root.pending.filter(c=>c.batchId===f.packet.batchId).every(c=>!original.pending.some(o=>o.id===c.id)));
 let remote=f.reply.doc;for(const c of f.root.pending.filter(c=>c.batchId===f.packet.batchId))remote=D.run(remote,c,{actor,authoritative:true});assert.equal(D.canonical(remote),D.canonical(doc));
});
test('only the rejected RT is undone when no subsequent RT edit exists',()=>{const f=fixture({legal:false});repair(f);const i=f.root.docs[f.packet.batchId].items[0];assert.equal(i.rt,'113399');assert.equal(i.rtChanges.length,0);});
test('already accepted request is acknowledged without rollback or new operation IDs',()=>{
 const s=scenario();scanned(s);change(s,'113407');const packet={requestId:id('req'),batchId:s.doc.id,operations:clone(s.ops)};
 const root={actor,docs:{[s.doc.id]:clone(s.doc)},pending:clone(s.ops),inflight:clone(packet),receipts:{}};
 const reply={recoveryPatch:G.PATCH,requestId:packet.requestId,accepted:true,ackIds:s.ops.map(c=>c.id),doc:clone(s.doc),rejection:null};
 G.reconcile(root,packet,reply,G.recoveryState(root,packet.batchId),id,at);assert.equal(root.pending.length,0);assert.equal(root.docs[packet.batchId].items[0].rt,'113407');assert.equal(root.rtRepairs[0].state,'ACCEPTED');
});
const invalidReplies={
 'wrong request':f=>{f.reply.requestId='req_wrong';},'missing patch':f=>{delete f.reply.recoveryPatch;},
 'unknown outcome':f=>{delete f.reply.accepted;},'missing fence':f=>{f.reply.rejection=null;},
 'wrong CTN':f=>{f.reply.rejection.invalid[0].ctns=['QA10AB1'];},'unrelated refusal':f=>{f.reply.rejection.invalid[0].code='TIMEOUT';},
 'accepted operation':f=>{f.reply.doc.applied[f.invalid.id]=D.canonical(f.invalid);},
 'closed remote':f=>{f.reply.doc.phase='CLOSED';},'false success':f=>{f.reply.accepted=true;f.reply.rejection=null;f.reply.ackIds=f.packet.operations.map(c=>c.id);},
 'operator close confirmation':f=>{f.root.pending.push({id:id('op'),batchId:f.packet.batchId,type:'CLOSE',data:{}});},
 'unknown operation':f=>{f.root.pending.push({id:id('op'),batchId:f.packet.batchId,type:'FUTURE_ACTION',data:{}});}
};
for(const [name,alter] of Object.entries(invalidReplies))test('unsafe recovery is atomic: '+name,()=>{const f=fixture();alter(f);const before=D.canonical(f.root);assert.throws(()=>repair(f));assert.equal(D.canonical(f.root),before);});
test('late recovery response cannot overwrite new local work or changed identity',()=>{for(const mutate of [f=>{f.root.actor='another operator';},f=>{f.root.docs[f.packet.batchId].note='new local note';},f=>{f.root.inflight.requestId=id('req');}]){const f=fixture(),expected=G.recoveryState(f.root,f.packet.batchId);mutate(f);const before=D.canonical(f.root);assert.throws(()=>G.reconcile(f.root,f.packet,f.reply,expected,id,at));assert.equal(D.canonical(f.root),before);}});
test('close guidance identifies blocking CTNs and next steps',()=>{const s=scenario();scanned(s,'NON_CYLINDER','QA10AA1');scanned(s,'CONFLICT','QA10AA2');const msg=G.closeProblems(s.doc).join('\n');assert.match(msg,/QA10AA1.*核對/);assert.match(msg,/QA10AA2.*確認來源/);assert.match(msg,/設定總量／備註/);assert.match(G.closeProblems(scenario().doc).join(''),/空批次/);});

// Exercise the shipped asynchronous controller, with deferred API responses.
function gateHarness(){
 const s=scenario();scanned(s);const calls=[],writes=[];
 const elements={newRt:{value:'113407'},applyRt:{disabled:true},rtGateStatus:{textContent:'',classList:{toggle(){}}}};
 const c=vm.createContext({D,G,root:{actor,active:s.doc.id,docs:{[s.doc.id]:clone(s.doc)}},key:'fixture-key',ready:true,authEpoch:0,workMode:'PACK',editRt:true,selected:new Set(['QA10AA1']),rtGate:{stamp:'',status:'idle',message:''},rtTimer:0,rtSeq:0,rtApplying:false,repairingRt:false,closing:false,disconnected:false,session:'fixture-token',
  $:id=>elements[id],hash:s=>s,token:()=>c.session,offline:()=>c.disconnected,isOpen:()=>true,setTimeout:()=>1,clearTimeout(){},verify:async()=>{},api:()=>new Promise((resolve,reject)=>calls.push({resolve,reject})),confirm:()=>true,mutate:async(...args)=>writes.push(args),issue:'',time:0});
 c.rtLookups=G.createRtLookup({lookup:rt=>c.api('rt_lookup',{rt}),scope:()=>D.canonical([c.key,c.session,c.authEpoch,c.ready,c.disconnected]),now:()=>c.time});
 vm.runInContext(html.slice(html.indexOf('function rtSnapshot('),html.indexOf('async function repairRtQueueG1(')),c);c.render=()=>c.paintRtGate();
 async function start(){const promise=c.checkRt(c.rtSnapshot(),c.rtSeq);await new Promise(setImmediate);return {promise,call:calls.at(-1)};}
 return {c,e:elements,calls,writes,start};
}
test('late valid RT response cannot enable Apply for newer invalid input',async()=>{
 const h=gateHarness(),first=await h.start();h.e.newRt.value='11333333';h.c.invalidateRt();h.c.paintRtGate();const second=await h.start();
 second.call.reject(Error('RT_NOT_FOUND'));await second.promise;first.call.resolve({entry:bottle,proof:'fixture'});await first.promise;
 assert.equal(h.e.applyRt.disabled,true);assert.match(h.e.rtGateStatus.textContent,/RT_NOT_FOUND/);assert.equal(h.writes.length,0);
});
for(const [name,changeContext] of Object.entries({selection:h=>h.c.selected.clear(),revision:h=>h.c.root.docs[h.c.root.active].revision++,identity:h=>h.c.session='another-token',offline:h=>h.c.disconnected=true}))test('RT response loses authority when '+name+' changes',async()=>{
 const h=gateHarness(),first=await h.start();changeContext(h);h.c.invalidateRt();h.c.paintRtGate();first.call.resolve({entry:bottle,proof:'fixture'});await first.promise;
 assert.equal(h.e.applyRt.disabled,true);assert.equal(h.writes.length,0);
});
test('expired RT proof is rechecked and never queued on failure',async()=>{
 const h=gateHarness(),first=await h.start();first.call.resolve({entry:bottle,proof:'old-proof'});await first.promise;assert.equal(h.e.applyRt.disabled,false);
 h.c.time=30001;
 const applying=h.c.applyRtG1();await new Promise(setImmediate);h.calls.at(-1).reject(Error('RT_MASTER_CHANGED'));await assert.rejects(applying,/RT_MASTER_CHANGED/);
 assert.equal(h.writes.length,0);assert.equal(h.e.applyRt.disabled,true);assert.equal(h.c.rtApplying,false);
});
test('offline -> online forces RT validation again',async()=>{
 const h=gateHarness(),first=await h.start();first.call.resolve({entry:bottle,proof:'fixture'});await first.promise;
 h.c.disconnected=true;h.c.paintRtGate();assert.equal(h.e.applyRt.disabled,true);h.c.disconnected=false;h.c.paintRtGate();assert.equal(h.e.applyRt.disabled,true);assert.equal(h.c.rtGate.status,'checking');
});
test('recent authenticated RT proof is reused at Apply without a second request',async()=>{
 const h=gateHarness(),first=await h.start();first.call.resolve({entry:bottle,proof:'server-proof'});await first.promise;
 await h.c.applyRtG1();assert.equal(h.calls.length,1);assert.equal(h.writes.length,1);assert.equal(h.writes[0][1].proof,'server-proof');assert.equal(h.writes[0][1].rt,'113407');
});
test('changed selection uses cached master but still checks the new IQC type',async()=>{
 const h=gateHarness(),first=await h.start();first.call.resolve({entry:bottle,proof:'fixture'});await first.promise;
 h.c.root.docs[h.c.root.active].items[0].iqc.assetType='BUNDLE';h.c.invalidateRt();const second=await h.start();await second.promise;
 assert.equal(h.calls.length,1);assert.equal(h.e.applyRt.disabled,true);assert.match(h.e.rtGateStatus.textContent,/型態.*不符/);
});
test('identical concurrent RT requests share one network call',async()=>{
 const h=gateHarness(),first=await h.start();h.c.root.docs[h.c.root.active].revision++;h.c.invalidateRt();const second=await h.start();
 assert.equal(h.calls.length,1);first.call.resolve({entry:bottle,proof:'fixture'});await Promise.all([first.promise,second.promise]);assert.equal(h.e.applyRt.disabled,false);
});
test('failed and malformed RT responses are never cached as valid',async()=>{
 let calls=0;const cache=G.createRtLookup({scope:()=>'',lookup:async()=>{calls++;if(calls===1)throw Error('timeout');if(calls===2)return {entry:bottle};return {entry:bottle,proof:'fixture'};}});
 await assert.rejects(cache.get('113407'),/timeout/);assert.equal(cache.peek('113407'),null);
 await assert.rejects(cache.get('113407'),{code:'RT_PROOF_MISSING'});assert.equal(cache.peek('113407'),null);
 await cache.get('113407');assert.equal(calls,3);
});
test('cache expires and clears on identity/endpoint changes and network reset',async()=>{
 let scope='endpoint-A:user-A',time=0,calls=0;const cache=G.createRtLookup({scope:()=>scope,now:()=>time,lookup:async()=>{calls++;return {entry:bottle,proof:'fixture-'+calls};}});
 const original=await cache.get('113407');original.entry.description='mutated caller';assert.notEqual((await cache.get('113407')).entry.description,'mutated caller');assert.equal(calls,1);
 time=30000;await cache.get('113407');assert.equal(calls,2);scope='endpoint-A:user-B';await cache.get('113407');assert.equal(calls,3);
 scope='endpoint-B:user-B';await cache.get('113407');assert.equal(calls,4);cache.clear();await cache.get('113407');assert.equal(calls,5);
});
test('repair notice names the actual old request, not the current input/batch',()=>{
 const f=fixture();f.root.lastError=true;f.root.lastMessage='RT 11333333 不存在於 RT list，本次未套用';f.root.active=f.other.batchId;
 const notice=G.syncNotice(f.root,f.root.lastMessage);assert.equal(notice.problem.batchId,f.packet.batchId);assert.match(notice.text,/舊待傳 RT 尚未修復/);assert.match(notice.text,/修復待傳 RT/);assert.equal(notice.danger,true);
});
test('resolved queue hides stale error even after reload without deleting audit',()=>{
 const f=fixture();f.root.lastError=true;f.root.lastMessage='RT 11333333 不存在於 RT list，本次未套用';const old=f.root.lastMessage;
 repair(f);assert.equal(G.syncNotice(f.root,old).problem,null); // no rejected packet remains
 const settled={...f.root,pending:[],inflight:null,lastError:true,lastMessage:old};const before=D.canonical(settled);
 const notice=G.syncNotice(settled,old);assert.doesNotMatch(notice.text,/11333333/);assert.equal(notice.danger,false);assert.equal(D.canonical(settled),before);assert.equal(settled.rtRepairs.length,1);
});
test('a transient RT field error expires, while queue failures remain actionable',()=>{
 const clean={docs:{},pending:[],inflight:null,lastError:false};assert.equal(G.syncNotice(clean,'field error').text,'field error');assert.equal(G.syncNotice(clean,'').danger,false);
 const f=fixture();f.root.lastError=true;f.root.syncFailure={code:'RT_NOT_FOUND',message:'RT unavailable',requestId:f.packet.requestId};
 assert.ok(G.rtQueueProblem(f.root));f.root.syncFailure.requestId='req_other';assert.equal(G.rtQueueProblem(f.root),null);
});

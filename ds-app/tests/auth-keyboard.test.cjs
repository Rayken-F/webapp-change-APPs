const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const {create}=require('../auth-transport.js');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function classes(){const values=new Set();return {add:x=>values.add(x),remove:x=>values.delete(x),contains:x=>values.has(x),toggle(x,on){if(on===undefined)on=!values.has(x);on?values.add(x):values.delete(x);}};}
function setup(post){
 const nodes=new Map(),storage=new Map();let clears=0;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{classList:classes(),value:'',textContent:'',checked:false,disabled:false,children:[],querySelectorAll(){return this.children;},replaceChildren(){clears++;this.children=[];},style:{setProperty(){}}});return nodes.get(id);};
 const store={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const cfg={AUTH_TOKEN_KEY:'token',AUTH_API_URL:'https://auth.fixture',PORTAL_API_URL:'https://portal.fixture',AUTH_CLIENT_VERSION:'compatible',REMEMBER_ACCOUNT_KEY:'account',REMEMBER_ENABLED_KEY:'remember'};
 const c=vm.createContext({window:{DS_PORTAL_CONFIG:cfg,DsAuthTransport:{create:()=>({post})},dispatchEvent(){}},document:{body:{classList:classes()},getElementById:node,querySelectorAll:()=>[]},sessionStorage:store,localStorage:store,AbortController,setTimeout,clearTimeout,URL,URLSearchParams,location:{search:'',href:'https://fixture/ds-app/'},CustomEvent:class{},console,requestAnimationFrame(){},scrollTo(){}});
 vm.runInContext(read('ds-app/app.js').replace(/init\(\);\s*$/,''),c);
 c.hydrateUser=()=>{};c.syncShellPermissions=()=>{};c.loadHomeDataSafe=()=>{};c.routeAfterAuth=()=>false;
 const profile={user:{account:'QA',displayName:'Fixture'},permissions:{home_enabled:true,iqc_correction_enabled:true}};
 c.fixtureProfile=profile;vm.runInContext('state.authUser=fixtureProfile.user;state.profile=fixtureProfile;',c);storage.set('token','original-token');
 return {c,node,storage,profile,clears:()=>clears,state:()=>vm.runInContext('state',c)};
}
test('restore bursts share one pending request and preserve the current module after verification',async()=>{
 let calls=0;const d=deferred(),s=setup(()=>{calls++;return d.promise;});
 const a=s.c.tryRestore(true),b=s.c.tryRestore(true),e=s.c.tryRestore(true);assert.equal(a,b);assert.equal(b,e);await Promise.resolve();assert.equal(calls,1);assert.equal(s.node('loginBtn').disabled,true);assert.equal(s.state().profile,null);
 d.resolve(s.profile);await a;assert.equal(s.node('loginBtn').disabled,false);assert.equal(s.storage.get('token'),'original-token');assert.equal(s.clears(),0);assert.equal(s.state().profile.permissions.home_enabled,true);
});
test('weak-network failure keeps the token but does not grant the shell access; retry remains available',async()=>{
 const s=setup(async()=>{throw Error('連線超過 15 秒');});await s.c.tryRestore(true);assert.equal(s.storage.get('token'),'original-token');assert.equal(s.state().profile,null);assert.equal(s.node('appShell').classList.contains('hidden'),true);assert.equal(s.node('retrySessionBtn').classList.contains('hidden'),false);assert.equal(s.clears(),0);
});
test('explicit expiry clears the session and old module views',async()=>{
 const s=setup(async()=>{throw Error('登入已逾時，請重新登入。');});await s.c.tryRestore(true);assert.equal(s.storage.has('token'),false);assert.equal(s.clears(),1);assert.equal(s.state().profile,null);
});
test('credential submit is single-flight and clears old account modules only after success',async()=>{
 let calls=0;const d=deferred(),s=setup((api)=>{calls++;assert.equal(api,'workstation_login');return d.promise;});
 const a=s.c.login('QA','fixture-password',true),b=s.c.login('QA','fixture-password',true);assert.equal(a,b);await Promise.resolve();assert.equal(calls,1);d.resolve({...s.profile,sessionToken:'new-token'});await a;assert.equal(s.storage.get('token'),'new-token');assert.equal(s.clears(),1);
});
test('an old response cannot restore a session after logout invalidates its generation',async()=>{
 const d=deferred(),s=setup(()=>d.promise);const pending=s.c.tryRestore(true);await Promise.resolve();vm.runInContext('authEpoch++;clearToken();state.authUser=null;state.profile=null;',s.c);d.resolve(s.profile);await pending;assert.equal(s.storage.has('token'),false);assert.equal(s.state().profile,null);
});
test('resume removes a revoked module before returning control',async()=>{
 const s=setup(async()=>({user:{account:'QA'},permissions:{home_enabled:true,iqc_correction_enabled:false}}));let removed=false;
 s.node('moduleFrameHost').children=[{dataset:{moduleKey:'iqc'},classList:classes(),remove(){removed=true;}}];await s.c.tryRestore(true);assert.equal(removed,true);assert.equal(s.state().profile.permissions.iqc_correction_enabled,false);
});
test('authentication timeout aborts a hung fetch or body read without automatic retries',async()=>{
 for(const bodyHang of [false,true]){let calls=0,signal;const client=create({url:'https://fixture',clientVersion:'v',timeoutMs:15,fetch:async(_u,o)=>{calls++;signal=o.signal;return bodyHang?{ok:true,text:()=>new Promise(()=>{})}:new Promise(()=>{});}});await assert.rejects(client.post('workstation_login',{password:'fixture'}),e=>e.code==='NETWORK_TIMEOUT');assert.equal(calls,1);assert.equal(signal.aborted,true);}
});
test('late network completion after a timeout cannot become a successful authentication',async()=>{
 const d=deferred(),client=create({url:'https://fixture',clientVersion:'v',timeoutMs:10,fetch:()=>d.promise});const p=client.post('workstation_bootstrap');await assert.rejects(p,/等待過久/);d.resolve({ok:true,text:async()=>'{"ok":true}'});await assert.rejects(p,/等待過久/);
});
test('IQC contains no independent credential form or login handler',()=>{
 const html=read('DS-IQC-WIP/index.html'),app=read('DS-IQC-WIP/app.js');assert.doesNotMatch(html,/id="(?:loginForm|loginPassword|loginUser|loginView|logoutBtn)"/);assert.doesNotMatch(app,/Api\.post\("login"|\$\("login(?:Form|Password|View)"\)|Api\.clearToken\(/);assert.match(html,/portalStatus/);
});
test('IQC uses fresh parent permissions, never contacts bootstrap/login, and leaves real writes on the backend',async()=>{
 let calls=0,profile={user:{account:'QA',allowedActions:['REVIEW']},permissions:{iqc_correction_enabled:true,iqc_approval_enabled:false}};
 const parent={DS_PORTAL_BRIDGE:{getProfile:()=>profile,getToken:()=> 'fixture-token'}},window={parent,IqcCorrectionApi:{CLIENT_VERSION:'v',post:async api=>{calls++;return {ok:true,api};}}};
 const c=vm.createContext({window,sessionStorage:{setItem(){}},document:{documentElement:{classList:classes()},createElement:()=>({}),head:{appendChild(){}}}});vm.runInContext(read('DS-IQC-WIP/ds-shell-sso.js'),c);
 const api=window.IqcCorrectionApi,r=await api.post('bootstrap');assert.equal(r.permissions.canReview,false);assert.equal(calls,0);await assert.rejects(api.post('login'),/統一登入/);await api.post('create_request',{});assert.equal(calls,1);profile=null;await assert.rejects(api.post('bootstrap'),/尚未完成/);assert.equal(calls,1);
});
test('keyboard keeper recognizes the production viewport owner and nested textarea throughout typing',()=>{
 for(const owner of [true,false]){
  const rootNode={classList:classes()},nav={style:{removeProperty(){}}},child={activeElement:{tagName:'TEXTAREA'}},frame={contentDocument:child};rootNode.classList.add('ds-keyboard-open');
  const shell={classList:classes(),querySelector:()=>nav},document={documentElement:rootNode,activeElement:{tagName:'IFRAME'},getElementById:()=>shell,querySelector:selector=>selector.includes('not(.hidden)')?frame:null,addEventListener(){}};
  const window={visualViewport:{height:400},innerHeight:874,addEventListener(){}};let keyboard=true;if(owner)window.__DS_SHELL_UX__={getState:()=>({keyboardOpen:keyboard})};
  const c=vm.createContext({window,document,MutationObserver:class{observe(){}},setTimeout(){},clearTimeout(){},setInterval(){},console});vm.runInContext(read('ds-app-grinding-recovery-rc/rc-quickbar-keeper-v6.js'),c);
  for(let i=0;i<20;i++){window.__DS_RC_QUICKBAR_KEEPER_V6.heal();assert.equal(rootNode.classList.contains('ds-keyboard-open'),true);}
  keyboard=false;window.visualViewport.height=874;window.__DS_RC_QUICKBAR_KEEPER_V6.heal();assert.equal(rootNode.classList.contains('ds-keyboard-open'),false);
 }
});
test('changed shell scripts parse',()=>{for(const f of ['ds-app/app.js','ds-app/auth-transport.js','ds-app/shell-ux.js','ds-app/production-enhancements.js','ds-app-grinding-recovery-rc/rc-quickbar-keeper-v6.js','DS-IQC-WIP/app.js','DS-IQC-WIP/ds-shell-sso.js'])new vm.Script(read(f),{filename:f});});

function clock(){let time=0,id=0;const timers=new Map();return {now:()=>time,setTimeout:(f,ms)=>{timers.set(++id,{f,at:time+ms});return id;},clearTimeout:id=>timers.delete(id),async advance(ms){const end=time+ms;for(;;){const due=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;time=due[1].at;timers.delete(due[0]);due[1].f();await Promise.resolve();}time=end;await Promise.resolve();},pending:()=>timers.size};}
test('a server result delivered at 18 seconds survives the 15-second slow notice without password resubmission',async()=>{
 const time=clock(),d=deferred(),records=[];let calls=0,slow=0,id,signal;
 const transport=create({...time,url:'fixture',clientVersion:'v',onDiagnostic:r=>records.push(r),fetch:async(_u,o)=>{calls++;id=JSON.parse(o.body).request_id;signal=o.signal;return d.promise;}});
 const p=transport.post('workstation_login',{user_id:'QA',password:'private-fixture'},{onSlow:()=>slow++});
 await time.advance(15000);assert.equal(slow,1);assert.equal(signal.aborted,false);assert.equal(calls,1);await time.advance(3000);
 d.resolve({ok:true,text:async()=>JSON.stringify({ok:true,sessionToken:'token-private',authDiagnostic:{requestId:id,totalMs:4000,phases:{password:1,audit:1200,untrusted:'private-fixture'}}})});
 assert.equal((await p).ok,true);assert.equal(records[0].totalMs,18000);assert.equal(records[0].server.totalMs,4000);assert.equal(records[0].outcome,'received');assert.equal(time.pending(),0);
 const text=JSON.stringify(records);for(const secret of ['QA','private-fixture','token-private','untrusted'])assert.equal(text.includes(secret),false);
});
test('response body delayed to 18 seconds also succeeds, with separate header and body timings',async()=>{
 const time=clock(),body=deferred(),records=[];
 const transport=create({...time,url:'fixture',onDiagnostic:r=>records.push(r),fetch:async()=>({ok:true,text:()=>body.promise})});
 const p=transport.post('workstation_bootstrap',{session_token:'private'});await Promise.resolve();await time.advance(18000);body.resolve('{"ok":true}');await p;
 assert.equal(records[0].headersMs,0);assert.equal(records[0].bodyMs,18000);assert.equal(records[0].outcome,'received');
});
test('the 45-second ceiling aborts and exposes retry, with no hidden second request',async()=>{
 const time=clock(),records=[];let calls=0,signal;const t=create({...time,url:'fixture',onDiagnostic:r=>records.push(r),fetch:async(_u,o)=>{calls++;signal=o.signal;return new Promise(()=>{});}});
 const p=t.post('workstation_login');const failed=assert.rejects(p,e=>e.code==='NETWORK_TIMEOUT');await time.advance(45000);await failed;
 assert.equal(signal.aborted,true);assert.equal(calls,1);assert.equal(records[0].totalMs,45000);assert.equal(records[0].outcome,'timeout');assert.equal(time.pending(),0);
});
test('explicit cancellation promptly rejects even if the network ignores abort, and prevents a late success',async()=>{
 const d=deferred(),controller=new AbortController(),records=[],transport=create({url:'fixture',onDiagnostic:r=>records.push(r),fetch:()=>d.promise});
 const p=transport.post('workstation_login',{}, {signal:controller.signal});controller.abort();await assert.rejects(p,e=>e.code==='AUTH_CANCELLED');
 d.resolve({ok:true,text:async()=>'{"ok":true}'});await assert.rejects(p,e=>e.code==='AUTH_CANCELLED');assert.equal(records.length,1);assert.equal(records[0].outcome,'cancelled');
});
test('rapid cancel/login cannot let an older task clear the new pending state or apply its user',async()=>{
 const old=deferred(),next=deferred();let calls=0;const s=setup(()=>++calls===1?old.promise:next.promise);
 const first=s.c.login('QA','fixture',true);await Promise.resolve();s.c.cancelAuthentication();
 const second=s.c.login('QA','fixture',true);await Promise.resolve();old.resolve({...s.profile,sessionToken:'stale'});await first;
 assert.equal(s.node('loginBtn').disabled,true);assert.equal(s.storage.get('token'),'original-token');
 next.resolve({...s.profile,sessionToken:'current'});await second;assert.equal(s.storage.get('token'),'current');assert.equal(s.node('loginBtn').disabled,false);
});
test('network retry preserves a suspended same-account form and rechecks permissions before revealing it',async()=>{
 let count=0;const s=setup(async()=>{if(++count===1)throw Error('network unavailable');return s.profile;});let routed=0;s.c.routeAfterAuth=()=>{routed++;return false;};
 await s.c.tryRestore(true);assert.equal(s.state().profile,null);await s.c.tryRestore(true);assert.equal(routed,0);assert.equal(s.clears(),0);assert.equal(count,2);
});
test('home reads coalesce and authentication cancels the old request; its late body cannot update the screen',async()=>{
 const d=deferred(),s=setup(async()=>s.profile);let calls=0,signal;
 s.c.fetch=async(_url,options)=>{calls++;signal=options.signal;return {ok:true,text:()=>d.promise};};s.c.renderPriorities=()=>{};
 const a=s.c.loadHomeData(),b=s.c.loadHomeData();assert.equal(a,b);assert.equal(calls,1);
 await s.c.tryRestore(true);assert.equal(signal.aborted,true);d.resolve('{"ok":true,"priorities":[{"old":true}]}');await a;assert.equal(s.state().priorities.length,0);
});

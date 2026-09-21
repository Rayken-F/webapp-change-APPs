const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8').replace(/init\(\);\s*$/,'');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function setup(post){
 let now=Date.parse('2026-09-21T00:00:00Z'),serial=0,cleared=0,oqcCleared=0;
 const nodes=new Map(),saved=new Map([['token','verified-token']]),timers=new Map(),events={},winEvents={},calls=[];
 const classes=()=>{const values=new Set();return {add:x=>values.add(x),remove:x=>values.delete(x),contains:x=>values.has(x),toggle(x,on){if(on===undefined)on=!values.has(x);on?values.add(x):values.delete(x);}};};
 const node=id=>{if(!nodes.has(id))nodes.set(id,{classList:classes(),textContent:'',value:'',children:[],focus(){},style:{setProperty(){}},querySelector:()=>null,querySelectorAll(){return this.children;},replaceChildren(){this.children=[];cleared++;}});return nodes.get(id);};
 const store={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 const c=vm.createContext({Date:class extends Date{static now(){return now;}},AbortController,URL,URLSearchParams,CustomEvent:class{},console,scrollTo(){},requestAnimationFrame(){},
  setTimeout(f,ms){timers.set(++serial,{f,at:now+ms});return serial;},clearTimeout(id){timers.delete(id);},sessionStorage:store,localStorage:store,location:{search:'',href:'https://fixture/ds-app/'},
  document:{hidden:false,body:{classList:classes()},getElementById:node,querySelectorAll:()=>[],addEventListener:(n,f)=>events[n]=f},
  window:{DS_PORTAL_CONFIG:{AUTH_TOKEN_KEY:'token'},DsOqcBootstrap:{create:()=>({clear(){oqcCleared++;}})},DsAuthTransport:{create:()=>({post:(...args)=>{calls.push(args);return post(...args);}})},dispatchEvent(){},addEventListener:(n,f)=>winEvents[n]=f}});
 vm.runInContext(source,c);
 c.hydrateUser=()=>{};c.syncShellPermissions=()=>{};c.loadHomeDataSafe=()=>{};c.routeAfterAuth=()=>false;
 const result={user:{account:'QA',displayName:'測試'},permissions:{home_enabled:true,daily_report_enabled:true},expiresAt:'2026-10-21 08:00:00'};
 c.applyAuthentication(result,false);c.bindSessionLifecycle();
 return {c,result,node,saved,calls,timers,events,winEvents,cleared:()=>cleared,oqcCleared:()=>oqcCleared,
  state:()=>vm.runInContext('state',c),advance(ms){now+=ms;},async tick(){const due=[...timers].filter(([,t])=>t.at<=now);for(const [id,t] of due){timers.delete(id);t.f();}await Promise.resolve();},
  resume(){events.visibilitychange();return vm.runInContext('sessionRefreshTask||authTask',c);},
  frame(){const f={dataset:{moduleKey:'daily'},classList:classes(),contentWindow:{CustomEvent:class{},dispatchEvent(){}},remove(){node('moduleFrameHost').children=[];}};node('moduleFrameHost').children=[f];return f;}};
}
test('rapid foreground and bfcache returns reuse only the verified in-memory session without blocking',async()=>{
 const s=setup(()=>{throw Error('unexpected network');}),frame=s.frame();s.node('loadingOverlay').classList.add('hidden');
 for(let i=0;i<10;i++){s.c.document.hidden=true;s.events.visibilitychange();s.c.document.hidden=false;s.resume();s.winEvents.pageshow({persisted:true});}
 assert.equal(s.calls.length,0);assert.equal(s.node('moduleFrameHost').children[0],frame);assert.equal(s.oqcCleared(),0);
 assert.equal(s.node('loadingOverlay').classList.contains('hidden'),true);assert.equal(s.node('appShell').classList.contains('hidden'),false);
});
test('a stale foreground session refreshes once in the background and preserves profile/form while waiting',async()=>{
 const d=deferred(),s=setup(()=>d.promise),frame=s.frame(),profile=s.state().profile;s.advance(61000);
 const first=s.resume();s.winEvents.pageshow({persisted:true});s.resume();await Promise.resolve();assert.equal(s.calls.length,1);
 assert.equal(s.calls[0][0],'workstation_bootstrap');assert.equal(s.state().profile,profile);assert.equal(s.node('loadingOverlay').classList.contains('hidden'),true);
 d.resolve(s.result);await first;assert.equal(s.node('moduleFrameHost').children[0],frame);assert.equal(s.cleared(),0);
});
test('offline background refresh retains session and backs off repeated foreground attempts',async()=>{
 const s=setup(async()=>{throw Error('network unavailable');});s.advance(61000);await s.resume();
 for(let i=0;i<10;i++)await s.resume();assert.equal(s.calls.length,1);assert.equal(s.saved.get('token'),'verified-token');assert.ok(s.state().profile);
 assert.equal(s.node('appShell').classList.contains('hidden'),false);s.advance(61000);await s.resume();assert.equal(s.calls.length,2);
});
test('permission revocation removes the affected frame after background verification',async()=>{
 let s;s=setup(async()=>({...s.result,permissions:{home_enabled:true,daily_report_enabled:false}}));s.frame();s.advance(61000);await s.resume();
 assert.equal(s.node('moduleFrameHost').children.length,0);assert.equal(s.state().profile.permissions.daily_report_enabled,false);
});
test('revoking the currently open home permission routes away from its data',async()=>{
 let s;s=setup(async()=>({...s.result,permissions:{home_enabled:false,daily_report_enabled:true}}));s.advance(61000);await s.resume();
 assert.equal(s.node('homeModule').classList.contains('hidden'),true);assert.equal(s.node('moreModule').classList.contains('hidden'),false);
});
test('disabled or expired server session clears all access instead of retaining a cached grant',async()=>{
 for(const message of ['帳號不存在或已停用','登入已逾時，請重新登入。']){
  const s=setup(async()=>{throw Error(message);});s.frame();s.advance(61000);await s.resume();
  assert.equal(s.saved.has('token'),false);assert.equal(s.state().profile,null);assert.equal(s.node('moduleFrameHost').children.length,0);assert.equal(s.node('appShell').classList.contains('hidden'),true);
 }
});
test('known expiry locks immediately on return without relying on network or delayed OS timers',async()=>{
 const s=setup(()=>{throw Error('must not call');});s.frame();s.advance(31*86400000);await s.resume();
 assert.equal(s.calls.length,0);assert.equal(s.saved.has('token'),false);assert.equal(s.state().profile,null);
});
test('active-page expiry timer locks and the long TTL is split into supported timeouts',async()=>{
 const s=setup(()=>{});assert.equal([...s.timers.values()].every(t=>t.at-Date.parse('2026-09-21T00:00:00Z')<=86400000),true);
 s.advance(31*86400000);await s.tick();assert.equal(s.saved.has('token'),false);
});
test('logout aborts refresh and a late success cannot revive the account',async()=>{
 const d=deferred(),s=setup(()=>d.promise);s.advance(61000);const pending=s.resume();await Promise.resolve();
 s.c.endSession('');assert.equal(s.calls[0][2].signal.aborted,true);d.resolve(s.result);await pending;
 assert.equal(s.state().profile,null);assert.equal(s.saved.has('token'),false);assert.equal(s.node('appShell').classList.contains('hidden'),true);
});
test('a stale refresh failure cannot sign out a newer credentials login',async()=>{
 const old=deferred();let s;s=setup(api=>api==='workstation_login'?Promise.resolve({...s.result,user:{account:'NEW'},sessionToken:'new-token'}):old.promise);
 s.advance(61000);const pending=s.resume();await Promise.resolve();await s.c.login('NEW','fixture',false);
 old.reject(Error('登入已逾時'));await pending;assert.equal(s.state().authUser.account,'NEW');assert.equal(s.saved.get('token'),'new-token');
});
test('page reload or missing expiry cannot use a persisted token as proof of authentication',async()=>{
 let s;s=setup(async()=>s.result);s.c.forgetVerifiedSession();s.state().profile=null;s.state().authUser=null;
 await s.resume();assert.equal(s.calls.length,1);assert.equal(s.calls[0][0],'workstation_bootstrap');
 s.c.applyAuthentication({...s.result,expiresAt:undefined},true);await s.resume();assert.equal(s.calls.length,2);
});
test('another tab logout locks immediately; changed token requires verification before exposing another identity',async()=>{
 const d=deferred(),s=setup(()=>d.promise);s.saved.delete('token');s.winEvents.storage({key:'token'});assert.equal(s.state().profile,null);
 const t=setup(()=>d.promise);t.frame();t.saved.set('token','another-token');t.winEvents.storage({key:'token'});await Promise.resolve();assert.equal(t.state().profile,null);assert.equal(t.calls.length,1);
 d.resolve({...t.result,user:{account:'NEW'}});await vm.runInContext('authTask',t.c);assert.equal(t.state().authUser.account,'NEW');assert.equal(t.node('moduleFrameHost').children.length,0);
});
test('foreground events cannot interrupt an explicit reauthentication or start a duplicate',async()=>{
 const d=deferred(),s=setup(()=>d.promise);const pending=s.c.window.DS_PORTAL_BRIDGE.reauthenticate();await Promise.resolve();s.resume();s.winEvents.pageshow({persisted:true});
 assert.equal(s.calls.length,1);assert.equal(s.state().profile,null);d.resolve(s.result);await pending;
});
test('expiry is parsed with the backend timezone and refreshed checks never extend the server deadline',async()=>{
 let s;s=setup(async()=>s.result);const expiry=s.c.sessionExpiry(s.result.expiresAt);assert.equal(expiry,Date.parse('2026-10-21T00:00:00Z'));
 s.advance(61000);await s.resume();assert.equal(vm.runInContext('verifiedSession.expiresAt',s.c),expiry);
});
test('unexpected identity or missing expiry in a refresh cannot retain the old granted view',async()=>{
 for(const override of [{user:{account:'OTHER'}},{expiresAt:''}]){let s;s=setup(async()=>({...s.result,...override}));s.advance(61000);await s.resume();assert.equal(s.state().profile,null);assert.equal(s.saved.has('token'),false);}
});
test('logout or revoked home permission aborts a pending home read before a late result arrives',async()=>{
 for(const logout of [true,false]){
  const d=deferred();let s;s=setup(api=>api==='workstation_home_data'?d.promise:Promise.resolve({...s.result,permissions:{home_enabled:false}}));
  s.c.renderPriorities=()=>{};const home=s.c.loadHomeData();const signal=s.calls[0][2].signal;
  if(logout)s.c.endSession('');else{s.advance(61000);await s.resume();}
  assert.equal(signal.aborted,true);d.resolve({priorities:[{private:true}]});await home;assert.equal(s.state().priorities.length,0);
 }
});

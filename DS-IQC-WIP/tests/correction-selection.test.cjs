const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function setup(){
 const nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',classList:{add(){},remove(){},toggle(){}},addEventListener(){},setCustomValidity(){}});return nodes.get(id);};
 const c=vm.createContext({window:{IqcCorrectionApi:{post(){throw Error('No backend writes in unit tests');}}},document:{getElementById:node},setTimeout,clearTimeout});
 vm.runInContext(source.slice(0,source.indexOf('function isMobileRequestDrawer()'))+';this.testState=state;',c);
 node('requestType').value='CORRECT_BOTTLE_CTN_RT';node('requestReason').value='fixture correction';
 return {c,node};
}
test('lookup identifies bundle CTN and preserves the original RT for a CTN-only correction',()=>{
 const {c,node}=setup();c.testState.selection=c.deriveSelectionFromResult({normalizedQuery:'QA10AA1',iqc:{transportCards:[],bundleCards:[{rows:[{ctn:'QA10AA1',rt:'224400'}]}]}});
 assert.equal(c.testState.selection.targetKind,'bundle');node('requestNewBottleCtn').value='QA10AA2';
 const p=c.collectRequestPayload();assert.equal(p.target_ctn,'QA10AA1');assert.equal(p.old_value.rt,'224400');assert.equal(p.proposed_value.ctn,'QA10AA2');assert.equal(p.proposed_value.rt,'');
});
test('both loose and bundle selections can propose an RT; frame or unknown selections cannot',()=>{
 for(const kind of ['bottle','bundle','frame','generic']){
  const {c,node}=setup();c.testState.selection={targetCtn:'QA10AA1',targetKind:kind,rt:'113399'};node('requestNewBottleRt').value='113407';
  if(['bottle','bundle'].includes(kind)){const p=c.collectRequestPayload();assert.equal(p.request_type,'CORRECT_BOTTLE_CTN_RT');assert.equal(p.old_value.rt,'113399');assert.equal(p.proposed_value.rt,'113407');}
  else assert.throws(()=>c.collectRequestPayload(),/請先.*鋼瓶或集束/);
 }
});
test('empty changes and invalid CTN/RT formats remain blocked',()=>{
 const {c,node}=setup();c.testState.selection={targetCtn:'QA10AA1',targetKind:'bundle',rt:'224400'};
 assert.throws(()=>c.collectRequestPayload(),/至少填寫/);
 node('requestNewBottleCtn').value='BAD';assert.throws(()=>c.collectRequestPayload(),/格式錯誤/);
 node('requestNewBottleCtn').value='';node('requestNewBottleRt').value='INVALID';assert.throws(()=>c.collectRequestPayload(),/只允許數字/);
});
test('existing request code retains display compatibility; bundle buttons escape data',()=>{
 const {c}=setup();assert.equal(c.requestLabelByCode('CORRECT_BOTTLE_CTN_RT','修改鋼瓶CTN/RT'),'修改鋼瓶、集束CTN/RT');
 const html=c.renderBundleCard({rows:[{ctn:'QA10AA1',rt:'224400'},{ctn:'QA10AA2',rt:'<unsafe>'}]});
 assert.equal((html.match(/js-select-bundle/g)||[]).length,2);assert.match(html,/data-rt="&lt;unsafe&gt;"/);
});

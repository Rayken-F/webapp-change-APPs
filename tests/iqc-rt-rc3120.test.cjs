const {test}=require('node:test'),assert=require('node:assert/strict');
const rules=require('../ds-app-grinding-recovery-rc/iqc-ocr-rules-rc31');
const model=require('../ds-app-grinding-recovery-rc/iqc-ocr-review-model-rc31');
const pass=text=>({data:{text}}),header='914321 CYLINDER OCYL 7209 TOTAL 18';
for(const heading of [header,'914 321 CYLINDER OCYL 7209 TOTAL 18','RT: 914321 CYLINDER OCYL 7209 TOTAL 18','> 914321 CYL1NDER OCYL 7209 TOTAL 18','914321\n\nCYLINDER OCYL 7209 TOTAL 18','914321 CYLINDER\nOCYL 7209 TOTAL 18','914321\nCYLINDER\nOCYL 7209 TOTAL 18']){
 test('RT heading retains metadata: '+JSON.stringify(heading),()=>{
  const input=heading+'\nAB12CDE\nFG34HIJ',parsed=rules.parseText(input);
  assert.deepEqual(parsed,{groups:[{rt:'914321',status:'OCYL',plant:'7209',expected:18,ctns:['AB12CDE','FG34HIJ']}],leading:[]});
  assert.equal(rules.parseEvents(input).filter(e=>e.type==='header').length,1);
  assert.equal(model.build([{id:'a',ocrText:rules.reconcileRows([pass(input)]).text}])[0].rt,'914321');
 });
}
test('explicit RT without other metadata is preserved for manual completion',()=>{
 const g=rules.parseText('RT: 914321\nAB12CDE').groups[0];assert.equal(g.rt,'914321');assert.equal(g.status,'');assert.equal(g.expected,0);
});
test('bare numbers, product descriptions, plant and totals cannot fabricate an RT',()=>{
 for(const prefix of ['914321','7209 TOTAL 18','RT_ARGON_X40S_TECH_WJ2RB_TW_147B','2026-09-27','BOTTLE OCYL 7209','7A44','18']){
  const p=rules.parseText(prefix+'\nAB12CDE');assert.equal(p.groups.length,0,prefix);assert.ok(p.leading.includes('AB12CDE'));
 }
});
test('joining stops at a CTN and never borrows the following group header',()=>{
 const p=rules.parseText('914321\nAB12CDE\nCYLINDER OCYL 7209 TOTAL 18\nFG34HIJ\n914322 CYLINDER MNT1 7A44 TOTAL 1\nKL56MNP');
 assert.deepEqual(p.leading,['AB12CDE','FG34HIJ']);assert.deepEqual(p.groups.map(g=>[g.rt,g.ctns]),[['914322',['KL56MNP']]]);
});
test('RT number whitespace cannot combine two full RT numbers',()=>{
 assert.equal(rules.parseText('914321 914322 CYLINDER OCYL 7209\nAB12CDE').groups.length,0);
});
test('metadata from another pass is preserved without adding, dropping or borrowing CTNs',()=>{
 const out=rules.parseText(rules.restoreMetadata('AB12CDE\nFG34HIJ\nKL56MNP',[pass(header+'\nAB12CDE\nFG34HIJ\nQR78STU')]));
 assert.deepEqual(out.groups[0].ctns,['AB12CDE','FG34HIJ']);assert.deepEqual(out.leading,['KL56MNP']);assert.equal(out.groups[0].rt,'914321');
});
test('conflicting source RT or status remains unassigned',()=>{
 for(const other of [header.replace('914321','914322'),header.replace('OCYL','MNT1')]){
  const out=rules.parseText(rules.restoreMetadata('AB12CDE',[pass(header+'\nAB12CDE'),pass(other+'\nAB12CDE')]));assert.deepEqual(out.leading,['AB12CDE']);assert.equal(out.groups.length,0);
 }
});
test('partial metadata uses compatible same-photo evidence',()=>{
 const out=rules.parseText(rules.restoreMetadata('RT: 914321\nAB12CDE',[pass(header+'\nAB12CDE')]));assert.equal(out.groups[0].status,'OCYL');assert.equal(out.groups[0].plant,'7209');assert.equal(out.groups[0].expected,18);
});
test('no-heading continuation does not request additional header recognition',()=>{
 assert.equal(rules.needsHeaderPass('AB12CDE\nFG34HIJ',[pass('AB12CDE\nFG34HIJ')]),false);
 assert.equal(rules.needsHeaderPass('AB12CDE',[pass('CYLINDER OCYL 7209\nAB12CDE')]),true);
 assert.equal(rules.needsHeaderPass(header+'\nAB12CDE',[pass(header+'\nAB12CDE')]),false);
});
test('manual classification still overrides improved automatic RT',()=>{
 const p={id:'a',ocrText:'914321\nCYLINDER OCYL 7209 TOTAL 1\nAB12CDE'};
 p.rc31Review=model.updateReview(p,[{original:'AB12CDE',ctn:'AB12CDE'}],{rt:'914322',status:'MNT1',plant:'7A44',expected:1});assert.equal(model.build([p])[0].rt,'914322');
});

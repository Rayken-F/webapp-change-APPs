const test=require('node:test'),assert=require('node:assert/strict');
const rules=require('../ds-app-grinding-recovery-rc/iqc-ocr-rules-rc31.js');
const model=require('../ds-app-grinding-recovery-rc/iqc-ocr-review-model-rc31.js');
const photo=(id,text,extra={})=>({id,seq:Number(id.slice(1)),status:'RECOGNIZED',ocrText:text,...extra});
const header='113374 CYLINDER OCYL 7209 TOTAL 2';
const meta={rt:'113374',status:'OCYL',plant:'7209',expected:2};
test('mixed continuation and header retains every leading CTN across OCR passes',()=>{
 const merged=rules.mergeParsedPasses([{data:{text:'AB12CDE\nFG34HIJ\n'+header+'\nKL56MNP'}},{data:{text:header+'\nKL56MNP\nQR78STU'}}]);
 const parsed=rules.parseText(merged);assert.deepEqual(parsed.leading,['AB12CDE','FG34HIJ']);assert.deepEqual(parsed.groups[0].ctns,['KL56MNP','QR78STU']);
});
test('missing RT is retained explicitly, never truncated to preceding capacity',()=>{
 const groups=model.build([photo('p1',header+'\nAB12CDE'),photo('p2','FG34HIJ\nKL56MNP\nQR78STU'),photo('p3','113407 CYLINDER OCYL 7209 TOTAL 1\nUV90WXY')]);
 assert.equal(groups.reduce((n,g)=>n+g.ctns.length,0),5);assert.equal(groups.find(g=>!g.rt).ctns.length,3);
});
test('whole-photo manual assignment merges RT group and retains every source photo',()=>{
 const p=photo('p2','FG34HIJ');p.rc31Review=model.updateReview(p,[{original:'FG34HIJ',ctn:'FG34HIJ'}],meta);
 const groups=model.build([photo('p1',header+'\nAB12CDE'),p]);assert.equal(groups.length,1);assert.deepEqual(groups[0].photoIds,['p1','p2']);assert.equal(groups[0].ready,true);assert.equal(p.ocrText,'FG34HIJ');
});
test('individual CTNs can belong to different RTs in a single photo',()=>{
 const p=photo('p1','AB12CDE\nFG34HIJ');p.rc31Review=model.updateReview(p,[{original:'AB12CDE',ctn:'AB12CDE'}],{...meta,expected:1});
 p.rc31Review=model.updateReview(p,[{original:'FG34HIJ',ctn:'FG34HIJ'}],{...meta,rt:'113407',expected:1});
 assert.deepEqual(model.build([p]).map(g=>g.rt),['113374','113407']);assert.equal(p.rc31Review.history.length,2);
});
test('removing only selected manual assignment preserves the other selection',()=>{
 const p=photo('p1','AB12CDE\nFG34HIJ');p.rc31Review=model.updateReview(p,[{original:'AB12CDE',ctn:'AB12CDE'},{original:'FG34HIJ',ctn:'FG34HIJ'}],meta);
 p.rc31Review=model.updateReview(p,[{original:'AB12CDE',ctn:'AB12CDE'}],{},{clear:true});assert.equal(p.rc31Review.ctns.AB12CDE,undefined);assert.equal(p.rc31Review.ctns.FG34HIJ.rt,'113374');
});
test('manual decisions survive OCR retry changing order or omitting a previous CTN',()=>{
 const p=photo('p1','AB12CDE\nFG34HIJ');p.rc31Review=model.updateReview(p,[{original:'AB12CDE',ctn:'AB12CD1'}],meta);p.ocrText='FG34HIJ';
 const groups=model.build([p]),g=groups.find(g=>g.rt);assert.deepEqual(g.ctns,['AB12CD1']);assert.ok(g.warnings.some(w=>w.includes('本次 OCR')));assert.equal(g.ready,false);
});
test('conflicting groups preserve both sources and require review',()=>{
 const groups=model.build([photo('p1',header+'\nAB12CDE'),photo('p2','113407 CYLINDER OCYL 7209 TOTAL 1\nAB12CDE')]);
 assert.equal(groups.length,2);assert.ok(groups.every(g=>g.warnings.length&&!g.ready));
});
test('invalid/manual duplicate CTNs and RTs are rejected without changing source',()=>{
 const p=photo('p1','AB12CDE\nFG34HIJ');
 assert.throws(()=>model.updateReview(p,[{original:'AB12CDE',ctn:'AB12CDE'}],{rt:'unknown'}),/RT/);
 assert.throws(()=>model.updateReview(p,[{original:'AB12CDE',ctn:'FG34HIJ'}],meta),/重複/);
 assert.throws(()=>model.updateReview(p,[{original:'AB12CDE',ctn:'oops'}],meta),/格式/);
 assert.equal(p.rc31Review,undefined);
});
test('legacy V8 manual fields and CTN edits remain visible',()=>{
 const photos=[photo('p1',header+'\nAB12CDE\nFG34HIJ')];
 const legacy=model.legacyDecisions(photos,{'113374|1|0':{status:'MNT1',plant:'7A44',expected:2,ctns:['AB12CD1','FG34HIJ']}});
 const groups=model.build(photos,legacy);assert.equal(groups[0].status,'MNT1');assert.equal(groups[0].plant,'7A44');assert.deepEqual(groups[0].ctns,['AB12CD1','FG34HIJ']);
});
test('new explicit manual assignment takes priority over preserved legacy review',()=>{
 const p=photo('p1',header+'\nAB12CDE');p.rc31Review=model.updateReview(p,[{original:'AB12CDE',ctn:'AB12CDE'}],{...meta,rt:'113407'});
 const legacy=model.legacyDecisions([p],{'113374|1|0':{status:'MNT1'}});assert.equal(model.build([p],legacy)[0].rt,'113407');
});
test('unknown status is not treated as a completed group',()=>{
 const g=model.build([photo('p1','113374 CYLINDER UNKNOWN 7209 TOTAL 1\nAB12CDE')])[0];assert.equal(g.status,'');assert.equal(g.ready,false);
});

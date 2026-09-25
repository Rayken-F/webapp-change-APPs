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
test('presentation collapses assigned/unassigned copies without changing original candidates',()=>{
 const photos=[photo('p1',header+'\nAB12CDE'),photo('p2','AB12CDE\nFG34HIJ'),photo('p3','AB12CDE')];
 const before=JSON.stringify(photos),groups=model.build(photos),original=JSON.stringify(groups),view=model.presentation(groups);
 assert.equal(view.duplicates,1);assert.equal(view.repeatedRows,2);assert.equal(view.unique,2);assert.equal(view.groups.length,2);
 assert.deepEqual(view.groups.flatMap(g=>g.displayCtns),['AB12CDE','FG34HIJ']);assert.equal(view.conflicts.length,0);
 assert.equal(groups.flatMap(g=>g.rows).length,4);assert.equal(JSON.stringify(photos),before);assert.equal(JSON.stringify(groups),original);
 assert.deepEqual(model.candidates(photos[2]).map(r=>r.ctn),['AB12CDE']);
});
test('overlapping CTNs within a known group show once with unique and occurrence counts',()=>{
 const groups=model.build([photo('p1',header+'\nAB12CDE\nFG34HIJ'),photo('p2',header+'\nAB12CDE\nFG34HIJ'),photo('p3','AB12CDE')]);
 const view=model.presentation(groups);assert.equal(view.duplicates,2);assert.equal(view.repeatedRows,3);assert.equal(view.groups.length,1);assert.equal(view.groups[0].displayCtns.length,2);assert.equal(view.groups[0].ready,true);
});
test('conflicting RT copies display once in unresolved conflicts, never pick a winner',()=>{
 const photos=[photo('p1',header+'\nAB12CDE'),photo('p2','113407 CYLINDER OCYL 7209 TOTAL 1\nAB12CDE'),photo('p3','AB12CDE')];
 const groups=model.build(photos),view=model.presentation(groups);assert.equal(view.conflicts.length,1);assert.equal(view.conflicts[0].ctn,'AB12CDE');assert.equal(view.conflicts[0].photoIds.length,3);assert.equal(view.conflicts[0].choices.length,2);
 assert.equal(view.groups.flatMap(g=>g.displayCtns).length,0);assert.ok(groups.every(g=>!g.ready&&g.warnings.length));
});
test('same RT with different status stays an explicit deduplicated conflict',()=>{
 const groups=model.build([photo('p1',header+'\nAB12CDE'),photo('p2','113374 CYLINDER MNT1 7209 TOTAL 1\nAB12CDE')]);
 const view=model.presentation(groups);assert.equal(view.conflicts.length,1);assert.equal(view.conflicts[0].choices.length,2);
 const updates=model.mergeReviews([photo('p1',header+'\nAB12CDE'),photo('p2','113374 CYLINDER MNT1 7209 TOTAL 1\nAB12CDE')],groups.map(g=>g.key),meta);assert.equal(updates.length,2);
});

test('a complete copy cannot hide ambiguous OCR in another photo from either screen or submit',()=>{
 const photos=[photo('p1',header+'\nAB12CDE'),photo('p2',header+'\nAB12CDE\n113407 CYLINDER OCYL 7209 TOTAL 1\nAB12CDE')];
 const groups=model.build(photos),before=JSON.stringify(groups),view=model.presentation(groups),resolved=model.resolve(groups);
 assert.equal(view.conflicts.length,1);assert.match(view.conflicts[0].reason,/歸屬不明/);assert.deepEqual(view.conflicts[0].photoSeqs,[1,2]);
 assert.ok(view.groups.every(g=>!g.ready));assert.equal(view.groups.flatMap(g=>g.displayCtns).length,0);assert.ok(resolved[0].problem);assert.equal(JSON.stringify(groups),before);
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
test('same RT with empty manual fields joins its unique known group and deduplicates overlaps',()=>{
 const p=photo('p2','AB12CDE\nFG34HIJ');p.rc31Review=model.updateReview(p,[{original:'AB12CDE',ctn:'AB12CDE'},{original:'FG34HIJ',ctn:'FG34HIJ'}],{rt:'113374'});
 const first=photo('p1',header+'\nAB12CDE');
 for(const photos of [[first,p],[p,first]]){const groups=model.build(photos);assert.equal(groups.length,1);assert.equal(groups[0].ctns.length,2);assert.equal(groups[0].status,'OCYL');assert.equal(groups[0].plant,'7209');assert.equal(groups[0].warnings.length,0);assert.equal(groups[0].ready,true);}
});
test('missing fields cannot bridge incompatible same-RT groups',()=>{
 const groups=model.build([photo('p1',header+'\nAB12CDE'),photo('p2','113374 CYLINDER MNT1 7209 TOTAL 1\nFG34HIJ'),photo('p3','113374 CYLINDER UNKNOWN UNKNOWN TOTAL 0\nKL56MNP')]);
 assert.equal(groups.length,3);assert.ok(groups.find(g=>!g.status).warnings.some(w=>w.includes('不同狀態')));
});
test('a photo with no OCR candidates accepts explicit manual CTNs and retains original text',()=>{
 const p=photo('p1','NEXT PAGE');p.rc31Review=model.updateReview(p,[{original:'AB12CDE',ctn:'AB12CDE',added:true}],{...meta,expected:1});
 const g=model.build([p])[0];assert.deepEqual(g.ctns,['AB12CDE']);assert.equal(g.ready,true);assert.equal(g.rows[0].stale,false);assert.equal(p.ocrText,'NEXT PAGE');
 assert.throws(()=>model.updateReview(p,[{original:'BADINPUT',ctn:'BADINPUT',added:true}],meta));
});
test('complementary missing fields merge only when same RT has no conflicts',()=>{
 const g=model.build([photo('p1','113374 CYLINDER OCYL UNKNOWN TOTAL 2\nAB12CDE'),photo('p2','113374 CYLINDER UNKNOWN 7209 TOTAL 2\nFG34HIJ')]);assert.equal(g.length,1);assert.equal(g[0].ready,true);
});

test('explicit reconciliation merges same RT conflicts and deduplicates sources without rewriting OCR',()=>{
 const photos=[photo('p1',header+'\nAB12CDE'),photo('p2','113374 CYLINDER MNT1 7A44 TOTAL 2\nAB12CDE\nFG34HIJ')];
 const keys=model.build(photos).map(g=>g.key),before=photos.map(p=>p.ocrText);
 const updates=model.mergeReviews(photos,keys,{...meta,expected:2});
 const next=photos.map(p=>({...p,rc31Review:updates.find(u=>u.id===p.id).review}));
 const groups=model.build(next);assert.equal(groups.length,1);assert.equal(groups[0].ready,true);assert.equal(groups[0].overlapCount,1);assert.equal(groups[0].photoIds.length,2);assert.deepEqual(next.map(p=>p.ocrText),before);assert.ok(next.every(p=>p.rc31Review.history.length===1));
});
test('reconciliation leaves unselected RT and metadata in the same photo untouched',()=>{
 const photos=[photo('p1',header+'\nAB12CDE\n113407 CYLINDER MNT1 7A44 TOTAL 1\nKL56MNP'),photo('p2','113374 CYLINDER MNT1 7209 TOTAL 1\nFG34HIJ')];
 const selected=model.build(photos).filter(g=>g.rt==='113374').map(g=>g.key),updates=model.mergeReviews(photos,selected,meta);
 const groups=model.build(photos.map(p=>({...p,rc31Review:updates.find(u=>u.id===p.id).review})));assert.equal(groups.length,2);assert.equal(groups.find(g=>g.rt==='113407').status,'MNT1');assert.equal(groups.find(g=>g.rt==='113407').rows[0].manual,undefined);
});
test('reconciliation rejects mismatched RT, changed keys, duplicates or unconfirmed metadata',()=>{
 const photos=[photo('p1',header+'\nAB12CDE'),photo('p2','113374 CYLINDER MNT1 7209 TOTAL 1\nFG34HIJ'),photo('p3','113407 CYLINDER OCYL 7209 TOTAL 1\nKL56MNP')];const groups=model.build(photos),keys=groups.filter(g=>g.rt==='113374').map(g=>g.key);
 assert.throws(()=>model.mergeReviews(photos,groups.map(g=>g.key),meta),/相同 RT/);
 assert.throws(()=>model.mergeReviews(photos,[keys[0],'removed'],meta),/群組變動/);
 assert.throws(()=>model.mergeReviews(photos,[keys[0],keys[0]],meta),/群組變動/);
 assert.throws(()=>model.mergeReviews(photos,keys,{...meta,status:''}),/狀態與廠區/);
 assert.ok(photos.every(p=>!p.rc31Review));
});
test('reconciliation preserves earlier corrected CTNs and prior review history',()=>{
 const p=photo('p1',header+'\nAB12CDE');p.rc31Review=model.updateReview(p,[{original:'AB12CDE',ctn:'AB12CD1'}],meta);
 const photos=[p,photo('p2','113374 CYLINDER MNT1 7209 TOTAL 1\nFG34HIJ')],updates=model.mergeReviews(photos,model.build(photos).map(g=>g.key),meta);
 assert.equal(updates[0].review.ctns.AB12CDE.ctn,'AB12CD1');assert.equal(updates[0].review.history.length,2);assert.equal(p.rc31Review.history.length,1);
});

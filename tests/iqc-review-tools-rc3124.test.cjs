const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../ds-app-grinding-recovery-rc/iqc-ocr-review-model-rc31.js'),submit=require('../ds-app-grinding-recovery-rc/iqc-submit-model-rc31.js'),rules=require('../ds-app-grinding-recovery-rc/iqc-ocr-rules-rc31.js');
const A='AB12CDE',B='FG34HIJ',C='KL56MNP',D='QR78STU';
const photo=(id,seq,ctns,rt='113374')=>({id,seq,updatedAt:'v1',status:'RECOGNIZED',ocrText:(rt?`${rt} CYLINDER OCYL 7209 TOTAL ${ctns.length}\n`:'')+ctns.join('\n')});
const apply=(photos,updates)=>photos.map(p=>({...p,rc31Review:updates.find(u=>u.id===p.id)?.review||p.rc31Review}));
const draft=photos=>submit.draft({batch:{id:'test',status:'DRAFT',regionCode:'A'},photos});
test('supplemental OCR reads return to their source row, and correction keeps that row',()=>{
 let p=photo('a',1,[A,C,B]);p.rc31RawPasses=[{text:[A,C].join('\n')},{text:[A,B,C].join('\n')}];
 assert.deepEqual(model.candidates(p).map(r=>r.ctn),[A,B,C]);
 p.rc31Review=model.updateReview(p,[{original:B,ctn:D}],{rt:'113374',status:'OCYL',plant:'7209'});
 assert.deepEqual(model.build([p])[0].ctns,[A,D,C]);assert.deepEqual(draft([p]).items.map(r=>r.ctn),[A,D,C]);
});
test('spatial order overrides reordered merged text and old pass ordering',()=>{
 const p={...photo('a',1,[C,A,B]),rc31Order:[A,B,C],rc31RawPasses:[{text:[C,B,A].join('\n')}]};assert.deepEqual(model.candidates(p).map(r=>r.ctn),[A,B,C]);
});
test('overlapping photos reconstruct source order independent of upload direction',()=>{
 const groups=model.build([photo('a',1,[C,D]),photo('b',2,[A,B,C])]);assert.deepEqual(groups[0].ctns,[A,B,C,D]);assert.deepEqual(model.presentation(groups).groups[0].displayCtns,[A,B,C,D]);
});
test('contradictory sequences terminate, preserve all CTNs and use stronger sequence',()=>{assert.deepEqual(model.sequenceOrder([C,A,B],[[A,B,C],[C,B,A]]),[A,B,C]);});
test('old passes map alternative reading to retained candidate row',()=>{
 const p={...photo('a',1,[A,C,D]),rc31RawPasses:[{text:[A,B,C].join('\n')}],rc31Quality:{uncertain:[{ctn:D,alternatives:[B,D],reason:'CONFLICT'}]}};
 assert.deepEqual(model.candidates(p).map(r=>r.ctn),[A,D,C]);assert.equal(model.candidates(p)[1].needsCheck,true);
});
test('uncertainty remains attached to an edited original and not every manual CTN',()=>{
 const p=photo('a',1,[A,B]);p.rc31Quality={uncertain:[{ctn:A,reason:'LOW_CONFIDENCE'}]};p.rc31Review=model.updateReview(p,[{original:A,ctn:C}],{rt:'113374'});
 assert.equal(model.candidates(p)[0].needsCheck,true);assert.equal(model.candidates(p)[1].needsCheck,false);
});
test('remove covers all duplicate source photos and omits CTN from draft without touching OCR',()=>{
 const photos=[photo('a',1,[A,B]),photo('b',2,[A,C])],original=JSON.stringify(photos),updates=model.excludeReviews(photos,A),next=apply(photos,updates);
 assert.equal(updates.length,2);assert.deepEqual(draft(next).items.map(r=>r.ctn),[B,C]);assert.deepEqual(model.excluded(next),[A]);assert.equal(JSON.stringify(photos),original);
});
test('unassigned false positive can be removed with no RT while valid photo remains submittable',()=>{
 const photos=[photo('a',1,[A]),photo('b',2,[B],'')],next=apply(photos,model.excludeReviews(photos,B));assert.deepEqual(draft(next).items.map(r=>r.ctn),[A]);
 assert.throws(()=>draft(apply(next,model.excludeReviews(next,A))),/1～500/);
});
test('restore brings back source location, edited value and all duplicate sources',()=>{
 const photos=[photo('a',1,[A,B,C]),photo('b',2,[B])];photos[0].rc31Review=model.updateReview(photos[0],[{original:B,ctn:D}],{rt:'113374',status:'OCYL',plant:'7209'});
 const removed=apply(photos,model.excludeReviews(photos,D)),restored=apply(removed,model.excludeReviews(removed,D,true));
 assert.deepEqual(model.candidates(restored[0]).map(r=>r.ctn),[A,D,C]);assert.deepEqual(restored[0].rc31Review.ctns,photos[0].rc31Review.ctns);assert.equal(restored[0].rc31Review.history.at(-1).action,'RESTORE');
});
test('exclusion survives manual assignment and OCR retries; missing candidate can be restored',()=>{
 let p=photo('a',1,[A,B]);p=apply([p],model.excludeReviews([p],A))[0];p.rc31Review=model.updateReview(p,[{original:B,ctn:B}],{rt:'113374'});
 assert.deepEqual(model.candidates(p).map(r=>r.ctn),[B]);p.ocrText=photo('a',1,[B]).ocrText;
 p=apply([p],model.excludeReviews([p],A,true))[0];assert.deepEqual(model.candidates(p).map(r=>r.ctn),[A,B]);
});
test('stale removal and restoration reject instead of reporting a fake success',()=>{assert.throws(()=>model.excludeReviews([photo('a',1,[A])],B),/清單已變更/);assert.throws(()=>model.excludeReviews([photo('a',1,[A])],A,true),/清單已變更/);});
test('removing corrected legacy value excludes original key and keeps legacy assignment on restore',()=>{
 const photos=[photo('a',1,[A,B])],legacy=[{original:A,photoIds:['a'],review:{ctn:C,rt:'113374',status:'OCYL',plant:'7209'}}];
 const next=apply(photos,model.excludeReviews(photos,C,false,legacy));assert.deepEqual(model.build(next,legacy)[0].ctns,[B]);
 const restored=apply(next,model.excludeReviews(next,C,true,legacy));assert.deepEqual(model.build(restored,legacy)[0].ctns,[C,B]);
});
test('new row reconciliation records supplemental row geometry in photo order',()=>{
 const result=rows=>({data:{text:rows.map(([t])=>t).join('\n'),blocks:[{paragraphs:[{lines:rows.map(([t,y])=>({text:t,bbox:{x0:10,x1:130,y0:y,y1:y+20},words:[{text:t,confidence:95,bbox:{x0:10,x1:130,y0:y,y1:y+20}}]}))}]}]}});
 assert.deepEqual(rules.reconcileRows([result([[A,10],[C,90]]),result([[B,50],[C,90]])]).order,[A,B,C]);
});

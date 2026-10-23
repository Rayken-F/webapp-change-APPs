const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../DS-CYLINDER-REGISTRATION-DEMO/model.js');
const make = (ctn, steel) => ({ ...M.row(0), ctn, steel });
test('normalization preserves zeroes and ambiguous letter identity', () => {
  assert.equal(M.normalize(' ab 01 cO0 '), 'AB01CO0');
  assert.equal(M.normalize('０００１２３'), '000123');
});
test('prefix application only expands shorthand, is idempotent and invalidates confirmation', () => {
  const a = make('CDE','001023'), b = make('AB12XYZ','26A001024'); a.confirmed=true;b.confirmed=true;
  assert.equal(M.applyPrefixes([a,b],'AB12','26A'),1);
  assert.equal(a.ctn,'AB12CDE');assert.equal(a.steel,'26A001023');assert.equal(a.confirmed,false);
  assert.equal(b.ctn,'AB12XYZ');assert.equal(b.confirmed,true);
  assert.equal(M.applyPrefixes([a,b],'AB12','26A'),0);
});
test('blank prefix never inferred; invalid prefix rejected', () => {
  const a=make('CDE','001023');assert.equal(M.applyPrefixes([a],'',''),0);assert.equal(a.ctn,'CDE');
  assert.throws(()=>M.applyPrefixes([a],'12345',''));assert.throws(()=>M.applyPrefixes([a],'','=1'));
});
test('handwriting candidates cannot overwrite edits or confirmation', () => {
  const r=make('','');assert.equal(M.applyCandidate(r,'ab12cde','000123'),true);assert.equal(r.confirmed,false);
  r.edited=true;assert.equal(M.applyCandidate(r,'ZZ99AAA','111111'),false);assert.equal(r.steel,'000123');
  r.edited=false;r.confirmed=true;assert.equal(M.applyCandidate(r,'ZZ99AAA','111111'),false);
});
test('duplicate CTN and serial prevent checklist even after confirmation', () => {
  const rows=[make('AB12CDE','26A001001'),make(' ab12cde ','26A001002')];rows.forEach(r=>r.confirmed=true);
  assert.ok(M.issues(rows).every(e=>e.includes('CTN 重複')));assert.equal(M.ready(rows),false);
  rows[1].ctn='AB12CDF';rows[1].steel=rows[0].steel;assert.ok(M.issues(rows).every(e=>e.includes('鋼號重複')));
});
test('missing values, shorthand and formula-like input cannot pass export', () => {
  for(const r of [make('','001'),make('ABC','001'),make('AB12CDE','=SUM(1)'),make('AB12CDE','-123')]){
    r.confirmed=true;assert.equal(M.ready([r]),false);assert.throws(()=>M.csv([r]));
  }
  assert.equal(M.ready([]),false);
});
test('CSV retains leading zeros as string content and source ordering', () => {
  const rows=[make('AB12CDE','000123'),{...make('AB12CDF','000124'),sourceIndex:null}];rows.forEach(r=>r.confirmed=true);
  assert.equal(M.ready(rows),true);rows.forEach((r,i)=>M.complete(rows,'001234',i));const csv=M.csv(rows,'001234');assert.ok(csv.includes('"000123"'));assert.ok(csv.includes('"001234"'));assert.ok(csv.includes('"手動新增"'));assert.ok(csv.startsWith('\ufeff'));assert.ok(csv.indexOf('AB12CDE')<csv.indexOf('AB12CDF'));
});
test('RT and exact reviewed identifiers bind registration; edits and re-review invalidate completion',()=>{
  const rows=[make('AB12CDE','000123'),make('AB12CDF','000124')];rows.forEach(r=>r.confirmed=true);
  assert.throws(()=>M.complete(rows,'',0));assert.equal(M.outputReady(rows,'001234'),false);
  M.complete(rows,'001234',0);M.complete(rows,'001234',1);assert.equal(M.outputReady(rows,'001234'),true);
  assert.equal(M.outputReady(rows,'001235'),false);rows[0].steel='000125';assert.equal(M.outputReady(rows,'001234'),false);
  M.complete(rows,'001234',0);assert.equal(M.outputReady(rows,'001234'),true);rows[0].confirmed=false;assert.equal(M.outputReady(rows,'001234'),false);
});
test('uncertain, conflicting and missing model scores flag review without changing text',()=>{
  const r=make('','');M.applyCandidate(r,{text:'AB12CDE',score:.99,alternatives:['AB12CDE']},{text:'000123',score:.98,alternatives:['000123']});assert.equal(M.confidence(r).length,0);
  r.steelAlternatives.push('000124');assert.ok(M.confidence(r).some(s=>s.includes('候選')));r.steelAlternatives=[];r.ctnScore=.5;assert.ok(M.confidence(r).length);assert.equal(r.ctn,'AB12CDE');
});
test('four corner geometry rejects crossing, invalid, and upside-down quadrilaterals', () => {
  assert.equal(M.quadValid([[.2,.1],[.7,.1],[.75,.7],[.2,.8]]),true);
  for(const q of [[],[[0,0],[1,1],[1,0],[0,1]],[[0,1],[1,1],[1,0],[0,0]],[[0,0],[2,0],[1,1],[0,1]]])assert.equal(M.quadValid(q),false);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, compare } = require('../tools/cylinder-zero-ab/evaluate.cjs');
const cases = require('../tools/cylinder-zero-ab/cases.json');
const draft = (photo = 'photo A') => ({ version: 'CYL-REG-DEMO-0.6.1-20261024', rowCount: cases.rows.length,
  photo: 'data:image/png;base64,' + Buffer.from(photo).toString('base64'),
  rows: cases.rows.map((row, sourceIndex) => ({ sourceIndex, ...row, rawCtn: row.ctn, rawSteel: row.steel })) });

test('scores full pairs, CTN and steel independently, never candidate alternatives', () => {
  const value = draft();
  value.rows[0].ctn = value.rows[0].rawCtn = 'AB20KHO';
  value.rows[0].ctnAlternatives = [cases.rows[0].ctn];
  const score = evaluate(value);
  assert.equal(score.pairs.correct, 15); assert.equal(score.ctn.correct, 15); assert.equal(score.steel.correct, 16);
  assert.equal(score.fields.correct, 31); assert.equal(score.differences['same-length-mismatch'], 1);
});
test('missing rows and empty fields stay in the fixed denominator', () => {
  const value = draft(); value.rows.splice(4, 1);
  value.rows[0].ctn = value.rows[0].rawCtn = '';
  const score = evaluate(value);
  assert.equal(score.pairs.total, 16); assert.equal(score.pairs.correct, 14);
  assert.equal(score.fields.total, 32); assert.equal(score.differences.empty, 3); assert.equal(score.missingRows, 1);
});
test('uses source order, not array order, and only normalizes case, width and whitespace', () => {
  const value = draft(); value.rows.reverse(); value.rows[0].ctn = 'ｄｆ２１ｙｒｓ'; value.rows[0].rawCtn = 'df 21 yrs';
  assert.equal(evaluate(value).pairs.correct, 16);
});
test('rejects human-corrected, confirmed, prefix-applied or completed drafts', () => {
  for (const key of ['edited', 'confirmed', 'prefixApplied', 'registered']) {
    const value = draft(); value.rows[0][key] = true; assert.throws(() => evaluate(value), /untouched/);
  }
  const value = draft(); value.rows[0].ctn = 'AB20KH6'; assert.throws(() => evaluate(value), /altered/);
});
test('rejects duplicate, out-of-range and manual source rows', () => {
  for (const index of [null, 1, -1, 16, 0.5]) {
    const value = draft(); value.rows[0].sourceIndex = index; assert.throws(() => evaluate(value), /source row/);
  }
});
test('compares paired outcomes and requires different photos at the same build', () => {
  const a = draft(), b = draft('photo B');
  a.rows[0].steel = a.rows[0].rawSteel = '24B163008';
  const report = compare(a, b);
  assert.deepEqual(report.pairedOutcomes, { bothCorrect: 15, ordinaryOnly: 0, slashedOnly: 1, bothIncorrect: 0 });
  assert.equal(report.pairDifferenceSlashedMinusOrdinary, 1);
  assert.throws(() => compare(draft(), draft()), /separately/);
  b.version += '-different'; assert.throws(() => compare(a, b), /same DEMO/);
});
test('reports net length differences without treating zeros as letters or numbers', () => {
  const value = draft(); value.rows[0].steel = value.rows[0].rawSteel = '24B10308';
  value.rows[1].ctn = value.rows[1].rawCtn = 'CD002KHO';
  const score = evaluate(value);
  assert.equal(score.differences.shorter, 1); assert.equal(score.differences.longer, 1);
  assert.ok(score.fieldsContainingZero.total > 0); assert.ok(score.fieldsContainingLetterO.total > 0);
  assert.equal(score.fieldsContainingLetterO.correct, score.fieldsContainingLetterO.total - 1);
});
test('accepts rows created by the actual DEMO model and rejects missing photo/reference count', () => {
  const model = require('../DS-CYLINDER-REGISTRATION-DEMO/model.js');
  const value = draft(); value.version = model.VERSION;
  value.rows = cases.rows.map((expected, index) => {
    const row = model.row(index); model.applyCandidate(row, { text: expected.ctn }, { text: expected.steel }); return row;
  });
  assert.equal(evaluate(value).pairs.correct, 16);
  value.photo = null; assert.throws(() => evaluate(value), /photo missing/);
  value.rowCount = 15; assert.throws(() => evaluate(value), /row count/);
});

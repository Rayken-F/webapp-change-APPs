'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const cases = require('./cases.json');
const normalize = value => value.normalize('NFKC').toUpperCase().replace(/\s+/g, '');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const rate = (correct, total) => ({ correct, total, percent: total ? Number((correct / total * 100).toFixed(2)) : null });

function validateTruth(truth) {
  if (!truth || !Array.isArray(truth.rows) || !truth.rows.length) throw Error('Missing reference rows');
  for (const field of ['ctn', 'steel']) {
    const values = truth.rows.map(row => row[field]);
    const pattern = field === 'ctn' ? /^[A-Z0-9]{2}[0-9]{2}[A-Z0-9]{3}$/ : /^[A-Z0-9-]+$/;
    if (values.some(value => typeof value !== 'string' || !pattern.test(value)) || new Set(values).size !== values.length) {
      throw Error('Reference values must be unique, complete identifiers: ' + field);
    }
  }
}

function evaluate(draft, truth = cases) {
  validateTruth(truth);
  if (!/^CYL-REG-DEMO-/.test(draft?.version || '') || draft.rowCount !== truth.rows.length || !Array.isArray(draft.rows)) {
    throw Error('Expected a DEMO draft with the reference row count');
  }
  if (typeof draft.photo !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(draft.photo)) {
    throw Error('Original photo missing from draft');
  }
  const byIndex = new Map();
  for (const row of draft.rows) {
    const index = row.sourceIndex;
    if (!Number.isInteger(index) || index < 0 || index >= truth.rows.length || byIndex.has(index)) {
      throw Error('Invalid, duplicate or manually added source row');
    }
    if (row.edited || row.confirmed || row.prefixApplied || row.registered) {
      throw Error('Use the untouched OCR draft before manual review or prefix application');
    }
    for (const [field, raw] of [['ctn', 'rawCtn'], ['steel', 'rawSteel']]) {
      if (typeof row[raw] !== 'string' || typeof row[field] !== 'string' || normalize(row[raw]) !== normalize(row[field])) {
        throw Error('Candidate was altered or raw OCR is missing');
      }
    }
    byIndex.set(index, row);
  }
  const details = truth.rows.map((expected, index) => {
    const row = byIndex.get(index);
    const fields = {};
    for (const field of ['ctn', 'steel']) {
      const raw = row?.[field === 'ctn' ? 'rawCtn' : 'rawSteel'] ?? '';
      const actual = normalize(raw);
      const match = actual === expected[field];
      fields[field] = { expected: expected[field], raw, actual, match,
        difference: match ? 'exact' : !actual ? 'empty' : actual.length < expected[field].length ? 'shorter' : actual.length > expected[field].length ? 'longer' : 'same-length-mismatch' };
    }
    return { sourceRow: index + 1, missingRow: !row, ...fields, pairMatch: fields.ctn.match && fields.steel.match };
  });
  const fields = details.flatMap(row => [row.ctn, row.steel]);
  const subset = character => {
    const selected = fields.filter(field => field.expected.includes(character));
    return rate(selected.filter(field => field.match).length, selected.length);
  };
  return {
    version: draft.version, photoSha256: hash(Buffer.from(draft.photo.split(',')[1], 'base64')),
    sourceRowsPresent: byIndex.size, missingRows: details.filter(row => row.missingRow).length,
    pairs: rate(details.filter(row => row.pairMatch).length, details.length),
    ctn: rate(details.filter(row => row.ctn.match).length, details.length),
    steel: rate(details.filter(row => row.steel.match).length, details.length),
    fields: rate(fields.filter(field => field.match).length, fields.length),
    fieldsContainingZero: subset('0'), fieldsContainingLetterO: subset('O'),
    differences: Object.fromEntries(['empty', 'shorter', 'longer', 'same-length-mismatch'].map(kind => [kind, fields.filter(field => field.difference === kind).length])),
    details
  };
}

function compare(ordinary, slashed, truth = cases) {
  const a = evaluate(ordinary, truth), b = evaluate(slashed, truth);
  if (a.version !== b.version) throw Error('Both styles must use the same DEMO build');
  if (a.photoSha256 === b.photoSha256) throw Error('Two separately handwritten photos are required');
  const pairedOutcomes = { bothCorrect: 0, ordinaryOnly: 0, slashedOnly: 0, bothIncorrect: 0 };
  a.details.forEach((row, index) => {
    const left = row.pairMatch, right = b.details[index].pairMatch;
    pairedOutcomes[left && right ? 'bothCorrect' : left ? 'ordinaryOnly' : right ? 'slashedOnly' : 'bothIncorrect']++;
  });
  return {
    experiment: truth.id, normalization: 'NFKC, uppercase and whitespace removal only; no character substitution',
    status: 'Descriptive sample comparison only; not proof of reliability across writers or devices',
    notes: ['Missing source rows count as incorrect; alternatives never rescue the selected candidate.',
      'Zero/O subsets measure full-field exact matches, not per-character accuracy.',
      'Shorter/longer describes net string length; substitutions plus omissions may cancel out.',
      'Confirm paper transcription against the reference before scoring; record mismatches separately.'],
    ordinary: a, slashed: b, pairedOutcomes,
    pairDifferenceSlashedMinusOrdinary: b.pairs.correct - a.pairs.correct
  };
}

if (require.main === module) {
  try {
    const [ordinaryFile, slashedFile, output] = process.argv.slice(2);
    if (process.argv.length !== 5) throw Error('Usage: node evaluate.cjs ordinary.private.json slashed.private.json report.private.json');
    const ordinaryText = fs.readFileSync(ordinaryFile, 'utf8'), slashedText = fs.readFileSync(slashedFile, 'utf8');
    const report = compare(JSON.parse(ordinaryText), JSON.parse(slashedText));
    report.draftSha256 = { ordinary: hash(ordinaryText), slashed: hash(slashedText) };
    fs.writeFileSync(output, JSON.stringify(report, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ experiment: report.experiment, ordinary: report.ordinary.pairs, slashed: report.slashed.pairs, pairedOutcomes: report.pairedOutcomes }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { evaluate, compare };

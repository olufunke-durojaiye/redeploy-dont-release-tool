// SPDX-License-Identifier: MIT | Copyright (c) 2026 Olufunke A. Durojaiye
const assert = require('assert');
const { compute } = require('../engine.js');
const { exampleState } = require('../data.js');

const S = exampleState();
const R = compute(S);
const sc = Object.fromEntries(R.scoring.map(s => [s.id, s]));
// Workbook cached values (Scoring tab)
const expect = { A: [2900, 7, 2, 2, 2, 6, 1, false], B: [1200, 3, 2, 1, 2, 5, 3, true],
  C: [2100, 5, 1, 2, 2, 5, 2, true], D: [1000, 2, 1, 1, 1, 3, 4, true], E: [400, 1, 2, 0, 1, 3, 5, true] };
for (const [id, e] of Object.entries(expect)) {
  const s = sc[id];
  assert.deepStrictEqual([s.days, s.years, s.perf, s.tenurePts, s.conduct, s.total, s.rank, s.tieDecided], e, id);
}
// Calibration tab
assert.deepStrictEqual(R.calibration.map(c => [c.id, c.final, c.finalChoice]),
  [['A', 'Department 1', 1], ['C', 'Department 1', 1], ['B', 'Department 3', 2], ['D', 'Department 2', 1], ['E', 'Department 2', 1]]);
// Fairness Review
assert.deepStrictEqual(R.fairness.groups.map(g => [g.group, g.considered, g.received, +g.rate.toFixed(4), g.below]),
  [['40 and over', 2, 2, 1, false], ['Under 40', 3, 2, 0.6667, true]]);
// Summary tab
const m = R.summary;
assert.deepStrictEqual([m.inScope, m.openSeats, m.notVerified, m.noPrefs, m.rulesApproved, m.placed, m.unmatched,
  m.firstRate, m.firstSecondRate, m.tiebreakShare, m.overrideRate, m.missingDocs, m.overfilled, m.belowThreshold, m.avoidedCost],
  [5, 5, 0, 0, false, 5, 0, 0.8, 1, 0.8, 0, 0, 0, 1, 1600000]);

// Extra behaviour: role-group eligibility, capacity, override documentation, random-draw tiebreak
const S2 = exampleState();
S2.needs[2].eligible = 'Logistics, Assembly';
S2.employees[1].group = 'Assembly';      // B
S2.overrides = { e: { placement: 'Department 3', reason: '', approver: 'HR', date: '2026-11-01' } };
let R2 = compute(S2);
const byId = Object.fromEntries(R2.calibration.map(c => [c.id, c]));
assert.strictEqual(byId.B.original, 'Department 3');
assert.strictEqual(byId.E.final, 'Department 3');
assert.strictEqual(byId.E.doc, 'Missing reason/approver/date');
assert.strictEqual(R2.summary.overfilled, 1);
S2.employees[1].group = 'General';
R2 = compute(S2);
assert.strictEqual(Object.fromEntries(R2.calibration.map(c => [c.id, c])).B.original, 'Department 2');
S2.rules.tiebreak = 'Random draw'; S2.overrides = {};
R2 = compute(S2);
assert.deepStrictEqual(R2.calibration.map(c => c.id), ['A', 'B', 'C', 'E', 'D']); // lower draw wins ties
console.log('all engine checks passed');

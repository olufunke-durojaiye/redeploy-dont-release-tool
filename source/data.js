/* SPDX-License-Identifier: MIT AND CC-BY-4.0 | Copyright (c) 2026 Olufunke A. Durojaiye
   Code: MIT. Worked example data adapted from Appendix A of Durojaiye (2026): CC BY 4.0. */
/* Default rules and the worked example (Appendix A of the paper). */
function defaultRules() {
  return {
    asOf: '2026-10-01',
    tiebreak: 'Tenure (days)',
    missingPerf: '1',
    favorable: 'First choice',
    threshold: '0.8',
    weights: {
      perf: { w: '1', reason: 'Example: recent performance indicates readiness to perform in a new team.' },
      tenure: { w: '1', reason: 'Example: recognizes service; note tenure can correlate with age – test effects.' },
      conduct: { w: '1', reason: 'Example: documented conduct issues relevant to the role.' }
    },
    perfBands: [
      { label: 'Top rating band', points: '2' },
      { label: 'Middle rating band', points: '1' },
      { label: 'Lowest rating band', points: '0' }
    ],
    conduct: [
      { label: 'No warning', points: '2' },
      { label: 'Verbal warning', points: '1' },
      { label: 'Written or final warning', points: '0' }
    ],
    tenure: [
      { min: '0', points: '0' },
      { min: '2', points: '1' },
      { min: '5', points: '2' }
    ],
    signoff: { by: '', date: '', counsel: '' }
  };
}
function defaultCost() {
  return { severance: '6000', recruiting: '4000', onboarding: '5000', ramp: '7000',
    training: '3000', transition: '2000', admin: '1000', count: '100', attrition: '0' };
}
function blankState() {
  return { version: 1, rules: defaultRules(), needs: [], employees: [], prefs: [],
    overrides: {}, reviews: [], fairness: [], cost: defaultCost() };
}
function exampleState() {
  var S = blankState();
  var start = '2026-11-16';
  S.needs = [
    { name: 'Department 1', dept: 'Department 1', shift: 'Day', site: 'Site A', seats: '2', eligible: 'All', req: 'Example: completes standard onboarding in week 1', start: start },
    { name: 'Department 2', dept: 'Department 2', shift: 'Day', site: 'Site A', seats: '2', eligible: 'All', req: 'Example: forklift certification (training provided)', start: start },
    { name: 'Department 3', dept: 'Department 3', shift: 'Night', site: 'Site A', seats: '1', eligible: 'All', req: 'Example: night-shift availability', start: start }
  ];
  function emp(id, band, hire, conduct, draw) {
    return { id: id, role: 'Associate', dept: 'Department 4', group: 'General', inScope: 'Y',
      check: 'Verified', band: band, hire: hire, conduct: conduct, draw: draw, notes: '' };
  }
  S.employees = [
    emp('A', 'Top rating band', '2018-10-23', 'No warning', '0.62'),
    emp('B', 'Top rating band', '2023-06-19', 'No warning', '0.15'),
    emp('C', 'Middle rating band', '2020-12-31', 'No warning', '0.48'),
    emp('D', 'Middle rating band', '2024-01-05', 'Verbal warning', '0.91'),
    emp('E', 'Top rating band', '2025-08-27', 'Verbal warning', '0.27')
  ];
  function pref(id, a, b, c) {
    var p = { id: id, date: '2026-10-20' };
    for (var i = 1; i <= 10; i++) p['c' + i] = '';
    p.c1 = a; p.c2 = b; p.c3 = c;
    return p;
  }
  S.prefs = [
    pref('A', 'Department 1', 'Department 2', 'Department 3'),
    pref('B', 'Department 1', 'Department 3', 'Department 2'),
    pref('C', 'Department 1', 'Department 2', 'Department 3'),
    pref('D', 'Department 2', 'Department 1', 'Department 3'),
    pref('E', 'Department 2', 'Department 3', 'Department 1')
  ];
  S.fairness = [
    { id: 'A', group: '40 and over' }, { id: 'B', group: 'Under 40' }, { id: 'C', group: '40 and over' },
    { id: 'D', group: 'Under 40' }, { id: 'E', group: 'Under 40' }
  ];
  return S;
}
if (typeof module !== 'undefined') module.exports = { exampleState: exampleState, blankState: blankState };

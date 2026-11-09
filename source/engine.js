/* SPDX-License-Identifier: MIT | Copyright (c) 2026 Olufunke A. Durojaiye */
/* Redeploy, Don't Release: matching engine.
   A direct port of the workbook formulas (Scoring, Matching, Calibration,
   Fairness Review, Summary, Cost Estimate). Pure functions: no I/O. */
var UNMATCHED = 'Unmatched – HR review';
var MAX_CHOICES = 10;

function lc(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
function str(s) { return String(s == null ? '' : s).trim(); }
function num(v, d) {
  if (v === '' || v == null) return d === undefined ? 0 : d;
  var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,\s]/g, ''));
  return isFinite(n) ? n : (d === undefined ? 0 : d);
}
function parseISO(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(s));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
}
function daysBetween(later, earlier) {
  var a = parseISO(later), b = parseISO(earlier);
  return a == null || b == null ? null : Math.round((a - b) / 86400000);
}
function same(a, b) { return Math.abs(a - b) < 1e-9; }

function compute(S) {
  var R = S.rules, out = { issues: [] };
  var wP = num(R.weights.perf.w), wT = num(R.weights.tenure.w), wC = num(R.weights.conduct.w);
  var missingPerf = num(R.missingPerf);

  /* ---------- Scoring ---------- */
  var scoring = [];
  S.employees.forEach(function (e, idx) {
    var id = str(e.id);
    if (!id) return;
    var inScope = lc(e.inScope) === 'y';
    var days = str(e.hire) ? daysBetween(R.asOf, e.hire) : null;
    var years = days == null ? null : Math.floor(days / 365.25);

    var perf;
    if (!str(e.band)) perf = missingPerf;
    else {
      var pb = R.perfBands.filter(function (b) { return str(b.label) && lc(b.label) === lc(e.band); })[0];
      perf = pb ? num(pb.points) : missingPerf;
    }

    var tenurePts = 0, tenureIssue = false;
    if (years != null) {
      var hit = null;
      R.tenure.forEach(function (t) { if (str(t.min) !== '' && num(t.min) <= years) hit = t; });
      if (hit) tenurePts = num(hit.points); else tenureIssue = true;
    }

    var cRows = R.conduct, conduct = cRows.length ? num(cRows[0].points) : 0;
    if (str(e.conduct)) {
      var cr = cRows.filter(function (c) { return str(c.label) && lc(c.label) === lc(e.conduct); })[0];
      if (cr) conduct = num(cr.points);
    }

    var total = perf * wP + tenurePts * wT + conduct * wC;
    var tb;
    if (R.tiebreak === 'Tenure (days)') tb = days == null ? 0 : days;
    else if (R.tiebreak === 'Performance points then tenure') tb = perf * 100000 + (days == null ? 0 : days);
    else tb = -num(e.draw);

    scoring.push({ id: id, idx: idx, inScope: inScope, days: days, years: years, perf: perf,
      tenurePts: tenurePts, conduct: conduct, total: total, tb: tb, tenureIssue: tenureIssue,
      group: str(e.group), rank: null, tieDecided: null });
  });

  var ranked = scoring.filter(function (s) { return s.inScope; });
  ranked.sort(function (a, b) {
    if (!same(a.total, b.total)) return b.total - a.total;
    if (!same(a.tb, b.tb)) return b.tb - a.tb;
    return a.idx - b.idx;
  });
  ranked.forEach(function (s, i) {
    s.rank = i + 1;
    var prev = ranked[i - 1], next = ranked[i + 1];
    s.tieDecided = !!((prev && same(prev.total, s.total)) || (next && same(next.total, s.total)));
  });
  out.scoring = scoring;

  /* ---------- Lookups (Excel MATCH: first match, case-insensitive) ---------- */
  var indexes = {};
  function firstBy(arr, key, val) {
    var tag = key + '|' + (arr === S.employees ? 'e' : arr === S.prefs ? 'p' : arr === S.needs ? 'n' : 'c');
    var ix = indexes[tag];
    if (!ix || ix.arr !== arr) {
      ix = indexes[tag] = { arr: arr, map: Object.create(null) };
      for (var i = 0; i < arr.length; i++) {
        var k = lc(arr[i][key]);
        if (k && !(k in ix.map)) ix.map[k] = arr[i];
      }
    }
    var v = lc(val);
    return v && v in ix.map ? ix.map[v] : null;
  }
  function choicesOf(p) {
    var c = [];
    for (var i = 1; i <= MAX_CHOICES; i++) c.push(str(p ? p['c' + i] : ''));
    return c;
  }

  /* ---------- Matching (serial dictatorship) ---------- */
  var placedCount = Object.create(null);
  var matching = ranked.map(function (s) {
    var emp = firstBy(S.employees, 'id', s.id);
    var group = emp ? str(emp.group) : '';
    var pref = firstBy(S.prefs, 'id', s.id);
    var choices = choicesOf(pref);
    var fits = choices.map(function (ch) {
      if (!ch) return false;
      var need = firstBy(S.needs, 'name', ch);
      if (!need) return false;
      var taken = placedCount[lc(ch)] || 0;
      if (!(num(need.seats) - taken > 0)) return false;
      var elig = str(need.eligible);
      if (lc(elig) === 'all') return true;
      var hay = (',' + elig.replace(/ /g, '') + ',').toLowerCase();
      var needle = (',' + group.replace(/ /g, '') + ',').toLowerCase();
      return hay.indexOf(needle) !== -1;
    });
    var k = fits.indexOf(true);
    var placement = k === -1 ? UNMATCHED : choices[k];
    placedCount[lc(placement)] = (placedCount[lc(placement)] || 0) + 1;
    return { order: s.rank, id: s.id, total: s.total, group: group, choices: choices,
      fits: fits, placement: placement, choiceReceived: k === -1 ? null : k + 1, s: s };
  });
  out.matching = matching;

  /* ---------- Calibration ---------- */
  var ov = S.overrides || {};
  var calibration = matching.map(function (m) {
    var o = Object.prototype.hasOwnProperty.call(ov, lc(m.id)) ? ov[lc(m.id)] : {};
    var overridePl = str(o.placement);
    var final = overridePl || m.placement;
    var changed = lc(final) !== lc(m.placement);
    var pref = firstBy(S.prefs, 'id', m.id);
    var fc = null;
    if (pref) {
      var ch = choicesOf(pref);
      for (var i = 0; i < ch.length; i++) if (ch[i] && lc(ch[i]) === lc(final)) { fc = i + 1; break; }
    }
    var doc = '';
    if (changed) doc = (!str(o.reason) || !str(o.approver) || !str(o.date)) ? 'Missing reason/approver/date' : 'OK';
    return { order: m.order, id: m.id, original: m.placement, override: overridePl, final: final,
      changed: changed, reason: str(o.reason), approver: str(o.approver), date: str(o.date),
      finalChoice: fc, doc: doc };
  });
  out.calibration = calibration;

  /* ---------- Needs: seats filled ---------- */
  var finalCount = Object.create(null);
  calibration.forEach(function (c) { finalCount[lc(c.final)] = (finalCount[lc(c.final)] || 0) + 1; });
  out.needs = S.needs.map(function (n) {
    if (!str(n.name)) return { filled: null, remaining: null };
    var filled = finalCount[lc(n.name)] || 0;
    return { filled: filled, remaining: num(n.seats) - filled };
  });

  /* ---------- Preferences: status ---------- */
  var prefIdCount = Object.create(null);
  S.prefs.forEach(function (p) { var k = lc(p.id); if (k) prefIdCount[k] = (prefIdCount[k] || 0) + 1; });
  out.prefStatus = S.prefs.map(function (p) {
    if (!str(p.id)) return '';
    if (!str(p.c1)) return 'Missing';
    if (!firstBy(S.employees, 'id', p.id)) return 'ID not found';
    if (prefIdCount[lc(p.id)] > 1) return 'Duplicate ID';
    return 'OK';
  });

  /* ---------- Fairness Review ---------- */
  var fav = R.favorable;
  var fEntries = (S.fairness || []).map(function (f) {
    if (!str(f.id)) return { favorable: null };
    var c = firstBy(calibration, 'id', f.id);
    if (!c) return { favorable: null };
    var v;
    if (fav === 'First choice') v = c.finalChoice === 1 ? 1 : 0;
    else if (fav === 'First or second choice') v = c.finalChoice != null && c.finalChoice <= 2 ? 1 : 0;
    else v = lc(c.final) === lc(UNMATCHED) ? 0 : 1;
    return { favorable: v };
  });
  var groups = [], gIndex = Object.create(null);
  (S.fairness || []).forEach(function (f, i) {
    var g = str(f.group);
    if (!g || fEntries[i].favorable == null) return;
    var key = g.toLowerCase();
    if (!(key in gIndex)) { gIndex[key] = groups.length; groups.push({ group: g, considered: 0, received: 0 }); }
    var G = groups[gIndex[key]];
    G.considered++; G.received += fEntries[i].favorable;
  });
  groups.forEach(function (G) { G.rate = G.considered ? G.received / G.considered : null; });
  var maxRate = Math.max.apply(null, [0].concat(groups.map(function (G) { return G.rate || 0; })));
  var thr = num(R.threshold, 0.8);
  groups.forEach(function (G) {
    G.impact = G.rate == null || maxRate === 0 ? null : G.rate / maxRate;
    G.below = G.impact != null && G.impact < thr;
  });
  out.fairness = { entries: fEntries, groups: groups };

  /* ---------- Review requests ---------- */
  out.reviewDays = (S.reviews || []).map(function (r) {
    var d = daysBetween(r.resolved, r.received);
    return d == null ? null : d;
  });

  /* ---------- Cost estimate ---------- */
  var C = S.cost;
  var perEmp = num(C.severance) + num(C.recruiting) + num(C.onboarding) + num(C.ramp)
             - num(C.training) - num(C.transition) - num(C.admin);
  var adjusted = num(C.count) * (1 - num(C.attrition));
  out.cost = { perEmployee: perEmp, adjusted: adjusted, total: perEmp * adjusted };

  /* ---------- Summary ---------- */
  var withId = S.employees.filter(function (e) { return str(e.id); });
  var n = calibration.length;
  var prefIds = Object.create(null);
  S.prefs.forEach(function (p) { if (str(p.id)) prefIds[lc(p.id)] = 1; });
  var placed = calibration.filter(function (c) { return lc(c.final) !== lc(UNMATCHED); }).length;
  out.summary = {
    inScope: withId.filter(function (e) { return lc(e.inScope) === 'y'; }).length,
    openSeats: S.needs.reduce(function (a, x) { return a + (str(x.name) ? num(x.seats) : 0); }, 0),
    notVerified: withId.filter(function (e) { return lc(e.check) !== 'verified'; }).length,
    noPrefs: withId.filter(function (e) { return lc(e.inScope) === 'y' && !prefIds[lc(e.id)]; }).length,
    rulesApproved: !!(str(R.signoff.by) && str(R.signoff.date)),
    placed: placed,
    unmatched: n - placed,
    firstRate: n ? calibration.filter(function (c) { return c.finalChoice === 1; }).length / n : null,
    firstSecondRate: n ? calibration.filter(function (c) { return c.finalChoice === 1 || c.finalChoice === 2; }).length / n : null,
    tiebreakShare: n ? ranked.filter(function (s) { return s.tieDecided; }).length / n : null,
    overrideRate: n ? calibration.filter(function (c) { return c.changed; }).length / n : null,
    missingDocs: calibration.filter(function (c) { return c.doc.indexOf('Missing') === 0; }).length,
    overfilled: out.needs.filter(function (x) { return x.remaining != null && x.remaining < 0; }).length,
    belowThreshold: groups.filter(function (G) { return G.below; }).length,
    reviewsReceived: (S.reviews || []).filter(function (r) { return str(r.id); }).length,
    reviewsPending: (S.reviews || []).filter(function (r) { return lc(r.outcome) === 'pending'; }).length,
    reviewsChanged: (S.reviews || []).filter(function (r) { return lc(r.outcome) === 'placement changed'; }).length,
    avoidedCost: out.cost.total,
    tenureIssues: scoring.filter(function (s) { return s.tenureIssue || (s.days != null && s.days < 0); }).length,
    missingHire: scoring.filter(function (s) { return s.days == null; }).length
  };
  return out;
}

if (typeof module !== 'undefined') module.exports = { compute: compute, UNMATCHED: UNMATCHED, num: num };

/* SPDX-License-Identifier: MIT | Copyright (c) 2026 Olufunke A. Durojaiye */
/* Redeploy, Don't Release: web tool UI. All processing happens in this page. */
(function () {
  'use strict';
  var PREVIEW = !!window.__RDR_PREVIEW;
  var state = exampleState();
  var dirty = false, current = 'match', calcs = [], pending = [], toastTimer = null;
  var panel = document.getElementById('panel');
  var MAX_ROWS = 5000, PAGE = 100, pageOf = {};
  var BAD_KEYS = { '__proto__': 1, 'constructor': 1, 'prototype': 1 };
  function pageCtl(list, total) {
    if (total <= PAGE) return '';
    var p = Math.min(pageOf[list] || 0, Math.ceil(total / PAGE) - 1), from = p * PAGE + 1, to = Math.min(total, from + PAGE - 1);
    return '<span class="pager"><button class="btn-sm" type="button" data-act="page" data-list="' + list + '" data-p="' + (p - 1) + '"' + (p === 0 ? ' disabled' : '') + '>Previous</button>' +
      '<span>Rows ' + from + '\u2013' + to + ' of ' + total + '</span><button class="btn-sm" type="button" data-act="page" data-list="' + list + '" data-p="' + (p + 1) + '"' + (to >= total ? ' disabled' : '') + '>Next</button></span>';
  }
  function pageRange(list, total) {
    var p = Math.max(0, Math.min(pageOf[list] || 0, Math.ceil(total / PAGE) - 1));
    pageOf[list] = p;
    return [p * PAGE, Math.min(total, p * PAGE + PAGE)];
  }

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function lcs(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
  function pct(x) { return x == null ? '–' : (Math.round(x * 1000) / 10) + '%'; }
  function money(x) { return x == null || !isFinite(x) ? '–' : x.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }); }
  function n2(x) { return x == null || x === '' ? '–' : (Math.round(x * 100) / 100).toLocaleString('en-US'); }
  function calc(fn) { pending.push(fn); return '<span class="calc" data-c="' + (pending.length - 1) + '"></span>'; }
  function pill(kind, text) { return '<span class="pill pill-' + kind + '">' + esc(text) + '</span>'; }
  function fid(path) { return 'f-' + path.replace(/[^A-Za-z0-9_-]/g, '_'); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function getPath(path) {
    var o = state, parts = path.split('.');
    for (var i = 0; i < parts.length; i++) { if (o == null) return ''; o = o[parts[i]]; }
    return o == null ? '' : o;
  }
  function setPath(path, v) {
    var o = state, parts = path.split('.');
    for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = v;
  }
  function toast(msg, kind) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast show' + (kind ? ' toast-' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 5200);
  }
  function normDate(v) {
    v = String(v).trim();
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
    if (m) return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
    m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
    if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    return v;
  }

  /* ---------- form controls ---------- */
  function input(path, type, label, extra) {
    var v = getPath(path), id = fid(path);
    var t = type === 'number' ? 'text" inputmode="decimal' : type;
    return '<input class="in" id="' + id + '" type="' + t + '" data-path="' + esc(path) + '" value="' + esc(v) + '" aria-label="' + esc(label) + '"' + (extra || '') + '>';
  }
  function select(path, options, label) {
    var v = String(getPath(path)), id = fid(path), found = false;
    var opts = options.map(function (o) {
      var sel = lcs(o) === lcs(v) && v !== '' ? (found = true, ' selected') : '';
      return '<option value="' + esc(o) + '"' + sel + '>' + esc(o || '—') + '</option>';
    });
    if (v !== '' && !found) opts.push('<option value="' + esc(v) + '" selected>' + esc(v) + ' (not in list)</option>');
    return '<select class="in" id="' + id + '" data-path="' + esc(path) + '" aria-label="' + esc(label) + '">' + opts.join('') + '</select>';
  }

  /* Editable grid. cols: {k,label,type,opts,size,calc} */
  function grid(list, cols, opts) {
    var rows = state[list] || getPath(list);
    var keys = cols.filter(function (c) { return !c.calc; }).map(function (c) { return c.k; });
    var h = '<div class="tbl-wrap"><table class="grid" data-list="' + list + '" data-keys="' + keys.join(',') + '"><thead><tr>' +
      cols.map(function (c) { return '<th class="' + (c.calc ? 'th-out ' : '') + 'w-' + (c.size || 'm') + '" scope="col">' + esc(c.label) + '</th>'; }).join('') +
      '<th class="w-x"><span class="sr">Remove</span></th></tr></thead><tbody>';
    if (!rows.length) {
      h += '<tr><td class="empty" colspan="' + (cols.length + 1) + '">' + esc(opts.empty) + '</td></tr>';
    }
    var rg = pageRange(list, rows.length);
    rows.slice(rg[0], rg[1]).forEach(function (row, j) {
      var i = rg[0] + j;
      h += '<tr>' + cols.map(function (c) {
        var path = list + '.' + i + '.' + c.k, label = c.label + ', row ' + (i + 1);
        if (c.calc) return '<td class="out">' + calc(function (R) { return c.calc(R, i); }) + '</td>';
        if (c.type === 'select') return '<td>' + select(path, [''].concat(c.opts()), label) + '</td>';
        return '<td>' + input(path, c.type || 'text', label) + '</td>';
      }).join('') + '<td><button class="x" type="button" data-act="del" data-list="' + list + '" data-i="' + i + '" aria-label="Remove row ' + (i + 1) + '">×</button></td></tr>';
    });
    h += '</tbody></table></div><div class="grid-foot"><button class="btn-sm" type="button" data-act="add" data-list="' + list + '">+ ' + esc(opts.add) + '</button>' + pageCtl(list, rows.length) +
      '<span class="hint">Paste rows copied from Excel into any cell to fill several at once.</span></div>';
    return h;
  }
  var NEW_ROW = {
    needs: function () { return { name: '', dept: '', shift: '', site: '', seats: '', eligible: 'All', req: '', start: '' }; },
    employees: function () { return { id: '', role: '', dept: '', group: '', inScope: 'Y', check: 'Pending', band: '', hire: '', conduct: '', draw: '', notes: '' }; },
    prefs: function () { var p = { id: '', date: '' }; for (var i = 1; i <= 10; i++) p['c' + i] = ''; return p; },
    reviews: function () { return { id: '', received: '', type: '', desc: '', reviewer: '', outcome: 'Pending', resolved: '' }; },
    fairness: function () { return { id: '', group: '' }; },
    'rules.perfBands': function () { return { label: '', points: '' }; },
    'rules.conduct': function () { return { label: '', points: '' }; },
    'rules.tenure': function () { return { min: '', points: '' }; }
  };
  function listRef(list) { return state[list] || getPath(list); }
  function optionNames() { return state.needs.map(function (n) { return String(n.name).trim(); }).filter(Boolean); }

  /* ---------- tabs ---------- */
  var TABS = [
    { id: 'need', n: '1', label: 'Define the need', render: renderNeed },
    { id: 'rules', n: '2', label: 'Set the rules', render: renderRules },
    { id: 'people', n: '3', label: 'Hear from employees', render: renderPeople },
    { id: 'match', n: '4', label: 'Score and match', render: renderMatch },
    { id: 'calibrate', n: '5', label: 'Calibrate', render: renderCalibrate },
    { id: 'summary', n: '', label: 'Summary', render: renderSummary },
    { id: 'cost', n: '', label: 'Cost estimate', render: renderCost }
  ];

  function head(title, lede) {
    return '<header class="p-head"><h2>' + esc(title) + '</h2><p>' + lede + '</p></header>';
  }

  function renderNeed() {
    return head('Define the need', 'One row per open option: a department, shift, or site. Option names must be unique; employees rank these names.') +
      grid('needs', [
        { k: 'name', label: 'Option (unique name)', size: 'l' },
        { k: 'dept', label: 'Department' }, { k: 'shift', label: 'Shift', size: 's' }, { k: 'site', label: 'Site', size: 's' },
        { k: 'seats', label: 'Open seats', type: 'number', size: 's' },
        { k: 'eligible', label: 'Eligible role groups', size: 'l' },
        { k: 'req', label: 'Role requirements', size: 'xl' },
        { k: 'start', label: 'Start date', type: 'date' },
        { k: 'filled', label: 'Seats filled', size: 's', calc: function (R, i) { var x = R.needs[i]; return x && x.filled != null ? String(x.filled) : ''; } },
        { k: 'remaining', label: 'Remaining', size: 's', calc: function (R, i) {
          var x = R.needs[i]; if (!x || x.remaining == null) return '';
          return x.remaining < 0 ? pill('crit', x.remaining + ' over') : String(x.remaining);
        } }
      ], { add: 'Add option', empty: 'No open options yet. Add the first one below.' }) +
      '<p class="note">Eligible role groups: enter <b>All</b>, or a comma-separated list that matches the Role group column on the Employees step, e.g. <i>Assembly, Logistics</i>.</p>';
  }

  function renderRules() {
    var R = state.rules;
    function row(label, ctrl, note) {
      return '<div class="f-row"><label class="f-label" for="' + ctrl.id + '">' + esc(label) + '</label><div class="f-ctrl">' + ctrl.html + '</div><p class="f-note">' + esc(note) + '</p></div>';
    }
    function c(path, type, label) { return { id: fid(path), html: input(path, type, label) }; }
    function s(path, o, label) { return { id: fid(path), html: select(path, o, label) }; }
    var weights = ['perf', 'tenure', 'conduct'].map(function (k) {
      var name = { perf: 'Performance', tenure: 'Tenure', conduct: 'Conduct record (current review period)' }[k];
      return '<tr><th scope="row">' + esc(name) + '</th><td>' + input('rules.weights.' + k + '.w', 'number', name + ' weight') + '</td><td>' +
        input('rules.weights.' + k + '.reason', 'text', name + ' business reason') + '</td><td class="out">' +
        calc(function () { return String(state.rules.weights[k].reason).trim() ? '' : pill('warn', 'Reason required'); }) + '</td></tr>';
    }).join('');
    return head('Set the rules', 'Finalize and record every rule <b>before</b> reviewing any individual result. If a rule must change later, document why and rerun for everyone.') +
      '<section class="block"><h3>General settings</h3>' +
      row('As-of date for tenure', c('rules.asOf', 'date', 'As-of date'), 'Date used to calculate completed service.') +
      row('Tiebreak rule', s('rules.tiebreak', ['Tenure (days)', 'Performance points then tenure', 'Random draw'], 'Tiebreak rule'), 'Chosen in advance. Check the Summary for the share of ranks decided by tiebreak.') +
      row('Points if performance rating is missing', c('rules.missingPerf', 'number', 'Points if rating missing'), 'Example rule: a missing rating scores as the middle band.') +
      row('Favorable outcome for fairness screen', s('rules.favorable', ['First choice', 'First or second choice', 'Any placement'], 'Favorable outcome'), 'Define the favorable outcome before running the screen.') +
      row('Screening threshold (four-fifths rule)', c('rules.threshold', 'number', 'Screening threshold'), 'An impact ratio below this level triggers review. A screening measure, not proof of discrimination.') +
      '</section><section class="block"><h3>Criteria and weights</h3><div class="tbl-wrap"><table class="grid"><thead><tr><th class="w-l" scope="col">Criterion</th><th class="w-s narrow" scope="col">Weight (multiplier)</th><th class="w-xl" scope="col">Business reason (required)</th><th class="w-m th-out" scope="col">Check</th></tr></thead><tbody>' + weights + '</tbody></table></div></section>' +
      '<div class="cols3"><section class="block"><h3>Performance points</h3><p class="mini">Convert every rating system to these bands.</p>' +
      grid('rules.perfBands', [{ k: 'label', label: 'Rating band', size: 'l' }, { k: 'points', label: 'Points', type: 'number', size: 's' }], { add: 'Add band', empty: 'No bands.' }) +
      '</section><section class="block"><h3>Conduct points</h3><p class="mini">A blank conduct entry scores as the first row.</p>' +
      grid('rules.conduct', [{ k: 'label', label: 'Conduct record', size: 'l' }, { k: 'points', label: 'Points', type: 'number', size: 's' }], { add: 'Add level', empty: 'No levels.' }) +
      '</section><section class="block"><h3>Tenure points</h3><p class="mini">Minimum completed years, ascending. A missing hire date scores 0.</p>' +
      grid('rules.tenure', [{ k: 'min', label: 'Min. years', type: 'number', size: 's' }, { k: 'points', label: 'Points', type: 'number', size: 's' }], { add: 'Add step', empty: 'No steps.' }) +
      '</section></div><section class="block"><h3>Rules sign-off</h3>' +
      row('Rules approved by', c('rules.signoff.by', 'text', 'Rules approved by'), 'Name and role of the approver.') +
      row('Approval date', c('rules.signoff.date', 'date', 'Approval date'), 'Approve rules before reviewing results.') +
      row('Counsel review completed', s('rules.signoff.counsel', ['', 'Y', 'N'], 'Counsel review completed'), 'Review criteria and results with counsel before use.') +
      '</section>';
  }

  function renderPeople() {
    var bands = function () { return state.rules.perfBands.map(function (b) { return b.label; }).filter(Boolean); };
    var conducts = function () { return state.rules.conduct.map(function (b) { return b.label; }).filter(Boolean); };
    var choiceCols = [];
    for (var i = 1; i <= 10; i++) choiceCols.push({ k: 'c' + i, label: 'Choice ' + i, type: 'select', opts: optionNames });
    return head('Hear from employees', 'One row per employee in the exercise. Do <b>not</b> enter protected characteristics, accommodation, or medical information here.') +
      '<section class="block"><h3>Employees</h3>' +
      grid('employees', [
        { k: 'id', label: 'Employee ID', size: 's' }, { k: 'role', label: 'Current role' }, { k: 'dept', label: 'Current department' },
        { k: 'group', label: 'Role group' }, { k: 'inScope', label: 'In scope', type: 'select', opts: function () { return ['Y', 'N']; }, size: 's' },
        { k: 'check', label: 'Data check', type: 'select', opts: function () { return ['Verified', 'Pending', 'Issue']; } },
        { k: 'band', label: 'Performance rating band', type: 'select', opts: bands, size: 'l' },
        { k: 'hire', label: 'Hire date', type: 'date' },
        { k: 'conduct', label: 'Conduct record', type: 'select', opts: conducts, size: 'l' },
        { k: 'draw', label: 'Random draw value', type: 'number', size: 's' }, { k: 'notes', label: 'Notes', size: 'l' }
      ], { add: 'Add employee', empty: 'No employees yet. Add rows, paste from Excel, or open the filled-in template.' }) +
      '<p class="note">Random draw: generate the numbers once, enter them as fixed values, and record when and by whom.</p></section>' +
      '<section class="block"><h3>Ranked preferences</h3><p class="mini">Ask employees to rank every option they would accept. Choices list the options from step 1.</p>' +
      grid('prefs', [{ k: 'id', label: 'Employee ID', size: 's' }].concat(choiceCols, [
        { k: 'date', label: 'Submitted', type: 'date' },
        { k: 'status', label: 'Status', calc: function (R, i) {
          var s = R.prefStatus[i]; if (!s) return '';
          return s === 'OK' ? pill('ok', 'OK') : pill(s === 'Missing' ? 'warn' : 'crit', s);
        } }
      ]), { add: 'Add preferences', empty: 'No preferences yet.' }) + '</section>';
  }

  function checks(R) {
    var m = R.summary, out = [];
    var bad = R.prefStatus.filter(function (s) { return s && s !== 'OK'; }).length;
    var noAsOf = !String(state.rules.asOf).trim();
    if (noAsOf) out.push(pill('crit', 'As-of date missing in step 2'));
    if (!m.rulesApproved) out.push(pill('warn', 'Rules not signed off'));
    if (m.notVerified) out.push(pill('warn', m.notVerified + ' data checks not verified'));
    if (m.noPrefs) out.push(pill('warn', m.noPrefs + ' with no preferences'));
    if (bad) out.push(pill('crit', bad + ' preference rows need fixing'));
    if (m.missingHire && !noAsOf) out.push(pill('warn', m.missingHire + ' missing hire date'));
    if (m.tenureIssues) out.push(pill('crit', m.tenureIssues + ' tenure values out of range'));
    if (!out.length) out.push(pill('ok', 'All data checks pass'));
    return out.join(' ');
  }

  function renderMatch() {
    return head('Score and match', 'Employees are ranked by total score, then the tiebreak. In rank order, each receives their highest-ranked choice that still has a seat and fits their role group (serial dictatorship).') +
      '<div class="checks" aria-live="polite">' + calc(checks) + '</div>' +
      '<section class="block"><h3>Seats by option</h3>' + calc(function (R) {
        if (!state.needs.length) return '<p class="empty">Add open options in step 1.</p>';
        return '<ul class="seats">' + state.needs.map(function (n, i) {
          if (!String(n.name).trim()) return '';
          var seats = Math.max(0, +n.seats || 0), f = R.needs[i].filled;
          var orig = R.matching.filter(function (m) { return lcs(m.placement) === lcs(n.name); }).length;
          return '<li><span class="s-name">' + esc(n.name) + '</span><progress max="' + Math.max(seats, f, 1) + '" value="' + f + '">' + f + ' of ' + seats + '</progress><span class="s-num">' + f + ' / ' + seats +
            (f > seats ? ' ' + pill('crit', 'over') : '') + (orig !== f ? ' <span class="mini">(' + orig + ' before calibration)</span>' : '') + '</span></li>';
        }).join('') + '</ul>';
      }) + '</section>' +
      '<section class="block"><h3>Rank and proposed placement</h3>' + calc(function (R) {
        if (!R.matching.length) return '<p class="empty">No in-scope employees yet. Add employees in step 3.</p>';
        var out = R.scoring.length - R.matching.length;
        return '<div class="tbl-wrap"><table class="grid ro"><thead><tr><th scope="col">Order</th><th scope="col">Employee</th><th scope="col">Total score</th><th scope="col">Perf.</th><th scope="col">Tenure</th><th scope="col">Conduct</th><th scope="col">Tenure (days)</th><th scope="col">Tiebreak value</th><th scope="col">Decided by tiebreak</th><th scope="col">Role group</th><th scope="col">Proposed placement</th><th scope="col">Choice received</th></tr></thead><tbody>' +
          R.matching.map(function (m) {
            var s = m.s;
            return '<tr><td class="num">' + m.order + '</td><td><b>' + esc(m.id) + '</b></td><td class="num strong">' + n2(s.total) + '</td><td class="num">' + n2(s.perf) + '</td><td class="num">' + n2(s.tenurePts) + '</td><td class="num">' + n2(s.conduct) +
              '</td><td class="num">' + (s.days == null ? (String(state.rules.asOf).trim() ? pill('warn', 'No hire date') : '\u2013') : s.days.toLocaleString('en-US')) + '</td><td class="num">' + n2(s.tb) + '</td><td>' + (s.tieDecided ? 'Yes' : 'No') +
              '</td><td>' + esc(m.group) + '</td><td>' + (m.choiceReceived ? esc(m.placement) : pill('crit', m.placement)) + '</td><td class="num">' + (m.choiceReceived ? ordinal(m.choiceReceived) : '–') + '</td></tr>';
          }).join('') + '</tbody></table></div>' + (out ? '<p class="note">' + out + ' employee' + (out > 1 ? 's are' : ' is') + ' out of scope and not ranked.</p>' : '');
      }) + '</section>';
  }
  function ordinal(n) { return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'); }

  function renderCalibrate() {
    var R0 = compute(state);
    var names = [''].concat(optionNames(), [UNMATCHED]);
    function ovInput(id, k, type, label) {
      var o = state.overrides[lcs(id)] || {}, v = o[k] || '', fidv = 'f-ov-' + k + '-' + lcs(id).replace(/[^a-z0-9_-]/g, '_');
      if (k === 'placement') {
        var found = false, opts = names.map(function (n) { var s = n && lcs(n) === lcs(v) ? (found = true, ' selected') : ''; return '<option value="' + esc(n) + '"' + s + '>' + esc(n || 'No override') + '</option>'; });
        if (v && !found) opts.push('<option value="' + esc(v) + '" selected>' + esc(v) + ' (not in list)</option>');
        return '<select class="in" id="' + fidv + '" data-ov="' + esc(id) + '" data-k="placement" aria-label="' + esc(label) + '">' + opts.join('') + '</select>';
      }
      return '<input class="in" id="' + fidv + '" type="' + type + '" data-ov="' + esc(id) + '" data-k="' + k + '" value="' + esc(v) + '" aria-label="' + esc(label) + '">';
    }
    var crg = pageRange('calib', R0.calibration.length);
    var rows = R0.calibration.slice(crg[0], crg[1]).map(function (c, j) {
      var i = crg[0] + j;
      return '<tr><td class="num">' + c.order + '</td><td><b>' + esc(c.id) + '</b></td><td>' + esc(c.original) + '</td><td>' + ovInput(c.id, 'placement', '', 'Override placement for ' + c.id) +
        '</td><td>' + ovInput(c.id, 'reason', 'text', 'Reason for change, ' + c.id) + '</td><td>' + ovInput(c.id, 'approver', 'text', 'Approver, ' + c.id) + '</td><td>' + ovInput(c.id, 'date', 'date', 'Override date, ' + c.id) +
        '</td><td class="out">' + calc(function (R) { var x = R.calibration[i]; return x ? (lcs(x.final) === lcs(UNMATCHED) ? pill('crit', x.final) : '<b>' + esc(x.final) + '</b>') : ''; }) +
        '</td><td class="out">' + calc(function (R) { var x = R.calibration[i]; return x && x.changed ? pill('info', 'Yes') : 'No'; }) +
        '</td><td class="out num">' + calc(function (R) { var x = R.calibration[i]; return x ? (x.finalChoice ? ordinal(x.finalChoice) : 'Not ranked') : ''; }) +
        '</td><td class="out">' + calc(function (R) { var x = R.calibration[i]; return !x || !x.doc ? '' : x.doc === 'OK' ? pill('ok', 'OK') : pill('crit', x.doc); }) + '</td></tr>';
    }).join('');
    return head('Calibrate', 'Review proposed placements. Every override needs a reason, an approver, and a date. Calibration should not become unstructured discretion.') +
      '<section class="block"><h3>Placements and overrides</h3>' + (rows ? '<div class="tbl-wrap"><table class="grid"><thead><tr><th class="w-s" scope="col">Order</th><th class="w-s" scope="col">Employee</th><th class="w-m" scope="col">Original match</th><th class="w-l" scope="col">Override placement</th><th class="w-xl" scope="col">Reason for change</th><th class="w-m" scope="col">Approver</th><th class="w-m" scope="col">Date</th><th class="w-m th-out" scope="col">Final placement</th><th class="w-s th-out" scope="col">Changed</th><th class="w-s th-out" scope="col">Final choice</th><th class="w-m th-out" scope="col">Documentation</th></tr></thead><tbody>' + rows + '</tbody></table></div>' + (R0.calibration.length > PAGE ? '<div class="grid-foot">' + pageCtl('calib', R0.calibration.length) + '</div>' : '') : '<p class="empty">No ranked employees yet.</p>') + '</section>' +
      '<section class="block"><h3>Review requests</h3><p class="mini">Log every employee request for review. Resolve before, or promptly after, release.</p>' +
      grid('reviews', [
        { k: 'id', label: 'Employee ID', size: 's' }, { k: 'received', label: 'Date received', type: 'date' },
        { k: 'type', label: 'Concern type', type: 'select', opts: function () { return ['Data accuracy', 'Placement', 'Process', 'Other']; } },
        { k: 'desc', label: 'Description', size: 'xl' }, { k: 'reviewer', label: 'Reviewer' },
        { k: 'outcome', label: 'Outcome', type: 'select', size: 'l', opts: function () { return ['Pending', 'Upheld - no change', 'Data corrected - no change', 'Placement changed']; } },
        { k: 'resolved', label: 'Date resolved', type: 'date' },
        { k: 'days', label: 'Days to resolve', size: 's', calc: function (R, i) { var d = R.reviewDays[i]; return d == null ? '' : String(d); } }
      ], { add: 'Log a review request', empty: 'No review requests logged.' }) + '</section>' +
      '<section class="block restricted"><h3>Fairness review <span class="tag">HR or legal reviewers only</span></h3>' +
      '<p class="mini">Adverse-impact screen before release. Group labels are used only here and never affect scoring or matching. They are left out of saved project files unless you choose to include them.</p>' +
      '<div class="stack"><div class="stack">' + grid('fairness', [
        { k: 'id', label: 'Employee ID', size: 's' }, { k: 'group', label: 'Group (reviewer entry)', size: 'l' },
        { k: 'fav', label: 'Favorable (1/0)', size: 's', calc: function (R, i) { var e = R.fairness.entries[i]; return e && e.favorable != null ? String(e.favorable) : ''; } }
      ], { add: 'Add reviewer entry', empty: 'No entries.' }) +
      '<button class="btn-sm" type="button" data-act="fillFair">Add every ranked employee ID</button></div><div class="min0">' +
      calc(function (R) {
        var G = R.fairness.groups;
        var head2 = '<p class="mini">Favorable outcome: <b>' + esc(state.rules.favorable) + '</b>. Threshold: <b>' + esc(state.rules.threshold) + '</b>. Change these in step 2.</p>';
        if (!G.length) return head2 + '<p class="empty">Enter groups to run the screen.</p>';
        return head2 + '<div class="tbl-wrap"><table class="grid ro"><thead><tr><th scope="col">Group</th><th scope="col">Considered</th><th scope="col">Favorable</th><th scope="col">Selection rate</th><th scope="col">Impact ratio</th><th scope="col">Screening result</th></tr></thead><tbody>' +
          G.map(function (g) {
            return '<tr><td>' + esc(g.group) + '</td><td class="num">' + g.considered + '</td><td class="num">' + g.received + '</td><td class="num">' + pct(g.rate) + '</td><td class="num">' + (g.impact == null ? '–' : g.impact.toFixed(2)) +
              '</td><td>' + (g.impact == null ? '' : g.below ? pill('crit', 'Below threshold – review with counsel') : pill('ok', 'At or above threshold')) + '</td></tr>';
          }).join('') + '</tbody></table></div><p class="note">Small groups produce unstable ratios. Treat the result as a prompt for review, not a finding.</p>';
      }) + '</div></div></section>';
  }

  var MEASURES = [
    ['Readiness'],
    ['Employees in scope', function (m) { return [m.inScope, '']; }],
    ['Open seats', function (m) { return [m.openSeats, m.openSeats < m.inScope ? 'warn' : '']; }, 'Compare with employees in scope.'],
    ['Employees with data checks not verified', function (m) { return [m.notVerified, m.notVerified ? 'warn' : 'ok']; }, 'Should be 0 before release.'],
    ['In-scope employees with no preferences submitted', function (m) { return [m.noPrefs, m.noPrefs ? 'warn' : 'ok']; }, 'Follow up before matching.'],
    ['Rules approved (sign-off)', function (m) { return [m.rulesApproved ? 'Yes' : 'No', m.rulesApproved ? 'ok' : 'warn']; }, 'Approve rules before reviewing results.'],
    ['Outcomes'],
    ['Employees placed', function (m) { return [m.placed, '']; }],
    ['Employees unmatched (HR review)', function (m) { return [m.unmatched, m.unmatched ? 'warn' : 'ok']; }, 'Review remaining suitable seats.'],
    ['Preference match rate: first choice', function (m) { return [pct(m.firstRate), '']; }],
    ['Preference match rate: first or second choice', function (m) { return [pct(m.firstSecondRate), '']; }],
    ['Governance and fairness'],
    ['Ranks decided by tiebreak (share of in-scope)', function (m) { return [pct(m.tiebreakShare), m.tiebreakShare > 0.5 ? 'warn' : '']; }, 'High values mean the tiebreak drives outcomes; test alternatives.'],
    ['Override rate', function (m) { return [pct(m.overrideRate), '']; }, 'Calibration should not become unstructured discretion.'],
    ['Overrides missing reason, approver, or date', function (m) { return [m.missingDocs, m.missingDocs ? 'crit' : 'ok']; }, 'Should be 0.'],
    ['Over-filled options', function (m) { return [m.overfilled, m.overfilled ? 'crit' : 'ok']; }, 'Should be 0.'],
    ['Groups below fairness screening threshold', function (m) { return [m.belowThreshold, m.belowThreshold ? 'crit' : 'ok']; }, 'Investigate with counsel before release.'],
    ['Review requests received', function (m) { return [m.reviewsReceived, '']; }, 'Employee-experience measure.'],
    ['Review requests pending', function (m) { return [m.reviewsPending, m.reviewsPending ? 'warn' : 'ok']; }, 'Resolve within the published timeframe.'],
    ['Review requests that changed a placement', function (m) { return [m.reviewsChanged, '']; }],
    ['Value'],
    ['Estimated total avoided cost', function (m) { return [money(m.avoidedCost), '']; }, 'From the Cost estimate.']
  ];

  function renderSummary() {
    return head('Summary', 'Measures available at decision time. Resolve every flag before results are released.') +
      calc(function (R) {
        var m = R.summary, flags = 0;
        var rows = MEASURES.map(function (x) {
          if (x.length === 1) return '<tr class="grp"><th colspan="3" scope="colgroup">' + esc(x[0]) + '</th></tr>';
          var r = x[1](m), kind = r[1];
          if (kind === 'warn' || kind === 'crit') flags++;
          var val = kind ? pill(kind, String(r[0])) : '<b>' + esc(r[0]) + '</b>';
          return '<tr><td>' + esc(x[0]) + '</td><td class="num">' + val + '</td><td class="mini">' + esc(x[2] || '') + '</td></tr>';
        }).join('');
        return '<div class="verdict ' + (flags ? 'v-warn' : 'v-ok') + '"><b>' + (flags ? flags + ' item' + (flags > 1 ? 's' : '') + ' to resolve before release' : 'No open flags') + '</b><span>' +
          m.placed + ' of ' + m.inScope + ' in-scope employees placed · ' + pct(m.firstRate) + ' received their first choice</span></div>' +
          '<div class="tbl-wrap"><table class="grid ro summary"><thead><tr><th scope="col">Measure</th><th scope="col">Value</th><th scope="col">What to look for</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
      }) +
      '<p class="note">After transition, also track: time to fill, external hires avoided, ramp-up time, training completion, performance after the move, review requests, perceived fairness and trust, and retention at 6 and 12 months.</p>';
  }

  function renderCost() {
    var items = [
      ['severance', 'Severance', 'avoided'], ['recruiting', 'Recruiting cost per hire', 'avoided'],
      ['onboarding', 'Onboarding and training cost for a new hire', 'avoided'], ['ramp', 'New-hire productivity lost during ramp-up', 'avoided'],
      ['training', 'Cost of redeployment training', 'incurred'], ['transition', 'Redeployed employee’s productivity lost during transition', 'incurred'],
      ['admin', 'Share of program administration cost', 'incurred']
    ];
    return head('Cost estimate', 'Estimated avoided cost per employee who would otherwise have been laid off and replaced (Section 5.5 of the paper). An estimate, not an audited figure. Example values are hypothetical; replace them with your own figures or published benchmarks.') +
      '<div class="cols2"><section class="block"><h3>Per-employee components ($)</h3><div class="tbl-wrap"><table class="grid"><thead><tr><th class="w-xl" scope="col">Component</th><th class="w-s" scope="col">Effect</th><th class="w-m" scope="col">Amount ($)</th></tr></thead><tbody>' +
      items.map(function (it) { return '<tr><td>' + esc(it[1]) + '</td><td>' + pill(it[2] === 'avoided' ? 'ok' : 'info', it[2]) + '</td><td>' + input('cost.' + it[0], 'number', it[1]) + '</td></tr>'; }).join('') +
      '<tr class="total"><td colspan="2"><b>Avoided cost per employee</b></td><td class="num out">' + calc(function (R) { return '<b>' + money(R.cost.perEmployee) + '</b>'; }) + '</td></tr></tbody></table></div></section>' +
      '<section class="block"><h3>Volume</h3><div class="tbl-wrap"><table class="grid"><tbody>' +
      '<tr><td>Redeployments that replaced a layoff and rehire</td><td class="w-m">' + input('cost.count', 'number', 'Redeployments that replaced a layoff and rehire') + '</td></tr>' +
      '<tr><td>Early attrition among redeployed employees (share, e.g. 0.1 = 10%)</td><td>' + input('cost.attrition', 'number', 'Early attrition share') + '</td></tr>' +
      '<tr><td>Adjusted redeployment count</td><td class="num out">' + calc(function (R) { return n2(R.cost.adjusted); }) + '</td></tr>' +
      '<tr><td>For reference: employees placed in this exercise</td><td class="num out">' + calc(function (R) { return String(R.summary.placed); }) + '</td></tr>' +
      '</tbody></table></div><div class="bigfig"><span>Estimated total avoided cost</span>' + calc(function (R) { return '<b>' + money(R.cost.total) + '</b>'; }) + '</div>' +
      '<p class="note">Count only cases where the layoff and the replacement hire would otherwise have occurred.</p></section></div>';
  }

  /* ---------- render / refresh ---------- */
  function render() {
    var tab = TABS.filter(function (t) { return t.id === current; })[0];
    document.querySelectorAll('.tabs button').forEach(function (b) {
      var on = b.dataset.tab === current; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1;
    });
    pending = []; calcs = [];
    panel.innerHTML = tab.render();
    panel.setAttribute('aria-labelledby', 'tab-' + current);
    panel.querySelectorAll('[data-c]').forEach(function (el) { calcs.push({ el: el, fn: pending[+el.dataset.c] }); });
    refresh();
  }
  function refresh() {
    var R = compute(state);
    calcs.forEach(function (c) { var h = c.fn(R); if (c.el.innerHTML !== h) c.el.innerHTML = h; });
    var m = R.summary;
    document.getElementById('status').innerHTML =
      '<span><b>' + m.inScope + '</b> in scope</span><span><b>' + m.openSeats + '</b> open seats</span><span><b>' + m.placed + '</b> placed</span>' +
      '<span><b>' + pct(m.firstRate) + '</b> first choice</span>';
  }
  function markDirty() { dirty = true; }

  /* ---------- events ---------- */
  panel.addEventListener('input', onEdit);
  panel.addEventListener('change', onEdit);
  function onEdit(e) {
    var el = e.target;
    if (el.dataset.ov != null) {
      var key = lcs(el.dataset.ov);
      if (BAD_KEYS[key]) { toast('That employee ID is a reserved word. Rename the employee to record an override.', 'warn'); return; }
      state.overrides[key] = state.overrides[key] || { placement: '', reason: '', approver: '', date: '' };
      state.overrides[key][el.dataset.k] = el.value;
    } else if (el.dataset.path) {
      setPath(el.dataset.path, el.value);
    } else return;
    markDirty(); refresh();
  }
  panel.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]');
    if (!b) return;
    var act = b.dataset.act, list = b.dataset.list;
    if (act === 'add') {
      var L = listRef(list);
      if (L.length >= MAX_ROWS) { toast('Row limit reached (' + MAX_ROWS + ').', 'warn'); return; }
      L.push(NEW_ROW[list]());
      pageOf[list] = Math.floor((L.length - 1) / PAGE);
      markDirty(); keepScroll(render);
      var t = panel.querySelector('table[data-list="' + list + '"] tbody tr:last-child .in');
      if (t) t.focus();
    } else if (act === 'del') {
      listRef(list).splice(+b.dataset.i, 1); markDirty(); keepScroll(render);
    } else if (act === 'page') {
      pageOf[list] = +b.dataset.p; render();
      var tb = panel.querySelector('table[data-list="' + list + '"]') || panel.querySelector('.pager');
      if (tb) tb.scrollIntoView({ block: 'nearest' });
    } else if (act === 'fillFair') {
      var have = {}; state.fairness.forEach(function (f) { have[lcs(f.id)] = 1; });
      var added = 0;
      compute(state).calibration.forEach(function (c) { if (!have[lcs(c.id)]) { state.fairness.push({ id: c.id, group: '' }); added++; } });
      markDirty(); keepScroll(render); toast(added ? added + ' employee IDs added.' : 'Every ranked employee is already listed.');
    }
  });
  function keepScroll(fn) { var y = window.scrollY; fn(); window.scrollTo(0, y); }

  /* Paste a block copied from Excel into a grid */
  panel.addEventListener('paste', function (e) {
    var el = e.target, path = el.dataset && el.dataset.path;
    if (!path) return;
    var tbl = el.closest('table[data-list]');
    if (!tbl) return;
    var text = (e.clipboardData || window.clipboardData).getData('text');
    if (!/[\t\n]/.test(text.replace(/\n$/, ''))) return;
    e.preventDefault();
    var list = tbl.dataset.list, keys = tbl.dataset.keys.split(','), parts = path.split('.');
    var key = parts.pop(), row0 = +parts.pop(), col0 = keys.indexOf(key), L = listRef(list);
    var lines = text.replace(/\r/g, '').replace(/\n$/, '').split('\n');
    if (row0 + lines.length > MAX_ROWS) { toast('That paste would exceed ' + MAX_ROWS + ' rows.', 'warn'); return; }
    lines.forEach(function (line, r) {
      while (L.length <= row0 + r) L.push(NEW_ROW[list]());
      line.split('\t').forEach(function (cell, c) {
        var k = keys[col0 + c]; if (!k) return;
        var v = cell.trim();
        if (/^(hire|start|date|received|resolved)$/.test(k)) v = normDate(v);
        L[row0 + r][k] = v;
      });
    });
    markDirty(); keepScroll(render);
    toast('Pasted ' + lines.length + ' row' + (lines.length > 1 ? 's' : '') + '.');
  });

  /* Tabs, with arrow-key navigation */
  var tabsEl = document.querySelector('.tabs');
  tabsEl.innerHTML = TABS.map(function (t) {
    return '<button type="button" role="tab" id="tab-' + t.id + '" data-tab="' + t.id + '" aria-controls="panel">' + (t.n ? '<span class="tn">' + t.n + '</span>' : '') + esc(t.label) + '</button>';
  }).join('');
  tabsEl.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]'); if (!b) return;
    current = b.dataset.tab; render(); b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  tabsEl.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    var i = TABS.findIndex(function (t) { return t.id === current; });
    i = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    current = TABS[i].id; render(); document.getElementById('tab-' + current).focus();
  });

  /* ---------- toolbar ---------- */
  var armed = null;
  function confirmTwice(btn, label, fn) {
    if (!dirty || armed === btn) { armed = null; btn.textContent = label; fn(); return; }
    armed = btn; btn.textContent = 'Discard changes? Click again';
    btn.classList.add('armed');
    setTimeout(function () { if (armed === btn) { armed = null; btn.textContent = label; btn.classList.remove('armed'); } }, 4000);
  }
  function load(S, msg) {
    state = S; dirty = false; armed = null; pageOf = {};
    document.querySelectorAll('.armed').forEach(function (b) { b.classList.remove('armed'); });
    render(); toast(msg);
  }
  document.getElementById('b-example').addEventListener('click', function () {
    var b = this; confirmTwice(b, 'Worked example', function () { load(exampleState(), 'Loaded the worked example from Appendix A.'); });
  });
  document.getElementById('b-blank').addEventListener('click', function () {
    var b = this; confirmTwice(b, 'Start blank', function () { current = 'need'; load(blankState(), 'Started a blank exercise. Example rules and cost figures are kept. Edit them in Set the rules and Cost estimate.'); });
  });
  var fileIn = document.getElementById('file');
  document.getElementById('b-open').addEventListener('click', function () { fileIn.click(); });
  fileIn.addEventListener('change', async function () {
    var f = fileIn.files[0]; fileIn.value = '';
    if (!f) return;
    try {
      if (f.size > XLSX_LIMIT) throw new Error('The file is larger than 15 MB.');
      var buf = await f.arrayBuffer(), S;
      if (/\.xlsx$/i.test(f.name)) S = templateToState(await readWorkbook(buf));
      else if (/\.json$/i.test(f.name)) {
        var parsed;
        try { parsed = JSON.parse(new TextDecoder().decode(buf)); } catch (e) { throw new Error('The project file is damaged and cannot be read.'); }
        S = sanitize(parsed);
      }
      else throw new Error('Choose a .xlsx template or a .json project file.');
      current = 'match';
      load(S, 'Opened ' + f.name + ' · ' + S.employees.length + ' employees, ' + S.needs.length + ' options. Nothing was uploaded.');
    } catch (err) {
      toast('Could not open ' + f.name + ': ' + err.message, 'crit');
    }
  });

  function sanitize(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o) || !(o.rules || o.employees || o.needs))
      throw new Error('This is not a project file saved from this tool.');
    var S = blankState();
    function s(v) { return String(v == null ? '' : v).slice(0, 2000); }
    function list(src, tmpl) {
      if (!Array.isArray(src)) return [];
      return src.slice(0, MAX_ROWS).map(function (r) {
        var t = tmpl(), x = {};
        Object.keys(t).forEach(function (k) { x[k] = s(r && r[k]); });
        return x;
      });
    }
    var R = o.rules || {};
    ['asOf', 'tiebreak', 'missingPerf', 'favorable', 'threshold'].forEach(function (k) { if (R[k] != null) S.rules[k] = s(R[k]); });
    ['perf', 'tenure', 'conduct'].forEach(function (k) {
      var w = (R.weights || {})[k]; if (w) S.rules.weights[k] = { w: s(w.w), reason: s(w.reason) };
    });
    if (Array.isArray(R.perfBands)) S.rules.perfBands = list(R.perfBands, NEW_ROW['rules.perfBands']);
    if (Array.isArray(R.conduct)) S.rules.conduct = list(R.conduct, NEW_ROW['rules.conduct']);
    if (Array.isArray(R.tenure)) S.rules.tenure = list(R.tenure, NEW_ROW['rules.tenure']);
    if (R.signoff) S.rules.signoff = { by: s(R.signoff.by), date: s(R.signoff.date), counsel: s(R.signoff.counsel) };
    ['needs', 'employees', 'prefs', 'reviews', 'fairness'].forEach(function (k) { S[k] = list(o[k], NEW_ROW[k]); });
    if (o.overrides && typeof o.overrides === 'object') {
      Object.keys(o.overrides).slice(0, MAX_ROWS).forEach(function (k) {
        if (BAD_KEYS[lcs(k)]) return;
        var v = o.overrides[k] || {};
        S.overrides[lcs(k)] = { placement: s(v.placement), reason: s(v.reason), approver: s(v.approver), date: s(v.date) };
      });
    }
    if (o.cost) Object.keys(S.cost).forEach(function (k) { if (o.cost[k] != null) S.cost[k] = s(o.cost[k]); });
    return S;
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    if (PREVIEW) toast('Downloads are turned off in this preview. They work on the hosted site.', 'warn');
  }
  document.getElementById('b-save').addEventListener('click', function () {
    var incl = document.getElementById('incl-fair').checked;
    var S = JSON.parse(JSON.stringify(state));
    if (!incl) S.fairness = [];
    S.savedAt = new Date().toISOString(); S.tool = 'Redeploy, Don’t Release web tool 1.0';
    download(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }), 'redeploy-project-' + today() + '.json');
    dirty = false;
    if (!PREVIEW) toast('Project saved to your device' + (incl ? ', including fairness group data.' : '. Fairness group data was left out.'));
  });
  document.getElementById('b-xlsx').addEventListener('click', function () {
    var R = compute(state), m = R.summary;
    var sheets = [
      { name: 'Summary', header: true, rows: [['Measure', 'Value']].concat(MEASURES.filter(function (x) { return x.length > 1; }).map(function (x) {
        var raw = { 'Preference match rate: first choice': m.firstRate, 'Preference match rate: first or second choice': m.firstSecondRate,
          'Ranks decided by tiebreak (share of in-scope)': m.tiebreakShare, 'Override rate': m.overrideRate }[x[0]];
        if (raw !== undefined) return [x[0], raw == null ? '' : { v: raw, pct: true }];
        if (x[0] === 'Estimated total avoided cost') return [x[0], m.avoidedCost];
        return [x[0], x[1](m)[0]];
      }), [[], ['Generated (UTC)', new Date().toISOString().slice(0, 16).replace('T', ' ')], ['Source', 'Durojaiye, O. A. (2026). Redeploy, don’t release [White paper]. Zenodo. https://doi.org/10.5281/zenodo.23935255'], ['Excel template', 'https://doi.org/10.5281/zenodo.23935835']]) },
      { name: 'Final placements', header: true, rows: [['Order', 'Employee ID', 'Original match', 'Override placement', 'Final placement', 'Changed?', 'Reason for change', 'Approver', 'Date', 'Final choice received', 'Documentation check']]
        .concat(R.calibration.map(function (c) { return [c.order, c.id, c.original, c.override, c.final, c.changed ? 'Yes' : 'No', c.reason, c.approver, c.date, c.finalChoice || 'Not ranked', c.doc]; })) },
      { name: 'Scoring', header: true, rows: [['Employee ID', 'In scope', 'Tenure (days)', 'Completed years', 'Performance points', 'Tenure points', 'Conduct points', 'Total score (weighted)', 'Tiebreak value', 'Final rank', 'Rank decided by tiebreak?']]
        .concat(R.scoring.map(function (s) { return [s.id, s.inScope ? 'Y' : 'N', s.days, s.years, s.perf, s.tenurePts, s.conduct, s.total, s.tb, s.rank, s.rank ? (s.tieDecided ? 'Yes' : 'No') : '']; })) },
      { name: 'Needs', header: true, rows: [['Option', 'Department', 'Shift', 'Site', 'Open seats', 'Eligible role groups', 'Start date', 'Seats filled (final)', 'Seats remaining']]
        .concat(state.needs.map(function (n, i) { return [n.name, n.dept, n.shift, n.site, +n.seats || 0, n.eligible, n.start, R.needs[i].filled, R.needs[i].remaining]; })) },
      { name: 'Fairness (group level)', header: true, rows: [['Group', 'Considered', 'Received favorable outcome', 'Selection rate', 'Impact ratio', 'Screening result']]
        .concat(R.fairness.groups.map(function (g) { return [g.group, g.considered, g.received, { v: g.rate, pct: true }, g.impact, g.impact == null ? '' : g.below ? 'Below threshold – review with counsel' : 'At or above threshold']; })) },
      { name: 'Review requests', header: true, rows: [['Employee ID', 'Date received', 'Concern type', 'Description', 'Reviewer', 'Outcome', 'Date resolved', 'Days to resolve']]
        .concat(state.reviews.map(function (r, i) { return [r.id, r.received, r.type, r.desc, r.reviewer, r.outcome, r.resolved, R.reviewDays[i]]; })) },
      { name: 'Rules', header: true, rows: [['Setting', 'Value', 'Note']].concat([
        ['As-of date', state.rules.asOf], ['Tiebreak rule', state.rules.tiebreak], ['Points if rating missing', state.rules.missingPerf],
        ['Favorable outcome', state.rules.favorable], ['Screening threshold', state.rules.threshold],
        ['Weight: performance', state.rules.weights.perf.w, state.rules.weights.perf.reason],
        ['Weight: tenure', state.rules.weights.tenure.w, state.rules.weights.tenure.reason],
        ['Weight: conduct', state.rules.weights.conduct.w, state.rules.weights.conduct.reason],
        ['Approved by', state.rules.signoff.by], ['Approval date', state.rules.signoff.date], ['Counsel review', state.rules.signoff.counsel]]) }
    ];
    download(buildXlsx(sheets), 'redeploy-results-' + today() + '.xlsx');
    if (!PREVIEW) toast('Results workbook saved to your device. Group-level fairness figures only; no individual group labels.');
  });
  document.getElementById('b-csv').addEventListener('click', function () {
    var R = compute(state);
    function q(v) { v = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var rows = [['Order', 'Employee ID', 'Final placement', 'Final choice received', 'Changed?', 'Approver', 'Date']]
      .concat(R.calibration.map(function (c) { return [c.order, c.id, c.final, c.finalChoice || 'Not ranked', c.changed ? 'Yes' : 'No', c.approver, c.date]; }));
    download(new Blob(['﻿' + rows.map(function (r) { return r.map(q).join(','); }).join('\r\n')], { type: 'text/csv' }), 'redeploy-placements-' + today() + '.csv');
    if (!PREVIEW) toast('Placements saved to your device as CSV.');
  });

  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  if (PREVIEW) document.getElementById('preview-note').hidden = false;
  render();
})();

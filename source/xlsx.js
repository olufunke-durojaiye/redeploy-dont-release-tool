/* SPDX-License-Identifier: MIT | Copyright (c) 2026 Olufunke A. Durojaiye */
/* Minimal, dependency-free .xlsx reader and writer.
   Reading uses the browser's built-in DecompressionStream; nothing leaves the device. */
var XLSX_LIMIT = 15 * 1024 * 1024;

function zipRead(buf) {
  var dv = new DataView(buf), u8 = new Uint8Array(buf), eocd = -1;
  for (var i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This file is not a valid .xlsx workbook.');
  var count = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true), entries = {};
  var dec = new TextDecoder();
  for (var n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('The workbook is damaged (bad directory).');
    var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    var nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    var off = dv.getUint32(p + 42, true);
    var name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    entries[name] = { method: method, csize: csize, off: off };
    p += 46 + nlen + xlen + clen;
  }
  return {
    has: function (name) { return name in entries; },
    text: async function (name) {
      var e = entries[name];
      if (!e) return null;
      var lnl = dv.getUint16(e.off + 26, true), lxl = dv.getUint16(e.off + 28, true);
      var start = e.off + 30 + lnl + lxl, data = u8.slice(start, start + e.csize);
      if (e.method === 0) return dec.decode(data);
      if (e.method !== 8) throw new Error('Unsupported compression in workbook.');
      if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read .xlsx files. Use a current version of Chrome, Edge, Firefox or Safari.');
      var ds = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(ds).text();
    }
  };
}

function colIndex(ref) {
  var m = /^([A-Z]+)(\d+)$/.exec(ref), c = 0;
  for (var i = 0; i < m[1].length; i++) c = c * 26 + (m[1].charCodeAt(i) - 64);
  return { c: c, r: +m[2] };
}

async function readWorkbook(buf) {
  var z = zipRead(buf), xml = new DOMParser();
  function parse(t) { return xml.parseFromString(t, 'application/xml'); }
  function tAll(node) { var s = ''; node.querySelectorAll('t').forEach(function (t) { s += t.textContent; }); return s; }
  var shared = [];
  var sst = await z.text('xl/sharedStrings.xml');
  if (sst) parse(sst).querySelectorAll('si').forEach(function (si) { shared.push(tAll(si)); });
  var wb = parse(await z.text('xl/workbook.xml'));
  var rels = parse(await z.text('xl/_rels/workbook.xml.rels')), relMap = {};
  rels.querySelectorAll('Relationship').forEach(function (r) { relMap[r.getAttribute('Id')] = r.getAttribute('Target'); });
  var sheets = {};
  var list = wb.querySelectorAll('sheet');
  for (var i = 0; i < list.length; i++) {
    var s = list[i], rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    var target = relMap[rid] || '';
    target = target.replace(/^\//, '').replace(/^xl\//, '');
    var t = await z.text('xl/' + target);
    if (!t) continue;
    var cells = {};
    parse(t).querySelectorAll('sheetData c').forEach(function (c) {
      var type = c.getAttribute('t'), v = c.querySelector('v'), val;
      if (type === 's') val = v ? shared[+v.textContent] : '';
      else if (type === 'inlineStr') val = tAll(c);
      else if (type === 'str' || type === 'e') val = v ? v.textContent : '';
      else if (type === 'b') val = v ? (v.textContent === '1') : '';
      else val = v ? +v.textContent : '';
      cells[c.getAttribute('r')] = val;
    });
    sheets[s.getAttribute('name')] = cells;
  }
  return sheets;
}

/* Map the published template layout onto the tool's project format. */
function templateToState(sheets) {
  var need = ['Rules', 'Needs', 'Employees', 'Preferences'];
  need.forEach(function (n) {
    if (!sheets[n]) throw new Error('This workbook is missing the "' + n + '" tab. Import the Redeploy, Don’t Release template.');
  });
  function g(sh, ref) { var v = (sheets[sh] || {})[ref]; return v == null ? '' : v; }
  function s(sh, ref) { var v = g(sh, ref); return typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v).trim(); }
  function d(sh, ref) {
    var v = g(sh, ref);
    if (typeof v === 'number' && v > 0) {
      var dt = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return dt.toISOString().slice(0, 10);
    }
    v = String(v).trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (m) return m[0];
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
    if (m) return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
    return '';
  }
  function nstr(sh, ref) { var v = g(sh, ref); return v === '' ? '' : String(v); }
  var S = blankState(), R = S.rules;
  R.asOf = d('Rules', 'C5'); R.tiebreak = s('Rules', 'C6') || R.tiebreak; R.missingPerf = nstr('Rules', 'C7');
  R.favorable = s('Rules', 'C8') || R.favorable; R.threshold = nstr('Rules', 'C9') || '0.8';
  R.weights.perf = { w: nstr('Rules', 'C13'), reason: s('Rules', 'D13') };
  R.weights.tenure = { w: nstr('Rules', 'C14'), reason: s('Rules', 'D14') };
  R.weights.conduct = { w: nstr('Rules', 'C15'), reason: s('Rules', 'D15') };
  function table(r0, r1, a, b, ka, kb) {
    var out = [];
    for (var r = r0; r <= r1; r++) {
      var x = s('Rules', a + r), y = nstr('Rules', b + r);
      if (x !== '' || y !== '') { var o = {}; o[ka] = x; o[kb] = y; out.push(o); }
    }
    return out;
  }
  R.perfBands = table(19, 23, 'B', 'C', 'label', 'points');
  R.conduct = table(27, 31, 'B', 'C', 'label', 'points');
  R.tenure = table(35, 39, 'B', 'C', 'min', 'points');
  R.signoff = { by: s('Rules', 'C43'), date: d('Rules', 'C44'), counsel: s('Rules', 'C45') };

  function rows(sheet, from, to, test) {
    var out = [];
    for (var r = from; r <= to; r++) if (test(r)) out.push(r);
    return out;
  }
  var needsEnd = 5;
  while (needsEnd < 500 && s('Needs', 'A' + needsEnd).toLowerCase() !== 'total') needsEnd++;
  S.needs = rows('Needs', 5, needsEnd - 1, function (r) { return s('Needs', 'A' + r) !== ''; }).map(function (r) {
    return { name: s('Needs', 'A' + r), dept: s('Needs', 'B' + r), shift: s('Needs', 'C' + r), site: s('Needs', 'D' + r),
      seats: nstr('Needs', 'E' + r), eligible: s('Needs', 'F' + r), req: s('Needs', 'G' + r), start: d('Needs', 'H' + r) };
  });
  S.employees = rows('Employees', 5, 2004, function (r) { return s('Employees', 'A' + r) !== ''; }).map(function (r) {
    return { id: s('Employees', 'A' + r), role: s('Employees', 'B' + r), dept: s('Employees', 'C' + r), group: s('Employees', 'D' + r),
      inScope: s('Employees', 'E' + r), check: s('Employees', 'F' + r), band: s('Employees', 'G' + r), hire: d('Employees', 'H' + r),
      conduct: s('Employees', 'I' + r), draw: nstr('Employees', 'J' + r), notes: s('Employees', 'K' + r) };
  });
  var cols = 'BCDEFGHIJK';
  S.prefs = rows('Preferences', 5, 2004, function (r) { return s('Preferences', 'A' + r) !== ''; }).map(function (r) {
    var p = { id: s('Preferences', 'A' + r), date: d('Preferences', 'L' + r) };
    for (var i = 0; i < 10; i++) p['c' + (i + 1)] = s('Preferences', cols[i] + r);
    return p;
  });
  for (var r = 5; r <= 504; r++) {
    var id = s('Calibration', 'M' + r);
    if (!id || /^(__proto__|constructor|prototype)$/i.test(id) || Object.prototype.hasOwnProperty.call(S.overrides, id.toLowerCase())) continue;
    S.overrides[id.toLowerCase()] = { placement: s('Calibration', 'N' + r), reason: s('Calibration', 'O' + r),
      approver: s('Calibration', 'P' + r), date: d('Calibration', 'Q' + r) };
  }
  S.reviews = rows('Review Requests', 5, 1004, function (r) {
    return s('Review Requests', 'A' + r) !== '' && 'BCDEFG'.split('').some(function (c) { return s('Review Requests', c + r) !== ''; });
  }).map(function (r) {
    return { id: s('Review Requests', 'A' + r), received: d('Review Requests', 'B' + r), type: s('Review Requests', 'C' + r),
      desc: s('Review Requests', 'D' + r), reviewer: s('Review Requests', 'E' + r), outcome: s('Review Requests', 'F' + r),
      resolved: d('Review Requests', 'G' + r) };
  });
  S.fairness = rows('Fairness Review', 5, 2004, function (r) { return s('Fairness Review', 'A' + r) !== ''; }).map(function (r) {
    return { id: s('Fairness Review', 'A' + r), group: s('Fairness Review', 'B' + r) };
  });
  if (sheets['Cost Estimate']) {
    var C = S.cost;
    C.severance = nstr('Cost Estimate', 'C5'); C.recruiting = nstr('Cost Estimate', 'C6'); C.onboarding = nstr('Cost Estimate', 'C7');
    C.ramp = nstr('Cost Estimate', 'C8'); C.training = nstr('Cost Estimate', 'C9'); C.transition = nstr('Cost Estimate', 'C10');
    C.admin = nstr('Cost Estimate', 'C11'); C.count = nstr('Cost Estimate', 'C16'); C.attrition = nstr('Cost Estimate', 'C17');
  }
  return S;
}

/* ---------- Writer: stored (uncompressed) zip, inline strings ---------- */
var CRC_TABLE = (function () {
  var t = new Uint32Array(256);
  for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

function zipWrite(files) {
  var enc = new TextEncoder(), parts = [], central = [], offset = 0;
  files.forEach(function (f) {
    var name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
    var h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, 0, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
    h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    var c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + data.length;
  });
  var csize = central.reduce(function (a, b) { return a + b.length; }, 0);
  var e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, csize, true); e.setUint32(16, offset, true);
  return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]),
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function xesc(s) {
  return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; })
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}
function colName(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

/* sheets: [{name, rows:[[...]], header: true}] ; cells: number | string | {v, pct:true} */
function buildXlsx(sheets) {
  var files = [];
  var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
    '</Types>';
  files.push({ name: '[Content_Types].xml', text: ct });
  files.push({ name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' });
  files.push({ name: 'xl/workbook.xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    sheets.map(function (s, i) { return '<sheet name="' + xesc(s.name.slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>' });
  files.push({ name: 'xl/_rels/workbook.xml.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
    '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' });
  files.push({ name: 'xl/styles.xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' });
  sheets.forEach(function (s, i) {
    var maxCols = s.rows.reduce(function (a, r) { return Math.max(a, r.length); }, 1);
    var colsXml = '<cols>' + Array.from({ length: maxCols }, function (_, k) {
      var w = s.rows.reduce(function (a, r) { var v = r[k]; v = v && typeof v === 'object' ? v.v : v; return Math.max(a, String(v == null ? '' : v).length); }, 8);
      return '<col min="' + (k + 1) + '" max="' + (k + 1) + '" width="' + Math.min(60, w + 2) + '" customWidth="1"/>';
    }).join('') + '</cols>';
    var body = s.rows.map(function (row, r) {
      return '<row r="' + (r + 1) + '">' + row.map(function (cell, c) {
        var ref = colName(c) + (r + 1), bold = s.header && r === 0 ? ' s="1"' : '';
        var v = cell, pct = false;
        if (v && typeof v === 'object') { pct = !!v.pct; v = v.v; }
        if (v == null || v === '') return '';
        if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + (pct ? ' s="2"' : bold) + '><v>' + v + '</v></c>';
        return '<c r="' + ref + '" t="inlineStr"' + bold + '><is><t xml:space="preserve">' + xesc(v) + '</t></is></c>';
      }).join('') + '</row>';
    }).join('');
    files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + colsXml + '<sheetData>' + body + '</sheetData></worksheet>' });
  });
  return zipWrite(files);
}

/**
 * Stayline – Reports.gs
 * Reports for the front office, the cashier and accounting. PDF and CSV export.
 * Group master postings are excluded from revenue until they are transferred to a room.
 */
const REPORT_TYPES = [
  ['flash', 'Daily flash (business date)'],
  ['nightaudit', 'Night audit report (business dates)'],
  ['journal', 'Journal by charge code'],
  ['occupancy', 'Occupancy & ADR by day'],
  ['arrivals', 'Arrivals'],
  ['departures', 'Departures'],
  ['inhouse', 'In-house guests'],
  ['revenue', 'Revenue by charge code'],
  ['ledger', 'Posting ledger'],
  ['cancel', 'Cancellations & no-shows'],
  ['ar', 'City ledger (company accounts)'],
  ['shifts', 'Cashier shifts & cash variance'],
  ['housekeeping', 'Housekeeping status & assignments']
];

/** Hotel logo for printed documents (folio, registration card, reports). Fetched and embedded so the PDF
 *  converter does not need to load it from the web. Falls back to the link, and to no logo if neither works. */
function hotelLogoHtml_(st) {
  const h = x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  if (!st || !st.logoUrl) return '';
  try {
    const r = UrlFetchApp.fetch(String(st.logoUrl), { muteHttpExceptions: true, followRedirects: true });
    const hd = r.getHeaders() || {};
    const type = String(hd['Content-Type'] || hd['content-type'] || '').split(';')[0].trim();
    const bytes = r.getContent();
    if (r.getResponseCode() === 200 && /^image\//.test(type) && bytes.length < 1500000) {
      return '<img src="data:' + type + ';base64,' + Utilities.base64Encode(bytes) + '" style="height:56px"><br>';
    }
  } catch (e) { Logger.log('Hotel logo: ' + e.message); }
  return '<img src="' + h(st.logoUrl) + '" style="height:56px"><br>';
}

function buildReport_(type, from, to) {
  const bd = bizDate_();
  const f = from || bd, t = to || bd;
  if (!isDate_(f) || !isDate_(t) || t < f) throw new Error('Choose a valid date range.');
  const inRange = d => d >= f && d <= t;
  const res = rows_(TBL.RES);
  const posts = rows_(TBL.POSTINGS).filter(p => p.voided !== true && String(p.resNo).indexOf('GRP:') !== 0);
  const rooms = roomsAll_().filter(r => r.status === 'Active').length;

  if (type === 'flash') {
    const todays = posts.filter(p => p.bizDate === bd);
    const charges = todays.filter(p => Number(p.amount) > 0).reduce((a, p) => a + Number(p.amount), 0);
    const payments = todays.filter(p => Number(p.amount) < 0).reduce((a, p) => a - Number(p.amount), 0);
    const inH = res.filter(r => r.status === 'In-House').length;
    return { title: 'Daily flash · ' + bd, headers: ['Measure', 'Value'], rows: [
      ['Arrivals expected', res.filter(r => r.status === 'Reserved' && r.arrival === bd).length],
      ['Departures expected', res.filter(r => r.status === 'In-House' && r.departure === bd).length],
      ['In-house', inH],
      ['Rooms available for sale', rooms],
      ['Occupancy %', rooms ? Math.round(inH / rooms * 100) + '%' : '0%'],
      ['Charges posted', num_(charges)],
      ['Payments received', num_(payments)],
      ['No-shows (today)', res.filter(r => r.status === 'No-Show' && r.arrival === bd).length]
    ] };
  }
  if (type === 'occupancy') {
    const rows = [];
    let d = f;
    while (d <= t) {
      const sold = res.filter(r => ['In-House', 'Departed', 'Reserved'].indexOf(r.status) >= 0 && r.arrival <= d && d < r.departure).length;
      const roomRev = num_(posts.filter(p => p.code === 'ROOM' && p.bizDate === d).reduce((a, p) => a + Number(p.amount), 0));
      rows.push([d, sold, rooms, rooms ? Math.round(sold / rooms * 100) + '%' : '0%', roomRev, sold ? num_(roomRev / sold) : 0]);
      d = addDays_(d, 1);
    }
    return { title: 'Occupancy & ADR', headers: ['Date', 'Rooms sold', 'Rooms available', 'Occupancy', 'Room revenue', 'ADR'], rows: rows };
  }
  if (type === 'arrivals' || type === 'departures') {
    const key = type === 'arrivals' ? 'arrival' : 'departure';
    const rows = res.filter(r => ['Cancelled', 'No-Show'].indexOf(r.status) < 0 && inRange(r[key]))
      .sort((a, b) => String(a[key]).localeCompare(String(b[key])))
      .map(r => [r[key], r.resNo, r.guestName, String(r.roomNo), r.roomType, r.arrival, r.departure, r.status, r.channel, r.company]);
    return { title: type === 'arrivals' ? 'Arrivals' : 'Departures', headers: ['Date', 'Res #', 'Guest', 'Room', 'Type', 'Arrival', 'Departure', 'Status', 'Channel', 'Company'], rows: rows };
  }
  if (type === 'inhouse') {
    const rows = res.filter(r => r.status === 'In-House')
      .map(r => [String(r.roomNo), r.guestName, r.resNo, r.arrival, r.departure, r.roomType, r.company]);
    rows.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
    return { title: 'In-house guests · ' + bd, headers: ['Room', 'Guest', 'Res #', 'Arrival', 'Departure', 'Type', 'Company'], rows: rows };
  }
  if (type === 'revenue') {
    const codes = {};
    rows_(TBL.CHARGES).forEach(c => { codes[c.code] = c; });
    const agg = {};
    posts.filter(p => inRange(p.bizDate)).forEach(p => {
      const c = codes[p.code] || { department: '?', description: p.code, type: '?' };
      const k = c.department + '|' + p.code;
      agg[k] = agg[k] || { dept: c.department, code: p.code, desc: c.description, charges: 0, payments: 0 };
      if (Number(p.amount) >= 0) agg[k].charges += Number(p.amount); else agg[k].payments += -Number(p.amount);
    });
    const keys = Object.keys(agg).sort();
    const rows = keys.map(k => [agg[k].dept, agg[k].code, agg[k].desc, num_(agg[k].charges), num_(agg[k].payments)]);
    rows.push(['TOTAL', '', '', num_(keys.reduce((a, k) => a + agg[k].charges, 0)), num_(keys.reduce((a, k) => a + agg[k].payments, 0))]);
    return { title: 'Revenue by charge code', headers: ['Department', 'Code', 'Description', 'Charges', 'Payments'], rows: rows };
  }
  if (type === 'ledger') {
    const rows = posts.filter(p => inRange(p.bizDate))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      .map(p => [p.bizDate, p.resNo, String(p.roomNo), p.code, p.description, num_(p.amount), p.postedBy]);
    return { title: 'Posting ledger', headers: ['Business date', 'Res #', 'Room', 'Code', 'Description', 'Amount', 'Posted by'], rows: rows };
  }
  if (type === 'cancel') {
    const rows = res.filter(r => (r.status === 'Cancelled' || r.status === 'No-Show') && inRange(r.arrival))
      .map(r => [r.arrival, r.resNo, r.guestName, r.status, r.cancelReason || '', r.channel]);
    return { title: 'Cancellations & no-shows', headers: ['Arrival', 'Res #', 'Guest', 'Status', 'Reason', 'Channel'], rows: rows };
  }
  if (type === 'ar') {
    const rows = rows_(TBL.ACCOUNTS).map(a => [a.code, a.name, a.active === true ? 'Active' : 'Inactive', num_(a.creditLimit), accountBalance_(a.id)])
      .sort((x, y) => y[4] - x[4]);
    rows.push(['TOTAL', '', '', '', num_(rows.reduce((a, r) => a + r[4], 0))]);
    return { title: 'City ledger · as at ' + bd, headers: ['Code', 'Company', 'Status', 'Credit limit', 'Balance owed'], rows: rows };
  }
  if (type === 'shifts') {
    const rows = rows_(TBL.SHIFTS).filter(s => inRange(String(s.openedAt).slice(0, 10)))
      .sort((a, b) => String(a.openedAt).localeCompare(String(b.openedAt)))
      .map(s => [s.user, s.openedAt, s.closedAt || '(open)', num_(s.openingFloat), s.expectedCash === '' ? '' : num_(s.expectedCash),
        s.countedCash === '' ? '' : num_(s.countedCash), s.variance === '' ? '' : num_(s.variance), s.status]);
    return { title: 'Cashier shifts', headers: ['Cashier', 'Opened', 'Closed', 'Float', 'Expected cash', 'Counted cash', 'Variance', 'Status'], rows: rows };
  }
  if (type === 'nightaudit') {
    const days = [];
    for (let d = f; d <= t && days.length < 62; d = addDays_(d, 1)) days.push(d);
    const bds = rows_(TBL.BIZDATES);
    const rows = days.map(d => {
      const b = bds.find(x => x.date === d);
      const ps = posts.filter(p => p.bizDate === d);
      const sum = fn => num_(ps.filter(fn).reduce((a, p) => a + Number(p.amount), 0));
      return [d, b ? String(b.status || 'Closed') : 'Open', b && b.closedAt ? String(b.closedAt) : '', b ? String(b.closedBy || '') : '',
        sum(p => p.code === 'ROOM'), sum(p => Number(p.amount) > 0), num_(-sum(p => Number(p.amount) < 0)),
        b ? Number(b.roomsPosted) || 0 : 0, b ? Number(b.noShows) || 0 : 0];
    });
    return { title: 'Night audit · ' + f + (t !== f ? ' to ' + t : ''), headers: ['Business date', 'Status', 'Closed at', 'Closed by', 'Room revenue', 'Charges', 'Payments', 'Rooms posted', 'No-shows'], rows };
  }
  if (type === 'journal') {
    const byCode = {};
    posts.filter(p => inRange(p.bizDate)).forEach(p => {
      const c = byCode[p.code] = byCode[p.code] || { code: p.code, n: 0, ch: 0, pay: 0 };
      const a = Number(p.amount) || 0;
      c.n++; if (a >= 0) c.ch += a; else c.pay -= a;
    });
    const rows = Object.keys(byCode).sort().map(k => { const c = byCode[k]; return [c.code, c.n, num_(c.ch), num_(c.pay), num_(c.ch - c.pay)]; });
    const tot = rows.reduce((a, r) => [a[0], a[1] + r[1], num_(a[2] + r[2]), num_(a[3] + r[3]), num_(a[4] + r[4])], ['TOTAL', 0, 0, 0, 0]);
    return { title: 'Journal by charge code · ' + f + (t !== f ? ' to ' + t : ''), headers: ['Code', 'Lines', 'Charges', 'Payments', 'Net'], rows: rows.concat([tot]) };
  }
  if (type === 'housekeeping') {
    const rows = roomsAll_().sort((a, b) => String(a.roomNo).localeCompare(String(b.roomNo), undefined, { numeric: true }))
      .map(r => [String(r.roomNo), r.type, r.status, r.housekeeping, r.assignedTo || '', r.hkUpdatedAt || '']);
    return { title: 'Housekeeping · as at ' + bd, headers: ['Room', 'Type', 'Room status', 'Housekeeping', 'Assigned to', 'Last updated'], rows: rows };
  }
  throw new Error('Unknown report type.');
}

function runReport(token, type, from, to) {
  auth_(token, 'reports.view');
  return buildReport_(type, from, to);
}
function reportTypes(token) {
  auth_(token, 'reports.view');
  return REPORT_TYPES;
}

function exportReportPdf(token, type, from, to) {
  const s = auth_(token, 'reports.export');
  const rep = buildReport_(type, from, to);
  const st = settings_();
  const esc = x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const logo = hotelLogoHtml_(st);
  const html = '<html><head><style>body{font-family:Arial,sans-serif;font-size:11px}h1{font-size:18px;margin:0}' +
    'table{border-collapse:collapse;width:100%;margin-top:10px}td,th{border:1px solid #999;padding:4px}th{background:#e6efef;text-align:left}</style></head><body>' +
    logo + '<h1>' + esc(st.hotelName) + '</h1><h3>' + esc(rep.title) + ' · ' + esc(from || '') + ' to ' + esc(to || '') + '</h3>' +
    '<table><tr>' + rep.headers.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr>' +
    rep.rows.map(r => '<tr>' + r.map(c => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') +
    '</table><p>Generated ' + fmtTs_(new Date()) + ' · ' + esc(st.hotelName) + '</p></body></html>';
  const blob = HtmlService.createHtmlOutput(html).getAs('application/pdf');
  audit_(s.username, 'REPORT_EXPORT', 'Report', type, (from || '') + ' to ' + (to || ''));
  return { name: rep.title.replace(/\W+/g, '_') + '.pdf', base64: Utilities.base64Encode(blob.getBytes()) };
}

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
  ['arhistory', 'AR aging history (saved each night audit)'],
  ['shifts', 'Cashier shifts & cash variance'],
  ['housekeeping', 'Housekeeping status & assignments'],
  ['nationality', 'In-house guests by nationality'],
  ['group', 'Group in-house (rooms by group)'],
  ['company', 'In-house by company'],
  ['vip', 'VIP guests in house'],
  ['payments', 'Payments by method'],
  ['checkedin', 'Check-ins (checked in within the dates)'],
  ['checkedout', 'Check-outs (checked out within the dates)'],
  ['ratevar', 'Rate variance (actual rate vs published rate)'],
  ['complimentary', 'Complimentary & discounts'],
  ['folioledger', 'Folio ledger (every folio and its balance)'],
  ['roomledger', 'Room ledger (charges, payments and balance by room)']
];

/** A report is one table, or several sections (the end-of-day report). */
function reportSections_(rep) {
  return rep.sections || [{ title: rep.title, headers: rep.headers, rows: rep.rows }];
}

/** Hotel logo for printed documents (folio, registration card, reports). Fetched and embedded so the PDF
 *  converter does not need to load it from the web. Falls back to the link, and to no logo if neither works. */
function hotelLogoHtml_(st) {
  const h = x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  if (!st || !st.logoUrl) return '';
  if (/^data:image\//i.test(st.logoUrl)) return '<img src="' + h(st.logoUrl) + '" style="height:56px"><br>';
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
  if (type === 'eod') return eodReport_(f);
  const res = rows_(TBL.RES);
  const posts = rows_(TBL.POSTINGS).filter(p => p.voided !== true && String(p.resNo).indexOf('GRP:') !== 0);
  const rooms = roomsAll_().filter(r => r.status === 'Active').length;

  if (type === 'flash') {
    const todays = posts.filter(p => p.bizDate === bd);
    const charges = todays.filter(p => Number(p.amount) > 0).reduce((a, p) => a + Number(p.amount), 0);
    const payments = todays.filter(p => Number(p.amount) < 0).reduce((a, p) => a - Number(p.amount), 0);
    const inH = res.filter(r => r.status === 'In-House').length;
    const flashRows = [
      ['Arrivals expected', res.filter(r => r.status === 'Reserved' && r.arrival === bd).length],
      ['Departures expected', res.filter(r => r.status === 'In-House' && r.departure === bd).length],
      ['In-house', inH],
      ['Rooms available for sale', rooms],
      ['Occupancy %', rooms ? Math.round(inH / rooms * 100) + '%' : '0%'],
      ['Charges posted', num_(charges)],
      ['Payments received', num_(payments)],
      ['No-shows (today)', res.filter(r => r.status === 'No-Show' && r.arrival === bd).length]
    ];
    const per = periodRevenue_(bd);
    return { title: 'Daily flash · ' + bd, headers: ['Measure', 'Value'], rows: flashRows, sections: [
      { title: 'Today', headers: ['Measure', 'Value'], rows: flashRows },
      { title: 'Revenue by period', headers: ['Period', 'Rooms', 'Fixed charges', 'Other charges', 'Tax', 'Total'], rows: per.map(p => [p.label, p.rooms, p.fixed, p.other, p.tax, p.total]) }
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
  if (type === 'nationality' || type === 'company') {
    const guests = {};
    rows_(TBL.GUESTS).forEach(g => { guests[g.id] = g; });
    const agg = {};
    res.filter(r => r.status === 'In-House').forEach(r => {
      const key = type === 'nationality'
        ? (String((guests[r.guestId] || {}).nationality || '').trim() || 'Not recorded')
        : (String(r.company || '').trim() || 'Individual');
      agg[key] = agg[key] || { rooms: 0, guests: 0 };
      agg[key].rooms++; agg[key].guests += Number(r.adults || 1) + Number(r.children || 0);
    });
    const rows = Object.keys(agg).map(k => [k, agg[k].rooms, agg[k].guests]).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
    rows.push(['TOTAL', rows.reduce((a, x) => a + x[1], 0), rows.reduce((a, x) => a + x[2], 0)]);
    return { title: (type === 'nationality' ? 'In-house by nationality' : 'In-house by company') + ' · ' + bd,
      headers: [type === 'nationality' ? 'Nationality' : 'Company', 'Rooms', 'Guests'], rows: rows };
  }
  if (type === 'group') {
    const groups = {};
    rows_(TBL.GROUPS).forEach(g => { groups[g.id] = g; });
    const agg = {};
    res.filter(r => (r.status === 'In-House' || r.status === 'Reserved') && r.groupId).forEach(r => {
      const k = String(r.groupId);
      agg[k] = agg[k] || { name: (groups[k] || {}).name || k, rooms: 0, inHouse: 0, reserved: 0, arrival: r.arrival, departure: r.departure };
      const a = agg[k];
      a.rooms++; if (r.status === 'In-House') a.inHouse++; else a.reserved++;
      if (r.arrival < a.arrival) a.arrival = r.arrival;
      if (r.departure > a.departure) a.departure = r.departure;
    });
    const rows = Object.keys(agg).map(k => [agg[k].name, agg[k].rooms, agg[k].inHouse, agg[k].reserved, agg[k].arrival, agg[k].departure])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    return { title: 'Group in-house · ' + bd, headers: ['Group', 'Rooms', 'In-house', 'Reserved', 'Arrival', 'Departure'], rows: rows };
  }
  if (type === 'vip') {
    const rows = res.filter(r => r.status === 'In-House' && r.vip === true)
      .map(r => [String(r.roomNo), r.guestName, r.resNo, r.arrival, r.departure, r.roomType, r.company]);
    rows.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
    return { title: 'VIP guests in house · ' + bd, headers: ['Room', 'Guest', 'Res #', 'Arrival', 'Departure', 'Type', 'Company'], rows: rows };
  }
  if (type === 'payments') {
    const names = {};
    rows_(TBL.PAYMETHODS).forEach(m => { names[m.code] = m.name || m.code; });
    const agg = {};
    posts.filter(p => inRange(p.bizDate) && Number(p.amount) < 0).forEach(p => { agg[p.code] = (agg[p.code] || 0) - Number(p.amount); });
    const rows = Object.keys(agg).map(k => [k, names[k] || k, agg[k]]).sort((a, b) => b[2] - a[2]);
    rows.push(['TOTAL', '', rows.reduce((a, x) => a + x[2], 0)]);
    return { title: 'Payments by method · ' + f + (t !== f ? ' to ' + t : ''), headers: ['Code', 'Method', 'Amount'], rows: rows };
  }
  if (type === 'checkedin' || type === 'checkedout') {
    const isIn = type === 'checkedin';
    const rows = res.filter(r => inRange(String(isIn ? r.checkedInAt : r.checkedOutAt || '').slice(0, 10)) && (isIn ? r.checkedInAt : r.checkedOutAt))
      .map(r => [String(r.roomNo), r.guestName, r.resNo, r.arrival, String(r.checkedInAt || '').slice(0, 16), String(r.checkedOutAt || '').slice(0, 16), r.departure])
      .sort((a, b) => String(a[4]).localeCompare(String(b[4])));
    return { title: (isIn ? 'Check-ins' : 'Check-outs') + ' · ' + f + (t !== f ? ' to ' + t : ''),
      headers: ['Room', 'Guest', 'Res #', 'Arrival', 'Checked in', 'Checked out', 'Departure'], rows: rows };
  }
  if (type === 'ratevar') {
    // Stays arriving in the dates: the rate actually charged against the published rate for the same nights
    const rows = [];
    res.filter(x => ['In-House', 'Departed', 'Reserved'].indexOf(x.status) >= 0 && inRange(String(x.arrival || '')) && Number(x.rate) >= 0)
      .forEach(x => {
        let quoted = 0;
        try { const n = quoteNights_(x.roomType, x.plan || 'BAR', x.arrival, x.departure); quoted = n.length ? n.reduce((a, q) => a + q.rate, 0) / n.length : 0; } catch (e) { quoted = 0; }
        const actual = Number(x.rate) || 0;
        const v = Math.round((actual - quoted) * 100) / 100;
        if (Math.abs(v) >= 0.01) rows.push([String(x.roomNo), x.guestName, x.resNo, x.plan || '', x.arrival, quoted, actual, v]);
      });
    rows.sort((a, b) => Math.abs(b[7]) - Math.abs(a[7]));
    rows.push(['TOTAL', '', '', '', '', '', '', rows.reduce((a, x) => a + x[7], 0)]);
    return { title: 'Rate variance · ' + f + (t !== f ? ' to ' + t : ''), headers: ['Room', 'Guest', 'Res #', 'Rate code', 'Arrival', 'Published avg', 'Actual rate', 'Variance'], rows: rows };
  }
  if (type === 'complimentary') {
    const hit = p => /comp|discount|waiv|courtesy/i.test(String(p.code) + ' ' + String(p.description || ''));
    const rows = posts.filter(p => inRange(p.bizDate) && hit(p))
      .map(p => [p.bizDate, String(p.roomNo || ''), p.resNo, p.code, p.description || '', Number(p.amount)]);
    rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    rows.push(['TOTAL', '', '', '', '', rows.reduce((a, x) => a + x[5], 0)]);
    return { title: 'Complimentary & discounts · ' + f + (t !== f ? ' to ' + t : ''), headers: ['Date', 'Room', 'Res #', 'Code', 'Description', 'Amount'], rows: rows };
  }
  if (type === 'folioledger') {
    const bal = {};
    posts.forEach(p => { bal[p.folioId] = (bal[p.folioId] || 0) + Number(p.amount); });
    const resBy = {};
    res.forEach(x => { resBy[x.resNo] = x; });
    const rows = rows_(TBL.FOLIOS)
      .filter(fo => fo.status === 'Open' || Math.abs(bal[fo.id] || 0) >= 0.005)
      .map(fo => { const x = resBy[fo.resNo] || {}; return [String(fo.folioNo), fo.name || '', fo.resNo, x.guestName || '', String(x.roomNo || ''), fo.status, Math.round((bal[fo.id] || 0) * 100) / 100]; })
      .sort((a, b) => String(a[4]).localeCompare(String(b[4]), undefined, { numeric: true }));
    rows.push(['TOTAL', '', '', '', '', '', rows.reduce((a, x) => a + x[6], 0)]);
    return { title: 'Folio ledger · ' + bd, headers: ['Folio', 'Folio name', 'Res #', 'Guest', 'Room', 'Status', 'Balance'], rows: rows };
  }
  if (type === 'roomledger') {
    const agg = {};
    posts.filter(p => inRange(p.bizDate)).forEach(p => {
      const k = String(p.roomNo || '');
      agg[k] = agg[k] || { charges: 0, payments: 0 };
      if (Number(p.amount) >= 0) agg[k].charges += Number(p.amount); else agg[k].payments += -Number(p.amount);
    });
    const rows = Object.keys(agg).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map(k => [k, agg[k].charges, agg[k].payments, agg[k].charges - agg[k].payments]);
    rows.push(['TOTAL', rows.reduce((a, x) => a + x[1], 0), rows.reduce((a, x) => a + x[2], 0), rows.reduce((a, x) => a + x[3], 0)]);
    return { title: 'Room ledger · ' + f + (t !== f ? ' to ' + t : ''), headers: ['Room', 'Charges', 'Payments', 'Net'], rows: rows };
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
  if (type === 'arhistory') {
    // Saved by each night audit: the city-ledger aging as of that business date
    const snaps = (ss_().getSheetByName(TBL.ARAGING[0]) ? rows_(TBL.ARAGING) : []).filter(x => inRange(String(x.bizDate).slice(0, 10)))
      .sort((x, y) => String(y.bizDate).localeCompare(String(x.bizDate)) || String(x.code).localeCompare(String(y.code)));
    const rows = snaps.map(x => [String(x.bizDate).slice(0, 10), x.code, x.name, num_(x.current), num_(x.d31), num_(x.d61), num_(x.d90), num_(x.total)]);
    const tot = rows.reduce((a, r) => a.map((v, i) => i < 3 ? v : num_(v + r[i])), ['TOTAL', '', '', 0, 0, 0, 0, 0]);
    return { title: 'AR aging history · ' + f + ' to ' + t, headers: ['Business date', 'Code', 'Company', 'Current (0-30)', '31-60', '61-90', 'Over 90', 'Total'],
      rows: rows.concat(rows.length ? [tot] : []) };
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
  return cachedRead_('report:' + type + ':' + from + ':' + to, () => buildReport_(type, from, to));
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
    logo + '<h1>' + esc(st.hotelName) + '</h1><h3>' + esc(dmy_(rep.title)) + ' · ' + esc(dmy_(from || '')) + ' to ' + esc(dmy_(to || '')) + '</h3>' +
    reportSections_(rep).map(sec => '<h3>' + esc(sec.title) + '</h3><table><tr>' + sec.headers.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr>' +
    sec.rows.map(r => '<tr>' + r.map(c => '<td>' + esc(dmy_(c)) + '</td>').join('') + '</tr>').join('') + '</table>').join('') +
    '<p>Generated ' + fmtTs_(new Date()) + ' · ' + esc(st.hotelName) + '</p></body></html>';
  const blob = HtmlService.createHtmlOutput(html).getAs('application/pdf');
  audit_(s.username, 'REPORT_EXPORT', 'Report', type, (from || '') + ' to ' + (to || ''));
  return { name: rep.title.replace(/\W+/g, '_') + '.pdf', base64: Utilities.base64Encode(blob.getBytes()) };
}

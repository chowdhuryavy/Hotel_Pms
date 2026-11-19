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
  ['roomledger', 'Room ledger (charges, payments and balance by room)'],
  ['deptrevenue', 'Revenue by department'],
  ['tax', 'Taxable charges & tax'],
  ['expdep', 'Expected departures (business date)'],
  ['pastdue', 'Past-due arrivals (not checked in)'],
  ['ooo', 'Rooms out of order or out of service'],
  ['forecast', 'Forecast: next 7 days (arrivals, departures, rooms sold)'],
  ['roomtypeocc', 'Occupancy by room type (business date)'],
  ['guestledger', 'Guest ledger (balance by guest)'],
  ['groupledger', 'Group ledger (balance by group)']
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
  if (type === 'deptrevenue') {
    const codes = {};
    rows_(TBL.CHARGES).forEach(c => { codes[c.code] = c; });
    const agg = {};
    posts.filter(p => inRange(p.bizDate) && Number(p.amount) >= 0).forEach(p => {
      const c = codes[p.code] || { department: '(unassigned)' };
      const k = String(c.department || '(unassigned)');
      agg[k] = (agg[k] || 0) + Number(p.amount);
    });
    const rows = Object.keys(agg).sort().map(k => [k, agg[k]]);
    rows.push(['TOTAL', rows.reduce((a, x) => a + x[1], 0)]);
    return { title: 'Revenue by department · ' + f + (t !== f ? ' to ' + t : ''), headers: ['Department', 'Charges'], rows: rows };
  }
  if (type === 'tax') {
    const codes = {};
    rows_(TBL.CHARGES).forEach(c => { codes[c.code] = c; });
    const rate = Number(settings_().taxRate) || 0;
    const agg = {};
    posts.filter(p => inRange(p.bizDate) && Number(p.amount) >= 0 && codes[p.code] && codes[p.code].taxable === true).forEach(p => {
      agg[p.code] = (agg[p.code] || 0) + Number(p.amount);
    });
    const rows = Object.keys(agg).sort().map(k => [k, (codes[k] || {}).description || k, agg[k], Math.round(agg[k] * rate * 100) / 100]);
    rows.push(['TOTAL', '', rows.reduce((a, x) => a + x[2], 0), rows.reduce((a, x) => a + x[3], 0)]);
    return { title: 'Taxable charges & tax (' + Math.round(rate * 100) + '%) · ' + f + (t !== f ? ' to ' + t : ''), headers: ['Code', 'Description', 'Taxable base', 'Tax'], rows: rows };
  }
  if (type === 'expdep') {
    const rows = res.filter(x => x.status === 'In-House' && x.departure === bd)
      .map(x => [String(x.roomNo), x.guestName, x.resNo, x.arrival, x.departure, x.company]);
    rows.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
    return { title: 'Expected departures · ' + bd, headers: ['Room', 'Guest', 'Res #', 'Arrival', 'Departure', 'Company'], rows: rows };
  }
  if (type === 'pastdue') {
    const rows = res.filter(x => x.status === 'Reserved' && x.arrival < bd)
      .map(x => [String(x.roomNo || ''), x.guestName, x.resNo, x.arrival, x.departure, x.company]);
    rows.sort((a, b) => String(a[3]).localeCompare(String(b[3])));
    return { title: 'Past-due arrivals · ' + bd, headers: ['Room', 'Guest', 'Res #', 'Arrival', 'Departure', 'Company'], rows: rows };
  }
  if (type === 'ooo') {
    const rows = rows_(TBL.ROOMS).filter(x => x.status && x.status !== 'Active')
      .map(x => [String(x.roomNo), x.type, x.status, x.statusReason || '']);
    rows.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
    return { title: 'Out of order / out of service · ' + bd, headers: ['Room', 'Type', 'Status', 'Reason'], rows: rows };
  }
  if (type === 'forecast') {
    const rows = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays_(bd, i);
      const arr = res.filter(x => x.arrival === d && ['Reserved', 'In-House'].indexOf(x.status) >= 0).length;
      const dep = res.filter(x => x.departure === d && ['Reserved', 'In-House'].indexOf(x.status) >= 0).length;
      const sold = res.filter(x => ['Reserved', 'In-House'].indexOf(x.status) >= 0 && x.arrival <= d && d < x.departure).length;
      rows.push([d, arr, dep, sold, rooms ? Math.round(sold / rooms * 1000) / 10 : 0]);
    }
    return { title: 'Forecast from ' + bd, headers: ['Date', 'Arrivals', 'Departures', 'Rooms sold', 'Occupancy %'], rows: rows };
  }
  if (type === 'roomtypeocc') {
    const types = {};
    roomsAll_().filter(x => x.status === 'Active').forEach(x => { types[x.type] = types[x.type] || { total: 0, sold: 0 }; types[x.type].total++; });
    res.filter(x => x.status === 'In-House').forEach(x => { if (types[x.roomType]) types[x.roomType].sold++; });
    const rows = Object.keys(types).sort().map(k => [k, types[k].total, types[k].sold, types[k].total ? Math.round(types[k].sold / types[k].total * 1000) / 10 : 0]);
    return { title: 'Occupancy by room type · ' + bd, headers: ['Room type', 'Rooms', 'In-house', 'Occupancy %'], rows: rows };
  }
  if (type === 'guestledger') {
    const bal = balances_();
    const rows = res.filter(x => ['In-House', 'Departed', 'Reserved'].indexOf(x.status) >= 0)
      .map(x => [x.guestName, x.resNo, String(x.roomNo || ''), x.status, Math.round((Number(bal[x.resNo]) || 0) * 100) / 100])
      .filter(x => Math.abs(x[4]) >= 0.005);
    rows.sort((a, b) => b[4] - a[4]);
    rows.push(['TOTAL', '', '', '', rows.reduce((a, x) => a + x[4], 0)]);
    return { title: 'Guest ledger · ' + bd, headers: ['Guest', 'Res #', 'Room', 'Status', 'Balance'], rows: rows };
  }
  if (type === 'groupledger') {
    const bal = balances_();
    const groups = {};
    rows_(TBL.GROUPS).forEach(g => { groups[g.id] = g; });
    const agg = {};
    res.filter(x => x.groupId && ['In-House', 'Departed', 'Reserved'].indexOf(x.status) >= 0).forEach(x => {
      const k = String(x.groupId);
      agg[k] = agg[k] || { name: (groups[k] || {}).name || k, rooms: 0, balance: 0 };
      agg[k].rooms++; agg[k].balance += Number(bal[x.resNo]) || 0;
    });
    const rows = Object.keys(agg).sort().map(k => [agg[k].name, agg[k].rooms, Math.round(agg[k].balance * 100) / 100]);
    rows.push(['TOTAL', rows.reduce((a, x) => a + x[1], 0), rows.reduce((a, x) => a + x[2], 0)]);
    return { title: 'Group ledger · ' + bd, headers: ['Group', 'Rooms', 'Balance'], rows: rows };
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

function runReport(token, type, from, to, serial) {
  auth_(token, 'reports.view');
  const rep = cachedRead_('report:' + type + ':' + from + ':' + to, () => buildReport_(type, from, to));
  return serial ? withSerial_(rep) : rep;
}
function reportTypes(token) {
  auth_(token, 'reports.view');
  return REPORT_TYPES;
}

/* Night audit report page: the reports the admin chose to show (settings nightReportTypes, comma-separated keys; blank = all) */
function nightReportList_() {
  const raw = String(settings_().nightReportTypes || '').trim();
  if (!raw) return REPORT_TYPES;
  const on = raw.split(',').map(s => s.trim());
  return REPORT_TYPES.filter(x => on.indexOf(x[0]) >= 0);
}
function nightReportTypes(token) {
  auth_(token, 'reports.view');
  return nightReportList_();
}
/* Every report with a flag for the night audit page (the configuration screen) */
function reportTypeConfig(token) {
  auth_(token, 'cfg.settings.view');
  const on = nightReportList_().map(x => x[0]);
  return REPORT_TYPES.map(x => ({ key: x[0], label: x[1], on: on.indexOf(x[0]) >= 0 }));
}
function saveNightReportTypes(token, keys) {
  const s = auth_(token, 'cfg.settings.edit');
  const valid = REPORT_TYPES.map(x => x[0]);
  const list = (Array.isArray(keys) ? keys : []).filter(k => valid.indexOf(k) >= 0);
  if (!list.length) throw new Error('Choose at least one report to show.');
  const value = list.length === valid.length ? '' : list.join(',');
  return withLock_(() => {
    const row = rows_(TBL.SETTINGS).find(r => r.key === 'nightReportTypes');
    if (row) patch_(TBL.SETTINGS, row._row, { value: value }); else append_(TBL.SETTINGS, { key: 'nightReportTypes', value: value });
    audit_(s.username, 'SETTINGS_SAVED', 'Settings', 'nightReportTypes', list.length + ' of ' + valid.length + ' reports shown');
    return reportTypeConfig(token);
  });
}

/* Adds a serial number (#) as the first column of every table. TOTAL rows get no number. Returns a new object. */
function withSerial_(rep) {
  const numbered = sec => {
    let n = 0;
    return { title: sec.title, headers: ['#'].concat(sec.headers), rows: sec.rows.map(r => r[0] === 'TOTAL' ? [''].concat(r) : [++n].concat(r)) };
  };
  if (rep.sections) return Object.assign({}, rep, { sections: rep.sections.map(numbered) });
  const t = numbered({ title: '', headers: rep.headers, rows: rep.rows });
  return Object.assign({}, rep, { headers: t.headers, rows: t.rows });
}

/* Night run: every report for the business date is saved, in parts (a cell holds up to 50,000 characters) */
function snapshotNightReports_(bd, by, now) {
  ensureTabs_([TBL.NIGHTRPT]);
  let saved = 0;
  REPORT_TYPES.forEach(x => {
    const type = x[0];
    let json;
    try { json = JSON.stringify(buildReport_(type, bd, bd)); }
    catch (e) { json = JSON.stringify({ title: x[1], headers: ['Message'], rows: [['Could not be generated: ' + e.message]] }); }
    for (let i = 0, p = 0; i < json.length; i += 40000, p++) {
      append_(TBL.NIGHTRPT, { bizDate: bd, type: type, part: p, data: 'J:' + json.substr(i, 40000), generatedAt: now, generatedBy: by });
    }
    saved++;
  });
  return saved;
}
/* The saved night-run copy of a report for one date, or null */
function nightSnapshot_(bd, type) {
  const parts = rows_(TBL.NIGHTRPT).filter(r => String(r.bizDate).slice(0, 10) === bd && r.type === type)
    .sort((a, b) => Number(a.part) - Number(b.part));
  if (!parts.length) return null;
  return { rep: JSON.parse(parts.map(p => String(p.data).slice(2)).join('')), generatedAt: String(parts[0].generatedAt) };
}
/* A report for the night audit page: the night-run copy when one exists for that single date, otherwise built now */
function nightRunReport(token, type, from, to, serial) {
  auth_(token, 'reports.view');
  const snap = from === to ? nightSnapshot_(from, type) : null;
  const rep = snap ? snap.rep : buildReport_(type, from, to);
  const source = snap ? 'Generated by the night run of ' + dmy_(from) + ' at ' + dmy_(snap.generatedAt)
    : 'Generated live at ' + dmy_(fmtTs_(new Date())) + ' (no night run saved for this date)';
  return Object.assign({}, serial ? withSerial_(rep) : rep, { source: source });
}

function exportReportPdf(token, type, from, to, serial, night) {
  const s = auth_(token, 'reports.export');
  const snap = night && from === to ? nightSnapshot_(from, type) : null;
  let rep = snap ? snap.rep : buildReport_(type, from, to);
  if (serial) rep = withSerial_(rep);
  const st = settings_();
  const esc = x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = x => Number.isInteger(x) ? x.toLocaleString('en-US') : x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cell = (c, i) => {
    const cls = (i === 0 && serial) ? 'sn' : (typeof c === 'number' ? 'num' : '');
    return '<td class="' + cls + '">' + (typeof c === 'number' ? fmt(c) : esc(dmy_(c))) + '</td>';
  };
  const table = sec => {
    const numCol = sec.headers.map((h, i) => i > 0 && sec.rows.some(r => typeof r[i] === 'number'));
    const head = sec.headers.map((h, i) => '<th class="' + (i === 0 && serial ? 'sn' : numCol[i] ? 'num' : '') + '">' + esc(h) + '</th>').join('');
    const body = sec.rows.length ? sec.rows.map(r => '<tr class="' + (r[0] === 'TOTAL' || r[1] === 'TOTAL' ? 'sum' : '') + '">' + r.map(cell).join('') + '</tr>').join('')
      : '<tr><td colspan="' + sec.headers.length + '" class="muted">No records</td></tr>';
    return '<table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>';
  };
  const css = '@page{size:A4 landscape;margin:12mm}' +
    'body{font-family:Helvetica,Arial,sans-serif;font-size:10px;color:#1d2a2b;margin:0}' +
    '.top{border-bottom:2px solid #1d7874;padding-bottom:8px;margin-bottom:10px}' +
    '.kick{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#667}' +
    'h1{font-size:15px;margin:0;color:#1d7874}' +
    'h2{font-size:14px;margin:2px 0 0}' +
    '.meta{color:#556;font-size:10px;margin-top:3px}' +
    'h3.sec{font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#1d7874;margin:14px 0 4px}' +
    'table{border-collapse:collapse;width:100%}' +
    'th{background:#1d7874;color:#fff;text-align:left;padding:5px 6px;font-size:9px;text-transform:uppercase;letter-spacing:.3px}' +
    'td{padding:4px 6px;border-bottom:1px solid #e1e7e7}' +
    'tr:nth-child(even) td{background:#f5f9f9}' +
    'td.num,th.num{text-align:right}' +
    'td.sn,th.sn{text-align:center;width:36px;color:#667}' +
    'tr.sum td{font-weight:bold;border-top:1.5px solid #1d7874;background:#e6f1f0}' +
    'tr{page-break-inside:avoid}' +
    '.foot{margin-top:12px;color:#667;font-size:8.5px;border-top:1px solid #d0d8d8;padding-top:4px}';
  const logo = hotelLogoHtml_(st);
  const period = esc(dmy_(from || '')) + (to && to !== from ? ' to ' + esc(dmy_(to)) : '');
  const html = '<html><head><meta charset="utf-8"><style>' + css + '</style></head><body>' +
    logo + '<div class="top"><div class="kick">' + esc(st.hotelName) + '</div><h2>' + esc(dmy_(rep.title)) + '</h2>' +
    '<div class="meta">Period: ' + period + (snap ? ' · Generated by the night run at ' + esc(dmy_(snap.generatedAt)) : '') + '</div></div>' +
    reportSections_(rep).map(sec => (rep.sections ? '<h3 class="sec">' + esc(sec.title) + '</h3>' : '') + table(sec)).join('') +
    '<div class="foot">Generated ' + fmtTs_(new Date()) + ' by ' + esc(s.name || s.username || '') + ' · ' + esc(st.hotelName) + '</div></body></html>';
  const blob = HtmlService.createHtmlOutput(html).getAs('application/pdf');
  audit_(s.username, 'REPORT_EXPORT', 'Report', type, (from || '') + ' to ' + (to || ''));
  return { name: rep.title.replace(/\W+/g, '_') + '.pdf', base64: Utilities.base64Encode(blob.getBytes()) };
}

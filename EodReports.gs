/**
 * Stayline – EodReports.gs
 * End-of-day report: a set of sections for the business date. Each section is one entry in EOD_SECTIONS.
 * To add a report later, write a function that takes the context and returns { title, headers, rows },
 * then add [key, title, function] to EOD_SECTIONS. The report page, PDF, CSV and auditor email pick it up.
 * Postings are single-entry (charges and payments), so the trial balance summarises them by charge code.
 */
const EOD_SECTIONS = [
  ['mgrflash', 'Manager flash', eodManagerFlash_],
  ['trial', 'Trial balance', eodTrialBalance_],
  ['guest', 'Guest ledger (open folios)', eodGuestLedger_],
  ['package', 'Package ledger', eodPackageLedger_],
  ['aging', 'City ledger aging', eodAging_]
];

/** Context shared by every section for one business date. */
function eodContext_(bd) {
  const posts = rows_(TBL.POSTINGS).filter(p => p.voided !== true && String(p.resNo).indexOf('GRP:') !== 0);
  return {
    bd: bd,
    posts: posts,
    today: posts.filter(p => p.bizDate === bd),
    res: rows_(TBL.RES),
    folios: rows_(TBL.FOLIOS),
    rooms: roomsAll_().length
  };
}

/** Manager flash: the key measures for the business date. */
function eodManagerFlash_(c) {
  const inH = c.res.filter(r => r.status === 'In-House').length;
  const roomRev = c.today.filter(p => p.code === 'ROOM').reduce((a, p) => a + Number(p.amount), 0);
  const charges = c.today.filter(p => Number(p.amount) > 0).reduce((a, p) => a + Number(p.amount), 0);
  const payments = c.today.filter(p => Number(p.amount) < 0).reduce((a, p) => a - Number(p.amount), 0);
  const adr = inH ? roomRev / inH : 0;
  const revpar = c.rooms ? roomRev / c.rooms : 0;
  return { title: 'Manager flash', headers: ['Measure', 'Value'], rows: [
    ['Rooms available', c.rooms],
    ['Rooms sold (in-house)', inH],
    ['Occupancy %', c.rooms ? Math.round(inH / c.rooms * 100) + '%' : '0%'],
    ['Room revenue', num_(roomRev)],
    ['ADR', num_(adr)],
    ['RevPAR', num_(revpar)],
    ['Total charges', num_(charges)],
    ['Total payments', num_(payments)],
    ['Arrivals expected', c.res.filter(r => r.status === 'Reserved' && r.arrival === c.bd).length],
    ['Departures expected', c.res.filter(r => r.status === 'In-House' && r.departure === c.bd).length]
  ] };
}

/** Trial balance: charges (debit) and payments (credit) for the business date, by charge code. */
function eodTrialBalance_(c) {
  const byCode = {};
  c.today.forEach(p => {
    const k = p.code || '';
    const t = byCode[k] = byCode[k] || { code: k, n: 0, dr: 0, cr: 0 };
    const a = Number(p.amount) || 0;
    t.n++;
    if (a >= 0) t.dr += a; else t.cr -= a;
  });
  const rows = Object.keys(byCode).sort().map(k => {
    const t = byCode[k];
    return [t.code, t.n, num_(t.dr), num_(t.cr), num_(t.dr - t.cr)];
  });
  const tot = rows.reduce((a, r) => [a[0], a[1] + r[1], num_(a[2] + r[2]), num_(a[3] + r[3]), num_(a[4] + r[4])], ['TOTAL', 0, 0, 0, 0]);
  return { title: 'Trial balance', headers: ['Code', 'Lines', 'Debit (charges)', 'Credit (payments)', 'Net'], rows: rows.concat([tot]) };
}

/** Guest ledger: open folios of in-house guests with their balance. */
function eodGuestLedger_(c) {
  const inH = new Map(c.res.filter(r => r.status === 'In-House').map(r => [r.resNo, r]));
  const rows = c.folios.filter(f => f.status === 'Open' && inH.has(f.resNo)).map(f => {
    const ps = c.posts.filter(p => p.folioId === f.id);
    const dr = ps.filter(p => Number(p.amount) > 0).reduce((a, p) => a + Number(p.amount), 0);
    const cr = ps.filter(p => Number(p.amount) < 0).reduce((a, p) => a - Number(p.amount), 0);
    const r = inH.get(f.resNo);
    return [f.folioNo || f.id, r.resNo, r.guestName || '', r.roomNo || '', num_(dr), num_(cr), num_(dr - cr)];
  }).sort((a, b) => String(a[3]).localeCompare(String(b[3]), undefined, { numeric: true }));
  const tot = rows.reduce((a, r) => [a[0], '', 'TOTAL', '', num_(a[4] + r[4]), num_(a[5] + r[5]), num_(a[6] + r[6])], ['', '', 'TOTAL', '', 0, 0, 0]);
  return { title: 'Guest ledger', headers: ['Folio', 'Res #', 'Guest', 'Room', 'Charges', 'Payments', 'Balance'], rows: rows.concat(rows.length ? [tot] : []) };
}

/** Package ledger: packages sold on the business date (count and amount). */
function eodPackageLedger_(c) {
  const rows = rows_(TBL.PACKAGES).filter(p => p.active === true).map(p => {
    const ps = c.today.filter(x => x.code === p.chargeCode && String(x.description || '').indexOf(p.name) === 0 && Number(x.amount) > 0);
    return [p.code, p.name, ps.length, num_(ps.reduce((a, x) => a + Number(x.amount), 0))];
  }).filter(r => r[2] > 0);
  const tot = rows.reduce((a, r) => [a[0], a[1], a[2] + r[2], num_(a[3] + r[3])], ['TOTAL', '', 0, 0]);
  return { title: 'Package ledger', headers: ['Package', 'Name', 'Sold', 'Amount'], rows: rows.concat(rows.length ? [tot] : []) };
}

/** City ledger aging: balance owed by each company, split into age buckets. */
function eodAging_(c) {
  const rows = rows_(TBL.ACCOUNTS).map(a => {
    const it = arItems_(a.id);
    const b = arBuckets_(it.open);
    return [a.code, a.name, b.current, b.d31, b.d61, b.d90, num_(b.current + b.d31 + b.d61 + b.d90)];
  }).filter(r => r[6] !== 0);
  const tot = rows.reduce((a, r) => a.map((v, i) => i < 2 ? v : num_(v + r[i])), ['TOTAL', '', 0, 0, 0, 0, 0]);
  return { title: 'City ledger aging', headers: ['Code', 'Company', 'Current (0-30)', '31-60', '61-90', 'Over 90', 'Total'], rows: rows.concat(rows.length ? [tot] : []) };
}

/** The full end-of-day report: every section for the date. */
function eodReport_(bd) {
  const c = eodContext_(bd);
  return { title: 'End-of-day report · ' + bd, sections: EOD_SECTIONS.map(s => Object.assign({ key: s[0] }, s[2](c))) };
}

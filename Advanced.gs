/**
 * Stayline – Advanced.gs
 * Company accounts (direct bill / city ledger), cashier shifts with cash reconciliation,
 * printable folio (PDF), housekeeper assignment.
 */

/* ============================ COMPANY ACCOUNTS (CITY LEDGER) ============================ */
function accountFolios_(accId) { return rows_(TBL.FOLIOS).filter(f => f.accountId === accId); }
function accountBalance_(accId) {
  const ids = new Set(accountFolios_(accId).map(f => f.id));
  return num_(rows_(TBL.POSTINGS).filter(p => p.voided !== true && ids.has(p.folioId)).reduce((a, p) => a + Number(p.amount), 0));
}
function listAccounts(token) {
  auth_(token, 'accounts.view');
  return rows_(TBL.ACCOUNTS).map(a => ({ id: a.id, code: a.code, name: a.name, contact: a.contact || '', email: a.email || '',
    creditLimit: num_(a.creditLimit), active: a.active === true, balance: accountBalance_(a.id) }));
}
function getAccount(token, id) {
  auth_(token, 'accounts.view');
  const a = rows_(TBL.ACCOUNTS).find(x => x.id === id);
  if (!a) throw new Error('Account not found.');
  const folios = accountFolios_(id);
  const ids = new Set(folios.map(f => f.id));
  const postings = rows_(TBL.POSTINGS).filter(p => ids.has(p.folioId))
    .sort((x, y) => String(x.createdAt).localeCompare(String(y.createdAt)));
  return {
    account: a, balance: accountBalance_(id),
    folios: folios.map(f => ({ id: f.id, resNo: f.resNo, folioNo: Number(f.folioNo), name: f.name, status: f.status })),
    postings: postings.map(p => ({ bizDate: p.bizDate, resNo: p.resNo, code: p.code, description: p.description, amount: num_(p.amount), voided: p.voided === true, postedBy: p.postedBy }))
  };
}
function saveAccount(token, d) {
  const s = auth_(token, 'accounts.manage');
  const name = String(d.name || '').trim();
  if (!name) throw new Error('Account name is required.');
  return withLock_(() => {
    const code = String(d.code || '').trim().toUpperCase() || name.replace(/\W/g, '').slice(0, 6).toUpperCase();
    const ex = d.id ? rows_(TBL.ACCOUNTS).find(a => a.id === d.id) : null;
    const data = { code: code, name: name, contact: d.contact || '', email: d.email || '', creditLimit: num_(d.creditLimit),
      active: d.active !== false && d.active !== 'false' };
    if (ex) { patch_(TBL.ACCOUNTS, ex._row, data); audit_(s.username, 'ACCOUNT_UPDATED', 'Account', ex.id, name); return ex.id; }
    data.id = id_('AC'); data.createdAt = fmtTs_(new Date());
    append_(TBL.ACCOUNTS, data);
    audit_(s.username, 'ACCOUNT_CREATED', 'Account', data.id, name);
    return data.id;
  });
}
/** Bills an open folio to a company account (accountId '' = guest pays). */
function setFolioAccount(token, folioId, accountId) {
  const s = auth_(token, 'folio.post');
  return withLock_(() => {
    const f = folioRow_(folioId);
    if (f.status !== 'Open') throw new Error('Folio is closed.');
    if (accountId && !rows_(TBL.ACCOUNTS).find(x => x.id === accountId && x.active === true)) throw new Error('Account not found or inactive.');
    patch_(TBL.FOLIOS, f._row, { accountId: accountId || '' });
    audit_(s.username, 'FOLIO_ACCOUNT', 'Folio', folioId, accountId || 'guest pays');
    return true;
  });
}
/** Payment received from a company against its city ledger. */
function postAccountPayment(token, accId, code, amount, note) {
  const s = auth_(token, 'folio.post');
  const amt = num_(amount);
  if (!(amt > 0)) throw new Error('Amount must be greater than zero.');
  requireShift_(s);
  return withLock_(() => {
    if (!rows_(TBL.ACCOUNTS).find(x => x.id === accId)) throw new Error('Account not found.');
    const c = chargeCode_(code, PAY_TYPE);
    const resNo = 'ACC:' + accId;
    let ar = rows_(TBL.FOLIOS).find(f => f.resNo === resNo && f.status === 'Open');
    if (!ar) {
      ar = { id: id_('FO') };
      append_(TBL.FOLIOS, { id: ar.id, resNo: resNo, folioNo: 1, name: 'City ledger', status: 'Open', accountId: accId, createdAt: fmtTs_(new Date()), closedAt: '' });
    }
    postEntry_(resNo, '', ar.id, c.code, 'Account payment' + (note ? ': ' + note : ''), -amt, s.username, bizDate_(), '');
    audit_(s.username, 'ACCOUNT_PAYMENT', 'Account', accId, c.code + ' ' + amt);
    return { balance: accountBalance_(accId) };
  });
}

/* ============================ CASHIER SHIFTS ============================ */
function currentShift_(user) {
  return rows_(TBL.SHIFTS).find(s => s.user === user && s.status === 'Open') || null;
}
/** Payments taken by a cashier during a shift, grouped by method. */
function shiftSummary_(sh) {
  const end = sh.closedAt || fmtTs_(new Date());
  const ps = rows_(TBL.POSTINGS).filter(p => p.voided !== true && p.postedBy === sh.user && Number(p.amount) < 0 &&
    p.createdAt >= sh.openedAt && p.createdAt <= end);
  const byCode = {};
  ps.forEach(p => { byCode[p.code] = (byCode[p.code] || 0) + (-Number(p.amount)); });
  return {
    summary: Object.keys(byCode).sort().map(k => ({ code: k, amount: num_(byCode[k]) })),
    cashReceived: num_(byCode['CASH'] || 0)
  };
}
function myShift(token) {
  const s = auth_(token);
  const sh = currentShift_(s.username);
  if (!sh) return null;
  const x = shiftSummary_(sh);
  return { shift: sh, summary: x.summary, cashReceived: x.cashReceived };
}
function openShift(token, openingFloat) {
  const s = auth_(token, 'shifts.manage');
  return withLock_(() => {
    if (currentShift_(s.username)) throw new Error('You already have an open shift.');
    const id = id_('SH');
    append_(TBL.SHIFTS, { id: id, user: s.username, openedAt: fmtTs_(new Date()), closedAt: '', openingFloat: num_(openingFloat),
      expectedCash: '', countedCash: '', variance: '', status: 'Open', notes: '' });
    audit_(s.username, 'SHIFT_OPENED', 'Shift', id, 'float ' + num_(openingFloat));
    return id;
  });
}
/** Closes the shift: expected cash = opening float + cash received; variance = counted - expected. */
function closeShift(token, countedCash) {
  const s = auth_(token, 'shifts.manage');
  return withLock_(() => {
    const sh = currentShift_(s.username);
    if (!sh) throw new Error('You have no open shift.');
    const cash = shiftSummary_(sh).cashReceived;
    const expected = num_(Number(sh.openingFloat) + cash);
    const counted = num_(countedCash);
    const variance = num_(counted - expected);
    patch_(TBL.SHIFTS, sh._row, { closedAt: fmtTs_(new Date()), expectedCash: expected, countedCash: counted, variance: variance, status: 'Closed' });
    audit_(s.username, 'SHIFT_CLOSED', 'Shift', sh.id, 'expected ' + expected + ' counted ' + counted + ' variance ' + variance);
    return { expected: expected, counted: counted, variance: variance };
  });
}
function listShifts(token) {
  const s = auth_(token);
  const p = permMap_(s.role);
  if (!p['shifts.view'] && !p['shifts.manage']) throw new Error('Permission denied: shifts.view');
  return rows_(TBL.SHIFTS).filter(x => p['shifts.view'] || x.user === s.username)
    .sort((a, b) => String(b.openedAt).localeCompare(String(a.openedAt))).slice(0, 200)
    .map(x => ({ id: x.id, user: x.user, openedAt: x.openedAt, closedAt: x.closedAt, openingFloat: num_(x.openingFloat),
      expectedCash: x.expectedCash === '' ? '' : num_(x.expectedCash), countedCash: x.countedCash === '' ? '' : num_(x.countedCash),
      variance: x.variance === '' ? 0 : num_(x.variance), status: x.status }));
}

/* ============================ PRINTABLE FOLIO (PDF) ============================ */
function exportFolioPdf(token, resNo) {
  const s = auth_(token, 'folio.view');
  const d = getReservation(token, resNo);
  const st = settings_();
  const esc = x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const m = v => Number(v || 0).toFixed(2);
  const r = d.res;
  let body = '';
  (d.folios || []).forEach(f => {
    const rows = f.postings.map(p => '<tr style="' + (p.voided ? 'color:#999;text-decoration:line-through' : '') + '"><td>' + esc(p.bizDate) + '</td><td>' +
      esc(p.code) + '</td><td>' + esc(p.description) + '</td><td style="text-align:right">' + m(p.amount) + '</td><td>' + (p.voided ? 'VOID' : '') + '</td></tr>').join('');
    body += '<h3>Folio ' + f.folioNo + ' · ' + esc(f.name) + ' (' + esc(f.status) + ')</h3>' +
      '<table><tr><th>Date</th><th>Code</th><th>Description</th><th>Amount</th><th></th></tr>' + rows + '</table>' +
      '<p><b>Folio balance: ' + m(f.balance) + ' ' + esc(st.currency) + '</b></p>';
  });
  const html = '<html><head><style>body{font-family:Arial,sans-serif;font-size:11px}h1{font-size:18px;margin:0}' +
    'table{border-collapse:collapse;width:100%;margin:6px 0}td,th{border:1px solid #999;padding:4px}th{background:#e6efef;text-align:left}</style></head><body>' +
    hotelLogoHtml_(st) +
    '<h1>' + esc(st.hotelName) + '</h1>' + (st.hotelAddress ? '<div>' + esc(st.hotelAddress) + '</div>' : '') +
    '<h2>Guest folio · ' + esc(r.resNo) + '</h2>' +
    '<table><tr><td><b>Guest</b></td><td>' + esc(d.guestName) + '</td><td><b>Room</b></td><td>' + esc(d.room.roomNo) + ' · ' + esc(d.room.type) + '</td></tr>' +
    '<tr><td><b>Arrival</b></td><td>' + esc(r.arrival) + '</td><td><b>Departure</b></td><td>' + esc(r.departure) + '</td></tr>' +
    '<tr><td><b>Status</b></td><td>' + esc(r.status) + '</td><td><b>Plan</b></td><td>' + esc(r.plan) + '</td></tr></table>' +
    body + '<h2>Total balance: ' + m(d.balance) + ' ' + esc(st.currency) + '</h2>' +
    '<p>Printed ' + fmtTs_(new Date()) + ' by ' + esc(s.name) + '</p></body></html>';
  const blob = HtmlService.createHtmlOutput(html).getAs('application/pdf');
  audit_(s.username, 'FOLIO_PRINTED', 'Reservation', resNo, '');
  return { name: 'Folio_' + resNo + '.pdf', base64: Utilities.base64Encode(blob.getBytes()) };
}

/* ============================ REGISTRATION CARD (PDF) ============================ */
/** Guest registration card printed at check-in: guest details, stay, rates and signature lines. */
function registrationCard(token, resNo) {
  const s = auth_(token, 'reservations.view');
  const d = getReservation(token, resNo);
  const r = d.res, g = d.guest || {}, st = settings_();
  const esc = x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const m = v => Number(v || 0).toFixed(2);
  const nights = Math.max(0, Math.round((new Date(r.departure) - new Date(r.arrival)) / 86400000));
  const rateRows = (d.rates || []).map(x => '<tr><td>' + esc(x.date) + '</td><td style="text-align:right">' + m(x.rate) + '</td></tr>').join('') ||
    '<tr><td colspan="2">Rate as quoted at booking</td></tr>';
  const field = (label, value) => '<td class="lbl">' + esc(label) + '</td><td class="val">' + esc(value || '') + '</td>';
  const html = '<html><head><style>body{font-family:Arial,sans-serif;font-size:11px;color:#111}h1{font-size:17px;margin:0}' +
    'h2{font-size:13px;margin:14px 0 4px;color:#0f3d3e}table{border-collapse:collapse;width:100%}' +
    'td{border:1px solid #999;padding:5px}td.lbl{background:#eef4f3;width:17%;font-weight:bold}td.val{width:33%}' +
    '.sig td{height:42px;vertical-align:bottom}.small{font-size:9.5px;color:#444;margin-top:8px}</style></head><body>' +
    hotelLogoHtml_(st) +
    '<h1>' + esc(st.hotelName) + '</h1>' + (st.hotelAddress ? '<div>' + esc(st.hotelAddress) + '</div>' : '') +
    '<h2>GUEST REGISTRATION CARD · ' + esc(r.resNo) + '</h2>' +
    '<table><tr>' + field('Guest name', d.guestName) + field('Title', g.title) + '</tr>' +
    '<tr>' + field('Nationality', g.nationality) + field('Date of birth', g.dob) + '</tr>' +
    '<tr>' + field('ID type', g.idType) + field('ID / passport no.', g.idNo) + '</tr>' +
    '<tr>' + field('Phone', g.phone) + field('Email', g.email) + '</tr>' +
    '<tr>' + field('Company', g.company || r.company) + field('Channel', r.channel) + '</tr></table>' +
    '<h2>STAY</h2><table>' +
    '<tr>' + field('Arrival', r.arrival) + field('Departure', r.departure) + '</tr>' +
    '<tr>' + field('Nights', nights) + field('Adults', r.adults) + '</tr>' +
    '<tr>' + field('Room', d.room.roomNo) + field('Room type', d.room.type) + '</tr>' +
    '<tr>' + field('Rate plan', r.plan) + field('Status', r.status) + '</tr></table>' +
    '<h2>NIGHTLY RATES</h2><table><tr><th style="text-align:left">Night</th><th style="text-align:right">Rate (' + esc(st.currency) + ')</th></tr>' + rateRows + '</table>' +
    '<h2>GUEST DECLARATION</h2>' +
    '<div class="small">I confirm the details above are correct. I agree to the hotel\'s terms of stay. I am responsible for all charges on my folio, and charges to any company or account I have authorised. Valuables may be placed in the in-room safe; the hotel is not liable for unlocked valuables.</div>' +
    '<table class="sig" style="margin-top:14px"><tr><td style="width:50%">Guest signature</td><td>Date</td></tr>' +
    '<tr><td>Registered by (' + esc(s.name) + ')</td><td>' + esc(st.businessDate || '') + '</td></tr></table>' +
    '</body></html>';
  const blob = HtmlService.createHtmlOutput(html).getAs('application/pdf');
  audit_(s.username, 'REG_CARD_PRINTED', 'Reservation', resNo, '');
  return { name: 'Registration_' + resNo + '.pdf', base64: Utilities.base64Encode(blob.getBytes()) };
}

/* ============================ HOUSEKEEPING ASSIGNMENT ============================ */
function setRoomAssignment(token, roomNo, name) {
  const s = auth_(token);
  if (!anyPerm_(s, ['housekeeping.update', 'rooms.manage'])) throw new Error('Permission denied: housekeeping.update');
  return withLock_(() => {
    const r = findRoom_(roomNo);
    patch_(TBL.ROOMS, r._row, { assignedTo: String(name || '').trim().slice(0, 40) });
    audit_(s.username, 'HK_ASSIGN', 'Room', roomNo, name || 'unassigned');
    return true;
  });
}
/** Active staff with the Housekeeping role, for the assignment dropdown. */
function housekeeperNames(token) {
  auth_(token);
  return rows_(TBL.USERS).filter(u => u.role === 'Housekeeping' && u.active === true).map(u => u.name || u.username);
}

/* ============================ SHARED GUARDS & HELPERS ============================ */
/** Cashiers must have an open shift before taking money. Other roles are not affected. */
function requireShift_(s) {
  if (s.role === 'Cashier' && !currentShift_(s.username)) throw new Error('Open your cashier shift before taking payments.');
}
/** Refuses a charge that would take a company account over its credit limit (limit 0 = no limit). */
function assertCredit_(accId, addAmt) {
  const a = rows_(TBL.ACCOUNTS).find(x => x.id === accId);
  if (!a) throw new Error('Company account not found.');
  if (a.active !== true) throw new Error('Company account ' + a.name + ' is inactive.');
  const lim = num_(a.creditLimit);
  if (lim > 0 && accountBalance_(accId) + num_(addAmt) > lim + 0.005) {
    throw new Error('Credit limit ' + lim.toFixed(2) + ' for ' + a.name + ' would be exceeded.');
  }
}

/* ============================ LATE CHECKOUT ============================ */
/** Charges a late-checkout fee (code LCO, taxed like other room-related charges) to the in-house guest's folio. */
function lateCheckoutCharge(token, resNo, amount) {
  const s = auth_(token, 'folio.post');
  const amt = num_(amount);
  if (!(amt > 0)) throw new Error('Amount must be greater than zero.');
  return withLock_(() => {
    const r = findRes_(resNo);
    if (r.status !== 'In-House') throw new Error('Late checkout can only be charged to an in-house guest.');
    chargeCode_('LCO', CHARGE_TYPE);
    postWithTax_(r.resNo, r.roomNo, folio1_(r.resNo), 'LCO', 'Late checkout', amt, s.username, bizDate_());
    audit_(s.username, 'LATE_CHECKOUT', 'Reservation', resNo, amt);
    return { balance: guestBalance_(r.resNo) };
  });
}

/* ============================ 14-DAY OCCUPANCY FORECAST ============================ */
/** Rooms sold and occupancy % for each of the next `days` nights from the business date. */
function occupancyForecast(token, days) {
  auth_(token, 'dashboard.view');
  const n = Math.min(Math.max(Number(days) || 14, 1), 31);
  const bd = bizDate_();
  const rooms = roomsAll_().filter(r => r.status === 'Active').length;
  const res = rows_(TBL.RES).filter(r => RES_ACTIVE.indexOf(r.status) >= 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = addDays_(bd, i);
    const sold = res.filter(r => r.arrival <= d && d < r.departure).length;
    out.push({ date: d, sold: sold, rooms: rooms, pct: rooms ? Math.round(sold / rooms * 100) : 0 });
  }
  return out;
}

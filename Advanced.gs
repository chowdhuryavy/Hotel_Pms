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
  const s = auth_(token, 'cfg.accounts.edit');
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

/* Printable documents (folio, registration card, company folio, statements, receipts): see Documents.gs */

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
  const s0 = auth_(token);
  if (!anyPerm_(s0, ['housekeeping.update', 'rooms.manage'])) throw new Error('Permission denied: housekeeping.update');
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

/** Everything the dashboard shows, in one server call (each part keeps its own permission check). */
function dashboardData(token, from7, bd) {
  const s = auth_(token);
  const p = permMap_(s.role);
  const part = fn => { try { return fn(); } catch (e) { return { error: e.message }; } };
  const canBoard = p['frontdesk.checkin'] === true || p['frontdesk.checkout'] === true;
  const canReports = p['reports.view'] === true;
  return {
    board: canBoard ? part(() => frontDeskBoard(token)) : null,
    flash: canReports ? part(() => runReport(token, 'flash', '', '')) : null,
    forecast: p['dashboard.view'] === true ? part(() => occupancyForecast(token, 14)) : null,
    nightaudit: canReports ? part(() => runReport(token, 'nightaudit', from7, bd)) : null
  };
}

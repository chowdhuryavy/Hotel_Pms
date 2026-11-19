/* ============================ BILLING, PACKAGES, SEARCH, GUEST HISTORY, INTEGRATIONS ============================
 * Billing: every in-house or reserved room opens its own billing screen, where any charge code, package
 * or payment can be posted to its folios.
 * Integrations: POS, television, telephone and card terminal. Each one is configured in System settings
 * with an address. Calls are JSON POSTs carrying the X-Stayline-Key header (the INTEGRATION_KEY script property).
 */
const INTEGRATIONS = {
  pos:   { label: 'POS (restaurant and bar)', urlKey: 'intPosUrl',   actions: ['ping', 'postCharge'] },
  tv:    { label: 'Television (guest TV)',    urlKey: 'intTvUrl',    actions: ['ping', 'welcome', 'checkout'] },
  phone: { label: 'Telephone (PBX)',          urlKey: 'intPhoneUrl', actions: ['ping', 'setGuest', 'wakeUp', 'checkout'] },
  card:  { label: 'Card terminal',            urlKey: 'intCardUrl',  actions: ['ping', 'authorize', 'refund'] }
};

/* ---------- Packages (a fixed price per stay or per night, posted to a charge code) ---------- */
function listPackages(token) {
  auth_(token, 'folio.view');
  return rows_(TBL.PACKAGES).map(p => ({ code: p.code, name: p.name, description: p.description || '', chargeCode: p.chargeCode,
    amount: num_(p.amount), perNight: p.perNight === true, active: p.active === true }));
}
function savePackage(token, d) {
  const s = auth_(token, 'cfg.packages.edit');
  const code = String(d.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,12}$/.test(code)) throw new Error('Package code: 2 to 12 letters, numbers, - or _.');
  if (!String(d.name || '').trim()) throw new Error('Package name is required.');
  chargeCode_(String(d.chargeCode || ''), CHARGE_TYPE);
  const amount = num_(d.amount);
  if (amount < 0) throw new Error('Amount cannot be negative.');
  const data = { code: code, name: String(d.name).trim(), description: String(d.description || ''), chargeCode: d.chargeCode,
    amount: amount, perNight: d.perNight === true || d.perNight === 'true', active: d.active !== false && d.active !== 'false' };
  return withLock_(() => {
    const ex = rows_(TBL.PACKAGES).find(x => x.code === code);
    if (ex) patch_(TBL.PACKAGES, ex._row, data); else append_(TBL.PACKAGES, data);
    audit_(s.username, 'PACKAGE_SAVED', 'Package', code, data.name);
    return { code: code };
  });
}
/** Posts a package to the stay: its amount, times the nights when it is per night. */
function postPackage(token, resNo, code, folioId) {
  const s = auth_(token, 'folio.post');
  const p = rows_(TBL.PACKAGES).find(x => x.code === code && x.active === true);
  if (!p) throw new Error('Unknown or inactive package: ' + code);
  const r = findRes_(resNo);
  if (r.status !== 'In-House') throw new Error('Packages can only be posted to in-house guests.');
  const f = folioId ? folioRow_(folioId) : rows_(TBL.FOLIOS).find(x => x.resNo === r.resNo && x.status === 'Open');
  if (!f || f.resNo !== r.resNo || f.status !== 'Open') throw new Error('Open a folio for this stay first.');
  const nights = p.perNight === true ? Math.max(1, nights_(r.arrival, r.departure)) : 1;
  const total = num_(Number(p.amount) * nights);
  postCharge(token, f.id, p.chargeCode, p.name + (p.perNight === true ? ' x ' + nights + ' night(s)' : ''), total);
  audit_(s.username, 'PACKAGE_POSTED', 'Reservation', r.resNo, p.code + ' ' + total);
  return { total: total, nights: nights };
}

/* ---------- Billing: one screen per room ---------- */
/** Every active room with its current stay and balance. */
function billingRooms(token) {
  auth_(token, 'folio.view');
  const res = rows_(TBL.RES).filter(r => r.status === 'In-House' || r.status === 'Reserved');
  const bal = balances_();
  return rows_(TBL.ROOMS).filter(x => x.active === true).sort((a, b) => String(a.roomNo).localeCompare(String(b.roomNo), undefined, { numeric: true }))
    .map(room => {
      const r = res.filter(x => String(x.roomNo) === String(room.roomNo)).sort((a, b) => (a.status === 'In-House' ? -1 : 1))[0];
      return { roomNo: String(room.roomNo), type: room.type, status: room.status, housekeeping: room.housekeeping || '',
        resNo: r ? r.resNo : '', guest: r ? r.guestName : '', stay: r ? r.status : '', balance: r ? num_(bal[r.resNo] || 0) : 0 };
    });
}
/** The billing screen for one room: its stay with folios and postings, and what can be posted. */
function billingRoom(token, roomNo) {
  const s = auth_(token, 'folio.view');
  const rs = rows_(TBL.RES).filter(x => String(x.roomNo) === String(roomNo) && RES_ACTIVE.indexOf(x.status) >= 0)
    .sort((a, b) => (a.status === 'In-House' ? -1 : 1) - (b.status === 'In-House' ? -1 : 1));
  const codes = listChargeCodes(token);
  const out = { roomNo: String(roomNo), res: null,
    charges: codes.filter(c => c.type === CHARGE_TYPE && c.active),
    payments: codes.filter(c => c.type === PAY_TYPE && c.active),
    packages: listPackages(token).filter(p => p.active),
    types: codes.reduce((m, c) => { m[c.code] = c.type; return m; }, {}),
    canPost: permMap_(s.role)['folio.post'] === true };
  if (rs.length) out.res = getReservation(token, rs[0].resNo);
  return out;
}

/* ---------- Search: room, guest name, reservation (communication) number, group, company, phone, email ---------- */
function globalSearch(token, q) {
  auth_(token, 'reservations.view');
  const t = String(q || '').trim().toLowerCase();
  const none = { reservations: [], rooms: [], groups: [], companies: [], guests: [] };
  if (t.length < 2) return none;
  const hit = (...vals) => vals.some(v => String(v == null ? '' : v).toLowerCase().indexOf(t) >= 0);
  const guests = rows_(TBL.GUESTS), byId = {};
  guests.forEach(g => { byId[g.id] = g; });
  return {
    reservations: rows_(TBL.RES).filter(r => { const g = byId[r.guestId] || {}; return hit(r.resNo, r.guestName, r.roomNo, r.groupId, r.company, g.phone, g.email, g.idNo); })
      .slice(0, 50).map(r => ({ resNo: r.resNo, status: r.status, guestName: r.guestName, roomNo: String(r.roomNo), arrival: r.arrival, departure: r.departure, groupId: r.groupId || '', company: r.company || '' })),
    rooms: rows_(TBL.ROOMS).filter(x => hit(x.roomNo, x.type)).slice(0, 50).map(x => ({ roomNo: String(x.roomNo), type: x.type, status: x.status })),
    groups: rows_(TBL.GROUPS).filter(g => hit(g.id, g.name, g.contact)).slice(0, 50).map(g => ({ id: g.id, name: g.name, arrival: g.arrival, departure: g.departure, status: g.status })),
    companies: rows_(TBL.ACCOUNTS).filter(a => hit(a.name, a.code, a.contact, a.email)).slice(0, 50).map(a => ({ id: a.id, code: a.code, name: a.name, active: a.active === true })),
    guests: guests.filter(g => hit(guestName_(g), g.phone, g.email, g.idNo, g.company)).slice(0, 50)
      .map(g => ({ id: g.id, name: guestName_(g), phone: g.phone || '', email: g.email || '', nationality: g.nationality || '', vip: g.vip === true }))
  };
}

/* ---------- Guest history: every stay of the same guest ---------- */
function guestHistory(token, guestId) {
  auth_(token, 'reservations.view');
  const g = rows_(TBL.GUESTS).find(x => x.id === guestId);
  if (!g) throw new Error('Guest not found.');
  const bal = balances_();
  const stays = rows_(TBL.RES).filter(r => r.guestId === guestId).sort((a, b) => String(b.arrival).localeCompare(String(a.arrival)));
  return {
    guest: { id: g.id, name: guestName_(g), vip: g.vip === true, phone: g.phone || '', email: g.email || '', nationality: g.nationality || '' },
    stays: stays.map(r => ({ resNo: r.resNo, status: r.status, arrival: r.arrival, departure: r.departure, roomNo: String(r.roomNo),
      roomType: r.roomType, company: r.company || '', balance: num_(bal[r.resNo] || 0) })),
    nights: stays.filter(r => r.status !== 'Cancelled' && r.status !== 'No-Show').reduce((a, r) => a + Math.max(0, nights_(r.arrival, r.departure)), 0)
  };
}

/* ---------- Integrations ---------- */
function integrationUrl_(channel) {
  const cfg = INTEGRATIONS[channel];
  if (!cfg) throw new Error('Unknown integration: ' + channel);
  return { cfg: cfg, url: String(settings_()[cfg.urlKey] || '').trim() };
}
/** Sends one action to an external system and returns its JSON reply. */
function callIntegration_(channel, action, payload) {
  const x = integrationUrl_(channel);
  if (x.cfg.actions.indexOf(action) < 0) throw new Error(x.cfg.label + ' does not support ' + action + '.');
  if (!x.url) throw new Error(x.cfg.label + ' is not connected. Add its address in Administration → System.');
  const key = PropertiesService.getScriptProperties().getProperty('INTEGRATION_KEY') || '';
  const res = UrlFetchApp.fetch(x.url, { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'X-Stayline-Key': key }, payload: JSON.stringify({ channel: channel, action: action, payload: payload || {}, sentAt: fmtTs_(new Date()) }) });
  const code = res.getResponseCode();
  if (code >= 300) throw new Error(x.cfg.label + ' answered HTTP ' + code + '.');
  let reply = {};
  try { reply = JSON.parse(res.getContentText() || '{}'); } catch (e) { reply = { raw: res.getContentText() }; }
  return reply;
}
/** System admin: checks that an integration answers. */
function integrationTest(token, channel) {
  const s = auth_(token, 'system.manage');
  const reply = callIntegration_(channel, 'ping', {});
  audit_(s.username, 'INTEGRATION_TEST', 'Integration', channel, 'ok');
  return { ok: true, reply: reply };
}
/** Inbound POS charge: posts to the open folio of the in-house guest in the room. Called from doPost. */
function postPosCharge_(roomNo, code, description, amount) {
  return withLock_(() => {
    const r = rows_(TBL.RES).find(x => x.status === 'In-House' && String(x.roomNo) === String(roomNo));
    if (!r) throw new Error('No in-house guest in room ' + roomNo + '.');
    const f = rows_(TBL.FOLIOS).find(x => x.resNo === r.resNo && x.status === 'Open');
    if (!f) throw new Error('No open folio for room ' + roomNo + '.');
    const amt = num_(amount);
    if (!(amt > 0)) throw new Error('Amount must be greater than zero.');
    const c = chargeCode_(code, CHARGE_TYPE), bd = bizDate_();
    const parent = postEntry_(r.resNo, r.roomNo, f.id, c.code, description || c.description, amt, 'POS', bd, '');
    if (c.taxable === true && settings_().taxRate > 0) postEntry_(r.resNo, r.roomNo, f.id, 'TAX', 'Tax on ' + c.code, amt * settings_().taxRate, 'POS', bd, parent);
    audit_('POS', 'CHARGE', 'Reservation', r.resNo, c.code + ' ' + amt);
    return { resNo: r.resNo, folioNo: Number(f.folioNo) };
  });
}

/* ---------- Payment methods: cash, card, bank, cheque, and city ledger (AR) linked to a company account ---------- */
const PAY_KINDS = ['Cash', 'Card', 'Bank transfer', 'Cheque', 'City ledger', 'Other'];
function listPaymentMethods(token) {
  auth_(token, 'folio.view');
  return rows_(TBL.PAYMETHODS).map(m => ({ code: m.code, name: m.name, kind: m.kind, chargeCode: m.chargeCode || '', accountId: m.accountId || '', active: m.active === true }));
}
function savePaymentMethod(token, d) {
  const s = auth_(token, 'cfg.payments.edit');
  const code = String(d.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,12}$/.test(code)) throw new Error('Method code: 2 to 12 letters, numbers, - or _.');
  if (!String(d.name || '').trim()) throw new Error('Method name is required.');
  if (PAY_KINDS.indexOf(d.kind) < 0) throw new Error('Choose a kind of payment.');
  if (d.kind !== 'City ledger') chargeCode_(String(d.chargeCode || ''), PAY_TYPE);       // posts with a Payment charge code
  if (d.accountId && !rows_(TBL.ACCOUNTS).find(a => a.id === d.accountId)) throw new Error('Company account not found.');
  const data = { code: code, name: String(d.name).trim(), kind: d.kind, chargeCode: d.kind === 'City ledger' ? '' : d.chargeCode,
    accountId: d.kind === 'City ledger' ? (d.accountId || '') : '', active: d.active !== false && d.active !== 'false' };
  return withLock_(() => {
    const ex = rows_(TBL.PAYMETHODS).find(x => x.code === code);
    if (ex) patch_(TBL.PAYMETHODS, ex._row, data); else append_(TBL.PAYMETHODS, data);
    audit_(s.username, 'PAYMENT_METHOD_SAVED', 'PaymentMethod', code, data.kind);
    return { code: code };
  });
}
/** Takes a payment by method. City ledger links the folio to the company account instead of taking money. */
function paymentByMethod(token, folioId, methodCode, amount, accountId) {
  const s = auth_(token, 'folio.post');
  const m = rows_(TBL.PAYMETHODS).find(x => x.code === methodCode && x.active === true);
  if (!m) throw new Error('Unknown or inactive payment method: ' + methodCode);
  if (m.kind === 'City ledger') {
    const acc = accountId || m.accountId;
    if (!acc) throw new Error('Choose the company account for this city ledger payment.');
    setFolioAccount(token, folioId, acc);
    audit_(s.username, 'BILLED_TO_ACCOUNT', 'Folio', folioId, acc);
    return { billedTo: acc };
  }
  return postPayment(token, folioId, m.chargeCode, amount);
}

/* ---------- Refunds: a payment is refunded in part or in full, and the refund is kept against it ---------- */
function refundPayment(token, postingId, amount, reason) {
  const s = auth_(token, 'folio.refund');
  const p = rows_(TBL.POSTINGS).find(x => x.id === postingId);
  if (!p || p.voided === true) throw new Error('Payment not found.');
  if (Number(p.amount) >= 0) throw new Error('Only payments can be refunded.');
  const paid = Math.abs(Number(p.amount));
  const done = num_(rows_(TBL.POSTINGS).filter(x => x.parentId === postingId && x.voided !== true).reduce((a, x) => a + Number(x.amount), 0));
  const amt = num_(amount);
  if (!(amt > 0)) throw new Error('Refund amount must be greater than zero.');
  if (amt > num_(paid - done)) throw new Error('Only ' + num_(paid - done) + ' is left to refund on this payment.');
  return withLock_(() => {
    const f = folioRow_(p.folioId);
    if (f.status !== 'Open') throw new Error('Folio is closed.');
    postEntry_(p.resNo, p.roomNo, p.folioId, p.code, 'Refund: ' + (String(reason || '').trim() || p.description), amt, s.username, bizDate_(), postingId);
    audit_(s.username, 'REFUND', 'Reservation', p.resNo, p.code + ' ' + amt);
    return { refunded: num_(done + amt) };
  });
}

/* ---------- Guest lists for the front office: in-house, arrivals, departures ---------- */
function frontLists(token, date) {
  auth_(token, 'reservations.view');
  const bd = date || bizDate_();
  const bal = balances_();
  const map = r => ({ resNo: r.resNo, guestName: r.guestName, roomNo: String(r.roomNo || ''), roomType: r.roomType, status: r.status,
    arrival: r.arrival, departure: r.departure, company: r.company || '', vip: r.vip === true, groupId: r.groupId || '', balance: num_(bal[r.resNo] || 0) });
  const byRoom = (a, b) => String(a.roomNo).localeCompare(String(b.roomNo), undefined, { numeric: true });
  const res = rows_(TBL.RES);
  return {
    bizDate: bd,
    inHouse: res.filter(r => r.status === 'In-House').map(map).sort(byRoom),
    arrivals: res.filter(r => r.status === 'Reserved' && r.arrival === bd).map(map).sort(byRoom),
    departures: res.filter(r => r.status === 'In-House' && r.departure === bd).map(map).sort(byRoom)
  };
}

/* ---------- Auditor: night audit and AR reports by email after each night audit ---------- */
function reportTableHtml_(rep) {
  const e = x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tbl = (headers, rows) => '<table border="1" cellpadding="4" style="border-collapse:collapse;font-size:12px"><tr>' +
    headers.map(h => '<th style="background:#e6efef;text-align:left">' + e(h) + '</th>').join('') + '</tr>' +
    rows.map(r => '<tr>' + r.map(c => '<td>' + e(typeof c === 'number' ? c.toFixed(2) : c) + '</td>').join('') + '</tr>').join('') + '</table>';
  if (!rep.sections) return '<h3>' + e(rep.title) + '</h3>' + tbl(rep.headers, rep.rows);
  return '<h3>' + e(rep.title) + '</h3>' + rep.sections.map(s => '<h4>' + e(s.title) + '</h4>' + tbl(s.headers, s.rows)).join('');
}
function sendAuditorReport_(bd) {
  const st = settings_();
  if (!st.auditorEmail || !flag_('auditorAutoSend')) return;
  const body = reportTableHtml_(buildReport_('nightaudit', bd, bd)) + reportTableHtml_(buildReport_('ar', bd, bd));
  sendMail_(st.auditorEmail, 'Night audit ' + bd + ' · ' + st.hotelName, 'Night audit and city ledger reports for ' + bd + ' are attached below.',
    mailHtml_('<p>Night audit and city ledger reports for ' + escHtml_(bd) + '.</p>' + body));
}

/* ---------- Charges: edit, split and move (payments are never changed here) ---------- */
function isCharge_(code) {
  const c = rows_(TBL.CHARGES).find(x => x.code === code);
  return !!c && c.type === CHARGE_TYPE;
}
/** The charge row that an edit or split works on. Tax lines and payments are refused. */
function chargeRow_(id) {
  const p = rows_(TBL.POSTINGS).find(x => x.id === id);
  if (!p || p.voided === true) throw new Error('Posting not found or already voided.');
  if (p.parentId) throw new Error('Tax lines follow their charge. Edit or split the charge instead.');
  if (!isCharge_(p.code)) throw new Error('Only charges can be edited or split. Payments are not changed here.');
  return p;
}
function taxLinesOf_(id) {
  return rows_(TBL.POSTINGS).filter(c => c.parentId === id && c.voided !== true);
}

/** Changes the amount and/or description of a charge. Tax is recalculated. A reason is required. */
function editCharge(token, postingId, d) {
  const s = auth_(token, 'folio.edit');
  const reason = String((d && d.reason) || '').trim();
  if (!reason) throw new Error('A reason is required to change a charge.');
  const amt = num_(d && d.amount);
  if (!(amt > 0)) throw new Error('Amount must be greater than zero.');
  return withLock_(() => {
    const p = chargeRow_(postingId);
    const f = folioRow_(p.folioId);
    if (f.status !== 'Open') throw new Error('Folio is closed.');
    const desc = String((d && d.description) || '').trim() || p.description;
    const rate = settings_().taxRate;
    const tax = taxLinesOf_(postingId);
    const oldGross = num_(p.amount) + tax.reduce((a, t) => a + num_(t.amount), 0);
    const newGross = amt + (tax.length ? amt * rate : 0);
    if (f.accountId && newGross > oldGross) assertCredit_(f.accountId, newGross - oldGross);
    const before = p.amount + ' ' + p.description;
    patch_(TBL.POSTINGS, p._row, { amount: amt, description: desc });
    tax.forEach(t => patch_(TBL.POSTINGS, t._row, { amount: amt * rate, description: 'Tax on ' + p.code }));
    audit_(s.username, 'EDIT_CHARGE', 'Posting', postingId, before + ' > ' + amt + ' ' + desc + ' | ' + reason);
    return { balance: num_(balances_()[p.resNo] || 0) };
  });
}

/**
 * Splits a charge into parts. Each part can go to any open folio of an active stay
 * (room or postmaster). The parts must add up to the original amount. The original is voided.
 */
function splitPosting(token, postingId, parts, reason) {
  const s = auth_(token, 'folio.edit');
  if (!String(reason || '').trim()) throw new Error('A reason is required to split a charge.');
  if (!Array.isArray(parts) || parts.length < 2) throw new Error('A split needs at least two parts.');
  return withLock_(() => {
    const p = chargeRow_(postingId);
    if (folioRow_(p.folioId).status !== 'Open') throw new Error('Folio is closed.');
    const clean = parts.map(x => ({ folioId: String((x && x.folioId) || ''), amount: num_(x && x.amount), description: String((x && x.description) || '').trim() }));
    if (clean.some(x => !(x.amount > 0))) throw new Error('Every part needs an amount greater than zero.');
    const total = num_(p.amount);
    const sum = clean.reduce((a, x) => a + x.amount, 0);
    if (Math.abs(sum - total) > 0.005) throw new Error('Parts add up to ' + sum.toFixed(2) + ' but the charge is ' + total.toFixed(2) + '.');
    const targets = clean.map(x => {
      const f = folioRow_(x.folioId);
      if (f.status !== 'Open') throw new Error('Folio ' + f.folioNo + ' is closed.');
      const r = resOf_(f.resNo);
      if (!r || RES_ACTIVE.indexOf(r.status) < 0) throw new Error('Folio ' + f.folioNo + ' must belong to a Reserved or In-House stay.');
      return { f: f, r: r };
    });
    const rate = settings_().taxRate;
    const hasTax = taxLinesOf_(postingId).length > 0;
    targets.forEach((t, i) => { if (t.f.accountId) assertCredit_(t.f.accountId, clean[i].amount * (hasTax ? 1 + rate : 1)); });
    if (closedDate_(p.bizDate)) throw new Error('Business date ' + String(p.bizDate).slice(0, 10) + ' is closed by the night audit. Its postings are frozen.');
    const bd = p.bizDate || bizDate_();
    const newIds = clean.map((x, i) => {
      const t = targets[i];
      const desc = x.description || (p.description + ' (' + (i + 1) + '/' + clean.length + ')');
      const parent = postEntry_(t.r.resNo, t.r.roomNo, t.f.id, p.code, desc, x.amount, s.username, bd, '');
      if (hasTax) postEntry_(t.r.resNo, t.r.roomNo, t.f.id, 'TAX', 'Tax on ' + p.code, x.amount * rate, s.username, bd, parent);
      return parent;
    });
    const tag = 'Split into ' + clean.length + ' parts: ' + reason + ' (by ' + s.username + ')';
    patch_(TBL.POSTINGS, p._row, { voided: true, voidReason: tag });
    taxLinesOf_(postingId).forEach(t => patch_(TBL.POSTINGS, t._row, { voided: true, voidReason: tag }));
    audit_(s.username, 'SPLIT', 'Posting', postingId, p.code + ' ' + total.toFixed(2) + ' > ' + clean.map(x => x.amount.toFixed(2)).join(' + ') + ' | ' + reason);
    return { ids: newIds };
  });
}

/**
 * Posting window search: find an in-house or reserved stay by guest name, reservation number,
 * room, phone, e-mail, company or group. Returns the first 30 matches, ordered by room.
 */
function billingSearch(token, by, text) {
  auth_(token, 'folio.view');
  const q = String(text || '').trim().toLowerCase();
  if (!q) return [];
  const guests = {};
  rows_(TBL.GUESTS).forEach(g => { guests[g.id] = g; });
  const hay = {
    guest: (r, g) => [r.guestName, g.firstName, g.lastName].join(' '),
    resNo: r => r.resNo,
    room: r => r.roomNo,
    phone: (r, g) => g.phone,
    email: (r, g) => g.email,
    company: r => r.company,
    group: r => r.groupId
  };
  const field = hay[by];
  if (!field) throw new Error('Unknown search.');
  return rows_(TBL.RES)
    .filter(r => RES_ACTIVE.indexOf(r.status) >= 0)
    .filter(r => String(field(r, guests[r.guestId] || {}) || '').toLowerCase().indexOf(q) >= 0)
    .sort((a, b) => String(a.roomNo || '').localeCompare(String(b.roomNo || ''), undefined, { numeric: true }))
    .slice(0, 30)
    .map(r => {
      const g = guests[r.guestId] || {};
      return { resNo: r.resNo, guestName: r.guestName || '', roomNo: String(r.roomNo || ''), status: r.status, company: r.company || '', phone: g.phone || '' };
    });
}

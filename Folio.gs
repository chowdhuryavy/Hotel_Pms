/**
 * Stayline – Folio.gs
 * Folios (cashier windows) and postings. Charges are positive, payments negative.
 * A taxable charge automatically gets a TAX posting (child of the charge) at the hotel tax rate.
 * Voids and transfers keep the original line marked as voided, so the audit trail is complete.
 */
function postEntry_(resNo, roomNo, folioId, code, description, amount, user, bizDate, parentId) {
  const id = id_('P');
  append_(TBL.POSTINGS, {
    id: id, folioId: folioId, resNo: resNo, roomNo: String(roomNo || ''), bizDate: bizDate || bizDate_(), code: code,
    description: description || code, amount: num_(amount), parentId: parentId || '', voided: false, voidReason: '',
    postedBy: user, createdAt: fmtTs_(new Date())
  });
  return id;
}

function chargeCode_(code, type) {
  const c = rows_(TBL.CHARGES).find(x => x.code === code && x.active === true);
  if (!c) throw new Error('Unknown or inactive charge code: ' + code);
  if (type && c.type !== type) throw new Error(code + ' is a ' + c.type + ' code.');
  return c;
}
function folioRow_(id) {
  const f = rows_(TBL.FOLIOS).find(x => x.id === id);
  if (!f) throw new Error('Folio not found.');
  return f;
}
function resOf_(resNo) {
  return rows_(TBL.RES).find(x => x.resNo === resNo);
}

function addFolio(token, resNo, name) {
  const s = auth_(token, 'folio.post');
  return withLock_(() => {
    const r = findRes_(resNo);
    if (RES_ACTIVE.indexOf(r.status) < 0) throw new Error('Folios can only be added to Reserved or In-House stays.');
    const max = rows_(TBL.FOLIOS).filter(f => f.resNo === resNo).reduce((a, f) => Math.max(a, Number(f.folioNo) || 0), 0);
    if (max >= 9) throw new Error('A stay can have at most 9 folios.');
    const id = id_('FO');
    append_(TBL.FOLIOS, { id: id, resNo: resNo, folioNo: max + 1, name: String(name || ('Folio ' + (max + 1))).slice(0, 40), status: 'Open', createdAt: fmtTs_(new Date()), closedAt: '' });
    audit_(s.username, 'FOLIO_ADDED', 'Reservation', resNo, 'folio ' + (max + 1));
    return id;
  });
}

function postCharge(token, folioId, code, description, amount) {
  const s = auth_(token, 'folio.post');
  const amt = num_(amount);
  if (!(amt > 0)) throw new Error('Amount must be greater than zero.');
  return withLock_(() => {
    const f = folioRow_(folioId);
    if (f.status !== 'Open') throw new Error('Folio is closed.');
    const r = findRes_(f.resNo);
    if (r.status !== 'In-House') throw new Error('Charges can only be posted to in-house guests (status: ' + r.status + ').');
    const c = chargeCode_(code, CHARGE_TYPE);
    const bd = bizDate_();
    const gross = amt * (c.taxable === true ? 1 + settings_().taxRate : 1);
    if (f.accountId) assertCredit_(f.accountId, gross);
    const parent = postEntry_(r.resNo, r.roomNo, folioId, c.code, description || c.description, amt, s.username, bd, '');
    if (c.taxable === true && settings_().taxRate > 0) {
      postEntry_(r.resNo, r.roomNo, folioId, 'TAX', 'Tax on ' + c.code, amt * settings_().taxRate, s.username, bd, parent);
    }
    audit_(s.username, 'CHARGE', 'Reservation', r.resNo, c.code + ' ' + amt);
    return { balance: num_(balances_()[r.resNo] || 0) };
  });
}

function postPayment(token, folioId, code, amount) {
  const s = auth_(token, 'folio.post');
  const amt = num_(amount);
  if (!(amt > 0)) throw new Error('Amount must be greater than zero.');
  requireShift_(s);
  return withLock_(() => {
    const f = folioRow_(folioId);
    if (f.status !== 'Open') throw new Error('Folio is closed.');
    const r = findRes_(f.resNo);
    if (RES_ACTIVE.indexOf(r.status) < 0) throw new Error('Payments can only be taken on Reserved or In-House stays.');
    const c = chargeCode_(code, PAY_TYPE);
    postEntry_(r.resNo, r.roomNo, folioId, c.code, 'Payment: ' + c.description, -amt, s.username, bizDate_(), '');
    audit_(s.username, 'PAYMENT', 'Reservation', r.resNo, c.code + ' ' + amt);
    return { balance: num_(balances_()[r.resNo] || 0) };
  });
}

function voidPosting(token, id, reason) {
  const s = auth_(token, 'folio.void');
  if (!String(reason || '').trim()) throw new Error('A reason is required to void a posting.');
  return withLock_(() => {
    const p = rows_(TBL.POSTINGS).find(x => x.id === id);
    if (!p) throw new Error('Posting not found.');
    if (p.voided === true) throw new Error('Posting is already voided.');
    if (closedDate_(p.bizDate)) throw new Error('Business date ' + String(p.bizDate).slice(0, 10) + ' is closed by the night audit. Its postings are frozen.');
    const tag = reason + ' (by ' + s.username + ')';
    patch_(TBL.POSTINGS, p._row, { voided: true, voidReason: tag });
    rows_(TBL.POSTINGS).filter(c => c.parentId === id && c.voided !== true).forEach(c => patch_(TBL.POSTINGS, c._row, { voided: true, voidReason: tag }));
    audit_(s.username, 'VOID', 'Posting', id, p.code + ' ' + p.amount + ' ' + reason);
    return true;
  });
}

/** Moves a posting (and its tax) to another open folio, in any reservation. */
function transferPosting(token, id, toFolioId) {
  const s = auth_(token, 'folio.transfer');
  return withLock_(() => {
    const p = rows_(TBL.POSTINGS).find(x => x.id === id);
    if (!p || p.voided === true) throw new Error('Posting not found or already voided.');
    if (p.parentId) throw new Error('Tax lines move with their charge. Move the charge instead.');
    if (!isCharge_(p.code)) throw new Error('Only charges can be moved. Payments stay on their folio.');
    if (folioRow_(p.folioId).status !== 'Open') throw new Error('The folio this charge is on is closed.');
    if (closedDate_(p.bizDate)) throw new Error('Business date ' + String(p.bizDate).slice(0, 10) + ' is closed by the night audit. Its postings are frozen.');
    const target = folioRow_(toFolioId);
    if (target.status !== 'Open') throw new Error('Target folio is closed.');
    if (target.id === p.folioId) throw new Error('Posting is already on that folio.');
    const tr = resOf_(target.resNo);
    if (!tr || RES_ACTIVE.indexOf(tr.status) < 0) throw new Error('Target stay must be Reserved or In-House.');
    const bd = bizDate_();
    const newParent = postEntry_(tr.resNo, tr.roomNo, toFolioId, p.code, p.description + ' [from ' + p.resNo + ']', Number(p.amount), s.username, p.bizDate || bd, '');
    const tag = 'Transferred to ' + target.resNo + ' folio ' + target.folioNo;
    patch_(TBL.POSTINGS, p._row, { voided: true, voidReason: tag });
    rows_(TBL.POSTINGS).filter(c => c.parentId === id && c.voided !== true).forEach(c => {
      postEntry_(tr.resNo, tr.roomNo, toFolioId, c.code, c.description, Number(c.amount), s.username, c.bizDate || bd, newParent);
      patch_(TBL.POSTINGS, c._row, { voided: true, voidReason: tag });
    });
    audit_(s.username, 'TRANSFER', 'Posting', id, p.amount + ' ' + p.resNo + ' > ' + target.resNo);
    return true;
  });
}

/** Cashier view: every open folio of an active stay with its balance. */
function cashierList(token) {
  auth_(token, 'folio.view');
  const posts = rows_(TBL.POSTINGS);
  const bal = {};
  posts.forEach(p => { if (p.voided !== true) bal[p.folioId] = (bal[p.folioId] || 0) + Number(p.amount); });
  const res = {};
  rows_(TBL.RES).forEach(r => { res[r.resNo] = r; });
  return rows_(TBL.FOLIOS).filter(f => f.status === 'Open' && res[f.resNo] && RES_ACTIVE.indexOf(res[f.resNo].status) >= 0)
    .map(f => ({ id: f.id, resNo: f.resNo, folioNo: Number(f.folioNo), name: f.name, guest: res[f.resNo].guestName, roomNo: String(res[f.resNo].roomNo), status: res[f.resNo].status, accountId: f.accountId || '', balance: num_(bal[f.id] || 0) }))
    .sort((a, b) => a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true }));
}

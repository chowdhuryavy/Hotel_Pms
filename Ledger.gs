/* ============================================================
 * Ledger.gs: reservation change log, copy reservation,
 * city ledger routing (folio to company AR) and accounts receivable (AR)
 * ============================================================ */

/* ---------- Reservation change log: every change with date, time, user and action ---------- */

/** The reservation an audit entry belongs to, when it has one. */
function resNoFor_(entity, entityId) {
  try {
    if (entity === 'Reservation') return String(entityId || '');
    if (entity === 'Posting') { const p = rows_(TBL.POSTINGS).find(x => x.id === entityId); return p ? String(p.resNo || '') : ''; }
    if (entity === 'Folio') { const f = rows_(TBL.FOLIOS).find(x => x.id === entityId); return f ? String(f.resNo || '') : ''; }
  } catch (e) { /* logging must never block the action */ }
  return '';
}
function resLogWrite_(resNo, user, action, details) {
  try {
    append_(TBL.RESLOG, { id: id_('L'), resNo: resNo, at: fmtTs_(new Date()), user: user, action: action, details: String(details || '').slice(0, 500) });
  } catch (e) { Logger.log('Reservation log: ' + e.message); }
}
/** Newest first. Visible to anyone who can view the reservation. */
function getResLog(token, resNo) {
  auth_(token, 'reservations.view');
  return rows_(TBL.RESLOG).filter(x => x.resNo === String(resNo)).reverse().slice(0, 500)
    .map(x => ({ at: String(x.at), user: x.user, action: x.action, details: x.details }));
}

/* ---------- Copy reservation: same guest, room type, plan and details, new dates ---------- */
function copyReservation(token, resNo, d) {
  const s = auth_(token, 'reservations.create');
  const src = findRes_(resNo);
  return withLock_(() => {
    const payload = {
      guestId: d && d.newGuest ? '' : src.guestId,
      firstName: d && d.firstName, lastName: d && d.lastName, email: d && d.email, phone: d && d.phone,
      roomType: src.roomType, plan: src.plan, arrival: d && d.arrival, departure: d && d.departure,
      adults: src.adults, children: src.children, channel: src.channel, market: src.market,
      company: src.company, notes: src.notes
    };
    const out = createRes_(payload, s.username);
    audit_(s.username, 'RES_COPIED', 'Reservation', out.resNo, 'copied from ' + resNo + ' (' + payload.arrival + ' > ' + payload.departure + ')');
    audit_(s.username, 'RES_COPIED', 'Reservation', resNo, 'copied to ' + out.resNo + ' (' + payload.arrival + ' > ' + payload.departure + ')');
    return { resNo: out.resNo, roomNo: out.roomNo };
  });
}

/* ---------- Accounts receivable (AR) ----------
 * A company's receivable is the sum of every posting on its folios, including the city ledger
 * folio ("ACC:<id>"). Payments (negative) are applied oldest debit first, so each debit is either
 * paid or open. Aging is measured from the business date of the open debit. */
const AR_CODE = 'CITY';   // posting code for moves to and from the city ledger (not a charge or a payment code)

function ageDays_(ds) {
  const t = s => { const p = String(s || '').slice(0, 10).split('-').map(Number); return Date.UTC(p[0], (p[1] || 1) - 1, p[2] || 1); };
  return Math.round((t(bizDate_()) - t(ds)) / 86400000);
}
function arFolio_(accId) {
  const resNo = 'ACC:' + accId;
  let ar = rows_(TBL.FOLIOS).find(f => f.resNo === resNo && f.status === 'Open');
  if (!ar) {
    ar = { id: id_('FO') };
    append_(TBL.FOLIOS, { id: ar.id, resNo: resNo, folioNo: 1, name: 'City ledger', status: 'Open', accountId: accId, createdAt: fmtTs_(new Date()), closedAt: '' });
  }
  return ar;
}
function arItems_(accId) {
  const ids = new Set(accountFolios_(accId).map(f => f.id));
  const ps = rows_(TBL.POSTINGS).filter(p => p.voided !== true && ids.has(p.folioId))
    .sort((a, b) => String(a.bizDate).localeCompare(String(b.bizDate)) || String(a.createdAt).localeCompare(String(b.createdAt)));
  let credit = 0, balance = 0;
  ps.forEach(p => { const a = num_(p.amount); balance += a; if (a < 0) credit += -a; });
  let left = credit;
  const open = [];
  ps.filter(p => num_(p.amount) > 0).forEach(p => {
    const a = num_(p.amount), used = Math.min(a, left);
    left -= used;
    const o = num_(a - used);
    if (o > 0.004) open.push({ p: p, open: o });
  });
  return { ps: ps, open: open, balance: num_(balance) };
}
function arBuckets_(open) {
  const b = { current: 0, d31: 0, d61: 0, d90: 0 };
  open.forEach(x => {
    const age = ageDays_(x.p.bizDate);
    const k = age <= 30 ? 'current' : age <= 60 ? 'd31' : age <= 90 ? 'd61' : 'd90';
    b[k] = num_(b[k] + x.open);
  });
  return b;
}
function arOverview(token) {
  auth_(token, 'ar.view');
  return rows_(TBL.ACCOUNTS).map(a => {
    const it = arItems_(a.id);
    return { id: a.id, code: a.code, name: a.name, creditLimit: num_(a.creditLimit), active: a.active === true,
      balance: it.balance, buckets: arBuckets_(it.open) };
  });
}
function arStatement(token, accId) {
  auth_(token, 'ar.view');
  const a = rows_(TBL.ACCOUNTS).find(x => x.id === accId);
  if (!a) throw new Error('Company account not found.');
  const it = arItems_(accId);
  let run = 0;
  const lines = it.ps.map(p => { run = num_(run + num_(p.amount)); return { id: p.id, date: String(p.bizDate), resNo: p.resNo, roomNo: p.roomNo || '', code: p.code, description: p.description, amount: num_(p.amount), balance: run }; });
  return {
    account: { id: a.id, code: a.code, name: a.name, creditLimit: num_(a.creditLimit), active: a.active === true },
    balance: it.balance, buckets: arBuckets_(it.open),
    open: it.open.map(x => ({ date: String(x.p.bizDate), resNo: x.p.resNo, roomNo: x.p.roomNo || '', description: x.p.description, open: x.open, age: ageDays_(x.p.bizDate) })),
    lines: lines.slice(-300).reverse()
  };
}
/** Receipt from a company (bank transfer, cheque). Does not need a cashier shift. */
function arReceipt(token, accId, code, amount, note) {
  const s = auth_(token, 'ar.post');
  const amt = num_(amount);
  if (!(amt > 0)) throw new Error('Amount must be greater than zero.');
  return withLock_(() => {
    if (!rows_(TBL.ACCOUNTS).find(x => x.id === accId)) throw new Error('Company account not found.');
    const c = chargeCode_(code, PAY_TYPE);
    const ar = arFolio_(accId);
    postEntry_('ACC:' + accId, '', ar.id, c.code, 'Receipt' + (note ? ': ' + note : ''), -amt, s.username, bizDate_(), '');
    audit_(s.username, 'AR_RECEIPT', 'Account', accId, c.code + ' ' + amt + (note ? ' | ' + note : ''));
    return { balance: accountBalance_(accId) };
  });
}
/**
 * Routing: closes a guest or PM folio to a company's city ledger. The folio balance moves to the
 * company's receivable, the folio is closed, and the folio is linked to that company.
 * Used when the company will pay the guest's bill.
 */
function closeFolioToCityLedger(token, folioId, accId, reason) {
  const s = auth_(token, 'ar.post');
  const why = String(reason || '').trim();
  if (!why) throw new Error('A reason is required to route a folio to the city ledger.');
  return withLock_(() => {
    const f = folioRow_(folioId);
    if (f.status !== 'Open') throw new Error('Folio is already closed.');
    const acc = rows_(TBL.ACCOUNTS).find(a => a.id === accId);
    if (!acc || acc.active !== true) throw new Error('Company account not found or inactive.');
    const bal = num_(rows_(TBL.POSTINGS).filter(p => p.folioId === folioId && p.voided !== true).reduce((a, p) => a + Number(p.amount), 0));
    if (!(bal > 0)) throw new Error('This folio has no balance to route to the city ledger.');
    if (f.accountId !== accId) assertCredit_(accId, bal);
    const r = findRes_(f.resNo);
    const bd = bizDate_();
    const ar = arFolio_(accId);
    postEntry_(r.resNo, r.roomNo, folioId, AR_CODE, 'Closed to city ledger: ' + acc.name, -bal, s.username, bd, '');
    postEntry_('ACC:' + accId, '', ar.id, AR_CODE, 'From ' + r.resNo + ' folio ' + f.folioNo + ' · ' + r.guestName + ' · Room ' + r.roomNo + ': ' + why, bal, s.username, bd, '');
    patch_(TBL.FOLIOS, f._row, { status: 'Closed', closedAt: fmtTs_(new Date()), accountId: accId });
    audit_(s.username, 'CITY_LEDGER', 'Folio', folioId, bal + ' to ' + acc.name + ' | ' + why);
    return { balance: bal };
  });
}

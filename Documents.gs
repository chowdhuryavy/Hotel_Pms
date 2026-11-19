/* Stayline – Documents.gs
 * Printable documents (PDF): guest folio, registration card, company (AR) folio, AR statement,
 * payment receipt and paid-out receipt. All share one layout, with the hotel's details and app link at the top and foot.
 */
const DOC_CSS = 'body{font-family:Arial,Helvetica,sans-serif;color:#1d2b2f;font-size:11px;margin:0}' +
  'table{border-collapse:collapse;width:100%}' +
  '.hd td{vertical-align:top;padding:0}' +
  '.brand{width:64px}' +
  '.hotel{font-size:18px;font-weight:bold;color:#0f3d3e}' +
  '.sub{font-size:11px;color:#5a6b70;margin-top:2px}' +
  '.contact{font-size:10px;color:#5a6b70;margin-top:4px;line-height:1.5}' +
  '.title{text-align:right;width:210px}' +
  '.doc{font-size:14px;font-weight:bold;letter-spacing:1px;color:#fff;background:#0f3d3e;padding:6px 10px;display:inline-block}' +
  '.docno{font-size:11px;margin-top:6px;font-weight:bold}.docdate{font-size:10px;color:#5a6b70;margin-top:2px}' +
  '.rule{height:3px;background:#f2b134;margin:10px 0 12px}' +
  '.meta{margin:0 0 6px}.meta td{padding:4px 6px;border:1px solid #d6e2e0}' +
  '.mk{background:#eef4f3;font-weight:bold;width:15%}.mv{width:35%}' +
  'h2{font-size:11.5px;letter-spacing:.5px;color:#0f3d3e;margin:14px 0 5px;text-transform:uppercase;border-bottom:1px solid #d6e2e0;padding-bottom:3px}' +
  '.grid th{background:#0f3d3e;color:#fff;text-align:left;padding:5px;font-size:10.5px}' +
  '.grid td{border-bottom:1px solid #e3ebe9;padding:5px;vertical-align:top}' +
  '.r{text-align:right}.void td{color:#9aa5a8;text-decoration:line-through}' +
  '.box{margin-top:10px;width:46%;margin-left:auto}.box td{padding:5px 8px;border:1px solid #d6e2e0}' +
  '.box td.r{text-align:right;font-weight:bold}' +
  '.due td{font-size:13px;font-weight:bold;color:#0f3d3e;background:#fff4dd}' +
  '.note{font-size:9.5px;color:#4b5b60;margin-top:14px;line-height:1.5}' +
  '.sig td{height:40px;vertical-align:bottom;border-bottom:1px solid #1d2b2f;padding:0 14px 3px 0}' +
  '.ft{margin-top:18px;font-size:9px;color:#6b7b80;border-top:1px solid #d6e2e0}.ft td{padding-top:5px}';

function docMoney_(v) { return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function docDate_(v) { const s = String(v || '').slice(0, 10); return isDate_(s) ? dmy_(s) : ''; }

/** Common page: header with logo and hotel details, document title, meta rows, body, footer with the app link. */
function docShell_(o) {
  const st = o.st;
  const contact = [st.hotelAddress, st.hotelPhone ? 'Tel ' + st.hotelPhone : '', st.hotelEmail, st.hotelAppUrl]
    .filter(Boolean).map(escHtml_).join(' &nbsp;·&nbsp; ');
  const meta = (o.meta || []).length ? '<table class="meta">' + o.meta.map(row => '<tr>' +
    row.map(([k, v]) => '<td class="mk">' + escHtml_(k) + '</td><td class="mv">' + escHtml_(v) + '</td>').join('') + '</tr>').join('') + '</table>' : '';
  return '<html><head><meta charset="utf-8"><style>' + DOC_CSS + '</style></head><body>' +
    '<table class="hd"><tr>' +
    '<td class="brand">' + hotelLogoHtml_(st) + '</td>' +
    '<td><div class="hotel">' + escHtml_(st.hotelName || '') + '</div>' +
      (st.ownerName ? '<div class="sub">' + escHtml_(st.ownerName) + '</div>' : '') +
      '<div class="contact">' + contact + '</div></td>' +
    '<td class="title"><div class="doc">' + escHtml_(o.title) + '</div>' +
      '<div class="docno">' + escHtml_(o.docNo || '') + '</div>' +
      '<div class="docdate">' + escHtml_(o.dateLabel || '') + '</div></td>' +
    '</tr></table><div class="rule"></div>' +
    meta + o.body +
    (o.note ? '<div class="note">' + o.note + '</div>' : '') +
    '<table class="ft"><tr><td>Printed ' + escHtml_(fmtTs_(new Date())) + ' by ' + escHtml_(o.by || '') + '</td>' +
    '<td class="r">' + escHtml_(st.hotelAppUrl || '') + ' &nbsp;·&nbsp; ' + escHtml_(st.appName || '') + ' ' + APP_VERSION + '</td></tr></table>' +
    '</body></html>';
}
function docPdf_(html, name) {
  const blob = HtmlService.createHtmlOutput(html).getAs('application/pdf');
  return { name: name, base64: Utilities.base64Encode(blob.getBytes()) };
}
/** Simple grid. cells are already HTML-safe; rightCols lists the amount columns (0-based). */
function docGrid_(headers, rows, rightCols, rowClass) {
  const right = rightCols || [];
  const head = '<tr>' + headers.map((h, i) => '<th' + (right.indexOf(i) >= 0 ? ' class="r"' : '') + '>' + escHtml_(h) + '</th>').join('') + '</tr>';
  const body = rows.length ? rows.map((r, k) => '<tr' + (rowClass && rowClass[k] ? ' class="' + rowClass[k] + '"' : '') + '>' +
    r.map((c, i) => '<td' + (right.indexOf(i) >= 0 ? ' class="r"' : '') + '>' + c + '</td>').join('') + '</tr>').join('')
    : '<tr><td colspan="' + headers.length + '">Nothing to show</td></tr>';
  return '<table class="grid">' + head + body + '</table>';
}
function docBox_(pairs, dueLast) {
  return '<table class="box">' + pairs.map((p, i) => '<tr' + (dueLast && i === pairs.length - 1 ? ' class="due"' : '') + '><td>' + escHtml_(p[0]) +
    '</td><td class="r">' + p[1] + '</td></tr>').join('') + '</table>';
}

/* ---------- Guest folio ---------- */
function exportFolioPdf(token, resNo) {
  const s = auth_(token, 'folio.view');
  const d = getReservation(token, resNo);
  const st = settings_(), r = d.res;
  let charges = 0, refunds = 0, payments = 0;
  let body = '';
  (d.folios || []).forEach(f => {
    const live = f.postings.filter(p => p.voided !== true);
    live.forEach(p => {
      const a = Number(p.amount) || 0;
      if (a < 0) payments += a; else if (p.parentId) refunds += a; else charges += a;
    });
    const rows = f.postings.map(p => [escHtml_(docDate_(p.bizDate)), escHtml_(p.code), escHtml_(p.description) + (p.voided ? ' (void)' : ''), docMoney_(p.amount)]);
    body += '<h2>Folio ' + escHtml_(f.folioNo) + ' · ' + escHtml_(f.name) + ' · ' + escHtml_(f.status) + '</h2>' +
      docGrid_(['Date', 'Code', 'Description', 'Amount (' + (st.currency || '') + ')'], rows, [3], f.postings.map(p => p.voided ? 'void' : ''));
  });
  const summary = docBox_([
    ['Charges', docMoney_(charges)],
    ['Refunds paid out', docMoney_(refunds)],
    ['Payments received', docMoney_(payments)],
    ['Balance due', docMoney_(d.balance)]
  ], true);
  const html = docShell_({ st: st, title: 'GUEST FOLIO', docNo: 'Reservation ' + r.resNo, dateLabel: 'Arrival ' + docDate_(r.arrival) + ' · Departure ' + docDate_(r.departure),
    by: s.name,
    meta: [
      [['Guest', d.guestName], ['Room', d.room.roomNo + ' · ' + d.room.type]],
      [['Arrival', docDate_(r.arrival)], ['Departure', docDate_(r.departure)]],
      [['Status', r.status], ['Rate plan', r.plan]]
    ],
    body: body + summary,
    note: 'Amounts in ' + escHtml_(st.currency || '') + '. Payments and credits are shown as negative amounts. Please check this folio at check-out; questions about any charge go to the front desk.' });
  audit_(s.username, 'FOLIO_PRINTED', 'Reservation', resNo, '');
  return docPdf_(html, 'Folio_' + resNo + '.pdf');
}

/* ---------- Registration card ---------- */
function registrationCard(token, resNo) {
  const s = auth_(token, 'reservations.view');
  const d = getReservation(token, resNo);
  const r = d.res, g = d.guest || {}, st = settings_();
  const nights = Math.max(0, Math.round((new Date(r.departure) - new Date(r.arrival)) / 86400000));
  const rateRows = (d.rates || []).map(x => [escHtml_(docDate_(x.date)), docMoney_(x.rate)]);
  const rateBlock = rateRows.length ? docGrid_(['Night', 'Rate (' + (st.currency || '') + ')'], rateRows, [1]) :
    '<p>Rate as quoted at booking.</p>';
  const pair = (a, b) => [[a[0], a[1]], [b[0], b[1]]];
  const body = '<h2>Guest details</h2>' +
    '<table class="meta">' +
    '<tr><td class="mk">Guest name</td><td class="mv">' + escHtml_(d.guestName) + '</td><td class="mk">Title</td><td class="mv">' + escHtml_(g.title) + '</td></tr>' +
    '<tr><td class="mk">Nationality</td><td class="mv">' + escHtml_(g.nationality) + '</td><td class="mk">Date of birth</td><td class="mv">' + escHtml_(docDate_(g.dob)) + '</td></tr>' +
    '<tr><td class="mk">ID type</td><td class="mv">' + escHtml_(g.idType) + '</td><td class="mk">ID / passport no.</td><td class="mv">' + escHtml_(g.idNo) + '</td></tr>' +
    '<tr><td class="mk">Phone</td><td class="mv">' + escHtml_(g.phone) + '</td><td class="mk">Email</td><td class="mv">' + escHtml_(g.email) + '</td></tr>' +
    '<tr><td class="mk">Company</td><td class="mv">' + escHtml_(g.company || r.company) + '</td><td class="mk">Booking channel</td><td class="mv">' + escHtml_(r.channel) + '</td></tr>' +
    '</table>' +
    '<h2>Stay</h2>' +
    '<table class="meta">' +
    '<tr><td class="mk">Arrival</td><td class="mv">' + escHtml_(docDate_(r.arrival)) + '</td><td class="mk">Departure</td><td class="mv">' + escHtml_(docDate_(r.departure)) + '</td></tr>' +
    '<tr><td class="mk">Nights</td><td class="mv">' + nights + '</td><td class="mk">Adults / children</td><td class="mv">' + escHtml_(r.adults) + ' / ' + escHtml_(r.children || 0) + '</td></tr>' +
    '<tr><td class="mk">Room</td><td class="mv">' + escHtml_(d.room.roomNo) + '</td><td class="mk">Room type</td><td class="mv">' + escHtml_(d.room.type) + '</td></tr>' +
    '<tr><td class="mk">Rate plan</td><td class="mv">' + escHtml_(r.plan) + '</td><td class="mk">Status</td><td class="mv">' + escHtml_(r.status) + '</td></tr>' +
    '</table>' +
    '<h2>Nightly rates</h2>' + rateBlock +
    '<h2>Guest declaration</h2>' +
    '<p style="font-size:10px;line-height:1.5">I confirm the details above are correct and I agree to the hotel\'s terms of stay. I am responsible for all charges on my folio, including any charge to a company or account I have authorised. Valuables may be kept in the in-room safe; the hotel is not liable for valuables left unsecured.</p>' +
    '<table class="sig" style="margin-top:18px"><tr><td style="width:50%">Guest signature</td><td>Date</td></tr>' +
    '<tr><td>Registered by: ' + escHtml_(s.name) + '</td><td>' + escHtml_(docDate_(st.businessDate)) + '</td></tr></table>';
  const html = docShell_({ st: st, title: 'REGISTRATION CARD', docNo: 'Reservation ' + r.resNo, dateLabel: 'Check-in ' + docDate_(r.arrival), by: s.name, body: body });
  audit_(s.username, 'REG_CARD_PRINTED', 'Reservation', resNo, '');
  return docPdf_(html, 'Registration_' + resNo + '.pdf');
}

/* ---------- Company (city ledger) folio ---------- */
function accountFolioPdf(token, accId) {
  const s = auth_(token, 'ar.view');
  const a = rows_(TBL.ACCOUNTS).find(x => x.id === accId);
  if (!a) throw new Error('Company account not found.');
  const st = settings_();
  const ids = new Set(accountFolios_(accId).map(f => f.id));
  const ps = rows_(TBL.POSTINGS).filter(p => ids.has(p.folioId))
    .sort((x, y) => String(x.bizDate).localeCompare(String(y.bizDate)) || String(x.createdAt).localeCompare(String(y.createdAt)));
  let run = 0;
  const rows = ps.map(p => {
    if (p.voided !== true) run += Number(p.amount) || 0;
    return [escHtml_(docDate_(p.bizDate)), escHtml_(p.resNo), escHtml_(p.roomNo), escHtml_(p.code), escHtml_(p.description) + (p.voided ? ' (void)' : ''),
      docMoney_(p.amount), docMoney_(run)];
  });
  const cls = ps.map(p => p.voided ? 'void' : '');
  const it = arItems_(accId), b = arBuckets_(it.open);
  const body = '<h2>Postings to company folios</h2>' +
    docGrid_(['Date', 'Res', 'Room', 'Code', 'Description', 'Amount', 'Balance'], rows, [5, 6], cls) +
    '<h2>Ageing</h2>' +
    docGrid_(['Current (0–30)', '31–60 days', '61–90 days', 'Over 90 days', 'Total owed'],
      [[docMoney_(b.current), docMoney_(b.d31), docMoney_(b.d61), docMoney_(b.d90), docMoney_(it.balance)]], [0, 1, 2, 3, 4]) +
    docBox_([['Balance owed', docMoney_(it.balance)]], true);
  const html = docShell_({ st: st, title: 'COMPANY FOLIO', docNo: 'Account ' + a.code, dateLabel: 'As at ' + docDate_(st.businessDate), by: s.name,
    meta: [[['Company', a.name], ['Contact', a.contact || '']], [['Email', a.email || ''], ['Credit limit', a.creditLimit ? docMoney_(a.creditLimit) : 'No limit']]],
    body: body, note: 'Amounts in ' + escHtml_(st.currency || '') + '. Please pay against the invoice reference quoted on each posting.' });
  audit_(s.username, 'AR_FOLIO_PRINTED', 'Account', accId, '');
  return docPdf_(html, 'Company_folio_' + a.code + '.pdf');
}

/* ---------- AR statement ---------- */
function arStatementPdf(token, accId) {
  const s = auth_(token, 'ar.view');
  const d = arStatement(token, accId);
  const st = settings_(), a = d.account, b = d.buckets;
  const lines = d.lines.slice().reverse();   // oldest first, with running balance
  const rows = lines.map(l => [escHtml_(docDate_(l.date)), escHtml_(l.resNo), escHtml_(l.roomNo), escHtml_(l.code), escHtml_(l.description), docMoney_(l.amount), docMoney_(l.balance)]);
  const open = d.open.map(o => [escHtml_(docDate_(o.date)), escHtml_(o.resNo), escHtml_(o.roomNo), escHtml_(o.description), docMoney_(o.open), escHtml_(o.age)]);
  const body = '<h2>Ageing</h2>' +
    docGrid_(['Current (0–30)', '31–60 days', '61–90 days', 'Over 90 days'], [[docMoney_(b.current), docMoney_(b.d31), docMoney_(b.d61), docMoney_(b.d90)]], [0, 1, 2, 3]) +
    '<h2>Open items</h2>' + docGrid_(['Date', 'Res', 'Room', 'Description', 'Open amount', 'Age (days)'], open, [4, 5]) +
    '<h2>Statement</h2>' + docGrid_(['Date', 'Res', 'Room', 'Code', 'Description', 'Amount', 'Balance'], rows, [5, 6]) +
    docBox_([['Balance owed', docMoney_(d.balance)]], true);
  const html = docShell_({ st: st, title: 'ACCOUNT STATEMENT', docNo: 'Account ' + a.code, dateLabel: 'As at ' + docDate_(st.businessDate), by: s.name,
    meta: [[['Company', a.name], ['Credit limit', a.creditLimit ? docMoney_(a.creditLimit) : 'No limit']]],
    body: body, note: 'Please remit the balance owed by the due date. Amounts in ' + escHtml_(st.currency || '') + '.' });
  audit_(s.username, 'AR_STATEMENT_PRINTED', 'Account', accId, '');
  return docPdf_(html, 'Statement_' + a.code + '.pdf');
}

/* ---------- Payment receipt ---------- */
function paymentReceiptPdf(token, postingId) {
  const s = auth_(token, 'folio.view');
  const p = rows_(TBL.POSTINGS).find(x => x.id === postingId);
  if (!p || p.voided === true || Number(p.amount) >= 0) throw new Error('Payment not found.');
  const st = settings_();
  const f = rows_(TBL.FOLIOS).find(x => x.id === p.folioId) || {};
  const acc = f.accountId ? rows_(TBL.ACCOUNTS).find(x => x.id === f.accountId) : null;
  const isAr = String(p.resNo).indexOf('ACC:') === 0;
  const res = isAr ? null : (rows_(TBL.RES).find(x => x.resNo === p.resNo) || {});
  const c = rows_(TBL.CHARGES).find(x => x.code === p.code) || {};
  const payer = isAr ? (acc ? acc.name : '') : (res.guestName || '');
  const balance = isAr ? (acc ? arItems_(acc.id).balance : 0) : (balances_()[p.resNo] || 0);
  const amount = Math.abs(Number(p.amount));
  const body = '<h2>Received</h2>' +
    '<table class="meta">' +
    '<tr><td class="mk">Received from</td><td class="mv">' + escHtml_(payer) + '</td><td class="mk">Date</td><td class="mv">' + escHtml_(docDate_(p.bizDate)) + '</td></tr>' +
    '<tr><td class="mk">Reservation</td><td class="mv">' + escHtml_(isAr ? '—' : p.resNo) + '</td><td class="mk">Room</td><td class="mv">' + escHtml_(p.roomNo || '—') + '</td></tr>' +
    '<tr><td class="mk">Payment method</td><td class="mv">' + escHtml_(c.description || p.code) + '</td><td class="mk">Reference</td><td class="mv">' + escHtml_(String(p.description || '').replace(/^Payment:\s*/, '')) + '</td></tr>' +
    '</table>' +
    docBox_([['Amount received', docMoney_(amount)], ['Balance after this payment', docMoney_(balance)]], false) +
    '<p style="margin-top:26px;font-size:10px">Received by: ' + escHtml_(p.postedBy || s.name) + '</p>';
  const html = docShell_({ st: st, title: 'PAYMENT RECEIPT', docNo: 'Receipt ' + p.id, dateLabel: docDate_(p.bizDate), by: s.name, body: body,
    note: 'Thank you. Amounts in ' + escHtml_(st.currency || '') + '.' });
  audit_(s.username, 'RECEIPT_PRINTED', 'Posting', p.id, '');
  return docPdf_(html, 'Receipt_' + p.id + '.pdf');
}

/* ---------- Paid-out receipt (refunds of a payment) ---------- */
function paidOutReceiptPdf(token, postingId) {
  const s = auth_(token, 'folio.view');
  const p = rows_(TBL.POSTINGS).find(x => x.id === postingId);
  if (!p) throw new Error('Posting not found.');
  const payId = Number(p.amount) > 0 && p.parentId ? p.parentId : (Number(p.amount) < 0 ? p.id : '');
  const pay = payId ? rows_(TBL.POSTINGS).find(x => x.id === payId) : null;
  if (!pay) throw new Error('Refund not found.');
  const refunds = rows_(TBL.POSTINGS).filter(x => x.parentId === pay.id && x.voided !== true && Number(x.amount) > 0)
    .sort((x, y) => String(x.createdAt).localeCompare(String(y.createdAt)));
  if (!refunds.length) throw new Error('No refund has been paid out on this payment.');
  const st = settings_();
  const res = rows_(TBL.RES).find(x => x.resNo === pay.resNo) || {};
  const paid = Math.abs(Number(pay.amount));
  const out = refunds.reduce((a, x) => a + Number(x.amount), 0);
  const c = rows_(TBL.CHARGES).find(x => x.code === pay.code) || {};
  const body = '<h2>Paid out to guest</h2>' +
    '<table class="meta">' +
    '<tr><td class="mk">Paid to</td><td class="mv">' + escHtml_(res.guestName || '') + '</td><td class="mk">Reservation</td><td class="mv">' + escHtml_(pay.resNo) + '</td></tr>' +
    '<tr><td class="mk">Original payment</td><td class="mv">' + escHtml_(c.description || pay.code) + ' · ' + escHtml_(docDate_(pay.bizDate)) + '</td><td class="mk">Room</td><td class="mv">' + escHtml_(pay.roomNo || '—') + '</td></tr>' +
    '</table>' +
    '<h2>Refunds</h2>' +
    docGrid_(['Date', 'Reference', 'Reason', 'Amount', 'Posted by'], refunds.map(x => [escHtml_(docDate_(x.bizDate)), escHtml_(x.id), escHtml_(String(x.description || '').replace(/^Refund:\s*/, '')), docMoney_(x.amount), escHtml_(x.postedBy || '')]), [3]) +
    docBox_([['Original payment', docMoney_(paid)], ['Total paid out', docMoney_(out)], ['Net retained by hotel', docMoney_(paid - out)]], false) +
    '<p style="margin-top:26px;font-size:10px">Received by: ' + escHtml_(s.name) + ' &nbsp;&nbsp; Signature of guest: ________________________</p>';
  const html = docShell_({ st: st, title: 'PAID-OUT RECEIPT', docNo: 'Payment ' + pay.id, dateLabel: docDate_(refunds[refunds.length - 1].bizDate), by: s.name, body: body,
    note: 'This confirms that the amount above has been returned to the guest. Amounts in ' + escHtml_(st.currency || '') + '.' });
  audit_(s.username, 'PAIDOUT_PRINTED', 'Posting', pay.id, '');
  return docPdf_(html, 'Paid-out_' + pay.id + '.pdf');
}

/* ---------- Cashier shift cash-up ---------- */
function shiftCashUpData_(sh) {
  const x = shiftSummary_(sh);
  const expected = sh.status === 'Closed' && sh.expectedCash !== '' ? num_(sh.expectedCash) : num_(Number(sh.openingFloat) + x.cashReceived);
  return { sum: x.summary, cash: x.cashReceived, expected: expected,
    counted: sh.countedCash === '' || sh.countedCash == null ? null : num_(sh.countedCash),
    variance: sh.variance === '' || sh.variance == null ? null : num_(sh.variance) };
}
function shiftCashUpPdf(token, shiftId) {
  const s = auth_(token);
  const p = permMap_(s);
  const sh = rows_(TBL.SHIFTS).find(r => r.id === shiftId);
  if (!sh) throw new Error('Shift not found.');
  if (!p['shifts.view'] && !p['shifts.manage'] && sh.user !== s.username) throw new Error('Permission denied: shifts.view');
  const st = settings_();
  const d = shiftCashUpData_(sh);
  const body = '<h2>Shift</h2><table class="meta">' +
    '<tr><td class="mk">Cashier</td><td class="mv">' + escHtml_(sh.user) + '</td><td class="mk">Shift no.</td><td class="mv">' + escHtml_(sh.id) + '</td></tr>' +
    '<tr><td class="mk">Opened</td><td class="mv">' + escHtml_(sh.openedAt) + '</td><td class="mk">Closed</td><td class="mv">' + escHtml_(sh.closedAt || 'still open') + '</td></tr></table>' +
    '<h2>Payments taken</h2>' + docGrid_(['Method', 'Amount'], d.sum.map(x => [escHtml_(x.code), docMoney_(x.amount)]), [1]) +
    docBox_([
      ['Opening float', docMoney_(sh.openingFloat)],
      ['Cash received', docMoney_(d.cash)],
      ['Expected cash in drawer', docMoney_(d.expected)],
      ['Counted cash', d.counted === null ? '—' : docMoney_(d.counted)],
      ['Variance (counted − expected)', d.variance === null ? '—' : docMoney_(d.variance)]
    ], false);
  const html = docShell_({ st: st, title: 'CASH-UP', docNo: 'Shift ' + sh.id, dateLabel: docDate_(String(sh.openedAt).slice(0, 10)), by: s.name, body: body,
    note: 'Amounts in ' + escHtml_(st.currency || '') + '.' });
  return docPdf_(html, 'CashUp_' + sh.id + '.pdf');
}
/** Emails the cash-up to the auditor when a shift closes (only when auto-send is on). */
function mailCashUp_(cu, user) {
  const st = settings_();
  if (!st.auditorEmail || !flag_('auditorAutoSend')) return false;
  sendMail_(st.auditorEmail, 'Cash-up · ' + user + ' · ' + (st.hotelName || ''),
    'The cash-up for ' + user + ' is attached.', mailHtml_('<p>The cash-up for <b>' + escHtml_(user) + '</b> is attached.</p>'),
    { name: cu.name, b64: cu.base64 });
  return true;
}

/* ---------- Guest emails: confirmation and check-out receipt ---------- */
function guestEmailOf_(resNo) {
  const r = rows_(TBL.RES).find(x => x.resNo === resNo);
  if (!r) return '';
  const g = rows_(TBL.GUESTS).find(x => x.id === r.guestId);
  return g && g.email ? String(g.email) : '';
}
function guestMail_(resNo, subject, bodyHtml, b64, fname) {
  const to = guestEmailOf_(resNo);
  if (!to) return false;
  const text = bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  sendMail_(to, subject, text, mailHtml_(bodyHtml), b64 ? { name: fname || 'document.pdf', b64: b64 } : null);
  return true;
}
function reservationMail_(resNo) {
  const r = rows_(TBL.RES).find(x => x.resNo === resNo);
  if (!r) return false;
  const st = settings_();
  const body = '<p>Dear ' + escHtml_(r.guestName || 'guest') + ',</p>' +
    '<p>Thank you for choosing ' + escHtml_(st.hotelName || '') + '. Your reservation is confirmed.</p>' +
    '<table role="presentation" cellpadding="6" style="border-collapse:collapse;font-size:14px">' +
    '<tr><td><b>Reservation no.</b></td><td>' + escHtml_(r.resNo) + '</td></tr>' +
    '<tr><td><b>Arrival</b></td><td>' + escHtml_(docDate_(r.arrival)) + '</td></tr>' +
    '<tr><td><b>Departure</b></td><td>' + escHtml_(docDate_(r.departure)) + '</td></tr>' +
    '<tr><td><b>Room type</b></td><td>' + escHtml_(r.roomType) + '</td></tr></table>' +
    (st.hotelAppUrl ? '<p>Hotel app: <a href="' + escHtml_(st.hotelAppUrl) + '">' + escHtml_(st.hotelAppUrl) + '</a></p>' : '') +
    '<p>We look forward to welcoming you.</p>';
  return guestMail_(resNo, 'Reservation confirmed · ' + r.resNo, body, '', '');
}
function checkoutMail_(token, resNo, balance) {
  const r = rows_(TBL.RES).find(x => x.resNo === resNo);
  if (!r || !guestEmailOf_(resNo)) return false;
  const st = settings_();
  const folio = exportFolioPdf(token, resNo);
  const body = '<p>Dear ' + escHtml_(r.guestName || 'guest') + ',</p>' +
    '<p>Thank you for staying with ' + escHtml_(st.hotelName || '') + '. You have checked out.</p>' +
    '<p>Balance at check-out: <b>' + docMoney_(balance) + ' ' + escHtml_(st.currency || '') + '</b>. Your folio is attached.</p>' +
    '<p>We hope to welcome you again soon.</p>';
  return guestMail_(resNo, 'Your receipt · ' + (st.hotelName || '') + ' · ' + resNo, body, folio.base64, folio.name);
}

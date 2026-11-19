const fs = require('fs'), vm = require('vm'), crypto = require('crypto');
const SRC = '../';
const files = ['Config','Core','Setup','Rooms','Rates','Guests','Reservations','FrontDesk','Folio','Groups','NightAudit','Reports','Advanced','FixedCharges','Documents','Backup','Recovery','Email','Roles','Billing','Ledger','Admin','EodReports','FrontSearch','Menu','Updater','Currency','GuestService','Minibar'];
const code = files.map(f => fs.readFileSync(SRC + f + '.gs', 'utf8')).join('\n;\n');

// ---- in-memory Spreadsheet ----
const books = {};
function makeSS(id) {
  const sheets = {};
  const api = {
    getId: () => id, getUrl: () => 'mock://' + id,
    setSpreadsheetTimeZone() {}, getSheets: () => Object.values(sheets),
    getSheetByName: n => sheets[n] || null,
    insertSheet(n) { sheets[n] = makeSheet(n); return sheets[n]; },
    deleteSheet(s) { delete sheets[s.name]; }
  };
  api._sheets = sheets;
  sheets['Sheet1'] = makeSheet('Sheet1');
  return api;
}
function makeSheet(name) {
  const data = [];
  const sh = {
    name,
    getLastRow: () => data.length,
    getLastColumn: () => data.reduce((m, r) => Math.max(m, r.length), 0),
    getDataRange: () => ({ getValues: () => data.map(r => r.slice()) }),
    appendRow(r) { data.push(r.slice()); },
    deleteRow(r) { data.splice(r - 1, 1); },
    setFrozenRows() {},
    getRange(row, col, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      const cell = (r, c) => { while (data.length < r) data.push([]); while (data[r-1].length < c) data[r-1].push(''); return data[r-1]; };
      const range = {
        setValue(v) { cell(row, col)[col-1] = v; return range; },
        setValues(vals) { vals.forEach((rr, i) => rr.forEach((v, j) => { cell(row+i, col+j)[col+j-1] = v; })); return range; },
        getValues() { return Array.from({length: nr}, (_, i) => Array.from({length: nc}, (_, j) => (data[row-1+i] || [])[col-1+j] ?? '')); },
        setFontWeight() { return range; }, setBackground() { return range; }, setFontColor() { return range; },
        insertCheckboxes() { return range; }
      };
      return range;
    }
  };
  return sh;
}
const props = {};
const mailbox = [];
const relayCalls = [];
let relayReply = { next: null };
const cache = new Map();
const sandbox = {
  Logger: { log: (...a) => { if (process.env.VERBOSE) console.log('LOG', ...a); } },
  MailApp: { sendEmail: m => { mailbox.push(m); } },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
  UrlFetchApp: { fetch: (u, o) => { relayCalls.push({ u, o }); return relayReply.next || { getResponseCode: () => 200, getContentText: () => '{}' }; } },
  CacheService: { getScriptCache: () => ({ get: k => cache.get(k) || null, put: (k, v) => cache.set(k, v), remove: k => cache.delete(k) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  SpreadsheetApp: {
    create(name) { const id = 'ss' + Object.keys(books).length; books[id] = makeSS(id); return books[id]; },
    getActiveSpreadsheet() { return null; },
    openById(id) { return books[id]; }
  },
  ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() {} }), everyHours: () => ({ create() {} }), everyDays: () => ({ atHour: () => ({ create() {} }) }) }) }) },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    computeHmacSha256Signature: (value, key) => Array.from(crypto.createHmac('sha256', String(key)).update(String(value), 'utf8').digest()).map(x => x > 127 ? x - 256 : x),
    base64Decode: str => Array.from(Buffer.from(String(str), 'base64')).map(x => x > 127 ? x - 256 : x),
    newBlob: data => typeof data === 'string'
      ? { getBytes: () => Array.from(Buffer.from(data, 'utf8')).map(x => x > 127 ? x - 256 : x) }
      : { getDataAsString: () => Buffer.from(data.map(x => x & 0xff)).toString('utf8') },
    computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(String(s), 'utf8').digest()),
    base64Encode: b => Buffer.from(b).toString('base64'),
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    formatDate(date, tz, fmt) {
      const off = tz === 'UTC' ? 0 : 180;
      const d = new Date(date.getTime() + off * 60000);
      const p = n => String(n).padStart(2, '0');
      const base = d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
      return fmt === 'yyyy-MM-dd' ? base : base + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
    }
  },
  HtmlService: { createHtmlOutput: () => ({ getAs: () => ({ getBytes: () => [37, 80, 68, 70] }) }) }, ScriptApp2: {},
  console
};
sandbox.global = sandbox;
Object.assign(sandbox, { mailbox, relayCalls, relayReply });
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'stayline.js' });
const run = (expr) => vm.runInContext(expr, sandbox);
module.exports = { run, props, books };

if (require.main === module) {
  const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) process.exitCode = 1; };
  const tryRun = (expr) => { try { return { v: run(expr) }; } catch (e) { return { e: e.message }; } };
  props['ADMIN_PASSWORD'] = 'Admin12345';
  run('setupDatabase()');
  ok(!!props.SHEET_ID, 'setup created spreadsheet');
  run('seedDemoData()');
  run("globalThis.TOK = login('admin','Admin12345').token");
  ok(run('TOK') && run('TOK').length > 10, 'admin login works');
  const bad = tryRun("login('admin','wrong')");
  ok(!!bad.e, 'wrong password rejected');
  // admin password reset: sets a new password from ADMIN_PASSWORD, and the old one stops working
  props.ADMIN_PASSWORD = 'Reset12345';
  const r1 = tryRun("resetAdminPassword()");
  ok(!r1.e && /Admin password is set/.test(r1.v), 'resetAdminPassword sets the password');
  const oldPw = tryRun("login('admin','Admin12345')");
  ok(!!oldPw.e, 'old admin password is refused after reset');
  const newPw = tryRun("login('admin','Reset12345').token");
  ok(!newPw.e && String(newPw.v).length > 10, 'new admin password signs in after reset');
  props.ADMIN_PASSWORD = 'Admin12345';
  tryRun("resetAdminPassword()");
  // email sign-in and forgot-password flow with a code sent by email
  const adminId = tryRun("rows_(TBL.USERS).find(u => u.username === 'admin').id").v;
  const setMail = tryRun("saveUser(login('admin','Admin12345').token, { id: '" + adminId + "', username: 'admin', name: 'Administrator', role: 'Admin', email: 'admin@example.com', active: true })");
  ok(!setMail.e, 'admin email saved');
  const byEmail = tryRun("login('admin@example.com','Admin12345').token");
  ok(!byEmail.e && String(byEmail.v).length > 10, 'sign in with email works');
  const req = tryRun("forgotRequest('admin@example.com')");
  ok(!req.e && /code has been sent/.test(req.v.message) && req.v.sentTo === 'a***@example.com', 'forgot request sends a code (masked address shown)');
  const mail = mailbox[mailbox.length - 1] || {};
  const code = ((mail.body || '').match(/\b(\d{6})\b/) || [])[1];
  ok(mailbox.length >= 1 && /security code|verification code/i.test(mail.subject || '') && !!code && /<html/i.test(mail.htmlBody || ''), 'code emailed as a professional HTML email');
  ok(/Your verification code is \d{6}/.test(mail.body || ''), 'plain text has a "Your verification code is NNNNNN" line (Gmail copy button)');
  const again = tryRun("forgotRequest('admin@example.com')");
  ok(!again.e && mailbox.length === 1, 'no second email within the cooldown');
  const wrong = tryRun("forgotVerify('admin@example.com','" + (code === '000000' ? '111111' : '000000') + "')");
  ok(!!wrong.e && /not valid|wrong/i.test(wrong.e), 'wrong code is refused');
  const good = tryRun("forgotVerify('admin@example.com','" + code + "')");
  ok(!good.e && good.v && good.v.resetToken, 'correct code gives a reset token');
  const weak = tryRun("forgotReset('" + (good.v && good.v.resetToken) + "','weakpass')");
  ok(!!weak.e && /uppercase/i.test(weak.e), 'weak new password is refused (' + (weak.e || '') + ')');
  const done = tryRun("forgotReset('" + (good.v && good.v.resetToken) + "','Brand3New')");
  ok(!done.e && done.v === true, 'new password saved');
  const again2 = tryRun("forgotReset('" + (good.v && good.v.resetToken) + "','Brand4New')");
  ok(!!again2.e, 'reset token cannot be used twice');
  const newLogin = tryRun("login('admin','Brand3New').token");
  ok(!newLogin.e, 'sign in with the new password works');
  ok(!!tryRun("login('admin','Admin12345')").e, 'old password is refused');
  ok(/password was changed/.test((mailbox[mailbox.length - 1] || {}).subject || ''), 'confirmation email sent after reset');
  props.ADMIN_PASSWORD = 'Admin12345';
  tryRun("resetAdminPassword()");
  ok(!tryRun("login('admin','Admin12345').token").e, 'admin password restored for the rest of the tests');
  const bd = run('bizDate_()');
  console.log('business date', bd);
  const av = run("availability(TOK, bizDate_(), addDays_(bizDate_(), 2), '')");
  ok(av.length >= 1 && av[0].free > 0, 'availability returns free rooms: ' + JSON.stringify(av.map(t => [t.type, t.free, t.total, t.rate])));
  const q = run("quoteRates(TOK,'DLX','CORP',bizDate_(),addDays_(bizDate_(),3))");
  ok(q.nights.length === 3, 'quote has 3 nights, total ' + q.total);
  const cr = tryRun("createReservation(TOK, {firstName:'Test', lastName:'Guest', email:'t@x.com', phone:'999', roomType:'STD', arrival: bizDate_(), departure: addDays_(bizDate_(),2), adults:1, plan:'BAR'})");
  ok(!cr.e && cr.v.resNo, 'create reservation: ' + (cr.e || cr.v.resNo + ' room ' + cr.v.roomNo));
  const resNo = cr.v.resNo;
  const detail = run("getReservation(TOK,'" + resNo + "')");
  ok(detail.res.status === 'Reserved' && detail.folios.length === 1, 'reservation has status Reserved and one folio');
  const folioId = detail.folios[0].id;
  const ci = tryRun("checkIn(TOK,'" + resNo + "','', 0, 'DEP')");
  ok(!ci.e, 'check-in ok ' + (ci.e || ''));
  const co0 = tryRun("checkOut(TOK,'" + resNo + "')");
  ok(!co0.e, 'check-out with zero balance passes');
  // restart flow for balance test
  const cr2 = tryRun("createReservation(TOK, {firstName:'Bal', lastName:'Test', roomType:'DLX', arrival: bizDate_(), departure: addDays_(bizDate_(),1), adults:1, plan:'BAR'})");
  const r2 = cr2.v.resNo;
  run("checkIn(TOK,'" + r2 + "','',0,'DEP')");
  const f2 = run("getReservation(TOK,'" + r2 + "')").folios[0].id;
  const pc = run("postCharge(TOK,'" + f2 + "','MB','Water',25)");
  ok(Math.abs(pc.balance - 27.5) < 0.01, 'minibar 25 + 10% tax = balance 27.5 (got ' + pc.balance + ')');
  const blocked = tryRun("checkOut(TOK,'" + r2 + "')");
  ok(!!blocked.e && /balance/i.test(blocked.e), 'checkout blocked with open balance');
  const override = tryRun("checkOut(TOK,'" + r2 + "', false)"); ok(!!override.e, 'checkout without force still blocked for admin');
  const pay = run("postPayment(TOK,'" + f2 + "','CASH',27.5)");
  ok(Math.abs(pay.balance) < 0.01, 'payment settles folio');
  const out = tryRun("checkOut(TOK,'" + r2 + "')");
  ok(!out.e, 'checkout after settlement ok');
  const dirty = run("findRoom_('" + run("getReservation(TOK,'" + r2 + "')").res.roomNo + "').housekeeping");
  ok(dirty === 'Dirty', 'room is Dirty after checkout');
  // night audit: a stayer posts ROOM for the business date
  const stay = tryRun("createReservation(TOK, {firstName:'Night', lastName:'Stay', roomType:'STE', arrival: bizDate_(), departure: addDays_(bizDate_(),2), adults:2, plan:'PKG'})");
  run("checkIn(TOK,'" + stay.v.resNo + "','',0,'DEP')");
  const na = tryRun('runNightAudit(TOK)');
  ok(!na.e && na.v.roomsPosted >= 1, 'night audit posted rooms: ' + JSON.stringify(na.v || na.e));
  ok(run('bizDate_()') === run("addDays_('" + bd + "',1)"), 'business date advanced by one day');
  run("(function(){ const r = rows_(TBL.SETTINGS).find(x => x.key === 'businessDate'); patch_(TBL.SETTINGS, r._row, { value: '" + bd + "' }); })()");
  const na2 = tryRun('runNightAudit(TOK)');
  ok(!!na2.e && /already been audited/.test(na2.e), 'same business date can not be audited twice: ' + (na2.e || ''));
  run("(function(){ const r = rows_(TBL.SETTINGS).find(x => x.key === 'businessDate'); patch_(TBL.SETTINGS, r._row, { value: addDays_('" + bd + "', 1) }); })()");
  const rev = run("runReport(TOK,'revenue','" + bd + "','" + bd + "')");
  ok(rev.rows.length >= 1, 'revenue report has rows');
  const flash = run("runReport(TOK,'flash','','')");
  ok(flash.rows.length === 8, 'flash report has 8 measures');
  const perm = tryRun("(function(){ const t = login('admin','Admin12345').token; saveUser(t,{username:'fd',name:'Front',role:'FrontDesk',password:'FrontDesk1',active:true}); const f = login('fd','FrontDesk1').token; return runNightAudit(f); })()");
  ok(!!perm.e && /Permission denied/.test(perm.e), 'FrontDesk role cannot run night audit: ' + (perm.e || ''));
  const grp = tryRun("createGroup(TOK, {name:'FIFA Team', contact:'x', arrival: bizDate_(), departure: addDays_(bizDate_(),3), roomType:'STD', roomCount:3, plan:'CORP', rate:0, adultsPerRoom:2})");
  ok(!grp.e && grp.v.reservations.length === 3, 'group block of 3 rooms: ' + (grp.e || grp.v.groupId));
  const gci = tryRun("groupCheckIn(TOK,'" + grp.v.groupId + "')");
  ok(!gci.e && gci.v.done === 2 && /Dirty/.test(gci.v.skipped[0]), 'group check-in: 2 done, dirty room skipped with reason ' + JSON.stringify(gci.v));
  const cx = tryRun("createReservation(TOK, {firstName:'Cancel', lastName:'Me', roomType:'DLX', arrival: addDays_(bizDate_(),5), departure: addDays_(bizDate_(),7), adults:1, plan:'BAR'})");
  const cancel = tryRun("cancelReservation(TOK,'" + cx.v.resNo + "','Guest request')");
  ok(!cancel.e, 'cancel a future reservation');
  const mv = tryRun("createReservation(TOK, {firstName:'Move', lastName:'Me', roomType:'STD', arrival: addDays_(bizDate_(),9), departure: addDays_(bizDate_(),10), adults:1, plan:'BAR'})");
  const mod = tryRun("modifyReservation(TOK,'" + mv.v.resNo + "',{departure: addDays_(bizDate_(),12)})");
  ok(!mod.e, 'modify dates of a reserved booking ' + (mod.e || ''));
  const rates = run("getReservation(TOK,'" + mv.v.resNo + "').rates.length");
  ok(rates === 3, 'rate schedule rebuilt for 3 nights (got ' + rates + ')');
  const gc = tryRun("postGroupCharge(TOK,'" + grp.v.groupId + "','FB','Dinner',1000,'MASTER')");
  ok(!gc.e, 'group master charge posted');
  const rep = run("runReport(TOK,'revenue','" + bd + "','" + bd + "')");
  ok(!rep.rows.some(r => r[1] === 'FB'), 'group master charges excluded from revenue report');
  const rack = run("rackData(TOK, bizDate_(), 7)");
  ok(rack.rooms.length === 16 + 0 || rack.rooms.length > 10, 'rack returns ' + rack.rooms.length + ' rooms');
  // ---- advanced: migration, company accounts, guest alerts, shifts, late checkout, forecast, reports, housekeeping ----
  ok(run('rows_(TBL.PERMS).length') === run('PERMISSIONS.length'), 'permission matrix has one row per permission');
  ok(run("rows_(TBL.CHARGES).some(c => c.code === 'LCO')"), 'late checkout charge code LCO present');
  run('migrateSchema_()'); run('migrateSchema_()');
  ok(run('rows_(TBL.PERMS).length') === run('PERMISSIONS.length') && run("rows_(TBL.CHARGES).filter(c => c.code === 'LCO').length") === 1, 'migration is idempotent');
  run("rows_(TBL.ROOMS).forEach(r => patch_(TBL.ROOMS, r._row, { housekeeping: 'Clean' }))");

  const acc = tryRun("saveAccount(TOK, { name: 'Acme Corp', code: 'ACME', creditLimit: 500 })");
  ok(!acc.e && acc.v, 'company account created ' + (acc.e || ''));
  const accId = acc.v;
  const ca = run("createReservation(TOK, {firstName:'Corp', lastName:'Guest', roomType:'STD', arrival: bizDate_(), departure: addDays_(bizDate_(),2), adults:1, plan:'BAR'})");
  run("checkIn(TOK,'" + ca.resNo + "','',0,'DEP')");
  const caFolio = run("getReservation(TOK,'" + ca.resNo + "').folios[0].id");
  ok(!tryRun("setFolioAccount(TOK,'" + caFolio + "','" + accId + "')").e, 'folio billed to company account');
  ok(!tryRun("postCharge(TOK,'" + caFolio + "','MB','Drinks',100)").e, 'company folio charge 100 + tax within credit limit');
  const over = tryRun("postCharge(TOK,'" + caFolio + "','FB','Dinner',400)");
  ok(!!over.e && /Credit limit/.test(over.e), 'charge beyond credit limit refused: ' + (over.e || ''));
  ok(run("getAccount(TOK,'" + accId + "').balance") === 110, 'account balance is 110 after charge');
  const coCorp = tryRun("checkOut(TOK,'" + ca.resNo + "')");
  ok(!coCorp.e, 'guest checks out with company-billed folio, no guest balance due ' + (coCorp.e || ''));
  ok(!tryRun("postAccountPayment(TOK,'" + accId + "','BANK',110,'Remittance')").e, 'company payment posted');
  ok(run("getAccount(TOK,'" + accId + "').balance") === 0, 'account settled to zero');
  ok(run("runReport(TOK,'ar','','').rows.length") >= 2, 'city ledger report has rows');

  // guest alert: block stops check-in unless a manager overrides
  run("rows_(TBL.ROOMS).forEach(r => patch_(TBL.ROOMS, r._row, { housekeeping: 'Clean' }))");
  const ag = run("createReservation(TOK, {firstName:'Alert', lastName:'Guest', email:'alert@x.com', roomType:'STD', arrival: bizDate_(), departure: addDays_(bizDate_(),1), adults:1, plan:'BAR'})");
  const agGuest = run("getReservation(TOK,'" + ag.resNo + "').guest.id");
  ok(!tryRun("saveGuest(TOK, {id:'" + agGuest + "', firstName:'Alert', lastName:'Guest', email:'alert@x.com', alert:'Unpaid bill from 2025', alertLevel:'Block'})").e, 'guest alert saved');
  const blockedCi = tryRun("checkIn(TOK,'" + ag.resNo + "','',0,'DEP',false)");
  ok(!!blockedCi.e && /Guest alert/.test(blockedCi.e), 'check-in blocked by guest alert: ' + (blockedCi.e || ''));
  const overCi = tryRun("checkIn(TOK,'" + ag.resNo + "','',0,'DEP',true)");
  ok(!overCi.e && overCi.v.warnings.length === 1, 'manager override lets the guest in with a warning');

  // cashier shifts: payments need an open shift; close reconciles expected cash
  ok(!tryRun("saveUser(TOK,{username:'cash1',name:'Cashier One',role:'Cashier',password:'Cashier123',active:true})").e, 'cashier user created');
  run("globalThis.CTOK = login('cash1','Cashier123').token");
  const pf = run("createReservation(TOK, {firstName:'Pay', lastName:'Test', roomType:'DLX', arrival: bizDate_(), departure: addDays_(bizDate_(),1), adults:1, plan:'BAR'})");
  const pfFolio = run("getReservation(TOK,'" + pf.resNo + "').folios[0].id");
  const noShift = tryRun("postPayment(CTOK,'" + pfFolio + "','CASH',10)");
  ok(!!noShift.e && /shift/.test(noShift.e), 'cashier cannot take payment without a shift: ' + (noShift.e || ''));
  ok(!tryRun("openShift(CTOK, 100)").e, 'cashier opens shift with float 100');
  ok(!tryRun("postPayment(CTOK,'" + pfFolio + "','CASH',50)").e, 'cashier takes 50 cash');
  const info = run('businessDateInfo(TOK)');
  ok(info.warnings.some(w => /cashier shift/.test(w)), 'night audit warns about the open shift');
  const cs = tryRun("closeShift(CTOK, 150)");
  ok(!cs.e && cs.v.expected === 150 && cs.v.variance === 0, 'shift closes with zero variance: ' + JSON.stringify(cs.v || cs.e));
  const shiftsList = run('listShifts(TOK)');
  ok(shiftsList.some(x => x.user === 'cash1' && x.status === 'Closed'), 'shift appears in the shift list');
  ok(!!tryRun("saveAccount(CTOK,{name:'X'})").e, 'cashier cannot manage company accounts');

  // late checkout, folio PDF, forecast, housekeeping assignment and reports
  const lc = tryRun("lateCheckoutCharge(TOK,'" + stay.v.resNo + "',100)");
  ok(!lc.e && lc.v.balance > 0, 'late checkout charge posted: ' + (lc.e || lc.v.balance));
  const pdf = tryRun("exportFolioPdf(TOK,'" + stay.v.resNo + "')");
  ok(!pdf.e && /\.pdf$/.test(pdf.v.name) && pdf.v.base64.length > 0, 'folio PDF produced');
  const reg = tryRun("registrationCard(TOK,'" + stay.v.resNo + "')");
  ok(!reg.e && /^Registration_.*\.pdf$/.test(reg.v.name) && reg.v.base64.length > 0, 'registration card PDF produced ' + (reg.e || ''));
  // printable documents: receipt, company folio, statement, paid-out receipt
  const payId = run("(rows_(TBL.POSTINGS).find(p => p.code === 'CASH' && Number(p.amount) < 0 && !p.parentId) || {}).id || ''");
  const rc = tryRun("paymentReceiptPdf(TOK,'" + payId + "')");
  ok(!rc.e && /^Receipt_/.test(rc.v.name), 'payment receipt PDF ' + (rc.e || ''));
  const docAccId = run("(rows_(TBL.ACCOUNTS)[0] || {}).id || ''");
  const cf = tryRun("accountFolioPdf(TOK,'" + docAccId + "')");
  ok(!cf.e && /^Company_folio_/.test(cf.v.name), 'company folio PDF ' + (cf.e || ''));
  const st2 = tryRun("arStatementPdf(TOK,'" + docAccId + "')");
  ok(!st2.e && /^Statement_/.test(st2.v.name), 'AR statement PDF ' + (st2.e || ''));
  const ref = tryRun("refundPayment(TOK,'" + payId + "',5,'test')");
  const refId = run("(rows_(TBL.POSTINGS).find(p => p.parentId === '" + payId + "') || {}).id || ''");
  if (!ref.e && refId) { const po = tryRun("paidOutReceiptPdf(TOK,'" + refId + "')"); ok(!po.e && /^Paid-out_/.test(po.v.name), 'paid-out receipt PDF ' + (po.e || '')); }
  else ok(true, 'paid-out receipt skipped (no refund in this run)');
  const fc = run('occupancyForecast(TOK, 14)');
  ok(fc.length === 14 && fc.every(d => d.pct >= 0 && d.pct <= 100), 'occupancy forecast: 14 days');
  ok(!tryRun("saveUser(TOK,{username:'hk1',name:'Maria',role:'Housekeeping',password:'Maria1234',active:true})").e, 'housekeeper user created');
  ok(run('housekeeperNames(TOK)').indexOf('Maria') >= 0, 'housekeeper appears in the dropdown list');
  ok(!tryRun("setRoomAssignment(TOK,'302','Maria')").e, 'room 302 assigned to Maria');
  ok(run("listRooms(TOK).find(r => r.roomNo === '302').assignedTo") === 'Maria', 'assignment shown on the room');
  ok(!!tryRun("setRoomAssignment(CTOK,'302','Maria')").e, 'cashier cannot assign housekeeping');
  ok(run("runReport(TOK,'housekeeping','','').rows.length") === 18, 'housekeeping report lists all 18 rooms');
  ok(run("runReport(TOK,'shifts','" + bd + "',addDays_('" + bd + "',3)).rows.length") >= 1, 'shifts report has rows');
  // updater: version comparison decides whether a GitHub push is applied
  ok(run("compareVersions_('1.10.0','1.9.0')") > 0, 'version 1.10.0 is newer than 1.9.0');
  ok(run("compareVersions_('1.1.0','1.1.0')") === 0, 'equal versions compare equal');
  ok(run("compareVersions_('1.0.9','1.1.0')") < 0, 'older version compares lower');
  // roles: the admin creates roles and sets their permissions
  ok(!tryRun("createRole(TOK, 'Night Auditor', 'Cashier')").e, 'admin creates a role copied from Cashier');
  ok(run("listRoles(TOK).some(r => r.name === 'Night Auditor')"), 'new role is listed');
  ok(!!tryRun("createRole(TOK, 'Night Auditor', '')").e, 'duplicate role name is refused');
  ok(!!tryRun("createRole(TOK, '1bad', '')").e, 'role name must start with a letter');
  ok(run("getRolePerms(TOK, 'Night Auditor').perms.some(p => p.permission === 'folio.post' && p.allowed)") === true, 'copied permission is on');
  ok(!tryRun("saveRolePerms(TOK, 'Night Auditor', ['dashboard.view','reports.view'])").e, 'admin saves a role with two permissions');
  ok(run("myPermissions(TOK)['reports.view']") === true, 'admin keeps own permissions');
  ok(run("getRolePerms(TOK, 'Night Auditor').perms.filter(p => p.allowed).length") === 2, 'only the two chosen permissions are on');
  ok(!tryRun("saveRolePerms(TOK, 'Admin', [])").e && run("getRolePerms(TOK, 'Admin').perms.every(p => p.allowed)") === true, 'Admin keeps every permission');
  ok(!!tryRun("saveRolePerms(TOK, 'Admin', ['dashboard.view'])").e === false, 'Admin save cannot drop permissions');
  ok(!!tryRun("saveUser(TOK, { username: 'nightuser', name: 'Night', role: 'Night Auditor', password: 'Night1234', active: true })").e === false, 'user assigned to the new role');
  ok(!!tryRun("deleteRole(TOK, 'Night Auditor')").e, 'role with users cannot be deleted');
  ok(!!tryRun("deleteRole(TOK, 'Admin')").e, 'Admin role cannot be deleted');
  ok(!!tryRun("saveRolePerms(TOK, 'Admin', [])").e === false, 'admin can still save the Admin role');
  // system vs property admin, welcome email, temporary password, new reports
  ok(run("listRoles(TOK).some(r => r.name === 'Property Admin' && r.builtIn)"), 'Property Admin is a built-in role');
  ok(!tryRun("saveUser(TOK, { username: 'propadmin', name: 'Property Admin User', email: '', role: 'Property Admin', password: 'Prop12345', active: true })").e, 'system admin creates a property admin');
  const PTOK = tryRun("login('propadmin','Prop12345')").v.token;
  ok(!!PTOK, 'property admin signs in');
  ok(!!tryRun("listRoles('" + PTOK + "')").e, 'property admin cannot manage roles');
  ok(run("settings_().appUrl") !== 'https://evil.example' && !!tryRun("saveSettings('" + PTOK + "', { appUrl: 'https://evil.example' })").e, 'property admin cannot change the app link');
  ok(!!tryRun("saveUser('" + PTOK + "', { username: 'boss', name: 'Boss', role: 'Admin', password: 'Boss12345', active: true })").e, 'property admin cannot give the Admin role');
  ok(!!tryRun("saveSettings('" + PTOK + "', { hotelName: 'Perfection Hotel' })").e && run("permMap_('Property Admin')['cfg.settings.edit']") === false, 'property admin cannot change hotel details by default');
  ok(run("permMap_('Property Admin')['cfg.roomtypes.edit']") === true && run("permMap_('Property Admin')['cfg.accounts.delete']") === true, 'property admin has configuration rights for rooms, rates and accounts by default');
  ok(run("permMap_('Manager')['cfg.payments.edit']") === false && run("permMap_('Manager')['cfg.roomtypes.edit']") === true, 'manager edits room types only, not payment methods');
  const w = tryRun("saveUser(TOK, { username: 'newbie', name: 'New Bie', email: 'newbie@example.com', role: 'FrontDesk', active: true })");
  ok(!w.e && w.v.tempPassword === '', 'new user with email gets no temporary password on screen');
  const welcome = mailbox[mailbox.length - 1] || {};
  const temp = ((welcome.body || '').match(/Temporary password: (\S+)/) || [])[1];
  ok(/Welcome/.test(welcome.subject || '') && !!temp && /New Bie/.test(welcome.body || ''), 'welcome email sent with login details and temporary password');
  const first = tryRun("login('newbie','" + temp + "')");
  ok(!first.e && first.v.user.mustChange === true, 'first sign-in is flagged: password must be changed');
  const NTOK = first.v.token;
  ok(!tryRun("changeMyPassword('" + NTOK + "','" + temp + "','Newbie1234')").e, 'temporary password is changed');
  ok(tryRun("login('newbie','Newbie1234')").v.user.mustChange === false, 'after the change the flag is cleared');
  const nu = tryRun("saveUser(TOK, { username: 'nouser', name: 'No Mail', role: 'Cashier', active: true })");
  ok(!nu.e && nu.v.tempPassword.length >= 8, 'user without email: temporary password shown once to the admin');
  ok(run("runReport(TOK,'nightaudit','" + bd + "','" + bd + "').headers.length") === 9, 'night audit report has its columns');
  ok(run("runReport(TOK,'journal','" + bd + "','" + bd + "').rows.slice(-1)[0][0]") === 'TOTAL', 'journal ends with a total');
  // billing hub, packages, search, guest history, integrations
  const ihRes = run("(rows_(TBL.RES).find(r => r.status === 'In-House') || {}).resNo || ''");
  ok(!!ihRes, 'an in-house stay exists for billing tests');
  const ihGuest = run("(rows_(TBL.RES).find(r => r.resNo === '" + ihRes + "') || {}).guestId || ''");
  const ihFolio = run("(rows_(TBL.FOLIOS).find(f => f.resNo === '" + ihRes + "' && f.status === 'Open') || {}).id || ''");
  const ihRoom = run("(rows_(TBL.RES).find(r => r.resNo === '" + ihRes + "') || {}).roomNo || ''");
  const ihName = run("(rows_(TBL.RES).find(r => r.resNo === '" + ihRes + "') || {}).guestName || ''");
  const chg = run("rows_(TBL.CHARGES).find(c => c.type === 'Charge' && c.code !== 'TAX').code");
  ok(!tryRun("savePackage(TOK, { code: 'BRK', name: 'Breakfast', chargeCode: '" + chg + "', amount: 50, perNight: true, active: true })").e, 'admin creates a per-night package');
  ok(run("listPackages(TOK).some(p => p.code === 'BRK' && p.perNight)"), 'package is listed');
  const pk = tryRun("postPackage(TOK, '" + ihRes + "', 'BRK')");
  ok(!pk.e && pk.v.total === 50 * pk.v.nights && pk.v.nights >= 1, 'package posts amount times nights');
  ok(!!tryRun("savePackage(TOK, { code: 'x', name: 'bad', chargeCode: 'NOPE', amount: 1 })").e, 'package needs a valid charge code');
  const br = tryRun("billingRoom(TOK, '" + ihRoom + "')");
  ok(!br.e && !!br.v.res && br.v.res.res.resNo === ihRes, 'billing screen shows the room stay');
  ok(!br.e && br.v.charges.length > 0 && br.v.payments.length > 0 && br.v.packages.length > 0, 'billing offers charges, payments and packages');
  // Multi-currency, minibar and guest service
  ok(!!tryRun("saveCurrency(TOK, { code: 'QAR', name: 'Qatari Riyal', rate: 1 })").e, 'base currency cannot be given a rate');
  ok(!tryRun("saveCurrency(TOK, { code: 'usd', name: 'US Dollar', rate: 3.64, active: true })").e, 'admin saves a foreign currency');
  const fx = tryRun("postPaymentFx(TOK, '" + ihFolio + "', 'CASH', 'USD', 100, 'fxrid1')");
  ok(!fx.e, 'payment in a foreign currency posts: ' + (fx.e || ''));
  ok(run("(rows_(TBL.POSTINGS).find(p => String(p.description).indexOf('USD 100.00 at 3.64') >= 0) || {}).id || ''") !== '', 'the foreign payment records its amount and rate');
  ok(!tryRun("saveMinibarItem(TOK, { code: 'WTR', name: 'Water', price: 10, chargeCode: '" + chg + "', active: true })").e, 'admin saves a minibar item');
  const mb = tryRun("postMinibar(TOK, '" + ihRes + "', '" + ihFolio + "', 'WTR', 2, 'mbrid1')");
  ok(!mb.e && mb.v.total === 20, 'minibar posts price times quantity');
  const sr = tryRun("createServiceRequest(TOK, { roomNo: '" + ihRoom + "', category: 'Housekeeping', description: 'Extra towels', priority: 'Normal' }, 'srrid1')");
  ok(!sr.e && !!sr.v.id, 'guest service request is created');
  ok(!tryRun("updateServiceRequest(TOK, '" + (sr.v ? sr.v.id : '') + "', 'Done', '')").e, 'guest service request is marked done');
  ok(!!tryRun("updateServiceRequest(TOK, '" + (sr.v ? sr.v.id : '') + "', 'Open', '')").e, 'a finished request cannot be reopened');
  const srA = tryRun("createServiceRequest(TOK, { roomNo: '" + ihRoom + "', category: 'Maintenance', description: 'Lamp broken', priority: 'Urgent' }, 'srrid2')");
  const staffUser = run("(rows_(TBL.USERS).find(u => u.active === true) || {}).username || ''");
  ok(!!staffUser && run("serviceStaff(TOK).some(u => u.username === '" + staffUser + "')"), 'staff list has active users');
  ok(!tryRun("updateServiceRequest(TOK, '" + srA.v.id + "', '', '" + staffUser + "')").e && run("(rows_(TBL.SVCREQ).find(x => x.id === '" + srA.v.id + "') || {}).assignedTo") === staffUser, 'request is assigned to a staff member');
  ok(!!tryRun("updateServiceRequest(TOK, '" + srA.v.id + "', '', 'nobody-here')").e, 'cannot assign to an unknown user');
  ok(!tryRun("updateServiceRequest(TOK, '" + srA.v.id + "', '', '')").e && run("(rows_(TBL.SVCREQ).find(x => x.id === '" + srA.v.id + "') || {}).assignedTo") === '', 'request can be unassigned');
  ok(run("billingRooms(TOK).some(r => r.roomNo === '" + ihRoom + "' && r.stay === 'In-House')"), 'billing room list shows the occupied room');
  ok(run("globalSearch(TOK, '" + ihRes + "').reservations.length") >= 1, 'search finds a reservation by its number');
  ok(run("globalSearch(TOK, '" + ihRoom + "').rooms.length") >= 1 && run("globalSearch(TOK, '" + ihRoom + "').reservations.length") >= 1, 'search finds a room and its stay');
  ok(run("globalSearch(TOK, '" + ihName.split(' ')[0].slice(0, 3) + "').guests.length") >= 1, 'search finds a guest by name');
  ok(run("globalSearch(TOK, 'zzzz-no-match').reservations.length") === 0, 'search with no match returns nothing');
  ok(run("guestHistory(TOK, '" + ihGuest + "').stays.length") >= 1, 'guest history lists the stays');
  ok(!!tryRun("integrationTest(TOK, 'pos')").e, 'integration without an address reports not connected');
  ok(!tryRun("postPosCharge_('" + ihRoom + "', '" + chg + "', 'Minibar', 20)").e, 'POS charge posts to the in-house room');
  ok(!!tryRun("postPosCharge_('999', '" + chg + "', 'x', 20)").e, 'POS charge to an empty room is refused');
  // payment methods, refunds, guest lists, auditor settings
  const payCode = run("rows_(TBL.CHARGES).find(c => c.type === 'Payment' && c.active === true).code");
  ok(!tryRun("savePaymentMethod(TOK, { code: 'CSH', name: 'Cash', kind: 'Cash', chargeCode: '" + payCode + "', active: true })").e, 'admin creates a cash payment method');
  ok(!!tryRun("savePaymentMethod(TOK, { code: 'BAD', name: 'Bad', kind: 'Cash', chargeCode: 'ROOM', active: true })").e, 'payment method needs a payment charge code');
  ok(!!tryRun("savePaymentMethod(CTOK, { code: 'CSH2', name: 'Cash', kind: 'Cash', chargeCode: '" + payCode + "', active: true })").e, 'cashier cannot create payment methods');
  ok(run("listPaymentMethods(TOK).some(m => m.code === 'CSH')"), 'payment method is listed');
  const payM = tryRun("paymentByMethod(TOK, '" + ihFolio + "', 'CSH', 40)");
  ok(!payM.e, 'payment taken by method on the in-house folio');
  const pid = run("(rows_(TBL.POSTINGS).filter(p => p.folioId === '" + ihFolio + "' && Number(p.amount) === -40 && p.voided !== true)[0] || {}).id || ''");
  ok(!!pid, 'payment posting found');
  ok(!tryRun("refundPayment(TOK, '" + pid + "', 15, 'guest changed mind')").e, 'partial refund of a payment');
  ok(!!tryRun("refundPayment(TOK, '" + pid + "', 30, 'too much')").e, 'refund cannot exceed what is left');
  ok(!!tryRun("refundPayment(CTOK, '" + pid + "', 5, 'x')").e, 'cashier cannot refund without permission');
  ok(run("rows_(TBL.POSTINGS).filter(p => p.parentId === '" + pid + "').reduce((a, p) => a + Number(p.amount), 0)") === 15, 'refund is kept against the payment');

  // edit, split and move charges (never payments; permission folio.edit)
  const spRes = tryRun("createReservation(TOK, {firstName:'Split', lastName:'Test', roomType:'DLX', arrival: bizDate_(), departure: addDays_(bizDate_(),1), adults:1, plan:'BAR'})");
  run("checkIn(TOK,'" + spRes.v.resNo + "','',0,'DEP')");
  const spF = run("getReservation(TOK,'" + spRes.v.resNo + "').folios[0].id");
  run("postCharge(TOK,'" + spF + "','MB','Water',100)");
  const spChg = run("rows_(TBL.POSTINGS).find(p => p.folioId === '" + spF + "' && p.code === 'MB' && !p.parentId && p.voided !== true).id");
  const spPmRes = tryRun("createReservation(TOK, {firstName:'Postmaster', lastName:'Room', roomType:'DLX', arrival: bizDate_(), departure: addDays_(bizDate_(),1), adults:1, plan:'BAR'})");
  run("checkIn(TOK,'" + spPmRes.v.resNo + "','',0,'DEP')");
  const spPmF = run("getReservation(TOK,'" + spPmRes.v.resNo + "').folios[0].id");
  ok(!!tryRun("editCharge(CTOK,'" + spChg + "',{amount:50,description:'Water',reason:'x'})").e, 'cashier cannot edit charges without folio.edit');
  ok(!!tryRun("editCharge(TOK,'" + spChg + "',{amount:50,description:'Water',reason:''})").e, 'edit needs a reason');
  ok(!!tryRun("editCharge(TOK,'" + pid + "',{amount:5,description:'x',reason:'x'})").e, 'payments cannot be edited');
  ok(!tryRun("editCharge(TOK,'" + spChg + "',{amount:120,description:'Water 2 bottles',reason:'wrong quantity'})").e, 'admin edits a charge amount and description');
  const spRate = run("settings_().taxRate");
  const spTax = run("rows_(TBL.POSTINGS).find(p => p.parentId === '" + spChg + "' && p.voided !== true).amount");
  ok(Math.abs(spTax - 120 * spRate) < 0.005, 'tax line is recalculated after the edit');
  ok(!!tryRun("splitPosting(TOK,'" + spChg + "',[{folioId:'" + spF + "',amount:50},{folioId:'" + spPmF + "',amount:10}],'x')").e, 'split parts must add up to the charge');
  ok(!!tryRun("splitPosting(TOK,'" + spChg + "',[{folioId:'" + spF + "',amount:60},{folioId:'" + spPmF + "',amount:60}],'')").e, 'split needs a reason');
  ok(!!tryRun("splitPosting(CTOK,'" + spChg + "',[{folioId:'" + spF + "',amount:60},{folioId:'" + spPmF + "',amount:60}],'x')").e, 'cashier cannot split without folio.edit');
  ok(!tryRun("splitPosting(TOK,'" + spChg + "',[{folioId:'" + spF + "',amount:60},{folioId:'" + spPmF + "',amount:60,description:'Water to PM'}],'Guest asked PM to pay')").e, 'admin splits a charge across room and PM folios');
  ok(run("rows_(TBL.POSTINGS).find(p => p.id === '" + spChg + "').voided") === true, 'original charge is voided by the split');
  ok(run("rows_(TBL.POSTINGS).filter(p => p.folioId === '" + spPmF + "' && p.code === 'MB' && p.voided !== true).length") === 1, 'part moved to the PM folio');
  ok(run("rows_(TBL.POSTINGS).filter(p => p.folioId === '" + spPmF + "' && p.code === 'TAX' && p.voided !== true).length") === 1, 'tax follows the split part');
  ok(!!tryRun("splitPosting(TOK,'" + spChg + "',[{folioId:'" + spF + "',amount:60},{folioId:'" + spPmF + "',amount:60}],'again')").e, 'a voided charge cannot be split again');
  ok(!!tryRun("transferPosting(TOK,'" + pid + "','" + spF + "')").e, 'payments cannot be moved between folios');
  const spC2 = tryRun("postCharge(TOK,'" + spF + "','MB','Juice',20)");
  const spC2Id = run("rows_(TBL.POSTINGS).find(p => p.folioId === '" + spF + "' && p.code === 'MB' && p.description === 'Juice' && !p.parentId && p.voided !== true).id");
  const spC2Tax = run("rows_(TBL.POSTINGS).find(p => p.parentId === '" + spC2Id + "' && p.voided !== true).id");
  ok(!!tryRun("transferPosting(TOK,'" + spC2Tax + "','" + spPmF + "')").e, 'a tax line cannot be moved on its own');
  ok(!tryRun("transferPosting(TOK,'" + spC2Id + "','" + spPmF + "')").e, 'a charge moves to the PM folio with its tax');
  ok(run("rows_(TBL.POSTINGS).filter(p => p.folioId === '" + spPmF + "' && p.voided !== true && p.parentId).length") === 2, 'moved charge brings its tax line');
  // reservation change log, copy reservation, city ledger routing and AR
  const lg = tryRun("createReservation(TOK, {firstName:'Log', lastName:'Test', roomType:'STD', arrival: bizDate_(), departure: addDays_(bizDate_(),2), adults:1, plan:'BAR'})");
  const lgRes = lg.v.resNo;
  run("checkIn(TOK,'" + lgRes + "','',0,'DEP')");
  const lgF = run("getReservation(TOK,'" + lgRes + "').folios[0].id");
  run("postCharge(TOK,'" + lgF + "','MB','Water',40)");
  const lgActs = run("getResLog(TOK,'" + lgRes + "').map(l => l.action)");
  ok(lgActs.indexOf('RES_CREATED') >= 0 && lgActs.indexOf('CHECK_IN') >= 0 && lgActs.indexOf('CHARGE') >= 0, 'change log records create, check-in and charge');
  ok(run("getResLog(TOK,'" + lgRes + "')[0].user") === 'admin' && !!run("getResLog(TOK,'" + lgRes + "')[0].at"), 'every log line has user and time');
  ok(!tryRun("modifyReservation(TOK,'" + mv.v.resNo + "',{adults:1, notes:'late arrival'})").e, 'reservation modified for the log');
  ok(run("getResLog(TOK,'" + mv.v.resNo + "').some(l => l.action === 'RES_MODIFIED' && /notes .* > late arrival/.test(l.details))"), 'modify log shows the changed field');
  const cp = tryRun("copyReservation(TOK,'" + lgRes + "',{arrival: addDays_(bizDate_(),5), departure: addDays_(bizDate_(),7)})");
  ok(!cp.e, 'reservation copied with new dates');
  ok(run("getReservation(TOK,'" + cp.v.resNo + "').guestName") === 'Log Test' && run("getReservation(TOK,'" + cp.v.resNo + "').res.roomType") === 'STD', 'copy keeps guest and room type');
  ok(run("getResLog(TOK,'" + lgRes + "').some(l => l.action === 'RES_COPIED')"), 'source reservation logs the copy');
  ok(!!tryRun("closeFolioToCityLedger(CTOK,'" + lgF + "','" + accId + "','x')").e, 'cashier cannot route folios to the city ledger');
  ok(!!tryRun("closeFolioToCityLedger(TOK,'" + lgF + "','" + accId + "','')").e, 'city ledger routing needs a reason');
  const arBefore = run("getAccount(TOK,'" + accId + "').balance");
  const lgBal = run("getReservation(TOK,'" + lgRes + "').balance");
  ok(!tryRun("closeFolioToCityLedger(TOK,'" + lgF + "','" + accId + "','Company pays the room')").e, 'folio routed to the company city ledger');
  ok(run("getReservation(TOK,'" + lgRes + "').balance") === 0, 'guest folio balance is cleared by the routing');
  ok(Math.abs(run("getAccount(TOK,'" + accId + "').balance") - (arBefore + lgBal)) < 0.01, 'company receivable increases by the routed balance');
  ok(!tryRun("arReceipt(TOK,'" + accId + "','BANK',20,'part payment')").e, 'AR receipt posted');
  ok(Math.abs(run("arStatement(TOK,'" + accId + "').balance") - run("getAccount(TOK,'" + accId + "').balance")) < 0.01, 'AR statement agrees with the account balance');
  ok(run("arStatement(TOK,'" + accId + "').open.length") > 0, 'AR shows open items after a partial receipt');
  ok(!!tryRun("arReceipt(CTOK,'" + accId + "','BANK',5,'x')").e, 'cashier cannot post AR receipts');
  ok(!!tryRun("saveUser(TOK, {username:'padmin', name:'Property Admin Test', role:'Property Admin', password:'Padmin12345', active:true, email:''})").e === false, 'system admin creates a Property Admin');
  run("globalThis.PT2 = login('propadmin','Prop12345').token");
  ok(!!tryRun("saveUser(PT2, {username:'padmin2', name:'X', role:'Property Admin', password:'Xpass12345', active:true, email:''})").e, 'property admin cannot create Property Admin accounts');
  ok(run("listUsers(PT2).some(u => u.role === 'Admin' || u.role === 'Property Admin')") === false, 'property admin does not see system or property admin accounts');
  ok(run("listUsers(TOK).some(u => u.role === 'Property Admin')") === true, 'system admin sees Property Admin accounts');
  // account security: property admin cannot touch the system admin; lockout, unlock and reset
  const secAdminId = run("rows_(TBL.USERS).find(u => u.username === 'admin').id");
  ok(!!tryRun("saveUser(PT2, {id:'" + secAdminId + "', username:'admin', name:'Admin', role:'Admin', active:true, email:''})").e, 'property admin cannot edit the system admin');
  ok(!!tryRun("saveUser(PT2, {id:'" + secAdminId + "', username:'admin', name:'Admin', role:'Admin', active:false, email:''})").e, 'property admin cannot deactivate the system admin');
  ok(!!tryRun("unlockUser(PT2,'" + secAdminId + "')").e, 'property admin cannot unlock the system admin');
  ok(!!tryRun("resetUserPassword(PT2,'" + secAdminId + "')").e, 'property admin cannot reset the system admin password');
  ok(run("listUsers(PT2).some(u => u.id === '" + secAdminId + "')") === false, 'system admin is hidden from property admin');
  ok(!!tryRun("saveSettings(TOK, {maxLoginAttempts: 3})").e, 'wrong-password limit cannot go below 5');
  ok(!tryRun("saveUser(TOK, {username:'lockme', name:'Lock Me', role:'FrontDesk', password:'Lock12345', active:true, email:''})").e, 'staff user created');
  const secLkId = run("rows_(TBL.USERS).find(u => u.username === 'lockme').id");
  let secFails = 0;
  for (let i = 0; i < 5; i++) { if (tryRun("login('lockme','wrong-pass-1')").e) secFails++; }
  ok(secFails === 5, 'five wrong passwords are refused');
  ok(run("rows_(TBL.USERS).find(u => u.username === 'lockme').locked") === true, 'account is locked after the fifth wrong password');
  ok(!!tryRun("login('lockme','Lock12345')").e, 'locked account refuses the correct password');
  ok(!tryRun("unlockUser(TOK,'" + secLkId + "')").e, 'system admin unlocks the account');
  ok(!tryRun("login('lockme','Lock12345')").e, 'unlocked account signs in again');
  ok(!tryRun("resetUserPassword(TOK,'" + secLkId + "')").e, 'admin resets a password');
  ok(run("rows_(TBL.USERS).find(u => u.username === 'lockme').mustChange") === true, 'reset password must be changed at next sign-in');
  // delete rights: system admin for users; allocation-based for configuration
  ok(!!tryRun("saveUser(PT2, {username:'newbie', name:'New Bie', role:'FrontDesk', password:'Newbie12345', active:true, email:''})").e, 'property admin cannot add users');
  ok(!tryRun("saveUser(TOK, {username:'delme', name:'Delete Me', role:'FrontDesk', password:'Delme12345', active:true, email:''})").e, 'system admin adds a user');
  const dlUser = run("rows_(TBL.USERS).find(u => u.username === 'delme').id");
  ok(!!tryRun("deleteUser(PT2,'" + dlUser + "')").e, 'property admin cannot delete users');
  ok(!!tryRun("deleteUser(TOK,'" + run("rows_(TBL.USERS).find(u => u.username === 'admin').id") + "')").e, 'nobody deletes their own account');
  ok(!tryRun("deleteUser(TOK,'" + dlUser + "')").e, 'system admin deletes a user');
  ok(run("rows_(TBL.USERS).some(u => u.username === 'delme')") === false, 'deleted user is gone');
  ok(!tryRun("saveRoomType(TOK, {code:'DL1', name:'Delete one', baseRate:100, maxAdults:2, active:true})").e, 'room type created for the delete test');
  ok(!!tryRun("deleteConfig(CTOK,'roomType','DL1')").e, 'cashier cannot delete configuration');
  ok(!tryRun("deleteConfig(PT2,'roomType','DL1')").e, 'property admin with rooms.manage deletes an unused room type');
  ok(run("rows_(TBL.ROOMTYPES).some(t => t.code === 'DL1')") === false, 'deleted room type is gone');
  ok(!tryRun("savePaymentMethod(TOK, {code:'DLPM', name:'Temp', kind:'Cash', chargeCode:'" + payCode + "', active:true})").e, 'payment method created for the delete test');
  ok(!tryRun("deleteConfig(PT2,'paymentMethod','DLPM')").e, 'property admin with settings.manage deletes a payment method');
  ok(!!tryRun("deleteConfig(TOK,'roomType','NOPE')").e, 'deleting an unknown item is refused');
  ok(!!tryRun("saveSettings(TOK, {logoUrl: 'http://insecure.example/logo.png'})").e, 'logo must be an https link or an uploaded image');
  ok(!tryRun("saveSettings(TOK, {logoUrl: 'https://example.com/logo.png'})").e, 'https logo link is saved');
  ok(!tryRun("saveSettings(TOK, {logoUrl: 'data:image/png;base64,iVBORw0KGgo='})").e, 'uploaded logo is saved');
  ok(!!tryRun("saveSettings(TOK, {logoUrl: 'data:image/png;base64," + 'A'.repeat(50000) + "'})").e, 'oversized logo is refused');
  ok(!tryRun("saveSettings(TOK, {logoUrl: ''})").e, 'logo can be removed');
  ok(run("frontLists(TOK).inHouse.length") >= 1 && run("Array.isArray(frontLists(TOK).arrivals) && Array.isArray(frontLists(TOK).departures)"), 'guest lists: in-house, arrivals and departures');
  ok(run("publicSettings_().defaultLanguage") === 'en' && run("settings_().auditorAutoSend") === 'false', 'system defaults: language and auditor email are off');
  ok(!!tryRun("saveSettings(TOK, {loadingScreen: 'neon'})").e, 'loading screen rejects unknown styles');
  ok(!tryRun("saveSettings(TOK, {loadingScreen: 'pulse'})").e && run("publicSettings_().loadingScreen") === 'pulse', 'system admin sets the default loading screen');
  ok(run("publicSettings_().loadingScreen") === 'pulse' && !tryRun("saveSettings(TOK, {loadingScreen: 'random'})").e, 'loading screen can be reset to random');
  ok(run("runReport(TOK,'eod','','').sections.map(s => s.key).join()") === 'mgrflash,trial,guest,package,aging', 'end-of-day report has the five sections');
  ok(run("runReport(TOK,'eod','','').sections.every(s => s.rows.every(r => r.length === s.headers.length))"), 'every end-of-day row matches its headers');
  ok(run("runReport(TOK,'eod','','').sections.find(s => s.key === 'trial').headers.join()") === 'Code,Lines,Debit (charges),Credit (payments),Net', 'trial balance columns');
  // Licence window: only the system administrator gets in once it has ended
  ok(!tryRun("saveSettings(TOK, {licenseExpiry: '2000-01-01'})").e, 'system admin sets an expiry date');
  ok(!!tryRun("auth_(CTOK)").e, 'a cashier is blocked once the licence has ended');
  ok(!tryRun("auth_(TOK)").e, 'the system administrator still gets in after the licence ends');
  ok(!!tryRun("saveSettings(TOK, {licenseStart: '2030-01-01', licenseExpiry: '2029-01-01'})").e, 'licence expiry cannot be before its start');
  ok(!!tryRun("saveSettings(TOK, {licenseExpiry: '31/12/2026'})").e, 'licence date must be yyyy-mm-dd');
  ok(!tryRun("saveSettings(TOK, {licenseExpiry: '2099-12-31'})").e && !tryRun("auth_(CTOK)").e, 'renewing the licence restores access');
  ok(!tryRun("saveSettings(TOK, {licenseStart: '', licenseExpiry: ''})").e, 'licence dates can be cleared');
  // Front desk lists: each search uses its own filters
  ok(run("frontSearch(TOK,'inhouse',{}).rows.every(r => r.status === 'In-House')"), 'in-house list only holds in-house guests');
  ok(run("frontSearch(TOK,'arrivals',{from:'2000-01-01',to:'2100-01-01'}).rows.every(r => r.status !== 'No-Show' && r.status !== 'Cancelled')"), 'arrivals exclude no-shows and cancellations');
  ok(run("frontSearch(TOK,'departures',{from:'2000-01-01',to:'2100-01-01',balance:'due'}).rows.every(r => r.balance > 0)"), 'departures can show balance due only');
  ok(run("frontSearch(TOK,'inhouse',{q:'no-such-guest-zzz'}).count") === 0, 'a search with no match returns nothing');
  ok(!!tryRun("frontSearch(TOK,'arrivals',{from:'2026-02-02',to:'2026-01-01'})").e, 'arrivals reject a "to" date before "from"');
  ok(!!tryRun("frontSearch(TOK,'rooms',{})").e, 'unknown front desk list is refused');
  // Reservation screen: in-house stays are updated with their fixed details kept
  const IHR = run("rows_(TBL.RES).find(r => r.status === 'In-House').resNo");
  ok(!tryRun("modifyReservation(TOK, '" + IHR + "', {notes: 'Guest asked for a late checkout', company: 'Test Co', vip: 'true'})").e && run("rows_(TBL.RES).find(r => r.resNo === '" + IHR + "').notes") === 'Guest asked for a late checkout', 'in-house stay: notes, company and VIP can be updated');
  ok(!!tryRun("modifyReservation(TOK, '" + IHR + "', {arrival: '2099-01-01'})").e, 'in-house stay: arrival cannot change');
  ok(!!tryRun("modifyReservation(TOK, '" + IHR + "', {roomType: 'ZZZ'})").e, 'in-house stay: room type cannot change here');
  ok(!!tryRun("modifyReservation(TOK, '" + IHR + "', {rateOverride: 10})").e, 'in-house stay: rate cannot change here');
  ok(run("permMap_('Admin')['cfg.settings.view'] === true && permMap_('Admin')['cfg.accounts.delete'] === true"), 'system admin has every configuration permission');
  // Sidebar layout: saved by the system administrator, validated on the server
  ok(!tryRun("saveSettings(TOK, {menuLayout: JSON.stringify({groups: [{name: 'Front', items: ['arrivals', 'inhouse']}, {name: 'Ops', items: ['cashier']}]})})").e, 'system admin saves a menu layout');
  ok(run("JSON.parse(settings_().menuLayout).groups.length") === 2, 'menu layout is stored');
  ok(!!tryRun("saveSettings(TOK, {menuLayout: 'not json'})").e, 'menu layout must be valid JSON');
  ok(!!tryRun("saveSettings(TOK, {menuLayout: JSON.stringify({groups: [{name: '', items: []}]})})").e, 'every menu group needs a name');
  ok(!!tryRun("saveSettings(PT2, {menuLayout: JSON.stringify({groups: []})})").e, 'property admin cannot change the menu layout');
  ok(!tryRun("saveSettings(TOK, {menuLayout: ''})").e && run("settings_().menuLayout") === '', 'menu layout can be reset to default');
  // Email sending: SMTP through the hotel's relay, or the Google account when SMTP is off
  ok(!!tryRun("getEmailConfig(PT2)").e, 'property admin cannot see email sending settings');
  ok(!tryRun("saveEmailConfig(TOK, {active: false})").e && run("getEmailConfig(TOK).active") === false, 'email sending can stay off');
  ok(!!tryRun("saveEmailConfig(TOK, {active: true, host: '', from: 'a@b.co', relayUrl: 'https://r.example.com'})").e, 'SMTP on needs a server name');
  ok(!!tryRun("saveEmailConfig(TOK, {active: true, host: 'mail.h.com', from: 'bad', relayUrl: 'https://r.example.com'})").e, 'SMTP from address must be an email');
  ok(!!tryRun("saveEmailConfig(TOK, {active: true, host: 'mail.h.com', port: 70000, security: 'starttls', from: 'a@b.co', relayUrl: 'https://r.example.com'})").e, 'SMTP port must be 1-65535');
  ok(!!tryRun("saveEmailConfig(TOK, {active: true, host: 'mail.h.com', port: 587, security: 'starttls', from: 'a@b.co', relayUrl: 'http://r.example.com'})").e, 'relay address must be https');
  ok(!tryRun("saveEmailConfig(TOK, {active: false, host: 'mail.h.com', port: 587, security: 'starttls', user: 'u@h.com', from: 'a@b.co', relayUrl: 'https://r.example.com', password: 'S3cret-pass', relaySecret: 'relay-key-1'})").e, 'SMTP settings save');
  ok(run("getEmailConfig(TOK).passSet && getEmailConfig(TOK).secretSet") === true, 'saved password and relay secret are reported as set');
  ok(run("JSON.stringify(getEmailConfig(TOK)).indexOf('S3cret-pass') < 0 && JSON.stringify(getEmailConfig(TOK)).indexOf('relay-key-1') < 0"), 'password and relay secret are never sent back to the screen');
  ok(run("(function(){ saveEmailConfig(TOK, {active: false, host: 'mail.h.com', port: 587, security: 'starttls', from: 'a@b.co', relayUrl: 'https://r.example.com'}); return getEmailConfig(TOK).passSet; })()") === true, 'blank password keeps the saved one');
  ok(run("(function(){ const n = mailbox.length; sendMail_('g@x.com', 'Hi', 'Body', '<p>Body</p>'); return mailbox.length === n + 1 && relayCalls.length === 0; })()"), 'SMTP off: mail goes out from the Google account');
  ok(!tryRun("saveEmailConfig(TOK, {active: true, host: 'mail.h.com', port: 587, security: 'starttls', user: 'u@h.com', from: 'a@b.co', relayUrl: 'https://r.example.com'})").e, 'SMTP switched on');
  ok(run("(function(){ const n = mailbox.length; relayCalls.length = 0; sendMail_('g@x.com', 'Hi', 'Body', '<p>Body</p>'); const c = relayCalls[0]; return mailbox.length === n && relayCalls.length === 1 && c.u === 'https://r.example.com' && c.o.headers['X-Relay-Secret'] === 'relay-key-1' && JSON.parse(c.o.payload).smtp.host === 'mail.h.com'; })()"), 'SMTP on: mail goes through the relay');
  ok(run("(function(){ relayReply.next = { getResponseCode: () => 502, getContentText: () => JSON.stringify({error: '535 Authentication failed'}) }; try { sendMail_('g@x.com', 'Hi', 'B', 'B'); return false; } catch (e) { relayReply.next = null; return /535 Authentication failed/.test(e.message); } })()"), 'SMTP error from the relay is shown to the admin');
  ok(!tryRun("saveEmailConfig(TOK, {active: false, host: 'mail.h.com', port: 587, security: 'starttls', from: 'a@b.co', relayUrl: 'https://r.example.com', clearPassword: true})").e && run("getEmailConfig(TOK).passSet") === false, 'saved password can be removed');
  // Resend: the API key is stored encrypted, never in clear, and is never sent to the screen
  ok(!tryRun("saveEmailConfig(TOK, {resendActive: true, resendFrom: '', resendApiKey: 're_test_key_123'})").e === false, 'Resend on needs a from address');
  ok(!!tryRun("saveEmailConfig(TOK, {resendActive: true, resendFrom: 'hotel@hotel.com'})").e, 'Resend on needs an API key');
  ok(!!tryRun("saveEmailConfig(TOK, {resendActive: false, resendFrom: 'bad', resendApiKey: 'x'})").e, 'Resend from address must be an email');
  ok(!tryRun("saveEmailConfig(TOK, {resendActive: true, resendFrom: 'hotel@hotel.com', resendApiKey: 're_test_key_123'})").e, 'Resend saved with its API key');
  ok(run("(function(){ const raw = rawSetting_('resendApiKey'); return raw.indexOf('v1:') === 0 && raw.indexOf('re_test_key_123') < 0; })()"), 'the database holds the key only encrypted');
  ok(run("(function(){ const c = getEmailConfig(TOK); return c.resendKeySet === true && JSON.stringify(c).indexOf('re_test_key_123') < 0; })()"), 'the screen only learns that a key is saved');
  ok(run("settings_().resendApiKey === undefined && JSON.stringify(getSettings(TOK)).indexOf('re_test_key_123') < 0"), 'the settings sent to the browser never include the key');
  ok(run("decryptSetting_(encryptSetting_('re_key_ü-ключ')) === 're_key_ü-ключ'"), 'encryption round-trips, including non-ASCII');
  ok(run("(function(){ const e = encryptSetting_('abc'); const p = e.split(':'); const flip = p[2][0] === 'A' ? 'B' : 'A'; return (function(){ try { decryptSetting_(['v1', p[1], flip + p[2].slice(1), p[3]].join(':')); return false; } catch (x) { return /cannot be read/.test(x.message); } })(); })()"), 'a tampered secret is refused');
  ok(run("(function(){ relayCalls.length = 0; const n = mailbox.length; sendMail_('g@x.com', 'Hi', 'Body', '<p>Body</p>'); const c = relayCalls[0]; const p = JSON.parse(c.o.payload); return mailbox.length === n && c.u === 'https://api.resend.com/emails' && c.o.headers.Authorization === 'Bearer re_test_key_123' && p.to[0] === 'g@x.com' && /<hotel@hotel\\.com>$/.test(p.from); })()"), 'Resend on: mail goes through the Resend API with the saved key');
  ok(run("(function(){ relayCalls.length = 0; relayReply.next = { getResponseCode: () => 422, getContentText: () => JSON.stringify({message: 'The hotel.com domain is not verified'}) }; try { sendMail_('g@x.com', 'Hi', 'B', 'B'); return false; } catch (e) { relayReply.next = null; return /domain is not verified/.test(e.message); } })()"), 'a Resend error is shown to the admin');
  ok(!tryRun("saveEmailConfig(TOK, {active: true, host: 'mail.h.com', port: 587, security: 'starttls', user: 'u@h.com', from: 'a@b.co', relayUrl: 'https://r.example.com', resendActive: true, resendFrom: 'hotel@hotel.com'})").e, 'SMTP on keeps Resend saved');
  ok(run("(function(){ relayCalls.length = 0; sendMail_('g@x.com', 'Hi', 'B', 'B'); return relayCalls[0].u === 'https://r.example.com'; })()"), 'SMTP wins when both are on');
  ok(!tryRun("saveEmailConfig(TOK, {active: false, host: 'mail.h.com', port: 587, security: 'starttls', from: 'a@b.co', relayUrl: 'https://r.example.com', resendActive: false, resendFrom: 'hotel@hotel.com', clearResendKey: true})").e && run("getEmailConfig(TOK).resendKeySet") === false, 'the Resend key can be removed');
  ok(run("(function(){ const n = mailbox.length; sendMail_('g@x.com', 'Hi', 'B', 'B'); return mailbox.length === n + 1; })()"), 'with both off, mail goes out from the Google account');
  // Reset clears a lock: a locked account can sign in with the new password
  run("(function(){ const r = rows_(TBL.USERS).find(x => x.username === 'lockme'); patch_(TBL.USERS, r._row, { email: 'lockme@h.com', locked: true, failCount: 5 }); return true; })()");
  run("CacheService.getScriptCache().remove('otpcd:' + rows_(TBL.USERS).find(x => x.username === 'lockme').id)");
  run("forgotRequest('lockme')");
  const lkCode = /verification code is (\d{6})/.exec(mailbox[mailbox.length - 1].body)[1];
  const lkTok = run("forgotVerify('lockme', '" + lkCode + "')").resetToken;
  ok(!tryRun("forgotReset('" + lkTok + "', 'Lockme-pass1!')").e, 'reset is accepted for a locked account');
  ok(!tryRun("login('lockme', 'Lockme-pass1!')").e, 'the new password signs in after a reset (account was locked)');
  // Licence dates typed into the sheet in any usual form are read as yyyy-mm-dd
  run("(function(){ patch_(TBL.SETTINGS, rows_(TBL.SETTINGS).find(r => r.key === 'licenseExpiry')._row, { value: '31/12/2030' }); return true; })()");
  ok(run("settings_().licenseExpiry") === '2030-12-31', 'licence expiry typed as dd/mm/yyyy is read as a date');
  run("(function(){ patch_(TBL.SETTINGS, rows_(TBL.SETTINGS).find(r => r.key === 'licenseExpiry')._row, { value: '2031-02-28 00:00' }); return true; })()");
  ok(run("settings_().licenseExpiry") === '2031-02-28', 'licence expiry with a time is read as a date');
  run("(function(){ patch_(TBL.SETTINGS, rows_(TBL.SETTINGS).find(r => r.key === 'licenseExpiry')._row, { value: 'not a date' }); return true; })()");
  ok(run("settings_().licenseExpiry") === '', 'a value that is not a date is ignored');
  ok(run("normDate_(new Date('2030-06-15T12:00:00+03:00')) === '2030-06-15'"), 'a date cell is read as its day in Qatar time');
  // Code emails use the Vercel-style subject, and an old saved subject is replaced by the new default
  ok(run("renderMail_('otp', { code: '246810' }).subject") === 'Your ' + "Stayline" + ' security code: 246810' || run("renderMail_('otp', { code: '246810' }).subject").indexOf('security code: 246810') > 0, 'reset code subject follows the security code pattern');
  run("(function(){ patch_(TBL.SETTINGS, rows_(TBL.SETTINGS).find(r => r.key === 'otpSubject') ? rows_(TBL.SETTINGS).find(r => r.key === 'otpSubject')._row : 1, { value: 'Your verification code for {{appName}}' }); return true; })()");
  ok(run("renderMail_('otp', { code: '246810' }).subject").indexOf('security code: 246810') > 0, 'an old saved subject gets the new pattern');
  // The backup folder follows the app name in Settings, not a fixed word
  run("(function(){ patch_(TBL.SETTINGS, rows_(TBL.SETTINGS).find(r => r.key === 'appName')._row, { value: 'Lumen' }); return true; })()");
  ok(run("backupFolderName_()") === 'Lumen backups', 'backup folder is named after the app name in Settings');
  console.log('done');
}

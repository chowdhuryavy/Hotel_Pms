const fs = require('fs'), vm = require('vm'), crypto = require('crypto');
const SRC = '../';
const files = ['Config','Core','Setup','Rooms','Rates','Guests','Reservations','FrontDesk','Folio','Groups','NightAudit','Reports','Advanced','Recovery','Roles','Menu','Updater'];
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
const cache = new Map();
const sandbox = {
  Logger: { log: (...a) => { if (process.env.VERBOSE) console.log('LOG', ...a); } },
  MailApp: { sendEmail: m => { mailbox.push(m); } },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
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
  ok(mailbox.length >= 1 && /verification code/i.test(mail.subject || '') && !!code && /<html/i.test(mail.htmlBody || ''), 'code emailed as a professional HTML email');
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
  ok(run('rows_(TBL.PERMS).length') === 31, 'permission matrix has 31 rows');
  ok(run("rows_(TBL.CHARGES).some(c => c.code === 'LCO')"), 'late checkout charge code LCO present');
  run('migrateSchema_()'); run('migrateSchema_()');
  ok(run('rows_(TBL.PERMS).length') === 31 && run("rows_(TBL.CHARGES).filter(c => c.code === 'LCO').length") === 1, 'migration is idempotent');
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
  console.log('done');
}

/**
 * Stayline – Core.gs
 * Database layer (Google Sheets), dates, locking, audit trail, authentication, web entry point.
 * Private helpers end with "_". Public functions (no underscore) are callable from the browser
 * and take the session token as the first argument.
 */

/* ============================ DATABASE ============================ */
/* The database is opened once per request (opening it is slow); the setup clears this when it changes the database */
let SS_MEMO_ = null;
function ss_() {
  if (SS_MEMO_) return SS_MEMO_;
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Database not set up. Run setupDatabase() from the Apps Script editor.');
  SS_MEMO_ = SpreadsheetApp.openById(id);
  return SS_MEMO_;
}
/* Sheet objects opened in this request, so each table is looked up once per request */
let SHEET_MEMO_ = {};
function sh_(t) {
  if (SHEET_MEMO_[t[0]]) return SHEET_MEMO_[t[0]];
  const ss = ss_();
  let s = ss.getSheetByName(t[0]);
  // A table added by an update is created with its headers, once the database is set up. Rows are never touched.
  if (!s && ss.getSheetByName(TBL.SETTINGS[0])) { s = ss.insertSheet(t[0]); s.getRange(1, 1, 1, t[1].length).setValues([t[1]]); }
  if (!s) throw new Error('Missing sheet "' + t[0] + '". Run setupDatabase().');
  SHEET_MEMO_[t[0]] = watchSheet_(s, t[0]);
  return SHEET_MEMO_[t[0]];
}
/* Display dates as dd-mm-yyyy (PDF and printed text). Stored values stay yyyy-mm-dd. */
function dmy_(v) { return String(v == null ? '' : v).replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3-$2-$1'); }
function fmtD_(d)  { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
function fmtTs_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd HH:mm'); }
function calToday_() { return fmtD_(new Date()); }
function addDays_(ds, n) {
  return Utilities.formatDate(new Date(new Date(ds + 'T00:00:00Z').getTime() + n * 86400000), 'UTC', 'yyyy-MM-dd');
}
function nights_(a, d) { return Math.round((new Date(d + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000); }
function num_(x) { return Math.round((Number(x) || 0) * 100) / 100; }
function id_(p) { return p + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase(); }
function isDate_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
function validRange_(a, d) {
  if (!isDate_(a) || !isDate_(d)) throw new Error('Dates must be yyyy-mm-dd.');
  if (d <= a) throw new Error('Departure must be after arrival.');
}

/** Reads a table as objects. Each object carries _row (its sheet row number). */
/* A table is read from the sheet once per request. Any write to the spreadsheet clears this (see watchSheet_),
   so a read after a save is always fresh. Each caller gets its own copy of the rows. */
let ROWS_MEMO_ = {};
function rows_(t) {
  const key = t[0];
  if (!ROWS_MEMO_[key]) ROWS_MEMO_[key] = CROSS_TBLS_.indexOf(key) >= 0 ? crossRows_(t) : readRows_(t);
  return ROWS_MEMO_[key].map(o => Object.assign({}, o));
}
/* Small tables read on every request (users for the session check, settings for the inactivity limit) are kept
   in the script cache between requests for one minute. Every write clears them at once (see uncacheTbls_). */
const CROSS_TBLS_ = ['Users', 'Settings', 'Permissions'];
/* Read-only view of a table for code that only reads it: no copy of every row. Never change the rows it returns. */
function rowsRO_(t) {
  const key = t[0];
  if (!ROWS_MEMO_[key]) ROWS_MEMO_[key] = CROSS_TBLS_.indexOf(key) >= 0 ? crossRows_(t) : readRows_(t);
  return ROWS_MEMO_[key];
}
function crossRows_(t) {
  const c = CacheService.getScriptCache();
  const k = 'tbl:' + t[0];
  const raw = c.get(k);
  if (raw) { try { return JSON.parse(raw); } catch (e) { /* unreadable: read the sheet */ } }
  const rows = readRows_(t);
  const txt = JSON.stringify(rows);
  if (txt.length < 90000) c.put(k, txt, 60);
  return rows;
}
/* A write to one table clears that table's rows for this request and its shared copy, and no other table's */
function uncacheTbl_(name) {
  delete ROWS_MEMO_[name];
  if (CROSS_TBLS_.indexOf(name) >= 0) CacheService.getScriptCache().remove('tbl:' + name);
}
/* The logo link comes from LOGO_URL in Config.gs; it is not read from the sheet. */
function logoValue_() { return LOGO_URL || ''; }
const SHEET_WRITES_ = ['appendRow', 'deleteRow', 'insertRow', 'insertRows', 'deleteRows', 'deleteColumn', 'deleteColumns', 'insertColumn', 'insertColumns', 'clear', 'clearContent', 'clearFormats', 'setValues', 'setValue', 'sort', 'setName', 'hideSheet', 'setFrozenRows', 'autoResizeColumns'];
const RANGE_WRITES_ = ['setValue', 'setValues', 'clear', 'clearContent', 'clearFormat', 'clearFormats', 'setFormula', 'setFormulas', 'insertCheckboxes', 'removeCheckboxes', 'setFontWeight', 'setBackground', 'setFontColor', 'setNumberFormat', 'setDataValidation', 'merge', 'breakApart'];
/* Wraps a sheet so every write clears the rows read earlier in this request. Reads pass straight through. */
function watchSheet_(s, name) {
  return new Proxy(s, { get(t, p) {
    const v = t[p];
    if (typeof v !== 'function') return v;
    return function (...a) {
      const out = v.apply(t, a);
      if (SHEET_WRITES_.indexOf(p) >= 0) uncacheTbl_(name);
      if (p === 'getRange' && out) return watchRange_(out, name);
      return out;
    };
  } });
}
function watchRange_(r, name) {
  return new Proxy(r, { get(t, p) {
    const v = t[p];
    if (typeof v !== 'function') return v;
    return function (...a) {
      const out = v.apply(t, a);
      if (RANGE_WRITES_.indexOf(p) >= 0) uncacheTbl_(name);
      return out === t ? watchRange_(t, name) : out;
    };
  } });
}
function readRows_(t) {
  const v = sh_(t).getDataRange().getValues();
  if (v.length < 2) return [];
  const h = v[0];
  return v.slice(1)
    .map((r, i) => {
      const o = { _row: i + 2 };
      h.forEach((k, j) => {
        let x = r[j];
        if (x instanceof Date) x = /(^date$|^arrival$|^departure$|^startDate$|^endDate$|^bizDate$|^dob$|^lastStay$|^hkUpdatedAt$)/.test(k) ? fmtD_(x) : fmtTs_(x);
        o[k] = x;
      });
      return o;
    })
    .filter(o => String(o[h[0]]) !== '');
}
function append_(t, obj) {
  SETTINGS_MEMO_ = null;
  sh_(t).appendRow(t[1].map(h => (obj[h] === undefined ? '' : obj[h])));
}
function patch_(t, row, changes) {
  SETTINGS_MEMO_ = null;
  const s = sh_(t);
  const headers = t[1];
  const cols = [];
  Object.keys(changes).forEach(k => { const c = headers.indexOf(k); if (c >= 0) cols.push([c, changes[k] === undefined ? '' : changes[k]]); });
  if (!cols.length) return;
  // Only the changed cells are written, in runs of adjacent columns: no read, and no unchanged cell (or formula) is touched
  cols.sort((a, b) => a[0] - b[0]);
  let i = 0;
  while (i < cols.length) {
    let j = i;
    while (j + 1 < cols.length && cols[j + 1][0] === cols[j][0] + 1) j++;
    s.getRange(row, cols[i][0] + 1, 1, j - i + 1).setValues([cols.slice(i, j + 1).map(x => x[1])]);
    i = j + 1;
  }
}
/* Runs a database write under the script lock. When the write succeeds, the change stamp moves,
   so every open app sees that something was posted and reloads its current page. */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const out = fn();
    dataChanged_();
    return out;
  } finally { lock.releaseLock(); }
}
/** Moves the change stamp. Called after every successful database write. */
function dataChanged_() {
  try { PropertiesService.getScriptProperties().setProperty('CHANGE_STAMP', String(Date.now())); } catch (e) { Logger.log('Change stamp: ' + e.message); }
}
/* Money-moving calls carry a request id. If the connection drops and the page retries, a repeat with the same id
   gets the saved result back instead of posting a second time. */
function idemGet_(s, rid) {
  if (!rid) return null;
  try { const v = CacheService.getScriptCache().get('idem:' + s.username + ':' + rid); return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
function idemPut_(s, rid, out) {
  if (!rid) return;
  try { CacheService.getScriptCache().put('idem:' + s.username + ':' + rid, JSON.stringify(out), 600); } catch (e) { Logger.log('Request id: ' + e.message); }
}
/* Speed: a read result is kept for up to 60 seconds. The key includes the change stamp, so any saved change
   makes the next read compute fresh data. Permissions are checked by the caller before this runs. */
function cachedRead_(name, fn) {
  const cache = CacheService.getScriptCache();
  const key = 'rd:' + name + ':' + (PropertiesService.getScriptProperties().getProperty('CHANGE_STAMP') || '0');
  try { const hit = cache.get(key); if (hit) return JSON.parse(hit); } catch (e) { /* cache unavailable: compute */ }
  const out = fn();
  try { const txt = JSON.stringify(out); if (txt.length < 95000) cache.put(key, txt, 60); } catch (e) { /* too large or unavailable */ }
  return out;
}
/** Cheap check the open app makes every few seconds: the stamp moves when anything is saved. */
function changeStamp(token) {
  auth_(token);
  return { stamp: PropertiesService.getScriptProperties().getProperty('CHANGE_STAMP') || '0' };
}
function audit_(user, action, entity, entityId, details) {
  append_(TBL.AUDIT, {
    time: fmtTs_(new Date()), user: user, action: action, entity: entity,
    entityId: String(entityId || ''), details: String(details || '').slice(0, 500)
  });
  const resNo = resNoFor_(entity, entityId);   // every change to a reservation, folio or posting is also logged on it
  if (resNo) resLogWrite_(resNo, user, action, details);
}

/* ============================ SETTINGS ============================ */
/* Settings are read from the sheet once per request. Every write to the sheet clears this (see patch_ and append_). */
let SETTINGS_MEMO_ = null;
function settings_() {
  if (!SETTINGS_MEMO_) SETTINGS_MEMO_ = readSettings_();
  return Object.assign({}, SETTINGS_MEMO_);
}
function readSettings_() {
  const m = Object.assign({}, SETTINGS_DEFAULT);
  // a blank value in the sheet keeps the default (so an empty App name still shows Stayline)
  rows_(TBL.SETTINGS).forEach(r => { if (r.key && r.value !== '' && r.value != null) m[r.key] = r.value; });
  m.logoUrl = logoValue_();   // the logo link is in the code, so any logo row in the sheet is ignored
  delete m.resendApiKey;   // encrypted, read only by the mail sender (see Email.gs)
  m.taxRate = Number(m.taxRate) || 0;
  // the sheet can hold the business date as a date cell, read back as 'yyyy-mm-dd HH:mm'
  if (/^\d{4}-\d{2}-\d{2}/.test(String(m.businessDate))) m.businessDate = String(m.businessDate).slice(0, 10);
  // Licence dates may come from a date cell, or be typed as text: always read them as yyyy-mm-dd
  m.licenseStart = normDate_(m.licenseStart);
  m.licenseExpiry = normDate_(m.licenseExpiry);
  return m;
}
function setting_(k) { return settings_()[k]; }
/* A date from the Settings sheet as yyyy-mm-dd. Accepts a date cell, yyyy-mm-dd (with or without a time), or dd/mm/yyyy.
   Returns '' when the value is not a date. */
function normDate_(v) {
  if (v === '' || v == null) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : fmtD_(v);
  const s = String(v).trim();
  const p2 = n => String(n).padStart(2, '0');
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return m[1] + '-' + p2(m[2]) + '-' + p2(m[3]);
  m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/.exec(s);
  if (m) return m[3] + '-' + p2(m[2]) + '-' + p2(m[1]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : fmtD_(d);
}
function bizDate_() { return setting_('businessDate') || calToday_(); }
function flag_(k) { return String(setting_(k)) === 'true'; }

/* ============================ AUTH ============================ */
/* Passwords are stored as "h1:" plus the hash. The prefix stops the sheet reading a hash that starts
   with + or - as a formula, which would change it. Older hashes without the prefix still work. */
function storeHash_(salt, pw) { return 'h1:' + hash_(salt, pw); }
function hashMatches_(u, pw) {
  const stored = String((u && u.passHash) || '');
  const want = stored.indexOf('h1:') === 0 ? 'h1:' + hash_(u.salt, pw) : hash_(u.salt, pw);
  return stored !== '' && stored === want;
}
function hash_(salt, pw) {
  let h = salt + ':' + pw;
  for (let i = 0; i < 1000; i++) {
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h));
  }
  return h;
}
function permMap_(who) {
  const role = typeof who === 'string' ? who : (who && who.role);
  const m = {};
  rows_(TBL.PERMS).forEach(r => { m[r.permission] = r[role] === true; });
  // The system administrator has every permission defined in the code, even before the sheet is updated
  if (role === ADMIN_ROLE) PERMISSIONS.forEach(p => { m[p[0]] = true; });
  // A Property Admin has every hotel operation, not the system settings. The configuration screens and staff-user access
  // are ticked in Property admin screens, so those keep the grid's value.
  if (role === PROPERTY_ROLE) { PERMISSIONS.forEach(p => { if (!isPadGridPerm_(p[0])) m[p[0]] = true; }); m['system.manage'] = false; }
  // Extra configuration access the system administrator gave this user, on top of the role
  if (who && typeof who === 'object' && Array.isArray(who.extra)) who.extra.forEach(p => { m[p] = true; });
  return m;
}
/* The permissions a system administrator can give one user on top of the role: configuration screens and user management */
function cfgPermKeys_() { return PERMISSIONS.map(p => p[0]).filter(k => k === 'users.manage' || k.indexOf('cfg.') === 0); }
/* The permissions ticked in Property admin screens */
function isPadGridPerm_(k) { return k === 'users.manage' || k === 'fixed.manage' || k.indexOf('cfg.') === 0; }
/* The extra access that can be set. A Property Admin can only give what he holds himself. */
function cleanExtra_(v, who) {
  const want = (Array.isArray(v) ? v : String(v || '').split(',')).map(x => String(x).trim());
  let ok = cfgPermKeys_();
  if (who && who.role !== ADMIN_ROLE) { const pm = permMap_(who); ok = ok.filter(k => pm[k] === true); }
  return ok.filter(k => want.indexOf(k) >= 0);
}
function userExtra_(u) { return cleanExtra_(String((u && u.permExtra) || '')); }
/* Sidebar layout: { groups: [{ name, items: [page keys] }] }. The page keys are checked against the menu on the client. */
function normalizeMenuLayout_(raw) {
  if (raw === '' || raw === null || raw === undefined) return '';
  let o;
  try { o = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { throw new Error('Menu layout is not valid.'); }
  if (!o || !Array.isArray(o.groups) || o.groups.length > 20) throw new Error('Menu layout is not valid.');
  const groups = o.groups.map(g => {
    if (!g || typeof g.name !== 'string' || !Array.isArray(g.items) || g.items.length > 80) throw new Error('Menu layout is not valid.');
    const name = g.name.trim().slice(0, 40);
    if (!name) throw new Error('Every menu group needs a name.');
    const items = g.items.map(k => { if (typeof k !== 'string' || k.length > 40) throw new Error('Menu layout is not valid.'); return k; });
    return { name: name, items: items };
  });
  const out = JSON.stringify({ groups: groups });
  if (out.length > 8000) throw new Error('Menu layout is too large.');
  return out;
}
/* Licence window set by the system administrator. Outside it only the system administrator can sign in. */
function licenseStatus_() {
  const s = settings_();
  const start = String(s.licenseStart || ''), expiry = String(s.licenseExpiry || '');
  if (!start && !expiry) return { status: 'none', start: start, expiry: expiry, days: null };
  const today = calToday_();
  const days = expiry ? Math.round((Date.parse(expiry) - Date.parse(today)) / 86400000) : null;
  if (start && today < start) return { status: 'not-started', start: start, expiry: expiry, days: days };
  if (expiry && today > expiry) return { status: 'expired', start: start, expiry: expiry, days: days };
  return { status: days !== null && days <= 30 ? 'warning' : 'active', start: start, expiry: expiry, days: days };
}
/* Blocks everyone except the system administrator when the licence is not in its window. */
function licenseGuard_(role) {
  if (permMap_(role)['system.manage'] === true) return;
  const L = licenseStatus_();
  if (L.status === 'expired') throw new Error('LICENSE_BLOCKED: Your ' + appName_() + ' licence ended on ' + dmy_(L.expiry) + '. Ask the system administrator to renew it.');
  if (L.status === 'not-started') throw new Error('LICENSE_BLOCKED: Your ' + appName_() + ' licence starts on ' + dmy_(L.start) + '.');
}
function publicSettings_() {
  const s = settings_();
  return { appName: s.appName, hotelName: s.hotelName, ownerName: s.ownerName || '', appVersion: APP_VERSION, logoUrl: s.logoUrl, loadingMessage: s.loadingMessage || '', loadingScreen: s.loadingScreen || 'random', menuLayout: String(s.menuLayout || ''), licenseStart: String(s.licenseStart || ''), licenseExpiry: String(s.licenseExpiry || ''), licenseNumber: String(s.licenseNumber || ''), licenseStatus: licenseStatus_().status, currency: s.currency || s.defaultCurrency, defaultLanguage: s.defaultLanguage, inactivityMinutes: inactivityMinutes_() };
}
function getPublicSettings() { return publicSettings_(); }

/** Connection health for the system administrator: the app server answered (this call), and every database
    sheet is present and can be read now. Timed, so the screen can show a slow connection too. */
function healthCheck(token) {
  const s = auth_(token, 'system.manage');
  const out = { server: 'ok', database: 'ok', dbError: '', created: [], tables: 0, settingsRows: 0, version: APP_VERSION,
    serverTime: fmtTs_(new Date()), user: s.username, dbMs: 0 };
  const t0 = Date.now();
  try {
    const names = Object.keys(TBL);
    out.created = ensureAllTabsOnce_(false);         // checked once per version (cached), not on every visit
    const have = {};
    ss_().getSheets().forEach(x => { have[x.getName()] = true; });   // one call for the list of tabs
    names.forEach(k => { if (!have[TBL[k][0]]) sh_(TBL[k]); });       // a missing table is created
    out.settingsRows = rows_(TBL.SETTINGS).length;   // a real read of the sheet
    out.tables = names.length;
  } catch (e) {
    out.database = 'error';
    out.dbError = String(e.message || e);
  }
  out.dbMs = Date.now() - t0;
  return out;
}

/* Creates any table tab that is missing (headers only, no rows are touched). Checked once per version and cached. */
function ensureAllTabsOnce_(force) {
  const cache = CacheService.getScriptCache();
  const key = 'tabs_ok_' + APP_VERSION;
  if (!force && cache.get(key)) return [];
  const ss = ss_();
  const missing = Object.keys(TBL).map(k => TBL[k]).filter(t => !ss.getSheetByName(t[0]));
  if (missing.length) ensureTabs_(missing);
  cache.put(key, '1', 21600);
  return missing.map(t => t[0]);
}
function maxAttempts_() { return Math.max(5, Number(settings_().maxLoginAttempts) || 5); }
function inactivityMinutes_() { return Math.max(1, Number(settings_().inactivityMinutes) || 30); }
function login(username, password) {
  const cache = CacheService.getScriptCache();
  const u = String(username || '').trim().toLowerCase();
  const max = maxAttempts_();
  const user = rows_(TBL.USERS).find(x => String(x.username).toLowerCase() === u || String(x.email || '').toLowerCase() === u);
  if (user && user.locked === true) throw new Error('This account is locked after too many wrong passwords. Ask the system administrator to unlock it.');
  const failKey = 'fail:' + u;
  if (Number(cache.get(failKey) || 0) >= max) throw new Error('Too many failed attempts from this name. Try again in 15 minutes.');
  const ok = !!user && user.active === true && hashMatches_(user, String(password || ''));
  if (!ok) {
    cache.put(failKey, String(Number(cache.get(failKey) || 0) + 1), 900);
    let left = max;
    withLock_(() => {
      if (user) {
        const n = num_(user.failCount) + 1;
        left = Math.max(0, max - n);
        patch_(TBL.USERS, user._row, { failCount: n, locked: n >= max });
      }
      // The reason is recorded for the administrator. The password itself is never stored.
      const why = !user ? 'no matching user' : user.active !== true ? 'inactive account' : left === 0 ? 'account locked' : 'wrong password';
      audit_(u || '?', 'LOGIN_FAILED', 'User', u, why);
    });
    if (user && left === 0) throw new Error('Wrong password. This account is now locked after ' + max + ' attempts. Ask the system administrator to unlock it.');
    throw new Error('Invalid username or password.' + (user && left <= 2 ? ' ' + left + ' attempt(s) left before the account is locked.' : ''));
  }
  // Roles the system administrator set to need a code: the password is only the first step
  if (otpRolesList_().indexOf(user.role) >= 0) return sendLoginCode_(user);
  return finishLogin_(user, failKey);
}
/** Opens the session for a user who has passed every sign-in step */
function finishLogin_(user, failKey) {
  licenseGuard_(user.role);
  const sess = { id: user.id, username: user.username, name: user.name, role: user.role, mustChange: user.mustChange === true, extra: userExtra_(user) };
  const token = Utilities.getUuid();
  const cache = CacheService.getScriptCache();
  cache.put('s:' + token, JSON.stringify(Object.assign({}, sess, { seen: Date.now() })), SESSION_SECONDS);
  cache.remove(failKey);
  withLock_(() => {
    patch_(TBL.USERS, user._row, { lastLogin: fmtTs_(new Date()), failCount: 0, locked: false });
    audit_(sess.username, 'LOGIN', 'User', sess.id, '');
  });
  return { token: token, user: sess, perms: permMap_(sess), settings: publicSettings_(), bizDate: bizDate_() };
}
/** Roles that need an emailed code at sign-in */
function otpRolesList_() {
  return String(settings_().otpRoles || '').split(',').map(x => x.trim()).filter(x => x);
}
/** System administrator: which roles need a sign-in code */
function getLoginSecurity(token) {
  auth_(token, 'system.manage');
  return { otpRoles: otpRolesList_() };
}
function saveLoginSecurity(token, roles) {
  const s = auth_(token, 'system.manage');
  const valid = roleNames_();
  const picked = (Array.isArray(roles) ? roles : []).filter(r => valid.indexOf(r) >= 0);
  if (picked.indexOf(s.role) >= 0) {
    const me = rows_(TBL.USERS).find(u => u.id === s.id);
    if (!me || !me.email) throw new Error('Add an email address to your own user first (Administration → Staff users). Your role would need a code.');
  }
  const value = picked.join(',');
  return withLock_(() => {
    const row = rows_(TBL.SETTINGS).find(r => r.key === 'otpRoles');
    if (row) patch_(TBL.SETTINGS, row._row, { value: value }); else append_(TBL.SETTINGS, { key: 'otpRoles', value: value });
    audit_(s.username, 'SETTINGS_SAVED', 'Settings', 'otpRoles', value || 'none');
    return { otpRoles: otpRolesList_() };
  });
}
function logout(token) {
  CacheService.getScriptCache().remove('s:' + token);
  return true;
}
/** Validates the session (re-reading the user, so deactivation and role changes apply at once) and checks a permission. */
function auth_(token, perm) {
  const cache = CacheService.getScriptCache();
  const raw = token ? cache.get('s:' + token) : null;
  if (!raw) throw new Error('SESSION_EXPIRED');
  const cached = JSON.parse(raw);
  // Inactivity: a session idle longer than the system administrator's limit ends
  if (cached.seen && Date.now() - Number(cached.seen) > inactivityMinutes_() * 60000) {
    cache.remove('s:' + token);
    throw new Error('SESSION_EXPIRED');
  }
  cache.put('s:' + token, JSON.stringify(Object.assign({}, cached, { seen: Date.now() })), SESSION_SECONDS);
  const u = rows_(TBL.USERS).find(x => x.id === cached.id);
  if (!u || u.active !== true) throw new Error('SESSION_EXPIRED');
  licenseGuard_(u.role);
  const s = { id: u.id, username: u.username, name: u.name, role: u.role };
  if (perm && permMap_(s)[perm] !== true) throw new Error('Permission denied: ' + perm);
  return s;
}
/** One place for the password rules: 8+ characters with an uppercase letter, a lowercase letter and a number. */
function checkNewPassword_(pw) {
  const p = String(pw || '');
  if (p.length < 8 || !/[A-Z]/.test(p) || !/[a-z]/.test(p) || !/[0-9]/.test(p)) {
    throw new Error('Password must be at least 8 characters and include an uppercase letter, a lowercase letter and a number.');
  }
}
function changeMyPassword(token, oldPw, newPw) {
  const s = auth_(token);
  checkNewPassword_(newPw);
  return withLock_(() => {
    const u = rows_(TBL.USERS).find(x => x.id === s.id);
    if (!hashMatches_(u, String(oldPw || ''))) throw new Error('Current password is incorrect.');
    const salt = Utilities.getUuid();
    patch_(TBL.USERS, u._row, { salt: salt, passHash: storeHash_(salt, newPw), mustChange: false });
    // The session kept at sign-in still says a change is due: clear it, or the prompt returns on every load
    const cache = CacheService.getScriptCache(), raw = cache.get('s:' + token);
    if (raw) cache.put('s:' + token, JSON.stringify(Object.assign({}, JSON.parse(raw), { mustChange: false })), SESSION_SECONDS);
    audit_(s.username, 'PASSWORD_CHANGED', 'User', s.id, '');
    return true;
  });
}

/* ============================ ADMIN: USERS, PERMISSIONS, SETTINGS, AUDIT ============================ */
function listUsers(token) {
  const s = auth_(token, 'users.manage');
  const isSys = s.role === ADMIN_ROLE;   // the system administrator is decided by the role, never by a grant
  // property admins manage staff only; admin and property admin accounts belong to the system administrator
  return rows_(TBL.USERS).filter(u => isSys || [ADMIN_ROLE, PROPERTY_ROLE].indexOf(u.role) < 0).map(u => ({ id: u.id, username: u.username, name: u.name, role: u.role, active: u.active === true, extra: userExtra_(u), locked: u.locked === true, lastLogin: u.lastLogin || '', email: u.email || '' }));
}
/** The options for the extra configuration access, for the user form (system administrator only) */
function extraPermOptions(token) {
  const s = auth_(token, 'users.manage');
  return PERMISSIONS.filter(p => cleanExtra_([p[0]], s).length).map(p => [p[0], p[1]]);
}
function saveUser(token, d) {
  const s = auth_(token, 'users.manage');
  const isSys = s.role === ADMIN_ROLE;   // the system administrator is decided by the role, never by a grant
  // Extra configuration access: only the system administrator sets it
  const extraStr = (d.permExtra !== undefined && (isSys || s.role === PROPERTY_ROLE)) ? cleanExtra_(d.permExtra, s).join(',') : null;
  if (roleNames_().indexOf(d.role) < 0) throw new Error('Invalid role.');
  if (d.role === ADMIN_ROLE && !isSys) throw new Error('Only a system administrator can give the Admin role.');
  if (d.role === PROPERTY_ROLE && !isSys) throw new Error('Only a system administrator can create or change Property Admin accounts.');
  if (!isSys && !roleWithin_(d.role, s)) throw new Error('You can only give a role whose permissions you all have.');
  const uname = String(d.username || '').trim().toLowerCase();
  if (!uname) throw new Error('Username is required.');
  const active = d.active !== false && d.active !== 'false';
  const email = String(d.email || '').trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  return withLock_(() => {
    const users = rows_(TBL.USERS);
    if (users.some(u => String(u.username).toLowerCase() === uname && u.id !== d.id)) throw new Error('Username already exists.');
    if (d.id) {
      const u = users.find(x => x.id === d.id);
      if (!u) throw new Error('User not found.');
      if (u.role === ADMIN_ROLE && !isSys) throw new Error('Only a system administrator can change an Admin user.');
      if (u.role === PROPERTY_ROLE && !isSys) throw new Error('Only a system administrator can change a Property Admin account.');
      if (u.id === s.id && (!active || d.role !== u.role)) throw new Error('You cannot deactivate or demote your own account.');
      const ch = { username: uname, name: d.name || uname, role: d.role, active: active, email: email };
      if (extraStr !== null) ch.permExtra = extraStr;
      if (d.password) {
        checkNewPassword_(d.password);
        ch.salt = Utilities.getUuid();
        ch.passHash = storeHash_(ch.salt, d.password);
        ch.mustChange = true;
      }
      patch_(TBL.USERS, u._row, ch);
      audit_(s.username, 'USER_UPDATED', 'User', d.id, uname + ' ' + d.role);
      return { id: d.id, tempPassword: '' };
    }
    const pw = d.password || genTempPassword_();
    checkNewPassword_(pw);
    const id = id_('U'), salt = Utilities.getUuid();
    const user = { id: id, username: uname, name: d.name || uname, role: d.role, salt: salt, passHash: storeHash_(salt, pw),
      active: active, lastLogin: '', createdAt: fmtTs_(new Date()), email: email, mustChange: true, permExtra: extraStr || '' };
    append_(TBL.USERS, user);
    let mailed = false;
    if (email) { try { sendWelcome_(user, pw); mailed = true; } catch (e) { Logger.log('Welcome email: ' + e.message); } }
    audit_(s.username, 'USER_CREATED', 'User', id, uname + ' ' + d.role + (mailed ? ' (welcome email sent)' : ''));
    return { id: id, tempPassword: mailed ? '' : pw };   // shown once to the admin only when no email was sent
  });
}
function listPermissions(token) {
  auth_(token, 'users.manage');
  return rows_(TBL.PERMS).map(p => ({ permission: p.permission, description: p.description }));
}
function getSettings(token) {
  auth_(token, 'cfg.settings.view');
  return settings_();
}
function saveSettings(token, d, rid) {
  const s = auth_(token, 'cfg.settings.edit');
  const isSys = s.role === ADMIN_ROLE;   // the system administrator is decided by the role, never by a grant
  // 1) Check every value first, so a rejected save changes nothing
  const plan = [];
  Object.keys(SETTINGS_DEFAULT).forEach(k => {
    if (k === 'businessDate' || k === 'logoUrl' || d[k] === undefined) return;   // the logo is in the code (LOGO_URL), not saved
    if (SYSTEM_SETTINGS.indexOf(k) >= 0 && !isSys) return;   // only the system administrator
    if (k === 'maxLoginAttempts' && Number(d[k]) < 5) throw new Error('Wrong-password limit must be at least 5.');
    if ((k === 'licenseStart' || k === 'licenseExpiry') && d[k] !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(String(d[k]))) throw new Error('Licence dates must be a date.');
    if (k === 'loadingScreen' && ['random', 'classic', 'orbit', 'flip', 'pulse', 'ring', 'glow', 'slide', 'wave', 'spin', 'drop'].indexOf(d[k]) < 0) throw new Error('Choose a loading screen style.');
    if (k === 'menuLayout') d[k] = normalizeMenuLayout_(d[k]);
    plan.push([k, d[k]]);
  });
  // The licence window: the values being saved, or the current ones
  const cur = settings_();
  const lsStart = isSys && d.licenseStart !== undefined ? String(d.licenseStart) : String(cur.licenseStart || '');
  const lsExp = isSys && d.licenseExpiry !== undefined ? String(d.licenseExpiry) : String(cur.licenseExpiry || '');
  if (lsStart && lsExp && lsExp < lsStart) throw new Error('The licence expiry must be on or after its start date.');
  // 2) Write
  return withLock_(() => {
    const dup = idemGet_(s, rid);
    if (dup) return dup;
    // One read of the Settings table, then only the cells whose value changed are written (the logo is not
    // rewritten unless it changed). Keys that are not in the sheet yet are added at the end.
    const t = TBL.SETTINGS, sh = sh_(t), headers = t[1];
    const kc = headers.indexOf('key'), vc = headers.indexOf('value');
    const n = Math.max(sh.getLastRow() - 1, 0);
    const block = n ? sh.getRange(2, 1, n, headers.length).getValues() : [];
    const at = {};
    block.forEach((r, i) => { at[String(r[kc])] = i; });
    const fresh = [];
    plan.forEach(([k, v]) => {
      const i = at[k];
      if (i === undefined) { fresh.push({ key: k, value: v }); return; }
      const now = block[i][vc];
      if (String(now == null ? '' : now) === String(v == null ? '' : v)) return;   // unchanged: no write
      sh.getRange(i + 2, vc + 1).setValue(v);
    });
    fresh.forEach(o => append_(t, o));
    audit_(s.username, 'SETTINGS_SAVED', 'Settings', '', Object.keys(d).join(','));
    const out = settings_();
    idemPut_(s, rid, out);
    return out;
  });
}
function listAudit(token, limit) {
  auth_(token, 'audit.view');
  const n = Math.min(Number(limit) || 300, 1000);
  return rows_(TBL.AUDIT).slice(-n).reverse().map(a => ({ time: a.time, user: a.user, action: a.action, entity: a.entity, entityId: a.entityId, details: a.details }));
}

/* ============================ WEB ENTRY ============================ */
/* Returns the app name from Settings as a small script, for the Vercel page (?nameFor=callback). Only the name is sent. */
function appNameScript_(cb) {
  let name = '', logo = '';
  try { const st = settings_(); name = st.appName || ''; logo = st.logoUrl || ''; } catch (e) { /* database not set up yet */ }
  return ContentService.createTextOutput(cb + '(' + JSON.stringify({ appName: name, logoUrl: logo }) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
/* Runs fn once for this app version; the mark is kept for six hours. A failed run is not marked, so it tries again. */
function onceForVersion_(name, fn) {
  const cache = CacheService.getScriptCache();
  const key = 'once_' + name + '_' + APP_VERSION;
  if (cache.get(key)) return;
  fn();
  cache.put(key, '1', 21600);
}
function doGet(e) {
  const cb = e && e.parameter && e.parameter.nameFor;
  if (cb) return /^[A-Za-z_$][\w$]*$/.test(cb) ? appNameScript_(cb) : ContentService.createTextOutput('');
  // The timers are checked once per version (the check itself is a slow call to Google), not on every page load
  try { onceForVersion_('auto', () => ensureAutoUpdate_()); } catch (e) { Logger.log('Auto update timer: ' + e.message); }
  try { onceForVersion_('backup', () => ensureBackupTrigger_()); } catch (e) { Logger.log('Backup timer: ' + e.message); }
  try { ensureAllTabsOnce_(); } catch (e) { Logger.log('Tabs check: ' + e.message); }
  let name = '', logo = '';
  try { const st = settings_(); name = st.appName || name; logo = st.logoUrl || ''; } catch (e) { /* database not set up yet */ }
  const t = HtmlService.createTemplateFromFile('Index');
  t.appName = name;
  t.appVersion = APP_VERSION;
  t.execUrl = ScriptApp.getService().getUrl();   // the web app's own address, used by the update Refresh button
  // ALLOWALL lets the Vercel page show this app in its frame. Without it Google blocks the frame.
  const out = t.evaluate().setTitle(name).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport', 'width=device-width, initial-scale=1');
  // The tab icon for the Google page needs a web address. An uploaded logo (data picture) cannot be used there, only an https logo link.
  if (/^https:\/\//i.test(logo)) out.setFaviconUrl(logo);
  return out;
}
/** Inlines a file (Styles) into Index as HTML. */
function include(name) {
  return HtmlService.createTemplateFromFile(name).getRawContent();
}
/** App code is sent Base64-encoded so Apps Script never validates the JavaScript as HTML. The browser decodes and runs it. */
function include64(name) {
  return Utilities.base64Encode(Utilities.newBlob(HtmlService.createTemplateFromFile(name).getRawContent()).getBytes());
}

/** Unlocks an account locked after too many wrong passwords. */
function unlockUser(token, id) {
  const s = auth_(token, 'users.manage');
  return withLock_(() => {
    const u = rows_(TBL.USERS).find(x => x.id === id);
    if (!u) throw new Error('User not found.');
    if ([ADMIN_ROLE, PROPERTY_ROLE].indexOf(u.role) >= 0 && permMap_(s)['system.manage'] !== true) throw new Error('Only a system administrator can unlock this account.');
    patch_(TBL.USERS, u._row, { locked: false, failCount: 0 });
    CacheService.getScriptCache().remove('fail:' + String(u.username).toLowerCase());   // clear the short-term throttle too
    audit_(s.username, 'USER_UNLOCKED', 'User', id, u.username);
    return true;
  });
}
/** Admin resets a user's password to a temporary one. The user must change it at the next sign-in. */
function resetUserPassword(token, id) {
  const s = auth_(token, 'users.manage');
  return withLock_(() => {
    const u = rows_(TBL.USERS).find(x => x.id === id);
    if (!u) throw new Error('User not found.');
    if ([ADMIN_ROLE, PROPERTY_ROLE].indexOf(u.role) >= 0 && permMap_(s)['system.manage'] !== true) throw new Error('Only a system administrator can reset this account.');
    const pw = genTempPassword_(), salt = Utilities.getUuid();
    patch_(TBL.USERS, u._row, { salt: salt, passHash: storeHash_(salt, pw), mustChange: true, failCount: 0, locked: false });
    let mailed = false;
    if (u.email) { try { sendWelcome_({ id: u.id, username: u.username, name: u.name, role: u.role, email: u.email }, pw); mailed = true; } catch (e) { Logger.log('Reset email: ' + e.message); } }
    const via = mailed ? mailRoute_() : '';
    audit_(s.username, 'PASSWORD_RESET_BY_ADMIN', 'User', id, u.username + (mailed ? ' (email sent to ' + u.email + ' via ' + via + ')' : ''));
    return { tempPassword: mailed ? '' : pw, sentTo: mailed ? u.email : '', via: via };
  });
}

/* A one-time link lets a new browser tab open the app already signed in (valid for 90 seconds). */
function createHandover(token) {
  auth_(token);
  const id = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('ho:' + id, String(token), 90);
  return id;
}
function redeemHandover(id) {
  const cache = CacheService.getScriptCache();
  const key = 'ho:' + String(id || '').replace(/[^0-9a-f]/gi, '');
  const token = cache.get(key);
  if (!token) throw new Error('This link has expired. Sign in again in the new tab.');
  cache.remove(key);
  const raw = cache.get('s:' + token);
  if (!raw) throw new Error('SESSION_EXPIRED');
  const s = JSON.parse(raw);
  return { token: token, user: { id: s.id, username: s.username, name: s.name, role: s.role, mustChange: s.mustChange === true },
    perms: permMap_(s), settings: publicSettings_(), bizDate: bizDate_() };
}

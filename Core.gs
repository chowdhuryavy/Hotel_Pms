/**
 * Stayline – Core.gs
 * Database layer (Google Sheets), dates, locking, audit trail, authentication, web entry point.
 * Private helpers end with "_". Public functions (no underscore) are callable from the browser
 * and take the session token as the first argument.
 */

/* ============================ DATABASE ============================ */
function ss_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Database not set up. Run setupDatabase() from the Apps Script editor.');
  return SpreadsheetApp.openById(id);
}
function sh_(t) {
  const s = ss_().getSheetByName(t[0]);
  if (!s) throw new Error('Missing sheet "' + t[0] + '". Run setupDatabase().');
  return s;
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
function rows_(t) {
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
  sh_(t).appendRow(t[1].map(h => (obj[h] === undefined ? '' : obj[h])));
}
function patch_(t, row, changes) {
  const s = sh_(t);
  Object.keys(changes).forEach(k => {
    const c = t[1].indexOf(k) + 1;
    if (c > 0) s.getRange(row, c).setValue(changes[k]);
  });
}
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
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
function settings_() {
  const m = Object.assign({}, SETTINGS_DEFAULT);
  // a blank value in the sheet keeps the default (so an empty App name still shows Stayline)
  rows_(TBL.SETTINGS).forEach(r => { if (r.key && r.value !== '' && r.value != null) m[r.key] = r.value; });
  m.taxRate = Number(m.taxRate) || 0;
  // the sheet can hold the business date as a date cell, read back as 'yyyy-mm-dd HH:mm'
  if (/^\d{4}-\d{2}-\d{2}/.test(String(m.businessDate))) m.businessDate = String(m.businessDate).slice(0, 10);
  return m;
}
function setting_(k) { return settings_()[k]; }
function bizDate_() { return setting_('businessDate') || calToday_(); }
function flag_(k) { return String(setting_(k)) === 'true'; }

/* ============================ AUTH ============================ */
function hash_(salt, pw) {
  let h = salt + ':' + pw;
  for (let i = 0; i < 1000; i++) {
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h));
  }
  return h;
}
function permMap_(role) {
  const m = {};
  rows_(TBL.PERMS).forEach(r => { m[r.permission] = r[role] === true; });
  return m;
}
function publicSettings_() {
  const s = settings_();
  return { appName: s.appName, hotelName: s.hotelName, logoUrl: s.logoUrl, loadingMessage: s.loadingMessage || '', loadingScreen: s.loadingScreen || 'random', currency: s.currency || s.defaultCurrency, defaultLanguage: s.defaultLanguage, inactivityMinutes: inactivityMinutes_() };
}
function getPublicSettings() { return publicSettings_(); }

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
  const ok = !!user && user.active === true && hash_(user.salt, String(password || '')) === user.passHash;
  if (!ok) {
    cache.put(failKey, String(Number(cache.get(failKey) || 0) + 1), 900);
    let left = max;
    withLock_(() => {
      if (user) {
        const n = num_(user.failCount) + 1;
        left = Math.max(0, max - n);
        patch_(TBL.USERS, user._row, { failCount: n, locked: n >= max });
      }
      audit_(u || '?', 'LOGIN_FAILED', 'User', u, user && left === 0 ? 'account locked' : '');
    });
    if (user && left === 0) throw new Error('Wrong password. This account is now locked after ' + max + ' attempts. Ask the system administrator to unlock it.');
    throw new Error('Invalid username or password.' + (user && left <= 2 ? ' ' + left + ' attempt(s) left before the account is locked.' : ''));
  }
  const sess = { id: user.id, username: user.username, name: user.name, role: user.role, mustChange: user.mustChange === true };
  const token = Utilities.getUuid();
  cache.put('s:' + token, JSON.stringify(Object.assign({}, sess, { seen: Date.now() })), SESSION_SECONDS);
  cache.remove(failKey);
  withLock_(() => {
    patch_(TBL.USERS, user._row, { lastLogin: fmtTs_(new Date()), failCount: 0, locked: false });
    audit_(sess.username, 'LOGIN', 'User', sess.id, '');
  });
  return { token: token, user: sess, perms: permMap_(sess.role), settings: publicSettings_(), bizDate: bizDate_() };
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
  const s = { id: u.id, username: u.username, name: u.name, role: u.role };
  if (perm && permMap_(s.role)[perm] !== true) throw new Error('Permission denied: ' + perm);
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
    if (hash_(u.salt, String(oldPw || '')) !== u.passHash) throw new Error('Current password is incorrect.');
    const salt = Utilities.getUuid();
    patch_(TBL.USERS, u._row, { salt: salt, passHash: hash_(salt, newPw), mustChange: false });
    audit_(s.username, 'PASSWORD_CHANGED', 'User', s.id, '');
    return true;
  });
}

/* ============================ ADMIN: USERS, PERMISSIONS, SETTINGS, AUDIT ============================ */
function listUsers(token) {
  const s = auth_(token, 'users.manage');
  const isSys = permMap_(s.role)['system.manage'] === true;
  // property admins manage staff only; admin and property admin accounts belong to the system administrator
  return rows_(TBL.USERS).filter(u => isSys || [ADMIN_ROLE, PROPERTY_ROLE].indexOf(u.role) < 0).map(u => ({ id: u.id, username: u.username, name: u.name, role: u.role, active: u.active === true, locked: u.locked === true, lastLogin: u.lastLogin || '', email: u.email || '' }));
}
function saveUser(token, d) {
  const s = auth_(token, 'users.manage');
  const isSys = permMap_(s.role)['system.manage'] === true;
  if (roleNames_().indexOf(d.role) < 0) throw new Error('Invalid role.');
  if (d.role === ADMIN_ROLE && !isSys) throw new Error('Only a system administrator can give the Admin role.');
  if (d.role === PROPERTY_ROLE && !isSys) throw new Error('Only a system administrator can create or change Property Admin accounts.');
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
      if (d.password) {
        checkNewPassword_(d.password);
        ch.salt = Utilities.getUuid();
        ch.passHash = hash_(ch.salt, d.password);
        ch.mustChange = true;
      }
      patch_(TBL.USERS, u._row, ch);
      audit_(s.username, 'USER_UPDATED', 'User', d.id, uname + ' ' + d.role);
      return { id: d.id, tempPassword: '' };
    }
    if (!isSys) throw new Error('Only the system administrator can add users.');
    const pw = d.password || genTempPassword_();
    checkNewPassword_(pw);
    const id = id_('U'), salt = Utilities.getUuid();
    const user = { id: id, username: uname, name: d.name || uname, role: d.role, salt: salt, passHash: hash_(salt, pw),
      active: active, lastLogin: '', createdAt: fmtTs_(new Date()), email: email, mustChange: true };
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
  auth_(token, 'settings.manage');
  return settings_();
}
function saveSettings(token, d) {
  const s = auth_(token, 'settings.manage');
  const isSys = permMap_(s.role)['system.manage'] === true;
  return withLock_(() => {
    Object.keys(SETTINGS_DEFAULT).forEach(k => {
      if (k === 'businessDate' || d[k] === undefined) return;
      if (SYSTEM_SETTINGS.indexOf(k) >= 0 && !isSys) return;   // only the system administrator   // business date only changes via night audit
      if (k === 'maxLoginAttempts' && Number(d[k]) < 5) throw new Error('Wrong-password limit must be at least 5.');
      if (k === 'loadingScreen' && ['random', 'classic', 'orbit', 'flip', 'pulse'].indexOf(d[k]) < 0) throw new Error('Choose a loading screen style.');
      if (k === 'logoUrl') {
        const v = String(d[k] || '').trim();
        if (v && !/^(https:\/\/|data:image\/(png|jpeg|webp|svg\+xml);base64,)/i.test(v)) throw new Error('Logo must be an https link or an uploaded image.');
        if (v.length > 45000) throw new Error('Logo is too large. Use a smaller image.');
        d[k] = v;
      }
      const row = rows_(TBL.SETTINGS).find(r => r.key === k);
      if (row) patch_(TBL.SETTINGS, row._row, { value: d[k] }); else append_(TBL.SETTINGS, { key: k, value: d[k] });
    });
    audit_(s.username, 'SETTINGS_SAVED', 'Settings', '', Object.keys(d).join(','));
    return settings_();
  });
}
function listAudit(token, limit) {
  auth_(token, 'audit.view');
  const n = Math.min(Number(limit) || 300, 1000);
  return rows_(TBL.AUDIT).slice(-n).reverse().map(a => ({ time: a.time, user: a.user, action: a.action, entity: a.entity, entityId: a.entityId, details: a.details }));
}

/* ============================ WEB ENTRY ============================ */
function doGet() {
  try { ensureAutoUpdate_(); } catch (e) { Logger.log('Auto update timer: ' + e.message); }
  let name = SETTINGS_DEFAULT.appName;
  try { name = settings_().appName || name; } catch (e) { /* database not set up yet */ }
  const t = HtmlService.createTemplateFromFile('Index');
  t.appName = name;
  t.appVersion = APP_VERSION;
  return t.evaluate().setTitle(name).addMetaTag('viewport', 'width=device-width, initial-scale=1');
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
    if ([ADMIN_ROLE, PROPERTY_ROLE].indexOf(u.role) >= 0 && permMap_(s.role)['system.manage'] !== true) throw new Error('Only a system administrator can unlock this account.');
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
    if ([ADMIN_ROLE, PROPERTY_ROLE].indexOf(u.role) >= 0 && permMap_(s.role)['system.manage'] !== true) throw new Error('Only a system administrator can reset this account.');
    const pw = genTempPassword_(), salt = Utilities.getUuid();
    patch_(TBL.USERS, u._row, { salt: salt, passHash: hash_(salt, pw), mustChange: true, failCount: 0, locked: false });
    let mailed = false;
    if (u.email) { try { sendWelcome_({ id: u.id, username: u.username, name: u.name, role: u.role, email: u.email }, pw); mailed = true; } catch (e) { Logger.log('Reset email: ' + e.message); } }
    audit_(s.username, 'PASSWORD_RESET_BY_ADMIN', 'User', id, u.username + (mailed ? ' (email sent)' : ''));
    return { tempPassword: mailed ? '' : pw };
  });
}

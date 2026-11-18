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
}

/* ============================ SETTINGS ============================ */
function settings_() {
  const m = Object.assign({}, SETTINGS_DEFAULT);
  rows_(TBL.SETTINGS).forEach(r => { m[r.key] = r.value; });
  m.taxRate = Number(m.taxRate) || 0;
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
  return { appName: s.appName, hotelName: s.hotelName, logoUrl: s.logoUrl, currency: s.currency };
}
function getPublicSettings() { return publicSettings_(); }

function login(username, password) {
  const cache = CacheService.getScriptCache();
  const u = String(username || '').trim().toLowerCase();
  const failKey = 'fail:' + u;
  if (Number(cache.get(failKey) || 0) >= 5) throw new Error('Too many failed attempts. Try again in 15 minutes.');
  const user = rows_(TBL.USERS).find(x => String(x.username).toLowerCase() === u);
  const ok = !!user && user.active === true && hash_(user.salt, String(password || '')) === user.passHash;
  if (!ok) {
    cache.put(failKey, String(Number(cache.get(failKey) || 0) + 1), 900);
    withLock_(() => audit_(u || '?', 'LOGIN_FAILED', 'User', u, ''));
    throw new Error('Invalid username or password.');
  }
  const sess = { id: user.id, username: user.username, name: user.name, role: user.role };
  const token = Utilities.getUuid();
  cache.put('s:' + token, JSON.stringify(sess), SESSION_SECONDS);
  cache.remove(failKey);
  withLock_(() => {
    patch_(TBL.USERS, user._row, { lastLogin: fmtTs_(new Date()) });
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
  const raw = token ? CacheService.getScriptCache().get('s:' + token) : null;
  if (!raw) throw new Error('SESSION_EXPIRED');
  const cached = JSON.parse(raw);
  const u = rows_(TBL.USERS).find(x => x.id === cached.id);
  if (!u || u.active !== true) throw new Error('SESSION_EXPIRED');
  const s = { id: u.id, username: u.username, name: u.name, role: u.role };
  if (perm && permMap_(s.role)[perm] !== true) throw new Error('Permission denied: ' + perm);
  return s;
}
function changeMyPassword(token, oldPw, newPw) {
  const s = auth_(token);
  if (String(newPw || '').length < 8) throw new Error('New password must be at least 8 characters.');
  return withLock_(() => {
    const u = rows_(TBL.USERS).find(x => x.id === s.id);
    if (hash_(u.salt, String(oldPw || '')) !== u.passHash) throw new Error('Current password is incorrect.');
    const salt = Utilities.getUuid();
    patch_(TBL.USERS, u._row, { salt: salt, passHash: hash_(salt, newPw) });
    audit_(s.username, 'PASSWORD_CHANGED', 'User', s.id, '');
    return true;
  });
}

/* ============================ ADMIN: USERS, PERMISSIONS, SETTINGS, AUDIT ============================ */
function listUsers(token) {
  auth_(token, 'users.manage');
  return rows_(TBL.USERS).map(u => ({ id: u.id, username: u.username, name: u.name, role: u.role, active: u.active === true, lastLogin: u.lastLogin || '' }));
}
function saveUser(token, d) {
  const s = auth_(token, 'users.manage');
  if (ROLES.indexOf(d.role) < 0) throw new Error('Invalid role.');
  const uname = String(d.username || '').trim().toLowerCase();
  if (!uname) throw new Error('Username is required.');
  const active = d.active !== false && d.active !== 'false';
  return withLock_(() => {
    const users = rows_(TBL.USERS);
    if (users.some(u => String(u.username).toLowerCase() === uname && u.id !== d.id)) throw new Error('Username already exists.');
    if (d.id) {
      const u = users.find(x => x.id === d.id);
      if (!u) throw new Error('User not found.');
      if (u.id === s.id && (!active || d.role !== u.role)) throw new Error('You cannot deactivate or demote your own account.');
      const ch = { username: uname, name: d.name || uname, role: d.role, active: active };
      if (d.password) {
        if (String(d.password).length < 8) throw new Error('Password must be at least 8 characters.');
        ch.salt = Utilities.getUuid();
        ch.passHash = hash_(ch.salt, d.password);
      }
      patch_(TBL.USERS, u._row, ch);
      audit_(s.username, 'USER_UPDATED', 'User', d.id, uname + ' ' + d.role);
      return d.id;
    }
    if (!d.password || String(d.password).length < 8) throw new Error('New users need a password of at least 8 characters.');
    const id = id_('U'), salt = Utilities.getUuid();
    append_(TBL.USERS, { id: id, username: uname, name: d.name || uname, role: d.role, salt: salt, passHash: hash_(salt, d.password), active: active, lastLogin: '', createdAt: fmtTs_(new Date()) });
    audit_(s.username, 'USER_CREATED', 'User', id, uname + ' ' + d.role);
    return id;
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
  return withLock_(() => {
    Object.keys(SETTINGS_DEFAULT).forEach(k => {
      if (k === 'businessDate' || d[k] === undefined) return;   // business date only changes via night audit
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
function doGet(e) {
  // GitHub Action calls ?update=1&key=... after each push to main (see .github/workflows/update.yml).
  if (e && e.parameter && e.parameter.update !== undefined) return updateEndpoint_(e.parameter.key);
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

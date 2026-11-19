/* ============================ RECOVERY ============================
 * Forgot password: a 6-digit code is emailed to the user, then a new password is set.
 * Codes and reset tokens live in the script cache only, and are never written to the sheet.
 */
const OTP_SECONDS = 600;     // a code, and a reset token, are valid for 10 minutes
const OTP_MAX_TRIES = 5;     // wrong codes before the code is cancelled
const OTP_COOLDOWN = 60;     // seconds before another code can be sent to the same account

function escHtml_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function appName_() {
  try { return settings_().appName || ''; } catch (e) { return ''; }
}
/** Finds an active user by username or email (both compared in lower case). */
function findUserByIdentifier_(identifier) {
  const id = String(identifier || '').trim().toLowerCase();
  if (!id) return null;
  return rows_(TBL.USERS).find(u => u.active === true &&
    (String(u.username).toLowerCase() === id || String(u.email || '').toLowerCase() === id)) || null;
}
function maskEmail_(e) {
  const s = String(e || ''), at = s.indexOf('@');
  return at > 0 ? s.charAt(0) + '***' + s.slice(at) : '';
}
function hotelName_() {
  try { return settings_().hotelName || appName_(); } catch (e) { return appName_(); }
}
/** Fills {{placeholders}} in an email template saved in Settings. */
function tplText_(key, vars) {
  const tpl = settings_()[key] || SETTINGS_DEFAULT[key];
  return String(tpl).replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k] != null ? String(vars[k]) : '');
}
/** Turns the plain text into HTML. The verification code gets its own block, so mail apps (Gmail's copy-code button) can find it. */
function htmlFromText_(text, code) {
  const P = s => '<p style="margin:0 0 14px;font-size:15px;line-height:1.6">' + s + '</p>';
  const box = '<div style="margin:6px 0 20px"><span style="display:inline-block;font-family:Menlo,Consolas,monospace;font-size:28px;letter-spacing:6px;font-weight:700;color:#0f3d3e;background:#eef6f5;border:1px solid #cfe3e0;border-radius:12px;padding:10px 18px">' + escHtml_(code || '') + '</span></div>';
  return String(text).split(/\r?\n/).map(line => {
    if (!line.trim()) return '';
    if (code && line.indexOf(code) >= 0) {
      const parts = line.split(code);
      const before = parts[0].trim(), after = parts.slice(1).join(code).trim();
      return (before ? P(escHtml_(before)) : '') + box + (after ? P(escHtml_(after)) : '');
    }
    return P(escHtml_(line));
  }).join('');
}
/** Hotel logo for emails: the logo link or image from Settings, or the hotel's initial in a badge when none is set. */
function mailLogo_(st, hotel) {
  const url = String((st && st.logoUrl) || '');
  if (/^(https?:\/\/|data:image\/)/i.test(url)) {
    return '<img src="' + escHtml_(url) + '" alt="' + hotel + '" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:14px;background:#ffffff;object-fit:contain">';
  }
  return '<div style="width:56px;height:56px;border-radius:14px;background:#1f6b68;color:#ffffff;font-size:24px;font-weight:700;line-height:56px;text-align:center">' + hotel.charAt(0).toUpperCase() + '</div>';
}
/** Wraps the body in a branded, inline-styled layout (logo, hotel name, app name) that renders in Gmail and Outlook. */
function mailHtml_(bodyHtml) {
  let st = {};
  try { st = settings_() || {}; } catch (e) { st = {}; }
  const hotel = escHtml_(st.hotelName || appName_());
  const app = escHtml_(st.appName || '');
  return '<!doctype html><html><body style="margin:0;padding:0;background:#eef3f2;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#14232b">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f2;padding:32px 12px"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #d6e2df">' +
    '<tr><td style="background:#0f3d3e;padding:22px 28px">' +
      '<table role="presentation" cellspacing="0" cellpadding="0"><tr>' +
      '<td valign="middle" style="width:56px;padding-right:16px">' + mailLogo_(st, hotel) + '</td>' +
      '<td valign="middle"><div style="font-size:20px;line-height:1.25;font-weight:700;color:#ffffff">' + hotel + '</div>' +
      '<div style="margin-top:4px;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;font-weight:700;color:#f2b134">' + app + '</div></td>' +
      '</tr></table></td></tr>' +
    '<tr><td style="height:4px;background:#f2b134;font-size:0;line-height:0">&nbsp;</td></tr>' +
    '<tr><td style="padding:30px 32px 26px">' + bodyHtml + '</td></tr>' +
    '<tr><td style="padding:16px 32px;background:#f7faf9;border-top:1px solid #e3ebe9;font-size:12px;line-height:1.5;color:#66757d">' +
      hotel + ' · Sent by ' + app + '. This is an automated message, please do not reply.</td></tr>' +
    '</table></td></tr></table></body></html>';
}
/** Subject, plain text and HTML for one of the editable emails: kind is 'otp' or 'done'. */
function renderMail_(kind, vars) {
  const v = Object.assign({ appName: appName_(), hotelName: hotelName_() }, vars);
  const text = tplText_(kind + 'Body', v);
  let subject = tplText_(kind + 'Subject', v);
  if (v.code && subject.indexOf(v.code) < 0) subject = v.code + ' is your code · ' + subject;
  return { subject: subject, text: text, html: mailHtml_(htmlFromText_(text, v.code || '')) };
}

/** Sends the two emails to the signed-in admin's own address, so the wording can be checked. */
function sendEmailTest(token) {
  const s = auth_(token, 'system.manage');
  const u = rows_(TBL.USERS).find(x => x.id === s.id);
  if (!u || !u.email) throw new Error('Add an email to your user first (Administration → Users).');
  const who = u.name || u.username;
  const otp = renderMail_('otp', { name: who, code: '123456', minutes: Math.round(OTP_SECONDS / 60) });
  sendMail_(u.email, '[Test] ' + otp.subject, otp.text, otp.html);
  return { sentTo: maskEmail_(u.email) };
}

/** Sign-in with a code: after the right password, a 6-digit code is emailed. Held in the script cache only. */
function sendLoginCode_(user) {
  if (!user.email) throw new Error('This account needs a sign-in code, but it has no email address. Ask the system administrator to add one.');
  const pid = Utilities.getUuid().replace(/-/g, '');
  const code = String(100000 + Math.floor(Math.random() * 900000));
  const salt = Utilities.getUuid();
  const m = renderMail_('loginotp', { name: user.name || user.username, code: code, minutes: Math.round(OTP_SECONDS / 60) });
  sendMail_(user.email, m.subject, m.text, m.html);
  CacheService.getScriptCache().put('lc:' + pid, JSON.stringify({ u: user.id, h: hash_(salt, code), s: salt, t: 0 }), OTP_SECONDS);
  withLock_(() => audit_(user.username, 'LOGIN_CODE_SENT', 'User', user.id, maskEmail_(user.email)));
  return { otpRequired: true, pending: pid, sentTo: maskEmail_(user.email) };
}
/** Second sign-in step: checks the code and opens the session */
function loginVerify(pending, code) {
  const bad = 'That code is not valid or has expired. Sign in again to get a new code.';
  const cache = CacheService.getScriptCache(), key = 'lc:' + String(pending || '');
  const raw = cache.get(key);
  if (!raw) throw new Error(bad);
  const o = JSON.parse(raw);
  if (o.t >= OTP_MAX_TRIES) { cache.remove(key); throw new Error(bad); }
  if (hash_(o.s, String(code || '').trim()) !== o.h) {
    o.t += 1;
    if (o.t >= OTP_MAX_TRIES) { cache.remove(key); throw new Error('Too many wrong codes. Sign in again to get a new code.'); }
    cache.put(key, JSON.stringify(o), OTP_SECONDS);
    throw new Error('The code is wrong. Check the email and try again.');
  }
  cache.remove(key);
  const user = rows_(TBL.USERS).find(x => x.id === o.u);
  if (!user || user.active !== true) throw new Error(bad);
  return finishLogin_(user, 'fail:' + String(user.username).toLowerCase());
}

/** Step 1. Sends a code if the username or email matches an active account. Always answers the same way. */
function forgotRequest(identifier) {
  const cache = CacheService.getScriptCache();
  const generic = { message: 'If an account matches, a 6-digit code has been sent to its email address. It is valid for 10 minutes.', sentTo: '' };
  const u = findUserByIdentifier_(identifier);
  if (!u || !u.email) return generic;
  if (cache.get('otpcd:' + u.id)) return generic;               // a code was sent a moment ago
  const code = String(100000 + Math.floor(Math.random() * 900000));
  const salt = Utilities.getUuid();
  const m = renderMail_('otp', { name: u.name || u.username, code: code, minutes: Math.round(OTP_SECONDS / 60) });
  sendMail_(u.email, m.subject, m.text, m.html);
  cache.put('otp:' + u.id, JSON.stringify({ h: hash_(salt, code), s: salt, t: 0 }), OTP_SECONDS);
  cache.put('otpcd:' + u.id, '1', OTP_COOLDOWN);
  withLock_(() => audit_('system', 'PASSWORD_RESET_CODE_SENT', 'User', u.id, u.username));
  return { message: generic.message, sentTo: maskEmail_(u.email) };
}

/** Step 2. Checks the 6-digit code. Returns a reset token that works once, for 10 minutes. */
function forgotVerify(identifier, code) {
  const bad = 'That code is not valid or has expired. Request a new code.';
  const u = findUserByIdentifier_(identifier);
  if (!u) throw new Error(bad);
  const cache = CacheService.getScriptCache(), key = 'otp:' + u.id;
  const raw = cache.get(key);
  if (!raw) throw new Error(bad);
  const o = JSON.parse(raw);
  if (o.t >= OTP_MAX_TRIES) { cache.remove(key); throw new Error(bad); }
  if (hash_(o.s, String(code || '').trim()) !== o.h) {
    o.t += 1;
    if (o.t >= OTP_MAX_TRIES) { cache.remove(key); throw new Error('Too many wrong codes. Request a new code.'); }
    cache.put(key, JSON.stringify(o), OTP_SECONDS);
    throw new Error('The code is wrong. Check the email and try again.');
  }
  cache.remove(key);
  const token = Utilities.getUuid();
  cache.put('rst:' + token, u.id, OTP_SECONDS);
  return { resetToken: token };
}

/** Step 3. Sets the new password. The token is used up, and the user gets a confirmation email. */
function forgotReset(resetToken, newPassword) {
  const cache = CacheService.getScriptCache(), key = 'rst:' + String(resetToken || '');
  const userId = cache.get(key);
  if (!userId) throw new Error('This reset has expired. Start again.');
  checkNewPassword_(newPassword);
  return withLock_(() => {
    const u = rows_(TBL.USERS).find(x => x.id === userId && x.active === true);
    if (!u) throw new Error('This account is no longer active.');
    const salt = Utilities.getUuid();
    // A reset proves who the person is, so it also clears a lock and the wrong-password count
    patch_(TBL.USERS, u._row, { salt: salt, passHash: hash_(salt, newPassword), failCount: 0, locked: false });
    cache.remove(key);
    cache.remove('fail:' + String(u.username).toLowerCase());
    cache.remove('fail:' + String(u.email || '').toLowerCase());
    audit_('system', 'PASSWORD_RESET', 'User', u.id, u.username);
    if (u.email) {
      const who = u.name || u.username;
      const m = renderMail_('done', { name: u.name || u.username });
      sendMail_(u.email, m.subject, m.text, m.html);
    }
    return true;
  });
}

/** Run once from the editor if the admin cannot sign in and has no email. Needs ADMIN_PASSWORD in Script properties. */
function resetAdminPassword() {
  const pw = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD') || '';
  checkNewPassword_(pw);
  const salt = Utilities.getUuid();
  const passHash = hash_(salt, pw);
  withLock_(() => {
    const admin = rows_(TBL.USERS).find(x => String(x.username).toLowerCase() === 'admin');
    if (admin) {
      patch_(TBL.USERS, admin._row, { salt: salt, passHash: passHash, active: true });
    } else {
      append_(TBL.USERS, { id: id_('U'), username: 'admin', name: 'Administrator', role: 'Admin', salt: salt, passHash: passHash, active: true, lastLogin: '', createdAt: fmtTs_(new Date()), email: '' });
    }
  });
  CacheService.getScriptCache().remove('fail:admin');
  return 'Admin password is set. Sign in as admin, then delete ADMIN_PASSWORD from Script properties.';
}

/** Welcome email for a new user: login details and a temporary password (must be changed at first sign-in). */
function sendWelcome_(u, tempPassword) {
  const m = renderMail_('welcome', { name: u.name || u.username, username: u.username, tempPassword: tempPassword,
    role: u.role, appUrl: settings_().appUrl || '' });
  sendMail_(u.email, m.subject, m.text, m.html);
}
/** A readable temporary password with upper, lower and digit characters (passes checkNewPassword_). */
function genTempPassword_() {
  const pick = s => s.charAt(Math.floor(Math.random() * s.length));
  const U = 'ABCDEFGHJKMNPQRSTUVWXYZ', L = 'abcdefghjkmnpqrstuvwxyz', D = '23456789';
  let p = pick(U) + pick(L) + pick(D);
  while (p.length < 10) p += pick(U + L + D);
  return p;
}

/* ============================ EMAIL SENDING ============================
 * Mail goes through the hotel's own SMTP server when it is switched on (System admin → Email sending).
 * Apps Script cannot open an SMTP connection itself, so the SMTP details are handed over HTTPS to a
 * small relay the hotel runs (mail-relay/worker.js). The SMTP password and the relay secret are kept
 * in Script properties, never in the Settings sheet. When SMTP is off, mail goes out from the Google
 * account as before.
 */
const SMTP_PASSWORD_PROP = 'SMTP_PASSWORD';
const RELAY_SECRET_PROP = 'RELAY_SECRET';
const SMTP_SECURITY = ['starttls', 'ssl', 'none'];

function smtpConfig_() {
  const s = settings_();
  const pr = PropertiesService.getScriptProperties();
  return {
    active: String(s.smtpActive) === 'true',
    host: String(s.smtpHost || '').trim(),
    port: Number(s.smtpPort) || 587,
    security: SMTP_SECURITY.indexOf(s.smtpSecurity) >= 0 ? s.smtpSecurity : 'starttls',
    user: String(s.smtpUser || '').trim(),
    from: String(s.smtpFrom || '').trim(),
    relayUrl: String(s.relayUrl || '').trim(),
    pass: pr.getProperty(SMTP_PASSWORD_PROP) || '',
    secret: pr.getProperty(RELAY_SECRET_PROP) || '',
    resendActive: String(s.resendActive) === 'true',
    resendFrom: String(s.resendFrom || '').trim(),
    resendEnc: rawSetting_('resendApiKey')
  };
}
function rawSetting_(k) {
  const row = rows_(TBL.SETTINGS).find(r => r.key === k);
  return row && row.value != null ? String(row.value) : '';
}

/* ---- Encryption of secrets kept in the database ----
 * Apps Script has no AES. This is a stream cipher built from HMAC-SHA256 (a keystream from HMAC of a
 * random salt and a block counter), with an HMAC tag over the ciphertext (encrypt-then-MAC). The key is
 * generated once and kept in Script properties, so the sheet holds only ciphertext. Losing the key means
 * the saved secret must be entered again.
 */
const SECRET_KEY_PROP = 'SECRET_KEY';
function secretKey_() {
  return withLock_(() => {
    const pr = PropertiesService.getScriptProperties();
    let k = pr.getProperty(SECRET_KEY_PROP);
    if (!k) { k = Utilities.getUuid() + Utilities.getUuid(); pr.setProperty(SECRET_KEY_PROP, k); }
    return k;
  });
}
const signed_ = v => (v & 0xff) > 127 ? (v & 0xff) - 256 : (v & 0xff);
function keystream_(key, salt, n) {
  const out = [];
  for (let blk = 0; out.length < n; blk++) {
    const b = Utilities.computeHmacSha256Signature(salt + ':' + blk, key);
    for (let i = 0; i < b.length && out.length < n; i++) out.push(b[i] & 0xff);
  }
  return out;
}
function encryptSetting_(plain) {
  const key = secretKey_();
  const salt = Utilities.getUuid().replace(/-/g, '');
  const pt = Utilities.newBlob(String(plain)).getBytes();
  const ks = keystream_(key, salt, pt.length);
  const ct = Utilities.base64Encode(pt.map((b, i) => signed_((b & 0xff) ^ ks[i])));
  const tag = Utilities.base64Encode(Utilities.computeHmacSha256Signature('v1|' + salt + '|' + ct, key + '|mac'));
  return 'v1:' + salt + ':' + ct + ':' + tag;
}
function decryptSetting_(enc) {
  const parts = String(enc || '').split(':');
  const bad = 'The saved secret cannot be read. Enter it again in System admin → Email sending.';
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error(bad);
  const key = secretKey_();
  const tag = Utilities.base64Encode(Utilities.computeHmacSha256Signature('v1|' + parts[1] + '|' + parts[2], key + '|mac'));
  if (tag !== parts[3]) throw new Error(bad);
  const ct = Utilities.base64Decode(parts[2]);
  const ks = keystream_(key, parts[1], ct.length);
  return Utilities.newBlob(ct.map((b, i) => signed_((b & 0xff) ^ ks[i]))).getDataAsString();
}

/** Sends one email: through SMTP when it is on, otherwise from the Google account. */
function sendMail_(to, subject, text, html) {
  const c = smtpConfig_();
  if (c.active) return sendViaSmtp_(c, to, subject, text, html);
  if (c.resendActive) return sendViaResend_(c, to, subject, text, html);
  try {
    MailApp.sendEmail({ to: to, subject: subject, body: text, htmlBody: html, name: appName_() });
  } catch (e) {
    throw new Error('The email could not be sent right now. Try again in a few minutes, or ask the administrator.');
  }
}

/** Sends through the Resend API. The key is decrypted only for this request. */
function sendViaResend_(c, to, subject, text, html) {
  if (!c.resendFrom) throw new Error('Resend is on, but the from address is missing. Fix it in System admin → Email sending.');
  if (!c.resendEnc) throw new Error('Resend is on, but no API key is saved. Save it in System admin → Email sending.');
  const key = decryptSetting_(c.resendEnc);
  const name = String(appName_() || '').replace(/["\\\r\n]/g, '');
  let res;
  try {
    res = UrlFetchApp.fetch('https://api.resend.com/emails', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + key },
      payload: JSON.stringify({ from: (name ? '"' + name + '" ' : '') + '<' + c.resendFrom + '>', to: [to], subject: subject, text: text, html: html })
    });
  } catch (e) {
    throw new Error('Resend could not be reached. Check the internet connection, then try again.');
  }
  if (res.getResponseCode() === 200) return;
  let msg = '';
  try { msg = JSON.parse(res.getContentText()).message || ''; } catch (e) { msg = ''; }
  throw new Error('Resend could not send the email' + (msg ? ': ' + msg : ' (code ' + res.getResponseCode() + ')') + '.');
}

function sendViaSmtp_(c, to, subject, text, html) {
  if (!c.host || !c.from) throw new Error('SMTP is on, but the server or the from address is missing. Fix it in System admin → Email sending.');
  if (!c.relayUrl) throw new Error('SMTP is on, but the mail relay address is missing. Fix it in System admin → Email sending.');
  if (!c.secret) throw new Error('The mail relay secret is not set. Save it in System admin → Email sending.');
  let res;
  try {
    res = UrlFetchApp.fetch(c.relayUrl, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, followRedirects: false,
      headers: { 'X-Relay-Secret': c.secret },
      payload: JSON.stringify({
        smtp: { host: c.host, port: c.port, security: c.security, user: c.user, pass: c.pass, from: c.from },
        fromName: appName_(), to: to, subject: subject, text: text, html: html
      })
    });
  } catch (e) {
    throw new Error('The mail relay could not be reached. Check its address in System admin → Email sending.');
  }
  if (res.getResponseCode() === 200) return;
  let msg = '';
  try { msg = JSON.parse(res.getContentText()).error || ''; } catch (e) { msg = ''; }
  throw new Error('The email could not be sent through SMTP' + (msg ? ': ' + msg : ' (the relay answered ' + res.getResponseCode() + ')') + '.');
}

function upsertSetting_(k, v) {
  const row = rows_(TBL.SETTINGS).find(r => r.key === k);
  if (row) patch_(TBL.SETTINGS, row._row, { value: v }); else append_(TBL.SETTINGS, { key: k, value: v });
}

/** What System admin → Email sending shows. Secrets are never sent back, only whether they are set. */
function getEmailConfig(token) {
  auth_(token, 'system.manage');
  const c = smtpConfig_();
  return { active: c.active, host: c.host, port: c.port, security: c.security, user: c.user, from: c.from,
    relayUrl: c.relayUrl, passSet: !!c.pass, secretSet: !!c.secret,
    resendActive: c.resendActive, resendFrom: c.resendFrom, resendKeySet: !!c.resendEnc };
}

/** Saves the SMTP settings. A blank password or relay secret keeps the saved one. */
function saveEmailConfig(token, d) {
  const s = auth_(token, 'system.manage');
  d = d || {};
  const active = d.active === true || d.active === 'true';
  const port = d.port === undefined || d.port === '' ? 587 : Math.round(Number(d.port));
  const security = String(d.security || 'starttls');
  const v = {
    smtpActive: active ? 'true' : 'false',
    smtpHost: String(d.host || '').trim(),
    smtpPort: String(port || 587),
    smtpSecurity: security,
    smtpUser: String(d.user || '').trim(),
    smtpFrom: String(d.from || '').trim(),
    relayUrl: String(d.relayUrl || '').trim()
  };
  if (SMTP_SECURITY.indexOf(security) < 0) throw new Error('Choose the connection security: STARTTLS, SSL/TLS or none.');
  v.resendActive = d.resendActive === true || d.resendActive === 'true' ? 'true' : 'false';
  v.resendFrom = String(d.resendFrom || '').trim();
  if (v.resendFrom && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.resendFrom)) throw new Error('The Resend from address must be an email address.');
  const resendHasKey = !!rawSetting_('resendApiKey') || !!String(d.resendApiKey || '').trim();
  if (v.resendActive === 'true' && !v.resendFrom) throw new Error('Enter the Resend from address (it must be on a domain verified in Resend).');
  if (v.resendActive === 'true' && !resendHasKey) throw new Error('Enter the Resend API key.');
  if (!(port >= 1 && port <= 65535)) throw new Error('The SMTP port must be a number from 1 to 65535.');
  if (v.smtpFrom && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.smtpFrom)) throw new Error('The from address must be an email address.');
  if (v.relayUrl && !/^https:\/\/[^\s]+$/i.test(v.relayUrl)) throw new Error('The mail relay address must start with https://.');
  if (active) {
    if (!v.smtpHost) throw new Error('Enter the SMTP server name.');
    if (!v.smtpFrom) throw new Error('Enter the from address.');
    if (!v.relayUrl) throw new Error('Enter the mail relay address.');
  }
  withLock_(() => {
    Object.keys(v).forEach(k => upsertSetting_(k, v[k]));
    const pr = PropertiesService.getScriptProperties();
    if (d.password) pr.setProperty(SMTP_PASSWORD_PROP, String(d.password));
    if (d.clearPassword === true || d.clearPassword === 'true') pr.deleteProperty(SMTP_PASSWORD_PROP);
    if (d.relaySecret) pr.setProperty(RELAY_SECRET_PROP, String(d.relaySecret));
    const newKey = String(d.resendApiKey || '').trim();
    if (newKey) upsertSetting_('resendApiKey', encryptSetting_(newKey));
    if (d.clearResendKey === true || d.clearResendKey === 'true') upsertSetting_('resendApiKey', '');
    audit_(s.username, 'EMAIL_SETTINGS_SAVED', 'Settings', 'smtp', active ? 'SMTP on' : 'SMTP off');
  });
  return getEmailConfig(token);
}

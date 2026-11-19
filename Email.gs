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
    secret: pr.getProperty(RELAY_SECRET_PROP) || ''
  };
}

/** Sends one email: through SMTP when it is on, otherwise from the Google account. */
function sendMail_(to, subject, text, html) {
  const c = smtpConfig_();
  if (c.active) return sendViaSmtp_(c, to, subject, text, html);
  try {
    MailApp.sendEmail({ to: to, subject: subject, body: text, htmlBody: html, name: appName_() });
  } catch (e) {
    throw new Error('The email could not be sent right now. Try again in a few minutes, or ask the administrator.');
  }
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
    relayUrl: c.relayUrl, passSet: !!c.pass, secretSet: !!c.secret };
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
    audit_(s.username, 'EMAIL_SETTINGS_SAVED', 'Settings', 'smtp', active ? 'SMTP on' : 'SMTP off');
  });
  return getEmailConfig(token);
}

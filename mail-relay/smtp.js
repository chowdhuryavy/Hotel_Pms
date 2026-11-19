/* Stayline mail relay: the SMTP conversation.
 * Plain JavaScript with no imports. The caller passes the socket connector, so the same code runs in a
 * Cloudflare Worker (connect from "cloudflare:sockets") and in the tests (a Node socket adapter).
 * Sends one message with one recipient, using AUTH PLAIN when a username is given.
 */
const ENC = new TextEncoder();
const DEC = new TextDecoder();

export function b64(str) {
  const bytes = ENC.encode(String(str));
  let bin = '';
  for (const x of bytes) bin += String.fromCharCode(x);
  return btoa(bin);
}
/** Header words that are not plain ASCII are encoded as UTF-8 (RFC 2047). */
function word(str) {
  const s = String(str);
  return /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + b64(s) + '?=';
}
function wrap76(s) { return s.replace(/.{1,76}/g, '$&\r\n'); }

/** Builds the message: text and HTML parts, base64 encoded, so no line can break the SMTP data. */
export function buildMessage(d, now = new Date()) {
  const boundary = 'stayline_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const mixed = 'stayline_mix_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const domain = String(d.smtp.from).split('@')[1] || 'localhost';
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const name = String(d.fromName || '').replace(/["\\\r\n]/g, '');
  const fromHdr = (name ? (/^[\x20-\x7e]*$/.test(name) ? '"' + name + '"' : word(name)) + ' ' : '') + '<' + d.smtp.from + '>';
  const part = (type, body) => 'Content-Type: ' + type + '; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + wrap76(b64(body));
  const headers = [
    'From: ' + fromHdr,
    'To: <' + d.to + '>',
    'Subject: ' + word(d.subject || ''),
    'Date: ' + now.toUTCString(),
    'Message-ID: <' + id + '@' + domain + '>',
    'MIME-Version: 1.0'
  ];
  const alt = [
    '--' + boundary,
    part('text/plain', d.text || ''),
    '--' + boundary,
    part('text/html', d.html || d.text || ''),
    '--' + boundary + '--'
  ].join('\r\n');
  const att = d.attachment && d.attachment.b64 ? d.attachment : null;
  if (!att) {
    return headers.concat(['Content-Type: multipart/alternative; boundary="' + boundary + '"', '', alt, '']).join('\r\n');
  }
  const file = String(att.name || 'attachment.pdf').replace(/["\\\r\n]/g, '');
  return headers.concat([
    'Content-Type: multipart/mixed; boundary="' + mixed + '"', '',
    '--' + mixed,
    'Content-Type: multipart/alternative; boundary="' + boundary + '"', '', alt, '',
    '--' + mixed,
    'Content-Type: application/pdf; name="' + file + '"',
    'Content-Disposition: attachment; filename="' + file + '"',
    'Content-Transfer-Encoding: base64', '',
    wrap76(att.b64),
    '--' + mixed + '--', ''
  ]).join('\r\n');
}

class Conn {
  constructor(sock) { this.attach(sock); }
  attach(sock) { this.sock = sock; this.reader = sock.readable.getReader(); this.writer = sock.writable.getWriter(); this.buf = ''; }
  detach() { try { this.reader.releaseLock(); } catch (e) { /* already released */ } try { this.writer.releaseLock(); } catch (e) { /* already released */ } }
  async close() { try { await this.writer.close(); } catch (e) { /* ignore */ } try { await this.sock.close(); } catch (e) { /* ignore */ } }
  async line() {
    for (;;) {
      const i = this.buf.indexOf('\n');
      if (i >= 0) { const l = this.buf.slice(0, i).replace(/\r$/, ''); this.buf = this.buf.slice(i + 1); return l; }
      const { value, done } = await this.reader.read();
      if (done) throw new Error('The mail server closed the connection.');
      this.buf += DEC.decode(value, { stream: true });
    }
  }
  /** Reads one reply, which can span several lines ("250-..." then "250 ..."). */
  async reply() {
    let text = '';
    for (;;) {
      const l = await this.line();
      const m = /^(\d{3})([ -])(.*)$/.exec(l);
      if (!m) continue;
      text = text ? text + ' ' + m[3] : m[3];
      if (m[2] === ' ') return { code: Number(m[1]), text: text };
    }
  }
  async send(data) { await this.writer.write(ENC.encode(data)); }
  async check(expect, what) {
    const r = await this.reply();
    if ([].concat(expect).indexOf(r.code) < 0) throw new Error(what + ' failed (' + r.code + ' ' + r.text.slice(0, 200) + ')');
    return r;
  }
  async cmd(line, expect, what) { await this.send(line + '\r\n'); return this.check(expect, what); }
}

function withTimeout(promise, ms) {
  let t;
  const limit = new Promise((_, rej) => { t = setTimeout(() => rej(new Error('The mail server did not answer in time.')), ms); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(t));
}

/** Sends one email through the SMTP server in d.smtp. security: 'starttls' | 'ssl' | 'none'. */
export async function sendSmtp(d, connectFn, timeoutMs = 30000) {
  const s = d.smtp;
  const mode = s.security === 'ssl' ? 'on' : s.security === 'starttls' ? 'starttls' : 'off';
  const sock0 = connectFn({ hostname: s.host, port: Number(s.port) }, { secureTransport: mode, allowHalfOpen: false });
  const conn = new Conn(sock0);
  const session = async () => {
    await conn.check(220, 'Connecting to the mail server');
    await conn.cmd('EHLO relay.stayline', 250, 'Greeting the mail server');
    if (s.security === 'starttls') {
      await conn.cmd('STARTTLS', 220, 'Starting encryption');
      conn.detach();                       // the plain streams hand over to the encrypted socket
      conn.attach(conn.sock.startTls());
      await conn.cmd('EHLO relay.stayline', 250, 'Greeting the mail server');
    }
    if (s.user) {
      // Never put the command text in an error: it holds the password
      await conn.cmd('AUTH PLAIN ' + b64('\0' + s.user + '\0' + (s.pass || '')), 235, 'Signing in to the mail server (check the username and password)');
    }
    await conn.cmd('MAIL FROM:<' + s.from + '>', 250, 'Sender address');
    await conn.cmd('RCPT TO:<' + d.to + '>', [250, 251], 'Recipient address');
    await conn.cmd('DATA', 354, 'Starting the message');
    await conn.send(buildMessage(d).replace(/\r?\n\./g, '\r\n..') + '\r\n.\r\n');
    await conn.check(250, 'Sending the message');
    await conn.cmd('QUIT', 221, 'Closing').catch(() => {});
  };
  try {
    await withTimeout(session(), timeoutMs);
  } finally {
    await conn.close();
  }
}

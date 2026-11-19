// Tests the SMTP conversation against a fake SMTP server (plain, no TLS). Run: node test-smtp.mjs
import net from 'node:net';
import { Duplex } from 'node:stream';
import { sendSmtp, buildMessage } from './smtp.js';

const connectNode = ({ hostname, port }) => {
  const sock = net.connect(port, hostname);
  const d = Duplex.toWeb(sock);
  return { readable: d.readable, writable: d.writable, close: async () => sock.destroy(), startTls() { throw new Error('no TLS in this test'); } };
};

// A fake SMTP server. It accepts AUTH PLAIN only for user "u@h.com" with password "good-pass".
function fakeServer(log) {
  return new Promise(res => {
    const srv = net.createServer(c => {
      let inData = false, data = '', buf = '';
      c.write('220 fake.test ESMTP\r\n');
      c.on('data', chunk => {
        buf += chunk.toString('utf8');
        let i;
        while ((i = buf.indexOf('\r\n')) >= 0 || (inData && buf.indexOf('\r\n.\r\n') >= 0)) {
          if (inData) {
            const end = buf.indexOf('\r\n.\r\n');
            if (end < 0) break;
            data = buf.slice(0, end); buf = buf.slice(end + 5); inData = false;
            log.data = data; c.write('250 queued\r\n'); continue;
          }
          const line = buf.slice(0, i); buf = buf.slice(i + 2);
          log.lines.push(line.startsWith('AUTH') ? 'AUTH ****' : line);
          if (/^EHLO/i.test(line)) c.write('250-fake.test\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n');
          else if (/^AUTH PLAIN /.test(line)) {
            const [u, p] = Buffer.from(line.slice(11), 'base64').toString('utf8').split('\0').slice(1);
            if (u === 'u@h.com' && p === 'good-pass') c.write('235 2.7.0 Authentication successful\r\n');
            else c.write('535 5.7.8 Authentication credentials invalid\r\n');
          }
          else if (/^MAIL FROM/i.test(line)) c.write('250 OK\r\n');
          else if (/^RCPT TO/i.test(line)) c.write('250 OK\r\n');
          else if (/^DATA/i.test(line)) { inData = true; c.write('354 go ahead\r\n'); }
          else if (/^QUIT/i.test(line)) { c.write('221 bye\r\n'); c.end(); }
          else c.write('500 unknown\r\n');
        }
      });
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

const base = { to: 'guest@example.com', subject: 'Reset code: 123456 · Stayline ünïcode', text: 'Your verification code is 123456', html: '<p>Your verification code is <b>123456</b></p>', fromName: 'Stayline Hotel' };
let fails = 0; const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

{
  const log = { lines: [], data: '' };
  const srv = await fakeServer(log);
  const port = srv.address().port;
  await sendSmtp({ ...base, smtp: { host: '127.0.0.1', port, security: 'none', user: 'u@h.com', pass: 'good-pass', from: 'hotel@h.com' } }, connectNode, 5000);
  check(log.lines.some(l => l === 'AUTH ****'), 'signs in with the username and password');
  check(log.lines.includes('MAIL FROM:<hotel@h.com>') && log.lines.includes('RCPT TO:<guest@example.com>'), 'sends from the hotel address to the guest');
  check(/^Subject: =\?UTF-8\?B\?/m.test(log.data), 'non-ASCII subject is encoded as UTF-8');
  const subj = Buffer.from(/Subject: =\?UTF-8\?B\?(.*?)\?=/.exec(log.data)[1], 'base64').toString('utf8');
  check(subj === base.subject, 'subject decodes back to the original text');
  check(/^From: "Stayline Hotel" <hotel@h\.com>/m.test(log.data), 'From header carries the app name and address');
  const plain = Buffer.from(log.data.split('Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g, ''), 'base64').toString('utf8');
  check(plain === base.text, 'plain-text part carries the code');
  check(/multipart\/alternative/.test(log.data) && /text\/html/.test(log.data), 'HTML part is included');
  srv.close();
}
{
  const log = { lines: [], data: '' };
  const srv = await fakeServer(log);
  let msg = '';
  try { await sendSmtp({ ...base, smtp: { host: '127.0.0.1', port: srv.address().port, security: 'none', user: 'u@h.com', pass: 'wrong', from: 'hotel@h.com' } }, connectNode, 5000); }
  catch (e) { msg = e.message; }
  check(/Signing in to the mail server/.test(msg) && /535/.test(msg), 'wrong password is reported clearly: ' + msg);
  check(!/wrong/.test(msg), 'the password is not repeated in the error');
  srv.close();
}
{
  const m = buildMessage({ ...base, smtp: { from: 'hotel@h.com' } }, new Date('2026-11-19T06:00:00Z'));
  check(!/\r\n\r\n\r\n\./.test(m) && m.split('\r\n').every(l => l.length < 1000), 'message lines are well formed');
  check(/^Date: Thu, 19 Nov 2026 06:00:00 GMT$/m.test(m), 'Date header is set');
}
console.log(fails ? fails + ' failed' : 'all passed');
process.exit(fails ? 1 : 0);

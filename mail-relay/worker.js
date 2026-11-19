/* Stayline mail relay (Cloudflare Worker). Apps Script posts each email here over HTTPS, and this sends
 * it through the hotel's own SMTP server. Set RELAY_SECRET with `wrangler secret put RELAY_SECRET`.
 * Only requests carrying that secret are accepted, so the relay cannot be used by anyone else.
 */
import { connect } from 'cloudflare:sockets';
import { sendSmtp } from './smtp.js';

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const hasBreak = s => /[\r\n]/.test(String(s || ''));

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const secret = env.RELAY_SECRET || '';
    if (!secret || request.headers.get('X-Relay-Secret') !== secret) return json({ error: 'Not allowed' }, 403);
    let d;
    try { d = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const s = (d && d.smtp) || {};
    if (!s.host || !s.from || !d.to || !(Number(s.port) >= 1)) return json({ error: 'Incomplete mail details' }, 400);
    if (['starttls', 'ssl', 'none'].indexOf(s.security) < 0) return json({ error: 'Unknown connection security' }, 400);
    if ([s.host, s.from, s.user, s.pass, d.to, d.subject, d.fromName].some(hasBreak)) return json({ error: 'Bad characters in mail details' }, 400);
    try {
      await sendSmtp(d, connect);
      return json({ ok: true });
    } catch (e) {
      return json({ error: String((e && e.message) || e).slice(0, 300) }, 502);
    }
  }
};

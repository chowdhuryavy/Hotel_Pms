/**
 * Stayline IP gate (Cloudflare Worker).
 * Only the IP addresses listed in ALLOWED_IPS can open the app. Everyone else gets 403.
 * ALLOWED_IPS: comma-separated IPv4 addresses or CIDR ranges, e.g. "203.0.113.10, 198.51.100.0/24".
 * APP_URL: the Apps Script web app address (the /exec link).
 */

function ipv4ToInt(ip) {
  const p = String(ip).split('.');
  if (p.length !== 4) return null;
  let n = 0;
  for (const x of p) {
    const v = Number(x);
    if (!/^\d{1,3}$/.test(x) || v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

function ipAllowed(ip, rules) {
  const addr = ipv4ToInt(ip);
  return rules.some(rule => {
    const [base, bits] = rule.split('/');
    if (bits === undefined) return rule === ip;               // exact match (also IPv6)
    const b = ipv4ToInt(base), len = Number(bits);
    if (addr === null || b === null || !(len >= 0 && len <= 32)) return false;
    const mask = len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0;
    return ((addr & mask) >>> 0) === ((b & mask) >>> 0);
  });
}

export default {
  async fetch(request, env) {
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const rules = String(env.ALLOWED_IPS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!rules.length || !ipAllowed(ip, rules)) {
      return new Response('Access denied from this network.', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    const incoming = new URL(request.url);
    const target = new URL(env.APP_URL);
    target.search = incoming.search;
    // Forward the request as it is (method, body, headers), so the app works the same as its own address
    const init = { method: request.method, headers: request.headers, redirect: 'follow' };
    if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;
    return fetch(target.toString(), init);
  }
};

# Stayline IP gate

A Cloudflare Worker in front of the Stayline web app. Only the addresses in `ALLOWED_IPS` can open the app. Everyone else gets "Access denied".

## Set up

1. Create a free Cloudflare account and a Worker (Workers & Pages > Create > Worker). You can use the free `*.workers.dev` address.
2. Replace the Worker's code with `worker.js`, or deploy with `npx wrangler deploy` from this folder.
3. Under the Worker's Settings > Variables, add:
   - `ALLOWED_IPS`: the hotel's public IP addresses or ranges, comma-separated. Find the hotel's address by opening https://ifconfig.me from a hotel computer.
   - `APP_URL`: the Apps Script `/exec` address of Stayline.
4. Give staff the Worker's address, not the Apps Script address.

## Limits you must know

- The Apps Script address still works from any network unless the Apps Script deployment is restricted. In Apps Script, set the web app to run as you and to allow only your Workspace domain or specific accounts. Anyone with the Apps Script address and a valid sign-in can still reach the app from outside.
- Apps Script pages open in an embedded frame that loads Google content directly. Through a proxy, sign-in cookies may not pass. Test once from an allowed and a blocked network before relying on it.
- The IP is read from `CF-Connecting-IP`, which Cloudflare sets. Staff on mobile data or a home connection will be blocked unless their address is added.

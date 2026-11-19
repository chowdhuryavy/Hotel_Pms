# Stayline mail relay

Apps Script cannot connect to an SMTP server, so Stayline sends email through this small relay.
Apps Script posts each email over HTTPS to the relay, and the relay sends it through your SMTP server.
Run it on your own Cloudflare account (free plan is enough).

## Set up

1. Install Wrangler (`npm install -g wrangler`) and sign in with `wrangler login`.
2. In this folder, deploy: `wrangler deploy`. Note the address it prints, for example `https://stayline-mail-relay.<your-subdomain>.workers.dev`.
3. Choose a long random secret and store it in the relay:
   `wrangler secret put RELAY_SECRET`
4. In Stayline, open System admin → Email sending (SMTP):
   - Tick "Send email through my SMTP server".
   - Enter the SMTP server, port, connection security, username and password from your mail provider.
   - From address: the address the emails should come from.
   - Mail relay address: the address from step 2.
   - Mail relay secret: the same value as step 3.
   - Save, then press "Send a test email to me".

## Notes

- Use port 587 with STARTTLS, or port 465 with SSL/TLS. Port 25 is blocked for Workers.
- The relay accepts only requests that carry the secret. Keep it private.
- The SMTP password and the relay secret are stored in Apps Script Script properties. They are never shown again after saving; leave the field blank to keep the saved one.
- If SMTP is switched off, Stayline sends from the Google account as before.
- Test the relay: `node test-smtp.mjs` checks the SMTP conversation against a fake server, and does not need a live mail server.

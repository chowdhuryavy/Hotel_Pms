# Stayline – Hotel management (front office to check-out)

A multi-page property management system built on Google Apps Script with Google Sheets as the database. It follows the Opera-style flow: reservations → rate and availability → room rack → arrival and check-in → folio charges and payments → transfers → check-out → night audit → reports. Company (city ledger) accounts, cashier shifts with cash reconciliation, guest alerts and housekeeping assignment are included.

## Version

Stayline **1.2.51**. The version is set in `APP_VERSION` in `Config.gs` and shows on the sign-in page and in the sidebar. Bump it on every release.

Release notes for 1.2.51: Night audit runs a sense check for each item and ticks it off in turn: business date open, guests due out, past-due arrivals, departures with a balance, cashier shifts, dirty rooms, rooms out of order, and room rates for stayers. Guests due out today block the audit until each one is checked out or extended by one night. The audit then ticks each step as it completes. The night run closes every open cashier shift (cash is not counted, so counted and variance stay blank) and saves the city-ledger (AR) aging for that date to a new ARAging tab (run Set up database once to create it). The bell panel fits the phone screen. Every hard-coded "Stayline" fallback is removed: names come from the App name in Settings, and the menu title follows it.

Release notes for 1.2.50: Check-out settles any balance first: the settlement screen lists each folio's balance and takes a payment by method and amount. Card payments ask for the card number (checked by Luhn) and expiry date; only the last four digits and the expiry are kept. Payments and check-outs keep retrying for up to 60 seconds if the connection drops, with a request id so a retry cannot post twice. A bell in the header lists arrivals, past-due arrivals, departures with a balance and dirty rooms; Mark all read and Clear are saved per user. Reads for the front-desk board and reports are cached for up to 60 seconds, and any saved change clears the cache. The login logo shows from the copy saved on the device, and the placeholder logo is gone.

Release notes for 1.2.49: Every saved change moves a server change stamp (dataChanged_, called from withLock_). Open apps check the stamp every 15 seconds while visible. When another user has changed data, the current page reloads and a notice shows; open forms are not replaced.

Release notes for 1.2.48: The update pop-up's Refresh button sends the browser to the web app's own address with a new version number, so the newest version loads. The server supplies that address to the page.

Release notes for 1.2.47: On phones the menu opens from the top edge of the screen and covers the header. Its hotel name is shown once, in the menu, and a close button in the menu header closes it. The header's hotel name is hidden while the menu is open.

Release notes for 1.2.46: Every page in the sidebar has an icon. On desktop the sidebar collapses to an icon rail whose icons still open their pages. The dashboard KPI tiles, quick actions and card headings have icons, and a new occupancy gauge with a meter sits beside the room-type and movement charts.

Release notes for 1.2.45: The update pop-up's Refresh button saves the current page before reloading, reloads in place, and falls back to a normal reload if the browser ignores the first attempt. The page is restored after the reload even if the address hash was lost.

Release notes for 1.2.44: The sign-in page has icons in the username and password fields, and a more polished desktop layout with a grid texture, a footer line and an accent bar on the sign-in card.

Release notes for 1.2.43: The update pop-up's Refresh button reloads the current page in place and keeps the page you are on, instead of opening the app's base address.

Release notes for 1.2.42: The reset code email puts the code in its own block after "Your verification code is", so mail apps can recognise it and offer a copy button.

Release notes for 1.2.41: "Send code" and "Resend code" on the forgot-password screen show a spinner while the email is sent.

Release notes for 1.2.40: Emails have a branded header with the hotel logo (from Settings), the hotel name and the app name, and a cleaner layout. Emails use the logo link from Settings; a logo that is not a web link shows the hotel's initial instead.

Release notes for 1.2.39: On phones the header stays on top when the menu opens, and the menu starts below it, so the sidebar's full hotel name and app name are visible.

Release notes for 1.2.38: The dashboard greets the user by name with a live clock and business date. It adds an in-house room-type donut chart and a today's movement chart. The sidebar header shows the full hotel name, with the app name beneath. Once the night audit closes a business date, its postings are frozen: voids, transfers and splits on that date are refused.

Release notes for 1.2.37: The connection status moved from the header to the System admin page, where it sits with the connection details.

Release notes for 1.2.36: The update pop-up's Refresh button now reloads the app properly. It loads the newest version from the top window, with a fallback if the browser blocks that.

Release notes for 1.2.35: The new-version pop-up now reads "New update available. Version X is available. Please refresh to update."

Release notes for 1.2.34: When the sidebar is open on a phone, the header stays visible with the hotel name and search. The sidebar header shows the logo, the app name and the hotel name in one clean block.

Release notes for 1.2.33: When a new version of the app is published, an open app shows a small pop-up with Refresh and Later buttons. It checks shortly after opening, every five minutes and when you return to the tab.

Release notes for 1.2.32: The app fits every screen: phones from 320 px, tablets, laptops and large monitors. KPI tiles reflow to 6, 3 or 2 per row, dialogs and forms adjust to the width, the bottom action bar fits small phones, and landscape phones get a shorter header. Tested at 320, 360, 390, 768, 1024, 1366 and 1920 px with no sideways scrolling.

Release notes for 1.2.31: The loading screen stays up until the first page has its data (up to 60 seconds, previously 20). After 6 and 15 seconds it says the load is still going, so a slow connection no longer shows a half-loaded page.

Release notes for 1.2.30: Buttons spin only while a server call started from them is running. Buttons that just open a dialog, such as Check in, no longer show a loading spinner.

Release notes for 1.2.29: Connection handling: reads and saves time out instead of waiting forever; when the server cannot be reached, a banner appears, the app checks every 10 seconds and redraws the page when the connection returns, and the Diagnose button says whether the browser, the server or the database is failing. System administrators get a live connection dot in the header (connected, slow, database error, no server or offline), a Connection panel on the System admin page, and a server check that reads the database. The sidebar logo keeps spinning after the sidebar is toggled.

Release notes for 1.2.28: Fixed: the Save button on forms (Settings, Integrations and others) stayed disabled with a blank label after a successful save. It now returns to normal whether the save worked or not.

Release notes for 1.2.27: The hotel name shows in full in the header and wraps on phones. A new setting, Owner or designer, appears under the hotel name (it falls back to the app name when empty).

Release notes for 1.2.26: Buttons: fixed the spinner and the disappearing labels while a button is busy. Bottom action bar buttons now spin too.

Release notes for 1.2.25: Billing room screen has a bottom action bar: Post, Payment, Folio, Reservation, Check out and Options (guest history, move, extend, copy). The bar appears only on screens that set one.

Release notes for 1.2.24: Loading screen: the saved style and message now apply at sign-in and after saving in Settings; six new styles (Ring, Glow, Slide in, Wave dots, Spin 3D, Drop), all with the app logo. Header: removed the accent line beside the hotel name and the background behind the sidebar logo button.

Release notes for 1.2.23: Fixed: Reservation and Billing opened from the in-house list went to the dashboard (detail pages now check their own permission). The loading screen stayed up after login and the dashboard was empty on a fresh load (the first page now draws directly). Dashboard widgets load only for roles that can use them. The header search is hidden on phones. The sidebar follows the white theme. Login-only server functions now check permissions. Reservation change log entries are readable and show a count.

Release notes for 1.2.22: Redesigned buttons (one primary style, a quiet secondary, and clear success and danger colours) without the sweeping hover effect. Status badges such as In-House, Reserved, Dirty and Cancelled now have tinted backgrounds with a dot and read well in both themes. Inputs in toolbars and forms match the theme.

Release notes for 1.2.21: Dark theme by default with a white theme toggle in the header. Posting window: its own page for charges, payments and packages, with + New folio. Dashboard: 7-night revenue bar chart and quick action buttons. The business date is no longer in the header, and the hotel name has a styled sub line.

Release notes for 1.2.20: Arrivals, Departures and In-house guests appear only in the Front desk sub-header, not in the sidebar.

Release notes for 1.2.19: occasional "Network error" from Google's script runner is handled. Page loads retry automatically; saves are not repeated, and the message asks you to check whether the save went through. A dropped connection at start-up reloads the page instead of showing "Database not set up".

Release notes for 1.2.18: after a save or another completed action a success pop-up appears in the centre of the screen. It closes by itself or when clicked. Errors still show the red message.

Release notes for 1.2.17: on phones (700px and narrower) the header shows only the hotel name and search. The business date is still shown on the dashboard and front desk pages.

Release notes for 1.2.16: the system administrator arranges the sidebar in System admin → Menu layout: order the groups and pages, move pages between groups, rename groups, and reset to default. Pages not placed keep their default group.

Release notes for 1.2.15: the system administrator always has every permission, even before the Permissions sheet is updated (fixes "Permission denied: cfg.settings.view"). Run Stayline → Set up database once so Property Admin gets the new configuration rights.

Release notes for 1.2.14: every booking opens its reservation screen from the front desk board, the arrivals, departures and in-house lists, the billing room page and the search results. The reservation screen has Update reservation for reserved and in-house stays (an in-house stay keeps its arrival, room type and rate; use Extend stay and Move room for those), a Billing button, and the change log and copy functions.

Release notes for 1.2.13: run Stayline → Set up database once after updating (adds the new permission rows and settings).
Configuration permissions: the system administrator sets, per role, what each user can view, edit and delete for room types, rooms, rate plans, seasonal rates, charge codes, packages, payment methods, company accounts and hotel details. Property admins can change configuration but not hotel details by default.
Licence: the system administrator sets the licence start and expiry dates (System settings). The sidebar shows them with the days left. After the expiry (or before the start) only the system administrator can sign in.
Front desk: Front desk board, Arrivals, Departures and In-house guests are in the Front desk menu and in a sub-header on each page. Each list has its own filters and search (name, reservation, phone, room, group, company).
Loading screen stays until the first page has its data. Buttons spin while their action runs. Dates show as dd-mm-yyyy. The mobile menu closes from the menu button and outside clicks.

Release notes for 1.2.12: on small screens the menu closes when the menu button is pressed again, when the page outside the menu is clicked, or with Escape.

Release notes for 1.2.11: the header is laid out properly (hotel name, a styled search bar and the business date chip). Dates show as dd-mm-yyyy in tables, titles, the header and PDFs. Stored data and CSV files keep yyyy-mm-dd.

Release notes for 1.2.10: browser pop-ups are replaced by styled dialogs. Confirmations (for example deleting a role) show a confirm dialog with Cancel, Enter confirms and Escape cancels. Messages show as a styled notification with an icon.

Release notes for 1.2.9: email messages (welcome, reset code, password changed, app link) have their own System admin tab, "Email messages". The end-of-day report (Reports → End-of-day report) has sections: manager flash, trial balance, guest ledger, package ledger and city ledger aging. More sections can be added in EodReports.gs.

Release notes for 1.2.8: the sidebar account button is a full card (avatar, name, role, hover and focus states). The loading screen style is a system admin setting (System settings): random, classic, orbit, flip or pulse. 

Release notes for 1.2.7: the header shows the hotel name and the business date; the loading screen message is set in Hotel settings. Delete: system admin adds and deletes users; configuration items (room types, rooms, rate plans, rates, charge codes, packages, payment methods, company accounts) can be edited and deleted by whoever holds the matching permission. An item already used in a reservation or posting is deactivated instead, so its history stays intact.

Release notes for 1.2.6: the header avatar is gone; the whole account block at the bottom of the sidebar opens the menu. Administration is split into Property admin (hotel operations, staff users) and System admin (property admin accounts, roles, system settings), and a property admin cannot see, edit, deactivate, unlock or reset a system admin. Every change to a reservation, its folios and postings is logged with date, time, user and action, with field-level detail for modifications. Copy reservation creates a new booking with the same guest, room type, plan and details on new dates. Accounts receivable (AR) is a separate page: receipts from companies, statements, open items and aging. A folio can be routed to a company's city ledger when the company pays. Security: an account locks after wrong passwords (limit set by the system admin, minimum 5), admins can unlock and reset passwords (the user must change it at sign-in), and idle sessions sign out after a limit the system admin sets.

Release notes for 1.2.5: the updater checks GitHub every 5 minutes by itself and publishes only when there is a new commit (installed when the web app is first opened, or from Stayline → Turn on automatic updates). Fixed a script error in 1.2.4 that left a blank page after the loading screen. The loading screen shows the hotel logo. Settings lets you upload a logo (resized and stored in the sheet) or paste an https link, with a preview.

Release notes for 1.2.4: charges can be edited (amount and description, with a reason, tax recalculated), split into parts across room and PM folios (the parts must add up to the total), and moved to another folio with their tax. Payments are never edited, split or moved here. New permission folio.edit (Admin and Manager by default).

Release notes for 1.2.3: sidebar with the avatar at the bottom (a corner avatar on mobile), a spinning logo button, several loading screens (skeleton pages, a progress bar for every server call, four splash styles); System tab: default language (English or Arabic layout), default currency, auditor email and auto-send after night audit (night audit and AR reports), integration addresses for POS, television, telephone and card terminal with test buttons; packages posted per stay or per night; billing screen for every room (charges, packages, payments, refunds, moves, voids); search by room, guest, reservation number, group, company, phone and email; guest history button on each reservation; guest lists (in-house, arrivals, departures); payment methods (cash, card, bank, cheque, city ledger linked to a company account); refunds limited to the folio.refund permission; POS can post charges through the web app address.

Release notes for 1.2.2: each page has its own address (bookmarks, refresh and back/forward work); avatar menu with change password and sign out; Property Admin built-in role (hotel operations) separate from the system administrator (roles, email templates, app link); new users get a temporary password and a welcome email with the app link, and must change the password at first sign-in; night audit report and journal by charge code.

Release notes for 1.2.1: sidebar with a logo toggle (grouped menu, collapsible groups); buttons have a spin effect; admins create roles and set their permissions in Administration → Roles & permissions; folio, registration card and reports show the hotel logo and name; reset-code and password-changed emails are editable in Hotel settings, with a test send, and the code line is detectable by Gmail.

Release notes for 1.2.0: sign in with email or username; Forgot password (email code, then a new password); password rules with live check, show/hide toggles and a confirmation email; resetAdminPassword.

Release notes for 1.1.8: resetAdminPassword; a blank Settings value keeps the default name.

Release notes for 1.1.7: a push to GitHub updates the app directly through a GitHub webhook (no timer).

Release notes for 1.1.5: login page layout fix (version label no longer overlaps the card).

Release notes for 1.1.4: full code refresh (version shown on every page, Core and Index in step); no change to data.

Release notes for 1.1.3: pushes to GitHub go live automatically within about 5 minutes (no version bump needed for the update to run). Stayline → Turn on automatic updates sets this up.

Release notes for 1.1.0: company accounts (city ledger), cashier shifts with cash count, guest alerts, night-audit warnings, registration card, folio PDF, late-checkout fee, 14-day forecast, housekeeper assignment, loading screen with hover and entrance animations.

## What's in it

| Module | Pages | Highlights |
|---|---|---|
| Dashboard | Dashboard | In-house, arrivals, departures, occupancy, past-due arrivals, dirty rooms, daily flash, **14-night occupancy forecast** |
| Front desk | Front desk, Walk-in | Arrivals, in-house, departures, past-due; check-in with room and deposit (**guest alerts enforced**); check-out with balance check (company-billed folios excluded); move room; extend stay |
| Reservations | Reservations, Reservation detail, New reservation | Availability by room type; rate quote per night; plans (BAR, Corporate, Package); modify, cancel, no-show; per-night rate schedule; **print folio (PDF)**; **late checkout fee**; **bill a folio to a company** |
| Room rack | Room rack | 14–31 day grid, rooms × nights, out-of-order rooms shown |
| Guests | Guests, Guest profile | Duplicate-safe profiles (matched on email, phone, ID); VIP flag; **alert message with Info / Block level**; stay history; preferences |
| Groups | Groups, Group detail | Room blocks; group check-in; group charges to the master folio or each room; transfer to rooms |
| Housekeeping | Housekeeping | Clean / Dirty / Inspected / Pickup per room; **housekeeper assignment**; take rooms out of order |
| Cashier | Cashier | All open folios with balances; quick payment and charge; shift status banner |
| Cashier shifts | Cashier shifts | **Open shift with a cash float; close with a cash count; expected cash and variance**; shift history for managers |
| City ledger | City ledger, Company account | **Company accounts with credit limits**; charges billed to the company; payments against the account; statement of postings |
| Night audit | Night audit | **Warnings before close** (unpaid departures, open shifts, dirty rooms, past-due arrivals); posts room and tax charges, marks no-shows, closes the date, advances the business date |
| Rates & charges | Rates & charges | Rate plans, seasonal rates by room type, quote tool, charge codes |
| Reports | Reports | Flash, occupancy & ADR, arrivals, departures, in-house, revenue by code, posting ledger, cancellations, **city ledger, cashier shifts, housekeeping**; PDF and CSV |
| Administration | Admin | Users and roles, hotel settings, room types, rooms, permission list |
| Audit | Audit log | Every sign-in, denial, booking change, posting, void, transfer, audit, shift and account change |

## Key concepts

- **Business date.** The front desk works on the hotel's business date, not the wall clock. Night audit is the only thing that advances it. This matches how hotels actually run and keeps arrivals and departures correct across midnight.
- **Folios.** Each stay has folio 1 by default. You can add up to nine (guest, company, extras). Charges are positive, payments negative.
- **Automatic tax.** Taxable charge codes post a TAX line at the rate in Settings. Voiding or transferring a charge also moves its tax.
- **Transfers and voids keep history.** The original line is marked voided and a new line is posted on the target folio. Nothing is deleted.
- **Rate schedule per night.** Each night's rate is stored when the booking is made. Night audit posts what was quoted, even if rates change later.
- **Override is explicit.** Admins and managers can override a Dirty room, an open balance or a guest alert, but only on a single action where they tick the override box. A normal click cannot bypass the check.
- **Group master folio.** Group charges can post once to a master folio (not counted in revenue until transferred to a room), or to every in-house room.
- **Company accounts (city ledger).** A folio can be billed to a company account instead of the guest. Its charges count against the company's credit limit (0 = no limit). The guest can check out without paying that folio, and the company is invoiced through the City ledger page. Payments from a company are posted to its own ledger, so the guest's folio is never affected.
- **Guest alerts.** An alert with level *Info* shows a warning when the guest checks in. Level *Block* stops check-in until a manager ticks the override box. Alerts appear on the reservation, the guest profile and the check-in message.
- **Cashier shifts.** A cashier must open a shift before taking payments. On close, expected cash = opening float + cash payments taken (CASH code) during the shift. The difference is shown as the variance. Other roles take payments without a shift.
- **Late checkout.** The LCO charge code posts a late-checkout fee to the in-house guest's folio, with tax if the code is taxable.
- **Forecast.** The dashboard shows rooms sold and occupancy % for the next 14 nights, counting reserved and in-house stays against active rooms.
- **Folio PDF.** Each reservation can print a guest folio (all folios, postings and balances) as a PDF.

## Roles (default permission grid)

Roles are the columns of the Permissions tab. Administration → Roles & permissions lets an admin add a role (optionally copying another role), change its permissions and delete it when no user has it. The Admin role always keeps every permission, and nobody can remove their own access to user management.

Seven roles: **Admin, Manager, FrontDesk, Cashier, Housekeeping, Sales, Accountant**. Permissions are 31 TRUE/FALSE flags on the *Permissions* tab. The server checks them on every action, so a hidden button cannot be bypassed. Edit the grid to change what a role can do.

Example: FrontDesk checks guests in and out and posts charges. Only Manager and Admin can run night audit, void a posting or manage company accounts. Cashier opens a shift and takes payments. Accountant reads reports, the city ledger and the shift history but cannot post. Housekeeping updates room status only.

## Setup (about 15 minutes)

1. **Create the spreadsheet.** In Google Sheets, create a blank spreadsheet named "Stayline". This is the database.
2. **Open the script from the sheet.** Extensions → Apps Script. This project is attached to the sheet. Delete the default `Code.gs` contents.
3. **Add files.** Add the `.gs` files as script files: `Config`, `Core`, `Setup`, `Menu`, `Rooms`, `Rates`, `Guests`, `Reservations`, `FrontDesk`, `Folio`, `Groups`, `NightAudit`, `Reports`, `Advanced`. Add HTML files: `Index`, `Styles`, `App`. Paste each file's contents. Set the manifest (Project Settings → "Show appsscript.json") to the contents of `appsscript.json`. Save.
4. **(Optional) Set a script property** (Project Settings → Script properties): `ADMIN_PASSWORD`, at least 8 characters. Otherwise a random password is generated and shown once during setup.
5. **Reload the spreadsheet.** A **Stayline** menu appears in the menu bar. Choose **Stayline → Set up database** and approve the permissions. The message shows the first admin login (`admin` and the password, if generated). Keep it safe and change it after signing in.
6. **(Optional) Stayline → Load demo data** creates four sample reservations on the current business date.
7. **Deploy.** In the Apps Script editor: Deploy → New deployment → Web app. Execute as: **Me**. Who has access: **Anyone**. Open the URL and sign in as `admin`. **Stayline → Show web app link** shows the URL again later.
8. **Set up the hotel** under Administration: hotel name, logo, tax rate, currency, room types, rooms, rate plans and seasonal rates. Create staff accounts with the right roles. Change the admin password.

### Updating from GitHub

Stayline is kept in the GitHub repo `chowdhuryavy/Hotel_Pms`. Every push to `main` updates the app automatically: GitHub calls the web app through a webhook, the app loads the new files, makes a new version and moves the web app to it. No timer or button is needed. Pushes that change only README or other non-app files do nothing. Each update is logged in Apps Script (Executions).

One-time setup:
1. Create a fine-grained GitHub token with read-only **Contents** access to `Hotel_Pms`. Save it as `GITHUB_TOKEN` in Script properties.
2. Make up a long random text and save it as `WEBHOOK_KEY` in Script properties.
3. Turn on **Google Apps Script API** (script.google.com → Settings).
4. Deploy the web app once (Deploy → New deployment → Web app, Execute as **Me**, Who has access **Anyone**).
5. In GitHub: repo `Hotel_Pms` → Settings → Webhooks → **Add webhook**. Payload URL: your web app URL followed by `?key=` and the `WEBHOOK_KEY` text. Content type: **application/json**. Events: **Just the push event**. Save.

Stayline → **Update from GitHub** still works by hand at any time.

### Sign-in, forgot password and email

- **Sign in** with the username or the email address on the account.
- **Forgot password:** the user enters their email or username, gets a 6-digit code by email (valid 10 minutes, five tries), then sets a new password. A confirmation email follows.
- **Email is needed.** Set each user's email under Administration → Users. Stayline sends mail from the script owner's Google account. Google limits how many emails a day it sends (about 100 for a personal account, more for Workspace).
- **Password rules:** at least 8 characters, with an uppercase letter, a lowercase letter and a number.
- After updating, the owner must approve the new email permission once (run **updateFromGitHub** from the editor and approve it).

### Forgotten admin password

If sign-in as `admin` fails, add `ADMIN_PASSWORD` (8+ characters) in Script properties, select **resetAdminPassword** in the editor and press Run, then delete `ADMIN_PASSWORD`. Never type a hash into the Users tab: the app stores a salted hash that only it can create.

### Upgrading an existing database

Open the sheet and choose **Stayline → Set up database** again (after pasting the new files). It is safe to re-run: it creates missing tabs, adds new columns to the end of existing tabs (accounts, shifts, folio account, room assignment, guest alert), adds the four new permission rows (set to the defaults, which you can then edit) and adds the LCO charge code. It never deletes or overwrites data. Then run `checkDatabase()`; it should report *Database structure OK*.

Run `checkDatabase()` if you point the app at an older spreadsheet. It lists any tab or column that doesn't match.

## Testing

`tests/harness.js` runs the business flows against an in-memory mock of the Apps Script services. It covers: setup and the permission grid, login and wrong-password rejection, availability, rate quoting, booking, check-in, tax on a minibar charge, a blocked check-out with an open balance, settlement, check-out, room going Dirty, night audit (posts once and refuses a repeat for the same date), role denial, group blocks, group check-in with a dirty-room skip, cancellation, date modification, reports, and the upgrade migration (run twice). It also covers company accounts (billing, credit limit refusal, check-out with company-billed folio, settlement), guest alerts (Block refused, manager override with warning), cashier shifts (no payment without a shift, expected cash and zero variance on close, night-audit warning for an open shift, cashier denied account management), late checkout, folio PDF, the 14-day forecast, housekeeper assignment and the new reports.

```
node tests/harness.js
```

This checks the business logic, not the browser UI or Google's runtime. Do one pass in the live web app with each role before go-live, following the checklist below.

## Go-live checklist

1. Sign in as each role and confirm the menu and buttons match the permission grid.
2. Create a reservation, check it in with a deposit, post a charge, take a payment, check out.
3. Try check-out with an open balance (should be blocked), then with the override box ticked as a manager.
4. Add a guest alert set to *Block*, try to check that guest in (should be blocked), then override as a manager.
5. As a cashier: try a payment before opening a shift (should be blocked), open a shift, take a payment, close with the cash count.
6. Create a company account with a credit limit, bill a folio to it, check the limit is enforced, record a payment against the account.
7. Create a group block, check it in, post a group charge to the master folio, transfer it to one room.
8. Run night audit. Read the warnings first, then confirm the room charge appears and the business date moves on.
9. Export a revenue report as PDF and CSV, and print one guest folio.

## Limits to know about

- Built for one property. Google Sheets and Apps Script handle a few hundred bookings a day comfortably. For a multi-property group at scale, move the data layer to a proper database.
- No payment gateway, channel manager, key-card integration or e-invoicing. Those need separate connectors.
- Company credit limits are checked when a charge is posted. Charges that were already posted before a limit was lowered are not reversed.
- Cashier cash count counts only the CASH payment code. Card, bank and deposit payments are shown on the shift but not included in expected cash.
- Housekeeper assignment is one name per room (a dropdown of users with the Housekeeping role). It does not track task lists or time.
- Apps Script web apps can't serve a custom domain directly. Put a redirect or proxy in front of the deployed URL.
- Night audit is manual by design. Hotels usually run it themselves, so there's no automatic trigger.

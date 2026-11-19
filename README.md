# Stayline – Hotel management (front office to check-out)

A multi-page property management system built on Google Apps Script with Google Sheets as the database. It follows the Opera-style flow: reservations → rate and availability → room rack → arrival and check-in → folio charges and payments → transfers → check-out → night audit → reports. Company (city ledger) accounts, cashier shifts with cash reconciliation, guest alerts and housekeeping assignment are included.

## Version

Stayline **1.2.201**. The version is set in `APP_VERSION` in `Config.gs` and shows on the sign-in page and in the sidebar. Bump it on every release.

Release notes for 1.2.201: The GitHub updater keeps an update pending when a web app link could not be moved, so the next Update from GitHub tries again. Before, it reported "nothing to update" while the link still ran old code.

Release notes for 1.2.200: A page that cannot start now shows the reason on screen instead of a blank page: a script error, or no answer from the server after 25 seconds.

Release notes for 1.2.199: Sign-in and start-up are restored. The single-write change to `patch_` in 1.2.198 is reverted to the per-field write; the other 1.2.198 changes stay.

Release notes for 1.2.198: Performance. Saving a row reads and writes it once instead of once per field (reverted in 1.2.199). The dashboard widgets draw as each one's data arrives, so the board no longer waits for the flash report and night report. The start-up script is inline instead of base64 and eval, so the page loads without decoding. The 15-second change check no longer redraws a screen while a field in it is being typed in; it shows a notice instead.

Release notes for 1.2.197: The password fields on Change password and the forced password change show an eye icon to show or hide the password, like the sign-in page, instead of a Show text button.

Release notes for 1.2.196: A property admin can save a new staff user, with any role they hold. This was blocked by a rule from an early version that only let the system administrator add users.

Release notes for 1.2.195: Fewer sheet reads per request. Each table is read once per request and re-read only after a save, which cut reads by about 40–65% on the staff user form, front desk board and dashboard reports.

Release notes for 1.2.194: Anyone with staff-user access sees the + User button and can create users. Only the system administrator can delete a user.

Release notes for 1.2.193: Faster after each save. The page redraws at once, and the permission check runs alongside it instead of before it.

Release notes for 1.2.192: All loading indicators are removed: the start-up screen and the top bar. Real problems, such as a connection or database error, still show.

Release notes for 1.2.191: With the menu closed on desktop, the logo stays in the narrow sidebar and opens the menu; the name is hidden. The spinning loader on the domain page is removed.

Release notes for 1.2.190: Fewer loading messages. Searching, running reports and saving no longer show loading text inside the page.

Release notes for 1.2.189: No inline loading: no placeholder blocks, no Loading text in sections, and no spinners on buttons. The thin top bar is the only loading signal.

Release notes for 1.2.188: A loading message shows at once on the custom domain page while the app opens, and the connection to Google starts earlier.

Release notes for 1.2.187: Faster page load. The automatic update and backup timers are checked once per version, not on every page load.

Release notes for 1.2.186: Faster on every page. The bell's alert counts are worked out once per saved change and shared by all users, instead of reading all reservations and balances on each page load.

Release notes for 1.2.185: Faster loading. The system health check no longer re-checks every table on each visit, and each request opens each table once. A page that is loading shows only its skeleton, not the top bar as well.

Release notes for 1.2.184: One logo in the sidebar: the round menu button. The logo beside the hotel name is hidden.

Release notes for 1.2.183: Faster on every tab. The hotel settings are read once per request, not several times.

Release notes for 1.2.182: Faster on every tab. The database is opened once per request instead of once per sheet read.

Release notes for 1.2.181: The Staff user form loads in one request instead of three, so it opens faster.

Release notes for 1.2.180: The top loading bar only follows the page's own data. The background permission check no longer keeps it on when you change tabs.

Release notes for 1.2.179: A Property Admin now has Staff users and Permission roles in the sidebar. A Property Admin can create roles and staff users only with the permissions they hold; Admin and Property Admin roles and accounts are never shown to them. Only the system administrator deletes roles and changes system settings.

Release notes for 1.2.178: A Property Admin has all normal hotel operations and can create staff users and give them the configuration screens he holds. The configuration screens and staff-user access are still ticked by the system administrator.

Release notes for 1.2.177: While a password must be changed, nothing of the app shows behind the box.

Release notes for 1.2.176: The blur and the change-password box now show correctly (their styles were outside the style block).

Release notes for 1.2.175: A temporary password must be changed first. The app behind is blurred and only the change-password box works, with a Sign out option.

Release notes for 1.2.174: The update Refresh only reloads the current page. It never opens another address.

Release notes for 1.2.173: The update Refresh asks the page it is in to reload the app. Only if that page does not answer does it go to the Apps Script address. Redeploy the Vercel page with this version.

Release notes for 1.2.172: The update Refresh checks the top page's address, so on your own domain it no longer goes back to the Apps Script address.

Release notes for 1.2.171: The update Refresh on your own domain reloads the app inside the page, through the top page. The app no longer leaves the domain.

Release notes for 1.2.170: New System admin tab, Email log: every email with its time, recipient, subject, the service used (SMTP, Resend or the Google account), and whether it was sent or failed.

Release notes for 1.2.169: After an admin password reset, the message shows the address the temporary password was sent to and the service used (SMTP, Resend or the Google account). The same is recorded in the audit log.

Release notes for 1.2.168: On your own domain, the update Refresh button reloads the app inside the page instead of going to the Apps Script address.

Release notes for 1.2.167: A Property Admin sees only staff users, never the system administrator's accounts. The system administrator is decided by the role, so a grant cannot give a Property Admin that access.

Release notes for 1.2.166: Access changes by the system administrator apply straight away: the menu and screens are re-checked on each refresh and when you come back to the app. The user does not need to sign in again.

Release notes for 1.2.165: The Property admin screens ticks decide what a Property Admin can use again. Select all ticks every screen. Hotel details can be set per screen, as the system administrator chooses.

Release notes for 1.2.164: The Property admin screens ticks decide what a Property Admin can use again. Select all ticks every screen. Hotel details can be set per screen, as the system administrator chooses.

Release notes for 1.2.163: The dashboard loads its four parts together, so it appears sooner.

Release notes for 1.2.162: The tests now check the Property Admin access above (hotel details allowed; app link and menu layout still system-only).

Release notes for 1.2.161: A Property Admin has every hotel operation permission, but not the system settings. The Property Admin role grid in Property admin screens no longer limits it.

Release notes for 1.2.160: The system administrator can give any user extra configuration access (hotel settings, room types, rooms, packages, minibar, currencies, payment methods, staff users), on top of the role. The change applies the next time that user signs in.

Release notes for 1.2.159: The Vercel page's tab icon is a PNG, so phone browsers show it too.

Release notes for 1.2.158: The Vercel page's tab uses the same logo image as the sidebar. The drawn square is only the phone home-screen icon.

Release notes for 1.2.157: The Vercel page (your domain) uses the logo as its tab icon even when the browser will not let the page draw it.

Release notes for 1.2.156: When the logo in Settings is a web link (https), the Google page's browser tab shows it. An uploaded logo still shows on the app and on the Vercel page.

Release notes for 1.2.155: Removed the second width cap on wide screens, so the dashboard fills the window.

Release notes for 1.2.154: The main area fills the whole window width, with no empty strip on wide screens.

Release notes for 1.2.153: A gap separates the top-bar logo from the hotel name.

Release notes for 1.2.152: The Vercel page shows the logo from Settings as its tab and home-screen icon.

Release notes for 1.2.151: The sidebar logo sits a little lower and turns at the same slow speed whether the sidebar is open or closed, and on hover.

Release notes for 1.2.150: The Vercel page no longer shows the "Open in a new tab" button.

Release notes for 1.2.149: The browser tab icon and the home-screen icon use the logo from Settings, on desktop and phone browsers. The Vercel page has its own icon.

Release notes for 1.2.148: The logo turns once, more slowly, each time the sidebar opens or closes.

Release notes for 1.2.147: Saving a form shows one spinner on the button, not two.

Release notes for 1.2.146: A message at the bottom of the screen closes when tapped, so it cannot stay on screen.

Release notes for 1.2.145: Every email, including the cash-up to the auditor and guest receipts, goes through the Email settings (SMTP first, then Resend, then the Google account). Licence dates show under the version, and the licence box is hidden when no dates are set.

Release notes for 1.2.144: The settings tab for email is named "Email settings".

Release notes for 1.2.143: Every test email button opens a dialog to type the recipient address first. Nothing is sent until an address is entered.

Release notes for 1.2.142: The app page can be shown in the Vercel frame. Google had blocked the frame, which showed a blank page.

Release notes for 1.2.141: The Vercel page reads the app name from the Settings sheet (no name is typed into the page), and its "Open in a new tab" link opens the Vercel address. The name is served by the app as a small script (`?nameFor=`) that returns only the name.

Release notes for 1.2.140: Failed sign-ins are recorded in the audit log with the reason (wrong password, no matching user, inactive account, or locked). The password is never recorded.

Release notes for 1.2.139: While a button is working, its label stays visible, with the spinner on the left. Before, the label was hidden during the spin on every button, including Sign in.

Release notes for 1.2.138: Password hashes are stored with an "h1:" prefix, so the sheet can't turn a hash into a formula or change it. Accounts with older hashes still sign in, and a password change or reset writes the new format.

Release notes for 1.2.137: Added a Vercel page (public/index.html, configured by vercel.json) that shows the Stayline web app in a full-screen frame, with a link to open it in a new tab.

Release notes for 1.2.136: The test email now sits inside the SMTP form and the Resend form, and sends through that sender. Save the settings first, then test.

Release notes for 1.2.135: Email sending has two buttons, Set up SMTP and Set up Resend. Each opens its own form and saves only its own settings. The test email section stays on the same screen.

Release notes for 1.2.134: The Email sending screen has a "Send the test email to" field, so the test can go to any address. Leave it blank to use your own address.

Release notes for 1.2.133: The app name now comes from Settings everywhere it is shown, not a fixed word. The backup folder is named "<app name> backups". Backups already in the old "Stayline backups" folder stay there; new backups go to the new folder.

Release notes for 1.2.132: Sign-in and reset code emails now use the subject "Your Stayline security code: 123456", the same pattern as other services' code emails. A subject saved with the old wording is replaced automatically.

Release notes for 1.2.131: The sidebar menu no longer shows a scrollbar on desktop. The menu still scrolls with the mouse wheel, and rows are tighter on shorter screens so most laptops fit the whole menu.

Release notes for 1.2.130: Licence dates are read from the Settings sheet correctly, whether typed as yyyy-mm-dd, dd/mm/yyyy or a date cell. The sidebar licence box, including the days left, now refreshes at startup instead of showing the old values.

Release notes for 1.2.129: A password reset now also clears a lock and the wrong-password count, so the new password works on a locked account.

Release notes for 1.2.128: The spinner now shows on Send code, Verify code and Save new password in the Forgot password flow, while the request runs.

Release notes for 1.2.127: Resend added as a sending option in System admin → Email sending. The Resend API key is entered in the app and stored encrypted in the database, not in the code. Order: SMTP if on, else Resend if on, else the Google account.

Release notes for 1.2.126: Email sending can go through the hotel's own SMTP server. Set it up in System admin → Email sending (SMTP). Apps Script cannot connect to SMTP directly, so mail-relay/ holds a small Cloudflare Worker that sends it. When SMTP is off, mail goes out from the Google account as before.

Release notes for 1.2.125: Fixed the reset code never being sent. The request was passing the session token in place of the username or email, so the server found no account and sent nothing. The Forgot password and Resend code buttons now send the request correctly.

Release notes for 1.2.124: Verification code emails always carry the code in the subject, so Gmail offers its copy-code button, even for subjects saved earlier. If the email cannot be sent, the sign-in or reset screen now says so, and a new code can be requested right away.

Release notes for 1.2.123: Sign-in dialogs (Forgot password, enter code, new password) no longer stretch across the whole screen on desktop. The shared dialog width cap was being overridden.

Release notes for 1.2.122: The Forgot password button works again. Its dialog opens on the sign-in page instead of an in-app tab, which exists only while signed in.

Release notes for 1.2.121: No dialog opens while nobody is signed in. Signing out clears any dialog that appears just before or after it, so the sign-in page is not left under a blurred layer.

Release notes for 1.2.120: On a phone with the menu open, the sidebar's own logo is hidden, so only the spinning menu button shows.

Release notes for 1.2.119: On a phone, the menu button stays visible above the open menu, and keeps spinning as it does when the menu is closed.

Release notes for 1.2.118: Under the hotel name, the sidebar and header show "Designed by [app name]" instead of the app name or the owner name.

Release notes for 1.2.117: The browser tab keeps the Stayline app icon. The hotel logo is no longer used for the tab.

Release notes for 1.2.116: The desktop sign-in page has a richer look: a decorative ring and gradient title on the left, a card with a soft shadow, a larger sign-in button with a hover lift, and a glow behind the form. The phone layout is unchanged.

Release notes for 1.2.115: The browser tab shows the hotel logo when one is set in Hotel settings. Without a logo, the default icon stays.

Release notes for 1.2.114: Signing out clears every open dialog and form tab. The sign-in page no longer shows a blurred layer after sign-out until the screen is touched.

Release notes for 1.2.113: The sign-in page's bottom line shows the version number after the rights line.

Release notes for 1.2.112: The sign-in page shows "© year App name. All rights reserved." in place of the version line. The version still shows in the app sidebar.

Release notes for 1.2.111: The sign-in page shows "© year App name. All rights reserved." under the version.

Release notes for 1.2.110: The sign-in page shows the logo, app name and hotel name centred in the sign-in box. The left panel is simpler: its bullet list is removed and its text is centred.

Release notes for 1.2.109: Guest service requests can be assigned to an active staff member from the list, and unassigned again. The IP gate (ip-gate folder) is tested for allowed and blocked addresses; it still needs deploying to Cloudflare.

Release notes for 1.2.108: Three new functions. Multi-currency: foreign currencies with a rate to the hotel currency (Administration > Currencies). A payment can be taken in a foreign currency and is converted when posted; the original amount and rate are written on the posting. Guest service: a Guest service page for requests (housekeeping, maintenance, room service, amenities, transport, wake-up calls, concierge), with Open, In progress, Done and Cancelled. Minibar: items with a price and charge code (Administration > Minibar items), posted from the room's posting window (Minibar tab). After updating, run Set up database so the new tables and permissions are added.

Release notes for 1.2.107: Signing out with an open cashier shift asks the cashier to close it first (cash count and cashier report). The cashier can still sign out anyway.

Release notes for 1.2.106: System admin has a Sign-in security tab. Tick the roles that must enter a 6-digit code, emailed to them, after the password. Accounts in those roles need an email address. Signing in with a code is a second step; codes last 10 minutes and five wrong tries cancel them.

Release notes for 1.2.105: Faster start. A returning user on a known device goes straight into the app from the saved settings, and the server's settings refresh in the background. The sign-in screen shows at once on a known device. The loading screen holds for less time.

Release notes for 1.2.104: Each report action is now its own single button that acts on the selected report: Preview (opens the report in a dialog), Print, PDF, Excel and CSV.

Release notes for 1.2.103: One Download button (with a format choice) and one Print button act on the selected report, replacing the four buttons.

Release notes for 1.2.102: The night audit report page now has a serial number (#) column, a Choose reports to show setting (admin) that hides reports from the page, and a name search that hides tables with no match and shows the match count. Reports look more professional on screen, in print and in PDF (header with period, right-aligned numbers, bold totals). The night run now saves every report for the business date (NightReports tab). The night audit report page shows the time the night run generated it, and falls back to a live report when no night run was saved. One Download button (PDF, Excel or CSV, chosen beside it) and one Print button sit in the report header and act on the selected report.

Release notes for 1.2.101: Fixed the Change password prompt that came back on every load after the password had been changed. Changing the password now also clears the must-change flag in the signed-in session.

Release notes for 1.2.100: Fixed a stale click: after a Confirmation number click, the next navigation click could still open the Change password dialog. Navigation clicks now clear the pending action, and Change password always opens as a popup.

Release notes for 1.2.99: Every report has PDF, Print, Excel and CSV. Print prints the report on the page without opening a new window. Excel downloads a spreadsheet file that opens in Excel or LibreOffice; CSV is kept for other tools.

Release notes for 1.2.98: When a cashier closes the shift at the end of duty, a summary shows the expected cash, the counted cash and the variance, with a Print cashier report button for that shift.

Release notes for 1.2.97: When a delete is refused because the item has already been used, a pop-up explains it and says to make the item inactive instead.

Release notes for 1.2.96: Charge codes (transaction codes), rate plans, payment methods, packages and company (AR) accounts can be created, edited and deleted. Delete works only when the item has never been used; if it has been used, deleting is refused and the item is made inactive by unticking Active.

Release notes for 1.2.95: Night audit reports added for a full night audit, even where there is no data yet: revenue by department, taxable charges and tax, expected departures, past-due arrivals, rooms out of order, 7-day forecast, occupancy by room type, guest ledger and group ledger. Every report shows its columns when it has no rows.

Release notes for 1.2.94: Night audit report now shows every report as a button. New reports: in-house by nationality, group in-house, in-house by company, VIP guests in house, payments by method, check-ins, check-outs, rate variance (actual rate against the published rate for the same nights), complimentary and discounts (postings whose code or description says comp, discount, waiver or courtesy), folio ledger and room ledger.

Release notes for 1.2.93: The System admin area lists every Property admin function (Staff users, Hotel settings, Room types, Rooms, Packages, Payment methods) as well as its own, and Property admin screens assigns each function to the Property Admin with See / Change / Delete. A Property Admin sees only the functions given to the role, plus their own permissions. Security check of the server functions: permissions are checked on every write, and Property Admins cannot give, change, reset or unlock System Admin accounts.

Release notes for 1.2.92: New reservation links to the other profiles. Guest step has + New guest profile; Stay & rate has + New company profile, which returns to the reservation with the new company selected. Company is now a dropdown of company profiles (None = guest pays).

Release notes for 1.2.91: Adds the server part of Room history, which was left out of 1.2.90, so the page now loads its data.

Release notes for 1.2.90: New Room history page in the sidebar. It lists rooms that checked out, by checkout date (last 30 days by default), with filters for room number and guest, reservation, phone or company. In the posting window, clicking the confirmation number opens the password change dialog.

Release notes for 1.2.89: New reservation has a Room choice in Stay & rate. It lists only the rooms free for the chosen dates and room type, and a filter narrows the list by room number. Auto keeps the first free room.

Release notes for 1.2.88: Night audit in the sidebar shows two buttons. Night audit report opens every night audit report for a business date (the previous day by default), with a report picker and a search that filters the rows by name, room, reservation or any text. Night run opens the existing close-the-day page.

Release notes for 1.2.87: Fixed the blank Save button. While saving, the button keeps its label, shows Saving… and a spinner, and goes back to its normal label afterwards. Other buttons that show a spinner get it back too; their spinner had been hidden by a later style rule.

Release notes for 1.2.86: The room posting page shows the guest name, room, rate code, arrival, departure and confirmation number at the top. Post to folio opens the posting form as a popup that can be dragged by its header; posting closes it and refreshes the page. Folios and recent postings stay on the page.

Release notes for 1.2.85: When a room is selected, the posting window posts to that room only. The search and the room list are hidden, and a Back to billing link returns to the room.

Release notes for 1.2.84: The room billing Options menu has "Link to company / AR account". It bills the room's open folio to a company or city ledger account, or back to the guest. If the room has more than one open folio, you choose which one.

Release notes for 1.2.83: Billing shows the in-house and reserved rooms by default; All rooms is a button for the rest. The posting window lists the in-house and reserved rooms before any search, each with a Post button. The Billing status column is labelled Status.

Release notes for 1.2.82: The posting window has a "Find a guest or stay" search. Search by guest name, reservation number, room number, phone, e-mail, company or group, then choose Post to open that room.

Release notes for 1.2.81: Property admin screens now lists every configuration function: Hotel settings, Room types, Rooms, Rate plans, Seasonal rates, Charge codes, Packages, Payment methods, Company accounts and Fixed charges. Each has See, Change and Delete limits that System admin sets once; the Property Admin gets exactly those.

Release notes for 1.2.80: New System admin tab, "Property admin screens". It lists each screen in the Property admin area (Staff users, Hotel settings, Room types, Rooms, Packages, Payment methods, Fixed charges) with See, Change and Delete checkboxes, and saves them to the Property Admin role. Other permissions of that role are kept.

Release notes for 1.2.79: Fixed charges moved from the sidebar into the Rooms section of Property admin, as a card that opens Manage fixed charges in its own tab. End of day is now its own menu item, "End-of-day report", and is no longer in the Reports dropdown with Journal and the other reports. Dialog boxes can be dragged by their header or body, and the popup can be dragged by its header; buttons and fields still work. A page tab reloads its data on refresh.

Release notes for 1.2.78: While a form saves, its button shows a spinner with Saving… in place of the label, instead of going blank. The label comes back when the save finishes.

Release notes for 1.2.77: Fixed the sidebar showing System admin while the dashboard stayed on screen. A page that was still loading when you chose another page no longer draws over the newer one.

Release notes for 1.2.76: The Update reservation form has Accompanying guests (list, add with title, age and ID, and remove), and for in-house guests an Add package button that posts to the open folio. Accompanying guests are stored in a new Accompany tab, which is created automatically.

Release notes for 1.2.75: Each form tab has its own area. Switching tabs only shows or hides them, so a form that finishes loading after you switch still appears in its own tab, not in the one you are on. A form tab you have already opened keeps what you typed when you switch back.

Release notes for 1.2.74: The header shows "Design by <name>" under the hotel name, using the Designer or owner setting in Hotel settings. Leave it blank to show the app name instead.

Release notes for 1.2.73: A table tab missing from the sheet (for example RoomCharges) is created with its headers the first time any page needs it, once the database is set up. The Missing sheet error no longer appears for tabs added by an update. No rows are changed.

Release notes for 1.2.72: A tab added in an update (for example FixedRules) is now created automatically, so the Database error no longer appears after an update. The connection panel in System admin shows a status card, a handshake bar, and tiles for the app server, database, version and server time, each with an icon.

Release notes for 1.2.71: Fixed a form tab showing the dashboard underneath: a page that finished loading after the tab opened no longer draws over it. A form tab fills the whole content area. Closing it returns to the page you were on.

Release notes for 1.2.70: Admin sections opened from the tab bar (Hotel settings, System settings and so on) show only their own form in their tab, without the Property admin heading and tab bar. A form that fails to load shows the error in its tab instead of a blank tab.

Release notes for 1.2.69: Form actions open as tabs inside this page, with a tab strip above the content and a close button on each tab. No new browser tabs are opened. Navigating to another page leaves the form tabs. System admin has an App version section: it lists the released versions and can run an older one. A downgrade pins the app to that version, so automatic updates and the GitHub push hook wait until System admin chooses Return to latest version. The sheet data is not changed.

Release notes for 1.2.68: The loading screen no longer waits for the page data. As soon as the page layout is drawn (page title and placeholder blocks), the loading screen closes, and the data fills in as it arrives.

Release notes for 1.2.67: Every form action opens in its own new tab at its own address (#/f with the action in the address), showing the same form as a full page. Blank new tabs came from action calls with no arguments being rejected. The action is now checked as a plain page function call, and errors show on the page instead of a blank tab.

Release notes for 1.2.66: Fixed the admin tabs opened in a new tab showing a blank page or jumping to Staff users: drawing a page no longer closes the tab, and the tab action waits for the page to finish drawing. The connection check is cached for two minutes, retried once, and no longer blocks the System admin page. The background probe waits up to 25 seconds and shows a connection warning only after two misses in a row, so a slow cold start of the server no longer shows an error.

Release notes for 1.2.65: Every button that opens a form now opens it in its own new tab as a full page, across the front desk, reservations, folios, cashier, housekeeping, rates, groups and admin. The same button action runs in the new tab. Every admin tab (Staff users, Hotel settings, Room types and so on) opens in its own tab, with a ↗ mark. Buttons that save do not open a second tab. Tabs of the tab bar navigate inside the tab that is open.

Release notes for 1.2.64: In Property admin and System admin, the Hotel settings, System settings, Email messages and Menu layout tabs open in their own new tab (marked with ↗) as full pages, instead of showing the form below the tab bar. Inside the new tab the tabs navigate as usual.

Release notes for 1.2.63: Admin functions (users, rates, settings and so on) open as full pages in their own tab instead of a small dialog. The system settings have a licence number field, shown in the sidebar licence box. Each closed cashier shift has a Cash-up PDF (in Cashier shifts history) and, when auditor auto-send is on, is emailed to the auditor. Guests get a reservation confirmation email and a check-out receipt with the folio PDF attached (sent only when the guest has an email address). A Room attendant page gives large tiles for room status on a tablet. A nightly database copy is saved to the Stayline backups folder in Drive at 02:00 (newest 30 kept); Back up now is in the spreadsheet menu. The login page has a brand mark and an eye button to show or hide the password, and on phones it shows only the sign-in form. Drive access is a new permission: the admin must approve it once.

Release notes for 1.2.62: Connection dialogs can always be closed. Each dialog has a × button, and only one dialog is on screen at a time, so repeated Diagnose clicks no longer stack dialogs. A Diagnose run cannot start twice.

Release notes for 1.2.61: On the Configuration and Admin pages, every add or edit button (users, property admins, room types, rooms, roles, permissions, payment methods, packages, rate plans, rates, charge codes) opens its form in a new browser tab instead of a popup. The new tab signs in through a one-time link that expires after 90 seconds and is removed from the address once used. Allow pop-ups for the app if the tab does not open.

Release notes for 1.2.60: The version number at the bottom of the sidebar is larger and sits a little higher, off the bottom edge.

Release notes for 1.2.59: A changed App name (or hotel name, logo and details) in the Settings sheet now shows at once on the next visit. The browser was restoring the name saved in the earlier session over the fresh values from the server; the fresh values now win. Nothing in the app is hard-coded to Stayline, apart from the default value written when the sheet is first set up.

Release notes for 1.2.58: New report "AR aging history" lists the city-ledger aging saved by each night audit, by business date and company, with totals. It is in the Reports page and can be exported to PDF or CSV.

Release notes for 1.2.57: The night-audit checklist has a live progress bar with a percentage and the step just completed. After a successful audit the app moves to the new business date at once: the session is saved, the page behind the checklist refreshes and the dashboard shows the new date.

Release notes for 1.2.56: The night-audit checklist ticks each step as it completes and stays open until you press Done. The tick list no longer stops if the server sends no fixed-charge or AR-aging figures, and the business date moves on at once after a successful run.

Release notes for 1.2.55: All printed documents share one professional layout, with the hotel logo, name, address, phone, email and hotel app URL at the top and the app link in the footer. Documents: guest folio, registration card, company (AR) folio, AR statement with ageing, payment receipt and paid-out receipt (refunds). Print buttons are on the folio payment rows and the AR statement page. Settings → Hotel now has Phone, Email and Hotel app URL, which print on every document. Connection messages no longer mention Google.

Release notes for 1.2.54: The database tabs in the Google Sheet are grouped by area (reservations and guests, rooms and rates, charges and payments, night audit and reports, administration, logs) in that order, each group with its own tab colour. Tab names are unchanged. Setup places them automatically; Stayline → Organise tabs does it again at any time.

Release notes for 1.2.53: Fixed charges (Front office → Fixed charges, permission fixed.manage, Managers and Admin by default). Each rule has a charge code, amount, repeat (daily, weekly or monthly), a from date and an optional until date. A guest-stay rule posts to the guest folio on the night run while the guest is in the hotel, with tax if the charge is taxable. A room rule posts to the room ledger on the night run whatever the room status, including out-of-order and out-of-service rooms. Room rates are posted automatically on the night run as before. The night-audit checklist shows fixed charges as a step. The daily flash adds a Revenue by period table: today, month to date, year to date, last year in full, and last year to date. Printed and emailed reports show every section.

Release notes for 1.2.52: Charges, payments, reservation creation, check-in and settings saves now use a request id, so a retry after a dropped connection cannot post or save twice. Reservation date, room type or rate changes are refused for any night the night audit has already closed; room-number changes are still allowed. Stay extensions are checked the same way. The dashboard loads in one server call instead of several. The password-reset code screen has a Paste code button that reads the 6 digits from the clipboard.

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

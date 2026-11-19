/**
 * Stayline – Menu.gs
 * Adds a "Stayline" menu to the Google Sheet. Stayline is installed by opening the Apps Script
 * project from the sheet (Extensions → Apps Script), so the menu appears in the sheet's ribbon.
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu(menuName_())
    .addItem('Set up database', 'menuSetup')
    .addItem('Check database', 'menuCheck')
    .addItem('Organise tabs', 'menuTabs')
    .addItem('Back up now', 'menuBackup')
    .addItem('Load demo data', 'menuDemo')
    .addSeparator()
    .addItem('Update from GitHub', 'menuUpdate')
    .addItem('Turn on automatic updates', 'menuAutoOn')
    .addItem('Show web app link', 'menuLink')
    .addToUi();
}

/** Menu title comes from the App name in Settings (falls back to a neutral label if the database is not ready). */
function menuName_() {
  try { return appName_() || 'Hotel PMS'; } catch (e) { return 'Hotel PMS'; }
}

function menuSetup() {
  const ui = SpreadsheetApp.getUi();
  try {
    ui.alert(menuName_(), setupDatabase(), ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Setup failed: ' + e.message);
  }
}

function menuCheck() {
  const ui = SpreadsheetApp.getUi();
  try {
    const problems = checkDatabase();
    ui.alert('Database check', problems.length ? problems.join('\n') : 'Database structure OK', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Check failed: ' + e.message);
  }
}

function menuDemo() {
  const ui = SpreadsheetApp.getUi();
  try {
    seedDemoData();
    ui.alert('Demo reservations were created for the current business date.');
  } catch (e) {
    ui.alert('Demo data: ' + e.message);
  }
}

function menuUpdate() {
  const ui = SpreadsheetApp.getUi();
  try {
    ui.alert(menuName_() + ' update', updateFromGitHub(), ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Update failed: ' + e.message);
  }
}

function menuLink() {
  const ui = SpreadsheetApp.getUi();
  let url = '';
  try { url = ScriptApp.getService().getUrl(); } catch (e) { /* not deployed */ }
  ui.alert(url
    ? 'Web app link:\n' + url
    : 'Not deployed yet. In the Apps Script editor: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone). Then use this menu again.');
}

function menuAutoOn() {
  const ui = SpreadsheetApp.getUi();
  try { ui.alert(menuName_() + ' update', enableAutoUpdate(), ui.ButtonSet.OK); }
  catch (e) { ui.alert('Could not turn on automatic updates: ' + e.message); }
}

function menuTabs() {
  const ui = SpreadsheetApp.getUi();
  try { const n = organiseTabs_(); ui.alert('Tabs organised: ' + n + ' database tabs grouped by area and coloured.'); }
  catch (e) { ui.alert('Could not organise tabs: ' + e.message); }
}

function menuBackup() {
  const ui = SpreadsheetApp.getUi();
  try { const name = nightlyBackup_(); ui.alert('Backup saved: ' + name + ' (in the ' + backupFolderName_() + ' folder in Drive).'); }
  catch (e) { ui.alert('Backup failed: ' + e.message); }
}

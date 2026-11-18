/**
 * Stayline – Menu.gs
 * Adds a "Stayline" menu to the Google Sheet. Stayline is installed by opening the Apps Script
 * project from the sheet (Extensions → Apps Script), so the menu appears in the sheet's ribbon.
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Stayline')
    .addItem('Set up database', 'menuSetup')
    .addItem('Check database', 'menuCheck')
    .addItem('Load demo data', 'menuDemo')
    .addSeparator()
    .addItem('Update from GitHub', 'menuUpdate')
    .addItem('Show web app link', 'menuLink')
    .addToUi();
}

function menuSetup() {
  const ui = SpreadsheetApp.getUi();
  try {
    ui.alert('Stayline', setupDatabase(), ui.ButtonSet.OK);
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
    ui.alert('Stayline update', updateFromGitHub(), ui.ButtonSet.OK);
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

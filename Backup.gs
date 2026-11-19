/* Stayline – Backup.gs
 * Nightly copy of the database spreadsheet into the "Stayline backups" folder in Drive.
 * The newest 30 copies are kept; older ones go to the Drive bin.
 */
const BACKUP_HANDLER = 'nightlyBackup_';
const BACKUP_KEEP = 30;
function backupFolder_() {
  const it = DriveApp.getFoldersByName('Stayline backups');
  return it.hasNext() ? it.next() : DriveApp.createFolder('Stayline backups');
}
/** Copies the database now and trims old copies. Returns the new copy's name. */
function nightlyBackup_() {
  const ss = ss_();
  const folder = backupFolder_();
  const name = (ss.getName() || 'Stayline') + ' backup ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH-mm');
  DriveApp.getFileById(ss.getId()).makeCopy(name, folder);
  const files = [];
  const it = folder.getFiles();
  while (it.hasNext()) files.push(it.next());
  files.sort((a, b) => b.getDateCreated() - a.getDateCreated()).slice(BACKUP_KEEP).forEach(f => f.setTrashed(true));
  return name;
}
/** Daily trigger at 02:00 (Qatar time). Created once; kept if it already exists. */
function ensureBackupTrigger_() {
  if (ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === BACKUP_HANDLER)) return false;
  ScriptApp.newTrigger(BACKUP_HANDLER).timeBased().everyDays(1).atHour(2).create();
  return true;
}
/** System administrator: back up now from the web app. */
function backupNow(token) {
  const s = auth_(token, 'system.manage');
  const name = nightlyBackup_();
  audit_(s.username, 'BACKUP', 'Spreadsheet', '', name);
  return { name: name };
}

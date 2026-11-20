/**
 * Stayline – Setup.gs
 * Run setupDatabase() ONCE from the Apps Script editor. Safe to re-run: it only creates
 * missing tabs/headers and seeds empty tables. It never deletes or overwrites data.
 *
 * Script properties (Project Settings → Script properties), optional:
 *   SHEET_ID       – use an existing spreadsheet instead of creating one
 *   ADMIN_PASSWORD – first admin password (min 8 chars); otherwise a random one is logged
 */
function setupDatabase() {
  const props = PropertiesService.getScriptProperties();
  // When the project is opened from the sheet (Extensions → Apps Script), that sheet is the database.
  const bound = SpreadsheetApp.getActiveSpreadsheet();
  const existing = props.getProperty('SHEET_ID') || (bound ? bound.getId() : '');
  const created = !existing;
  const ss = existing ? SpreadsheetApp.openById(existing) : SpreadsheetApp.create('Stayline Database');
  props.setProperty('SHEET_ID', ss.getId());
  SS_MEMO_ = null;
  SETTINGS_MEMO_ = null;
  SHEET_MEMO_ = {};
  ROWS_MEMO_ = {};
  // Setup writes some tables directly (not through the write watcher), so clear every shared copy first
  Object.keys(TBL).forEach(k => uncacheTbl_(TBL[k][0]));
  ss.setSpreadsheetTimeZone(TZ);

  // 1) Tabs and headers
  Object.keys(TBL).forEach(k => {
    const t = TBL[k];
    const s = ss.getSheetByName(t[0]) || ss.insertSheet(t[0]);
    if (s.getLastRow() === 0) s.getRange(1, 1, 1, t[1].length).setValues([t[1]]);
    s.getRange(1, 1, 1, t[1].length).setFontWeight('bold').setBackground('#0f3d3e').setFontColor('#ffffff');
    s.setFrozenRows(1);
  });
  if (created) { const d = ss.getSheetByName('Sheet1'); if (d && ss.getSheets().length > 1) ss.deleteSheet(d); }

  // 1b) Upgrade an existing database: add new columns, permissions and charge codes (never removes data)
  migrateSchema_();

  // 2) Permission matrix (editable TRUE/FALSE grid)
  const perms = ss.getSheetByName(TBL.PERMS[0]);
  if (perms.getLastRow() === 1) {
    perms.getRange(2, 1, PERMISSIONS.length, PERMISSIONS[0].length).setValues(PERMISSIONS);
    perms.getRange(2, 3, PERMISSIONS.length, ROLES.length).insertCheckboxes();
  }

  ensureBuiltinRoles_();   // after the matrix is seeded, so Property Admin gets its defaults

  // 3) Settings
  const st = ss.getSheetByName(TBL.SETTINGS[0]);
  if (st.getLastRow() === 1) {
    const defaults = Object.assign({}, SETTINGS_DEFAULT, { businessDate: calToday_() });
    const keys = Object.keys(defaults);
    st.getRange(2, 1, keys.length, 2).setValues(keys.map(k => [k, defaults[k]]));
  }

  // 4) Charge codes, rate plans, room types and sample rooms
  seedIfEmpty_(TBL.CHARGES, CHARGE_CODES_DEFAULT.map(c => [c[0], c[1], c[2], c[3], c[4], true]));
  seedIfEmpty_(TBL.RATEPLANS, RATE_PLANS_DEFAULT.map(p => [p[0], p[1], p[2], true]));
  seedIfEmpty_(TBL.ROOMTYPES, ROOM_TYPES_DEFAULT.map(r => [r[0], r[1], r[2], r[3], true, r[4]]));
  seedIfEmpty_(TBL.ROOMS, buildSampleRooms_());

  // 5) First admin
  let firstAdminNote = '';
  if (rows_(TBL.USERS).length === 0) {
    let pw = props.getProperty('ADMIN_PASSWORD');
    let generated = '';
    if (!pw || pw.length < 8) { pw = Utilities.getUuid().replace(/-/g, '').slice(0, 12); generated = pw; }
    const salt = Utilities.getUuid();
    append_(TBL.USERS, { id: id_('U'), username: 'admin', name: 'Administrator', role: 'Admin', salt: salt, passHash: storeHash_(salt, pw), active: true, lastLogin: '', createdAt: fmtTs_(new Date()) });
    if (generated) {
      Logger.log('First admin: username "admin", password "' + generated + '". Change it after first sign-in.');
      firstAdminNote = '\n\nFirst admin: username admin, password ' + generated + '\n(Change it after your first sign-in.)';
    }
  }

  try { organiseTabs_(); } catch (e) { Logger.log('Tab order: ' + e.message); }
  Object.keys(TBL).forEach(k => uncacheTbl_(TBL[k][0]));   // direct sheet writes above: drop shared copies
  const msg = (appName_() || 'Hotel PMS') + ' database ready.\nSheet: ' + ss.getUrl() + firstAdminNote;
  Logger.log(msg);
  return msg;
}

function seedIfEmpty_(t, rows) {
  const s = sh_(t);
  if (s.getLastRow() === 1 && rows.length) s.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

/**
 * Adds to an existing database what a newer Stayline version needs: missing columns (appended at
 * the end of a tab), missing permission rows and missing default charge codes. Existing data is untouched.
 */
function migrateSchema_() {
  const ss = ss_();
  Object.keys(TBL).forEach(k => {
    const t = TBL[k];
    const s = ss.getSheetByName(t[0]);
    if (!s) return;
    const width = Math.max(s.getLastColumn(), 1);
    const h = s.getRange(1, 1, 1, width).getValues()[0].map(x => String(x));
    t[1].forEach(name => {
      if (h.indexOf(name) >= 0) return;
      const col = h.length + 1;
      s.getRange(1, col, 1, 1).setValue(name).setFontWeight('bold').setBackground('#0f3d3e').setFontColor('#ffffff');
      h.push(name);
    });
  });

  const perms = ss.getSheetByName(TBL.PERMS[0]);
  if (perms && perms.getLastRow() > 1) {
    const have = new Set(perms.getRange(2, 1, perms.getLastRow() - 1, 1).getValues().map(r => String(r[0])));
    const missing = PERMISSIONS.filter(p => !have.has(p[0]));
    if (missing.length) {
      const start = perms.getLastRow() + 1;
      perms.getRange(start, 1, missing.length, PERMISSIONS[0].length).setValues(missing);
      perms.getRange(start, 3, missing.length, ROLES.length).insertCheckboxes();
    }
  }

  const codes = ss.getSheetByName(TBL.CHARGES[0]);
  if (codes && codes.getLastRow() > 1) {
    const have = new Set(codes.getRange(2, 1, codes.getLastRow() - 1, 1).getValues().map(r => String(r[0])));
    const missing = CHARGE_CODES_DEFAULT.filter(c => !have.has(c[0])).map(c => [c[0], c[1], c[2], c[3], c[4], true]);
    if (missing.length) codes.getRange(codes.getLastRow() + 1, 1, missing.length, 6).setValues(missing);
  }
  ensureBuiltinRoles_();
  Object.keys(TBL).forEach(k => uncacheTbl_(TBL[k][0]));   // direct sheet writes above: drop shared copies
}

function buildSampleRooms_() {
  const out = [];
  for (let n = 101; n <= 110; n++) out.push([String(n), 'STD', 1, 'Active', 'Clean', '', '', true, '', '']);
  for (let n = 201; n <= 205; n++) out.push([String(n), 'DLX', 2, 'Active', 'Clean', '', '', true, '', '']);
  for (let n = 301; n <= 303; n++) out.push([String(n), 'STE', 3, 'Active', 'Clean', '', '', true, '', '']);
  return out;
}

/** Optional demo data for testing. Run from the editor only (not callable from the web app). */
function seedDemoData() {
  const names = [['Aisha', 'Al-Thani', 'Qatar'], ['James', 'Miller', 'United Kingdom'], ['Yuki', 'Tanaka', 'Japan'], ['Omar', 'Hassan', 'Egypt']];
  const bd = bizDate_();
  const plans = ['BAR', 'CORP', 'BAR'];
  names.forEach((n, i) => {
    const arrival = addDays_(bd, i - 1 < 0 ? 0 : i - 1);
    try {
      createRes_({ firstName: n[0], lastName: n[1], nationality: n[2], email: n[0].toLowerCase() + '@example.com',
        phone: '+974 5550 00' + i, roomType: i === 3 ? 'STE' : 'DLX', arrival: arrival, departure: addDays_(arrival, 2 + i),
        adults: 2, plan: plans[i], channel: 'Direct' }, 'seed');
    } catch (e) { Logger.log('Demo skipped: ' + e.message); }
  });
  Logger.log('Demo reservations created for business date ' + bd);
}

/** Lists tabs or headers that differ from what Stayline expects (use when re-pointing to an old sheet). */
function checkDatabase() {
  const problems = [];
  Object.keys(TBL).forEach(k => {
    const t = TBL[k];
    const s = ss_().getSheetByName(t[0]);
    if (!s) { problems.push('Missing tab: ' + t[0]); return; }
    const h = s.getRange(1, 1, 1, t[1].length).getValues()[0];
    t[1].forEach((name, i) => { if (h[i] !== name) problems.push(t[0] + ' column ' + (i + 1) + ' should be "' + name + '"'); });
  });
  Logger.log(problems.length ? problems.join('\n') : 'Database structure OK');
  return problems;
}

/* Sheet tabs: grouped by area, in order, each group with its own colour. Tab names are unchanged. */
const TAB_GROUPS = [
  ['Reservations & guests', '#2b6cb0', ['RES', 'GUESTS', 'GROUPS', 'RATESCHED']],
  ['Rooms & rates', '#2e7d6b', ['ROOMS', 'ROOMTYPES', 'RATEPLANS', 'RATES']],
  ['Charges, folios & payments', '#b7791f', ['FOLIOS', 'POSTINGS', 'CHARGES', 'PAYMETHODS', 'PACKAGES', 'FIXEDRULES', 'ROOMCHG', 'ACCOUNTS', 'SHIFTS']],
  ['Night audit & reports', '#7b3fa0', ['BIZDATES', 'ARAGING']],
  ['Administration', '#5b6b7a', ['SETTINGS', 'USERS', 'PERMS']],
  ['Logs', '#8a8a8a', ['AUDIT', 'RESLOG']]
];
/** Orders the database tabs by TAB_GROUPS and colours each group. Returns how many tabs were placed. */
function organiseTabs_() {
  const ss = ss_();
  let pos = 0;
  TAB_GROUPS.forEach(g => {
    g[2].forEach(k => {
      const sh = ss.getSheetByName(TBL[k][0]);
      if (!sh) return;
      sh.setTabColor(g[1]);
      ss.setActiveSheet(sh);
      ss.moveActiveSheet(++pos);
    });
  });
  return pos;
}

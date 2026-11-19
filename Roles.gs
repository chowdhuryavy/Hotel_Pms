/* ============================ ROLES ============================
 * Roles are the columns of the Permissions tab (after permission and description).
 * System administrators (Admin role, system.manage) manage roles, email templates and the app link.
 * Property admins (Property Admin role) run the hotel: users, hotel settings, rooms and rates.
 */
const ADMIN_ROLE = 'Admin';                       // system administrator, every permission
const PROPERTY_ROLE = 'Property Admin';           // property administrator, built in
const BUILTIN_ROLES = [ADMIN_ROLE, PROPERTY_ROLE];
// Permissions a Property Admin gets on top of what a Manager has
const PROPERTY_EXTRA = ['users.manage', 'settings.manage', 'rooms.manage', 'rates.manage'].concat(cfgPermRows_().map(r => r[0]).filter(p => p !== 'cfg.settings.edit'));

/** Role names, read from the Permissions tab header. */
function roleNames_() {
  const s = sh_(TBL.PERMS);
  const h = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(x => String(x));
  return h.slice(2).filter(x => x);
}
function roleColumn_(name) {
  const i = roleNames_().indexOf(name);
  return i < 0 ? -1 : i + 3;                       // sheet column (1-based) of this role
}

/** Role names for the user form (property admins can pick roles, but cannot manage them). */
function roleOptions(token) {
  auth_(token, 'users.manage');
  return roleNames_();
}
function listRoles(token) {
  auth_(token, 'system.manage');
  const users = rows_(TBL.USERS), perms = rows_(TBL.PERMS);
  return roleNames_().map(n => ({
    name: n,
    users: users.filter(u => u.role === n).length,
    permissions: perms.filter(p => p[n] === true).length,
    total: perms.length,
    builtIn: BUILTIN_ROLES.indexOf(n) >= 0
  }));
}
function getRolePerms(token, role) {
  auth_(token, 'system.manage');
  if (roleColumn_(role) < 0) throw new Error('Unknown role.');
  return {
    role: role,
    perms: rows_(TBL.PERMS).map(p => ({ permission: p.permission, description: p.description, allowed: role === ADMIN_ROLE || p[role] === true }))
  };
}
function myPermissions(token) {
  const s = auth_(token);
  return permMap_(s);
}
function saveRolePerms(token, role, allowed) {
  const s = auth_(token, 'system.manage');
  const col = roleColumn_(role);
  if (col < 0) throw new Error('Unknown role.');
  const want = new Set(Array.isArray(allowed) ? allowed : []);
  if (role === ADMIN_ROLE) rows_(TBL.PERMS).forEach(p => want.add(p.permission));
  if (role === s.role && (!want.has('system.manage') || !want.has('users.manage'))) {
    throw new Error('You cannot remove system or user permissions from your own role.');
  }
  return withLock_(() => {
    const sh = sh_(TBL.PERMS);
    let n = 0;
    rows_(TBL.PERMS).forEach(p => {
      const on = want.has(p.permission);
      if (on) n++;
      sh.getRange(p._row, col).setValue(on);
    });
    audit_(s.username, 'ROLE_PERMISSIONS_SAVED', 'Role', role, n + ' permissions');
    return { ok: true, count: n };
  });
}

/** Adds a role column. Copies another role's permissions when copyFrom is given. No auth: callers check. */
function createRoleRaw_(name, copyFrom) {
  name = String(name || '').trim().replace(/\s+/g, ' ');
  if (!/^[A-Za-z][A-Za-z0-9 _-]{1,29}$/.test(name)) {
    throw new Error('Role name: 2 to 30 characters, letters, numbers, spaces, - or _, starting with a letter.');
  }
  const names = roleNames_();
  if (names.some(n => n.toLowerCase() === name.toLowerCase())) throw new Error('That role already exists.');
  const from = copyFrom && names.indexOf(copyFrom) >= 0 ? copyFrom : '';
  const sh = sh_(TBL.PERMS);
  const col = Math.max(sh.getLastColumn(), 2) + 1;
  sh.getRange(1, col).setValue(name).setFontWeight('bold').setBackground('#0f3d3e').setFontColor('#ffffff');
  const last = Math.max(sh.getLastRow(), 2);
  sh.getRange(2, col, last - 1, 1).insertCheckboxes();
  rows_(TBL.PERMS).forEach(p => sh.getRange(p._row, col).setValue(from ? p[from] === true : false));
  return name;
}
function createRole(token, name, copyFrom) {
  const s = auth_(token, 'system.manage');
  return withLock_(() => {
    const made = createRoleRaw_(name, copyFrom);
    audit_(s.username, 'ROLE_CREATED', 'Role', made, copyFrom ? 'copied from ' + copyFrom : 'no permissions');
    return { name: made };
  });
}
function deleteRole(token, name) {
  const s = auth_(token, 'system.manage');
  if (BUILTIN_ROLES.indexOf(name) >= 0) throw new Error('This built-in role cannot be deleted.');
  if (rows_(TBL.USERS).some(u => u.role === name)) throw new Error('Move the users of this role to another role first.');
  return withLock_(() => {
    const col = roleColumn_(name);
    if (col < 0) throw new Error('Unknown role.');
    sh_(TBL.PERMS).deleteColumn(col);
    audit_(s.username, 'ROLE_DELETED', 'Role', name, '');
    return { ok: true };
  });
}

/** Runs on every set up and migration: Admin keeps every permission, and Property Admin exists with its defaults
 *  (applied when the role is created, or when it has no permissions yet, for example on a brand-new database). */
function ensureBuiltinRoles_() {
  const sh = sh_(TBL.PERMS);
  const adminCol = roleColumn_(ADMIN_ROLE);
  if (adminCol > 0) rows_(TBL.PERMS).forEach(p => sh.getRange(p._row, adminCol).setValue(true));
  const created = roleColumn_(PROPERTY_ROLE) < 0;
  if (created) createRoleRaw_(PROPERTY_ROLE, 'Manager');
  const c = roleColumn_(PROPERTY_ROLE);
  // Blank Property Admin cells (permissions added by a migration) get the defaults. Cells the system administrator
  // has set are kept, so changes made in Roles & permissions stay.
  rows_(TBL.PERMS).forEach(p => {
    const cell = p[PROPERTY_ROLE];
    if (!created && cell !== '' && cell !== undefined && cell !== null) return;
    sh.getRange(p._row, c).setValue(p.permission !== 'system.manage' && (PROPERTY_EXTRA.indexOf(p.permission) >= 0 || p.Manager === true));
  });
}

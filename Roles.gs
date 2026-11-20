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

/* Roles a signed-in user may see: the system administrator sees all; everyone else never sees Admin or Property Admin */
function roleVisible_(name, s) { return s.role === ADMIN_ROLE || BUILTIN_ROLES.indexOf(name) < 0; }
/* True when every permission of the role is one the signed-in user holds */
function roleWithin_(name, s) {
  const mine = permMap_(s);
  return rows_(TBL.PERMS).every(p => p[name] !== true || mine[p.permission] === true);
}
/** Role names for the user form: a property admin only gets roles whose permissions they all hold. */
function roleOptions(token) {
  const s = auth_(token, 'users.manage');
  return roleNames_().filter(n => roleVisible_(n, s) && (s.role === ADMIN_ROLE || roleWithin_(n, s)));
}
/** Everything the Staff user form needs, in one request: users, role choices and extra access options. */
function getUserFormData(token) {
  auth_(token, 'users.manage');
  return { users: listUsers(token), roles: roleOptions(token), extra: extraPermOptions(token) };
}
function listRoles(token) {
  const s = auth_(token, 'users.manage');
  const users = rows_(TBL.USERS), perms = rows_(TBL.PERMS);
  return roleNames_().filter(n => roleVisible_(n, s)).map(n => ({
    name: n,
    users: users.filter(u => u.role === n).length,
    permissions: perms.filter(p => p[n] === true).length,
    total: perms.length,
    builtIn: BUILTIN_ROLES.indexOf(n) >= 0
  }));
}
function getRolePerms(token, role) {
  const s = auth_(token, 'users.manage');
  if (roleColumn_(role) < 0 || !roleVisible_(role, s)) throw new Error('Unknown role.');
  const mine = permMap_(s);
  return {
    role: role,
    perms: rows_(TBL.PERMS).map(p => ({
      permission: p.permission, description: p.description,
      allowed: role === ADMIN_ROLE || p[role] === true,
      editable: s.role === ADMIN_ROLE || (mine[p.permission] === true && p.permission !== 'system.manage')
    }))
  };
}
/* The signed-in user's permissions, read live: the role from the grid, and the user's extra access and role from the Users sheet */
function myPermissions(token) {
  const s = auth_(token);
  const u = rows_(TBL.USERS).find(x => x.id === s.id);
  if (u) {
    const extra = userExtra_(u);
    if (JSON.stringify(extra) !== JSON.stringify(s.extra || []) || u.role !== s.role) {
      const cache = CacheService.getScriptCache();
      const raw = cache.get('s:' + token);
      if (raw) cache.put('s:' + token, JSON.stringify(Object.assign(JSON.parse(raw), { extra: extra, role: u.role })), SESSION_SECONDS);
      s.extra = extra; s.role = u.role;
    }
  }
  return permMap_(s);
}
function saveRolePerms(token, role, allowed) {
  const s = auth_(token, 'users.manage');
  const isSys = s.role === ADMIN_ROLE;
  if (!isSys && (role === ADMIN_ROLE || !roleVisible_(role, s))) throw new Error('Only a system administrator can change this role.');
  const col = roleColumn_(role);
  if (col < 0) throw new Error('Unknown role.');
  const want = new Set(Array.isArray(allowed) ? allowed : []);
  if (role === ADMIN_ROLE) rows_(TBL.PERMS).forEach(p => want.add(p.permission));
  if (role === s.role && (!want.has('system.manage') || !want.has('users.manage'))) {
    throw new Error('You cannot remove system or user permissions from your own role.');
  }
  const mine = permMap_(s);
  // A property admin changes only the permissions they hold themselves; the rest of the role stays as it is
  const editable = p => isSys || (mine[p.permission] === true && p.permission !== 'system.manage');
  return withLock_(() => {
    const sh = sh_(TBL.PERMS);
    const perms = rows_(TBL.PERMS);
    let n = 0;
    if (perms.length) {
      // One read of the role's column, the changed cells are set in memory, then one write
      const first = Math.min.apply(null, perms.map(p => p._row));
      const last = Math.max.apply(null, perms.map(p => p._row));
      const block = sh.getRange(first, col, last - first + 1, 1).getValues();
      const before = block.map(r => r[0]);
      perms.forEach(p => {
        const i = p._row - first;
        if (!editable(p)) { if (block[i][0] === true) n++; return; }
        const on = want.has(p.permission);
        if (on) n++;
        block[i][0] = on;
      });
      // Write only the rows that changed, in runs of adjacent rows (unchanged cells are not touched)
      let i = 0;
      while (i < block.length) {
        if (block[i][0] === before[i]) { i++; continue; }
        let j = i;
        while (j + 1 < block.length && block[j + 1][0] !== before[j + 1]) j++;
        sh.getRange(first + i, col, j - i + 1, 1).setValues(block.slice(i, j + 1));
        i = j + 1;
      }
    }
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
  const s = auth_(token, 'users.manage');
  const isSys = s.role === ADMIN_ROLE;
  if (!isSys && copyFrom && !roleVisible_(copyFrom, s)) throw new Error('Unknown role.');
  return withLock_(() => {
    if (isSys) {
      const made = createRoleRaw_(name, copyFrom);
      audit_(s.username, 'ROLE_CREATED', 'Role', made, copyFrom ? 'copied from ' + copyFrom : 'no permissions');
      return { name: made };
    }
    // A property admin's new role gets only the permissions they hold (copied ones they hold)
    const made = createRoleRaw_(name, '');
    if (copyFrom) {
      const mine = permMap_(s), col = roleColumn_(made), sh = sh_(TBL.PERMS);
      rows_(TBL.PERMS).forEach(p => {
        const on = p[copyFrom] === true && mine[p.permission] === true && p.permission !== 'system.manage';
        if (on) sh.getRange(p._row, col).setValue(true);
      });
    }
    audit_(s.username, 'ROLE_CREATED', 'Role', made, copyFrom ? 'copied from ' + copyFrom + ' (permissions held)' : 'no permissions');
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

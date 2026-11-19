/* ============================ ROLES ============================
 * Roles are the columns of the Permissions tab (after permission and description).
 * An admin can add a role, copy another role's permissions into it, change its permissions and
 * delete it when no user has it. The Admin role always keeps every permission.
 */
const ADMIN_ROLE = 'Admin';

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

function listRoles(token) {
  auth_(token, 'users.manage');
  const users = rows_(TBL.USERS), perms = rows_(TBL.PERMS);
  return roleNames_().map(n => ({
    name: n,
    users: users.filter(u => u.role === n).length,
    permissions: perms.filter(p => p[n] === true).length,
    total: perms.length,
    builtIn: n === ADMIN_ROLE
  }));
}

function getRolePerms(token, role) {
  auth_(token, 'users.manage');
  if (roleColumn_(role) < 0) throw new Error('Unknown role.');
  return {
    role: role,
    perms: rows_(TBL.PERMS).map(p => ({ permission: p.permission, description: p.description, allowed: role === ADMIN_ROLE || p[role] === true }))
  };
}

function myPermissions(token) {
  const s = auth_(token);
  return permMap_(s.role);
}

function saveRolePerms(token, role, allowed) {
  const s = auth_(token, 'users.manage');
  const col = roleColumn_(role);
  if (col < 0) throw new Error('Unknown role.');
  const want = new Set(Array.isArray(allowed) ? allowed : []);
  if (role === ADMIN_ROLE) rows_(TBL.PERMS).forEach(p => want.add(p.permission));
  if (role === s.role && !want.has('users.manage')) throw new Error('You cannot remove "users.manage" from your own role.');
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

function createRole(token, name, copyFrom) {
  const s = auth_(token, 'users.manage');
  name = String(name || '').trim().replace(/\s+/g, ' ');
  if (!/^[A-Za-z][A-Za-z0-9 _-]{1,29}$/.test(name)) throw new Error('Role name: 2 to 30 characters, letters, numbers, spaces, - or _, starting with a letter.');
  return withLock_(() => {
    const names = roleNames_();
    if (names.some(n => n.toLowerCase() === name.toLowerCase())) throw new Error('That role already exists.');
    const sh = sh_(TBL.PERMS);
    const col = Math.max(sh.getLastColumn(), 2) + 1;
    sh.getRange(1, col).setValue(name).setFontWeight('bold').setBackground('#0f3d3e').setFontColor('#ffffff');
    const rows = rows_(TBL.PERMS);
    const from = copyFrom && names.indexOf(copyFrom) >= 0 ? copyFrom : '';
    rows.forEach(p => {
      sh.getRange(p._row, col).setValue(from ? p[from] === true : false);
    });
    const last = Math.max(sh.getLastRow(), 2);
    sh.getRange(2, col, last - 1, 1).insertCheckboxes();
    rows.forEach(p => sh.getRange(p._row, col).setValue(from ? p[from] === true : false));
    audit_(s.username, 'ROLE_CREATED', 'Role', name, from ? 'copied from ' + from : 'no permissions');
    return { name: name };
  });
}

function deleteRole(token, name) {
  const s = auth_(token, 'users.manage');
  if (name === ADMIN_ROLE) throw new Error('The Admin role cannot be deleted.');
  if (rows_(TBL.USERS).some(u => u.role === name)) throw new Error('Move the users of this role to another role first.');
  return withLock_(() => {
    const col = roleColumn_(name);
    if (col < 0) throw new Error('Unknown role.');
    sh_(TBL.PERMS).deleteColumn(col);
    audit_(s.username, 'ROLE_DELETED', 'Role', name, '');
    return { ok: true };
  });
}

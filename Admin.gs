/* ============================================================
 * Admin.gs: deleting configuration and users.
 * Editing and deleting configuration follows the configuration permissions (cfg.<area>.edit / delete),
 * which the system administrator sets per role. Adding and deleting users is for the system administrator only.
 * An item that has already been used keeps its history, so it is deactivated instead of deleted.
 * ============================================================ */

/** What each kind of configuration item is, and the rule for deleting it. */
function configKind_(kind) {
  const kinds = {
    roomType:      { tbl: TBL.ROOMTYPES, key: 'code', perm: 'cfg.roomtypes.delete', label: 'Room type',
                     inUse: k => rows_(TBL.ROOMS).some(r => r.type === k) || rows_(TBL.RES).some(r => r.roomType === k) },
    room:          { tbl: TBL.ROOMS, key: 'roomNo', perm: 'cfg.rooms.delete', label: 'Room',
                     inUse: k => rows_(TBL.RES).some(r => String(r.roomNo) === String(k)) },
    ratePlan:      { tbl: TBL.RATEPLANS, key: 'code', perm: 'cfg.rateplans.delete', label: 'Rate plan',
                     inUse: k => rows_(TBL.RES).some(r => r.plan === k) },
    rate:          { tbl: TBL.RATES, key: 'id', perm: 'cfg.rates.delete', label: 'Rate', inUse: () => false },
    chargeCode:    { tbl: TBL.CHARGES, key: 'code', perm: 'cfg.chargecodes.delete', label: 'Charge code',
                     inUse: k => rows_(TBL.POSTINGS).some(p => p.code === k) || rows_(TBL.PAYMETHODS).some(m => m.chargeCode === k) },
    package:       { tbl: TBL.PACKAGES, key: 'code', perm: 'cfg.packages.delete', label: 'Package', inUse: () => false },
    paymentMethod: { tbl: TBL.PAYMETHODS, key: 'code', perm: 'cfg.payments.delete', label: 'Payment method', inUse: () => false },
    account:       { tbl: TBL.ACCOUNTS, key: 'id', perm: 'cfg.accounts.delete', label: 'Company account',
                     inUse: k => rows_(TBL.FOLIOS).some(f => f.accountId === k) }
  };
  return kinds[kind] || null;
}

/** Deletes a configuration item, or deactivates it when it has already been used. */
function deleteConfig(token, kind, key) {
  const k = configKind_(kind);
  if (!k) throw new Error('Unknown item.');
  const s = auth_(token, k.perm);
  return withLock_(() => {
    const row = rows_(k.tbl).find(x => String(x[k.key]) === String(key));
    if (!row) throw new Error(k.label + ' not found.');
    if (k.inUse(String(key))) {
      patch_(k.tbl, row._row, { active: false });
      audit_(s.username, 'CONFIG_DEACTIVATED', 'Config', kind + ':' + key, k.label + ' is in use, so it was deactivated');
      return { deactivated: true };
    }
    sh_(k.tbl).deleteRow(row._row);
    audit_(s.username, 'CONFIG_DELETED', 'Config', kind + ':' + key, k.label);
    return { deleted: true };
  });
}

/** Deletes a user account. Past actions stay in the audit log. System administrator only. */
function deleteUser(token, id) {
  const s = auth_(token, 'system.manage');
  return withLock_(() => {
    const u = rows_(TBL.USERS).find(x => x.id === id);
    if (!u) throw new Error('User not found.');
    if (u.id === s.id) throw new Error('You cannot delete your own account.');
    if (u.role === ADMIN_ROLE && rows_(TBL.USERS).filter(x => x.role === ADMIN_ROLE && x.active === true).length <= 1) {
      throw new Error('At least one active system administrator must remain.');
    }
    sh_(TBL.USERS).deleteRow(u._row);
    audit_(s.username, 'USER_DELETED', 'User', id, u.username + ' ' + u.role);
    return true;
  });
}

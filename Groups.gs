/**
 * Stayline – Groups.gs
 * Group blocks: N rooms of one type for one period, linked by a group id, with a group
 * master folio. Group charges can post to the master folio (then transfer to rooms) or to
 * every in-house room of the group.
 */
function postWithTax_(resNo, roomNo, folioId, code, desc, amt, user, bd) {
  const parent = postEntry_(resNo, roomNo, folioId, code, desc, amt, user, bd, '');
  const c = rows_(TBL.CHARGES).find(x => x.code === code);
  if (c && c.taxable === true && settings_().taxRate > 0) {
    postEntry_(resNo, roomNo, folioId, 'TAX', 'Tax on ' + code, amt * settings_().taxRate, user, bd, parent);
  }
  return parent;
}

function createGroup(token, d) {
  const s = auth_(token, 'groups.manage');
  auth_(token, 'reservations.create');
  validRange_(d.arrival, d.departure);
  const count = Math.floor(Number(d.roomCount));
  if (!(count > 0)) throw new Error('Number of rooms must be at least 1.');
  if (!String(d.name || '').trim()) throw new Error('Group name is required.');
  return withLock_(() => {
    const rt = roomType_(d.roomType);
    const free = freeRooms_(d.arrival, d.departure, rt.code, null);
    if (free.length < count) throw new Error('Only ' + free.length + ' ' + rt.name + ' room(s) free; ' + count + ' requested.');
    const gid = id_('GRP');
    const masterRes = 'GRP:' + gid;
    const now = fmtTs_(new Date());
    append_(TBL.GROUPS, { id: gid, name: d.name.trim(), contact: d.contact || '', arrival: d.arrival, departure: d.departure, roomType: rt.code,
      roomCount: count, masterResNo: masterRes, status: 'Block', notes: d.notes || '', createdAt: now, createdBy: s.username });
    append_(TBL.FOLIOS, { id: id_('FO'), resNo: masterRes, folioNo: 1, name: 'Group master', status: 'Open', createdAt: now, closedAt: '' });
    const guestId = upsertGuest_({ firstName: d.name.trim(), lastName: 'Group', phone: '', email: '', company: d.name.trim() });
    const rooms = free.slice(0, count).map(room => createRes_({
      guestId: guestId, roomType: rt.code, roomNo: String(room.roomNo), arrival: d.arrival, departure: d.departure,
      plan: d.plan || 'CORP', adults: d.adultsPerRoom || 2, rateOverride: d.rate || 0, groupId: gid, channel: 'Group', company: d.name.trim(), notes: d.notes || ''
    }, s.username).resNo);
    audit_(s.username, 'GROUP_CREATED', 'Group', gid, d.name + ' x' + count + ' ' + d.arrival + ' > ' + d.departure);
    return { groupId: gid, reservations: rooms };
  });
}

function listGroups(token) {
  auth_(token, 'reservations.view');
  const res = rows_(TBL.RES).filter(r => r.groupId);
  return rows_(TBL.GROUPS).map(g => {
    const m = res.filter(r => r.groupId === g.id);
    return { id: g.id, name: g.name, contact: g.contact, arrival: g.arrival, departure: g.departure, roomType: g.roomType,
      rooms: m.length, inHouse: m.filter(r => r.status === 'In-House').length, departed: m.filter(r => r.status === 'Departed').length };
  }).reverse();
}

function getGroup(token, gid) {
  const s = auth_(token, 'reservations.view');
  const perms = permMap_(s);
  const g = rows_(TBL.GROUPS).find(x => x.id === gid);
  if (!g) throw new Error('Group not found.');
  const folios = rows_(TBL.FOLIOS).filter(f => f.status === 'Open');
  const members = rows_(TBL.RES).filter(r => r.groupId === gid)
    .map(r => {
      const f = folios.filter(x => x.resNo === r.resNo).sort((a, b) => Number(a.folioNo) - Number(b.folioNo))[0];
      return { resNo: r.resNo, status: r.status, roomNo: String(r.roomNo), roomType: r.roomType, arrival: r.arrival, departure: r.departure,
        guestName: r.guestName, folioId: f ? f.id : '' };
    });
  const out = { group: g, members: members };
  if (perms['folio.view']) {
    const ps = rows_(TBL.POSTINGS).filter(p => p.resNo === g.masterResNo).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    out.master = { postings: ps, balance: num_(ps.filter(p => p.voided !== true).reduce((a, p) => a + Number(p.amount), 0)),
      folioId: (rows_(TBL.FOLIOS).find(f => f.resNo === g.masterResNo) || {}).id || '' };
  }
  return out;
}

function groupCheckIn(token, gid) {
  const s = auth_(token, 'frontdesk.checkin');
  const canOverride = false;   // group check-in never overrides a dirty room; check those rooms individually
  return withLock_(() => {
    const list = rows_(TBL.RES).filter(r => r.groupId === gid && r.status === 'Reserved');
    if (!list.length) throw new Error('No reservations to check in for this group.');
    const done = [], skipped = [];
    list.forEach(r => {
      try { checkIn_(r.resNo, null, 0, null, s.username, canOverride); done.push(r.resNo); }
      catch (e) { skipped.push(r.resNo + ' (Room ' + r.roomNo + '): ' + e.message); }
    });
    return { done: done.length, skipped: skipped };
  });
}

/** Group charge: target MASTER posts once to the master folio; EACH posts to every in-house room. */
function postGroupCharge(token, gid, code, description, amount, target) {
  const s = auth_(token, 'folio.post');
  if (permMap_(s)['groups.manage'] !== true) throw new Error('Permission denied: groups.manage');
  const amt = num_(amount);
  if (!(amt > 0)) throw new Error('Amount must be greater than zero.');
  return withLock_(() => {
    const g = rows_(TBL.GROUPS).find(x => x.id === gid);
    if (!g) throw new Error('Group not found.');
    chargeCode_(code, CHARGE_TYPE);
    const bd = bizDate_();
    const desc = description || code;
    if (target === 'EACH') {
      const inH = rows_(TBL.RES).filter(r => r.groupId === gid && r.status === 'In-House');
      if (!inH.length) throw new Error('No in-house rooms in this group.');
      inH.forEach(r => postWithTax_(r.resNo, r.roomNo, folio1_(r.resNo), code, desc, amt, s.username, bd));
      audit_(s.username, 'GROUP_CHARGE', 'Group', gid, code + ' ' + amt + ' x' + inH.length);
      return { posted: inH.length, total: num_(amt * inH.length) };
    }
    const mf = rows_(TBL.FOLIOS).find(f => f.resNo === g.masterResNo && f.status === 'Open');
    if (!mf) throw new Error('Group master folio is closed or missing.');
    postWithTax_(g.masterResNo, '', mf.id, code, desc, amt, s.username, bd);
    audit_(s.username, 'GROUP_CHARGE', 'Group', gid, code + ' ' + amt + ' master');
    return { posted: 1, total: amt };
  });
}

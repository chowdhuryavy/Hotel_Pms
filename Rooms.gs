/**
 * Stayline – Rooms.gs
 * Room types, rooms, out-of-order / out-of-service control, housekeeping board.
 */
const HK_STATUSES = ['Clean', 'Dirty', 'Inspected', 'Pickup'];
const ROOM_STATUSES = ['Active', 'Out of Order', 'Out of Service'];

function roomsAll_() { return rows_(TBL.ROOMS).filter(r => r.active === true); }
function roomType_(code) {
  const t = rows_(TBL.ROOMTYPES).find(x => x.code === code && x.active === true);
  if (!t) throw new Error('Unknown or inactive room type: ' + code);
  return t;
}
function findRoom_(roomNo) {
  const r = rows_(TBL.ROOMS).find(x => String(x.roomNo) === String(roomNo) && x.active === true);
  if (!r) throw new Error('Room not found: ' + roomNo);
  return r;
}

function listRoomTypes(token) {
  auth_(token, 'rooms.view');
  return rows_(TBL.ROOMTYPES).map(t => ({ code: t.code, name: t.name, baseRate: Number(t.baseRate) || 0, maxAdults: Number(t.maxAdults) || 1, active: t.active === true, description: t.description || '' }));
}
function saveRoomType(token, d) {
  const s = auth_(token, 'rooms.manage');
  const code = String(d.code || '').trim().toUpperCase();
  if (!code || !d.name) throw new Error('Code and name are required.');
  return withLock_(() => {
    const ex = rows_(TBL.ROOMTYPES).find(x => x.code === code);
    const data = { code: code, name: d.name, baseRate: num_(d.baseRate), maxAdults: Number(d.maxAdults) || 1, active: d.active !== false && d.active !== 'false', description: d.description || '' };
    if (ex) patch_(TBL.ROOMTYPES, ex._row, data); else append_(TBL.ROOMTYPES, data);
    audit_(s.username, ex ? 'ROOMTYPE_UPDATED' : 'ROOMTYPE_CREATED', 'RoomType', code, data.baseRate);
    return code;
  });
}
function listRooms(token) {
  auth_(token, 'rooms.view');
  return roomsAll_().map(r => ({ roomNo: String(r.roomNo), type: r.type, floor: r.floor, status: r.status, housekeeping: r.housekeeping, statusReason: r.statusReason || '', notes: r.notes || '', assignedTo: r.assignedTo || '' }));
}
function saveRoom(token, d) {
  const s = auth_(token, 'rooms.manage');
  const no = String(d.roomNo || '').trim();
  if (!no) throw new Error('Room number is required.');
  roomType_(d.type);
  return withLock_(() => {
    const ex = rows_(TBL.ROOMS).find(r => String(r.roomNo) === no);
    const data = { roomNo: no, type: d.type, floor: d.floor || '', status: ex ? ex.status : 'Active', housekeeping: ex ? ex.housekeeping : 'Clean', statusReason: ex ? ex.statusReason : '', notes: d.notes || '', active: true, hkUpdatedAt: fmtD_(new Date()), assignedTo: ex ? (ex.assignedTo || '') : '' };
    if (ex) patch_(TBL.ROOMS, ex._row, data); else append_(TBL.ROOMS, data);
    audit_(s.username, ex ? 'ROOM_UPDATED' : 'ROOM_CREATED', 'Room', no, d.type);
    return true;
  });
}
/** Sets Active / Out of Order / Out of Service. Rooms that are not Active are never sold. */
function setRoomStatus(token, roomNo, status, reason) {
  const s = auth_(token, 'rooms.manage');
  if (ROOM_STATUSES.indexOf(status) < 0) throw new Error('Invalid room status.');
  if (status !== 'Active' && !String(reason || '').trim()) throw new Error('A reason is required to take a room out of order.');
  return withLock_(() => {
    const r = findRoom_(roomNo);
    if (status !== 'Active') {
      const clash = rows_(TBL.RES).filter(x => String(x.roomNo) === String(roomNo) && x.status === 'In-House');
      if (clash.length) throw new Error('Room ' + roomNo + ' is occupied by ' + clash[0].resNo + '. Move the guest first.');
    }
    patch_(TBL.ROOMS, r._row, { status: status, statusReason: status === 'Active' ? '' : reason });
    audit_(s.username, 'ROOM_STATUS', 'Room', roomNo, status + ' ' + (reason || ''));
    return true;
  });
}
function setHousekeeping(token, roomNo, status) {
  const s = auth_(token, 'housekeeping.update');
  if (HK_STATUSES.indexOf(status) < 0) throw new Error('Invalid housekeeping status.');
  return withLock_(() => {
    const r = findRoom_(roomNo);
    patch_(TBL.ROOMS, r._row, { housekeeping: status, hkUpdatedAt: fmtD_(new Date()) });
    audit_(s.username, 'HOUSEKEEPING', 'Room', roomNo, r.housekeeping + ' > ' + status);
    return true;
  });
}
/** Housekeeping board: every room with its guest and today's movements. */
function housekeepingBoard(token) {
  auth_(token, 'rooms.view');
  const bd = bizDate_();
  const res = rows_(TBL.RES);
  return roomsAll_().map(r => {
    const inH = res.find(x => String(x.roomNo) === String(r.roomNo) && x.status === 'In-House');
    const arr = res.find(x => String(x.roomNo) === String(r.roomNo) && x.status === 'Reserved' && x.arrival === bd);
    const dep = res.find(x => String(x.roomNo) === String(r.roomNo) && x.status === 'In-House' && x.departure === bd);
    return {
      roomNo: String(r.roomNo), type: r.type, status: r.status, housekeeping: r.housekeeping, statusReason: r.statusReason || '',
      guest: inH ? inH.guestName : '', departing: !!dep, arrivingToday: arr ? arr.guestName : '', assignedTo: r.assignedTo || ''
    };
  }).sort((a, b) => a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true }));
}

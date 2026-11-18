/**
 * Stayline – FrontDesk.gs
 * Check-in, check-out, walk-in, room move, stay extension and the daily front-desk board.
 * All "today" logic uses the hotel's BUSINESS DATE (set by night audit), not the wall clock.
 */
function anyPerm_(s, list) {
  const p = permMap_(s.role);
  return list.some(k => p[k] === true);
}

function frontDeskBoard(token) {
  const s = auth_(token);
  if (!anyPerm_(s, ['frontdesk.checkin', 'frontdesk.checkout'])) throw new Error('Permission denied: frontdesk');
  const bd = bizDate_();
  const bal = balances_();
  const res = rows_(TBL.RES);
  const pack = r => ({ resNo: r.resNo, status: r.status, guestName: r.guestName, vip: r.vip === true, roomNo: String(r.roomNo),
    roomType: r.roomType, arrival: r.arrival, departure: r.departure, groupId: r.groupId, balance: num_(bal[r.resNo] || 0) });
  const roomsById = {};
  roomsAll_().forEach(r => { roomsById[String(r.roomNo)] = r; });
  return {
    bizDate: bd,
    arrivals: res.filter(r => r.status === 'Reserved' && r.arrival === bd).map(pack),
    pastDue: res.filter(r => r.status === 'Reserved' && r.arrival < bd).map(pack),
    departures: res.filter(r => r.status === 'In-House' && r.departure === bd).map(pack),
    inHouse: res.filter(r => r.status === 'In-House').map(pack),
    departed: res.filter(r => r.status === 'Departed' && String(r.checkedOutAt).slice(0, 10) === bd).map(pack),
    dirtyRooms: Object.keys(roomsById).filter(k => roomsById[k].housekeeping === 'Dirty').length,
    rooms: roomsAll_().length
  };
}

/** Core check-in. Callers verify permissions and hold the lock. */
function checkIn_(resNo, roomNo, deposit, depositCode, user, canOverride) {
  const r = findRes_(resNo);
  const bd = bizDate_();
  if (r.status !== 'Reserved') throw new Error(resNo + ' is ' + r.status + ', cannot check in.');
  if (r.arrival > bd) throw new Error('Arrival is ' + r.arrival + '. Change the business date or the dates first.');
  const targetNo = String(roomNo || r.roomNo);
  const room = findRoom_(targetNo);
  if (room.status !== 'Active') throw new Error('Room ' + targetNo + ' is ' + room.status + (room.statusReason ? ' (' + room.statusReason + ')' : '') + '.');
  if (room.housekeeping === 'Dirty' && !canOverride) throw new Error('Room ' + targetNo + ' is Dirty. Clean it first, or ask a manager to override.');
  if (room.type !== r.roomType) throw new Error('Room ' + targetNo + ' is type ' + room.type + '; reservation is ' + r.roomType + '.');
  const free = freeRooms_(bd, r.departure, r.roomType, resNo);
  if (!free.some(x => String(x.roomNo) === targetNo)) throw new Error('Room ' + targetNo + ' is already booked for this stay.');

  // Guest alerts: "Block" stops check-in unless overridden; "Info" is returned as a warning to show the desk.
  const warnings = [];
  const guest = rows_(TBL.GUESTS).find(g => g.id === r.guestId);
  if (guest && guest.alert) {
    const msg = guest.alert;
    if (guest.alertLevel === 'Block' && !canOverride) throw new Error('Guest alert (block): ' + msg + '. A manager can override this.');
    warnings.push((guest.alertLevel === 'Block' ? 'Override used for guest alert: ' : 'Guest alert: ') + msg);
  }

  const now = fmtTs_(new Date());
  if (targetNo !== String(r.roomNo)) {
    rows_(TBL.POSTINGS).filter(p => p.resNo === resNo).forEach(p => patch_(TBL.POSTINGS, p._row, { roomNo: targetNo }));
  }
  patch_(TBL.RES, r._row, { status: 'In-House', roomNo: targetNo, checkedInAt: now, updatedAt: now });
  const amt = num_(deposit);
  if (amt > 0) {
    const pc = chargeCode_(depositCode || 'DEP', PAY_TYPE);
    postEntry_(resNo, targetNo, folio1_(resNo), pc.code, 'Deposit at check-in', -amt, user, bd, '');
  }
  audit_(user, 'CHECK_IN', 'Reservation', resNo, 'Room ' + targetNo + (amt ? ' deposit ' + amt : '') + (canOverride && guest && guest.alert ? ' (guest alert overridden)' : ''));
  return { resNo: resNo, roomNo: targetNo, warnings: warnings };
}

/** What the guest personally owes on a stay: postings on folios not billed to a company account. */
function guestBalance_(resNo) {
  const company = new Set(rows_(TBL.FOLIOS).filter(f => f.resNo === resNo && f.accountId).map(f => f.id));
  return num_(rows_(TBL.POSTINGS).filter(p => p.resNo === resNo && p.voided !== true && !company.has(p.folioId))
    .reduce((a, p) => a + Number(p.amount), 0));
}

function folio1_(resNo) {
  const f = rows_(TBL.FOLIOS).filter(x => x.resNo === resNo && x.status === 'Open').sort((a, b) => Number(a.folioNo) - Number(b.folioNo))[0];
  if (!f) throw new Error('No open folio for ' + resNo);
  return f.id;
}

/** force = explicit override for this one transaction; requires frontdesk.override. */
function checkIn(token, resNo, roomNo, deposit, depositCode, force) {
  const s = auth_(token, 'frontdesk.checkin');
  const canOverride = permMap_(s.role)['frontdesk.override'] === true && (force === true || force === 'true');
  return withLock_(() => checkIn_(resNo, roomNo, deposit, depositCode, s.username, canOverride));
}

function checkOut(token, resNo, force) {
  const s = auth_(token, 'frontdesk.checkout');
  const canOverride = permMap_(s.role)['frontdesk.override'] === true && (force === true || force === 'true');
  return withLock_(() => {
    const r = findRes_(resNo);
    if (r.status !== 'In-House') throw new Error(resNo + ' is ' + r.status + ', cannot check out.');
    const balance = guestBalance_(resNo);
    if (balance > 0.005 && !flag_('allowCheckoutWithBalance') && !canOverride) {
      throw new Error('Outstanding balance ' + balance.toFixed(2) + '. Settle it, or ask a manager to override.');
    }
    const now = fmtTs_(new Date()), bd = bizDate_();
    rows_(TBL.FOLIOS).filter(f => f.resNo === resNo && f.status === 'Open')
      .forEach(f => patch_(TBL.FOLIOS, f._row, { status: 'Closed', closedAt: now }));
    patch_(TBL.RES, r._row, { status: 'Departed', checkedOutAt: now, updatedAt: now });
    const room = rows_(TBL.ROOMS).find(x => String(x.roomNo) === String(r.roomNo));
    if (room) patch_(TBL.ROOMS, room._row, { housekeeping: 'Dirty', hkUpdatedAt: bd });
    const g = rows_(TBL.GUESTS).find(x => x.id === r.guestId);
    if (g) patch_(TBL.GUESTS, g._row, { stays: (Number(g.stays) || 0) + 1, lastStay: bd });
    audit_(s.username, 'CHECK_OUT', 'Reservation', resNo, 'Room ' + r.roomNo + ' balance ' + balance.toFixed(2));
    return { balance: balance };
  });
}

/** Walk-in: creates a reservation for today and checks the guest in at once. */
function walkIn(token, d) {
  const s = auth_(token, 'reservations.create');
  if (permMap_(s.role)['frontdesk.checkin'] !== true) throw new Error('Permission denied: frontdesk.checkin');
  const canOverride = permMap_(s.role)['frontdesk.override'] === true && (d.force === true || d.force === 'true');
  return withLock_(() => {
    const bd = bizDate_();
    const r = createRes_(Object.assign({}, d, { arrival: bd, departure: d.departure || addDays_(bd, 1), channel: 'Walk-in' }), s.username);
    const ci = checkIn_(r.resNo, d.roomNo || r.roomNo, d.deposit, d.depositCode, s.username, canOverride);
    return { resNo: r.resNo, roomNo: ci.roomNo, warnings: ci.warnings };
  });
}

/** Moves an in-house or reserved guest to another free room of any type. Postings follow the guest. */
function moveRoom(token, resNo, roomNo) {
  const s = auth_(token, 'reservations.modify');
  return withLock_(() => {
    const r = findRes_(resNo);
    if (RES_ACTIVE.indexOf(r.status) < 0) throw new Error('Only Reserved or In-House stays can move (status: ' + r.status + ').');
    const target = findRoom_(roomNo);
    if (target.status !== 'Active') throw new Error('Room ' + roomNo + ' is ' + target.status + '.');
    const from = r.status === 'In-House' ? bizDate_() : r.arrival;
    if (!freeRooms_(from, r.departure, target.type, resNo).some(x => String(x.roomNo) === String(roomNo))) throw new Error('Room ' + roomNo + ' is not free for those dates.');
    const old = String(r.roomNo);
    patch_(TBL.RES, r._row, { roomNo: String(roomNo), roomType: target.type, updatedAt: fmtTs_(new Date()) });
    rows_(TBL.POSTINGS).filter(p => p.resNo === resNo).forEach(p => patch_(TBL.POSTINGS, p._row, { roomNo: String(roomNo) }));
    if (r.status === 'In-House') {
      const oldRoom = rows_(TBL.ROOMS).find(x => String(x.roomNo) === old);
      if (oldRoom) patch_(TBL.ROOMS, oldRoom._row, { housekeeping: 'Dirty', hkUpdatedAt: bizDate_() });
    }
    audit_(s.username, 'ROOM_MOVE', 'Reservation', resNo, old + ' > ' + roomNo);
    return { roomNo: String(roomNo) };
  });
}

/** Extends an in-house stay. Adds nightly rates for the new nights. */
function extendStay(token, resNo, newDeparture) {
  const s = auth_(token, 'reservations.modify');
  return withLock_(() => {
    const r = findRes_(resNo);
    if (r.status !== 'In-House') throw new Error('Only in-house stays can be extended.');
    if (!isDate_(newDeparture) || newDeparture <= r.departure) throw new Error('New departure must be after ' + r.departure + '.');
    if (!freeRooms_(r.departure, newDeparture, r.roomType, resNo).some(x => String(x.roomNo) === String(r.roomNo))) throw new Error('Room ' + r.roomNo + ' is booked after ' + r.departure + '.');
    const extra = quoteNights_(r.roomType, r.plan || 'BAR', r.departure, newDeparture);
    const sched = rows_(TBL.RATESCHED).filter(x => x.resNo === resNo && x.active === true)
      .map(x => ({ date: x.date, rate: Number(x.rate) }))
      .concat(extra.map(n => ({ date: n.date, rate: n.rate })));
    writeRateSchedule_(resNo, sched);
    patch_(TBL.RES, r._row, { departure: newDeparture, updatedAt: fmtTs_(new Date()) });
    audit_(s.username, 'STAY_EXTENDED', 'Reservation', resNo, r.departure + ' > ' + newDeparture);
    return { departure: newDeparture };
  });
}

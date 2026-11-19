/**
 * Stayline – Reservations.gs
 * Availability, booking, modification, cancellation, no-show and the room rack.
 * A reservation holds one room for one stay. Nightly rates are stored per night in RateSchedule,
 * so night audit posts exactly what was quoted, even if rates change later.
 */
const RES_STATUS = ['Reserved', 'In-House', 'Departed', 'Cancelled', 'No-Show'];

function overlap_(a1, a2, b1, b2) { return a1 < b2 && b1 < a2; }

/** Sellable rooms of a type (or any type) that are free for [arrival, departure). Ignores excludeResNo. */
function freeRooms_(arrival, departure, type, excludeResNo) {
  const busy = new Set(rows_(TBL.RES)
    .filter(r => RES_ACTIVE.indexOf(r.status) >= 0 && r.resNo !== excludeResNo && r.roomNo && overlap_(arrival, departure, r.arrival, r.departure))
    .map(r => String(r.roomNo)));
  return roomsAll_().filter(r => r.status === 'Active' && !busy.has(String(r.roomNo)) && (!type || r.type === type));
}

function availability(token, arrival, departure, roomType) {
  auth_(token, 'reservations.view');
  validRange_(arrival, departure);
  const free = freeRooms_(arrival, departure, roomType || null, null);
  const all = roomsAll_().filter(r => !roomType || r.type === roomType);
  const byType = {};
  all.forEach(r => {
    if (!byType[r.type]) byType[r.type] = { type: r.type, total: 0, free: 0, rooms: [], rate: 0 };
    byType[r.type].total++;
  });
  free.forEach(r => { byType[r.type].free++; byType[r.type].rooms.push(String(r.roomNo)); });
  return Object.keys(byType).map(k => {
    const t = byType[k];
    t.rate = quoteNights_(k, 'BAR', arrival, departure).reduce((a, n) => a + n.rate, 0) / Math.max(1, nights_(arrival, departure));
    t.rate = num_(t.rate);
    t.rooms.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return t;
  }).filter(t => t.free > 0 || roomType);
}

/** Creates the reservation, its nightly rates and folio 1. Callers must check permissions. */
function createRes_(d, user) {
  validRange_(d.arrival, d.departure);
  const rt = roomType_(d.roomType);
  const plan = d.plan || 'BAR';
  rows_(TBL.RATEPLANS).find(p => p.code === plan && p.active === true) || (() => { throw new Error('Unknown rate plan: ' + plan); })();
  const adults = Number(d.adults) || 1;
  if (adults > Number(rt.maxAdults) + 1) throw new Error('Too many adults for ' + rt.name + '.');

  const guestId = d.guestId || upsertGuest_(d);
  const guest = rows_(TBL.GUESTS).find(g => g.id === guestId);
  const free = freeRooms_(d.arrival, d.departure, rt.code, null);
  let room;
  if (d.roomNo) {
    room = free.find(r => String(r.roomNo) === String(d.roomNo));
    if (!room) throw new Error('Room ' + d.roomNo + ' is not available for those dates.');
  } else {
    room = free[0];
    if (!room) throw new Error('No ' + rt.name + ' room is available for those dates.');
  }
  const nightly = quoteNights_(rt.code, plan, d.arrival, d.departure);
  const override = Number(d.rateOverride) > 0 ? num_(d.rateOverride) : null;
  const avg = num_(nightly.reduce((a, n) => a + n.rate, 0) / nightly.length);
  const resNo = id_('R');
  const now = fmtTs_(new Date());

  append_(TBL.RES, {
    resNo: resNo, status: 'Reserved', guestId: guestId, guestName: guest ? guestName_(guest) : guestName_(d),
    groupId: d.groupId || '', roomNo: String(room.roomNo), roomType: rt.code, arrival: d.arrival, departure: d.departure,
    adults: adults, children: Number(d.children) || 0, plan: plan, rate: override || avg,
    channel: d.channel || 'Direct', market: d.market || '', company: d.company || (guest && guest.company) || '',
    vip: guest ? guest.vip === true : false, notes: d.notes || '', createdBy: user, createdAt: now, updatedAt: now,
    checkedInAt: '', checkedOutAt: '', cancelReason: ''
  });
  writeRateSchedule_(resNo, nightly.map(n => ({ date: n.date, rate: override || n.rate })));
  append_(TBL.FOLIOS, { id: id_('FO'), resNo: resNo, folioNo: 1, name: 'Guest', status: 'Open', createdAt: now, closedAt: '' });
  audit_(user, 'RES_CREATED', 'Reservation', resNo, room.roomNo + ' ' + d.arrival + ' > ' + d.departure + ' ' + plan);
  return { resNo: resNo, roomNo: String(room.roomNo), total: num_(nightly.reduce((a, n) => a + n.rate, 0)) };
}

function writeRateSchedule_(resNo, nights) {
  rows_(TBL.RATESCHED).filter(r => r.resNo === resNo && r.active === true).forEach(r => patch_(TBL.RATESCHED, r._row, { active: false }));
  nights.forEach(n => append_(TBL.RATESCHED, { id: id_('RS'), resNo: resNo, date: n.date, rate: num_(n.rate), active: true }));
}
/** Rate for one night of a reservation (falls back to the reservation rate). */
function nightRate_(res, date) {
  const r = rows_(TBL.RATESCHED).find(x => x.resNo === res.resNo && x.date === date && x.active === true);
  return r ? Number(r.rate) : Number(res.rate) || 0;
}

function createReservation(token, d, rid) {
  const s = auth_(token, 'reservations.create');
  return withLock_(() => {
    const dup = idemGet_(s, rid);
    if (dup) return dup;
    const out = createRes_(d, s.username);
    try { reservationMail_(out.resNo); } catch (e) { Logger.log('Reservation mail: ' + e.message); }
    idemPut_(s, rid, out);
    return out;
  });
}

function listReservations(token, f) {
  auth_(token, 'reservations.view');
  f = f || {};
  let list = rows_(TBL.RES);
  if (f.status) list = list.filter(r => r.status === f.status);
  if (f.from) list = list.filter(r => r.departure >= f.from);
  if (f.to) list = list.filter(r => r.arrival <= f.to);
  if (f.roomType) list = list.filter(r => r.roomType === f.roomType);
  if (f.q) {
    const q = String(f.q).toLowerCase();
    list = list.filter(r => [r.resNo, r.guestName, r.roomNo, r.groupId, r.company].join(' ').toLowerCase().indexOf(q) >= 0);
  }
  const bal = balances_();
  return list.sort((a, b) => String(a.arrival).localeCompare(String(b.arrival)) || String(a.roomNo).localeCompare(String(b.roomNo)))
    .slice(0, 500)
    .map(r => ({ resNo: r.resNo, status: r.status, guestName: r.guestName, groupId: r.groupId, roomNo: String(r.roomNo), roomType: r.roomType,
      arrival: r.arrival, departure: r.departure, channel: r.channel, company: r.company, vip: r.vip === true, balance: num_(bal[r.resNo] || 0) }));
}

function getReservation(token, resNo) {
  const s = auth_(token, 'reservations.view');
  const perms = permMap_(s.role);
  const r = findRes_(resNo);
  const guest = rows_(TBL.GUESTS).find(g => g.id === r.guestId) || {};
  const room = rows_(TBL.ROOMS).find(x => String(x.roomNo) === String(r.roomNo)) || {};
  const rates = rows_(TBL.RATESCHED).filter(x => x.resNo === r.resNo && x.active === true)
    .sort((a, b) => String(a.date).localeCompare(String(b.date))).map(x => ({ date: x.date, rate: Number(x.rate) }));
  const out = { res: r, guest: guest, guestName: guestName_(guest) || r.guestName, room: { roomNo: String(r.roomNo), type: room.type || r.roomType, status: room.status || '', housekeeping: room.housekeeping || '' }, rates: rates };
  if (perms['folio.view']) {
    const folios = rows_(TBL.FOLIOS).filter(f => f.resNo === r.resNo).sort((a, b) => Number(a.folioNo) - Number(b.folioNo));
    const posts = rows_(TBL.POSTINGS).filter(p => p.resNo === r.resNo);
    out.folios = folios.map(f => {
      const ps = posts.filter(p => p.folioId === f.id).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      return { id: f.id, folioNo: Number(f.folioNo), name: f.name, status: f.status, accountId: f.accountId || '', postings: ps, balance: num_(ps.filter(p => p.voided !== true).reduce((a, p) => a + Number(p.amount), 0)) };
    });
    out.balance = num_(out.folios.reduce((a, f) => a + f.balance, 0));
  }
  return out;
}
function findRes_(resNo) {
  const r = rows_(TBL.RES).find(x => x.resNo === String(resNo).trim());
  if (!r) throw new Error('Reservation not found: ' + resNo);
  return r;
}
function balances_() {
  const m = {};
  rows_(TBL.POSTINGS).forEach(p => { if (p.voided !== true) m[p.resNo] = (m[p.resNo] || 0) + Number(p.amount || 0); });
  return m;
}

/** Changes dates, room type, plan or adults of a Reserved booking (In-House stays use FrontDesk functions). */
function modifyReservation(token, resNo, d) {
  const s = auth_(token, 'reservations.modify');
  return withLock_(() => {
    const r = findRes_(resNo);
    assertStayEditable_(r.arrival, r.departure, d.arrival || r.arrival, d.departure || r.departure, !!((d.roomType && d.roomType !== r.roomType) || (d.plan && d.plan !== r.plan)));
    if (r.status === 'In-House') return modifyInHouse_(r, s, d);
    if (r.status !== 'Reserved') throw new Error('Only Reserved or In-House bookings can be updated here (status: ' + r.status + ').');
    const arrival = d.arrival || r.arrival, departure = d.departure || r.departure;
    const roomType = d.roomType || r.roomType, plan = d.plan || r.plan;
    validRange_(arrival, departure);
    const free = freeRooms_(arrival, departure, roomType, r.resNo);
    let roomNo = r.roomNo;
    if (!free.some(x => String(x.roomNo) === String(roomNo) && x.type === roomType)) {
      const alt = free[0];
      if (!alt) throw new Error('No ' + roomType + ' room is available for the new dates.');
      roomNo = String(alt.roomNo);
    }
    const nightly = quoteNights_(roomType, plan, arrival, departure);
    const override = Number(d.rateOverride) > 0 ? num_(d.rateOverride) : null;
    writeRateSchedule_(r.resNo, nightly.map(n => ({ date: n.date, rate: override || n.rate })));
    const vip = d.vip !== undefined ? (d.vip === true || d.vip === 'true') : r.vip === true;
    const company = d.company !== undefined ? String(d.company || '') : (r.company || '');
    patch_(TBL.RES, r._row, {
      arrival: arrival, departure: departure, roomType: roomType, roomNo: roomNo, plan: plan,
      adults: Number(d.adults) || r.adults, rate: override || num_(nightly.reduce((a, n) => a + n.rate, 0) / nightly.length),
      notes: d.notes !== undefined ? d.notes : r.notes, company: company, vip: vip, updatedAt: fmtTs_(new Date())
    });
    const newAdults = Number(d.adults) || r.adults, newNotes = d.notes !== undefined ? d.notes : r.notes;
    const changes = [['arrival', r.arrival, arrival], ['departure', r.departure, departure], ['room type', r.roomType, roomType],
      ['room', r.roomNo, roomNo], ['rate plan', r.plan, plan], ['adults', r.adults, newAdults], ['notes', r.notes || '', newNotes || '']];
    if (override) changes.push(['fixed rate', '', override]);
    const detail = changes.filter(c => String(c[1]) !== String(c[2])).map(c => c[0] + ' ' + c[1] + ' > ' + c[2]).join('; ') || 'no field changed';
    audit_(s.username, 'RES_MODIFIED', 'Reservation', resNo, detail);
    return { resNo: resNo, roomNo: roomNo };
  });
}

/** Updating an in-house stay: only details that do not change posted charges. Dates are changed by Extend stay,
 *  the room by Move room. Arrival, room type and rate are fixed for the stay. */
function modifyInHouse_(r, s, d) {
  if (d.arrival && d.arrival !== r.arrival) throw new Error('The arrival of an in-house stay cannot change. Use Move room or Extend stay.');
  if (d.roomType && d.roomType !== r.roomType) throw new Error('The room type of an in-house stay cannot change here. Use Move room.');
  if (d.plan && d.plan !== r.plan) throw new Error('The rate plan of an in-house stay cannot change here.');
  if (Number(d.rateOverride) > 0) throw new Error('The rate of an in-house stay cannot change here.');
  const adults = Number(d.adults) || r.adults;
  const notes = d.notes !== undefined ? d.notes : (r.notes || '');
  const company = d.company !== undefined ? String(d.company || '') : (r.company || '');
  const vip = d.vip !== undefined ? (d.vip === true || d.vip === 'true') : r.vip === true;
  patch_(TBL.RES, r._row, { adults: adults, notes: notes, company: company, vip: vip, updatedAt: fmtTs_(new Date()) });
  const changes = [['adults', r.adults, adults], ['company', r.company || '', company], ['vip', r.vip === true, vip], ['notes', r.notes || '', notes]];
  const detail = changes.filter(c => String(c[1]) !== String(c[2])).map(c => c[0] + ' ' + c[1] + ' > ' + c[2]).join('; ') || 'no field changed';
  audit_(s.username, 'RES_MODIFIED', 'Reservation', r.resNo, detail);
  return { resNo: r.resNo, roomNo: r.roomNo };
}

function cancelReservation(token, resNo, reason) {
  const s = auth_(token, 'reservations.cancel');
  if (!String(reason || '').trim()) throw new Error('A cancellation reason is required.');
  return withLock_(() => {
    const r = findRes_(resNo);
    if (r.status !== 'Reserved') throw new Error('Only Reserved bookings can be cancelled (status: ' + r.status + ').');
    if (Math.abs(balances_()[resNo] || 0) > 0.005) throw new Error('Folio has postings (deposit?). Void or transfer them first.');
    patch_(TBL.RES, r._row, { status: 'Cancelled', cancelReason: reason, updatedAt: fmtTs_(new Date()) });
    audit_(s.username, 'RES_CANCELLED', 'Reservation', resNo, reason);
    return true;
  });
}

function markNoShow(token, resNo) {
  const s = auth_(token, 'reservations.cancel');
  return withLock_(() => {
    const r = findRes_(resNo);
    if (r.status !== 'Reserved' || r.arrival >= bizDate_()) throw new Error('Only Reserved bookings whose arrival has passed can be no-show.');
    patch_(TBL.RES, r._row, { status: 'No-Show', updatedAt: fmtTs_(new Date()) });
    audit_(s.username, 'NO_SHOW', 'Reservation', resNo, '');
    return true;
  });
}

/** Room rack: one row per room, one cell per night, for `days` days from `start`. */
function rackData(token, start, days) {
  auth_(token, 'rack.view');
  const n = Math.min(Math.max(Number(days) || 14, 1), 31);
  const from = start || bizDate_();
  const to = addDays_(from, n);
  const dates = []; for (let i = 0; i < n; i++) dates.push(addDays_(from, i));
  const res = rows_(TBL.RES).filter(r => RES_ACTIVE.indexOf(r.status) >= 0 && overlap_(from, to, r.arrival, r.departure));
  const rooms = roomsAll_().sort((a, b) => String(a.roomNo).localeCompare(String(b.roomNo), undefined, { numeric: true }));
  return {
    dates: dates,
    rooms: rooms.map(rm => ({
      roomNo: String(rm.roomNo), type: rm.type, status: rm.status, housekeeping: rm.housekeeping,
      cells: dates.map(d => {
        const r = res.find(x => String(x.roomNo) === String(rm.roomNo) && x.arrival <= d && d < x.departure);
        if (!r) return null;
        return { resNo: r.resNo, guest: r.guestName, status: r.status, start: r.arrival === d, end: r.departure === addDays_(d, 1) };
      })
    }))
  };
}

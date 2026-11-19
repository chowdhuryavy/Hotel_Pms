/**
 * Stayline – NightAudit.gs
 * Night audit closes the business date:
 *   1. posts one ROOM charge (plus tax) per in-house guest for the nights they stay,
 *   2. marks un-arrived reservations as No-Show (if enabled),
 *   3. records the closed date and advances the business date by one day.
 * It runs once per business date. A second run for the same date is refused.
 * Once a date is closed its postings are frozen: voids, transfers and splits on that date are refused.
 */
/** True when the night audit has closed this business date. Dates may be stored with a time; compare the day only. */
function closedDate_(bd) {
  const d = String(bd || '').slice(0, 10);
  return !!d && rows_(TBL.BIZDATES).some(b => String(b.date).slice(0, 10) === d && b.status === 'Closed');
}
/** Nights from arrival up to (not including) departure, as yyyy-mm-dd strings (capped at 400 nights). */
function nightsOf_(arrival, departure) {
  const out = [];
  for (let x = String(arrival).slice(0, 10), i = 0; x < String(departure).slice(0, 10) && i < 400; x = addDays_(x, 1), i++) out.push(x);
  return out;
}
/** A stay may not change for a night already closed by the night audit (its charges are final).
 *  Blocks nights added or removed, and any night re-priced by a room type or plan change. */
function assertStayEditable_(oldA, oldD, newA, newD, repriced) {
  const oldN = nightsOf_(oldA, oldD), newN = nightsOf_(newA, newD);
  const inOld = new Set(oldN), inNew = new Set(newN);
  const touched = oldN.filter(x => !inNew.has(x)).concat(newN.filter(x => !inOld.has(x)));
  if (repriced) touched.push(...oldN.filter(x => inNew.has(x)));
  const bad = touched.find(x => closedDate_(x));
  if (bad) throw new Error('The night of ' + bad + ' is already closed by the night audit, so this stay cannot be changed for that night.');
}
function businessDateInfo(token) {
  const s0 = auth_(token);
  if (!anyPerm_(s0, ['nightaudit.run'])) throw new Error('Permission denied: nightaudit.run');
  const bd = bizDate_();
  const res = rows_(TBL.RES);
  const pastDue = res.filter(r => r.status === 'Reserved' && r.arrival < bd);
  const departing = res.filter(r => r.status === 'In-House' && r.departure === bd);
  const unpaid = departing.filter(r => guestBalance_(r.resNo) > 0.005);
  const openShifts = rows_(TBL.SHIFTS).filter(s => s.status === 'Open');
  const dirty = roomsAll_().filter(r => r.housekeeping === 'Dirty').length;
  const ooo = roomsAll_().filter(r => r.status !== 'Active').length;
  // Warnings the manager should clear (or consciously accept) before running the audit
  const warnings = [];
  if (pastDue.length) warnings.push(pastDue.length + ' arrival(s) from before ' + bd + ' still Reserved; they will be marked No-Show if auto no-show is on.');
  if (unpaid.length) warnings.push(unpaid.length + ' departing guest(s) have an open balance: ' + unpaid.map(r => r.roomNo).join(', ') + '.');
  if (openShifts.length) warnings.push(openShifts.length + ' cashier shift(s) still open: ' + openShifts.map(s => s.user).join(', ') + '.');
  if (dirty) warnings.push(dirty + ' room(s) still Dirty.');
  if (ooo) warnings.push(ooo + ' room(s) out of order or out of service.');
  return {
    bizDate: bd,
    inHouse: res.filter(r => r.status === 'In-House').length,
    arrivalsToday: res.filter(r => r.status === 'Reserved' && r.arrival === bd).length,
    pastDue: pastDue.length,
    departuresToday: departing.length,
    unpaidDepartures: unpaid.length,
    openShifts: openShifts.length,
    dirtyRooms: dirty,
    closedDates: rows_(TBL.BIZDATES).length,
    lastClosed: rows_(TBL.BIZDATES).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null,
    warnings: warnings
  };
}
function listBizDates(token) {
  auth_(token, 'reports.view');
  return rows_(TBL.BIZDATES).sort((a, b) => String(b.date).localeCompare(String(a.date))).map(b => ({
    date: b.date, status: b.status, closedAt: b.closedAt, closedBy: b.closedBy, roomsPosted: Number(b.roomsPosted) || 0, noShows: Number(b.noShows) || 0
  }));
}

/** One night-audit sense check. The page calls this once per check so each tick shows as it completes. */
function nightAuditCheck(token, key) {
  const s = auth_(token);
  if (!anyPerm_(s, ['nightaudit.run'])) throw new Error('Permission denied: nightaudit.run');
  const bd = bizDate_();
  const res = rows_(TBL.RES);
  const out = (status, detail, extra) => Object.assign({ key: key, status: status, detail: detail }, extra || {});
  switch (key) {
    case 'date': {
      const closed = rows_(TBL.BIZDATES).some(b => b.date === bd && b.status === 'Closed');
      return closed ? out('fail', 'Business date ' + bd + ' is already closed.') : out('ok', 'Business date ' + bd + ' is open.');
    }
    case 'dueout': {
      // Guests whose stay ends on the business date must check out or extend before the audit
      const due = res.filter(r => r.status === 'In-House' && r.departure === bd);
      const guests = due.map(r => ({ resNo: r.resNo, roomNo: String(r.roomNo), guest: r.guestName, balance: num_(guestBalance_(r.resNo)) }));
      return guests.length
        ? out('fail', guests.length + ' guest(s) due out today: ' + guests.map(g => 'Room ' + g.roomNo).join(', ') + '. Check out or extend the stay.', { guests: guests })
        : out('ok', 'No guests due out today.', { guests: [] });
    }
    case 'arrivals': {
      const n = res.filter(r => r.status === 'Reserved' && r.arrival < bd).length;
      return n ? out('warn', n + ' past-due arrival(s) still Reserved.') : out('ok', 'No past-due arrivals.');
    }
    case 'departures': {
      const unpaid = res.filter(r => r.status === 'In-House' && r.departure === bd && guestBalance_(r.resNo) > 0.005).length;
      return unpaid ? out('warn', unpaid + ' departing guest(s) with an open balance.') : out('ok', 'Departing guests are settled.');
    }
    case 'shifts': {
      const n = rows_(TBL.SHIFTS).filter(x => x.status === 'Open').length;
      return out('ok', n ? n + ' open cashier shift(s) will be closed automatically by the audit.' : 'No open cashier shifts.');
    }
    case 'housekeeping': {
      const n = roomsAll_().filter(r => r.housekeeping === 'Dirty').length;
      return n ? out('warn', n + ' room(s) still Dirty.') : out('ok', 'No dirty rooms.');
    }
    case 'rooms': {
      const n = roomsAll_().filter(r => r.status !== 'Active').length;
      return n ? out('warn', n + ' room(s) out of order or out of service.') : out('ok', 'All rooms in order.');
    }
    case 'rates': {
      const stayers = res.filter(r => r.status === 'In-House' && r.arrival <= bd && bd < r.departure);
      const zero = stayers.filter(r => !(nightRate_(r, bd) > 0)).length;
      return zero ? out('warn', zero + ' stayer(s) with a zero room rate for ' + bd + '.') : out('ok', stayers.length + ' stayer(s) tonight, all with a rate.');
    }
  }
  throw new Error('Unknown check: ' + key);
}

/** Closes every open cashier shift at the audit. Cash is not counted here, so the counted amount and variance stay blank. */
function closeOpenShifts_(bd, by) {
  const now = fmtTs_(new Date());
  const open = rows_(TBL.SHIFTS).filter(x => x.status === 'Open');
  open.forEach(sh => {
    const expected = num_(Number(sh.openingFloat) + shiftSummary_(sh).cashReceived);
    patch_(TBL.SHIFTS, sh._row, { closedAt: now, expectedCash: expected, countedCash: '', variance: '', status: 'Closed', notes: 'Closed by night audit ' + bd });
    audit_(by, 'SHIFT_AUTO_CLOSED', 'Shift', sh.id, sh.user + ' · expected ' + expected + ' (not counted)');
  });
  return open.length;
}
/** Saves the city-ledger aging as of the audited date, one row per company with a balance. */
function arAgingSnapshot_(bd) {
  const now = fmtTs_(new Date());
  // a database set up before this version gets the tab on first night run
  const ss = ss_();
  const tab = ss.getSheetByName(TBL.ARAGING[0]) || ss.insertSheet(TBL.ARAGING[0]);
  if (tab.getLastRow() === 0) tab.getRange(1, 1, 1, TBL.ARAGING[1].length).setValues([TBL.ARAGING[1]]);
  let companies = 0, total = 0;
  rows_(TBL.ACCOUNTS).forEach(a => {
    const b = arBuckets_(arItems_(a.id).open);
    const t = num_(b.current + b.d31 + b.d61 + b.d90);
    if (t === 0) return;
    append_(TBL.ARAGING, { bizDate: bd, code: a.code, name: a.name, current: num_(b.current), d31: num_(b.d31), d61: num_(b.d61), d90: num_(b.d90), total: t, snapshotAt: now });
    companies++; total += t;
  });
  return { companies: companies, total: num_(total) };
}

function runNightAudit(token) {
  const s = auth_(token, 'nightaudit.run');
  return withLock_(() => {
    const bd = bizDate_();
    if (rows_(TBL.BIZDATES).some(b => b.date === bd && b.status === 'Closed')) throw new Error('Business date ' + bd + ' has already been audited.');
    const dueOut = rows_(TBL.RES).filter(r => r.status === 'In-House' && r.departure === bd);
    if (dueOut.length) throw new Error(dueOut.length + ' guest(s) due out on ' + bd + ' (room ' + dueOut.map(r => r.roomNo).join(', ') + '). Check out or extend their stay first.');

    // 1) Room and tax postings for every guest staying the night of bd
    const stayers = rows_(TBL.RES).filter(r => r.status === 'In-House' && r.arrival <= bd && bd < r.departure);
    const already = new Set(rows_(TBL.POSTINGS).filter(p => p.bizDate === bd && p.code === 'ROOM' && p.voided !== true).map(p => p.resNo));
    let roomsPosted = 0, total = 0;
    stayers.forEach(r => {
      if (already.has(r.resNo)) return;
      const rate = nightRate_(r, bd);
      postWithTax_(r.resNo, r.roomNo, folio1_(r.resNo), 'ROOM', 'Room charge ' + bd, rate, 'night-audit', bd);
      roomsPosted++; total += rate;
    });

    // 1b) Fixed charges due tonight (guest folios and room ledger)
    ensureTabs_([TBL.FIXEDRULES, TBL.ROOMCHG]);
    const fixed = postFixedCharges_(bd, s.username);

    // 2) No-shows
    let noShows = 0;
    if (flag_('autoNoShowOnAudit')) {
      rows_(TBL.RES).filter(r => r.status === 'Reserved' && r.arrival <= bd).forEach(r => {
        patch_(TBL.RES, r._row, { status: 'No-Show', updatedAt: fmtTs_(new Date()) });
        noShows++;
      });
    }

    // 3) Close open cashier shifts and save the AR aging as of this date
    const shiftsClosed = closeOpenShifts_(bd, s.username);
    const aging = arAgingSnapshot_(bd);

    // 4) Close the date and advance
    const next = addDays_(bd, 1);
    append_(TBL.BIZDATES, { date: bd, status: 'Closed', openedAt: '', closedAt: fmtTs_(new Date()), closedBy: s.username, roomsPosted: roomsPosted, noShows: noShows });
    const row = rows_(TBL.SETTINGS).find(r => r.key === 'businessDate');
    if (row) patch_(TBL.SETTINGS, row._row, { value: next });
    else append_(TBL.SETTINGS, { key: 'businessDate', value: next });
    audit_(s.username, 'NIGHT_AUDIT', 'BusinessDate', bd, roomsPosted + ' rooms, ' + num_(total) + ' room revenue, ' + noShows + ' no-shows, ' + shiftsClosed + ' shifts closed, AR ' + aging.total + '; next ' + next);
    let emailed = false;
    try { sendAuditorReport_(bd); emailed = true; } catch (e) { Logger.log('Auditor report: ' + e.message); }
    return { closed: bd, next: next, roomsPosted: roomsPosted, roomRevenue: num_(total), noShows: noShows, shiftsClosed: shiftsClosed, aging: aging, fixed: fixed, emailed: emailed };
  });
}

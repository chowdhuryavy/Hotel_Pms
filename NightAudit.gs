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

function runNightAudit(token) {
  const s = auth_(token, 'nightaudit.run');
  return withLock_(() => {
    const bd = bizDate_();
    if (rows_(TBL.BIZDATES).some(b => b.date === bd && b.status === 'Closed')) throw new Error('Business date ' + bd + ' has already been audited.');

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

    // 2) No-shows
    let noShows = 0;
    if (flag_('autoNoShowOnAudit')) {
      rows_(TBL.RES).filter(r => r.status === 'Reserved' && r.arrival <= bd).forEach(r => {
        patch_(TBL.RES, r._row, { status: 'No-Show', updatedAt: fmtTs_(new Date()) });
        noShows++;
      });
    }

    // 3) Close the date and advance
    const next = addDays_(bd, 1);
    append_(TBL.BIZDATES, { date: bd, status: 'Closed', openedAt: '', closedAt: fmtTs_(new Date()), closedBy: s.username, roomsPosted: roomsPosted, noShows: noShows });
    const row = rows_(TBL.SETTINGS).find(r => r.key === 'businessDate');
    if (row) patch_(TBL.SETTINGS, row._row, { value: next });
    else append_(TBL.SETTINGS, { key: 'businessDate', value: next });
    audit_(s.username, 'NIGHT_AUDIT', 'BusinessDate', bd, roomsPosted + ' rooms, ' + num_(total) + ' room revenue, ' + noShows + ' no-shows; next ' + next);
    try { sendAuditorReport_(bd); } catch (e) { Logger.log('Auditor report: ' + e.message); }
    return { closed: bd, next: next, roomsPosted: roomsPosted, roomRevenue: num_(total), noShows: noShows };
  });
}

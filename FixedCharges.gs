/* Stayline – FixedCharges.gs
 * Fixed charges are scheduled amounts (daily, weekly or monthly) posted by the night run.
 *  - Guest stay: posts to the guest's folio while the guest is in the hotel (with tax if the charge code is taxable).
 *  - Room: posts to the room ledger (RoomCharges) whatever the room status, including out-of-order and out-of-service rooms.
 */
const FIXED_FREQ = ['Daily', 'Weekly', 'Monthly'];

/** Creates a tab (with its headers) if the database was set up before this version. */
function ensureTabs_(list) {
  const ss = ss_();
  list.forEach(t => {
    const s = ss.getSheetByName(t[0]) || ss.insertSheet(t[0]);
    if (s.getLastRow() === 0) s.getRange(1, 1, 1, t[1].length).setValues([t[1]]);
  });
}
function weekdayOf_(iso) { return new Date(iso + 'T12:00:00Z').getUTCDay(); }
function daysInMonth_(iso) { return new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0)).getUTCDate(); }

/** True when a rule is due on the business date and has not already posted for it. */
function fixedDue_(rule, bd) {
  if (rule.active !== true) return false;
  const start = String(rule.startDate || '').slice(0, 10), end = String(rule.endDate || '').slice(0, 10);
  if (!isDate_(start) || bd < start || (end && bd > end)) return false;
  if (String(rule.lastPostedOn || '').slice(0, 10) === bd) return false;
  if (rule.frequency === 'Daily') return true;
  if (rule.frequency === 'Weekly') return weekdayOf_(bd) === weekdayOf_(start);
  if (rule.frequency === 'Monthly') return Number(bd.slice(8, 10)) === Math.min(Number(start.slice(8, 10)), daysInMonth_(bd));
  return false;
}

/** Posts every fixed charge due on bd. Runs inside the night-audit lock. */
function postFixedCharges_(bd, user) {
  let count = 0, total = 0;
  const res = rows_(TBL.RES), rooms = roomsAll_();
  rows_(TBL.FIXEDRULES).forEach(rule => {
    if (!fixedDue_(rule, bd)) return;
    const amt = num_(rule.amount);
    const desc = 'Fixed: ' + rule.description;
    if (rule.scope === 'Room') {
      const room = rooms.find(r => String(r.roomNo) === String(rule.target));
      if (!room) return;
      append_(TBL.ROOMCHG, { id: id_('RC'), roomNo: String(room.roomNo), bizDate: bd, code: rule.code, description: desc, amount: amt,
        ruleId: rule.id, roomStatus: room.status, postedBy: user, createdAt: fmtTs_(new Date()) });
    } else {
      const r = res.find(x => x.resNo === String(rule.target) && x.status === 'In-House' && x.arrival <= bd && bd < x.departure);
      if (!r) return;   // guest not in the hotel tonight: nothing posts and the rule waits
      postWithTax_(r.resNo, r.roomNo, folio1_(r.resNo), rule.code, desc, amt, user, bd);
    }
    patch_(TBL.FIXEDRULES, rule._row, { lastPostedOn: bd });
    count++; total += amt;
  });
  return { count: count, total: num_(total) };
}

function listFixedRules(token) {
  auth_(token, 'fixed.manage');
  ensureTabs_([TBL.FIXEDRULES, TBL.ROOMCHG]);
  const rules = rows_(TBL.FIXEDRULES).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(x => ({
    id: x.id, scope: x.scope, target: String(x.target), code: x.code, description: x.description, amount: num_(x.amount),
    frequency: x.frequency, startDate: String(x.startDate).slice(0, 10), endDate: String(x.endDate || '').slice(0, 10),
    active: x.active === true, lastPostedOn: String(x.lastPostedOn || '').slice(0, 10)
  }));
  const roomCharges = rows_(TBL.ROOMCHG).slice(-200).reverse().map(x => ({
    bizDate: String(x.bizDate).slice(0, 10), roomNo: String(x.roomNo), roomStatus: x.roomStatus, description: x.description, amount: num_(x.amount), postedBy: x.postedBy
  }));
  return { rules: rules, roomCharges: roomCharges };
}

function createFixedRule(token, d, rid) {
  const s = auth_(token, 'fixed.manage');
  return withLock_(() => {
    const dup = idemGet_(s, rid);
    if (dup) return dup;
    ensureTabs_([TBL.FIXEDRULES, TBL.ROOMCHG]);
    const scope = d.scope === 'Room' ? 'Room' : 'Reservation';
    const target = String(d.target || '').trim();
    if (!target) throw new Error(scope === 'Room' ? 'Choose a room.' : 'Enter the reservation number.');
    if (scope === 'Room') {
      if (!roomsAll_().some(r => String(r.roomNo) === target)) throw new Error('Room ' + target + ' does not exist.');
    } else {
      const r = rows_(TBL.RES).find(x => x.resNo === target);
      if (!r || ['Reserved', 'In-House'].indexOf(r.status) < 0) throw new Error('Reservation ' + target + ' is not an active stay.');
    }
    const c = chargeCode_(d.code, CHARGE_TYPE);
    const amount = num_(d.amount);
    if (!(amount > 0)) throw new Error('Amount must be greater than zero.');
    if (FIXED_FREQ.indexOf(d.frequency) < 0) throw new Error('Choose Daily, Weekly or Monthly.');
    const start = String(d.startDate || '').slice(0, 10);
    if (!isDate_(start)) throw new Error('Choose a start date.');
    const end = String(d.endDate || '').slice(0, 10);
    if (end && (!isDate_(end) || end < start)) throw new Error('The end date must be on or after the start date.');
    const id = id_('FX');
    append_(TBL.FIXEDRULES, { id: id, scope: scope, target: target, code: c.code, description: String(d.description || c.description).slice(0, 120),
      amount: amount, frequency: d.frequency, startDate: start, endDate: end, active: true, lastPostedOn: '',
      createdBy: s.username, createdAt: fmtTs_(new Date()) });
    audit_(s.username, 'FIXED_CREATED', scope, target, c.code + ' ' + amount + ' ' + d.frequency + ' from ' + start + (end ? ' to ' + end : ''));
    const out = { id: id };
    idemPut_(s, rid, out);
    return out;
  });
}

function stopFixedRule(token, id) {
  const s = auth_(token, 'fixed.manage');
  return withLock_(() => {
    const r = rows_(TBL.FIXEDRULES).find(x => x.id === id);
    if (!r) throw new Error('Fixed charge not found.');
    patch_(TBL.FIXEDRULES, r._row, { active: false });
    audit_(s.username, 'FIXED_STOPPED', 'FixedCharge', id, r.code + ' ' + r.amount);
    return { ok: true };
  });
}

/** Revenue by period for the flash: today, month to date, year to date, last year (full) and last year to date. */
function periodRevenue_(bd) {
  const y = bd.slice(0, 4), py = String(Number(y) - 1), md = bd.slice(4, 10);
  const ranges = [
    ['Today', bd, bd],
    ['Month to date', bd.slice(0, 8) + '01', bd],
    ['Year to date ' + y, y + '-01-01', bd],
    ['Last year (full) ' + py, py + '-01-01', py + '-12-31'],
    ['Last year to date ' + py, py + '-01-01', py + md]
  ];
  const posts = rows_(TBL.POSTINGS).filter(p => p.voided !== true && String(p.resNo).indexOf('GRP:') !== 0);
  const roomCh = rows_(TBL.ROOMCHG);
  return ranges.map(([label, from, to]) => {
    let rooms = 0, fixed = 0, other = 0, tax = 0;
    posts.forEach(p => {
      const d = String(p.bizDate).slice(0, 10), a = Number(p.amount) || 0;
      if (d < from || d > to || a <= 0) return;   // payments (negative) are not revenue
      if (p.code === 'ROOM') rooms += a;
      else if (p.code === 'TAX') tax += a;
      else if (String(p.description).indexOf('Fixed') === 0) fixed += a;
      else other += a;
    });
    roomCh.forEach(x => { const d = String(x.bizDate).slice(0, 10); if (d >= from && d <= to) fixed += Number(x.amount) || 0; });
    return { label: label, rooms: num_(rooms), fixed: num_(fixed), other: num_(other), tax: num_(tax), total: num_(rooms + fixed + other + tax) };
  });
}

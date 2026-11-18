/**
 * Stayline – Rates.gs
 * Rate plans, seasonal rates per room type, charge codes, and nightly rate quoting.
 *
 * Price for a night = a matching Rates row for the plan + room type (date falls between its
 * start and end), else the same room type on the BAR plan, else the room type's base rate.
 */
function listRatePlans(token) {
  auth_(token, 'rates.view');
  return rows_(TBL.RATEPLANS).map(p => ({ code: p.code, name: p.name, description: p.description || '', active: p.active === true }));
}
function saveRatePlan(token, d) {
  const s = auth_(token, 'rates.manage');
  const code = String(d.code || '').trim().toUpperCase();
  if (!code || !d.name) throw new Error('Code and name are required.');
  return withLock_(() => {
    const ex = rows_(TBL.RATEPLANS).find(x => x.code === code);
    const data = { code: code, name: d.name, description: d.description || '', active: d.active !== false && d.active !== 'false' };
    if (ex) patch_(TBL.RATEPLANS, ex._row, data); else append_(TBL.RATEPLANS, data);
    audit_(s.username, 'RATEPLAN_SAVED', 'RatePlan', code, d.name);
    return code;
  });
}
function listRates(token) {
  auth_(token, 'rates.view');
  return rows_(TBL.RATES).map(r => ({ id: r.id, plan: r.plan, roomType: r.roomType, startDate: r.startDate, endDate: r.endDate, rate: Number(r.rate) || 0, active: r.active === true }));
}
function saveRate(token, d) {
  const s = auth_(token, 'rates.manage');
  if (!isDate_(d.startDate) || !isDate_(d.endDate) || d.endDate < d.startDate) throw new Error('End date must be on or after the start date.');
  if (!(Number(d.rate) >= 0)) throw new Error('Rate must be a number.');
  roomType_(d.roomType);
  return withLock_(() => {
    const id = d.id || id_('RT');
    const data = { id: id, plan: d.plan, roomType: d.roomType, startDate: d.startDate, endDate: d.endDate, rate: num_(d.rate), active: d.active !== false && d.active !== 'false' };
    const ex = d.id ? rows_(TBL.RATES).find(x => x.id === d.id) : null;
    if (ex) patch_(TBL.RATES, ex._row, data); else append_(TBL.RATES, data);
    audit_(s.username, 'RATE_SAVED', 'Rate', id, d.plan + ' ' + d.roomType + ' ' + d.rate);
    return id;
  });
}
function listChargeCodes(token) {
  auth_(token, 'folio.view');
  return rows_(TBL.CHARGES).map(c => ({ code: c.code, description: c.description, department: c.department, type: c.type, taxable: c.taxable === true, active: c.active === true }));
}
function saveChargeCode(token, d) {
  const s = auth_(token, 'rates.manage');
  const code = String(d.code || '').trim().toUpperCase();
  if (!code || !d.description) throw new Error('Code and description are required.');
  return withLock_(() => {
    const ex = rows_(TBL.CHARGES).find(x => x.code === code);
    const data = { code: code, description: d.description, department: d.department || 'Misc', type: d.type === 'Payment' ? 'Payment' : 'Charge', taxable: d.taxable === true || d.taxable === 'true', active: d.active !== false && d.active !== 'false' };
    if (ex) patch_(TBL.CHARGES, ex._row, data); else append_(TBL.CHARGES, data);
    audit_(s.username, 'CHARGECODE_SAVED', 'ChargeCode', code, data.type);
    return code;
  });
}

/** Nightly rates for a stay: [{date, rate}] for each night from arrival up to (not including) departure. */
function quoteNights_(roomType, plan, arrival, departure) {
  const rates = rows_(TBL.RATES).filter(r => r.active === true);
  const base = Number(roomType_(roomType).baseRate) || 0;
  const out = [];
  for (let i = 0; i < nights_(arrival, departure); i++) {
    const date = addDays_(arrival, i);
    const hit = (p) => rates.find(r => r.plan === p && r.roomType === roomType && r.startDate <= date && date <= r.endDate);
    const r = hit(plan) || (plan !== 'BAR' ? hit('BAR') : null);
    out.push({ date: date, rate: r ? num_(r.rate) : base });
  }
  return out;
}
function quoteRates(token, roomType, plan, arrival, departure) {
  auth_(token, 'reservations.view');
  validRange_(arrival, departure);
  const nights = quoteNights_(roomType, plan || 'BAR', arrival, departure);
  const total = num_(nights.reduce((a, n) => a + n.rate, 0));
  return { nights: nights, total: total, average: nights.length ? num_(total / nights.length) : 0 };
}

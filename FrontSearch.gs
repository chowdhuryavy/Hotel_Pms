/**
 * Stayline – FrontSearch.gs
 * Front desk lists: Arrivals, Departures and In-house. Each list has its own filters.
 * Free-text search matches guest name, reservation number, room, group, company and phone.
 */

/** Filters per list, for the page and for the server. */
const FRONT_LISTS = {
  arrivals:   { title: 'Arrivals',        dateField: 'arrival',   statuses: ['Reserved', 'In-House', 'Departed'] },
  departures: { title: 'Departures',      dateField: 'departure', statuses: ['In-House', 'Departed'] },
  inhouse:    { title: 'In-house guests', dateField: null,        statuses: ['In-House'] }
};

/** One list for the front desk. kind: arrivals | departures | inhouse. f: filters from the page. */
function frontSearch(token, kind, f) {
  auth_(token, 'reservations.view');
  const L = FRONT_LISTS[kind];
  if (!L) throw new Error('Unknown front desk list.');
  f = f || {};
  const bd = bizDate_();
  const from = isDate_(f.from) ? f.from : bd;
  const to = isDate_(f.to) ? f.to : bd;
  if (to < from) throw new Error('"To" must be on or after "From".');
  const q = String(f.q || '').trim().toLowerCase();
  const guests = {};
  rows_(TBL.GUESTS).forEach(g => { guests[g.id] = g; });
  const bal = balances_();

  let list = rows_(TBL.RES).filter(r => L.statuses.indexOf(r.status) >= 0);
  // The date window: arrivals and departures by their own date; in-house guests are not filtered by date
  if (L.dateField) list = list.filter(r => r[L.dateField] >= from && r[L.dateField] <= to);
  // Status: the page can narrow the list (for example checked in only, or checked out only)
  if (f.status) list = list.filter(r => r.status === f.status);
  if (f.roomType) list = list.filter(r => String(r.roomType || '') === String(f.roomType));
  if (f.vip === true || f.vip === 'true') list = list.filter(r => r.vip === true);
  if (f.balance === 'due') list = list.filter(r => Number(bal[r.resNo] || 0) > 0.005);
  if (f.balance === 'clear') list = list.filter(r => Number(bal[r.resNo] || 0) <= 0.005);
  if (f.roomNo) list = list.filter(r => String(r.roomNo || '').indexOf(String(f.roomNo).trim()) === 0);
  if (f.company) {
    const c = String(f.company).trim().toLowerCase();
    list = list.filter(r => String(r.company || '').toLowerCase().indexOf(c) >= 0);
  }
  if (q) {
    list = list.filter(r => {
      const g = guests[r.guestId] || {};
      const hay = [r.guestName, r.resNo, r.roomNo, r.groupId, r.company, g.phone, g.email, g.firstName, g.lastName].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  const byRoom = (a, b) => String(a.roomNo || '').localeCompare(String(b.roomNo || ''), undefined, { numeric: true });
  const order = kind === 'arrivals' ? (a, b) => String(a.arrival).localeCompare(String(b.arrival)) || byRoom(a, b)
    : kind === 'departures' ? (a, b) => String(a.departure).localeCompare(String(b.departure)) || byRoom(a, b)
    : byRoom;
  list.sort(order);

  const rows = list.map(r => {
    const g = guests[r.guestId] || {};
    return {
      resNo: r.resNo, guestName: r.guestName || '', phone: g.phone || '', roomNo: String(r.roomNo || ''), roomType: r.roomType || '',
      status: r.status, arrival: r.arrival, departure: r.departure, nights: nights_(r.arrival, r.departure),
      company: r.company || '', groupId: r.groupId || '', vip: r.vip === true,
      balance: num_(bal[r.resNo] || 0), checkedInAt: r.checkedInAt || '', checkedOutAt: r.checkedOutAt || ''
    };
  });
  const balanceDue = rows.reduce((a, r) => a + (r.balance > 0.005 ? r.balance : 0), 0);
  return { kind: kind, title: L.title, bizDate: bd, from: from, to: to, rows: rows, count: rows.length, balanceDue: num_(balanceDue) };
}

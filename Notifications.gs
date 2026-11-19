/**
 * Stayline – Notifications.gs
 * The bell in the header. Alerts are worked out from the current data (arrivals, past-due arrivals, departures with a
 * balance, dirty rooms). Each alert has a count. Per user, the app keeps the count that was marked read and the count
 * that was cleared. So "Mark all read" and "Clear" stick: an alert returns only when its count changes.
 */
function notifItems_(bd) {
  const res = rows_(TBL.RES);
  const bal = balances_();
  const arrivals = res.filter(r => r.status === 'Reserved' && r.arrival === bd).length;
  const pastDue = res.filter(r => r.status === 'Reserved' && r.arrival < bd).length;
  const deptDue = res.filter(r => r.status === 'In-House' && r.departure === bd && Number(bal[r.resNo] || 0) > 0.005).length;
  const dirty = rows_(TBL.ROOMS).filter(x => x.housekeeping === 'Dirty').length;
  return [
    { key: 'arr', perm: 'reservations.view', count: arrivals, title: 'Arrivals today', text: arrivals + ' reservation(s) due to arrive today', page: 'arrivals' },
    { key: 'pd', perm: 'frontdesk.checkin', count: pastDue, title: 'Past-due arrivals', text: pastDue + ' reservation(s) not checked in after their arrival date', page: 'frontdesk' },
    { key: 'dep', perm: 'frontdesk.checkout', count: deptDue, title: 'Departures with a balance', text: deptDue + ' guest(s) leaving today with an unpaid balance', page: 'departures' },
    { key: 'dirty', perm: 'rooms.view', count: dirty, title: 'Dirty rooms', text: dirty + ' room(s) waiting for housekeeping', page: 'housekeeping' }
  ].filter(x => x.count > 0);
}
/** The user's read and cleared counts. Stored per user. */
function notifState_(s) {
  try {
    const st = JSON.parse(PropertiesService.getScriptProperties().getProperty('NOTIF:' + s.username) || '{}');
    return { read: st.read || {}, cleared: st.cleared || {} };
  } catch (e) { return { read: {}, cleared: {} }; }
}
function notifSave_(s, st) {
  PropertiesService.getScriptProperties().setProperty('NOTIF:' + s.username, JSON.stringify(st));
}
/** The alerts this user should see: their permissions allow them, and they were not cleared at this count. */
function notificationsList(token) {
  const s = auth_(token);
  const perms = permMap_(s);
  const st = notifState_(s);
  const items = notifItems_(bizDate_())
    .filter(i => perms[i.perm] === true)
    .filter(i => st.cleared[i.key] !== i.count)
    .map(i => ({ key: i.key, count: i.count, title: i.title, text: i.text, page: i.page, unread: st.read[i.key] !== i.count }));
  return { items: items, unread: items.filter(i => i.unread).length };
}
/** Marks every current alert as read. */
function notificationsMarkRead(token) {
  const s = auth_(token);
  const st = notifState_(s);
  notifItems_(bizDate_()).forEach(i => { st.read[i.key] = i.count; });
  notifSave_(s, st);
  return notificationsList(token);
}
/** Clears every current alert. A cleared alert returns only if its count changes. */
function notificationsClear(token) {
  const s = auth_(token);
  const st = notifState_(s);
  notifItems_(bizDate_()).forEach(i => { st.cleared[i.key] = i.count; st.read[i.key] = i.count; });
  notifSave_(s, st);
  return notificationsList(token);
}

/* ============================================================
 * GuestService.gs: guest service requests (housekeeping extras, maintenance, room service, amenities, transport,
 * wake-up calls, concierge). A request is linked to a room and to the guest in it, and moves Open > In progress > Done.
 * ============================================================ */

const SVC_CATEGORIES = ['Housekeeping', 'Maintenance', 'Room service', 'Amenities', 'Transport', 'Wake-up call', 'Concierge', 'Other'];
const SVC_STATUS = ['Open', 'In progress', 'Done', 'Cancelled'];

function svcRow_(x) {
  return { id: x.id, roomNo: String(x.roomNo || ''), guestName: x.guestName || '', resNo: x.resNo || '', category: x.category, description: x.description,
    priority: x.priority, status: x.status, assignedTo: x.assignedTo || '', createdAt: String(x.createdAt || ''), updatedAt: String(x.updatedAt || ''), doneAt: String(x.doneAt || '') };
}
/** status: 'Active' (open and in progress), 'All', or one status */
function listServiceRequests(token, status) {
  auth_(token, 'service.view');
  let list = rows_(TBL.SVCREQ);
  if (status === 'Active' || !status) list = list.filter(x => x.status === 'Open' || x.status === 'In progress');
  else if (status !== 'All') list = list.filter(x => x.status === status);
  return list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 200).map(svcRow_);
}
function createServiceRequest(token, d, rid) {
  const s = auth_(token, 'service.manage');
  return withLock_(() => {
    const dup = idemGet_(s, rid);
    if (dup) return dup;
    const cat = String(d.category || '');
    if (SVC_CATEGORIES.indexOf(cat) < 0) throw new Error('Choose a request type.');
    const desc = String(d.description || '').trim();
    if (!desc) throw new Error('Describe the request.');
    if (desc.length > 500) throw new Error('Keep the description under 500 characters.');
    const roomNo = String(d.roomNo || '').trim();
    if (!roomNo) throw new Error('Room number is required.');
    const stay = rows_(TBL.RES).find(r => String(r.roomNo) === roomNo && r.status === 'In-House') || null;
    const priority = d.priority === 'Urgent' ? 'Urgent' : 'Normal';
    const now = fmtTs_(new Date());
    const row = { id: id_('SR'), resNo: stay ? stay.resNo : '', roomNo: roomNo, guestName: stay ? stay.guestName : '', category: cat,
      description: desc, priority: priority, status: 'Open', assignedTo: '', createdAt: now, createdBy: s.username, updatedAt: now, doneAt: '' };
    append_(TBL.SVCREQ, row);
    audit_(s.username, 'SERVICE_REQUEST', 'Room', roomNo, cat + ' · ' + priority);
    const out = svcRow_(row);
    idemPut_(s, rid, out);
    return out;
  });
}
/** Staff who can be given a request: active users, names only */
function serviceStaff(token) {
  auth_(token, 'service.view');
  return rows_(TBL.USERS).filter(u => u.active === true).map(u => ({ username: u.username, name: u.name || u.username })).sort((a, b) => a.name.localeCompare(b.name));
}
/** status: a new status, or '' to keep the current one. assignedTo: a username, '' to unassign, or null to keep the current one. */
function updateServiceRequest(token, id, status, assignedTo) {
  const s = auth_(token, 'service.manage');
  if (status && SVC_STATUS.indexOf(status) < 0) throw new Error('Unknown status.');
  return withLock_(() => {
    const row = rows_(TBL.SVCREQ).find(x => x.id === id);
    if (!row) throw new Error('Request not found.');
    if (row.status === 'Done' || row.status === 'Cancelled') throw new Error('This request is already ' + row.status.toLowerCase() + '.');
    const st = status || row.status;
    let who = row.assignedTo || '';
    if (assignedTo !== null && assignedTo !== undefined) {
      who = String(assignedTo).trim();
      if (who && !rows_(TBL.USERS).some(u => u.active === true && u.username === who)) throw new Error('Choose an active staff member.');
    }
    const now = fmtTs_(new Date());
    patch_(TBL.SVCREQ, row._row, { status: st, assignedTo: who, updatedAt: now, doneAt: st === 'Done' ? now : '' });
    const what = status ? 'SERVICE_' + st.toUpperCase().replace(/ /g, '_') : 'SERVICE_ASSIGNED';
    audit_(s.username, what, 'Room', row.roomNo, row.category + (who ? ' · ' + who : ''));
    return svcRow_(Object.assign({}, row, { status: st, assignedTo: who, updatedAt: now, doneAt: st === 'Done' ? now : '' }));
  });
}

/**
 * Stayline – Guests.gs
 * Guest profiles: matched on email, phone or ID number so the same guest is not duplicated.
 */
function guestName_(g) { return ((g.firstName || '') + ' ' + (g.lastName || '')).trim(); }

function upsertGuest_(d) {
  const list = rows_(TBL.GUESTS);
  const hit = list.find(x =>
    (d.email && String(x.email).toLowerCase() === String(d.email).toLowerCase()) ||
    (d.phone && String(x.phone) === String(d.phone)) ||
    (d.idNo && String(x.idNo) === String(d.idNo)));
  const now = fmtTs_(new Date());
  if (hit) {
    // keep the profile up to date with anything newly supplied
    const ch = {};
    ['firstName', 'lastName', 'email', 'phone', 'nationality', 'idType', 'idNo', 'company'].forEach(k => { if (d[k] && !hit[k]) ch[k] = d[k]; });
    if (Object.keys(ch).length) { ch.updatedAt = now; patch_(TBL.GUESTS, hit._row, ch); }
    return hit.id;
  }
  if (!String(d.firstName || '').trim() || !String(d.lastName || '').trim()) throw new Error('Guest first and last name are required.');
  const id = id_('G');
  append_(TBL.GUESTS, {
    id: id, title: d.title || '', firstName: d.firstName.trim(), lastName: d.lastName.trim(), email: d.email || '', phone: d.phone || '',
    nationality: d.nationality || '', idType: d.idType || 'Passport', idNo: d.idNo || '', dob: '', vip: false, company: d.company || '',
    preferences: '', notes: '', stays: 0, lastStay: '', createdAt: now, updatedAt: now
  });
  return id;
}

function searchGuests(token, q) {
  auth_(token, 'guests.view');
  const s = String(q || '').trim().toLowerCase();
  if (s.length < 2) return [];
  return rows_(TBL.GUESTS)
    .filter(g => [g.firstName, g.lastName, g.email, g.phone, g.idNo, g.company].join(' ').toLowerCase().indexOf(s) >= 0)
    .slice(0, 25)
    .map(g => ({ id: g.id, name: guestName_(g), email: g.email, phone: g.phone, idNo: g.idNo, company: g.company, vip: g.vip === true, stays: Number(g.stays) || 0 }));
}

function getGuest(token, id) {
  auth_(token, 'guests.view');
  const g = rows_(TBL.GUESTS).find(x => x.id === id);
  if (!g) throw new Error('Guest not found.');
  const stays = rows_(TBL.RES).filter(r => r.guestId === id)
    .sort((a, b) => String(b.arrival).localeCompare(String(a.arrival)))
    .map(r => ({ resNo: r.resNo, arrival: r.arrival, departure: r.departure, roomNo: String(r.roomNo), status: r.status, roomType: r.roomType }));
  return { guest: g, name: guestName_(g), stays: stays };
}

function saveGuest(token, d) {
  const s = auth_(token, 'guests.manage');
  return withLock_(() => {
    const now = fmtTs_(new Date());
    const data = {
      title: d.title || '', firstName: String(d.firstName || '').trim(), lastName: String(d.lastName || '').trim(),
      email: d.email || '', phone: d.phone || '', nationality: d.nationality || '', idType: d.idType || '', idNo: d.idNo || '',
      dob: d.dob || '', vip: d.vip === true || d.vip === 'true', company: d.company || '', preferences: d.preferences || '',
      notes: d.notes || '', updatedAt: now,
      alert: String(d.alert || '').trim().slice(0, 200), alertLevel: d.alertLevel === 'Block' ? 'Block' : 'Info'
    };
    if (!data.firstName || !data.lastName) throw new Error('First and last name are required.');
    if (d.id) {
      const g = rows_(TBL.GUESTS).find(x => x.id === d.id);
      if (!g) throw new Error('Guest not found.');
      patch_(TBL.GUESTS, g._row, data);
      audit_(s.username, 'GUEST_UPDATED', 'Guest', d.id, guestName_(data));
      return d.id;
    }
    data.id = id_('G'); data.stays = 0; data.lastStay = ''; data.createdAt = now;
    append_(TBL.GUESTS, data);
    audit_(s.username, 'GUEST_CREATED', 'Guest', data.id, guestName_(data));
    return data.id;
  });
}

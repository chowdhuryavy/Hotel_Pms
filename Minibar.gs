/* ============================================================
 * Minibar.gs: minibar items with a price and a charge code. Posting an item adds a charge to the guest's folio
 * (with tax if the charge code is taxable), so it appears on the bill like any other charge.
 * ============================================================ */

function listMinibar(token) {
  if (token !== undefined) auth_(token, 'folio.view');
  return rows_(TBL.MINIBAR).map(x => ({ code: x.code, name: x.name, price: num_(x.price), chargeCode: x.chargeCode, active: x.active === true }));
}
function saveMinibarItem(token, d) {
  const s = auth_(token, 'cfg.minibar.edit');
  const code = String(d.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,12}$/.test(code)) throw new Error('Item code: 2 to 12 letters, numbers, - or _.');
  if (!String(d.name || '').trim()) throw new Error('Item name is required.');
  chargeCode_(String(d.chargeCode || ''), CHARGE_TYPE);
  const price = num_(d.price);
  if (price < 0) throw new Error('Price cannot be negative.');
  const data = { code: code, name: String(d.name).trim(), price: price, chargeCode: d.chargeCode, active: d.active !== false && d.active !== 'false' };
  return withLock_(() => {
    const ex = rows_(TBL.MINIBAR).find(x => x.code === code);
    if (ex) patch_(TBL.MINIBAR, ex._row, data); else append_(TBL.MINIBAR, data);
    audit_(s.username, 'MINIBAR_SAVED', 'Minibar', code, data.name + ' ' + price);
    return listMinibar(token);
  });
}
/** Posts one or more of an item to the stay's folio */
function postMinibar(token, resNo, folioId, code, qty, rid) {
  const s = auth_(token, 'folio.post');
  const it = rows_(TBL.MINIBAR).find(x => x.code === code && x.active === true);
  if (!it) throw new Error('Unknown or inactive minibar item: ' + code);
  const n = Math.floor(num_(qty));
  if (!(n >= 1 && n <= 50)) throw new Error('Quantity must be 1 to 50.');
  const r = findRes_(resNo);
  if (r.status !== 'In-House') throw new Error('Minibar charges can only be posted to in-house guests.');
  const f = folioId ? folioRow_(folioId) : rows_(TBL.FOLIOS).find(x => x.resNo === r.resNo && x.status === 'Open');
  if (!f || f.resNo !== r.resNo || f.status !== 'Open') throw new Error('Open a folio for this stay first.');
  const total = Math.round(num_(it.price) * n * 100) / 100;
  if (!(total > 0)) throw new Error('This item has no price. Set a price in Minibar items.');
  postCharge(token, f.id, it.chargeCode, 'Minibar: ' + it.name + ' x' + n, total, rid);
  audit_(s.username, 'MINIBAR_POSTED', 'Reservation', r.resNo, it.code + ' x' + n + ' ' + total);
  return { total: total, qty: n };
}

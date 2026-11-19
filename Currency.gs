/* ============================================================
 * Currency.gs: multi-currency. Each foreign currency has a rate: how many units of the hotel's base currency
 * one unit of it is worth (for example USD 3.64 with base QAR). Folios stay in the base currency. A payment in a
 * foreign currency is converted when it is posted, and the original amount and rate are written on the posting.
 * ============================================================ */

function baseCurrency_() {
  const st = settings_();
  return String(st.currency || st.defaultCurrency || 'QAR').toUpperCase();
}
/** Currencies that can be used at the posting window (active only) */
function listCurrencies(token) {
  if (token !== undefined) auth_(token, 'folio.view');
  return rows_(TBL.CURRENCIES).filter(c => c.active === true).map(c => ({ code: c.code, name: c.name, rate: num_(c.rate) }));
}
/** Every currency, active or not, for the configuration screen */
function listCurrenciesAll(token) {
  auth_(token, 'cfg.currencies.view');
  return { base: baseCurrency_(), currencies: rows_(TBL.CURRENCIES).map(c => ({ code: c.code, name: c.name, rate: num_(c.rate), active: c.active === true })) };
}
function saveCurrency(token, d) {
  const s = auth_(token, 'cfg.currencies.edit');
  const code = String(d.code || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error('Currency code: three letters, for example USD.');
  if (code === baseCurrency_()) throw new Error(code + ' is the hotel\'s base currency. Its rate is always 1.');
  if (!String(d.name || '').trim()) throw new Error('Currency name is required.');
  const rate = num_(d.rate);
  if (!(rate > 0)) throw new Error('Rate must be greater than zero (how much one ' + code + ' is worth in ' + baseCurrency_() + ').');
  const data = { code: code, name: String(d.name).trim(), rate: rate, active: d.active !== false && d.active !== 'false', updatedAt: fmtTs_(new Date()) };
  return withLock_(() => {
    const ex = rows_(TBL.CURRENCIES).find(x => x.code === code);
    if (ex) patch_(TBL.CURRENCIES, ex._row, data); else append_(TBL.CURRENCIES, data);
    audit_(s.username, 'CURRENCY_SAVED', 'Currency', code, rate + ' ' + baseCurrency_());
    return listCurrenciesAll(token);
  });
}
/** A payment in a foreign currency: converted to the base currency at the current rate */
function postPaymentFx(token, folioId, code, currency, foreignAmount, rid) {
  const cur = String(currency || '').trim().toUpperCase();
  const base = baseCurrency_();
  const amt = num_(foreignAmount);
  if (!(amt > 0)) throw new Error('Amount must be greater than zero.');
  if (!cur || cur === base) return postPayment(token, folioId, code, amt, rid);
  const c = rows_(TBL.CURRENCIES).find(x => x.code === cur && x.active === true);
  if (!c) throw new Error('Currency ' + cur + ' is not set up or is not active.');
  const rate = num_(c.rate);
  const baseAmt = Math.round(amt * rate * 100) / 100;
  if (!(baseAmt > 0)) throw new Error('The amount is too small to convert.');
  return postPayment(token, folioId, code, baseAmt, rid, cur + ' ' + amt.toFixed(2) + ' at ' + rate + ' = ' + base + ' ' + baseAmt.toFixed(2));
}

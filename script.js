'use strict';
/* Vales Rebeca. Todo el dinero se maneja en CENTAVOS (enteros) para evitar errores de redondeo. */

const WA_NUMBER = '528441030708'; // México (+52)
const fmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const money = c => fmt.format(c / 100);
const sum = a => a.reduce((x, y) => x + y, 0);

/** "$1,950.50" -> 195050 | null si no es un importe válido */
function toCents(s) {
  s = String(s).replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [a, b = ''] = s.split('.');
  return parseInt(a, 10) * 100 + parseInt((b + '00').slice(0, 2), 10);
}

const NAMES = { bhe: 'B Hermanos · Efectivo', mod: 'Moderna', jr: 'JR', lux: 'Luxor' };

/**
 * REGLAS DE NEGOCIO (proporcionadas por Vales Rebeca; no modificar sin confirmar).
 * - B Hermanos Efectivo: abono posterior = primer abono − $10.
 * - Moderna: abono posterior = (importe − primer abono) / (quincenas − 1). Los centavos
 *   sobrantes se reparten 1 a 1 para que la suma sea exactamente el importe.
 *   (Equivale al método de la imagen "Cálculo del nuevo abono".)
 * - JR: seguro de $30 por compra, solo en el primer abono.
 * - Luxor: seguro de $28–$30 (elige el usuario), solo en el primer recibo.
 * Mercancía de B Hermanos: sin regla confirmada → no se calcula.
 */
function compute(key, v) {
  const n = v.n; let rows, expected, ins = 0;
  if (key === 'bhe') {
    const later = v.pay - 1000;
    if (later <= 0) return { error: ['pay', 'El primer abono debe ser mayor a $10.'] };
    rows = [v.pay, ...Array(n - 1).fill(later)];
    expected = v.pay + (n - 1) * later;
  } else if (key === 'mod') {
    if (v.pay >= v.amount) return { error: ['pay', 'El primer abono debe ser menor al importe de la compra.'] };
    const rem = v.amount - v.pay, q = Math.floor(rem / (n - 1)), r = rem - q * (n - 1);
    rows = [v.pay, ...Array.from({ length: n - 1 }, (_, i) => q + (i < r ? 1 : 0))];
    expected = v.amount;
  } else { // jr / lux: seguro solo en el primer pago
    ins = key === 'jr' ? 3000 : v.ins;
    rows = [v.pay + ins, ...Array(n - 1).fill(v.pay)];
    expected = v.pay * n + ins;
  }
  if (sum(rows) !== expected) return { error: ['pay', 'No pudimos cuadrar el desglose. Revisa tus datos.'] };
  return { rows, ins, total: sum(rows), varies: key === 'mod' && rows[1] !== rows[rows.length - 1] };
}
if (typeof module !== 'undefined') module.exports = { toCents, compute };

if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  const form = $('calc-form'), result = $('result');
  const radio = name => (form.querySelector(`input[name="${name}"]:checked`) || {}).value;
  let last = null;

  const getKey = () => { const s = radio('store'); return s === 'bh' ? radio('mode') : s || null; };
  const setErr = (id, msg) => {
    const e = $(id + '-err'); if (!e) return;
    e.textContent = msg || '';
    const f = $(id); if (f) f.toggleAttribute('aria-invalid', !!msg), f.setAttribute('aria-invalid', msg ? 'true' : 'false');
  };
  const clearErrs = () => ['amount', 'term', 'n', 'ins', 'pay'].forEach(i => setErr(i, ''));

  const TXT = {
    bhe: ['Primer abono', 'El importe de tu primer recibo, como aparece en tu ticket.'],
    mod: ['Primer abono', 'El primer abono que aparece en tu ticket.'],
    jr: ['Abono base (sin el seguro)', 'Tu abono sin los $30 del seguro. Si tu ticket ya los incluye, réstalos.'],
    lux: ['Abono base (sin el seguro)', 'Tu recibo sin el seguro. Si tu ticket ya lo incluye, réstalo.']
  };

  function applyKey() {
    const key = getKey(), store = radio('store');
    $('bh-mode').hidden = store !== 'bh';
    $('fields').hidden = !key || key === 'bhm';
    document.querySelectorAll('[data-show]').forEach(el => {
      const on = key && el.dataset.show.split(' ').includes(key);
      if (el.id === 'pending') el.hidden = !on;
      else { el.hidden = !on; el.querySelectorAll('input').forEach(i => i.disabled = !on); }
    });
    if (TXT[key]) {
      $('pay-lbl').textContent = TXT[key][0]; $('pay-hint').textContent = TXT[key][1];
      $('pay-n').textContent = key === 'lux' ? '5' : '4';
      $('amount-opt').textContent = key === 'mod' ? '' : '(opcional)';
    }
    result.hidden = true; clearErrs();
  }

  function calculate() {
    const key = getKey(); if (!key || key === 'bhm') return;
    clearErrs();
    const errs = [], v = {};
    const a = $('amount').value.trim();
    if (a) { v.amount = toCents(a); if (!v.amount || v.amount <= 0) errs.push(['amount', 'Escribe un importe válido, por ejemplo $5,000.']); }
    else if (key === 'mod') errs.push(['amount', 'Escribe el importe de tu compra.']);
    if (key === 'mod') {
      v.n = parseInt(radio('term'), 10); if (!v.n) errs.push(['term', 'Elige 8 o 12 quincenas.']);
    } else {
      v.n = Number($('n').value);
      if (!Number.isInteger(v.n) || v.n < 2 || v.n > 52) errs.push(['n', 'Escribe un número de quincenas entre 2 y 52.']);
    }
    if (key === 'lux') { v.ins = parseInt(radio('ins'), 10); if (!v.ins) errs.push(['ins', 'Elige el importe del seguro.']); }
    v.pay = toCents($('pay').value);
    if (!v.pay || v.pay <= 0) errs.push(['pay', 'Escribe un importe válido, por ejemplo $750.']);
    if (errs.length) { errs.forEach(([i, m]) => setErr(i, m)); result.hidden = true; ($(errs[0][0]) || form).focus(); return; }

    const r = compute(key, v);
    if (r.error) { setErr(...r.error); result.hidden = true; $(r.error[0]).focus(); return; }
    last = { key, v, r };
    const btn = $('calc-btn'); btn.setAttribute('aria-busy', 'true'); btn.textContent = 'Calculando…';
    setTimeout(() => { btn.removeAttribute('aria-busy'); btn.textContent = 'Calcular mis pagos'; render(); }, 350);
  }

  function render() {
    const { key, v, r } = last, later = r.rows[1];
    const row = (t, d) => `<div><dt>${t}</dt><dd>${d}</dd></div>`;
    const items = r.rows.map((c, i) => `<li class="${i ? '' : 'first'}"><span>Quincena ${i + 1}${i === 0 && r.ins ? `<small>incluye seguro de ${money(r.ins)}</small>` : ''}</span><b>${money(c)}</b></li>`).join('');
    const note = key === 'mod'
      ? 'Este calendario es orientativo: los importes definitivos pueden variar unos pesos entre quincenas, y se compensan a lo largo del plan.'
      : 'Estimación informativa. Confirma los importes con Vales Rebeca.';
    result.innerHTML = `
      <div class="big"><small>Total estimado</small><b>${money(r.total)}</b></div>
      <dl class="sum">
        ${row('Tienda', NAMES[key])}
        ${v.amount ? row('Importe de la compra', money(v.amount)) : ''}
        ${row('Quincenas', v.n)}
        ${row('Primer abono' + (r.ins ? ' (con seguro)' : ''), money(r.rows[0]))}
        ${r.ins ? row('Seguro (solo 1.ª quincena)', money(r.ins)) : ''}
        ${row('Abonos posteriores', (r.varies ? 'aprox. ' : '') + money(later))}
      </dl>
      <ol class="tl">${items}</ol>
      <p class="fine">${note}</p>
      <div class="actions"><button class="btn" type="button" id="recalc">Recalcular</button><button class="btn ghost" type="button" id="share">Compartir por WhatsApp</button></div>`;
    result.hidden = false; result.focus({ preventScroll: true });
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('recalc').onclick = calculate;
    $('share').onclick = () => {
      const t = `Simulación Vales Rebeca (estimación)\nTienda: ${NAMES[key]}\n` + (v.amount ? `Importe: ${money(v.amount)}\n` : '') +
        `Quincenas: ${v.n}\n` + r.rows.map((c, i) => `Quincena ${i + 1}: ${money(c)}${i === 0 && r.ins ? ' (incluye seguro)' : ''}`).join('\n') +
        `\nTotal estimado: ${money(r.total)}\nLos importes definitivos pueden variar.`;
      window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank', 'noopener');
    };
  }

  // Formato monetario al salir del campo
  const moneyField = el => el.addEventListener('blur', () => { const c = toCents(el.value); if (c) el.value = fmt.format(c / 100); });
  ['amount', 'pay', 'want'].forEach(i => moneyField($(i)));

  form.addEventListener('change', e => { if (e.target.name === 'store' || e.target.name === 'mode') applyKey(); });
  form.addEventListener('submit', e => { e.preventDefault(); calculate(); });
  form.addEventListener('reset', () => setTimeout(() => { applyKey(); $('amount-opt').textContent = ''; }, 0));

  // Solicitud de vale nuevo (abre WhatsApp; el cliente confirma el envío en su app)
  const shop = $('shop'), other = $('shop-other'), req = $('req-form'), st = $('req-status');
  shop.addEventListener('change', () => { other.hidden = shop.value !== 'otra'; if (!other.hidden) other.focus(); });
  req.addEventListener('submit', e => {
    e.preventDefault();
    const name = shop.value === 'otra' ? other.value.trim() : shop.value, amt = toCents($('want').value);
    setErr('shop', !name ? 'Elige o escribe la tienda que te interesa.' : '');
    setErr('want', !amt || amt <= 0 ? 'Escribe una cantidad válida, por ejemplo $3,000.' : '');
    if (!name || !amt) return;
    const text = `Hola, Vales Rebeca. Me interesa solicitar un vale nuevo.\n\nTienda deseada: ${name}\nCantidad aproximada: ${money(amt)}\n\nMe gustaría recibir más información. ¡Gracias!`;
    const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener');
    st.hidden = false;
    st.innerHTML = `Abrimos WhatsApp con tu mensaje listo. <strong>Tu solicitud aún no se ha enviado:</strong> toca “Enviar” en WhatsApp para completarla. ¿No se abrió? <a href="${url}" target="_blank" rel="noopener">Toca aquí</a>.`;
  });

  // Lightbox
  const lb = $('lightbox');
  document.querySelectorAll('.thumb').forEach(b => b.addEventListener('click', () => {
    $('lb-img').src = b.dataset.full; $('lb-img').alt = b.dataset.alt; lb.showModal();
  }));
  $('lb-close').onclick = () => lb.close();
  lb.addEventListener('click', e => { if (e.target === lb) lb.close(); });
}

// Модуль compare.js: таблица «места рядом». По строкам: три проверки (Энергия, Связь, Соседи) и главные числа,
// по столбцам: 2–3 места. Лучшее значение в каждой строке выделено (рамкой и словом «best», не только цветом).
// buildComparison — чистая функция (её проверяют тесты), createCompare — панель на странице.
import { buildReport, STATUS } from './report-logic.js';
import { assessNeighbors } from './safety.js';
import { horizonFor } from './horizon.js';
import { fmtHours, fmtDistance, fmtUtc } from './format.js';
import { addFold } from './panel-fold.js';
import { SLOT_COLORS } from './slot-colors.js';

const RANK = { green: 0, yellow: 1, red: 2, unknown: 3 };
const SLOTS = ['A', 'B', 'C'];
const SAME_PLACE_DEG = 0.3;

function distDeg(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
            Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(a)))) / r;
}

export function placeLabel(lat, lon, sites = []) {
  let best = null;
  for (const s of sites) {
    const d = distDeg(lat, lon, s.lat, s.lon);
    if (d <= SAME_PLACE_DEG && (best === null || d < best.d)) best = { s, d };
  }
  if (best) return best.s.name;
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
}

// Какие индексы «лучшие»: меньше/больше значение. Если все равны или значений меньше двух — никто не выделяется.
function bestIndexes(values, better) {
  const known = values.map((v, i) => ({ v, i })).filter(x => Number.isFinite(x.v));
  if (known.length < 2) return [];
  const target = better === 'high' ? Math.max(...known.map(x => x.v)) : Math.min(...known.map(x => x.v));
  if (known.every(x => x.v === target)) return [];
  return known.filter(x => x.v === target).map(x => x.i);
}

// ctx: { eph, sites, th, horizons }; places: [{lat, lon, label?}]; opts: { ms, accuracyM }
// Вернёт { columns: [{label, report}], rows: [{label, kind, cells: [{text, status?, value}], best: [index]}] }
export function buildComparison(ctx, places, { ms, accuracyM }) {
  const reports = places.map(p => buildReport(ctx, p.lat, p.lon, { ms, accuracyM }));
  const nearest = places.map(p => {
    const mask = horizonFor(ctx.horizons, p.lat, p.lon);
    return assessNeighbors(p.lat, p.lon, ctx.sites, accuracyM, ctx.th.neighbors, mask).nearest;
  });
  const en = reports.map(r => r.summary.energy);
  const co = reports.map(r => r.summary.communication);

  const statusRow = (label, pick) => {
    const statuses = reports.map(pick);
    return {
      label, kind: 'status',
      cells: statuses.map(s => ({ status: s, text: `${STATUS[s].icon} ${STATUS[s].word}`, value: RANK[s] })),
      best: bestIndexes(statuses.map(s => (s === 'unknown' ? NaN : RANK[s])), 'low'),
    };
  };
  const numRow = (label, values, fmt, better) => ({
    label, kind: 'number',
    cells: values.map(v => ({ text: Number.isFinite(v) ? fmt(v) : '–', value: v })),
    best: bestIndexes(values, better),
  });
  const pct = v => `${Math.round(v)}%`;
  const num = (arr, key) => arr.map(x => (x ? x[key] : NaN));

  const rows = [
    statusRow('Overall', r => r.overall),
    statusRow('Energy', r => r.blocks[0].status),
    numRow('Sun above limit', num(en, 'daylightPct'), pct, 'high'),
    numRow('Longest night', num(en, 'longestNightHours'), fmtHours, 'low'),
    statusRow('Communication', r => r.blocks[1].status),
    numRow('Earth in view', num(co, 'earthVisiblePct'), pct, 'high'),
    numRow('Longest break without Earth', num(co, 'longestEarthGapHours'), fmtHours, 'low'),
    statusRow('Neighbors', r => r.blocks[2].status),
    numRow('Nearest site', nearest.map(n => (n ? n.distanceKm : NaN)), fmtDistance, 'high'),
  ];
  const columns = places.map((p, i) => ({
    label: p.label ?? placeLabel(p.lat, p.lon, ctx.sites),
    nearestName: nearest[i]?.site.name ?? null,
    report: reports[i],
  }));
  return { columns, rows };
}

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// Панель на странице. setSlot('A'|'B'|'C', lat, lon) добавляет место, setTime(ms) и setAccuracy(m) пересчитывают.
// onSlotChange(slot, place | null) — сообщает, что место A/B/C поставили или убрали (main.js рисует метку на Луне)
export function createCompare({ eph, sites, th, horizons = null, accuracyM, onSlotChange }) {
  const el = make('div', 'compare');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Compare places');
  const head = make('div', 'compare-head');
  head.appendChild(make('h3', '', 'Compare places'));
  const closeBtn = make('button', 'compare-close', '×');
  closeBtn.setAttribute('aria-label', 'Close comparison');
  head.appendChild(closeBtn);
  const table = make('table');
  const foot = make('div', 'compare-note');
  el.appendChild(head);
  addFold(el, head, [], { before: closeBtn });   // «−» / «+» перед крестиком
  el.append(table, foot);
  document.body.appendChild(el);

  const slots = { A: null, B: null, C: null };
  let ms = eph ? eph.startMs : NaN;
  let acc = accuracyM ?? th.neighbors.default_accuracy_1sigma_m;
  let dismissed = false;

  function render() {
    const used = SLOTS.filter(s => slots[s]);
    el.classList.toggle('open', used.length > 0 && !dismissed);
    if (!used.length) return;
    table.replaceChildren();

    const cmp = used.length ? buildComparison({ eph, sites, th, horizons }, used.map(s => slots[s]), { ms, accuracyM: acc }) : null;
    const thead = make('tr');
    thead.appendChild(make('th', '', Number.isFinite(ms) ? fmtUtc(ms).slice(5) : ''));
    used.forEach((s, i) => {
      const th_ = make('th');
      const color = SLOT_COLORS[s].css;
      th_.style.borderTop = `4px solid ${color}`;   // цвет места, как на Луне
      const slotLabel = make('div', 'slot');
      const dot = make('span', 'slot-dot');
      dot.style.background = color;
      slotLabel.append(dot, document.createTextNode(`${s}: ${cmp.columns[i].label}`));
      th_.appendChild(slotLabel);
      const clear = make('button', 'clear', 'remove');
      clear.setAttribute('aria-label', `Remove place ${s}`);
      clear.addEventListener('click', () => { slots[s] = null; onSlotChange?.(s, null); render(); });
      th_.appendChild(clear);
      thead.appendChild(th_);
    });
    table.appendChild(thead);

    for (const row of cmp.rows) {
      const tr = make('tr', row.kind === 'status' ? 'status-row' : '');
      tr.appendChild(make('th', '', row.label));
      row.cells.forEach((cell, i) => {
        const td = make('td', row.best.includes(i) ? 'best' : '', cell.text);
        if (cell.status) td.style.color = STATUS[cell.status].color;
        if (row.best.includes(i)) {
          td.appendChild(make('span', 'best-tag', ' best'));
          td.title = 'Best value in this row';
        }
        tr.appendChild(td);
      });
      table.appendChild(tr);
    }
    const terrain = cmp.columns.some(c => c.report.terrain);
    foot.textContent = `Next ${th.energy.window_days} days from the chosen time, landing accuracy ${acc} m (1σ). ` +
      (terrain ? 'Terrain horizon used where available.' : 'Flat horizon, no terrain.') +
      ' "Best" is only the better number in that row, not a safety guarantee. Use "Set as A / B / C" in the Sun & Earth panel to add places.';
  }
  closeBtn.addEventListener('click', () => { dismissed = true; render(); });

  return {
    setSlot(slot, lat, lon) {
      slots[slot] = { lat, lon, label: placeLabel(lat, lon, sites) };
      onSlotChange?.(slot, slots[slot]);
      dismissed = false;
      render();
    },
    setTime(newMs) { ms = newMs; render(); },
    setAccuracy(m) { acc = m; render(); },
  };
}

// Модуль 8: карточка отчёта «Landing report» (слева) с параметрами миссии и тремя блоками:
// Energy (солнце), Communication (Земля), Neighbours (соседи). Итоговый цвет — по худшему блоку.
// Всё создаётся кодом. Время приходит из панели времени (setTime), точка — по клику (show).
import { summarize } from './astro.js';
import { findHorizon, summarizeTerrain } from './horizon.js';
import { LEVELS, rateEnergy, rateComm, rateNeighbours, overallLevel } from './rules.js';
import { fmtHours } from './format.js';

const DAYS = 30;

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// Значок + слово + цвет: «✓ Good»
function badge(level) {
  const info = LEVELS[level];
  const b = make('span', 'badge', info ? `${info.icon} ${info.word}` : '– No data');
  b.style.background = info ? info.color : '#4a5568';
  return b;
}

export function createReportCard({ eph, sites, horizons, thresholds }) {
  const style = document.createElement('style');
  style.textContent = `
    .report-card {
      position: fixed; top: 76px; left: 16px; z-index: 21;
      width: 320px; max-width: calc(100vw - 32px); max-height: calc(100vh - 92px); overflow: auto;
      box-sizing: border-box; padding: 12px 14px;
      background: rgba(10, 14, 22, 0.92); color: #e8edf5;
      border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 12px;
      font: 13px/1.45 system-ui, sans-serif;
    }
    .report-card h3 { margin: 0 0 8px; font-size: 15px; }
    .report-card .params { display: grid; grid-template-columns: auto 1fr; gap: 6px 10px; align-items: center;
      padding-bottom: 10px; margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,.12); }
    .report-card .params label { color: #9fb0c8; }
    .report-card input, .report-card select, .report-card button {
      font: inherit; color: #e8edf5; background: #1d2740;
      border: 1px solid rgba(255,255,255,.25); border-radius: 6px; padding: 3px 8px; }
    .report-card input { width: 90px; }
    .report-card .hint { color: #9fb0c8; }
    .report-card .overall { display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 8px; font-weight: 600; font-size: 14px; }
    .report-card .badge { color: #0a0e16; font-weight: 700; border-radius: 999px; padding: 1px 10px; white-space: nowrap; }
    .report-card .block { padding: 8px 0; border-top: 1px solid rgba(255,255,255,.08); }
    .report-card .block .head { display: flex; justify-content: space-between; align-items: center; font-weight: 600; }
    .report-card .block .what { color: #7f8fa6; font-size: 11px; }
    .report-card .block .text { margin-top: 3px; }
    .report-card .how { margin-top: 8px; cursor: pointer; }
    .report-dialog { max-width: 520px; background: #0f1522; color: #e8edf5;
      border: 1px solid rgba(255,255,255,.25); border-radius: 12px; font: 14px/1.5 system-ui, sans-serif; }
    .report-dialog::backdrop { background: rgba(0,0,0,.6); }
    .report-dialog h3 { margin-top: 0; }
    .report-dialog li { margin-bottom: 6px; }
    .report-dialog a { color: #7aa2ff; }
    .report-dialog button { font: inherit; padding: 4px 14px; cursor: pointer; }
  `;
  document.head.appendChild(style);

  // --- Разметка ---
  const el = make('div', 'report-card');
  el.appendChild(make('h3', '', 'Landing report'));

  // Параметры миссии (дата — в панели времени сверху)
  const params = make('div', 'params');
  const precisionLabel = make('label', '', 'Landing precision, m');
  const precision = make('input');
  precision.type = 'number'; precision.min = '10'; precision.max = '10000'; precision.step = '10';
  precision.value = '100';
  precision.id = 'param-precision';
  precisionLabel.htmlFor = precision.id;
  const classLabel = make('label', '', 'Lander class');
  const lander = make('select');
  lander.id = 'param-class';
  classLabel.htmlFor = lander.id;
  for (const [value, text] of [['small', 'Small (CLPS-size)'], ['medium', 'Medium'], ['large', 'Large (crewed)']]) {
    const o = make('option', '', text);
    o.value = value;
    lander.appendChild(o);
  }
  params.append(precisionLabel, precision, classLabel, lander);
  el.appendChild(params);

  const body = make('div');
  body.appendChild(make('p', 'hint', 'Click a point on the Moon to get a report. Hover to preview the colour.'));
  el.appendChild(body);

  const how = make('button', 'how', 'How is this calculated?');
  el.appendChild(how);
  document.body.appendChild(el);

  // --- «Как считается»: текст берём из thresholds.json, чтобы он всегда совпадал с правилами ---
  const dialog = make('dialog', 'report-dialog');
  const e = thresholds.energy, c = thresholds.comm, n = thresholds.neighbours;
  dialog.innerHTML = `
    <h3>How the colours are calculated</h3>
    <ul>
      <li><b>Energy</b> — ${e.label}. ✓ Good from ${e.good_min} %, ! Caution from ${e.caution_min} %, ✕ Risky below.</li>
      <li><b>Communication</b> — ${c.label}. ✓ Good from ${c.good_min} %, ! Caution from ${c.caution_min} %, ✕ Risky below.</li>
      <li><b>Neighbours</b> — keep-out zone around existing hardware: ${n.keepout_km.heritage} km around lander sites,
        ${n.keepout_km.impact} km around impact sites, multiplied by the lander class
        (small ×${n.class_factor.small}, medium ×${n.class_factor.medium}, large ×${n.class_factor.large}).
        The landing precision is subtracted from the distance (worst case). ✕ Risky inside the zone,
        ! Caution closer than ${n.caution_factor}× the zone, ✓ Good otherwise.</li>
      <li><b>Overall</b> — the worst of the three.</li>
      <li>Sun and Earth: hourly positions from JPL DE421 (Skyfield), centre of the disc. Near the south pole,
        where a LOLA horizon mask exists, mountains are taken into account; elsewhere the horizon is flat.</li>
    </ul>
    <p>${thresholds.about ?? ''}</p>
    <p><a href="${n.source}" target="_blank" rel="noopener noreferrer">NASA recommendations (2011)</a></p>
    <form method="dialog"><button>Close</button></form>`;
  document.body.appendChild(dialog);
  how.addEventListener('click', () => dialog.showModal());

  // --- Состояние ---
  let lat = null;
  let lon = null;
  let ms = eph.startMs;

  function readParams() {
    const p = Number(precision.value);
    return { precisionM: Number.isFinite(p) && p >= 0 ? p : 100, landerClass: lander.value };
  }

  // Главный расчёт. stepMin=60 — полный отчёт, 180 — быстрый (для наведения мыши)
  function assess(pLat, pLon, stepMin) {
    const { precisionM, landerClass } = readParams();
    const flat = summarize(eph, pLat, pLon, ms, DAYS, stepMin);
    const place = findHorizon(horizons, pLat, pLon);
    const terrain = place && flat ? summarizeTerrain(eph, place, ms, DAYS, stepMin) : null;
    const sunPct = terrain ? terrain.sunTerrainPct : flat?.daylightPct ?? null;
    const earthPct = terrain ? terrain.earthTerrainPct : flat?.earthVisiblePct ?? null;
    const nb = rateNeighbours(pLat, pLon, sites, precisionM, landerClass, thresholds);
    const energy = rateEnergy(sunPct, thresholds);
    const comm = rateComm(earthPct, thresholds);
    return { flat, place, sunPct, earthPct, nb, energy, comm,
             overall: overallLevel([energy, comm, nb.level]), precisionM, landerClass };
  }

  function block(title, what, level, text) {
    const b = make('div', 'block');
    const head = make('div', 'head');
    head.append(make('span', '', title), badge(level));
    b.append(head, make('div', 'what', what), make('div', 'text', text));
    return b;
  }

  function render() {
    if (lat === null) return;
    const r = assess(lat, lon, 60);
    body.replaceChildren();

    const overall = make('div', 'overall');
    overall.append(make('span', '', 'Overall'), badge(r.overall));
    body.appendChild(overall);

    const horizonText = r.place
      ? `with terrain (LOLA horizon of ${r.place.name})`
      : 'flat horizon, no terrain data — may be optimistic near the poles';
    const pct = v => `${v.toFixed(0)} %`;

    body.appendChild(block('⚡ Energy', 'Will solar panels get sunlight?', r.energy,
      r.sunPct === null ? 'No Sun data for this time.'
        : `Sunlit ${pct(r.sunPct)} of the next ${DAYS} days, ${horizonText}.` +
          (r.flat && !r.place ? ` Longest night: ${fmtHours(r.flat.longestNightHours)}.` : '')));

    body.appendChild(block('📡 Communication', 'Can the lander see Earth for a direct radio link?', r.comm,
      r.earthPct === null ? 'No Earth data for this time.'
        : `Earth above the horizon ${pct(r.earthPct)} of the next ${DAYS} days, ${horizonText}.` +
          (r.flat && !r.place ? ` Longest gap: ${fmtHours(r.flat.longestEarthGapHours)}.` : '')));

    const w = r.nb.worst ?? r.nb.nearest;
    const nbText = w
      ? `${r.nb.worst ? '' : 'Nearest: '}${w.site.name} is ${w.km.toFixed(1)} km away ` +
        `(${(r.precisionM / 1000).toFixed(2)} km precision taken off). Keep-out for a ${r.landerClass} lander: ` +
        `${w.zoneKm.toFixed(1)} km.`
      : 'No protected sites in the list.';
    body.appendChild(block('🏛 Neighbours', 'Is historic or active hardware too close?', r.nb.level, nbText));
  }

  precision.addEventListener('input', render);
  lander.addEventListener('change', render);

  return {
    show(newLat, newLon) { lat = newLat; lon = newLon; render(); },
    setTime(newMs) { ms = newMs; render(); },
    // Быстрая оценка для наведения мыши: только итоговый уровень
    preview(pLat, pLon) { return assess(pLat, pLon, 180).overall; },
  };
}

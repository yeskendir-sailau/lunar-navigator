// Модуль pdf-report.js: отчёт о месте посадки для печати / «Сохранить как PDF».
// Не зависит от three.js. buildReportHtml(...) собирает готовую HTML-страницу (шапка, вердикт, карта точек, три проверки,
// график Солнца и Земли, таблица соседей, сравнение мест, методика, источники); openPdfReport(...) открывает её в новом окне
// и вызывает печать: в окне печати выберите «Сохранить как PDF». Графики рисуются как SVG, поэтому в PDF они чёткие.
import { buildReport, STATUS } from './report-logic.js';
import { assessNeighbors } from './safety.js';
import { buildComparison, placeLabel } from './compare.js';
import { horizonFor } from './horizon.js';
import { elevationSeries, nextCrossing } from './astro.js';
import { fmtUtc, fmtDuration, fmtHours, fmtDistance, fmtDeg } from './format.js';

const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Цвета для печати (светлая бумага): текстовые варианты темнее, чтобы читались на белом
const PRINT = {
  green:   { fill: '#2ecc71', text: '#17803f', soft: '#e7f7ee' },
  yellow:  { fill: '#f1c40f', text: '#7a5c00', soft: '#fdf5d8' },
  red:     { fill: '#e74c3c', text: '#b8321f', soft: '#fdeae7' },
  unknown: { fill: '#9fb0c8', text: '#566174', soft: '#eef1f5' },
};
const SUN_C = '#d98200';
const EARTH_C = '#2f5fd0';
const PLACE_STYLE = [   // A, B, C: цвет и штрих (не только цвет, чтобы различать на чёрно-белой печати)
  { color: '#0b6a8f', dash: '', mark: 'A' },
  { color: '#8a3ffc', dash: '7 4', mark: 'B' },
  { color: '#c2410c', dash: '2 4', mark: 'C' },
];

const fmtCoord = (lat, lon) => `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? 'E' : 'W'}`;
const fmtAcc = m => (m >= 1000 ? `${m / 1000} km` : `${m} m`);

// ---------- Картинки (SVG) ----------

// График высоты тел над горизонтом. lines: [{ name, color, dash, values }], timesMs общие
function chartSvg({ timesMs, lines, hLines = [], width = 720, height = 230, yMin = -90, yMax = 90 }) {
  const padL = 42, padR = 10, padT = 10, padB = 26;
  const n = timesMs.length;
  if (n < 2) return '<p class="muted">No data for this period.</p>';
  const t0 = timesMs[0];
  const t1 = timesMs[n - 1];
  const x = t => padL + ((t - t0) / (t1 - t0)) * (width - padL - padR);
  const y = v => padT + ((yMax - v) / (yMax - yMin)) * (height - padT - padB);
  let svg = `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica, Arial, sans-serif">`;
  svg += `<rect x="${padL}" y="${padT}" width="${width - padL - padR}" height="${height - padT - padB}" fill="#f7f8fa" stroke="#d5dae2"/>`;
  for (const v of [-90, -45, 0, 45, 90]) {
    svg += `<line x1="${padL}" x2="${width - padR}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? '#7b8797' : '#e1e5eb'}" stroke-width="${v === 0 ? 1.2 : 1}"/>`;
    svg += `<text x="${padL - 6}" y="${y(v) + 3.5}" font-size="10" fill="#566174" text-anchor="end">${v}°</text>`;
  }
  const days = Math.max(1, Math.round((t1 - t0) / 86400e3));
  const stepDays = days > 20 ? 5 : days > 10 ? 2 : 1;
  for (let d = 0; d <= days; d += stepDays) {
    const t = t0 + d * 86400e3;
    if (t > t1 + 1) break;
    svg += `<line x1="${x(t)}" x2="${x(t)}" y1="${padT}" y2="${height - padB}" stroke="#eceff3"/>`;
    svg += `<text x="${x(t)}" y="${height - padB + 14}" font-size="10" fill="#566174" text-anchor="middle">${fmtUtc(t).slice(5, 10)}</text>`;
  }
  for (const h of hLines) {
    svg += `<line x1="${padL}" x2="${width - padR}" y1="${y(h.value)}" y2="${y(h.value)}" stroke="${h.color}" stroke-dasharray="3 3" stroke-width="1"/>`;
    svg += `<text x="${width - padR - 3}" y="${y(h.value) - 3}" font-size="9" fill="${h.color}" text-anchor="end">${esc(h.label)}</text>`;
  }
  for (const line of lines) {
    let d = '';
    let pen = false;
    line.values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(timesMs[i]).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
    });
    svg += `<path d="${d}" fill="none" stroke="${line.color}" stroke-width="2" ${line.dash ? `stroke-dasharray="${line.dash}"` : ''} stroke-linejoin="round"/>`;
  }
  return svg + '</svg>';
}

function legendHtml(items) {
  return `<div class="legend">${items.map(i =>
    `<span><svg width="30" height="10"><line x1="0" x2="30" y1="5" y2="5" stroke="${i.color}" stroke-width="2.4" ${i.dash ? `stroke-dasharray="${i.dash}"` : ''}/></svg> ${esc(i.name)}</span>`).join('')}</div>`;
}

// Карта: вся поверхность в проекции «широта-долгота», места из списка точками, выбранные точки крупно
function mapSvg(sites, markers) {
  const W = 720, H = 300, padL = 30, padR = 8, padT = 8, padB = 22;
  const x = lon => padL + ((lon + 180) / 360) * (W - padL - padR);
  const y = lat => padT + ((90 - lat) / 180) * (H - padT - padB);
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica, Arial, sans-serif">`;
  svg += `<rect x="${padL}" y="${padT}" width="${W - padL - padR}" height="${H - padT - padB}" fill="#e9ecf0" stroke="#c9d0da"/>`;
  svg += `<rect x="${x(-90)}" y="${padT}" width="${x(90) - x(-90)}" height="${H - padT - padB}" fill="#f6f7f9"/>`;
  svg += `<text x="${x(0)}" y="${padT + 11}" font-size="9" fill="#7b8797" text-anchor="middle">NEAR SIDE (faces Earth)</text>`;
  svg += `<text x="${x(-135)}" y="${padT + 11}" font-size="9" fill="#7b8797" text-anchor="middle">FAR SIDE</text>`;
  svg += `<text x="${x(135)}" y="${padT + 11}" font-size="9" fill="#7b8797" text-anchor="middle">FAR SIDE</text>`;
  for (let lon = -180; lon <= 180; lon += 30) {
    svg += `<line x1="${x(lon)}" x2="${x(lon)}" y1="${padT}" y2="${H - padB}" stroke="#d9dee6"/>`;
    svg += `<text x="${x(lon)}" y="${H - padB + 13}" font-size="9" fill="#566174" text-anchor="middle">${lon}°</text>`;
  }
  for (let lat = -90; lat <= 90; lat += 30) {
    svg += `<line x1="${padL}" x2="${W - padR}" y1="${y(lat)}" y2="${y(lat)}" stroke="${lat === 0 ? '#aeb7c4' : '#d9dee6'}"/>`;
    svg += `<text x="${padL - 4}" y="${y(lat) + 3}" font-size="9" fill="#566174" text-anchor="end">${lat}°</text>`;
  }
  for (const s of sites) {
    svg += `<circle cx="${x(s.lon).toFixed(1)}" cy="${y(s.lat).toFixed(1)}" r="2.6" fill="${s.type === 'impact' ? '#7b8797' : '#0b6a8f'}" opacity="0.75"/>`;
  }
  for (const m of markers) {
    const cx = x(m.lon).toFixed(1);
    const cy = y(m.lat).toFixed(1);
    svg += `<circle cx="${cx}" cy="${cy}" r="9" fill="#fff" stroke="${m.color}" stroke-width="3"/>`;
    svg += `<text x="${cx}" y="${(+cy + 4).toFixed(1)}" font-size="11" font-weight="700" fill="${m.color}" text-anchor="middle">${esc(m.mark)}</text>`;
  }
  return svg + '</svg>';
}

// ---------- Данные одного места ----------

function placeData(ctx, place, { ms, accuracyM }) {
  const { eph, sites, th, horizons } = ctx;
  const mask = horizonFor(horizons, place.lat, place.lon);
  const report = buildReport(ctx, place.lat, place.lon, { ms, accuracyM });
  const days = th.energy.window_days;
  const series = eph && Number.isFinite(ms) ? elevationSeries(eph, place.lat, place.lon, ms, days * 24, 120) : null;
  const events = eph && Number.isFinite(ms) ? {
    sun: nextCrossing(eph, 'sun', place.lat, place.lon, ms, undefined, undefined, mask),
    earth: nextCrossing(eph, 'earth', place.lat, place.lon, ms, undefined, undefined, mask),
  } : null;
  const nb = assessNeighbors(place.lat, place.lon, sites, accuracyM, th.neighbors, mask);
  return { place, mask, report, series, events, nb, label: place.label ?? placeLabel(place.lat, place.lon, sites) };
}

// ---------- Куски страницы ----------

const badge = status => `<span class="badge" style="background:${PRINT[status].fill}">${STATUS[status].icon}</span>`;
const statusWord = status => `<b style="color:${PRINT[status].text}">${STATUS[status].icon} ${STATUS[status].word}</b>`;

function verdictHtml(d) {
  const r = d.report;
  const c = PRINT[r.overall];
  return `<div class="verdict" style="background:${c.soft};border-color:${c.fill}">
    <div class="bigbadge" style="background:${c.fill}">${STATUS[r.overall].icon}</div>
    <div><div class="vword" style="color:${c.text}">${STATUS[r.overall].word}</div><div>${esc(r.verdict)}</div>
    <div class="muted">${esc(d.label)} · ${esc(fmtCoord(d.place.lat, d.place.lon))}</div></div></div>`;
}

function blocksHtml(d) {
  return d.report.blocks.map(b => {
    const c = PRINT[b.status];
    const items = [...b.details, ...(b.status !== 'green' && b.status !== 'unknown' && b.title !== 'Neighbors' ? b.reasons.map(r => `Why not green: ${r}`) : [])];
    return `<div class="block" style="border-color:${c.fill}">
      <div class="bt">${badge(b.status)} <b>${esc(b.title)}</b> <span class="bw" style="color:${c.text}">${STATUS[b.status].word}</span></div>
      <div>${esc(b.headline)}</div>
      ${items.length ? `<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
      ${b.note ? `<div class="muted small">${esc(b.note)}</div>` : ''}
    </div>`;
  }).join('');
}

function eventsHtml(d, ms) {
  if (!d.events) return '';
  const row = (label, c, riseWord, setWord) => `<tr><td>${label}</td><td>${c
    ? `${c.rising ? riseWord : setWord} in ${esc(fmtDuration(c.timeMs - ms))}</td><td>${esc(fmtUtc(c.timeMs))}`
    : 'none within the next 31 days</td><td>–'}</td></tr>`;
  return `<table class="t"><thead><tr><th>Event</th><th>Next change</th><th>When (UTC)</th></tr></thead><tbody>
    ${row('Sun', d.events.sun, 'sunrise', 'sunset')}${row('Earth (link to Earth)', d.events.earth, 'Earthrise', 'Earthset')}</tbody></table>`;
}

const ZONE_WORD = { 'keep-out': 'Inside keep-out zone', gravel: 'Gravel range', dust: 'Dust, if in line of sight', clear: 'Clear' };
function neighborsTable(d, limit = 6) {
  const rows = d.nb.neighbors.slice(0, limit).map(n => `<tr>
    <td>${esc(n.site.name)}</td><td>${esc(n.site.type)}</td><td>${esc(fmtDistance(n.distanceKm))}</td><td>${esc(fmtDistance(n.keepOutKm))}</td>
    <td>${statusWord(n.status)} <span class="muted">${esc(ZONE_WORD[n.zone])}${n.shielded ? ', shielded by terrain (approx.)' : ''}</span></td></tr>`).join('');
  return `<table class="t"><thead><tr><th>Nearest sites</th><th>Type</th><th>Distance</th><th>Keep-out</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function methodHtml(th, accuracyM, terrain) {
  const e = th.energy, c = th.communication, n = th.neighbors;
  return `<h2>How it was calculated</h2>
  <ul class="tight">
    <li><b>Energy</b> (our own thresholds): looks ${e.window_days} days ahead; the Sun counts only above ${e.sun_min_elevation_deg}° elevation. Green: sunlit ≥ ${e.daylight_pct.green_min}% and longest night ≤ ${fmtHours(e.longest_night_hours.green_max)}. Yellow: ≥ ${e.daylight_pct.yellow_min}% and ≤ ${fmtHours(e.longest_night_hours.yellow_max)}. Otherwise red.</li>
    <li><b>Communication</b> (our own thresholds): looks ${c.window_days} days ahead; Earth counts when above the horizon. Green: in view ≥ ${c.earth_visible_pct.green_min}% and longest break ≤ ${fmtHours(c.longest_gap_hours.green_max)}. Yellow: ≥ ${c.earth_visible_pct.yellow_min}% and ≤ ${fmtHours(c.longest_gap_hours.yellow_max)}. Otherwise red.</li>
    <li><b>Neighbors</b> (NASA 2011 recommendations, non-binding, written for US artifacts; we apply them to every site as a precaution): keep at least ${n.keep_out_km.heritage} km from lander sites and ${n.keep_out_km.impact} km from impact sites, or ${n.sigma_multiple}σ of the landing accuracy (now ${esc(fmtAcc(accuracyM))} 1σ), whichever is larger. Rocks from a landing reached up to ${n.gravel_km} km. Dust has no NASA distance: sites within ${n.dust_line_of_sight_km} km (twice the 1.8 km horizon) are flagged "if in line of sight".</li>
    <li><b>Overall colour</b> is the worst of the three checks. Every colour is repeated with an icon and a word.</li>
  </ul>
  <h2>Limitations</h2>
  <ul class="tight">
    <li>${terrain ? 'A terrain horizon was used for this place; terrain shielding of neighbours is a rough approximation and never reduces the NASA keep-out distance.' : '<b>Flat horizon:</b> no terrain data was used, so mountains, crater walls and long polar shadows are not counted. Near the poles the result can be too optimistic.'}</li>
    <li>Sun and Earth are treated as points (disc centre); the Moon has no atmosphere, so there is no refraction.</li>
    <li>The green / yellow / red limits for Energy and Communication are the team's own choices, not a standard.</li>
    <li>This report is not for real mission planning.</li>
  </ul>
  <h2>Sources</h2>
  <p class="small">Sun and Earth positions: NASA/JPL ephemeris DE421 (hourly file). Sites: NASA NSSDC lists of lunar sites and artifact impacts. Neighbour rules: NASA, <i>Recommendations to Space-Faring Entities: How to Protect and Preserve the Historic and Scientific Value of U.S. Government Lunar Artifacts</i> (2011, Rev. A). Terrain (when present): LOLA, Barker et al. (2023). Code and text prepared with the help of AI (Claude, Anthropic); numbers come from the sources above.</p>`;
}

// ---------- Страница ----------

const CSS = `
  @page { size: A4; margin: 12mm 13mm 16mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; background: #e9ecf0; color: #1c222c; font: 12px/1.5 Helvetica, Arial, sans-serif; }
  .sheet { max-width: 800px; margin: 0 auto; background: #fff; padding: 0 0 18px; }
  .banner { background: linear-gradient(120deg, #0b1020, #1d2a4a); color: #fff; padding: 18px 24px 16px; margin: 14px 24px 0; border-radius: 12px; }
  .banner .brand { letter-spacing: .14em; font-size: 10px; color: #8fd3f4; text-transform: uppercase; }
  .banner h1 { margin: 4px 0 6px; font-size: 24px; line-height: 1.2; }
  .banner .meta { color: #c4cfe0; font-size: 11.5px; }
  .content { padding: 4px 24px; }
  h2 { font-size: 14px; margin: 18px 0 6px; padding-bottom: 3px; border-bottom: 2px solid #46b4de; color: #0b6a8f; break-after: avoid; }
  h3 { font-size: 13px; margin: 10px 0 4px; }
  .muted { color: #566174; } .small { font-size: 10.5px; }
  .verdict { display: flex; gap: 14px; align-items: center; border: 2px solid; border-radius: 12px; padding: 12px 16px; margin-top: 12px; break-inside: avoid; }
  .bigbadge { flex: none; width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; font-size: 28px; font-weight: 700; color: #0b0f17; }
  .vword { font-size: 20px; font-weight: 700; }
  .badge { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; font-size: 12px; font-weight: 700; color: #0b0f17; vertical-align: middle; }
  .blocks { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 8px; }
  .block { border-left: 5px solid; background: #f7f8fa; border-radius: 6px; padding: 7px 10px; break-inside: avoid; }
  .block .bt { font-size: 13px; margin-bottom: 2px; } .block .bw { float: right; font-weight: 700; font-size: 11px; }
  .block ul { margin: 4px 0 0; padding-left: 15px; color: #323b49; font-size: 11px; }
  table.t { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 11px; break-inside: avoid; }
  .t th { text-align: left; background: #eef1f5; color: #323b49; padding: 4px 7px; border-bottom: 1px solid #c9d0da; }
  .t td { padding: 4px 7px; border-bottom: 1px solid #e1e5eb; vertical-align: top; }
  .t td.best { background: #e3f4fb; box-shadow: inset 0 0 0 2px #46b4de; font-weight: 700; }
  .t td.num { text-align: left; } .t th.rowh { background: none; font-weight: 600; width: 22%; }
  .legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 10.5px; color: #323b49; margin: 3px 0 6px 42px; }
  .legend svg { vertical-align: middle; }
  figure { margin: 6px 0; break-inside: avoid; } figcaption { font-size: 10.5px; color: #566174; margin-top: 2px; }
  ul.tight { margin: 2px 0 6px; padding-left: 16px; } ul.tight li { margin-bottom: 3px; }
  .pagebreak { break-before: page; }
  .place-head { display: flex; align-items: center; gap: 8px; margin-top: 10px; break-after: avoid; }
  .tag { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; color: #fff; font-weight: 700; }
  .foot { margin: 14px 24px 0; padding-top: 6px; border-top: 1px solid #c9d0da; color: #7b8797; font-size: 9.5px; }
  .screen-bar { position: sticky; top: 0; z-index: 5; display: flex; gap: 12px; align-items: center; justify-content: center;
    padding: 8px; background: #1c222c; color: #fff; font-size: 12px; }
  .screen-bar button { padding: 6px 14px; border: 0; border-radius: 6px; background: #46b4de; color: #0b0f17; font-weight: 700; cursor: pointer; }
  @media print { body { background: #fff; } .sheet { max-width: none; } .screen-bar { display: none; } }
`;

function pageHtml({ title, banner, body }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1"><style>${CSS}</style></head><body>
  <div class="screen-bar"><span>Choose "Save as PDF" as the printer in the print window.</span><button onclick="window.print()">Save as PDF / Print</button></div>
  <div class="sheet"><div class="banner">${banner}</div><div class="content">${body}</div>
  <div class="foot">Lunar Navigator · NASA Space Apps Challenge · generated ${esc(fmtUtc(Date.now()))} · Not for real mission planning.</div></div></body></html>`;
}

const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- Одно место ----------

function singleHtml(ctx, place, { ms, accuracyM }) {
  const { th, sites, eph } = ctx;
  const d = placeData(ctx, place, { ms, accuracyM });
  const days = th.energy.window_days;
  const finite = Number.isFinite(ms) && eph;
  const markerColor = PRINT[d.report.overall].text;
  const sunMin = th.energy.sun_min_elevation_deg ?? 0;
  const chart = d.series
    ? `<figure>${chartSvg({
      timesMs: d.series.timesMs,
      lines: [{ values: d.series.earth, color: EARTH_C }, { values: d.series.sun, color: SUN_C }],
      hLines: sunMin > 0 ? [{ value: sunMin, color: '#b8321f', label: `Sun counts above ${sunMin}°` }] : [],
    })}${legendHtml([{ name: 'Sun elevation', color: SUN_C }, { name: 'Earth elevation', color: EARTH_C }])}
      <figcaption>Elevation above the local horizon, next ${days} days from the chosen time. Above 0° the body is in the sky.${d.mask ? '' : ' Flat horizon.'}</figcaption></figure>`
    : '<p class="muted">No Sun / Earth data for the chosen time, so there is no chart.</p>';
  const banner = `<div class="brand">Lunar Navigator · Landing site report</div><h1>${esc(d.label)}</h1>
    <div class="meta">${esc(fmtCoord(place.lat, place.lon))} · analysis from ${finite ? esc(fmtUtc(ms)) : 'n/a'}, ${days} days ahead · landing accuracy ${esc(fmtAcc(accuracyM))} (1σ)</div>`;
  const body = `${verdictHtml(d)}
    <h2>Three checks</h2><div class="blocks">${blocksHtml(d)}</div>
    <h2>Sun and Earth over the next ${days} days</h2>${chart}${eventsHtml(d, ms)}
    <h2>Where it is</h2><figure>${mapSvg(sites, [{ lat: place.lat, lon: place.lon, color: markerColor, mark: '●' }])}
      <figcaption>Blue dots: landing sites in our list; grey: impact sites. The ring is the chosen place.</figcaption></figure>
    <h2>Neighbours</h2>${neighborsTable(d, 8)}
    ${methodHtml(th, accuracyM, Boolean(d.mask))}`;
  return pageHtml({ title: `Lunar-Navigator-report-${slug(d.label)}${finite ? '-' + fmtUtc(ms).slice(0, 10) : ''}`, banner, body });
}

// ---------- Сравнение ----------

function compareHtml(ctx, places, { ms, accuracyM }) {
  const { th, sites, eph } = ctx;
  const data = places.map(p => placeData(ctx, p, { ms, accuracyM }));
  const cmp = buildComparison(ctx, places, { ms, accuracyM });
  const days = th.energy.window_days;
  const finite = Number.isFinite(ms) && eph;
  const head = `<tr><th></th>${cmp.columns.map((c, i) => `<th><span class="tag" style="background:${PLACE_STYLE[i].color}">${PLACE_STYLE[i].mark}</span> ${esc(c.label)}</th>`).join('')}</tr>`;
  const rows = cmp.rows.map(r => `<tr><th class="rowh">${esc(r.label)}</th>${r.cells.map((cell, i) => {
    const cls = r.best.includes(i) ? 'best' : '';
    const txt = cell.status ? `<span style="color:${PRINT[cell.status].text};font-weight:700">${esc(cell.text)}</span>` : esc(cell.text);
    return `<td class="${cls}">${txt}${cls ? ' <span class="muted small">best</span>' : ''}</td>`;
  }).join('')}</tr>`).join('');

  const chartFor = key => {
    const first = data.find(d => d.series);
    if (!first) return '<p class="muted">No Sun / Earth data for the chosen time.</p>';
    return `<figure>${chartSvg({
      timesMs: first.series.timesMs,
      lines: data.map((d, i) => ({ values: d.series ? d.series[key] : [], color: PLACE_STYLE[i].color, dash: PLACE_STYLE[i].dash })),
    })}${legendHtml(data.map((d, i) => ({ name: `${PLACE_STYLE[i].mark}: ${d.label}`, color: PLACE_STYLE[i].color, dash: PLACE_STYLE[i].dash })))}</figure>`;
  };

  const banner = `<div class="brand">Lunar Navigator · Comparison report</div><h1>${data.map(d => esc(d.label)).join(' · ')}</h1>
    <div class="meta">${places.length} places · analysis from ${finite ? esc(fmtUtc(ms)) : 'n/a'}, ${days} days ahead · landing accuracy ${esc(fmtAcc(accuracyM))} (1σ)</div>`;
  const perPlace = data.map((d, i) => `<div class="place-head"><span class="tag" style="background:${PLACE_STYLE[i].color}">${PLACE_STYLE[i].mark}</span><h3 style="margin:0">${esc(d.label)}</h3><span class="muted">${esc(fmtCoord(d.place.lat, d.place.lon))}</span></div>
    ${verdictHtml(d)}<div class="blocks">${blocksHtml(d)}</div>${eventsHtml(d, ms)}`).join('');
  const terrain = data.some(d => d.mask);
  const body = `<h2>Side by side</h2>
    <table class="t"><thead>${head}</thead><tbody>${rows}</tbody></table>
    <p class="muted small">"Best" marks only the better number in that row; it is not a safety guarantee. Colour is always repeated with an icon and a word.</p>
    <h2>Where they are</h2><figure>${mapSvg(sites, data.map((d, i) => ({ lat: d.place.lat, lon: d.place.lon, color: PLACE_STYLE[i].color, mark: PLACE_STYLE[i].mark })))}
      <figcaption>Blue dots: landing sites in our list; grey: impact sites.</figcaption></figure>
    <h2>Sun elevation, next ${days} days</h2>${chartFor('sun')}
    <h2>Earth elevation, next ${days} days</h2>${chartFor('earth')}
    <h2 class="pagebreak">Each place in detail</h2>${perPlace}
    <h2>Nearest neighbours</h2>${data.map((d, i) => `<h3>${PLACE_STYLE[i].mark}: ${esc(d.label)}</h3>${neighborsTable(d, 4)}`).join('')}
    ${methodHtml(th, accuracyM, terrain)}`;
  return pageHtml({ title: `Lunar-Navigator-comparison-${data.map(d => slug(d.label)).join('-vs-')}`, banner, body });
}

// opts: { kind: 'single' | 'compare', ctx, places: [{lat, lon, label?}], ms, accuracyM }
export function buildReportHtml({ kind, ctx, places, ms, accuracyM }) {
  return kind === 'compare' && places.length >= 2
    ? compareHtml(ctx, places.slice(0, 3), { ms, accuracyM })
    : singleHtml(ctx, places[0], { ms, accuracyM });
}

// Открывает отчёт в новом окне и вызывает печать (там выбрать «Сохранить как PDF»).
// Если браузер не дал открыть окно, печатаем из скрытого фрейма.
export function openPdfReport(opts) {
  const html = buildReportHtml(opts);
  const win = window.open('', '_blank');
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    setTimeout(() => { try { win.focus(); win.print(); } catch { /* окно закрыто */ } }, 600);
    return;
  }
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  frame.contentDocument.open();
  frame.contentDocument.write(html);
  frame.contentDocument.close();
  setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 60000); }, 600);
}


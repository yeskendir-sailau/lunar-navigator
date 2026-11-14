// PDF-отчёт о месте посадки: одна точка (отчёт, Солнце и Земля, график, соседи) и, если выбраны места A/B/C,
// таблица сравнения и графики для них. Файл скачивается сразу (библиотека jsPDF лежит в vendor/, интернет не нужен).
// Не зависит от three.js: снимок Луны (картинку) передаёт main.js.
import { buildReport, STATUS } from './report-logic.js';
import { conditionsAt, nextCrossing, elevationSeries } from './astro.js';
import { assessNeighbors } from './safety.js';
import { horizonFor } from './horizon.js';
import { buildComparison } from './compare.js';
import { fmtUtc, fmtDuration, fmtDeg, fmtDistance, fmtHours } from './format.js';
import { SLOT_COLORS } from './slot-colors.js';

const NASA_URL = 'https://www.nasa.gov/pdf/617743main_NASA-USG_LUNAR_HISTORIC_SITES_RevA-508.pdf';
const CHART_DAYS = 30;

// --- jsPDF загружаем только при первом нажатии кнопки ---
let loading = null;
function loadJsPdf() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/jspdf.umd.min.js', import.meta.url).href;
    s.onload = () => resolve(window.jspdf.jsPDF);
    s.onerror = () => { loading = null; reject(new Error('Cannot load vendor/jspdf.umd.min.js')); };
    document.head.appendChild(s);
  });
  return loading;
}

// Стандартный шрифт PDF знает только латиницу: заменяем особые знаки (σ, ✓, ≥, −) на простые
const SAFE = { '−': '-', '–': '-', '—': '-', 'σ': 'sigma', '≥': '>=', '≤': '<=', '✓': '', '✕': '', '…': '...',
  '’': "'", '‘': "'", '“': '"', '”': '"', '→': '->', '≈': '~', '●': '' };
const clean = s => String(s ?? '')
  .replace(/[^\x00-\xff]/g, ch => SAFE[ch] ?? '')
  .replace(/\(\s+/g, '(').replace(/ {2,}/g, ' ').trim();

// Цвета для бумаги: заливка — как на сайте, текст чуть темнее (жёлтый на белом иначе не читается)
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const INK = { green: [27, 128, 70], yellow: [150, 112, 0], red: [184, 50, 38], unknown: [100, 110, 125] };
const TEXT = [29, 36, 48];
const MUTED = [95, 106, 122];
const LINE = [214, 219, 226];
const NAVY = [16, 22, 34];
const ACCENT = [31, 134, 176];

function latLonText(lat, lon) {
  return `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? 'E' : 'W'}`;
}

// --- График (рисуем на скрытом canvas, вставляем картинкой) ---
// lines: [{ values, color, label, dash? }]
function chartImage(timesMs, lines, { title, wPx = 1700, hPx = 560 } = {}) {
  const c = document.createElement('canvas');
  c.width = wPx; c.height = hPx;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, wPx, hPx);
  const padL = 90, padR = 24, padT = title ? 70 : 24, padB = 56;
  const n = timesMs.length;
  if (n < 2) return c.toDataURL('image/jpeg', 0.92);
  const t0 = timesMs[0], t1 = timesMs[n - 1];
  const x = t => padL + ((t - t0) / (t1 - t0)) * (wPx - padL - padR);
  const y = e => padT + ((90 - e) / 180) * (hPx - padT - padB);

  g.font = '600 30px Helvetica, Arial, sans-serif';
  g.fillStyle = '#1d2430';
  if (title) g.fillText(title, padL, 40);

  g.font = '24px Helvetica, Arial, sans-serif';
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  for (const e of [90, 45, 0, -45, -90]) {
    g.strokeStyle = e === 0 ? '#5f6a7a' : '#e1e5ea';
    g.lineWidth = e === 0 ? 2.5 : 1.5;
    g.beginPath(); g.moveTo(padL, y(e)); g.lineTo(wPx - padR, y(e)); g.stroke();
    g.fillStyle = '#5f6a7a';
    g.fillText(`${e}°`, padL - 12, y(e));
  }
  // подписи дат каждые ~5 суток
  g.textAlign = 'center';
  g.textBaseline = 'top';
  const day = 86400e3;
  const stepDays = (t1 - t0) / day > 20 ? 5 : 2;
  for (let t = t0; t <= t1 + 1; t += stepDays * day) {
    g.strokeStyle = '#eef0f3'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x(t), padT); g.lineTo(x(t), hPx - padB); g.stroke();
    g.fillStyle = '#5f6a7a';
    g.textAlign = x(t) > wPx - padR - 40 ? 'right' : 'center';   // последняя дата не обрезается
    g.fillText(fmtUtc(t).slice(5, 10), Math.min(x(t), wPx - padR), hPx - padB + 12);
  }
  // линии
  for (const l of lines) {
    g.strokeStyle = l.color;
    g.lineWidth = 4;
    g.setLineDash(l.dash ?? []);
    g.beginPath();
    let pen = false;
    l.values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) { pen = false; return; }
      if (pen) g.lineTo(x(timesMs[i]), y(v)); else g.moveTo(x(timesMs[i]), y(v));
      pen = true;
    });
    g.stroke();
  }
  g.setLineDash([]);
  // легенда справа вверху
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.font = '24px Helvetica, Arial, sans-serif';
  let lx = wPx - padR;
  const items = lines.map(l => ({ l, w: g.measureText(l.label).width + 56 }));
  for (const { l, w } of items.reverse()) {
    lx -= w + 18;
    g.strokeStyle = l.color; g.lineWidth = 5;
    g.setLineDash(l.dash ?? []);
    g.beginPath(); g.moveTo(lx, title ? 40 : padT + 14); g.lineTo(lx + 40, title ? 40 : padT + 14); g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#1d2430';
    g.fillText(l.label, lx + 50, title ? 40 : padT + 14);
  }
  return c.toDataURL('image/jpeg', 0.92);   // JPEG: файл в разы меньше, чем PNG
}

// --- «Писатель»: следит за положением на странице и сам переносит на новую страницу ---
function makeWriter(doc) {
  const W = 210, H = 297, M = 16, CW = W - 2 * M, BOTTOM = H - 18;
  const mm = pt => pt * 0.3528;
  const LH = 1.3;
  doc.setLineHeightFactor(LH);
  const w = {
    doc, W, H, M, CW, y: M,
    newPage() { doc.addPage(); w.y = M; },
    ensure(h) { if (w.y + h > BOTTOM) w.newPage(); },
    font(size, bold = false, color = TEXT) {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      doc.setTextColor(...color);
    },
    lines(str, size, width) { return doc.splitTextToSize(clean(str), width); },
    height(lines, size) { return lines.length * mm(size) * LH; },
    // Текст с переносом строк; возвращает высоту
    text(str, { size = 10, bold = false, color = TEXT, x = M, width = CW, gap = 1.6, align = 'left' } = {}) {
      w.font(size, bold, color);
      const lines = w.lines(str, size, width);
      const h = w.height(lines, size);
      w.ensure(h);
      doc.text(lines, align === 'right' ? x + width : x, w.y, { baseline: 'top', align });
      w.y += h + gap;
      return h;
    },
    heading(str, need = 45) {   // need: сколько места нужно под заголовком, чтобы он не остался один внизу
      w.ensure(need);
      w.y += 3;
      w.font(13, true, NAVY);
      doc.text(clean(str), M, w.y, { baseline: 'top' });
      w.y += 6.5;
      doc.setDrawColor(...ACCENT);
      doc.setLineWidth(0.6);
      doc.line(M, w.y, M + 18, w.y);
      w.y += 3.5;
    },
    badge(x, y, r, status) {   // цветной кружок со значком
      doc.setFillColor(...rgb(STATUS[status].color));
      doc.circle(x, y, r, 'F');
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(r * 0.22);
      if (status === 'green') { doc.line(x - r * 0.45, y, x - r * 0.1, y + r * 0.4); doc.line(x - r * 0.1, y + r * 0.4, x + r * 0.5, y - r * 0.4); }
      else if (status === 'red') { doc.line(x - r * 0.4, y - r * 0.4, x + r * 0.4, y + r * 0.4); doc.line(x - r * 0.4, y + r * 0.4, x + r * 0.4, y - r * 0.4); }
      else if (status === 'yellow') { doc.line(x, y - r * 0.5, x, y + r * 0.1); doc.circle(x, y + r * 0.45, r * 0.08, 'S'); }
    },
  };
  return w;
}

// --- Разделы отчёта ---
function headerBand(w, generatedMs) {
  const { doc, W, M } = w;
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 30, 'F');
  doc.setFillColor(...ACCENT);
  doc.rect(0, 30, W, 1.2, 'F');
  w.font(20, true, [255, 255, 255]);
  doc.text('Lunar Landing Site Report', M, 9, { baseline: 'top' });
  w.font(9.5, false, [190, 200, 215]);
  doc.text(clean(`Lunar Navigator  ·  NASA Space Apps Challenge 2026  ·  generated ${fmtUtc(generatedMs)}`), M, 20.5, { baseline: 'top' });
  w.y = 38;
}

function placeSection(w, report, { ms, accuracyM, landerLabel, snapshot, th }) {
  const { doc, M, CW } = w;
  const imgSize = snapshot ? 62 : 0;
  const leftW = CW - (snapshot ? imgSize + 8 : 0);
  const top = w.y;

  w.text('Landing point', { size: 9, color: MUTED, width: leftW, gap: 0.5 });
  w.text(latLonText(report.lat, report.lon), { size: 17, bold: true, width: leftW, gap: 1.5 });
  w.text(Number.isFinite(ms) ? `Chosen time: ${fmtUtc(ms)} (Earth time), looking ${th.energy.window_days} days ahead` : 'No Sun/Earth data loaded',
    { size: 9.5, color: MUTED, width: leftW, gap: 4 });

  // Итог: большой кружок + слово + пояснение
  const s = STATUS[report.overall];
  const boxH = 20;
  doc.setFillColor(244, 246, 249);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, w.y, leftW, boxH, 3, 3, 'FD');
  doc.setFillColor(...rgb(s.color));
  doc.rect(M, w.y, 2.2, boxH, 'F');
  w.badge(M + 12, w.y + boxH / 2, 5.5, report.overall);
  w.font(15, true, INK[report.overall]);
  doc.text(clean(s.word), M + 22, w.y + 4.5, { baseline: 'top' });
  w.font(9.5, false, MUTED);
  doc.text(clean(report.verdict), M + 22, w.y + 11.5, { baseline: 'top' });
  w.y += boxH + 4;

  const params = [
    ['Landing accuracy (1 sigma)', accuracyM >= 1000 ? `${accuracyM / 1000} km` : `${accuracyM} m`],
    ['Lander size', landerLabel ? `${landerLabel} (note only)` : '-'],
    ['Horizon', report.terrain ? 'Terrain (LOLA horizon mask)' : 'Flat (no terrain data here)'],
  ];
  for (const [k, v] of params) {
    w.font(9.5, false, MUTED);
    doc.text(clean(k), M, w.y, { baseline: 'top' });
    w.font(9.5, true, TEXT);
    doc.text(clean(v), M + 48, w.y, { baseline: 'top' });
    w.y += 5;
  }

  if (snapshot) {
    const x = M + CW - imgSize;
    try {
      doc.addImage(snapshot, 'JPEG', x, top, imgSize, imgSize);
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.4);
      doc.roundedRect(x, top, imgSize, imgSize, 2, 2, 'S');
      w.font(7.5, false, MUTED);
      doc.text('View in Lunar Navigator at export time', x + imgSize / 2, top + imgSize + 2, { baseline: 'top', align: 'center' });
    } catch { /* картинка не получилась — отчёт без неё */ }
    w.y = Math.max(w.y, top + imgSize + 7);
  }
  w.y += 2;
}

function checksSection(w, report) {
  const { doc, M, CW } = w;
  w.heading('Three checks');
  w.text('The final colour is the worst of the three. Every colour is also written as a word.', { size: 9, color: MUTED, gap: 3 });
  for (const b of report.blocks) {
    const s = STATUS[b.status];
    // заранее считаем высоту блока, чтобы не разрывать его между страницами
    w.font(9.5);
    const items = [
      ...b.details.map(d => ({ str: '-  ' + d, size: 9.5, color: TEXT })),
      ...(b.status !== 'green' && b.status !== 'unknown' && b.title !== 'Neighbors' && b.reasons.length
        ? [{ str: 'Why: ' + b.reasons.join('; '), size: 9.5, color: INK[b.status] }] : []),
      ...(b.note ? [{ str: b.note, size: 8.5, color: MUTED }] : []),
    ];
    const innerW = CW - 10;
    const headH = 6.5 + w.height(w.lines(b.headline, 10, innerW), 10) + 1;
    const bodyH = items.reduce((h, it) => h + w.height(w.lines(it.str, it.size, innerW), it.size) + 1, 0);
    const blockH = headH + bodyH + 5;
    w.ensure(blockH + 3);
    const y0 = w.y;
    doc.setFillColor(250, 251, 252);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, y0, CW, blockH, 2.5, 2.5, 'FD');
    doc.setFillColor(...rgb(s.color));
    doc.rect(M, y0, 2.2, blockH, 'F');
    w.badge(M + 8, y0 + 5.6, 2.6, b.status);
    w.font(11.5, true, TEXT);
    doc.text(clean(b.title), M + 13, y0 + 3, { baseline: 'top' });
    w.font(10, true, INK[b.status]);
    doc.text(clean(s.word), M + CW - 4, y0 + 3.2, { baseline: 'top', align: 'right' });
    w.y = y0 + 9.5;
    w.text(b.headline, { size: 10, x: M + 6, width: innerW, gap: 1 });
    for (const it of items) w.text(it.str, { size: it.size, color: it.color, x: M + 6, width: innerW, gap: 1 });
    w.y = y0 + blockH + 3.5;
  }
}

function sunEarthSection(w, ctx, lat, lon, ms, mask) {
  const { doc, M, CW } = w;
  const { eph } = ctx;
  if (!eph || !Number.isFinite(ms)) return;
  const c = conditionsAt(eph, lat, lon, ms, mask);
  if (!c) return;
  w.heading('Sun and Earth at this point');
  const sunX = nextCrossing(eph, 'sun', lat, lon, ms, undefined, undefined, mask);
  const earthX = nextCrossing(eph, 'earth', lat, lon, ms, undefined, undefined, mask);
  const ev = (x, up, down) => (x ? [`${x.rising ? up : down}`, `in ${fmtDuration(x.timeMs - ms)}  ·  ${fmtUtc(x.timeMs)}`] : [`${up} / ${down}`, 'not within 31 days']);
  const rows = [
    ['Sun now', `${fmtDeg(c.sunElevation)}  ·  ${c.sunUp ? 'day' : 'night'}`],
    ev(sunX, 'Next sunrise', 'Next sunset'),
    ['Earth now', `${fmtDeg(c.earthElevation)}  ·  ${c.earthUp ? 'above horizon' : 'below horizon'}`],
    ev(earthX, 'Next Earthrise', 'Next Earthset'),
    ['Direct link to Earth', c.earthUp ? 'Yes' : 'No (Earth below horizon)'],
  ];
  w.ensure(rows.length * 6.2 + 4);
  rows.forEach(([k, v], i) => {
    if (i % 2 === 0) { doc.setFillColor(245, 247, 250); doc.rect(M, w.y - 1, CW, 6.2, 'F'); }
    w.font(9.5, false, MUTED);
    doc.text(clean(k), M + 3, w.y + 0.4, { baseline: 'top' });
    w.font(9.5, true, TEXT);
    doc.text(clean(v), M + CW - 3, w.y + 0.4, { baseline: 'top', align: 'right' });
    w.y += 6.2;
  });
  w.y += 3;
  const series = elevationSeries(eph, lat, lon, ms, CHART_DAYS * 24, 60);
  const img = chartImage(series.timesMs, [
    { values: series.sun, color: '#d08a00', label: 'Sun elevation' },
    { values: series.earth, color: '#2f5fd0', label: 'Earth elevation' },
  ], { title: `Next ${CHART_DAYS} days (UTC dates). Above 0° = above a flat horizon` });
  const h = CW * 560 / 1700;
  w.ensure(h + 3);
  doc.addImage(img, 'JPEG', M, w.y, CW, h);
  w.y += h + 4;
}

function neighborsSection(w, ctx, lat, lon, accuracyM, mask) {
  const { doc, M, CW } = w;
  const { sites, th } = ctx;
  if (!sites?.length) return;
  const res = assessNeighbors(lat, lon, sites, accuracyM, th.neighbors, mask);
  const list = res.neighbors.slice(0, 6);
  w.heading('Nearest existing sites');
  const ZONE = { 'keep-out': 'inside keep-out zone', gravel: 'gravel may reach', dust: 'dust may reach', clear: 'clear' };
  const cols = [0, 70, 108, 136];   // мм от левого края
  w.ensure(7 + list.length * 6.2);
  w.font(8.5, true, MUTED);
  ['Site', 'Type', 'Distance', 'Status'].forEach((h, i) => doc.text(h, M + 3 + cols[i], w.y, { baseline: 'top' }));
  w.y += 5;
  doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(M, w.y - 0.8, M + CW, w.y - 0.8);
  for (const n of list) {
    w.font(9.5, false, TEXT);
    doc.text(clean(n.site.name).slice(0, 38), M + 3 + cols[0], w.y + 0.4, { baseline: 'top' });
    w.font(9, false, MUTED);
    doc.text(clean(n.site.type ?? ''), M + 3 + cols[1], w.y + 0.4, { baseline: 'top' });
    w.font(9.5, false, TEXT);
    doc.text(clean(fmtDistance(n.distanceKm)), M + 3 + cols[2], w.y + 0.4, { baseline: 'top' });
    w.badge(M + 4.5 + cols[3], w.y + 2.4, 1.7, n.status);
    w.font(9, true, INK[n.status]);
    doc.text(clean(`${STATUS[n.status].word}: ${ZONE[n.zone]}${n.shielded ? ' (terrain shield)' : ''}`), M + 8 + cols[3], w.y + 0.4, { baseline: 'top' });
    w.y += 6.2;
  }
  w.y += 2;
}

function comparisonSection(w, ctx, places, ms, accuracyM) {
  const { doc, M, CW } = w;
  const cmp = buildComparison(ctx, places, { ms, accuracyM });
  w.newPage();
  w.heading(`Comparison of ${places.length} places`);
  w.text(`Same time and landing accuracy for every place. "best" marks only the better number in a row, not a safety guarantee.`,
    { size: 9, color: MUTED, gap: 3 });

  const labelW = 58;
  const colW = (CW - labelW) / places.length;
  // шапка: цвет места, как на Луне
  const headH = 15;
  w.ensure(headH + cmp.rows.length * 7);
  places.forEach((p, i) => {
    const x = M + labelW + i * colW;
    const color = rgb(SLOT_COLORS[p.slot].css);
    doc.setFillColor(...color);
    doc.rect(x + 1, w.y, colW - 2, 2.2, 'F');
    doc.circle(x + 4, w.y + 6.6, 1.6, 'F');
    w.font(10.5, true, TEXT);
    doc.text(clean(`Place ${p.slot}`), x + 7, w.y + 4.4, { baseline: 'top' });
    w.font(8, false, MUTED);
    const label = w.lines(cmp.columns[i].label, 8, colW - 6).slice(0, 2);
    doc.text(label, x + 3, w.y + 9.3, { baseline: 'top' });
  });
  w.y += headH + 2;
  cmp.rows.forEach((row, r) => {
    const rowH = 7;
    w.ensure(rowH);
    if (r % 2 === 0) { doc.setFillColor(245, 247, 250); doc.rect(M, w.y - 1.2, CW, rowH, 'F'); }
    w.font(9.5, row.kind === 'status', row.kind === 'status' ? TEXT : MUTED);
    doc.text(clean(row.label), M + 2, w.y + 0.6, { baseline: 'top' });
    row.cells.forEach((cell, i) => {
      const x = M + labelW + i * colW + 3;
      if (cell.status) {
        w.badge(x + 1.6, w.y + 2.6, 1.8, cell.status);
        w.font(9.5, true, INK[cell.status]);
        doc.text(clean(STATUS[cell.status].word), x + 5, w.y + 0.6, { baseline: 'top' });
      } else {
        w.font(9.5, false, TEXT);
        doc.text(clean(cell.text), x, w.y + 0.6, { baseline: 'top' });
      }
      if (row.best.includes(i)) {
        doc.setDrawColor(...ACCENT); doc.setLineWidth(0.45);
        doc.roundedRect(x - 2, w.y - 0.9, colW - 2, rowH - 0.6, 1.2, 1.2, 'S');
        w.font(7, true, ACCENT);
        doc.text('best', x + colW - 5.5, w.y + 1.3, { baseline: 'top', align: 'right' });
      }
    });
    w.y += rowH;
  });
  w.y += 5;

  // Графики: Солнце и Земля для всех мест (цвета мест)
  if (ctx.eph && Number.isFinite(ms)) {
    const all = places.map(p => elevationSeries(ctx.eph, p.lat, p.lon, ms, CHART_DAYS * 24, 60));
    const times = all[0].timesMs;
    const h = CW * 560 / 1700;
    for (const [field, title] of [['sun', 'Sun elevation, next 30 days'], ['earth', 'Earth elevation, next 30 days (Earth in view = above 0°)']]) {
      const img = chartImage(times, places.map((p, i) => ({
        values: all[i][field], color: SLOT_COLORS[p.slot].css, label: `Place ${p.slot}`, dash: [null, [14, 10], [3, 9]][i],
      })), { title });
      w.ensure(h + 3);
      doc.addImage(img, 'JPEG', M, w.y, CW, h);
      w.y += h + 4;
    }
  }
}

function methodSection(w, ctx) {
  const { th } = ctx;
  const e = th.energy, c = th.communication, n = th.neighbors;
  w.heading('How it is calculated');
  const items = [
    `Energy: the Sun counts when it is more than ${e.sun_min_elevation_deg ?? 0}° above the horizon. Green: sunlit at least ${e.daylight_pct.green_min}% of the next ${e.window_days} days and the longest night at most ${fmtHours(e.longest_night_hours.green_max)}. Red: sunlit less than ${e.daylight_pct.yellow_min}% or a night longer than ${fmtHours(e.longest_night_hours.yellow_max)}.`,
    `Communication: green if Earth is above the horizon at least ${c.earth_visible_pct.green_min}% of the time and the longest break is at most ${fmtHours(c.longest_gap_hours.green_max)}; red below ${c.earth_visible_pct.yellow_min}% or a break longer than ${fmtHours(c.longest_gap_hours.yellow_max)}. Line of sight only, not radio power.`,
    `Neighbors: red inside the keep-out zone (the larger of ${n.keep_out_km.heritage} km from landing sites or ${n.keep_out_km.impact} km from impact sites and ${n.sigma_multiple} x the landing accuracy); yellow closer than ${n.gravel_km} km (gravel) or ${n.dust_line_of_sight_km} km (dust in line of sight); green otherwise.`,
    'Thresholds for energy and communication are our own choice (data/thresholds.json), not a NASA standard. Distances follow NASA\'s 2011 non-binding recommendations for US lunar historic sites; we apply them to every site as a precaution.',
    'Limits: smooth Moon unless a terrain horizon is available; Sun and Earth treated as points; only sites in our list are checked; lander size is a note only. This is not a tool for real mission planning.',
    `Sources: JPL DE421 ephemeris (via Skyfield); LOLA terrain (south pole); NASA-USG Lunar Historic Sites Rev A (${NASA_URL}).`,
  ];
  for (const it of items) w.text('-  ' + it, { size: 9, color: TEXT, gap: 1.8 });
}

function footers(w, generatedMs) {
  const { doc, W, H, M } = w;
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3);
    doc.line(M, H - 12, W - M, H - 12);
    w.font(7.5, false, MUTED);
    doc.text(clean(`Lunar Navigator report · ${fmtUtc(generatedMs)} · not for real mission planning`), M, H - 10, { baseline: 'top' });
    doc.text(`Page ${i} / ${pages}`, W - M, H - 10, { baseline: 'top', align: 'right' });
  }
}

// opts: { ctx: {eph, sites, th, horizons}, point: {lat, lon} | null, ms, accuracyM, landerLabel,
//         slots: { A: {lat, lon, label} | null, ... }, snapshot: dataURL | null }
export async function exportPdf({ ctx, point, ms, accuracyM, landerLabel, slots = {}, snapshot = null }) {
  const JsPDF = await loadJsPdf();
  const places = ['A', 'B', 'C'].filter(s => slots[s]).map(s => ({ ...slots[s], slot: s }));
  const main = point ?? places[0];
  if (!main) throw new Error('Choose a point on the Moon first');

  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title: 'Lunar Landing Site Report', creator: 'Lunar Navigator' });
  const w = makeWriter(doc);
  const now = Date.now();
  const mask = horizonFor(ctx.horizons, main.lat, main.lon);
  const report = buildReport(ctx, main.lat, main.lon, { ms, accuracyM });

  headerBand(w, now);
  placeSection(w, report, { ms, accuracyM, landerLabel, snapshot, th: ctx.th });
  checksSection(w, report);
  sunEarthSection(w, ctx, main.lat, main.lon, ms, mask);
  neighborsSection(w, ctx, main.lat, main.lon, accuracyM, mask);
  if (places.length >= 2) comparisonSection(w, ctx, places, ms, accuracyM);
  methodSection(w, ctx);
  footers(w, now);

  const tag = `${main.lat.toFixed(2)}_${main.lon.toFixed(2)}`;
  const date = Number.isFinite(ms) ? fmtUtc(ms).slice(0, 10) : 'no-date';
  doc.save(`lunar-report_${tag}_${date}${places.length >= 2 ? '_compare' : ''}.pdf`);
}

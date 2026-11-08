// Панель «Сравнение мест»: два места (A и B) рядом — высота Солнца и Земли сейчас, ближайший
// восход или закат, доля светлого времени и видимости Земли за 30 суток, самая длинная ночь,
// и два графика. Время приходит снаружи (setTime), места задаются кнопками «Set as A / B».
// Не зависит от three.js. Всё создаётся кодом, поэтому в HTML ничего добавлять не нужно.
import { conditionsAt, nextCrossing, elevationSeries, summarize } from './astro.js';
import { fmtUtc, fmtDuration, fmtDeg, fmtHours } from './format.js';

const COLORS = { A: '#4cc9f0', B: '#b388ff' };
const DAYS = 30;
const SAME_PLACE_DEG = 0.3;   // ближе этого к месту из sites.json — берём его название

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// Угол между двумя точками на Луне (градусы), формула гаверсинусов
function distDeg(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
            Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(a)))) / r;
}

export function createComparePanel(eph, sites = []) {
  const style = document.createElement('style');
  style.textContent = `
    .compare-panel {
      position: fixed; bottom: 16px; left: 50%; transform: translate(-50%, 16px); z-index: 20;
      width: min(540px, calc(100vw - 32px)); max-height: calc(100vh - 140px); overflow: auto;
      box-sizing: border-box; padding: 12px 14px;
      background: rgba(10, 14, 22, 0.94); color: #e8edf5;
      border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 12px;
      font: 13px/1.45 system-ui, sans-serif;
      opacity: 0; pointer-events: none; transition: opacity .3s ease, transform .3s ease;
    }
    .compare-panel.open { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
    @media (max-width: 1100px) {
      .compare-panel { left: 16px; right: 16px; width: auto; transform: translateY(16px); }
      .compare-panel.open { transform: none; }
    }
    .compare-panel .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .compare-panel h3 { margin: 0; font-size: 15px; }
    .compare-panel button {
      color: #e8edf5; background: #1d2740; cursor: pointer; font: inherit;
      border: 1px solid rgba(255,255,255,.25); border-radius: 6px; padding: 2px 8px;
    }
    .compare-panel .grid { display: grid; grid-template-columns: 1.1fr 1fr 1fr; gap: 3px 10px; margin-bottom: 10px; }
    .compare-panel .k { color: #9fb0c8; }
    .compare-panel .colhead { font-weight: 600; display: flex; gap: 6px; align-items: baseline; }
    .compare-panel .colhead span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .compare-panel .colhead button { padding: 0 6px; margin-left: auto; font-weight: 400; }
    .compare-panel .hint { color: #7f8fa6; font-weight: 400; }
    .compare-panel .charts { display: flex; flex-wrap: wrap; gap: 10px; }
    .compare-panel .chart-title { color: #9fb0c8; font-size: 12px; margin-bottom: 2px; }
    .compare-panel canvas { display: block; }
    .compare-panel .note { color: #7f8fa6; font-size: 11px; margin-top: 8px; }
  `;
  document.head.appendChild(style);

  // --- Разметка ---
  const el = make('div', 'compare-panel');
  const head = make('div', 'head');
  head.appendChild(make('h3', '', 'Compare places'));
  const closeBtn = make('button', '', '×');
  closeBtn.setAttribute('aria-label', 'Close comparison');
  head.appendChild(closeBtn);
  el.appendChild(head);

  const grid = make('div', 'grid');
  el.appendChild(grid);

  const charts = make('div', 'charts');
  function chartBlock(title) {
    const box = make('div');
    box.appendChild(make('div', 'chart-title', title));
    const canvas = make('canvas');
    box.appendChild(canvas);
    charts.appendChild(box);
    return canvas;
  }
  const sunCanvas = chartBlock('Sun elevation, next 30 days');
  const earthCanvas = chartBlock('Earth elevation, next 30 days');
  el.appendChild(charts);

  const note = make('div', 'note');
  el.appendChild(note);
  document.body.appendChild(el);

  // --- Состояние ---
  const slots = { A: null, B: null };   // { lat, lon, label }
  let ms = eph.startMs;
  let dismissed = false;

  function labelFor(lat, lon) {
    let best = null;
    for (const site of sites) {
      const d = distDeg(lat, lon, site.lat, site.lon);
      if (d <= SAME_PLACE_DEG && (best === null || d < best.d)) best = { site, d };
    }
    if (best) return best.site.name;
    return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
  }

  function compute(slot) {
    const p = slots[slot];
    if (!p) return null;
    const c = conditionsAt(eph, p.lat, p.lon, ms);
    if (!c) return null;
    return {
      c,
      sunX: nextCrossing(eph, 'sun', p.lat, p.lon, ms),
      earthX: nextCrossing(eph, 'earth', p.lat, p.lon, ms),
      sum: summarize(eph, p.lat, p.lon, ms, DAYS),
      series: elevationSeries(eph, p.lat, p.lon, ms, DAYS * 24, 60),
    };
  }

  const eventText = (x, now) =>
    x ? `${x.rising ? 'rise' : 'set'} in ${fmtDuration(x.timeMs - now)}` : 'none in 31 days';

  const ROWS = [
    ['Sun now', d => `${fmtDeg(d.c.sunElevation)} · ${d.c.sunUp ? 'day' : 'night'}`],
    ['Next sunrise / sunset', d => eventText(d.sunX, ms)],
    ['Earth now', d => `${fmtDeg(d.c.earthElevation)} · ${d.c.earthUp ? 'visible' : 'hidden'}`],
    ['Next Earthrise / set', d => eventText(d.earthX, ms)],
    ['Daylight, next 30 d', d => `${Math.round(d.sum.daylightPct)}%`],
    ['Longest night', d => fmtHours(d.sum.longestNightHours)],
    ['Earth visible, next 30 d', d => `${Math.round(d.sum.earthVisiblePct)}%`],
    ['Longest no-Earth gap', d => fmtHours(d.sum.longestEarthGapHours)],
  ];

  function colHead(slot) {
    const cell = make('div', 'colhead');
    const dot = make('span', '', '●');
    dot.style.color = COLORS[slot];
    cell.appendChild(dot);
    const p = slots[slot];
    if (p) {
      cell.appendChild(make('span', '', `${slot}: ${p.label}`));
      const clear = make('button', '', '×');
      clear.setAttribute('aria-label', `Clear place ${slot}`);
      clear.addEventListener('click', () => { slots[slot] = null; render(); });
      cell.appendChild(clear);
    } else {
      cell.appendChild(make('span', 'hint', `${slot}: choose a place, then “Set as ${slot}”`));
    }
    return cell;
  }

  function drawChart(canvas, timesMs, lines) {
    const W = 250;
    const H = 96;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const n = timesMs.length;
    if (n < 2) return;

    const padL = 28, padR = 4, padT = 6, padB = 16;
    const t0 = timesMs[0];
    const t1 = timesMs[n - 1];
    const x = i => padL + ((timesMs[i] - t0) / (t1 - t0)) * (W - padL - padR);
    const y = e => padT + ((90 - e) / 180) * (H - padT - padB);

    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = '#7f8fa6';
    ctx.lineWidth = 1;
    for (const e of [90, 0, -90]) {
      ctx.beginPath();
      ctx.moveTo(padL, y(e));
      ctx.lineTo(W - padR, y(e));
      ctx.strokeStyle = e === 0 ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.12)';
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${e}°`, padL - 4, y(e));
    }
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText(fmtUtc(t0).slice(5, 10), padL, H - 3);
    ctx.textAlign = 'right';
    ctx.fillText(fmtUtc(t1).slice(5, 10), W - padR, H - 3);

    for (const { values, color, dash } of lines) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.setLineDash(dash);
      ctx.beginPath();
      let pen = false;
      values.forEach((v, i) => {
        if (v === null) { pen = false; return; }
        if (pen) ctx.lineTo(x(i), y(v)); else ctx.moveTo(x(i), y(v));
        pen = true;
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function render() {
    const any = slots.A !== null || slots.B !== null;
    el.classList.toggle('open', any && !dismissed);
    if (!any) return;

    const data = { A: compute('A'), B: compute('B') };

    grid.replaceChildren();
    grid.append(make('div', 'k', `Time: ${fmtUtc(ms).slice(5)}`), colHead('A'), colHead('B'));
    for (const [label, value] of ROWS) {
      grid.appendChild(make('div', 'k', label));
      for (const slot of ['A', 'B']) {
        grid.appendChild(make('div', '', data[slot] ? value(data[slot]) : '–'));
      }
    }

    const times = (data.A ?? data.B)?.series.timesMs ?? [];
    const linesFor = key => ['A', 'B']
      .filter(s => data[s])
      .map(s => ({ values: data[s].series[key], color: COLORS[s], dash: s === 'B' ? [5, 3] : [] }));
    drawChart(sunCanvas, times, linesFor('sun'));
    drawChart(earthCanvas, times, linesFor('earth'));

    const windows = ['A', 'B'].filter(s => data[s]?.sum).map(s => data[s].sum.windowHours);
    const shortWindow = windows.length > 0 && Math.min(...windows) < DAYS * 24 - 1;
    note.textContent =
      'Flat horizon, no terrain: mountains and crater walls can shorten daylight and block Earth. ' +
      'Percentages and the longest night count only the next 30 days from the chosen time' +
      (shortWindow ? ' (data ends earlier, so the window is shorter).' : '.');
  }

  closeBtn.addEventListener('click', () => { dismissed = true; render(); });

  return {
    // slot: 'A' или 'B'
    setSlot(slot, lat, lon) {
      slots[slot] = { lat, lon, label: labelFor(lat, lon) };
      dismissed = false;
      render();
    },
    // Вызывается, когда меняется время (панель времени)
    setTime(newMs) {
      ms = newMs;
      render();
    },
  };
}

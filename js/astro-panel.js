// Панель «Солнце и Земля в выбранной точке»: время (UTC), высота Солнца и Земли над горизонтом,
// ближайшие восход/закат, прямая видимость Земли (связь) и график на 30 суток вперёд.
// Не зависит от three.js. Всё создаётся кодом, поэтому в HTML ничего добавлять не нужно.
import { conditionsAt, nextCrossing, elevationSeries, inDataRange } from './astro.js';

const SUN_COLOR = '#f8f4e3';
const EARTH_COLOR = '#7aa2ff';
const CHART_DAYS = 30;

const pad = n => String(n).padStart(2, '0');

function fmtUtc(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
         `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
const toInputValue = ms => new Date(ms).toISOString().slice(0, 16);   // для <input type="datetime-local">
const fromInputValue = v => Date.parse(v.length === 16 ? v + ':00Z' : v + 'Z');   // читаем как UTC

function fmtDuration(ms) {
  const mins = Math.round(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}
const fmtDeg = v => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}°`;

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function createAstroPanel(eph) {
  const style = document.createElement('style');
  style.textContent = `
    .astro-panel {
      position: fixed; top: 96px; right: 16px; z-index: 20;
      width: 320px; max-width: calc(100vw - 32px); max-height: calc(100vh - 112px); overflow: auto;
      box-sizing: border-box; padding: 12px 14px;
      background: rgba(10, 14, 22, 0.92); color: #e8edf5;
      border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 12px;
      font: 13px/1.45 system-ui, sans-serif;
      opacity: 0; transform: translateY(-8px); pointer-events: none;
      transition: opacity .3s ease, transform .3s ease;
    }
    .astro-panel.open { opacity: 1; transform: none; pointer-events: auto; }
    .astro-panel h3 { margin: 0 0 8px; font-size: 15px; }
    .astro-panel .time { display: flex; gap: 6px; align-items: center; margin-bottom: 8px; }
    .astro-panel input {
      flex: 1; min-width: 0; padding: 4px 6px; color: #e8edf5; background: #141b29;
      border: 1px solid rgba(255,255,255,.25); border-radius: 6px; font: inherit;
      color-scheme: dark;
    }
    .astro-panel button {
      padding: 4px 10px; color: #e8edf5; background: #1d2740; cursor: pointer;
      border: 1px solid rgba(255,255,255,.25); border-radius: 6px; font: inherit;
    }
    .astro-panel dl { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; margin: 0 0 8px; }
    .astro-panel dt { color: #9fb0c8; }
    .astro-panel dd { margin: 0; text-align: right; }
    .astro-panel .status { color: #9fb0c8; margin: 0 0 6px; }
    .astro-panel canvas { display: block; margin-top: 4px; }
    .astro-panel .legend { display: flex; gap: 12px; color: #9fb0c8; font-size: 11px; margin-top: 4px; }
    .astro-panel .note { color: #7f8fa6; font-size: 11px; margin-top: 6px; }
  `;
  document.head.appendChild(style);

  // --- Разметка ---
  const el = make('div', 'astro-panel');
  el.appendChild(make('h3', '', 'Sun & Earth at this point'));

  const timeRow = make('div', 'time');
  const input = make('input');
  input.type = 'datetime-local';
  input.min = toInputValue(eph.startMs);
  input.max = toInputValue(eph.endMs);
  input.setAttribute('aria-label', 'Time, UTC');
  const nowBtn = make('button', '', 'Now');
  timeRow.append(make('span', '', 'UTC'), input, nowBtn);
  el.appendChild(timeRow);

  const status = make('p', 'status');
  el.appendChild(status);

  const list = make('dl');
  function row(label) {
    const dt = make('dt', '', label);
    const dd = make('dd', '', '–');
    list.append(dt, dd);
    return { dt, dd };
  }
  const sunRow = row('Sun');
  const sunEventRow = row('Sunrise / sunset');
  const earthRow = row('Earth');
  const earthEventRow = row('Earthrise / Earthset');
  const linkRow = row('Direct link to Earth');
  el.appendChild(list);

  el.appendChild(make('div', 'legend'));   // заполняем ниже
  const legend = el.lastChild;
  for (const [name, color] of [['Sun elevation', SUN_COLOR], ['Earth elevation', EARTH_COLOR]]) {
    const item = make('span', '', '● ' + name);
    item.style.color = color;
    legend.appendChild(item);
  }
  const canvas = make('canvas');
  el.insertBefore(canvas, legend);
  el.appendChild(make('div', 'note',
    `Next ${CHART_DAYS} days from the chosen time. Flat horizon, no terrain: mountains and crater walls ` +
    'can shorten daylight and block the view of Earth.'));
  document.body.appendChild(el);

  // --- Состояние ---
  let lat = null;
  let lon = null;
  let ms = inDataRange(eph, Date.now()) ? Date.now() : eph.startMs;
  input.value = toInputValue(ms);

  function drawChart(series) {
    const W = 286;
    const H = 100;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const n = series.timesMs.length;
    if (n < 2) return;
    const padL = 28, padR = 4, padT = 6, padB = 16;
    const t0 = series.timesMs[0];
    const t1 = series.timesMs[n - 1];
    const x = i => padL + ((series.timesMs[i] - t0) / (t1 - t0)) * (W - padL - padR);
    const y = e => padT + ((90 - e) / 180) * (H - padT - padB);

    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = '#7f8fa6';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
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

    function line(values, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      let pen = false;
      values.forEach((v, i) => {
        if (v === null) { pen = false; return; }
        if (pen) ctx.lineTo(x(i), y(v)); else ctx.moveTo(x(i), y(v));
        pen = true;
      });
      ctx.stroke();
    }
    line(series.earth, EARTH_COLOR);
    line(series.sun, SUN_COLOR);
  }

  function eventText(crossing, ms) {
    return crossing
      ? `in ${fmtDuration(crossing.timeMs - ms)} (${fmtUtc(crossing.timeMs)})`
      : 'not within the next 31 days';
  }

  function render() {
    if (lat === null) return;
    const c = Number.isFinite(ms) ? conditionsAt(eph, lat, lon, ms) : null;
    if (!c) {
      status.textContent = `No data for this time. Data covers ${fmtUtc(eph.startMs)} – ${fmtUtc(eph.endMs)}.`;
      for (const r of [sunRow, sunEventRow, earthRow, earthEventRow, linkRow]) r.dd.textContent = '–';
      drawChart({ timesMs: [] });
      return;
    }
    status.textContent = '';

    sunRow.dd.textContent = `${fmtDeg(c.sunElevation)} · ${c.sunUp ? 'day' : 'night'}`;
    earthRow.dd.textContent = `${fmtDeg(c.earthElevation)} · ${c.earthUp ? 'above horizon' : 'below horizon'}`;
    linkRow.dd.textContent = c.earthUp ? 'Yes' : 'No (Earth below horizon)';

    const sunX = nextCrossing(eph, 'sun', lat, lon, ms);
    sunEventRow.dt.textContent = sunX ? (sunX.rising ? 'Next sunrise' : 'Next sunset') : 'Sunrise / sunset';
    sunEventRow.dd.textContent = eventText(sunX, ms);

    const earthX = nextCrossing(eph, 'earth', lat, lon, ms);
    earthEventRow.dt.textContent = earthX ? (earthX.rising ? 'Next Earthrise' : 'Next Earthset') : 'Earthrise / Earthset';
    earthEventRow.dd.textContent = eventText(earthX, ms);

    drawChart(elevationSeries(eph, lat, lon, ms, CHART_DAYS * 24, 60));
  }

  input.addEventListener('change', () => {
    ms = fromInputValue(input.value);
    render();
  });
  nowBtn.addEventListener('click', () => {
    ms = inDataRange(eph, Date.now()) ? Date.now() : eph.startMs;
    input.value = toInputValue(ms);
    render();
  });

  return {
    // Вызывается, когда выбрана точка на Луне
    setPoint(newLat, newLon) {
      lat = newLat;
      lon = newLon;
      el.classList.add('open');
      render();
    },
  };
}

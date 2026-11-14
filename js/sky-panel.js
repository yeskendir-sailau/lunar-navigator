// Окно «Небо над точкой»: развёрнутый горизонт (азимут 0–360°, слева направо: С, В, Ю, З),
// линия рельефа (если есть маска LOLA) или ровный горизонт, где сейчас Солнце и Земля,
// и их путь на ближайшие 15 суток (точки — каждые земные сутки). Не зависит от three.js.
import { directionAt, elevationDeg, azimuthDeg } from './astro.js';
import { maskElevationAt } from './horizon.js';
import { fmtUtc, fmtDeg } from './format.js';
import { addFold } from './panel-fold.js';

const PATH_DAYS = 15;
const STEP_H = 2;

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function palette() {
  return document.documentElement.dataset.theme === 'light'
    ? { sun: '#c77d00', earth: '#2f5fd0', text: '#566173', grid: 'rgba(0,0,0,0.10)', zero: 'rgba(0,0,0,0.45)',
        ground: 'rgba(120, 110, 95, 0.45)', groundLine: '#6b5f4e', sky: 'rgba(0,0,0,0.03)' }
    : { sun: '#ffd34d', earth: '#7aa2ff', text: '#9fb0c8', grid: 'rgba(255,255,255,0.10)', zero: 'rgba(255,255,255,0.45)',
        ground: 'rgba(150, 140, 125, 0.40)', groundLine: '#c9bba5', sky: 'rgba(255,255,255,0.03)' };
}

// getMask(lat, lon) — маска горизонта или null
export function createSkyPanel(eph, { getMask } = {}) {
  const style = document.createElement('style');
  style.textContent = `
    .sky-panel {
      position: fixed; top: 104px; left: 50%; transform: translate(-50%, -8px); z-index: 30;
      width: clamp(420px, calc(100vw - 780px), 600px); box-sizing: border-box; padding: 10px 12px 10px;
      background: rgba(10, 14, 22, 0.94); color: #e8edf5;
      border: 1px solid rgba(255,255,255,.18); border-radius: 12px; font: 13px/1.45 system-ui, sans-serif;
      opacity: 0; pointer-events: none; transition: opacity .3s ease, transform .3s ease;
    }
    .sky-panel.open { opacity: 1; pointer-events: auto; transform: translate(-50%, 0); }
    .sky-panel .head { display: flex; align-items: center; gap: 6px; }
    .sky-panel h3 { margin: 0; font-size: 15px; margin-right: auto; }
    .sky-panel .close { width: 28px; height: 28px; padding: 0; cursor: pointer; color: inherit; background: #1d2740;
      border: 1px solid rgba(255,255,255,.25); border-radius: 6px; font: 600 14px system-ui, sans-serif; }
    .sky-panel canvas { display: block; width: 100%; margin-top: 6px; }
    .sky-panel .now { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 4px; font-size: 12px; }
    .sky-panel .note { color: #7f8fa6; font-size: 11px; margin-top: 4px; }
    @media (max-width: 1100px) { .sky-panel { width: calc(100vw - 32px); top: auto; bottom: 16px; } }
    html[data-theme="light"] .sky-panel { background: rgba(238, 240, 244, 0.95); color: #1d2430; border-color: rgba(30,40,60,.18); }
    html[data-theme="light"] .sky-panel .close { background: #dde1e8; border-color: rgba(30,40,60,.25); }
  `;
  document.head.appendChild(style);

  const el = make('div', 'sky-panel');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Sky above this point');
  const head = make('div', 'head');
  head.appendChild(make('h3', '', 'Sky above this point'));
  const close = make('button', 'close', '×');
  close.setAttribute('aria-label', 'Close the sky view');
  head.appendChild(close);
  const canvas = make('canvas');
  canvas.setAttribute('role', 'img');
  const nowLine = make('div', 'now');
  const sunNow = make('span');
  const earthNow = make('span');
  nowLine.append(sunNow, earthNow);
  const note = make('div', 'note');
  el.append(head, canvas, nowLine, note);
  addFold(el, head, [], { before: close });
  document.body.appendChild(el);

  let lat = null, lon = null, ms = NaN, isOpen = false;

  function sample(body, t) {
    const dir = directionAt(eph, body, t);
    return dir ? { az: azimuthDeg(dir, lat, lon), el: elevationDeg(dir, lat, lon) } : null;
  }

  function draw() {
    if (!isOpen || lat === null) return;
    const mask = getMask?.(lat, lon) ?? null;
    const c = palette();
    const W = canvas.clientWidth || 560;
    const H = 230;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.height = H + 'px';
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    // Пути Солнца и Земли на PATH_DAYS суток вперёд
    const paths = { sun: [], earth: [] };
    for (let h = 0; h <= PATH_DAYS * 24; h += STEP_H) {
      const t = ms + h * 3600e3;
      for (const body of ['sun', 'earth']) {
        const p = sample(body, t);
        if (p) paths[body].push({ ...p, h });
      }
    }
    const now = { sun: sample('sun', ms), earth: sample('earth', ms) };

    // Масштаб по высоте: от -10° до чуть выше самого высокого (Солнце, Земля, рельеф), не больше 90°
    const terrainMax = mask ? Math.max(...mask.values) : 0;
    const top = Math.min(90, Math.max(10, terrainMax + 3,
      ...paths.sun.map(p => p.el + 3), ...paths.earth.map(p => p.el + 3)));
    const bottom = -10;
    const padL = 34, padR = 8, padT = 8, padB = 22;
    const x = az => padL + (az / 360) * (W - padL - padR);
    const y = e => padT + ((top - Math.max(bottom, Math.min(top, e))) / (top - bottom)) * (H - padT - padB);

    g.fillStyle = c.sky;
    g.fillRect(padL, padT, W - padL - padR, H - padT - padB);
    // сетка: высоты и стороны света
    g.font = '10px system-ui, sans-serif';
    g.fillStyle = c.text;
    g.textAlign = 'right'; g.textBaseline = 'middle';
    const stepE = top > 45 ? 30 : top > 20 ? 10 : 5;
    for (let e = Math.ceil(bottom / stepE) * stepE; e <= top; e += stepE) {
      g.strokeStyle = e === 0 ? c.zero : c.grid;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(padL, y(e)); g.lineTo(W - padR, y(e)); g.stroke();
      g.fillText(`${e}°`, padL - 4, y(e));
    }
    g.textAlign = 'center'; g.textBaseline = 'top';
    [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315], ['N', 360]].forEach(([name, az]) => {
      g.strokeStyle = c.grid;
      g.beginPath(); g.moveTo(x(az), padT); g.lineTo(x(az), H - padB); g.stroke();
      g.fillText(name, Math.min(Math.max(x(az), padL + 6), W - padR - 6), H - padB + 5);
    });

    // земля: рельеф или ровный горизонт
    g.beginPath();
    g.moveTo(x(0), y(bottom));
    for (let az = 0; az <= 360; az += 1) g.lineTo(x(az), y(mask ? maskElevationAt(mask, az) : 0));
    g.lineTo(x(360), y(bottom));
    g.closePath();
    g.fillStyle = c.ground;
    g.fill();
    g.strokeStyle = c.groundLine;
    g.lineWidth = 1.5;
    g.beginPath();
    for (let az = 0; az <= 360; az += 1) {
      const yy = y(mask ? maskElevationAt(mask, az) : 0);
      if (az === 0) g.moveTo(x(az), yy); else g.lineTo(x(az), yy);
    }
    g.stroke();

    // пути: линия (разрываем при переходе через север 360 -> 0) и точки каждые сутки
    function path(points, color) {
      g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 1.6; g.globalAlpha = 0.85;
      g.beginPath();
      let prev = null;
      for (const p of points) {
        if (p.el < bottom) { prev = null; continue; }
        if (prev && Math.abs(p.az - prev.az) < 180) g.lineTo(x(p.az), y(p.el));
        else g.moveTo(x(p.az), y(p.el));
        prev = p;
      }
      g.stroke();
      for (const p of points) {
        if (p.h % 24 === 0 && p.el >= bottom) { g.beginPath(); g.arc(x(p.az), y(p.el), 2.2, 0, Math.PI * 2); g.fill(); }
      }
      g.globalAlpha = 1;
    }
    path(paths.sun, c.sun);
    path(paths.earth, c.earth);

    // сейчас: большие кружки с подписью
    for (const [body, label] of [['sun', 'Sun'], ['earth', 'Earth']]) {
      const p = now[body];
      if (!p) continue;
      const yy = y(p.el);
      g.fillStyle = c[body];
      g.strokeStyle = document.documentElement.dataset.theme === 'light' ? '#fff' : '#0b0f17';
      g.lineWidth = 2;
      g.beginPath(); g.arc(x(p.az), yy, 6.5, 0, Math.PI * 2); g.fill(); g.stroke();
      g.font = '600 11px system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.fillText(p.el < bottom ? `${label} ↓` : label, x(p.az), yy - 8);
    }

    const above = (p, body) => {
      if (!p) return '–';
      const limit = mask ? maskElevationAt(mask, p.az) : 0;
      return `${fmtDeg(p.el)} at ${Math.round(p.az)}° · ${p.el > limit ? 'above' : 'below'} the ${mask ? 'terrain' : 'horizon'}`;
    };
    sunNow.textContent = `☀ Sun: ${above(now.sun, 'sun')}`;
    earthNow.textContent = `● Earth: ${above(now.earth, 'earth')}`;
    sunNow.style.color = c.sun;
    earthNow.style.color = c.earth;
    canvas.setAttribute('aria-label', `Horizon view. Sun ${above(now.sun)}. Earth ${above(now.earth)}.`);
    note.textContent = `${fmtUtc(ms)}. Lines: paths for the next ${PATH_DAYS} days, dots = every Earth day. ` +
      (mask ? 'Brown area: real terrain horizon from LOLA.' : 'Flat horizon: no terrain data for this point.') +
      ' Azimuth is measured from north, clockwise.';
  }

  close.addEventListener('click', () => { isOpen = false; el.classList.remove('open'); });
  window.addEventListener('themechange', draw);
  window.addEventListener('resize', draw);

  return {
    open() { isOpen = true; el.classList.add('open'); draw(); },
    toggle() { if (isOpen) close.click(); else this.open(); },
    setPoint(newLat, newLon) { lat = newLat; lon = newLon; draw(); },
    setTime(newMs) { ms = newMs; draw(); },
  };
}

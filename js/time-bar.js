// Панель времени (вверху по центру): дата и время в UTC, кнопка Now и воспроизведение с ускорением.
// Не зависит от three.js. Сообщает о времени через onTime(ms, isPlaying).
import { inDataRange } from './astro.js';

const pad = n => String(n).padStart(2, '0');
const toInputValue = ms => new Date(ms).toISOString().slice(0, 16);   // для <input type="datetime-local">
const fromInputValue = v => Date.parse(v.length === 16 ? v + ':00Z' : v + 'Z');   // читаем как UTC

const SPEEDS = [          // [секунд модельного времени за 1 секунду экрана, подпись]
  [3600, '1 hour / s'],
  [6 * 3600, '6 hours / s'],
  [86400, '1 day / s'],
  [3 * 86400, '3 days / s'],
];

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function createTimeBar(eph, { onTime }) {
  const style = document.createElement('style');
  style.textContent = `
    .time-bar {
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 20;
      display: flex; gap: 6px; align-items: center; padding: 8px 10px;
      background: rgba(10, 14, 22, 0.92); color: #e8edf5;
      border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 12px;
      font: 13px/1.4 system-ui, sans-serif;
    }
    .time-bar input, .time-bar select {
      padding: 5px 6px; color: #e8edf5; background: #141b29; color-scheme: dark;
      border: 1px solid rgba(255,255,255,.25); border-radius: 6px; font: inherit;
    }
    .time-bar button {
      padding: 5px 10px; color: #e8edf5; background: #1d2740; cursor: pointer;
      border: 1px solid rgba(255,255,255,.25); border-radius: 6px; font: inherit;
    }
    .time-bar .play { min-width: 58px; }
    @media (max-width: 1100px) {
      .time-bar { top: 76px; left: 16px; transform: none; flex-wrap: wrap; max-width: calc(100vw - 32px); }
    }
  `;
  document.head.appendChild(style);

  const bar = make('div', 'time-bar');
  const input = make('input');
  input.type = 'datetime-local';
  input.min = toInputValue(eph.startMs);
  input.max = toInputValue(eph.endMs);
  input.setAttribute('aria-label', 'Time, UTC');
  const nowBtn = make('button', '', 'Now');
  const playBtn = make('button', 'play', 'Play');
  const speed = make('select');
  speed.setAttribute('aria-label', 'Playback speed');
  for (const [seconds, label] of SPEEDS) {
    const option = make('option', '', label);
    option.value = String(seconds);
    speed.appendChild(option);
  }
  speed.value = String(86400);
  bar.append(make('span', '', 'UTC'), input, nowBtn, playBtn, speed);
  document.body.appendChild(bar);

  let ms = inDataRange(eph, Date.now()) ? Date.now() : eph.startMs;
  let playing = false;
  let last = 0;
  let raf = 0;

  function set(newMs) {
    ms = Math.min(Math.max(newMs, eph.startMs), eph.endMs);
    input.value = toInputValue(ms);
    onTime(ms, playing);
  }

  function frame(now) {
    if (!playing) return;
    const dt = Math.min((now - last) / 1000, 0.1);   // если вкладка спала, не прыгаем сразу далеко
    last = now;
    set(ms + dt * Number(speed.value) * 1000);
    if (ms >= eph.endMs) { stop(); return; }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (ms >= eph.endMs) set(eph.startMs);   // дошли до конца данных — начинаем сначала
    playing = true;
    playBtn.textContent = 'Pause';
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    playing = false;
    cancelAnimationFrame(raf);
    playBtn.textContent = 'Play';
    onTime(ms, false);   // финальное точное обновление
  }

  playBtn.addEventListener('click', () => (playing ? stop() : start()));
  nowBtn.addEventListener('click', () => {
    if (playing) stop();
    set(inDataRange(eph, Date.now()) ? Date.now() : eph.startMs);
  });
  input.addEventListener('change', () => {
    if (playing) stop();
    const value = fromInputValue(input.value);
    if (Number.isFinite(value)) set(value); else input.value = toInputValue(ms);
  });

  set(ms);   // первое обновление: свет и панель сразу получают текущее время

  return { getTime: () => ms };
}

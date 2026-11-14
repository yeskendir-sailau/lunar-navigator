// Кнопки вида (справа внизу): «Реальный свет / Полный свет» и «Вид с Земли».
// Не зависит от three.js: сами действия передаются из main.js.
function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// onLight('real' | 'full'); onEarthView() — камера на линию Луна–Земля
export function createViewControls({ onLight, onEarthView, hasEarth }) {
  const style = document.createElement('style');
  style.textContent = `
    .view-controls {
      position: fixed; right: 16px; bottom: 16px; z-index: 20;
      display: flex; gap: 6px; align-items: center; padding: 8px 10px; flex-wrap: wrap; justify-content: flex-end;
      background: rgba(10, 14, 22, 0.92); color: #e8edf5; max-width: calc(100vw - 32px); box-sizing: border-box;
      border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 12px;
      font: 13px/1.4 system-ui, sans-serif;
    }
    .view-controls button {
      padding: 5px 10px; color: #e8edf5; background: #1d2740; cursor: pointer;
      border: 1px solid rgba(255,255,255,.25); border-radius: 6px; font: inherit;
    }
    .view-controls button[aria-pressed="true"] { background: #4cc9f0; color: #0b0f17; border-color: #4cc9f0; }
    .view-controls .note { color: #7f8fa6; font-size: 11px; flex-basis: 100%; text-align: right; }
    @media (max-width: 1100px) { .view-controls { bottom: auto; top: 128px; right: 16px; } }
  `;
  document.head.appendChild(style);

  const box = make('div', 'view-controls');
  const real = make('button', '', 'Real light');
  const full = make('button', '', 'Full light');
  real.setAttribute('aria-pressed', 'true');
  full.setAttribute('aria-pressed', 'false');
  const earth = make('button', '', 'View from Earth');
  earth.disabled = !hasEarth;
  earth.title = hasEarth ? 'Look at the Moon from Earth, as we see its phase' : 'No Earth data loaded';

  function setMode(mode) {
    real.setAttribute('aria-pressed', String(mode === 'real'));
    full.setAttribute('aria-pressed', String(mode === 'full'));
    onLight?.(mode);
  }
  real.addEventListener('click', () => setMode('real'));
  full.addEventListener('click', () => setMode('full'));
  earth.addEventListener('click', () => onEarthView?.());

  box.append(real, full, earth,
    make('span', 'note', 'Smooth sphere: shows the phase, not mountain shadows.'));
  document.body.appendChild(box);
  return { setMode };
}

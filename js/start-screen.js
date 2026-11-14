// Главный экран с кнопкой «Start» поверх Луны. Включается только на страницах с <body data-start>.
function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function createStartScreen({ onStart } = {}) {
  const style = document.createElement('style');
  style.textContent = `
    .start-screen {
      position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 24px; text-align: center;
      background: radial-gradient(ellipse at center, rgba(5,8,14,.55) 0%, rgba(5,8,14,.93) 75%);
      color: var(--text, #e8edf5); font: 16px/1.55 system-ui, sans-serif; transition: opacity .6s ease;
    }
    .start-screen.leaving { opacity: 0; pointer-events: none; }
    .start-screen .inner { max-width: 560px; }
    .start-screen h1 { margin: 0 0 8px; font-size: clamp(30px, 6vw, 48px); letter-spacing: .02em; }
    .start-screen p { margin: 0 0 12px; color: var(--text2, #c4cfe0); }
    .start-screen .lights { display: inline-flex; gap: 10px; margin: 6px 0 18px; }
    .start-screen .lights span { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px;
      border-radius: 999px; background: var(--fill, rgba(255,255,255,.08)); font-size: 14px; }
    .start-screen .dot { width: 18px; height: 18px; border-radius: 50%; display: inline-grid; place-items: center;
      color: #0b0f17; font-weight: 700; font-size: 12px; }
    .start-screen button { padding: 12px 36px; font: 600 18px system-ui, sans-serif; color: #0b0f17;
      background: var(--accent, #4cc9f0); border: 0; border-radius: 999px; cursor: pointer; }
    .start-screen button:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }
    .start-screen .small { margin-top: 18px; font-size: 12px; color: var(--muted2, #7f8fa6); }
  `;
  document.head.appendChild(style);

  const el = make('div', 'start-screen');
  const inner = make('div', 'inner');
  inner.append(
    make('h1', '', 'Lunar Navigator'),
    make('p', '', 'Pick a spot on the Moon and a date. Get a traffic-light report: ' +
      'is there enough sunlight, can you see Earth, and is it safe for the sites that are already there?'),
  );
  const lights = make('div', 'lights');
  for (const [icon, word, color] of [['✓', 'Good', '#2ecc71'], ['!', 'Caution', '#f1c40f'], ['✕', 'Not recommended', '#e74c3c']]) {
    const chip = make('span');
    const dot = make('span', 'dot', icon);
    dot.style.background = color;
    chip.append(dot, document.createTextNode(word));
    lights.appendChild(chip);
  }
  const start = make('button', '', 'Start');
  start.type = 'button';
  inner.append(lights, make('br'), start,
    make('div', 'small', 'Data: NASA, JPL. Thresholds are our own choice and are explained inside. Not for real mission planning.'));
  el.appendChild(inner);
  document.body.appendChild(el);
  start.focus();

  function go() {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 700);
    onStart?.();
  }
  start.addEventListener('click', go);
  return { close: go };
}

// Стартовый экран поверх 3D-космоса (сам космос и Луну рисует js/intro.js).
// Текст наклоняется за курсором (3D-эффект: слои на разной «глубине»).
// По кнопке START: текст улетает, onLaunch() запускает полёт камеры (Promise), потом вызывается onStart().
// Включается только на страницах с <body data-start>.

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function createStartScreen({ onStart, onLaunch } = {}) {
  const style = document.createElement('style');
  style.textContent = `
    /* пока идёт вступление, панели сайта спрятаны и потом плавно появляются */
    body.intro .time-bar, body.intro .coords-box, body.intro .view-controls, body.intro .top-tools {
      opacity: 0 !important; pointer-events: none !important;
    }
    .time-bar, .coords-box, .view-controls, .top-tools { transition: opacity .9s ease; }

    .start-screen {
      position: fixed; inset: 0; z-index: 100; display: flex; align-items: center;
      padding: 0 7vw; box-sizing: border-box; perspective: 1100px;
      color: #fff; font: 16px/1.55 system-ui, -apple-system, 'Segoe UI', sans-serif;
      background: radial-gradient(120% 95% at 82% 78%, rgba(3,4,12,0) 0%, rgba(3,4,12,.18) 50%, rgba(3,4,12,.72) 100%);
      transition: background .9s ease;
    }
    .start-screen.leaving { background: transparent; pointer-events: none; }
    .start-screen .inner {
      max-width: min(780px, 92vw); transform-style: preserve-3d; will-change: transform;
      transform: rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg));
    }
    .start-screen.leaving .inner {
      opacity: 0; filter: blur(10px);
      transform: translate3d(-12%, -6%, 320px) rotateY(18deg) scale(1.1);
      transition: transform 1.1s cubic-bezier(.6,0,.2,1), opacity .8s ease, filter .8s ease;
    }
    .start-screen .kicker {
      transform: translateZ(40px); margin: 0; font-size: 13px; font-weight: 800; letter-spacing: .38em; text-transform: uppercase;
      color: #7df9ff; text-shadow: 0 0 14px rgba(125,249,255,.85);
    }
    .start-screen h1 {
      transform: translateZ(95px); margin: 10px 0 18px; padding-right: .08em; font-size: clamp(42px, 6.8vw, 100px); line-height: .92;
      font-weight: 900; letter-spacing: -.015em; text-transform: uppercase;
      background: linear-gradient(100deg, #7df9ff 0%, #8b7bff 35%, #ff5ecf 65%, #ffb86b 85%, #7df9ff 100%);
      background-size: 220% auto; -webkit-background-clip: text; background-clip: text; color: transparent;
      filter: drop-shadow(0 0 24px rgba(139,123,255,.55)) drop-shadow(0 4px 18px rgba(0,0,0,.6));
      animation: start-shimmer 9s linear infinite;
    }
    .start-screen p {
      transform: translateZ(55px); margin: 0 0 18px; max-width: 540px; font-size: 18px; color: #e3eaff;
      text-shadow: 0 2px 14px rgba(0,0,0,.85);
    }
    .start-screen .lights { transform: translateZ(65px); display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 30px; }
    .start-screen .lights span {
      display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px 6px 8px; border-radius: 999px; font-size: 14px; font-weight: 600;
      background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.2);
      -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
    }
    .start-screen .dot {
      width: 20px; height: 20px; border-radius: 50%; display: inline-grid; place-items: center;
      color: #0b0f17; font-weight: 800; font-size: 12px; box-shadow: 0 0 12px currentColor;
    }
    .start-screen button.go {
      transform: translateZ(120px); padding: 17px 54px; cursor: pointer; border: 0; border-radius: 999px;
      font: 800 18px system-ui, sans-serif; letter-spacing: .32em; color: #fff;
      background: linear-gradient(90deg, #00d4ff, #7b2ff7 55%, #ff2e97);
      box-shadow: 0 0 28px rgba(123,47,247,.75), 0 0 70px rgba(0,212,255,.35), inset 0 0 0 1px rgba(255,255,255,.35);
      animation: start-pulse 2.6s ease-in-out infinite;
    }
    .start-screen button.go:hover { filter: brightness(1.15); }
    .start-screen button.go:focus-visible { outline: 3px solid #fff; outline-offset: 4px; }
    .start-screen .small { transform: translateZ(20px); margin-top: 38px; font-size: 12px; color: #a9b6dc; text-shadow: 0 1px 8px #000; }
    @keyframes start-shimmer { to { background-position: 220% center; } }
    @keyframes start-pulse {
      0%, 100% { box-shadow: 0 0 28px rgba(123,47,247,.75), 0 0 70px rgba(0,212,255,.35), inset 0 0 0 1px rgba(255,255,255,.35); }
      50% { box-shadow: 0 0 40px rgba(255,46,151,.85), 0 0 100px rgba(123,47,247,.5), inset 0 0 0 1px rgba(255,255,255,.5); }
    }
    @media (max-width: 760px) {
      .start-screen { align-items: flex-start; padding: 12vh 22px 0; text-align: center; justify-content: center; }
      .start-screen .lights { justify-content: center; }
    }
    @media (prefers-reduced-motion: reduce) {
      .start-screen h1, .start-screen button.go { animation: none; }
    }
  `;
  document.head.appendChild(style);

  const el = make('div', 'start-screen');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Lunar Navigator start screen');
  const inner = make('div', 'inner');
  inner.append(
    make('div', 'kicker', 'NASA Space Apps Challenge 2026'),
    make('h1', '', 'Lunar Navigator'),
    make('p', '', 'Pick a spot on the Moon and a date. Get a traffic-light report: ' +
      'is there enough sunlight, can you see Earth, and is it safe for the sites that are already there?'),
  );
  const lights = make('div', 'lights');
  for (const [icon, word, color] of [['✓', 'Good', '#2ecc71'], ['!', 'Caution', '#f1c40f'], ['✕', 'Not recommended', '#e74c3c']]) {
    const chip = make('span');
    const dot = make('span', 'dot', icon);
    dot.style.background = color;
    dot.style.color = '#0b0f17';
    dot.style.boxShadow = `0 0 14px ${color}`;
    chip.append(dot, document.createTextNode(word));
    lights.appendChild(chip);
  }
  const start = make('button', 'go', 'START');
  start.type = 'button';
  inner.append(lights, start,
    make('div', 'small', 'Data: NASA, JPL. Thresholds are our own choice and are explained inside. Not for real mission planning.'));
  el.appendChild(inner);
  document.body.appendChild(el);
  start.focus();

  // Наклон текста за курсором (плавно, каждый кадр)
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const target = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  const onMove = e => {
    target.x = (e.clientX / window.innerWidth) * 2 - 1;
    target.y = (e.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener('pointermove', onMove);
  let raf = 0;
  function tilt() {
    cur.x += (target.x - cur.x) * 0.08;
    cur.y += (target.y - cur.y) * 0.08;
    if (!reduced) {
      inner.style.setProperty('--ry', `${(cur.x * 12).toFixed(2)}deg`);
      inner.style.setProperty('--rx', `${(-cur.y * 8).toFixed(2)}deg`);
    }
    raf = requestAnimationFrame(tilt);
  }
  tilt();

  let started = false;
  async function go() {
    if (started) return;
    started = true;
    el.classList.add('leaving');
    window.removeEventListener('pointermove', onMove);
    try { await onLaunch?.(); } catch (error) { console.error(error); }
    cancelAnimationFrame(raf);
    el.remove();
    onStart?.();
  }
  start.addEventListener('click', go);
  return { close: go };
}

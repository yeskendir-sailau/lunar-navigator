// Обучение по сайту: сначала вопрос «Пройти обучение?», потом по шагам подсвечиваем части сайта,
// а всё остальное размываем. 11 коротких шагов, примерно 1–1,5 минуты. Не зависит от three.js.
// Управление: кнопки Next / Back / Skip, клавиши → ← Enter Esc.

const STEPS = [
  { target: 'moon', title: 'The Moon in 3D',
    text: 'Drag to turn the Moon, scroll to zoom. Coloured dots are real sites: blue = historic landings, purple = recent landings, pink = impacts.' },
  { target: '.coords-box', title: 'Find a place',
    text: 'Type coordinates (for example -85.4, 31.2) or a site name (for example Apollo 11) and press Go.' },
  { target: '.time-bar', title: 'Choose a date',
    text: 'Pick a date and time in UTC (Earth time). Press Play to watch day and night move across the Moon.' },
  { target: '.report-card', title: 'The landing report',
    text: 'Click any spot on the Moon to get this report. The big colour is the worst of three checks: Energy, Communication and Neighbors.' },
  { target: ['.report-card .params', '.report-card .size-note'], title: 'Your lander',
    text: 'Landing accuracy (1σ) changes the keep-out distance around other sites. Lander size explains what class of craft you mean.' },
  { target: '.astro-panel dl', title: 'Sun and Earth now',
    text: 'How high the Sun and Earth are right now, and when the next sunrise or Earthrise happens, also in Earth time (UTC).' },
  { target: ['.astro-panel canvas', '.astro-panel .legend'], title: 'The next 30 days',
    text: 'Yellow line: the Sun. Blue line: Earth. Above 0° means above the horizon: light for solar panels, and a direct radio link.' },
  { target: '.astro-panel .pins', title: 'Compare places',
    text: 'Save up to three places as A, B and C. They get coloured rings on the Moon and appear side by side in a comparison table.' },
  { target: '.view-controls', title: 'Light and view',
    text: 'Real light shows the phase, Full light lights the whole Moon, View from Earth shows the Moon as we see it.' },
  { target: '.report-card .actions', title: 'Rules and PDF',
    text: '"How it is calculated" explains every rule. "Download PDF" saves the report with charts and the comparison table.' },
  { target: '.top-tools', title: 'Theme and help',
    text: 'Switch between the dark and the light grey theme here. The ? button replays this tour. Use − and + to fold any panel.' },
];

let styled = false;
function addStyle() {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = `
    .tour-blur {
      position: fixed; inset: 0; z-index: 90;
      background: rgba(5, 8, 14, 0.35);
      -webkit-backdrop-filter: blur(5px); backdrop-filter: blur(5px);
      }
    .tour-frame {
      position: fixed; z-index: 91; pointer-events: none; border-radius: 12px;
      border: 2px solid #4cc9f0; box-shadow: 0 0 0 4px rgba(76,201,240,.25), 0 0 24px rgba(76,201,240,.45);
      transition: all .35s ease;
    }
    .tour-tip, .tour-ask .box {
      position: fixed; z-index: 92; box-sizing: border-box; width: 320px; max-width: calc(100vw - 32px);
      padding: 14px 16px 12px; color: #e8edf5; background: rgba(10, 14, 22, 0.97);
      border: 1px solid rgba(255,255,255,.22); border-radius: 14px;
      font: 14px/1.5 system-ui, sans-serif; box-shadow: 0 10px 40px rgba(0,0,0,.45);
      transition: left .35s ease, top .35s ease;
    }
    .tour-tip h4, .tour-ask h4 { margin: 0 0 4px; font-size: 16px; }
    .tour-tip p, .tour-ask p { margin: 0 0 10px; }
    .tour-tip .bar { height: 4px; border-radius: 2px; background: rgba(127,143,166,.3); margin: 0 0 10px; overflow: hidden; }
    .tour-tip .bar span { display: block; height: 100%; background: #4cc9f0; transition: width .35s ease; }
    .tour-tip .row, .tour-ask .row { display: flex; align-items: center; gap: 8px; }
    .tour-tip .count { color: #9fb0c8; font-size: 12px; margin-right: auto; }
    .tour-tip button, .tour-ask button {
      padding: 6px 14px; cursor: pointer; font: 600 13px system-ui, sans-serif; border-radius: 999px;
      color: #e8edf5; background: #1d2740; border: 1px solid rgba(255,255,255,.25);
    }
    .tour-tip button.primary, .tour-ask button.primary { background: #4cc9f0; color: #0b0f17; border-color: #4cc9f0; }
    .tour-tip button.skip { background: transparent; border-color: transparent; color: #9fb0c8; padding: 6px 8px; }
    .tour-ask { position: fixed; inset: 0; z-index: 95; display: grid; place-items: center;
      background: rgba(5, 8, 14, 0.35); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); }
    .tour-ask .box { position: static; width: 380px; text-align: left; }
    .tour-ask .row { justify-content: flex-end; }
    html[data-theme="light"] .tour-tip .count, html[data-theme="light"] .tour-tip button.skip { color: #566173; }
    html[data-theme="light"] .tour-tip button:not(.primary):not(.skip), html[data-theme="light"] .tour-ask button:not(.primary) {
      background: #dde1e8; color: #1d2430; border-color: rgba(30,40,60,.25); }
    @media (prefers-reduced-motion: reduce) { .tour-blur, .tour-frame, .tour-tip { transition: none; } }
  `;
  document.head.appendChild(style);
}

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// Прямоугольник цели шага (или null, если её нет на экране)
function targetRect(target) {
  if (target === 'moon') {
    const s = Math.min(window.innerWidth, window.innerHeight) * 0.62;
    return { left: (window.innerWidth - s) / 2, top: (window.innerHeight - s) / 2, width: s, height: s, round: true };
  }
  const rects = [target].flat()
    .map(sel => document.querySelector(sel))
    .filter(el => el && el.getClientRects().length && getComputedStyle(el).display !== 'none' && getComputedStyle(el).opacity !== '0')
    .map(el => el.getBoundingClientRect())
    .filter(r => r.width > 0 && r.height > 0);
  if (!rects.length) return null;
  const left = Math.min(...rects.map(r => r.left));
  const top = Math.min(...rects.map(r => r.top));
  const right = Math.max(...rects.map(r => r.right));
  const bottom = Math.max(...rects.map(r => r.bottom));
  return { left, top, width: right - left, height: bottom - top };
}

// Вопрос «Пройти обучение?». onYes — запустить тур.
export function askTour({ onYes } = {}) {
  addStyle();
  const back = make('div', 'tour-ask');
  const box = make('div', 'box');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.append(make('h4', '', 'New here? Take a 1-minute tour'),
    make('p', '', 'We will show each part of the site with a short explanation. Everything else will be blurred. ' +
      'You can stop at any time; the ? button in the top right corner replays it.'));
  const row = make('div', 'row');
  const no = make('button', '', 'No, thanks');
  const yes = make('button', 'primary', 'Yes, show me');
  row.append(no, yes);
  box.appendChild(row);
  back.appendChild(box);
  document.body.appendChild(back);
  yes.focus();
  const close = () => back.remove();
  no.addEventListener('click', close);
  yes.addEventListener('click', () => { close(); onYes?.(); });
  back.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

// Сам тур. prepare() — подготовить сайт (выбрать точку, чтобы панели открылись), вызывается до первого шага.
let running = null;
export function runTour({ prepare } = {}) {
  if (running) return;
  addStyle();
  prepare?.();

  const blur = make('div', 'tour-blur');
  const frame = make('div', 'tour-frame');
  const tip = make('div', 'tour-tip');
  tip.setAttribute('role', 'dialog');
  tip.setAttribute('aria-live', 'polite');
  const title = make('h4');
  const text = make('p');
  const bar = make('div', 'bar');
  const fill = make('span');
  bar.appendChild(fill);
  const row = make('div', 'row');
  const count = make('span', 'count');
  const skip = make('button', 'skip', 'Skip');
  const backBtn = make('button', '', 'Back');
  const next = make('button', 'primary', 'Next');
  row.append(count, skip, backBtn, next);
  tip.append(title, text, bar, row);
  document.body.append(blur, frame, tip);

  let i = 0;
  let dir = 1;

  function place() {
    const step = STEPS[i];
    const r = targetRect(step.target);
    if (!r) {   // этой части нет на экране (например, узкий экран) — пропускаем шаг
      if (i + dir >= 0 && i + dir < STEPS.length) { i += dir; place(); return; }
      end(); return;
    }
    const pad = 8;
    const L = Math.max(0, r.left - pad), T = Math.max(0, r.top - pad);
    const R = Math.min(window.innerWidth, r.left + r.width + pad), B = Math.min(window.innerHeight, r.top + r.height + pad);
    // размытие везде, кроме «окна» вокруг цели
    const vw0 = window.innerWidth, vh0 = window.innerHeight;
    let hole;
    if (r.round) {   // круглое «окно» для Луны
      const cx = (L + R) / 2, cy = (T + B) / 2, rad = (R - L) / 2;
      hole = `M ${cx - rad} ${cy} A ${rad} ${rad} 0 1 0 ${cx + rad} ${cy} A ${rad} ${rad} 0 1 0 ${cx - rad} ${cy} Z`;
    } else {
      hole = `M ${L} ${T} H ${R} V ${B} H ${L} Z`;
    }
    blur.style.clipPath = `path(evenodd, "M 0 0 H ${vw0} V ${vh0} H 0 Z ${hole}")`;
    Object.assign(frame.style, { left: L + 'px', top: T + 'px', width: (R - L) + 'px', height: (B - T) + 'px',
      borderRadius: r.round ? '50%' : '12px' });

    title.textContent = step.title;
    text.textContent = step.text;
    count.textContent = `${i + 1} / ${STEPS.length}`;
    fill.style.width = `${((i + 1) / STEPS.length) * 100}%`;
    backBtn.disabled = i === 0;
    backBtn.style.visibility = i === 0 ? 'hidden' : 'visible';
    next.textContent = i === STEPS.length - 1 ? 'Finish' : 'Next';

    // подсказка рядом с целью: справа, слева, снизу или сверху — где хватает места
    const tw = tip.offsetWidth, th = tip.offsetHeight, gap = 16, vw = window.innerWidth, vh = window.innerHeight;
    let x, y;
    if (R + gap + tw <= vw - 8) { x = R + gap; y = T; }
    else if (L - gap - tw >= 8) { x = L - gap - tw; y = T; }
    else if (B + gap + th <= vh - 8) { x = L; y = B + gap; }
    else { x = L; y = T - gap - th; }
    x = Math.min(Math.max(8, x), vw - tw - 8);
    y = Math.min(Math.max(8, y), vh - th - 8);
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  function go(d) {
    dir = d;
    const n = i + d;
    if (n >= STEPS.length) { end(); return; }
    if (n < 0) return;
    i = n;
    place();
  }
  function onKey(e) {
    if (e.key === 'Escape') end();
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') go(-1);
  }
  const onResize = () => place();
  function end() {
    blur.remove(); frame.remove(); tip.remove();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    running = null;
  }

  next.addEventListener('click', () => go(1));
  backBtn.addEventListener('click', () => go(-1));
  skip.addEventListener('click', end);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  running = { end };
  // даём панелям открыться (у них плавное появление)
  setTimeout(() => { if (running) { place(); next.focus(); } }, prepare ? 700 : 0);
  place();
  return running;
}

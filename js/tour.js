// Обучение по сайту (около 1–1,5 минуты): вопрос «хотите пройти обучение?», затем подсвечиваются части сайта по очереди,
// а всё остальное размыто. Не зависит от three.js. Шаги описывает main.js (какой элемент, что сказать, что подготовить).
//   step = { target: 'css-селектор' | () => Element | { rect: {x,y,w,h} } | null, title, text, before?: async () => void, after?: () => void }
function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

const KEY = 'ln-tour';
const readSeen = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const saveSeen = v => { try { localStorage.setItem(KEY, v); } catch { /* ничего */ } };
const wait = ms => new Promise(r => setTimeout(r, ms));

export function createTour({ steps, onFinish }) {
  const style = document.createElement('style');
  style.textContent = `
    .tour-shade { position: fixed; inset: 0; z-index: 70; background: rgba(8, 12, 20, .42);
      -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); transition: clip-path .35s ease; }
    .tour-ring { position: fixed; z-index: 71; border-radius: 12px; border: 2px solid var(--accent, #4cc9f0);
      box-shadow: 0 0 0 4px rgba(70,180,222,.25), 0 0 24px rgba(70,180,222,.35); pointer-events: auto;
      transition: left .35s ease, top .35s ease, width .35s ease, height .35s ease; }
    .tour-pop { position: fixed; z-index: 72; width: min(340px, calc(100vw - 24px)); box-sizing: border-box; padding: 14px 16px 12px;
      color: var(--text, #e8edf5); background: var(--modal, #0d121c); border: 1px solid var(--line-strong, rgba(255,255,255,.25));
      border-radius: 14px; box-shadow: 0 10px 40px rgba(0,0,0,.35); font: 14px/1.5 system-ui, sans-serif; }
    .tour-pop h4 { margin: 0 0 4px; font-size: 16px; }
    .tour-pop p { margin: 0 0 10px; color: var(--text2, #c4cfe0); }
    .tour-pop .row { display: flex; align-items: center; gap: 8px; }
    .tour-pop .count { margin-right: auto; color: var(--muted, #9fb0c8); font-size: 12px; }
    .tour-pop button, .tour-ask button { padding: 6px 14px; font: 600 13px system-ui, sans-serif; cursor: pointer; border-radius: 8px;
      color: var(--text, #e8edf5); background: var(--btn, #1d2740); border: 1px solid var(--line-strong, rgba(255,255,255,.25)); }
    .tour-pop button.primary, .tour-ask button.primary { color: #0b0f17; background: var(--accent, #4cc9f0); border-color: var(--accent, #4cc9f0); }
    .tour-pop button.link { border: 0; background: none; color: var(--muted, #9fb0c8); padding: 6px 4px; }
    .tour-pop button:focus-visible, .tour-ask button:focus-visible { outline: 2px solid var(--accent, #4cc9f0); outline-offset: 2px; }
    .tour-bar { height: 3px; border-radius: 2px; background: var(--fill-strong, rgba(255,255,255,.12)); margin: 0 0 10px; overflow: hidden; }
    .tour-bar i { display: block; height: 100%; background: var(--accent, #4cc9f0); transition: width .3s ease; }
    .tour-ask { position: fixed; z-index: 72; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(380px, calc(100vw - 24px));
      box-sizing: border-box; padding: 20px 22px 18px; text-align: center; color: var(--text, #e8edf5); background: var(--modal, #0d121c);
      border: 1px solid var(--line-strong, rgba(255,255,255,.25)); border-radius: 16px; box-shadow: 0 12px 48px rgba(0,0,0,.4);
      font: 15px/1.5 system-ui, sans-serif; }
    .tour-ask h4 { margin: 0 0 6px; font-size: 18px; }
    .tour-ask p { margin: 0 0 14px; color: var(--text2, #c4cfe0); }
    .tour-ask .row { display: flex; gap: 10px; justify-content: center; }
    @media (prefers-reduced-motion: reduce) { .tour-shade, .tour-ring, .tour-bar i { transition: none; } }
  `;
  document.head.appendChild(style);

  let shade = null, ring = null, pop = null, ask = null;
  let index = 0, active = false, running = false, token = 0;
  let list = [];

  const visibleRect = el => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  };
  function targetRect(step) {
    const t = step.target;
    if (t === null || t === undefined) return { x: innerWidth / 2 - 1, y: innerHeight / 2 - 1, w: 2, h: 2, none: true };
    if (typeof t === 'string') return visibleRect(document.querySelector(t));
    if (typeof t === 'function') {
      const v = t();
      return v && v.getBoundingClientRect ? visibleRect(v) : v;
    }
    return t.rect ?? null;
  }

  function place(rect) {
    const pad = 8;
    const x1 = Math.max(0, rect.x - pad), y1 = Math.max(0, rect.y - pad);
    const x2 = Math.min(innerWidth, rect.x + rect.w + pad), y2 = Math.min(innerHeight, rect.y + rect.h + pad);
    if (rect.none) {
      shade.style.clipPath = 'none';
      ring.style.display = 'none';
    } else {
      shade.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${x1}px ${y1}px, ${x1}px ${y2}px, ${x2}px ${y2}px, ${x2}px ${y1}px, ${x1}px ${y1}px)`;
      ring.style.display = 'block';
      Object.assign(ring.style, { left: `${x1}px`, top: `${y1}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px` });
    }
    // Подсказка: рядом с подсвеченным местом (снизу, сверху, справа, слева), иначе в углу
    const w = pop.offsetWidth, h = pop.offsetHeight, gap = 14, m = 12;
    const fits = { below: y2 + gap + h <= innerHeight - m, above: y1 - gap - h >= m, right: x2 + gap + w <= innerWidth - m, left: x1 - gap - w >= m };
    let left, top;
    if (rect.none) { left = (innerWidth - w) / 2; top = innerHeight - h - 24; }
    else if (fits.below) { left = x1; top = y2 + gap; }
    else if (fits.above) { left = x1; top = y1 - gap - h; }
    else if (fits.right) { left = x2 + gap; top = y1; }
    else if (fits.left) { left = x1 - gap - w; top = y1; }
    else { left = (innerWidth - w) / 2; top = innerHeight - h - 16; }
    left = Math.max(m, Math.min(innerWidth - w - m, left));
    top = Math.max(m, Math.min(innerHeight - h - m, top));
    Object.assign(pop.style, { left: `${left}px`, top: `${top}px` });
  }

  async function show(i, dir = 1) {
    const my = ++token;
    index = i;
    while (index >= 0 && index < list.length) {
      const step = list[index];
      try { await step.before?.(); } catch (e) { console.warn('Tour step failed:', e.message); }
      await wait(step.before ? 650 : 120);
      if (my !== token || !active) return;
      const rect = targetRect(step);
      if (rect) {
        const n = list.length;
        pop.replaceChildren();
        const bar = make('div', 'tour-bar');
        bar.appendChild(make('i'));
        bar.firstChild.style.width = `${((index + 1) / n) * 100}%`;
        const row = make('div', 'row');
        const count = make('span', 'count', `${index + 1} / ${n}`);
        const skip = make('button', 'link', 'Skip tour');
        const back = make('button', '', 'Back');
        const next = make('button', 'primary', index === n - 1 ? 'Done' : 'Next');
        for (const b of [skip, back, next]) b.type = 'button';
        back.disabled = index === 0;
        back.style.opacity = index === 0 ? '.4' : '1';
        skip.addEventListener('click', () => finish(false));
        back.addEventListener('click', () => show(index - 1, -1));
        next.addEventListener('click', () => (index === n - 1 ? finish(true) : show(index + 1, 1)));
        row.append(count, skip, back, next);
        pop.append(bar, make('h4', '', step.title), make('p', '', step.text), row);
        pop.setAttribute('aria-label', step.title);
        place(rect);
        next.focus({ preventScroll: true });
        return;
      }
      index += dir;   // этого элемента сейчас нет на экране (например, на телефоне): пропускаем шаг
    }
    finish(true);
  }

  function onKey(e) {
    if (!active) return;
    if (e.key === 'Escape') finish(false);
    else if (e.key === 'ArrowRight') { e.preventDefault(); if (index < list.length - 1) show(index + 1, 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); if (index > 0) show(index - 1, -1); }
  }
  const onResize = () => { if (active && list[index]) { const r = targetRect(list[index]); if (r) place(r); } };

  async function finish(completed) {
    if (!active) return;
    active = false;
    token++;
    saveSeen('done');
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    shade?.remove(); ring?.remove(); pop?.remove();
    shade = ring = pop = null;
    for (const s of list) { try { s.after?.(); } catch { /* ничего */ } }
    onFinish?.(completed);
  }

  function start() {
    if (active) return;
    ask?.remove(); ask = null;
    list = steps();
    active = true;
    shade = make('div', 'tour-shade');
    ring = make('div', 'tour-ring');
    pop = make('div', 'tour-pop');
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-live', 'polite');
    document.body.append(shade, ring, pop);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    show(0, 1);
  }

  // Вопрос в начале: «Хотите пройти обучение?». Если пользователь уже отвечал, снова не спрашиваем (кнопка «?» всегда есть).
  function offer({ force = false } = {}) {
    if (active || ask) return;
    if (!force && readSeen()) return;
    ask = make('div', 'tour-ask');
    ask.setAttribute('role', 'dialog');
    ask.setAttribute('aria-label', 'Site tour');
    const yes = make('button', 'primary', 'Yes, show me');
    const no = make('button', '', 'No, thanks');
    yes.type = no.type = 'button';
    const row = make('div', 'row');
    row.append(yes, no);
    ask.append(make('h4', '', 'Take a quick tour?'),
      make('p', '', 'About a minute: we point out each part of the site and blur the rest. You can skip any time, and replay it with the ? button.'), row);
    const blur = make('div', 'tour-shade');
    document.body.append(blur, ask);
    yes.focus();
    const close = () => { ask?.remove(); blur.remove(); ask = null; };
    yes.addEventListener('click', () => { close(); start(); });
    no.addEventListener('click', () => { close(); saveSeen('skipped'); });
  }

  return { start, offer, isActive: () => active };
}

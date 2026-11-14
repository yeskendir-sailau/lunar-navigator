// Модуль 5 (часть 2): карточка места — фото, название, описание, источник.
// Не зависит от three.js. Всё создаётся кодом, поэтому в HTML ничего добавлять не нужно.

const PROJECT_ROOT = new URL('../', import.meta.url);   // папка проекта (над js/)

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;   // textContent безопасен: теги не выполняются
  return el;
}

// Пропускаем только обычные ссылки http/https (защита от странных адресов)
function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

export function createCard() {
  const style = document.createElement('style');
  style.textContent = `
    .site-card {
      position: fixed; left: 16px; bottom: 16px; z-index: 20;
      width: min(360px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto;
      background: var(--panel-solid, rgba(10,14,22,.92)); color: var(--text, #e8edf5);
      border: 1px solid var(--line, rgba(255,255,255,.18)); border-radius: 12px;
      font: 14px/1.5 system-ui, sans-serif;
      opacity: 0; transform: translateY(16px); pointer-events: none;
      transition: opacity .35s ease, transform .35s ease;
    }
    .site-card.open { opacity: 1; transform: none; pointer-events: auto; }
    .site-card img { display: block; width: 100%; max-height: 200px; object-fit: cover;
      border-radius: 12px 12px 0 0; }
    .site-card .body { padding: 12px 16px 14px; }
    .site-card h2 { margin: 0 0 2px; font-size: 20px; }
    .site-card .meta { color: var(--muted, #9fb0c8); font-size: 12px; margin-bottom: 8px; }
    .site-card p { margin: 0 0 10px; }
    .site-card .credit { color: var(--muted2, #7f8fa6); font-size: 11px; margin: 0 0 8px; }
    .site-card a { color: var(--accent-text, #4cc9f0); }
    .site-card button { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px;
      border: 0; border-radius: 50%; background: rgba(0,0,0,.55); color: #fff;
      font-size: 16px; cursor: pointer; }
  `;
  document.head.appendChild(style);

  const el = make('div', 'site-card');
  document.body.appendChild(el);

  function hide() {
    el.classList.remove('open');
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });

  function show(site) {
    el.replaceChildren();   // очищаем старое содержимое

    const close = make('button', '', '×');
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', hide);
    el.appendChild(close);

    if (site.photo) {
      const img = make('img');
      img.alt = site.name;
      img.addEventListener('error', () => img.remove());   // нет файла — просто без фото
      img.src = new URL(site.photo, PROJECT_ROOT).href;
      el.appendChild(img);
    }

    const body = make('div', 'body');
    body.appendChild(make('h2', '', site.name));
    const meta = [site.country, site.date, site.status].filter(Boolean).join(' · ');
    body.appendChild(make('div', 'meta', meta));
    if (site.description) body.appendChild(make('p', '', site.description));
    if (site.photo && site.photo_credit) {
      body.appendChild(make('div', 'credit', 'Photo: ' + site.photo_credit));
    }
    const href = safeUrl(site.source);
    if (href) {
      const a = make('a', '', 'Source');
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      body.appendChild(a);
    }
    el.appendChild(body);

    el.classList.add('open');
  }

  return { show, hide };
}

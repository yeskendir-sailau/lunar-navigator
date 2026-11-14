// Кнопки справа вверху: «?» (обучение по сайту) и переключатель темы (тёмная / светло-серая).
// Выбор темы запоминается в браузере (если браузер это разрешает).
import { setTheme } from './globe.js';

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

const KEY = 'ln-theme';
const readSaved = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const save = value => { try { localStorage.setItem(KEY, value); } catch { /* хранилище недоступно: не страшно */ } };

export function createToolbar({ onTour } = {}) {
  const style = document.createElement('style');
  style.textContent = `
    .toolbar { position: fixed; top: 16px; right: 16px; z-index: 25; display: flex; gap: 6px; }
    .toolbar button {
      width: 38px; height: 38px; padding: 0; display: grid; place-items: center; cursor: pointer;
      color: var(--text, #e8edf5); background: var(--panel-solid, rgba(10,14,22,.92));
      border: 1px solid var(--line, rgba(255,255,255,.18)); border-radius: 12px; font: 600 17px system-ui, sans-serif;
      -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
    }
    .toolbar button:hover { border-color: var(--accent, #4cc9f0); }
    @media (max-width: 700px) { body .coords-box { max-width: calc(100vw - 112px); } }
  `;
  document.head.appendChild(style);

  const box = make('div', 'toolbar');
  const help = make('button', '', '?');
  help.type = 'button';
  help.setAttribute('aria-label', 'Start the site tour');
  help.title = 'Site tour (about 1 minute)';
  const themeBtn = make('button');
  themeBtn.type = 'button';
  box.append(help, themeBtn);
  document.body.appendChild(box);

  let theme = readSaved() === 'light' ? 'light' : 'dark';
  function apply(next, announce) {
    theme = next;
    document.documentElement.dataset.theme = theme;
    setTheme(theme);
    themeBtn.textContent = theme === 'light' ? '☾' : '☀';
    themeBtn.setAttribute('aria-label', theme === 'light' ? 'Switch to dark theme' : 'Switch to light grey theme');
    themeBtn.title = themeBtn.getAttribute('aria-label');
    window.dispatchEvent(new Event('themechange'));
    if (announce) save(theme);
  }
  apply(theme, false);

  themeBtn.addEventListener('click', () => apply(theme === 'light' ? 'dark' : 'light', true));
  help.addEventListener('click', () => onTour?.());
  return { getTheme: () => theme, setTheme: t => apply(t, true) };
}

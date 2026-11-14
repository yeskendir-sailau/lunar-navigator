// Тема сайта: тёмная (космос) или светлая (светло-серая, под цвет Луны).
// Выбор запоминается в браузере. При смене темы шлём событие 'themechange', чтобы график и сцена перекрасились.
// Здесь же кнопки в правом верхнем углу: «?» (обучение) и переключатель темы.
const KEY = 'lunar-navigator-theme';

export function getTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function setTheme(mode) {
  document.documentElement.dataset.theme = mode === 'light' ? 'light' : 'dark';
  try { localStorage.setItem(KEY, getTheme()); } catch { /* память браузера недоступна — не страшно */ }
  window.dispatchEvent(new CustomEvent('themechange', { detail: getTheme() }));
}

// onHelp — что делать по кнопке «?» (запустить обучение)
export function createTopTools({ onHelp } = {}) {
  const style = document.createElement('style');
  style.textContent = `
    .top-tools { position: fixed; top: 16px; right: 16px; z-index: 25; display: flex; gap: 6px; }
    .top-tools button {
      height: 34px; padding: 0 12px; cursor: pointer; font: 600 13px/1 system-ui, sans-serif;
      color: #e8edf5; background: rgba(10, 14, 22, 0.92); border: 1px solid rgba(255,255,255,.25); border-radius: 999px;
    }
    .top-tools button.help { width: 34px; padding: 0; font-size: 16px; }
    .top-tools button:hover { border-color: #4cc9f0; }
  `;
  document.head.appendChild(style);

  const box = document.createElement('div');
  box.className = 'top-tools';
  const help = document.createElement('button');
  help.type = 'button';
  help.className = 'help';
  help.textContent = '?';
  help.title = 'Take the 1-minute tour';
  help.setAttribute('aria-label', 'Take the 1-minute tour');
  const theme = document.createElement('button');
  theme.type = 'button';
  box.append(help, theme);
  document.body.appendChild(box);

  function label() {
    const light = getTheme() === 'light';
    theme.textContent = light ? 'Dark theme' : 'Light theme';
    theme.title = light ? 'Switch to the dark (space) theme' : 'Switch to the light grey theme';
  }
  help.addEventListener('click', () => onHelp?.());
  theme.addEventListener('click', () => setTheme(getTheme() === 'light' ? 'dark' : 'light'));
  window.addEventListener('themechange', label);

  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* ничего */ }
  setTheme(saved === 'light' ? 'light' : 'dark');
  label();
  return box;
}

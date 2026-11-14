// Кнопка «−» / «+» для любой панели: «−» сворачивает панель до заголовка, «+» разворачивает.
// panel — сама панель, head — её верхняя строка (кнопка встанет в неё),
// keep — что ещё оставить видимым в свёрнутом виде, before — перед каким элементом шапки поставить кнопку.
// Не зависит от three.js.
let styled = false;

function addStyle() {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = `
    .fold-hidden { display: none !important; }
    .fold-btn {
      flex: none; width: 28px; height: 28px; padding: 0; margin-left: 6px; cursor: pointer;
      color: #e8edf5; background: #1d2740; font: 700 18px/1 system-ui, sans-serif;
      border: 1px solid rgba(255,255,255,.25); border-radius: 6px;
    }
    .fold-btn:hover { background: #2a3858; }
  `;
  document.head.appendChild(style);
}

export function addFold(panel, head, keep = [], { before = null } = {}) {
  addStyle();
  const keepSet = new Set([head, ...keep]);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'fold-btn';

  function apply(folded) {
    for (const child of panel.children) child.classList.toggle('fold-hidden', folded && !keepSet.has(child));
    panel.classList.toggle('folded', folded);
    button.textContent = folded ? '+' : '−';
    const text = folded ? 'Expand panel' : 'Collapse panel';
    button.title = text;
    button.setAttribute('aria-label', text);
    button.setAttribute('aria-expanded', String(!folded));
  }

  button.addEventListener('click', () => apply(!panel.classList.contains('folded')));
  head.insertBefore(button, before);
  apply(false);
  return { fold: () => apply(true), unfold: () => apply(false) };
}

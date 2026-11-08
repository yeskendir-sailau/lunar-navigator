// Поле «ввести координаты или название места» (левый верхний угол экрана).
// Понимает, например:  0.674, 23.473   |   3.01 S, 23.42 W   |   S 3.01 W 23.42   |   Apollo 12
// Не зависит от three.js: когда точка понятна, вызывает onPoint(lat, lon).

const FORMAT_HELP = 'Enter latitude and longitude, e.g. 0.674, 23.473 or 3.01 S, 23.42 W';

// Разбирает текст в { lat, lon } (градусы, север и восток — плюс) или бросает Error с понятным текстом.
export function parseLatLon(text) {
  const tokenRe = /[NSEWnsew]|[+-]?\d+(?:[.,]\d+)?/g;
  const tokens = text.match(tokenRe) || [];

  // Кроме чисел, букв N/S/E/W, пробелов, запятых, ; и ° в тексте ничего быть не должно
  const rest = text.replace(tokenRe, '').replace(/[\s,;°]+/g, '');
  if (rest !== '' || tokens.length === 0) throw new Error(FORMAT_HELP);

  const isLetter = tok => /^[A-Za-z]$/.test(tok);
  const items = [];                     // { value, letter }
  const prefixStyle = isLetter(tokens[0]);   // «N 3.01 E 23.42» или «3.01 N 23.42 E»
  let pending = null;
  for (const tok of tokens) {
    if (isLetter(tok)) {
      if (prefixStyle) {
        if (pending) throw new Error(FORMAT_HELP);
        pending = tok.toUpperCase();
      } else {
        const last = items[items.length - 1];
        if (!last || last.letter) throw new Error(FORMAT_HELP);
        last.letter = tok.toUpperCase();
      }
    } else {
      items.push({ value: parseFloat(tok.replace(',', '.')), letter: prefixStyle ? pending : null });
      pending = null;
    }
  }
  if (pending || items.length !== 2) throw new Error(FORMAT_HELP);

  let lat;
  let lon;
  const withLetters = items.filter(i => i.letter).length;
  if (withLetters === 0) {
    lat = items[0].value;
    lon = items[1].value;
  } else if (withLetters === 2) {
    for (const { value, letter } of items) {
      const signed = (letter === 'S' || letter === 'W' ? -1 : 1) * Math.abs(value);
      if (letter === 'N' || letter === 'S') {
        if (lat !== undefined) throw new Error('Use one of N/S and one of E/W.');
        lat = signed;
      } else {
        if (lon !== undefined) throw new Error('Use one of N/S and one of E/W.');
        lon = signed;
      }
    }
  } else {
    throw new Error('Put letters (N/S/E/W) on both numbers or on neither.');
  }

  if (!(Math.abs(lat) <= 90)) throw new Error('Latitude must be between −90 and 90.');
  if (lon > 180 && lon <= 360) lon -= 360;   // долгота 0–360 -> от −180 до 180
  if (!(lon >= -180 && lon <= 180)) throw new Error('Longitude must be between −180 and 180 (east is positive).');
  return { lat, lon };
}

const normalize = s => String(s).toLowerCase().replace(/\s+/g, '');

export function createCoordsInput({ sites = [], onPoint }) {
  const style = document.createElement('style');
  style.textContent = `
    .coords-box {
      position: fixed; top: 16px; left: 16px; z-index: 20;
      width: min(320px, calc(100vw - 32px)); box-sizing: border-box; padding: 8px 10px;
      background: rgba(10, 14, 22, 0.92); color: #e8edf5;
      border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 12px;
      font: 13px/1.4 system-ui, sans-serif;
    }
    .coords-box form { display: flex; gap: 6px; }
    .coords-box input {
      flex: 1; min-width: 0; padding: 6px 8px; color: #e8edf5; background: #141b29;
      border: 1px solid rgba(255,255,255,.25); border-radius: 6px; font: inherit;
    }
    .coords-box button {
      padding: 6px 12px; color: #e8edf5; background: #1d2740; cursor: pointer;
      border: 1px solid rgba(255,255,255,.25); border-radius: 6px; font: inherit;
    }
    .coords-box .msg { margin: 6px 2px 0; color: #c9d4e5; font-size: 12px; }
    .coords-box .msg:empty { display: none; }
  `;
  document.head.appendChild(style);

  const box = document.createElement('div');
  box.className = 'coords-box';

  const form = document.createElement('form');
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'lat, lon  or  site name';
  input.setAttribute('aria-label', 'Latitude and longitude, or site name');
  input.autocomplete = 'off';
  input.spellcheck = false;

  // Подсказки с названиями мест из sites.json
  const list = document.createElement('datalist');
  list.id = 'coords-sites';
  for (const site of sites) {
    const option = document.createElement('option');
    option.value = site.name;
    list.appendChild(option);
  }
  input.setAttribute('list', list.id);

  const go = document.createElement('button');
  go.type = 'submit';
  go.textContent = 'Go';

  const msg = document.createElement('p');
  msg.className = 'msg';
  msg.setAttribute('role', 'status');

  form.append(input, go);
  box.append(form, msg, list);
  document.body.appendChild(box);

  function findSite(text) {
    const key = normalize(text);
    return sites.find(s => normalize(s.name) === key || normalize(s.id ?? '') === key) ?? null;
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    try {
      const site = findSite(text);
      const point = site ? { lat: site.lat, lon: site.lon } : parseLatLon(text);
      msg.textContent = '';
      onPoint(point.lat, point.lon);
    } catch (error) {
      msg.textContent = error.message;
    }
  });
}

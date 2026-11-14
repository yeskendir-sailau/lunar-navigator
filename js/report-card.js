// Карточка отчёта (слева сверху): итоговый цвет, параметры и три блока — Энергия, Связь, Соседи.
// Не зависит от three.js. Цвет всегда повторён значком (✓ ! ✕) и словом.
// Кнопка «How it is calculated» открывает окно с порогами из data/thresholds.json.
import { STATUS } from './report-logic.js';
import { fmtHours, fmtUtc } from './format.js';

const NASA_URL = 'https://www.nasa.gov/pdf/617743main_NASA-USG_LUNAR_HISTORIC_SITES_RevA-508.pdf';
const ACCURACY_CHOICES = [10, 30, 100, 300, 1000, 3000];   // метры, 1σ

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;   // textContent безопасен: теги не выполняются
  return el;
}

function formatLatLon(lat, lon) {
  return `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? 'E' : 'W'}`;
}

const fmtAcc = m => (m >= 1000 ? `${m / 1000} km` : `${m} m`);

// Окно «Как считается»: все числа берём из thresholds.json, чтобы текст не расходился с расчётом
function buildHowTo(th, hasTerrain) {
  const box = make('div', 'howto');
  const add = (tag, text, cls) => box.appendChild(make(tag, cls, text));
  const e = th.energy, c = th.communication, n = th.neighbors;

  add('h2', 'How it is calculated');
  add('p', 'Each landing point gets three checks. Every check is green, yellow or red, and the final colour is the worst of the three. ' +
    'Colour is always repeated by a symbol and a word: ✓ Good, ! Caution, ✕ Not recommended.');

  add('h3', '1. Energy (sunlight)');
  add('p', `Looks at the next ${e.window_days} days from the chosen time (about one lunar day of sunlight, the usual life of a solar-powered lander). ` +
    `The Sun counts only when it is higher than ${e.sun_min_elevation_deg ?? 0}° above the horizon: with a lower Sun the shadows are long and solar panels collect little. ` +
    `Green: Sun above that limit at least ${e.daylight_pct.green_min}% of the time ` +
    `and the longest night at most ${fmtHours(e.longest_night_hours.green_max)}. Red: sunlit less than ${e.daylight_pct.yellow_min}% ` +
    `or a night longer than ${fmtHours(e.longest_night_hours.yellow_max)}. Anything between is yellow.`);

  add('h3', '2. Communication (view of Earth)');
  add('p', `Looks at the next ${c.window_days} days. Green: Earth above the horizon at least ${c.earth_visible_pct.green_min}% of the time ` +
    `and the longest break at most ${fmtHours(c.longest_gap_hours.green_max)}. Red: Earth visible less than ${c.earth_visible_pct.yellow_min}% ` +
    `or a break longer than ${fmtHours(c.longest_gap_hours.yellow_max)}. Anything between is yellow. This only checks line of sight to Earth, not radio power or antennas.`);

  add('h3', '3. Neighbors (existing sites)');
  add('p', `Distance along the Moon's surface (haversine, radius ${n.moon_radius_km} km) from your point to every site in our list.`);
  const ul = make('ul');
  const li = text => ul.appendChild(make('li', '', text));
  li(`Red: inside the keep-out zone, the larger of ${n.keep_out_km.heritage} km (landing sites) or ${n.keep_out_km.impact} km (impact sites) and ${n.sigma_multiple} × your landing accuracy (1σ).`);
  li(`Yellow: closer than ${n.gravel_km} km, where gravel thrown up by a landing can reach.`);
  li(`Yellow: closer than ${n.dust_line_of_sight_km} km, where dust may reach a neighbour that is in line of sight (we give no exact distance for dust).`);
  li('Green: none of the above.');
  box.appendChild(ul);
  add('p', 'Terrain as a shield (approximation): when we have a terrain profile for the point and the ground in the direction of a neighbour rises at least ' +
    `${n.terrain_shield_min_deg ?? 2}° above the horizontal, gravel and dust from that neighbour are counted as shielded (one step lower). ` +
    'The profile gives the height of the terrain, not its distance, so this is rough. The keep-out distance is never reduced by terrain.');
  const p = add('p', 'The 2 km / 0.5 km / 3σ rule and the 1.5 km gravel figure come from NASA\'s 2011 recommendations for US lunar historic sites (non-binding). ');
  const a = make('a', '', 'NASA document');
  a.href = NASA_URL; a.target = '_blank'; a.rel = 'noopener noreferrer';
  p.appendChild(a);
  p.appendChild(document.createTextNode('. NASA\'s text covers US sites; we apply the same distances to every site in our list as a precaution.'));

  add('h3', 'What is our choice, and what is not');
  add('p', 'The energy and communication thresholds (the window length, the ' + (e.sun_min_elevation_deg ?? 0) + '° Sun limit and the green / yellow / red bands) are our own choices, ' +
    'not a NASA or industry standard, and are all stored in one file (data/thresholds.json). Change them there and the report changes. ' +
    'Treating the worst of the three checks as the final colour is also our choice.');

  add('h3', 'Limits');
  const lim = make('ul');
  for (const t of [
    hasTerrain
      ? 'Terrain: a horizon profile is used only for the places in data/horizons.json; every other point is treated as flat, so mountains and crater walls there are ignored.'
      : 'No terrain: the horizon is treated as flat, so mountains and crater walls are ignored. Real sunlight and Earth visibility near mountains and the poles can differ.',
    'Neighbours are only the sites in our list (data/sites.json), not every object on the Moon.',
    'Landing accuracy is a number you choose; the tool does not predict it.',
    'No atmosphere refraction (the Moon has none), Sun and Earth treated as points.',
    'Sun and Earth positions: JPL DE421 ephemeris via Skyfield, including libration, hourly samples, linear interpolation.',
    'The 3D globe is a smooth sphere: it shows the phase, not mountain shadows.',
  ]) lim.appendChild(make('li', '', t));
  box.appendChild(lim);
  return box;
}

export function createReportCard({ th, onAccuracy, hasTerrain = false }) {
  const style = document.createElement('style');
  style.textContent = `
    .report-card {
      position: fixed; top: 76px; left: 16px; z-index: 20;
      width: min(340px, calc(100vw - 32px)); max-height: calc(100vh - 92px); overflow: auto; box-sizing: border-box;
      background: rgba(10, 14, 22, 0.92); color: #e8edf5; padding: 10px 12px 12px;
      border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 12px;
      font: 13px/1.45 system-ui, sans-serif;
      opacity: 0; transform: translateY(-8px); pointer-events: none;
      transition: opacity .3s ease, transform .3s ease;
    }
    .report-card.open { opacity: 1; transform: none; pointer-events: auto; }
    .report-card .top { display: flex; align-items: center; gap: 8px; }
    .report-card .coords { font-weight: 600; font-size: 14px; flex: 1; }
    .report-card .fold { width: 26px; height: 26px; border: 0; border-radius: 6px; background: #1d2740; color: #e8edf5; cursor: pointer; }
    .report-card .when { color: #9fb0c8; font-size: 11px; margin-bottom: 8px; }
    .report-card .verdict { display: flex; align-items: center; gap: 10px; padding: 8px 10px; margin-bottom: 8px;
      border-radius: 10px; background: rgba(255,255,255,.06); }
    .report-card .badge { flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center;
      font-size: 20px; font-weight: 700; color: #0b0f17; }
    .report-card .verdict .word { font-weight: 700; font-size: 16px; }
    .report-card .verdict .text { color: #9fb0c8; font-size: 12px; }
    .report-card .params { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: #9fb0c8; font-size: 12px; }
    .report-card select { padding: 3px 6px; color: #e8edf5; background: #141b29; color-scheme: dark;
      border: 1px solid rgba(255,255,255,.25); border-radius: 6px; font: inherit; }
    .report-card .block { border-left: 4px solid; padding: 4px 0 4px 8px; margin-bottom: 6px; }
    .report-card .block .t { display: flex; align-items: center; gap: 6px; font-weight: 600; }
    .report-card .block .mini { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%;
      font-size: 12px; font-weight: 700; color: #0b0f17; }
    .report-card .block .w { font-weight: 400; font-size: 12px; color: #9fb0c8; margin-left: auto; }
    .report-card .block .h { font-size: 12px; }
    .report-card .block ul { margin: 2px 0 0; padding-left: 16px; color: #9fb0c8; font-size: 12px; }
    .report-card .block .why { color: #e8edf5; font-size: 12px; margin-top: 2px; }
    .report-card .actions { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
    .report-card .actions button { padding: 5px 10px; color: #e8edf5; background: #1d2740; cursor: pointer;
      border: 1px solid rgba(255,255,255,.25); border-radius: 6px; font: inherit; }
    .report-card .small { color: #7f8fa6; font-size: 11px; }
    .report-card.folded .verdict ~ *, .report-card.folded .when { display: none; }
    .howto-back { position: fixed; inset: 0; z-index: 60; background: rgba(0,0,0,.6); display: none;
      align-items: center; justify-content: center; padding: 16px; }
    .howto-back.open { display: flex; }
    .howto-modal { position: relative; width: min(640px, 100%); max-height: calc(100vh - 32px); overflow: auto;
      background: #0d121c; color: #e8edf5; border: 1px solid rgba(255,255,255,.2); border-radius: 14px;
      padding: 8px 22px 18px; font: 14px/1.55 system-ui, sans-serif; }
    .howto h2 { margin: 12px 0 6px; font-size: 20px; }
    .howto h3 { margin: 14px 0 4px; font-size: 15px; color: #4cc9f0; }
    .howto p, .howto ul { margin: 0 0 8px; }
    .howto a { color: #4cc9f0; }
    .howto-close { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border: 0; border-radius: 50%;
      background: rgba(255,255,255,.12); color: #fff; font-size: 16px; cursor: pointer; }
  `;
  document.head.appendChild(style);

  const el = make('div', 'report-card');
  el.setAttribute('aria-live', 'polite');

  const top = make('div', 'top');
  const coords = make('div', 'coords');
  const fold = make('button', 'fold', '–');
  fold.title = 'Collapse / expand';
  fold.setAttribute('aria-label', 'Collapse or expand the report');
  top.append(coords, fold);
  const when = make('div', 'when');

  const verdict = make('div', 'verdict');
  const badge = make('div', 'badge');
  const vtext = make('div');
  const vword = make('div', 'word');
  const vsub = make('div', 'text');
  vtext.append(vword, vsub);
  verdict.append(badge, vtext);

  const params = make('div', 'params');
  const accLabel = make('label', '', 'Landing accuracy (1σ):');
  const select = make('select');
  select.id = 'landing-accuracy';
  accLabel.htmlFor = select.id;
  const choices = [...new Set([...ACCURACY_CHOICES, th.neighbors.default_accuracy_1sigma_m])].sort((a, b) => a - b);
  for (const m of choices) {
    const o = make('option', '', fmtAcc(m));
    o.value = String(m);
    select.appendChild(o);
  }
  select.value = String(th.neighbors.default_accuracy_1sigma_m);
  params.append(accLabel, select);

  const blocksBox = make('div');
  const actions = make('div', 'actions');
  const howBtn = make('button', '', 'How it is calculated');
  const noteSmall = make('span', 'small', '');
  actions.append(howBtn, noteSmall);
  el.append(top, when, verdict, params, blocksBox, actions);
  document.body.appendChild(el);

  // Окно «Как считается»
  const back = make('div', 'howto-back');
  const modal = make('div', 'howto-modal');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  const close = make('button', 'howto-close', '×');
  close.setAttribute('aria-label', 'Close');
  modal.append(close, buildHowTo(th, hasTerrain));
  back.appendChild(modal);
  document.body.appendChild(back);
  const openHow = () => back.classList.add('open');
  const closeHow = () => back.classList.remove('open');
  howBtn.addEventListener('click', openHow);
  close.addEventListener('click', closeHow);
  back.addEventListener('click', e => { if (e.target === back) closeHow(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeHow(); });

  fold.addEventListener('click', () => {
    const folded = el.classList.toggle('folded');
    fold.textContent = folded ? '+' : '–';
  });
  select.addEventListener('change', () => onAccuracy?.(Number(select.value)));

  function paintBadge(node, status, big) {
    const s = STATUS[status];
    node.style.background = s.color;
    node.textContent = s.icon;
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', s.word);
    if (!big) node.title = s.word;
  }

  // report — результат buildReport; ms — время расчёта
  function update(report, ms) {
    coords.textContent = formatLatLon(report.lat, report.lon);
    when.textContent = Number.isFinite(ms) ? `From ${fmtUtc(ms)}, looking ${th.energy.window_days} days ahead` : 'No Sun/Earth data loaded';
    const s = STATUS[report.overall];
    paintBadge(badge, report.overall, true);
    vword.textContent = s.word;
    vword.style.color = s.color;
    vsub.textContent = report.verdict;
    noteSmall.textContent = report.terrain ? 'Terrain horizon used.' : 'Flat horizon, no terrain.';

    blocksBox.replaceChildren();
    for (const b of report.blocks) {
      const bs = STATUS[b.status];
      const block = make('div', 'block');
      block.style.borderColor = bs.color;
      const t = make('div', 't');
      const mini = make('span', 'mini');
      paintBadge(mini, b.status, false);
      t.append(mini, make('span', '', b.title), make('span', 'w', bs.word));
      block.append(t, make('div', 'h', b.headline));
      if (b.details.length) {
        const ul = make('ul');
        for (const d of b.details) ul.appendChild(make('li', '', d));
        block.appendChild(ul);
      }
      if (b.status !== 'green' && b.status !== 'unknown' && b.title !== 'Neighbors' && b.reasons.length) {
        block.appendChild(make('div', 'why', 'Why: ' + b.reasons.join('; ')));
      }
      if (b.title === 'Neighbors' && b.note) block.appendChild(make('div', 'small', b.note));
      blocksBox.appendChild(block);
    }
    el.classList.add('open');
  }

  return {
    update,
    getAccuracy: () => Number(select.value),
    openHow,
  };
}

// Сборка: соединяем модули, как детали Lego.
import { setSunDirection, setEarthDirection, setLightMode, viewFromEarth } from './globe.js';
import { loadSites, addMarkers } from './sites.js';
import { initPicker } from './picker.js';
import { createCard } from './card.js';
import { loadEphemeris, directionAt } from './astro.js';
import { loadHorizons, horizonFor } from './horizon.js';
import { createAstroPanel } from './astro-panel.js';
import { createCompare } from './compare.js';
import { createTimeBar } from './time-bar.js';
import { createCoordsInput } from './coords-input.js';
import { buildReport, STATUS } from './report-logic.js';
import { createReportCard } from './report-card.js';
import { createViewControls } from './view-controls.js';
import { createStartScreen } from './start-screen.js';

const url = path => new URL(path, import.meta.url);

// Главный экран: только на страницах с <body data-start> (index.html). Луна уже загружается под ним.
if (document.body.hasAttribute('data-start')) createStartScreen();

// --- Данные ---
let sites = [];
try {
  sites = await loadSites(url('../data/sites.json'));
} catch (error) {
  console.error(error);   // сайт всё равно покажет Луну, просто без меток
}
addMarkers(sites);

let th = null;   // пороги цвета (data/thresholds.json); без них отчёта нет
try {
  const response = await fetch(url('../data/thresholds.json'));
  if (!response.ok) throw new Error(`Cannot load thresholds.json: ${response.status}`);
  th = await response.json();
} catch (error) {
  console.error(error);
}

let eph = null;   // положения Солнца и Земли (data/sun_earth.json). Нет файла — отчёт без Энергии и Связи
try {
  eph = await loadEphemeris(url('../data/sun_earth.json'));
} catch (error) {
  console.error(error);
}

const horizons = await loadHorizons(url('../data/horizons.json'));   // рельеф: необязательно (null, если файла нет)

// --- Состояние ---
let point = null;      // { lat, lon } выбранной точки
let timeMs = NaN;      // выбранное время (UTC)
const ctx = { eph, sites, th, horizons };

const card = createCard();
const reportCard = th ? createReportCard({
  th,
  hasTerrain: Boolean(horizons),
  onAccuracy: () => { refresh(); compare?.setAccuracy(reportCard.getAccuracy()); },
}) : null;
const compare = th ? createCompare({ eph, sites, th, horizons, accuracyM: th.neighbors.default_accuracy_1sigma_m }) : null;
const astro = eph ? createAstroPanel(eph, {
  onPin: (slot, lat, lon) => compare?.setSlot(slot, lat, lon),
  getMask: (lat, lon) => horizonFor(horizons, lat, lon),
}) : null;

// Полный отчёт для выбранной точки; возвращает цвет кольца
let picker = null;
function refresh() {
  if (!point || !reportCard) return undefined;
  const report = buildReport(ctx, point.lat, point.lon, { ms: timeMs, accuracyM: reportCard.getAccuracy() });
  reportCard.update(report, timeMs);
  const hex = STATUS[report.overall].hex;
  picker?.setSelectorColor(hex);
  return hex;
}

// --- Время: ползунок, воспроизведение; от него зависят свет, отчёт и панели ---
if (eph) {
  // Из осей Луны (X, Y, Z) в оси three.js: (X, Z, -Y), так же, как в geo.js
  let lastUpdate = 0;
  createTimeBar(eph, {
    onTime: (ms, isPlaying) => {
      timeMs = ms;
      const sun = directionAt(eph, 'sun', ms);
      const earth = directionAt(eph, 'earth', ms);
      if (sun) setSunDirection(sun[0], sun[2], -sun[1]);
      if (earth) setEarthDirection(earth[0], earth[2], -earth[1]);
      // Во время воспроизведения отчёт и панели обновляем не чаще ~8 раз в секунду
      const now = performance.now();
      if (!isPlaying || now - lastUpdate > 120) {
        refresh();
        astro?.setTime(ms);
        compare?.setTime(ms);
        lastUpdate = now;
      }
    },
  });
}

// --- Выбор точки ---
picker = initPicker({
  sites,
  onPoint: (lat, lon) => {
    point = { lat, lon };
    astro?.setPoint(lat, lon);
    return refresh();
  },
  onSite: site => (site ? card.show(site) : card.hide()),
  // Быстрый расчёт для кольца под курсором (грубый шаг по времени)
  getPreview: th ? (lat, lon) => {
    const report = buildReport(ctx, lat, lon, { ms: timeMs, accuracyM: reportCard.getAccuracy(), quick: true });
    const s = STATUS[report.overall];
    return { hex: s.hex, icon: s.icon, word: s.word };
  } : undefined,
});

// Поле ввода: координаты или название места
createCoordsInput({
  sites,
  onPoint: (lat, lon) => picker.selectPoint(lat, lon),
});

// Кнопки вида: «Реальный свет / Полный свет» и «Вид с Земли»
createViewControls({
  hasEarth: Boolean(eph),
  onLight: setLightMode,
  onEarthView: viewFromEarth,
});

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
import { createToolbar } from './toolbar.js';
import { createTour } from './tour.js';
import { openPdfReport } from './pdf-report.js';

const url = path => new URL(path, import.meta.url);

// Главный экран: только на страницах с <body data-start> (index.html). Луна уже загружается под ним.
let tour = null;
let startPressed = false;
if (document.body.hasAttribute('data-start')) {
  createStartScreen({
    onStart: () => { startPressed = true; setTimeout(() => tour?.offer(), 700); },   // после «Start» спрашиваем про обучение
  });
}
// Тема (тёмная / светло-серая) и кнопка «?» применяются сразу, ещё до загрузки данных
const toolbar = createToolbar({ onTour: () => tour?.start() });

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
  onPdf: () => point && openPdfReport({ kind: 'single', ctx, places: [point], ms: timeMs, accuracyM: reportCard.getAccuracy() }),
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

// --- Обучение: вопрос после «Start» и кнопка «?» ---
const DEMO_A = { lat: 5, lon: 10 };
const DEMO_B = { lat: -85, lon: 0 };
const moonCenter = () => {   // область Луны в центре экрана для первого шага
  const size = Math.min(innerWidth, innerHeight) * 0.62;
  return { rect: { x: (innerWidth - size) / 2, y: (innerHeight - size) / 2, w: size, h: size } };
};
tour = createTour({
  steps: () => [
    { target: moonCenter, title: 'The Moon',
      text: 'Drag to rotate, scroll or pinch to zoom. Dots are landing sites: click one for its story. Click anywhere else to choose your own spot.' },
    { target: '.coords-box', title: 'Find a place',
      text: 'Type coordinates (for example 3.01 S, 23.42 W) or a site name, then press Go.' },
    { target: '.time-bar', title: 'Pick the date',
      text: 'Choose the date and time (UTC), drag the slider or press Play. The light on the Moon, the report and the graph all follow.' },
    { target: '.report-card', title: 'Your report',
      before: () => { compare?.clear(); picker.selectPoint(DEMO_A.lat, DEMO_A.lon); },
      text: 'Three checks: Energy (sunlight), Communication (view of Earth) and Neighbors (distance to existing sites), and one overall colour. Colour is always repeated with an icon and a word: ✓ Good, ! Caution, ✕ Not recommended.' },
    { target: '.report-card .params', title: 'Landing accuracy',
      text: 'The less accurate the landing, the wider the keep-out zone around existing sites (NASA: 2 km or 3σ, whichever is larger).' },
    { target: '.report-card .actions', title: 'Rules and PDF',
      text: '"How it is calculated" explains every rule and says which numbers are NASA\'s and which are our own choice. "Save PDF" makes a printable report with charts.' },
    { target: '.astro-panel', title: 'Sun and Earth',
      text: 'Height of the Sun and Earth over the next 14 days, next sunrise and sunset, and whether Earth is in view. "Set as A / B / C" adds the place to the comparison.' },
    { target: '.compare', title: 'Compare places',
      before: () => { compare?.setSlot('A', DEMO_A.lat, DEMO_A.lon); compare?.setSlot('B', DEMO_B.lat, DEMO_B.lon); },
      text: 'Two or three places side by side. The best value in each row is outlined. "Save PDF" exports this table with graphs.' },
    { target: '.view-controls', title: 'Light and view',
      before: () => compare?.clear(),
      text: 'Real light shows the phase made by the real Sun; Full light lights the whole Moon. "View from Earth" shows the Moon as we see it. Sun and Earth in the scene are not to scale.' },
    { target: '.toolbar', title: 'Theme and help',
      text: 'Switch between the dark and the light grey theme. The ? button replays this tour any time.' },
  ],
  onFinish: () => compare?.clear(),
});
if (startPressed) setTimeout(() => tour.offer(), 300);   // «Start» нажали, пока данные ещё грузились

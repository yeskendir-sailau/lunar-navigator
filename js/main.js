// Сборка: соединяем модули, как детали Lego.
import { setSunDirection, setEarthDirection } from './globe.js';
import { loadSites, addMarkers } from './sites.js';
import { loadHorizons } from './horizon.js';
import { initPicker } from './picker.js';
import { createPanel } from './report.js';
import { createCard } from './card.js';
import { loadEphemeris, directionAt } from './astro.js';
import { createAstroPanel } from './astro-panel.js';
import { createComparePanel } from './compare-panel.js';
import { createTimeBar } from './time-bar.js';
import { createCoordsInput } from './coords-input.js';
import { loadThresholds, LEVELS } from './rules.js';
import { createReportCard } from './report-card.js';
import { createStartScreen } from './start-screen.js';

// Главный экран с кнопкой «Start» — первым делом, пока грузятся данные
createStartScreen();

let sites = [];
try {
  sites = await loadSites(new URL('../data/sites.json', import.meta.url));
} catch (error) {
  console.error(error);   // сайт всё равно покажет Луну, просто без меток
}

// Маски горизонта (data/horizons.json). Места, которых ещё нет в sites.json, добавляем как метки.
const horizons = await loadHorizons(new URL('../data/horizons.json', import.meta.url));
if (horizons) {
  for (const p of horizons.places) {
    if (sites.some(s => s.id === p.id)) continue;
    sites.push({
      id: p.id, name: p.name, country: '', type: 'region', lat: p.lat, lon: p.lon,
      status: 'terrain horizon computed',
      description: 'Approximate location near the south pole (coordinates to be verified). ' +
        'The horizon mask comes from LOLA elevation data.',
      source: 'https://pgda.gsfc.nasa.gov/products/90',
    });
  }
}

addMarkers(sites);
const panel = createPanel();
const card = createCard();

// Положения Солнца и Земли (data/sun_earth.json). Нет файла — работаем без этих панелей.
let astro = null;
let report = null;   // карточка отчёта (модуль 8)
try {
  const eph = await loadEphemeris(new URL('../data/sun_earth.json', import.meta.url));
  try {
    const thresholds = await loadThresholds(new URL('../data/thresholds.json', import.meta.url));
    report = createReportCard({ eph, sites, horizons, thresholds });
  } catch (error) {
    console.error(error);   // без порогов работаем как раньше, просто без отчёта
  }
  const compare = createComparePanel(eph, sites);
  astro = createAstroPanel(eph, {
    onPin: (slot, lat, lon) => compare.setSlot(slot, lat, lon),
    horizons,
  });

  // Время выбирается в панели времени; от него зависят свет на Луне и обе панели.
  // Из осей Луны (X, Y, Z) в оси three.js: (X, Z, -Y) — так же, как в geo.js.
  let lastPanelUpdate = 0;
  createTimeBar(eph, {
    onTime: (ms, isPlaying) => {
      const sun = directionAt(eph, 'sun', ms);
      const earth = directionAt(eph, 'earth', ms);
      if (sun) setSunDirection(sun[0], sun[2], -sun[1]);
      if (earth) setEarthDirection(earth[0], earth[2], -earth[1]);
      // Во время воспроизведения панели обновляем не чаще ~8 раз в секунду
      const now = performance.now();
      if (!isPlaying || now - lastPanelUpdate > 120) {
        astro.setTime(ms);
        compare.setTime(ms);
        report?.setTime(ms);
        lastPanelUpdate = now;
      }
    },
  });
} catch (error) {
  console.error(error);
}

// Подсказка у курсора при наведении
const tip = document.createElement('div');
tip.hidden = true;
tip.style.cssText = 'position:fixed;z-index:30;pointer-events:none;padding:2px 8px;border-radius:6px;' +
  'background:rgba(10,14,22,.92);color:#e8edf5;border:2px solid #fff;font:12px system-ui,sans-serif;';
document.body.appendChild(tip);

const picker = initPicker({
  sites,
  onPoint: (lat, lon) => {
    panel.update(lat, lon, sites);
    astro?.setPoint(lat, lon);
    report?.show(lat, lon);
  },
  onSite: site => (site ? card.show(site) : card.hide()),
  // Наведение мыши: быстрый расчёт -> цвет кольца + подсказка со значком и словом
  onHover: (lat, lon, x, y) => {
    const level = report?.preview(lat, lon);
    const info = LEVELS[level];
    if (!info) { tip.hidden = true; return null; }
    tip.textContent = `${info.icon} ${info.word} (preview)`;
    tip.style.borderColor = info.color;
    tip.style.left = `${x + 16}px`;
    tip.style.top = `${y + 16}px`;
    tip.hidden = false;
    return info.color;
  },
  onHoverEnd: () => { tip.hidden = true; },
});

// Поле ввода: координаты или название места
createCoordsInput({
  sites,
  onPoint: (lat, lon) => picker.selectPoint(lat, lon),
});

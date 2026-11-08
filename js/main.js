// Сборка: соединяем модули, как детали Lego.
import { setSunDirection, setEarthDirection } from './globe.js';
import { loadSites, addMarkers } from './sites.js';
import { initPicker } from './picker.js';
import { createPanel } from './report.js';
import { createCard } from './card.js';
import { loadEphemeris, directionAt } from './astro.js';
import { createAstroPanel } from './astro-panel.js';
import { createTimeBar } from './time-bar.js';
import { createCoordsInput } from './coords-input.js';

let sites = [];
try {
  sites = await loadSites(new URL('../data/sites.json', import.meta.url));
} catch (error) {
  console.error(error);   // сайт всё равно покажет Луну, просто без меток
}

addMarkers(sites);
const panel = createPanel();
const card = createCard();

// Положения Солнца и Земли (data/sun_earth.json). Нет файла — работаем без панели Солнца и Земли.
let astro = null;
try {
  const eph = await loadEphemeris(new URL('../data/sun_earth.json', import.meta.url));
  astro = createAstroPanel(eph);

  // Время выбирается в панели времени; от него зависят и свет на Луне, и панель Солнца и Земли.
  // Из осей Луны (X, Y, Z) в оси three.js: (X, Z, -Y) — так же, как в geo.js.
  let lastPanelUpdate = 0;
  createTimeBar(eph, {
    onTime: (ms, isPlaying) => {
      const sun = directionAt(eph, 'sun', ms);
      const earth = directionAt(eph, 'earth', ms);
      if (sun) setSunDirection(sun[0], sun[2], -sun[1]);
      if (earth) setEarthDirection(earth[0], earth[2], -earth[1]);
      // Во время воспроизведения панель обновляем не чаще ~8 раз в секунду
      const now = performance.now();
      if (!isPlaying || now - lastPanelUpdate > 120) {
        astro.setTime(ms);
        lastPanelUpdate = now;
      }
    },
  });
} catch (error) {
  console.error(error);
}

const picker = initPicker({
  sites,
  onPoint: (lat, lon) => {
    panel.update(lat, lon, sites);
    astro?.setPoint(lat, lon);
  },
  onSite: site => (site ? card.show(site) : card.hide()),
});

// Поле ввода: координаты или название места
createCoordsInput({
  sites,
  onPoint: (lat, lon) => picker.selectPoint(lat, lon),
});

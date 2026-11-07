// Сборка: соединяем модули, как детали Lego.
import { loadSites, addMarkers } from './sites.js';
import { initPicker } from './picker.js';
import { createPanel } from './report.js';
import { createCard } from './card.js';
import { loadEphemeris } from './astro.js';
import { createAstroPanel } from './astro-panel.js';

let sites = [];
try {
  sites = await loadSites(new URL('../data/sites.json', import.meta.url));
} catch (error) {
  console.error(error);   // сайт всё равно покажет Луну, просто без меток
}

// Положения Солнца и Земли (data/sun_earth.json). Нет файла — работаем без панели Солнца и Земли.
let astro = null;
try {
  const eph = await loadEphemeris(new URL('../data/sun_earth.json', import.meta.url));
  astro = createAstroPanel(eph);
} catch (error) {
  console.error(error);
}

addMarkers(sites);
const panel = createPanel();
const card = createCard();

initPicker({
  sites,
  onPoint: (lat, lon) => {
    panel.update(lat, lon, sites);
    astro?.setPoint(lat, lon);
  },
  onSite: site => (site ? card.show(site) : card.hide()),
});

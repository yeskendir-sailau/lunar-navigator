// Сборка: соединяем модули, как детали Lego.
import { loadSites, addMarkers } from './sites.js';
import { initPicker } from './picker.js';
import { createPanel } from './report.js';
import { createCard } from './card.js';

let sites = [];
try {
  sites = await loadSites(new URL('../data/sites.json', import.meta.url));
} catch (error) {
  console.error(error);   // сайт всё равно покажет Луну, просто без меток
}

addMarkers(sites);
const panel = createPanel();
const card = createCard();

initPicker({
  sites,
  onPoint: (lat, lon) => panel.update(lat, lon, sites),
  onSite: site => (site ? card.show(site) : card.hide()),
});

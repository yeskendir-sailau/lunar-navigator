// Панелька с координатами выбранной точки (справа вверху).
// Показывает широту/долготу и ближайшее известное место из sites.json.
// Не зависит от three.js, кроме расчёта расстояния через geo.js.
import { angularDistanceDeg } from './geo.js';

function formatLatLon(lat, lon) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(3)}° ${ns}, ${Math.abs(lon).toFixed(3)}° ${ew}`;
}

export function createPanel() {
  const style = document.createElement('style');
  style.textContent = `
    .point-panel {
      position: fixed; top: 16px; right: 16px; z-index: 20;
      min-width: 220px; padding: 10px 14px;
      background: rgba(10, 14, 22, 0.92); color: #e8edf5;
      border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 12px;
      font: 14px/1.5 system-ui, sans-serif;
      opacity: 0; transform: translateY(-8px); pointer-events: none;
      transition: opacity .3s ease, transform .3s ease;
    }
    .point-panel.open { opacity: 1; transform: none; }
    .point-panel .coords { font-weight: 600; font-size: 15px; }
    .point-panel .nearest { color: #9fb0c8; font-size: 12px; margin-top: 2px; }
  `;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.className = 'point-panel';
  const coords = document.createElement('div');
  coords.className = 'coords';
  const nearest = document.createElement('div');
  nearest.className = 'nearest';
  el.append(coords, nearest);
  document.body.appendChild(el);

  // lat, lon — выбранная точка; sites — список мест из sites.json
  function update(lat, lon, sites = []) {
    coords.textContent = formatLatLon(lat, lon);

    let best = null;
    for (const site of sites) {
      const d = angularDistanceDeg(lat, lon, site.lat, site.lon);
      if (best === null || d < best.d) best = { site, d };
    }
    nearest.textContent = best ? `Nearest site: ${best.site.name}` : '';
    el.classList.add('open');
  }

  return { update };
}

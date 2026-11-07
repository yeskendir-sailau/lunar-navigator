// Модуль 5 (часть 1): панелька с координатами и ближайшим местом.
// Не зависит от three.js — только создаёт кусочек страницы (HTML).

const R_MOON_KM = 1737.4;

// Расстояние между двумя точками на шаре (формула гаверсинусов), в километрах
export function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_MOON_KM * Math.asin(Math.sqrt(a));
}

// Какое место из списка ближе всего к точке?
export function nearestSite(lat, lon, sites) {
  let best = null;
  for (const site of sites) {
    const d = distanceKm(lat, lon, site.lat, site.lon);
    if (best === null || d < best.distanceKm) {
      best = { site, distanceKm: d };
    }
  }
  return best;   // null, если список пустой
}

// Защита: если в названии места окажутся символы < или >, они не сломают страницу
function esc(text) {
  return String(text).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function formatLat(lat) {
  return Math.abs(lat).toFixed(3) + '° ' + (lat >= 0 ? 'N' : 'S');
}
function formatLon(lon) {
  return Math.abs(lon).toFixed(3) + '° ' + (lon >= 0 ? 'E' : 'W');
}

// Создаёт панельку в правом верхнем углу и возвращает объект с методом update(...)
export function createPanel() {
  const style = document.createElement('style');
  style.textContent = `
    .coord-panel {
      position: fixed; top: 16px; right: 16px; z-index: 10;
      min-width: 220px; padding: 12px 14px;
      background: rgba(10, 14, 22, 0.82); color: #e8edf5;
      border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 10px;
      font: 14px/1.5 system-ui, sans-serif; pointer-events: none;
    }
    .coord-panel h3 { margin: 0 0 6px; font-size: 12px; font-weight: 600;
      letter-spacing: .08em; text-transform: uppercase; color: #9fb0c8; }
    .coord-panel .row { display: flex; justify-content: space-between; gap: 12px; }
    .coord-panel .label { color: #9fb0c8; }
  `;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.className = 'coord-panel';
  el.innerHTML = '<h3>Selected point</h3><div>Click on the Moon</div>';
  document.body.appendChild(el);

  return {
    // lat, lon — в градусах; sites — список мест из sites.json
    update(lat, lon, sites) {
      const near = nearestSite(lat, lon, sites);
      const nearText = near
        ? `${esc(near.site.name)} (${near.distanceKm.toFixed(near.distanceKm < 100 ? 1 : 0)} km)`
        : '—';
      el.innerHTML = `
        <h3>Selected point</h3>
        <div class="row"><span class="label">Latitude</span><span>${formatLat(lat)}</span></div>
        <div class="row"><span class="label">Longitude</span><span>${formatLon(lon)}</span></div>
        <div class="row"><span class="label">Nearest site</span><span>${nearText}</span></div>
      `;
    }
  };
}
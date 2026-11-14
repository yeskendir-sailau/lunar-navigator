// Модуль safety.js: безопасность соседей. Не зависит от three.js.
// Считает расстояние от выбранной точки до других аппаратов на Луне (sites.json) и проверяет его
// по правилам NASA 2011 (необязательные рекомендации, документ NASA-USG Lunar Historic Sites, Rev A):
//   - не ближе 2,0 км к месту посадки (0,5 км к месту падения) или 3σ точности посадки,
//     смотря что больше (разделы A1-3, A2-3, A2-4);
//   - камни и гравий от посадки долетали до 1,5 км (A2-3);
//   - горизонт на Луне около 1,8 км (A2-3), поэтому пыль может долететь до любого соседа
//     «в прямой видимости»: на гладкой Луне это примерно 2 x 1,8 = 3,6 км (наше приближение, рельефа нет).
// Все числа лежат в data/thresholds.json (раздел neighbors).
//
// Рельеф как защита (приближение): если для точки есть маска горизонта (horizon.js) и рельеф в направлении
// соседа поднимается не меньше terrain_shield_min_deg, риск гравия и пыли от этого соседа считаем на ступень
// ниже. Запретный радиус NASA рельефом НЕ уменьшается: это правило по расстоянию.
import { maskElevationAt } from './horizon.js';

const RANK = { green: 0, yellow: 1, red: 2 };
const ZONE_STATUS = { 'keep-out': 'red', gravel: 'yellow', dust: 'yellow', clear: 'green' };

// Расстояние по поверхности Луны (формула гаверсинусов), километры
export function haversineKm(lat1, lon1, lat2, lon2, radiusKm = 1737.4) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
            Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Азимут из точки 1 на точку 2: градусы по часовой от севера (восток = 90°)
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const dLon = (lon2 - lon1) * r;
  const y = Math.sin(dLon) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos(dLon);
  const b = Math.atan2(y, x) / r;
  return b < 0 ? b + 360 : b;
}

// Запретный радиус вокруг соседа, км: большее из «правила NASA» и 3σ точности посадки
export function keepOutKm(site, accuracyM, th) {
  const base = th.keep_out_km[site.type] ?? th.keep_out_km.heritage;
  return Math.max(base, th.sigma_multiple * (accuracyM / 1000));
}

// th — раздел neighbors из thresholds.json; accuracyM — точность посадки 1σ в метрах;
// mask — маска горизонта выбранной точки (или null: рельефа нет)
export function assessNeighbors(lat, lon, sites, accuracyM, th, mask = null) {
  const neighbors = sites
    .filter(site => site.type !== 'planned')   // будущие цели — ещё не аппараты на Луне, им не мешаем
    .map(site => {
      const distanceKm = haversineKm(lat, lon, site.lat, site.lon, th.moon_radius_km);
      const keep = keepOutKm(site, accuracyM, th);
      let zone = 'clear';
      if (distanceKm < keep) zone = 'keep-out';
      else if (distanceKm < th.gravel_km) zone = 'gravel';
      else if (distanceKm < th.dust_line_of_sight_km) zone = 'dust';

      let status = ZONE_STATUS[zone];
      let shielded = false;
      if (mask && (zone === 'gravel' || zone === 'dust') && distanceKm > 0) {
        const terrain = maskElevationAt(mask, bearingDeg(lat, lon, site.lat, site.lon));
        if (terrain >= (th.terrain_shield_min_deg ?? 2)) {
          shielded = true;
          status = 'green';   // на ступень ниже: жёлтый -> зелёный
        }
      }
      return { site, distanceKm, keepOutKm: keep, zone, status, shielded };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);

  let status = neighbors.length ? 'green' : 'unknown';
  for (const n of neighbors) {
    if (RANK[n.status] > RANK[status]) status = n.status;
  }
  return {
    status,
    neighbors,
    flagged: neighbors.filter(n => n.zone !== 'clear'),
    nearest: neighbors[0] ?? null,
    terrain: Boolean(mask),
  };
}

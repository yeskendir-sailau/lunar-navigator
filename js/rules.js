// Модуль 8: правила цвета. Превращает числа (доля солнца, доля связи, расстояние до соседей)
// в оценку «хорошо / осторожно / опасно». Все пороги — в data/thresholds.json.
// Не зависит от three.js и от страницы: только расчёты.

// Цвет всегда дублируем значком и словом (не все различают цвета)
export const LEVELS = {
  ok:   { icon: '✓', word: 'Good',    color: '#3ddc84' },
  warn: { icon: '!', word: 'Caution', color: '#ffd166' },
  bad:  { icon: '✕', word: 'Risky',   color: '#ff5c5c' },
};
const ORDER = ['ok', 'warn', 'bad'];
import { maskAt, FLAT_DEG } from './horizon.js';

const MOON_KM = 1737.4;

export async function loadThresholds(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot load ${url}: ${response.status}`);
  const th = await response.json();
  for (const key of ['energy', 'comm', 'neighbours']) {
    if (!th[key]) throw new Error(`thresholds.json: missing "${key}"`);
  }
  return th;
}

// Чем больше, тем лучше: выше good_min — хорошо, выше caution_min — осторожно, иначе опасно
function byMinimum(value, rule) {
  if (value === null || !Number.isFinite(value)) return null;
  if (value >= rule.good_min) return 'ok';
  if (value >= rule.caution_min) return 'warn';
  return 'bad';
}

export const rateEnergy = (sunPct, th) => byMinimum(sunPct, th.energy);
export const rateComm = (earthPct, th) => byMinimum(earthPct, th.comm);

export function distanceKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
            Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * MOON_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ---------- Модуль 7: безопасность соседей (перенос расчётов из lsz_core.py) ----------

// Азимут от точки 1 к точке 2: градусы от севера по часовой стрелке (0 — север, 90 — восток)
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const dl = (lon2 - lon1) * r;
  const y = Math.sin(dl) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos(dl);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}

// Под каким углом над ровным горизонтом виден верх соседа (с учётом кривизны Луны).
// Та же формула, что в tools/make_horizons.py: tan(e) = (r1*cos(t) - r0) / (r1*sin(t)).
export function topElevationDeg(distKm, eyeM, neighbourM) {
  const theta = (distKm * 1000) / (MOON_KM * 1000);
  const r0 = MOON_KM * 1000 + eyeM;
  const r1 = MOON_KM * 1000 + neighbourM;
  return (Math.atan2(r1 * Math.cos(theta) - r0, r1 * Math.sin(theta)) * 180) / Math.PI;
}

// Прямая видимость соседа. Без маски гор — только кривизна Луны (flat), с маской — ещё и горы.
// shieldedByTerrain: на ровной местности сосед был бы виден, но гора его закрывает (приближение).
function lineOfSight(km, bearing, place, nb) {
  const el = topElevationDeg(km, nb.eye_height_m ?? 2, nb.neighbour_height_m ?? 3);
  const flatVisible = el > FLAT_DEG;
  const mask = place ? maskAt(place, bearing) : FLAT_DEG;
  const visible = el > mask;
  return { visible, shieldedByTerrain: place ? flatVisible && !visible : false, elevation: el, mask };
}

// Соседи. Для каждого защищаемого места:
//  - запретная зона NASA: max(радиус по типу места × класс аппарата, 3σ точности посадки) -> ✕
//  - гравий долетает до gravel_km: если сосед ближе и виден напрямую -> !
//  - пыль: расстояния не даём, только список соседей в прямой видимости
// Горы (маска place) смягчают только гравий и пыль; правило NASA остаётся правилом.
// Возвращает { level, worst, nearest, items, dust }.
export function rateNeighbours(lat, lon, sites, sigmaM, landerClass, th, place = null) {
  const nb = th.neighbours;
  const factor = nb.class_factor[landerClass] ?? 1;
  const sigmaKm = (nb.sigma_factor * sigmaM) / 1000;
  const items = [];
  for (const site of sites) {
    const keepout = nb.keepout_km[site.type];
    if (!(keepout > 0)) continue;                       // будущие цели и т. п. не защищаем
    const km = distanceKm(lat, lon, site.lat, site.lon);
    const zoneKm = Math.max(keepout * factor, sigmaKm);
    const los = lineOfSight(km, bearingDeg(lat, lon, site.lat, site.lon), place, nb);
    let level = 'ok';
    let reason = 'outside';
    if (km < zoneKm) { level = 'bad'; reason = 'keepout'; }
    else if (km <= nb.gravel_km) {
      if (los.visible) { level = 'warn'; reason = 'gravel'; } else { reason = 'gravel-shielded'; }
    }
    items.push({ site, km, zoneKm, level, reason, los, sigmaDecides: sigmaKm > keepout * factor });
  }
  items.sort((a, b) => a.km - b.km);
  let level = 'ok';
  let worst = null;
  for (const it of items) {
    const rank = ORDER.indexOf(it.level);
    if (rank > ORDER.indexOf(level) || (rank === ORDER.indexOf(level) && rank > 0 && it.km - it.zoneKm < worst.km - worst.zoneKm)) {
      level = it.level;
      worst = it;
    }
  }
  return { level, worst, nearest: items[0] ?? null, items, dust: items.filter(it => it.los.visible) };
}

// Итог — по самому плохому из трёх блоков
export function overallLevel(levels) {
  const known = levels.filter(Boolean);
  if (!known.length) return null;
  return known.reduce((a, b) => (ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a));
}

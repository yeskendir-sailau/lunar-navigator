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

// Соседи: у каждого места своя «запретная зона» (keep-out). Её радиус зависит от типа места
// и умножается на класс аппарата. Промах посадки (precision) съедает часть расстояния.
// Возвращает { level, worst, nearest }: worst — самый «опасный» сосед, nearest — ближайший.
export function rateNeighbours(lat, lon, sites, precisionM, landerClass, th) {
  const nb = th.neighbours;
  const factor = nb.class_factor[landerClass] ?? 1;
  let level = 'ok';
  let worst = null;
  let nearest = null;
  for (const site of sites) {
    const keepout = nb.keepout_km[site.type];
    if (!(keepout > 0)) continue;                 // будущие цели и т. п. не защищаем
    const km = distanceKm(lat, lon, site.lat, site.lon);
    const gapKm = km - precisionM / 1000;         // худший случай: промахнулись в сторону соседа
    const zoneKm = keepout * factor;
    const l = gapKm < zoneKm ? 'bad' : gapKm < zoneKm * nb.caution_factor ? 'warn' : 'ok';
    const info = { site, km, gapKm, zoneKm, level: l };
    if (!nearest || km < nearest.km) nearest = info;
    if (ORDER.indexOf(l) > ORDER.indexOf(level) ||
        (l === level && l !== 'ok' && (!worst || gapKm - zoneKm < worst.gapKm - worst.zoneKm))) {
      level = l;
      worst = info;
    }
  }
  return { level, worst, nearest };
}

// Итог — по самому плохому из трёх блоков
export function overallLevel(levels) {
  const known = levels.filter(Boolean);
  if (!known.length) return null;
  return known.reduce((a, b) => (ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a));
}

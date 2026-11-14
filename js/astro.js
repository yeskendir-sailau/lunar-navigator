// Модуль astro.js: где Солнце и Земля стоят над горизонтом выбранной точки Луны.
// Не зависит от three.js. Данные берёт из data/sun_earth.json (его делает tools/make_ephemeris.py).
//
// Система координат файла: MOON_ME_DE421 («Mean Earth / polar axis»):
//   +x — на «среднюю Землю» (широта 0, долгота 0), +y — на 90° в. д., +z — на северный полюс.
// Поэтому направление «вверх» в точке (lat, lon) — это вектор
//   (cos lat · cos lon,  cos lat · sin lon,  sin lat).
// Высота тела над горизонтом = арксинус от скалярного произведения «вверх» и направления на тело.
//
// Допущения (честно): горизонт ровный (гор и кратеров нет), атмосферы нет (рефракции нет),
// высота считается для центра диска Солнца или Земли.
// Если для точки есть маска горизонта из data/horizons.json (см. horizon.js), тело считается
// «над горизонтом», только когда оно выше рельефа в своём направлении (азимуте).

import { maskElevationAt } from './horizon.js';

const DEG = Math.PI / 180;
const HOUR_MS = 3600e3;

// Загружает data/sun_earth.json и готовит его к расчётам
export async function loadEphemeris(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot load ${url}: ${response.status}`);
  const d = await response.json();
  if (!Array.isArray(d.sun) || !Array.isArray(d.earth) ||
      d.sun.length < 2 || d.sun.length !== d.earth.length) {
    throw new Error('sun_earth.json: unexpected format');
  }
  const startMs = Date.parse(d.start_utc);
  const stepMs = d.step_hours * HOUR_MS;
  if (!Number.isFinite(startMs) || !(stepMs > 0)) {
    throw new Error('sun_earth.json: bad start_utc or step_hours');
  }
  const count = d.sun.length;
  return {
    startMs,
    stepMs,
    count,
    endMs: startMs + (count - 1) * stepMs,   // последний момент, для которого есть данные
    sun: d.sun,
    earth: d.earth,
  };
}

export function inDataRange(eph, ms) {
  return ms >= eph.startMs && ms <= eph.endMs;
}

// Направление на тело в момент ms: берём два ближайших часа и плавно «смешиваем»
export function directionAt(eph, body, ms) {
  const f = (ms - eph.startMs) / eph.stepMs;
  if (!(f >= 0) || f > eph.count - 1) return null;   // за пределами данных
  const i = Math.min(Math.floor(f), eph.count - 2);
  const w = f - i;
  const a = eph[body][i];
  const b = eph[body][i + 1];
  const x = a[0] + (b[0] - a[0]) * w;
  const y = a[1] + (b[1] - a[1]) * w;
  const z = a[2] + (b[2] - a[2]) * w;
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

// Высота над горизонтом (градусы) для направления dir в точке (lat, lon)
export function elevationDeg(dir, latDeg, lonDeg) {
  const la = latDeg * DEG;
  const lo = lonDeg * DEG;
  const s = dir[0] * Math.cos(la) * Math.cos(lo) +
            dir[1] * Math.cos(la) * Math.sin(lo) +
            dir[2] * Math.sin(la);
  return Math.asin(Math.max(-1, Math.min(1, s))) / DEG;
}

// Азимут направления dir в точке (lat, lon): градусы по часовой от севера (восток = 90°)
export function azimuthDeg(dir, latDeg, lonDeg) {
  const la = latDeg * DEG;
  const lo = lonDeg * DEG;
  const east = -dir[0] * Math.sin(lo) + dir[1] * Math.cos(lo);
  const north = -dir[0] * Math.sin(la) * Math.cos(lo) - dir[1] * Math.sin(la) * Math.sin(lo) + dir[2] * Math.cos(la);
  const az = Math.atan2(east, north) / DEG;
  return az < 0 ? az + 360 : az;
}

// «Запас» над горизонтом: высота тела минус предел (градусы). Больше нуля = тело считается видимым.
// Предел = больший из minElevation (например, «Солнце полезно от 5°») и высоты рельефа из маски.
function marginDeg(dir, lat, lon, minElevation, mask) {
  let limit = minElevation;
  if (mask) limit = Math.max(limit, maskElevationAt(mask, azimuthDeg(dir, lat, lon)));
  return elevationDeg(dir, lat, lon) - limit;
}

// body: 'sun' или 'earth'. Вернёт null, если для этого момента нет данных.
export function bodyElevation(eph, body, lat, lon, ms) {
  const dir = directionAt(eph, body, ms);
  return dir ? elevationDeg(dir, lat, lon) : null;
}

// Все условия в точке и в момент ms. mask — маска горизонта точки (или null: ровный горизонт)
export function conditionsAt(eph, lat, lon, ms, mask = null) {
  const sunDir = directionAt(eph, 'sun', ms);
  const earthDir = directionAt(eph, 'earth', ms);
  if (!sunDir || !earthDir) return null;
  return {
    sunElevation: elevationDeg(sunDir, lat, lon),
    earthElevation: elevationDeg(earthDir, lat, lon),
    sunUp: marginDeg(sunDir, lat, lon, 0, mask) > 0,
    earthUp: marginDeg(earthDir, lat, lon, 0, mask) > 0,   // Земля над горизонтом = есть прямая видимость для связи
    terrain: Boolean(mask),
  };
}

// Ближайший момент, когда тело пересекает горизонт (восход или заход).
// Вернёт { timeMs, rising } или null, если в ближайшие maxHours часов (в пределах данных) этого нет.
export function nextCrossing(eph, body, lat, lon, fromMs, maxHours = 24 * 31, stepMin = 30, mask = null) {
  const stepMs = stepMin * 60e3;
  const endMs = Math.min(fromMs + maxHours * HOUR_MS, eph.endMs);
  const margin = ms => {
    const dir = directionAt(eph, body, ms);
    return dir ? marginDeg(dir, lat, lon, 0, mask) : null;
  };
  let t0 = fromMs;
  let e0 = margin(t0);
  if (e0 === null) return null;

  while (t0 < endMs) {
    const t1 = Math.min(t0 + stepMs, endMs);
    const e1 = margin(t1);
    if (e1 === null) return null;
    if ((e0 > 0) !== (e1 > 0)) {
      // Горизонт пересечён между t0 и t1: уточняем делением пополам
      let lo = t0;
      let hi = t1;
      for (let k = 0; k < 20; k++) {
        const mid = (lo + hi) / 2;
        const em = margin(mid);
        if ((em > 0) === (e0 > 0)) lo = mid; else hi = mid;
      }
      return { timeMs: hi, rising: e1 > 0 };
    }
    t0 = t1;
    e0 = e1;
  }
  return null;
}

// Сводка по ближайшим `days` суткам от момента fromMs: доля времени с «полезным» Солнцем, самая длинная
// «ночь», доля времени с видимой Землёй, самый долгий перерыв без неё.
// opts.sunMinElevation / earthMinElevation (градусы, по умолчанию 0): ниже этой высоты тело не считаем.
// opts.mask: маска горизонта точки (рельеф) или null: ровный горизонт.
// «Самая длинная ночь» считается внутри окна: если ночь уже идёт, учитывается только её остаток.
export function summarize(eph, lat, lon, fromMs, days = 30, stepMin = 60, opts = {}) {
  const { sunMinElevation = 0, earthMinElevation = 0, mask = null } = opts;
  const stepMs = stepMin * 60e3;
  const endMs = Math.min(fromMs + days * 24 * HOUR_MS, eph.endMs);
  const acc = {
    sun: { up: 0, total: 0, run: 0, longest: 0, min: sunMinElevation },
    earth: { up: 0, total: 0, run: 0, longest: 0, min: earthMinElevation },
  };
  for (let t = fromMs; t <= endMs; t += stepMs) {
    for (const body of ['sun', 'earth']) {
      const dir = directionAt(eph, body, t);
      if (!dir) continue;
      const a = acc[body];
      a.total++;
      if (marginDeg(dir, lat, lon, a.min, mask) > 0) { a.up++; a.run = 0; }
      else { a.run++; if (a.run > a.longest) a.longest = a.run; }
    }
  }
  if (acc.sun.total === 0 || acc.earth.total === 0) return null;
  const stepH = stepMin / 60;
  return {
    windowHours: acc.sun.total * stepH,
    daylightPct: (100 * acc.sun.up) / acc.sun.total,
    longestNightHours: acc.sun.longest * stepH,
    earthVisiblePct: (100 * acc.earth.up) / acc.earth.total,
    longestEarthGapHours: acc.earth.longest * stepH,
    terrain: Boolean(mask),
  };
}

// Ряд значений для графика: высоты Солнца и Земли каждые stepMin минут
export function elevationSeries(eph, lat, lon, fromMs, hours, stepMin = 60) {
  const out = { timesMs: [], sun: [], earth: [] };
  const stepMs = stepMin * 60e3;
  const endMs = Math.min(fromMs + hours * HOUR_MS, eph.endMs);
  for (let t = fromMs; t <= endMs; t += stepMs) {
    out.timesMs.push(t);
    out.sun.push(bodyElevation(eph, 'sun', lat, lon, t));
    out.earth.push(bodyElevation(eph, 'earth', lat, lon, t));
  }
  return out;
}

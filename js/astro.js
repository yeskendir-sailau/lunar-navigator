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

// body: 'sun' или 'earth'. Вернёт null, если для этого момента нет данных.
export function bodyElevation(eph, body, lat, lon, ms) {
  const dir = directionAt(eph, body, ms);
  return dir ? elevationDeg(dir, lat, lon) : null;
}

// Все условия в точке и в момент ms
export function conditionsAt(eph, lat, lon, ms) {
  const sun = bodyElevation(eph, 'sun', lat, lon, ms);
  const earth = bodyElevation(eph, 'earth', lat, lon, ms);
  if (sun === null || earth === null) return null;
  return {
    sunElevation: sun,
    earthElevation: earth,
    sunUp: sun > 0,
    earthUp: earth > 0,   // Земля над горизонтом = есть прямая видимость для связи
  };
}

// Ближайший момент, когда тело пересекает горизонт (восход или заход).
// Вернёт { timeMs, rising } или null, если в ближайшие maxHours часов (в пределах данных) этого нет.
export function nextCrossing(eph, body, lat, lon, fromMs, maxHours = 24 * 31, stepMin = 30) {
  const stepMs = stepMin * 60e3;
  const endMs = Math.min(fromMs + maxHours * HOUR_MS, eph.endMs);
  let t0 = fromMs;
  let e0 = bodyElevation(eph, body, lat, lon, t0);
  if (e0 === null) return null;

  while (t0 < endMs) {
    const t1 = Math.min(t0 + stepMs, endMs);
    const e1 = bodyElevation(eph, body, lat, lon, t1);
    if (e1 === null) return null;
    if ((e0 > 0) !== (e1 > 0)) {
      // Горизонт пересечён между t0 и t1: уточняем делением пополам
      let lo = t0;
      let hi = t1;
      for (let k = 0; k < 20; k++) {
        const mid = (lo + hi) / 2;
        const em = bodyElevation(eph, body, lat, lon, mid);
        if ((em > 0) === (e0 > 0)) lo = mid; else hi = mid;
      }
      return { timeMs: hi, rising: e1 > 0 };
    }
    t0 = t1;
    e0 = e1;
  }
  return null;
}

// Сводка по ближайшим `days` суткам от момента fromMs: доля светлого времени, самая длинная ночь,
// доля времени с видимой Землёй, самый долгий перерыв без неё. Всё считается на ровном горизонте.
// «Самая длинная ночь» считается внутри окна: если ночь уже идёт, учитывается только её остаток.
export function summarize(eph, lat, lon, fromMs, days = 30, stepMin = 60) {
  const s = elevationSeries(eph, lat, lon, fromMs, days * 24, stepMin);
  const stepH = stepMin / 60;

  function stats(values) {
    let up = 0;
    let total = 0;
    let run = 0;
    let longestDown = 0;
    for (const v of values) {
      if (v === null) continue;
      total++;
      if (v > 0) { up++; run = 0; } else { run++; if (run > longestDown) longestDown = run; }
    }
    return { total, upPct: total ? (100 * up) / total : 0, longestDownHours: longestDown * stepH };
  }

  const sun = stats(s.sun);
  const earth = stats(s.earth);
  if (sun.total === 0) return null;
  return {
    windowHours: sun.total * stepH,
    daylightPct: sun.upPct,
    longestNightHours: sun.longestDownHours,
    earthVisiblePct: earth.upPct,
    longestEarthGapHours: earth.longestDownHours,
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

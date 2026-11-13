// Модуль «горы на горизонте»: читает data/horizons.json (его делает tools/make_horizons.py)
// и отвечает, видно ли Солнце или Землю НАД горами, а не только над ровным горизонтом.
// Не зависит от three.js.
import { directionAt, elevationDeg, azimuthDeg } from './astro.js';

// Ровная местность при высоте глаза 2 м: кривизна Луны опускает горизонт на ~0.087°.
export const FLAT_DEG = -0.087;
const MOON_KM = 1737.4;

// Загружает маски. Нет файла или он испорчен — вернёт null, и сайт работает как раньше.
export async function loadHorizons(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const d = await response.json();
    const places = (d.places ?? []).filter(p =>
      Number.isFinite(p.lat) && Number.isFinite(p.lon) && Array.isArray(p.mask) && p.mask.length === 360);
    return places.length ? { meta: d.meta ?? {}, places } : null;
  } catch (error) {
    console.warn('horizons.json not loaded:', error);
    return null;
  }
}

// Расстояние между двумя точками на поверхности Луны, км
function distanceKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
            Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * MOON_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Место с маской рядом с выбранной точкой (по умолчанию — не дальше 3 км) или null
export function findHorizon(hz, lat, lon, maxKm = 3) {
  if (!hz) return null;
  let best = null;
  let bestKm = maxKm;
  for (const p of hz.places) {
    const km = distanceKm(lat, lon, p.lat, p.lon);
    if (km <= bestKm) { best = p; bestKm = km; }
  }
  return best;
}

// Высота гор (градусы) в направлении az: между соседними градусами — плавно
export function maskAt(place, az) {
  const i = Math.floor(az) % 360;
  const j = (i + 1) % 360;
  const f = az - Math.floor(az);
  const a = place.mask[i] ?? FLAT_DEG;
  const b = place.mask[j] ?? FLAT_DEG;
  return a + (b - a) * f;
}

// Состояние тела ('sun' или 'earth') в момент ms: высота, азимут, высота гор, видно ли над горами
export function bodyState(eph, place, body, ms) {
  const dir = directionAt(eph, body, ms);
  if (!dir) return null;
  const el = elevationDeg(dir, place.lat, place.lon);
  const az = azimuthDeg(dir, place.lat, place.lon);
  const mask = maskAt(place, az);
  return { elevation: el, azimuth: az, mask, visible: el > mask, flatVisible: el > FLAT_DEG };
}

// Сводка на `days` суток вперёд: доля времени, когда тело видно над горами, и для сравнения — над ровной местностью
export function summarizeTerrain(eph, place, fromMs, days = 30, stepMin = 60) {
  const out = { sun: { n: 0, flat: 0, terrain: 0 }, earth: { n: 0, flat: 0, terrain: 0 } };
  const endMs = Math.min(fromMs + days * 864e5, eph.endMs);
  for (let t = fromMs; t <= endMs; t += stepMin * 60e3) {
    for (const body of ['sun', 'earth']) {
      const s = bodyState(eph, place, body, t);
      if (!s) continue;
      const c = out[body];
      c.n++;
      if (s.flatVisible) c.flat++;
      if (s.visible) c.terrain++;
    }
  }
  const pct = (a, n) => (n ? (100 * a) / n : null);
  return {
    sunFlatPct: pct(out.sun.flat, out.sun.n),
    sunTerrainPct: pct(out.sun.terrain, out.sun.n),
    earthFlatPct: pct(out.earth.flat, out.earth.n),
    earthTerrainPct: pct(out.earth.terrain, out.earth.n),
  };
}

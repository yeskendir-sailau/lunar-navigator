// Модуль horizon.js: маска горизонта (рельеф) для мест из списка. Не зависит от three.js.
// Файл data/horizons.json готовится отдельным шагом из данных LOLA (высоты рельефа). Если файла нет,
// сайт работает как раньше: горизонт считается ровным, и об этом честно написано в отчёте.
//
// Формат data/horizons.json:
// {
//   "format": 1,
//   "azimuth_step_deg": 5,                       // шаг по азимуту; значений ровно 360 / шаг
//   "points": [
//     { "id": "apollo11", "lat": 0.67408, "lon": 23.47297,
//       "elevation_deg": [0.2, 0.3, ...] }       // высота рельефа над горизонтом: азимут 0° (север), 5°, 10°, ... по часовой
//   ]
// }

const DEG = Math.PI / 180;

// Угловое расстояние между двумя точками, градусы (для поиска ближайшего места из списка)
function angleDeg(lat1, lon1, lat2, lon2) {
  const a = Math.sin(((lat2 - lat1) * DEG) / 2) ** 2 +
            Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(((lon2 - lon1) * DEG) / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(a)))) / DEG;
}

// Проверяет и готовит данные; бросает Error с понятным текстом, если формат не тот
export function parseHorizons(data) {
  if (!data || !Array.isArray(data.points) || !(data.azimuth_step_deg > 0)) {
    throw new Error('horizons.json: expected { azimuth_step_deg, points: [...] }');
  }
  const step = data.azimuth_step_deg;
  const expected = Math.round(360 / step);
  const points = [];
  for (const p of data.points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || !Array.isArray(p.elevation_deg) ||
        p.elevation_deg.length !== expected || !p.elevation_deg.every(Number.isFinite)) {
      throw new Error(`horizons.json: bad point "${p.id ?? '?'}" (needs lat, lon and ${expected} elevation values)`);
    }
    points.push({ id: p.id ?? null, lat: p.lat, lon: p.lon, mask: { stepDeg: step, values: p.elevation_deg } });
  }
  return { stepDeg: step, points };
}

// Загружает horizons.json. Нет файла или он испорчен -> null (сайт продолжает работать с ровным горизонтом)
export async function loadHorizons(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const parsed = parseHorizons(await response.json());
    return parsed.points.length ? parsed : null;   // файл есть, но мест в нём нет: считаем, что рельефа нет
  } catch (error) {
    console.warn('Terrain horizon data not used:', error.message);
    return null;
  }
}

// Маска для точки (lat, lon): ближайшее место из списка не дальше tolDeg градусов, иначе null (ровный горизонт)
export function horizonFor(horizons, lat, lon, tolDeg = 0.05) {
  if (!horizons) return null;
  let best = null;
  for (const p of horizons.points) {
    const d = angleDeg(lat, lon, p.lat, p.lon);
    if (d <= tolDeg && (best === null || d < best.d)) best = { d, mask: p.mask };
  }
  return best ? best.mask : null;
}

// Высота рельефа (градусы) в направлении азимута azDeg: линейная интерполяция по кругу
export function maskElevationAt(mask, azDeg) {
  const n = mask.values.length;
  const x = ((((azDeg % 360) + 360) % 360) / mask.stepDeg);
  const i = Math.floor(x) % n;
  const j = (i + 1) % n;
  const w = x - Math.floor(x);
  return mask.values[i] * (1 - w) + mask.values[j] * w;
}

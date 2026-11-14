// Тесты чистой логики (без three.js). Работают и в Node (tests/run.mjs), и в браузере (demos/tests.html).
// runTests({ sites, th }) -> [{ name, ok, detail }]
import { haversineKm, keepOutKm, assessNeighbors, bearingDeg } from '../js/safety.js';
import { elevationDeg, azimuthDeg, conditionsAt, summarize, nextCrossing } from '../js/astro.js';
import { parseHorizons, horizonFor, maskElevationAt } from '../js/horizon.js';
import { buildReport } from '../js/report-logic.js';
import { buildComparison } from '../js/compare.js';
import { parseLatLon as parseCoords } from '../js/coords-input.js';

// Простая проверочная модель неба: Земля всегда в точке (0°, 0°), Солнце обходит Луну по экватору за 29,53 суток.
// (Настоящие положения — в data/sun_earth.json; здесь нужна только предсказуемая картина для проверок.)
function toyEphemeris() {
  const startMs = Date.parse('2026-01-01T00:00:00Z');
  const count = 24 * 120;
  const sun = [];
  const earth = [];
  for (let i = 0; i < count; i++) {
    const a = (2 * Math.PI * i) / (24 * 29.53);
    sun.push([Math.cos(a), Math.sin(a), 0]);
    earth.push([1, 0, 0]);
  }
  return { startMs, stepMs: 3600e3, count, endMs: startMs + (count - 1) * 3600e3, sun, earth };
}

export function runTests({ sites, th }) {
  const results = [];
  const test = (name, fn) => {
    try {
      const r = fn();
      results.push({ name, ok: r !== false, detail: typeof r === 'string' ? r : '' });
    } catch (e) {
      results.push({ name, ok: false, detail: e.message });
    }
  };
  const near = (a, b, tol, what = '') => {
    if (!(Math.abs(a - b) <= tol)) throw new Error(`${what} expected ${b} ±${tol}, got ${a}`);
  };
  const byId = id => sites.find(s => s.id === id);
  const R = th.neighbors.moon_radius_km;

  // --- Расстояния ---
  test('haversine: 1 degree along the equator = 30.32 km', () => near(haversineKm(0, 0, 0, 1, R), 30.32, 0.01));
  test('haversine: same point = 0', () => near(haversineKm(10, 20, 10, 20, R), 0, 1e-9));
  test('haversine: symmetric', () => near(haversineKm(10, 20, -30, 70, R), haversineKm(-30, 70, 10, 20, R), 1e-9));
  test('bearing: due east = 90, due north = 0', () => {
    near(bearingDeg(0, 0, 0, 10), 90, 1e-6);
    near(bearingDeg(0, 0, 10, 0), 0, 1e-6);
  });

  // --- Apollo 12 и Surveyor 3 ---
  test('Apollo 12 to Surveyor 3 is about 155-160 m', () => {
    const d = haversineKm(byId('apollo12').lat, byId('apollo12').lon, byId('surveyor3').lat, byId('surveyor3').lon, R) * 1000;
    if (d < 150 || d > 165) throw new Error(`got ${d.toFixed(1)} m`);
    return `${d.toFixed(1)} m`;
  });
  test('a point at Apollo 12 is red for neighbors (Surveyor 3 is inside the keep-out zone)', () => {
    const a = byId('apollo12');
    const r = assessNeighbors(a.lat, a.lon, sites.filter(s => s.id !== 'apollo12'), 100, th.neighbors);
    if (r.status !== 'red') throw new Error(`status ${r.status}`);
    if (r.nearest.site.id !== 'surveyor3') throw new Error(`nearest ${r.nearest.site.id}`);
    if (r.nearest.zone !== 'keep-out') throw new Error(`zone ${r.nearest.zone}`);
  });
  test('a point far from everything is green', () => {
    const r = assessNeighbors(-89, 100, sites, 100, th.neighbors);
    if (r.status !== 'green') throw new Error(`status ${r.status}`);
  });

  // --- Правила NASA 2011 ---
  test('keep-out: 2.0 km for landers, 0.5 km for impact sites', () => {
    near(keepOutKm({ type: 'heritage' }, 100, th.neighbors), 2.0, 1e-9);
    near(keepOutKm({ type: 'impact' }, 100, th.neighbors), 0.5, 1e-9);
  });
  test('keep-out: 3 sigma wins when it is larger (1 km sigma -> 3 km)', () => {
    near(keepOutKm({ type: 'heritage' }, 1000, th.neighbors), 3.0, 1e-9);
    near(keepOutKm({ type: 'impact' }, 1000, th.neighbors), 3.0, 1e-9);
  });
  test('zones by distance from a lander: 1.9 km red, 2.5 km yellow gravel, 3.0 km yellow dust, 4.5 km green', () => {
    const site = { id: 'x', name: 'X', type: 'heritage', lat: 0, lon: 0 };
    const kmToDeg = 1 / 30.3224;
    const zone = km => assessNeighbors(0, km * kmToDeg, [site], 100, th.neighbors).nearest.zone;
    const expect = [[1.9, 'keep-out'], [2.5, 'dust'], [3.0, 'dust'], [4.5, 'clear']];
    // Правило NASA 2 км шире, чем гравий 1.5 км, поэтому «гравий» виден только у мест падения (0,5 км)
    for (const [km, z] of expect) if (zone(km) !== z) throw new Error(`${km} km -> ${zone(km)}, expected ${z}`);
    const impact = { ...site, type: 'impact' };
    const z2 = km => assessNeighbors(0, km * kmToDeg, [impact], 100, th.neighbors).nearest.zone;
    if (z2(0.4) !== 'keep-out' || z2(1.0) !== 'gravel' || z2(2.5) !== 'dust' || z2(4) !== 'clear') throw new Error('impact zones wrong');
  });

  // --- Рельеф как защита (приближение) ---
  test('terrain shielding lowers dust risk (yellow -> green) but never the keep-out zone', () => {
    const site = { id: 'x', name: 'X', type: 'heritage', lat: 0, lon: 3 / 30.3224, };   // 3 km к востоку
    const flat = parseHorizons({ azimuth_step_deg: 90, points: [{ id: 'p', lat: 0, lon: 0, elevation_deg: [0, 0, 0, 0] }] });
    const hill = parseHorizons({ azimuth_step_deg: 90, points: [{ id: 'p', lat: 0, lon: 0, elevation_deg: [0, 10, 0, 0] }] });   // горы на востоке
    const a = assessNeighbors(0, 0, [site], 100, th.neighbors, horizonFor(flat, 0, 0));
    const b = assessNeighbors(0, 0, [site], 100, th.neighbors, horizonFor(hill, 0, 0));
    if (a.status !== 'yellow') throw new Error(`flat: ${a.status}`);
    if (b.status !== 'green' || !b.neighbors[0].shielded) throw new Error(`hill: ${b.status}`);
    const close = { ...site, lon: 1 / 30.3224 };   // 1 км: внутри запретной зоны
    const c = assessNeighbors(0, 0, [close], 100, th.neighbors, horizonFor(hill, 0, 0));
    if (c.status !== 'red') throw new Error(`keep-out with hill: ${c.status}`);
  });
  test('horizon mask interpolates around the circle', () => {
    const mask = { stepDeg: 90, values: [0, 10, 0, 20] };
    near(maskElevationAt(mask, 45), 5, 1e-9);
    near(maskElevationAt(mask, 315), 10, 1e-9);   // между 270° (20) и 360°=0° (0)
    near(maskElevationAt(mask, 720 + 90), 10, 1e-9);
  });
  test('horizons.json with a wrong number of values is rejected', () => {
    let failed = false;
    try { parseHorizons({ azimuth_step_deg: 90, points: [{ lat: 0, lon: 0, elevation_deg: [0, 0] }] }); } catch { failed = true; }
    if (!failed) throw new Error('should throw');
  });

  // --- Солнце и Земля ---
  test('elevation: body straight overhead = 90, on the horizon = 0', () => {
    near(elevationDeg([1, 0, 0], 0, 0), 90, 1e-9);
    near(elevationDeg([0, 1, 0], 0, 0), 0, 1e-9);
    near(elevationDeg([0, 0, 1], 90, 0), 90, 1e-9);
  });
  test('azimuth: north = 0, east = 90', () => {
    near(azimuthDeg([0, 0, 1], 0, 0), 0, 1e-9);
    near(azimuthDeg([0, 1, 0], 0, 0), 90, 1e-9);
  });
  const eph = toyEphemeris();
  const t0 = eph.startMs;
  test('toy Sun: noon at (0,0) on day 0, midnight about 14.8 days later', () => {
    near(conditionsAt(eph, 0, 0, t0).sunElevation, 90, 0.01);
    near(conditionsAt(eph, 0, 0, t0 + 14.765 * 86400e3).sunElevation, -90, 0.5);
  });
  test('Earth is visible from the near side and never from the far side', () => {
    if (!conditionsAt(eph, 0, 0, t0).earthUp) throw new Error('near side');
    if (conditionsAt(eph, 0, 180, t0).earthUp) throw new Error('far side');
  });
  test('summarize: equator sunlit about half of a full lunar cycle', () => {
    const s = summarize(eph, 0, 0, t0, 29.5, 60);
    near(s.daylightPct, 50, 2);
    near(s.longestNightHours, 14.77 * 24, 6);
  });
  test('nextCrossing finds the sunset about 7.4 days after noon', () => {
    const c = nextCrossing(eph, 'sun', 0, 0, t0);
    if (!c || c.rising) throw new Error('no sunset found');
    near((c.timeMs - t0) / 86400e3, 7.38, 0.05);
  });
  test('terrain mask hides a body that is behind a hill', () => {
    const mask = { stepDeg: 90, values: [0, 0, 0, 0] };
    const hill = { stepDeg: 90, values: [30, 30, 30, 30] };
    const t = t0 + 6.5 * 86400e3;   // Солнце низко над горизонтом
    const open = conditionsAt(eph, 0, 0, t, mask);
    const blocked = conditionsAt(eph, 0, 0, t, hill);
    if (!open.sunUp || blocked.sunUp) throw new Error(`open ${open.sunUp}, blocked ${blocked.sunUp}, el ${open.sunElevation}`);
  });

  // --- Отчёт: цвет и значки ---
  const ctx = { eph, sites, th, horizons: null };
  test('report at Apollo 12 is red because of the neighbor and says so', () => {
    const a = byId('apollo12');
    const r = buildReport({ ...ctx, sites: sites.filter(s => s.id !== 'apollo12') }, a.lat, a.lon, { ms: t0, accuracyM: 100 });
    if (r.overall !== 'red') throw new Error(`overall ${r.overall}`);
    if (r.blocks[2].status !== 'red') throw new Error('neighbors block not red');
    if (!r.blocks[2].reasons.join(' ').includes('Surveyor 3')) throw new Error('reason does not name Surveyor 3');
  });
  test('the date changes the colour: same point, sunrise vs. just before sunset', () => {
    const early = buildReport(ctx, 0, 0, { ms: t0 + 0.1 * 86400e3, accuracyM: 100 });
    const late = buildReport(ctx, 0, 0, { ms: t0 + 6.2 * 86400e3, accuracyM: 100 });
    const rank = { green: 0, yellow: 1, red: 2 };
    if (!(rank[late.blocks[0].status] > rank[early.blocks[0].status])) {
      throw new Error(`early ${early.blocks[0].status}, late ${late.blocks[0].status}`);
    }
  });
  test('overall colour is the worst of the three', () => {
    const r = buildReport(ctx, 0, 0, { ms: t0 + 0.1 * 86400e3, accuracyM: 100 });
    const rank = { green: 0, yellow: 1, red: 2 };
    const worst = Math.max(...r.blocks.map(b => rank[b.status]));
    if (rank[r.overall] !== worst) throw new Error('not the worst');
  });
  test('no ephemeris -> Energy and Communication say "no data", Neighbors still work', () => {
    const r = buildReport({ eph: null, sites, th, horizons: null }, -89, 100, { ms: NaN, accuracyM: 100 });
    if (r.blocks[0].status !== 'unknown' || r.blocks[1].status !== 'unknown') throw new Error('not unknown');
    if (r.blocks[2].status !== 'green') throw new Error(`neighbors ${r.blocks[2].status}`);
  });
  test('flat horizon is stated in the report; terrain is stated when used', () => {
    const flat = buildReport(ctx, 0, 0, { ms: t0, accuracyM: 100 });
    if (!/Flat horizon/.test(flat.blocks[0].note)) throw new Error('no flat note');
    const hz = parseHorizons({ azimuth_step_deg: 90, points: [{ id: 'p', lat: 0, lon: 0, elevation_deg: [0, 0, 0, 0] }] });
    const terr = buildReport({ ...ctx, horizons: hz }, 0, 0, { ms: t0, accuracyM: 100 });
    if (!/Terrain horizon/.test(terr.blocks[0].note)) throw new Error('no terrain note');
  });
  test('thresholds.json has every number the report needs', () => {
    for (const k of ['window_days', 'sun_min_elevation_deg', 'daylight_pct', 'longest_night_hours']) if (th.energy[k] === undefined) throw new Error(`energy.${k}`);
    for (const k of ['window_days', 'earth_visible_pct', 'longest_gap_hours']) if (th.communication[k] === undefined) throw new Error(`communication.${k}`);
    for (const k of ['keep_out_km', 'gravel_km', 'dust_line_of_sight_km', 'sigma_multiple', 'moon_radius_km']) if (th.neighbors[k] === undefined) throw new Error(`neighbors.${k}`);
  });

  // --- Сравнение ---
  test('comparison: rows for three checks, best value flagged, 3 places supported', () => {
    const places = [{ lat: 0, lon: 0 }, { lat: 0, lon: 120 }, { lat: 0, lon: 180 }];
    const c = buildComparison(ctx, places, { ms: t0 + 1 * 86400e3, accuracyM: 100 });
    if (c.columns.length !== 3) throw new Error('columns');
    const labels = c.rows.map(r => r.label);
    for (const need of ['Overall', 'Energy', 'Communication', 'Neighbors']) if (!labels.includes(need)) throw new Error(`row ${need}`);
    const earth = c.rows.find(r => r.label === 'Earth in view');
    // (0,0) видит Землю всегда, (0,120) и (0,180) — никогда: лучший — первый столбец
    if (earth.best.join() !== '0') throw new Error(`best ${earth.best}`);
  });
  test('comparison: nothing is highlighted when all values are equal', () => {
    const c = buildComparison(ctx, [{ lat: -89, lon: 0 }, { lat: -89, lon: 0 }], { ms: t0, accuracyM: 100 });
    const near = c.rows.find(r => r.label === 'Nearest site');
    if (near.best.length) throw new Error('highlighted');
  });

  // --- Ввод координат ---
  test('coordinates: "-3.0128, -23.4219" and "3.01 S 23.42 W" parse the same', () => {
    const a = parseCoords('-3.0128, -23.4219');
    const b = parseCoords('3.0128 S 23.4219 W');
    if (!a || !b) throw new Error('not parsed');
    near(a.lat, b.lat, 1e-9);
    near(a.lon, b.lon, 1e-9);
  });

  return results;
}

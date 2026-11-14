// Модуль report-logic.js: собирает отчёт из трёх проверок (Энергия, Связь, Соседи) и итоговый цвет.
// Не зависит от three.js и от страницы: на входе числа, на выходе простой объект. Пороги — в data/thresholds.json.
import { summarize, conditionsAt } from './astro.js';
import { assessNeighbors } from './safety.js';
import { horizonFor } from './horizon.js';
import { fmtHours, fmtDeg, fmtDistance } from './format.js';

// Цвет всегда повторяется значком и словом (чтобы отчёт читался и без различения цветов)
export const STATUS = {
  green:   { icon: '✓', word: 'Good',            color: '#2ecc71', hex: 0x2ecc71 },
  yellow:  { icon: '!', word: 'Caution',         color: '#f1c40f', hex: 0xf1c40f },
  red:     { icon: '✕', word: 'Not recommended', color: '#e74c3c', hex: 0xe74c3c },
  unknown: { icon: '?', word: 'No data',         color: '#9fb0c8', hex: 0x9fb0c8 },
};
const RANK = { green: 0, yellow: 1, red: 2 };

const bandMin = (v, t) => (v >= t.green_min ? 'green' : v >= t.yellow_min ? 'yellow' : 'red');
const bandMax = (v, t) => (v <= t.green_max ? 'green' : v <= t.yellow_max ? 'yellow' : 'red');
const worst = list => list.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'green');

const noData = (title, text) => ({ title, status: 'unknown', headline: text, details: [], reasons: [] });

const horizonNote = mask => (mask
  ? 'Terrain horizon from LOLA data is used.'
  : 'Flat horizon: no terrain data for this point, so mountains and crater walls are not counted.');

function energyBlock(sum, now, th, mask) {
  if (!sum) return noData('Energy', 'No Sun data for this time.');
  const t = th.energy;
  const dayStatus = bandMin(sum.daylightPct, t.daylight_pct);
  const nightStatus = bandMax(sum.longestNightHours, t.longest_night_hours);
  const reasons = [];
  if (dayStatus !== 'green') reasons.push(`sunlit ${Math.round(sum.daylightPct)}% of the time (✓ needs ≥ ${t.daylight_pct.green_min}%)`);
  if (nightStatus !== 'green') reasons.push(`longest night ${fmtHours(sum.longestNightHours)} (✓ needs ≤ ${fmtHours(t.longest_night_hours.green_max)})`);
  return {
    title: 'Energy',
    status: worst([dayStatus, nightStatus]),
    headline: `Sun above ${t.sun_min_elevation_deg ?? 0}° for ${Math.round(sum.daylightPct)}% of the next ${t.window_days} days`,
    note: horizonNote(mask),
    details: [
      `Longest night: ${fmtHours(sum.longestNightHours)}`,
      now ? `Sun now: ${fmtDeg(now.sunElevation)} (${now.sunUp ? 'day' : 'night'})` : null,
    ].filter(Boolean),
    reasons,
  };
}

function communicationBlock(sum, now, th, mask) {
  if (!sum) return noData('Communication', 'No Earth data for this time.');
  const t = th.communication;
  const seeStatus = bandMin(sum.earthVisiblePct, t.earth_visible_pct);
  const gapStatus = bandMax(sum.longestEarthGapHours, t.longest_gap_hours);
  const reasons = [];
  if (seeStatus !== 'green') reasons.push(`Earth in view ${Math.round(sum.earthVisiblePct)}% of the time (✓ needs ≥ ${t.earth_visible_pct.green_min}%)`);
  if (gapStatus !== 'green') reasons.push(`longest break ${fmtHours(sum.longestEarthGapHours)} (✓ needs ≤ ${fmtHours(t.longest_gap_hours.green_max)})`);
  return {
    title: 'Communication',
    status: worst([seeStatus, gapStatus]),
    headline: `Earth in view ${Math.round(sum.earthVisiblePct)}% of the next ${t.window_days} days`,
    note: horizonNote(mask),
    details: [
      `Longest break without Earth: ${fmtHours(sum.longestEarthGapHours)}`,
      now ? `Earth now: ${fmtDeg(now.earthElevation)} (${now.earthUp ? 'visible' : 'below horizon'})` : null,
    ].filter(Boolean),
    reasons,
  };
}

const ZONE_TEXT = {
  'keep-out': 'inside the keep-out zone',
  gravel: 'gravel from the landing may reach it',
  dust: 'dust may reach it if it is in line of sight',
};

function neighborsBlock(result, accuracyM, th) {
  if (result.status === 'unknown') return noData('Neighbors', 'No other sites to check.');
  const n = th.neighbors;
  const near = result.nearest;
  const lines = result.flagged.slice(0, 3).map(f =>
    `${f.site.name}: ${f.distanceKm * 1000 < 1 ? 'same spot' : fmtDistance(f.distanceKm) + ' away'}, ${ZONE_TEXT[f.zone]}` +
    (f.zone === 'keep-out' ? ` (keep-out ${fmtDistance(f.keepOutKm)})` : ''));
  const headline = near
    ? (result.flagged.length
      ? `${result.flagged.length} nearby site${result.flagged.length > 1 ? 's' : ''} to watch`
      : `Nearest site: ${near.site.name}, ${fmtDistance(near.distanceKm)} away`)
    : '';
  return {
    title: 'Neighbors',
    status: result.status,
    headline,
    note: result.terrain
      ? 'Terrain shielding is a rough approximation; the NASA keep-out distance is never reduced.'
      : 'Distances only: terrain shielding is not used (no horizon data for this point).',
    details: lines.length ? lines : [`No site within ${n.dust_line_of_sight_km} km.`],
    reasons: result.status === 'green' ? [] : lines,
  };
}

// ctx: { eph, sites, th, horizons? }; opts: { ms, accuracyM, quick }
// quick: грубый быстрый расчёт для подсветки при наведении мыши
export function buildReport({ eph, sites, th, horizons = null }, lat, lon, { ms, accuracyM, quick = false }) {
  const stepMin = quick ? 180 : 60;
  const mask = horizonFor(horizons, lat, lon);
  const ok = eph && Number.isFinite(ms);
  const eDays = th.energy.window_days;
  const cDays = th.communication?.window_days ?? eDays;
  const opts = { sunMinElevation: th.energy.sun_min_elevation_deg ?? 0, mask };
  const eSum = ok ? summarize(eph, lat, lon, ms, eDays, stepMin, opts) : null;
  const cSum = ok ? (cDays === eDays ? eSum : summarize(eph, lat, lon, ms, cDays, stepMin, opts)) : null;
  const now = ok ? conditionsAt(eph, lat, lon, ms, mask) : null;

  const blocks = [
    energyBlock(eSum, now, th, mask),
    communicationBlock(cSum, now, th, mask),
    neighborsBlock(assessNeighbors(lat, lon, sites, accuracyM, th.neighbors, mask), accuracyM, th),
  ];
  const known = blocks.map(b => b.status).filter(s => s !== 'unknown');
  const overall = known.length ? worst(known) : 'unknown';
  const verdict = {
    green: 'No problems found by these checks',
    yellow: 'Possible, but check the cautions',
    red: 'At least one check is red',
    unknown: 'Not enough data',
  }[overall];
  return { lat, lon, overall, verdict, blocks, terrain: Boolean(mask), summary: { energy: eSum, communication: cSum } };
}

// Compares our Sun / Earth elevations with NASA JPL Horizons for a few places and times and prints a Markdown table
// (paste it into the "Comparison with JPL Horizons" section of README.md).
// Needs Node 18+ and internet access (the Horizons web service). Run from the project folder:
//     node tools/horizons_check.mjs
// NOTE: written without access to the live Horizons service, so the first run is also a test of the script itself.
// If Horizons answers with an error, the script prints the answer so you can see why.
import { readFileSync } from 'node:fs';
import { directionAt, elevationDeg } from '../js/astro.js';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const d = JSON.parse(read('../data/sun_earth.json'));
const startMs = Date.parse(d.start_utc);
const eph = { startMs, stepMs: d.step_hours * 3600e3, count: d.sun.length, endMs: startMs + (d.sun.length - 1) * d.step_hours * 3600e3, sun: d.sun, earth: d.earth };

const PLACES = [
  { name: 'Apollo 11', lat: 0.67408, lon: 23.47297 },
  { name: 'Apollo 17', lat: 20.1911, lon: 30.7723 },
  { name: 'Near the south pole', lat: -85, lon: 0 },
];
const TIMES = ['2026-11-20 00:00', '2026-12-05 12:00', '2027-03-10 06:00'];   // UTC; must lie inside sun_earth.json
const BODIES = [{ name: 'Sun', command: '10', key: 'sun' }, { name: 'Earth', command: '399', key: 'earth' }];

async function horizonsElevation(command, place, time) {
  const stop = new Date(Date.parse(time.replace(' ', 'T') + ':00Z') + 3600e3).toISOString().slice(0, 16).replace('T', ' ');
  const q = new URLSearchParams({
    format: 'json', COMMAND: `'${command}'`, OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'OBSERVER'",
    CENTER: "'coord@301'", COORD_TYPE: "'GEODETIC'", SITE_COORD: `'${place.lon},${place.lat},0'`,
    START_TIME: `'${time}'`, STOP_TIME: `'${stop}'`, STEP_SIZE: "'1 h'", QUANTITIES: "'4'", CSV_FORMAT: "'YES'",
  });
  const response = await fetch(`https://ssd.jpl.nasa.gov/api/horizons.api?${q}`);
  const text = (await response.json()).result ?? '';
  const rows = text.split('$$SOE')[1]?.split('$$EOE')[0]?.trim().split('\n');
  if (!rows) throw new Error(`Horizons did not return a table:\n${text.slice(0, 600)}`);
  const numbers = rows[0].split(',').slice(1).map(s => s.trim()).filter(s => /^[+-]?\d+(\.\d+)?$/.test(s)).map(Number);
  if (numbers.length < 2) throw new Error(`Cannot find azimuth / elevation in: ${rows[0]}`);
  return numbers[1];   // [azimuth, elevation]
}

console.log('| Place | Time (UTC) | Body | Horizons elevation | Our elevation | Difference |');
console.log('|---|---|---|---|---|---|');
let worst = 0;
for (const place of PLACES) {
  for (const time of TIMES) {
    for (const body of BODIES) {
      const ms = Date.parse(time.replace(' ', 'T') + ':00Z');
      const dir = directionAt(eph, body.key, ms);
      if (!dir) { console.log(`| ${place.name} | ${time} | ${body.name} | – | outside data range | – |`); continue; }
      const ours = elevationDeg(dir, place.lat, place.lon);
      const theirs = await horizonsElevation(body.command, place, time);
      const diff = ours - theirs;
      worst = Math.max(worst, Math.abs(diff));
      console.log(`| ${place.name} | ${time} | ${body.name} | ${theirs.toFixed(3)}° | ${ours.toFixed(3)}° | ${diff >= 0 ? '+' : '−'}${Math.abs(diff).toFixed(3)}° |`);
    }
  }
}
console.log(`\nLargest difference: ${worst.toFixed(3)}°`);

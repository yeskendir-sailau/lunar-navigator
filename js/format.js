// Общие функции для красивого вывода времени и углов (используют обе панели).

const pad = n => String(n).padStart(2, '0');

// 2026-11-08 03:55 UTC
export function fmtUtc(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
         `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

// Длительность в миллисекундах -> «3 d 4 h», «5 h 20 min», «40 min»
export function fmtDuration(ms) {
  const mins = Math.round(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

// Длительность в часах -> «14 d 18 h», «6 h», «none» (если ноль)
export function fmtHours(hours) {
  if (!(hours > 0)) return 'none';
  const total = Math.round(hours);
  const d = Math.floor(total / 24);
  const h = total % 24;
  return d > 0 ? `${d} d ${h} h` : `${h} h`;
}

// Градусы со знаком: +12.3° / −5.0°
export const fmtDeg = v => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}°`;

// Подсказка «почему маленькие изменения так важны». Не зависит от three.js.
// sunMaxDeg — самая большая высота Солнца за ближайшие дни (градусы). Возвращает текст или null.
export function whyItMatters(lat, sunMaxDeg) {
  if (!Number.isFinite(sunMaxDeg)) return null;
  const top = `${sunMaxDeg.toFixed(1)}°`;
  if (Math.abs(lat) >= 75 || sunMaxDeg < 15) {
    return `Why small changes matter here: in the next 30 days the Sun climbs no higher than ${top}. ` +
      'A hill only a few degrees high, a landing a few kilometres away or a day later can switch sunlight ' +
      '(and the direct view of Earth) on or off. Near the poles every degree counts.';
  }
  return `At this latitude the Sun climbs up to ${top}, so day and night are long and regular (about 14 Earth days each). ` +
    'Near the poles the Sun stays low and small changes of place or date matter much more.';
}

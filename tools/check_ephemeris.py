"""Проверка: считает высоту и азимут Солнца и Земли над горизонтом
для точки на Луне по нашему файлу data/sun_earth.json.
Эти числа потом сравниваем с JPL Horizons.

Запуск (из папки проекта):
    python tools/check_ephemeris.py ШИРОТА ДОЛГОТА "ГГГГ-ММ-ДД ЧЧ:ММ"
Пример:
    python tools/check_ephemeris.py 0.67408 23.47297 "2026-11-20 12:00"
Время указывается по UTC и должно быть ровным часом (12:00, 13:00 ...).
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

R_MOON_KM = 1737.4
DATA = Path(__file__).resolve().parent.parent / "data" / "sun_earth.json"

if len(sys.argv) != 4:
    sys.exit(__doc__)

lat, lon = float(sys.argv[1]), float(sys.argv[2])
when = datetime.strptime(sys.argv[3], "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)

d = json.loads(DATA.read_text())
start = datetime.strptime(d["start_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
hours = (when - start).total_seconds() / 3600 / d["step_hours"]
i = int(round(hours))
if abs(hours - i) > 1e-6 or not (0 <= i < d["count"]):
    sys.exit("Время должно быть ровным часом внутри диапазона файла.")

la, lo = np.radians(lat), np.radians(lon)
up = np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])      # «вверх» в точке
north = np.array([-np.sin(la) * np.cos(lo), -np.sin(la) * np.sin(lo), np.cos(la)])
east = np.array([-np.sin(lo), np.cos(lo), 0.0])

print(f"Точка: {lat}°, {lon}°   Время: {when:%Y-%m-%d %H:%M} UTC")
for name, dirs, dists in (("Sun  ", d["sun"], d["sun_distance_km"]),
                          ("Earth", d["earth"], d["earth_distance_km"])):
    # от точки на поверхности до тела = (центр Луны -> тело) минус (центр Луны -> точка)
    v = np.array(dirs[i]) * dists[i] - R_MOON_KM * up
    v /= np.linalg.norm(v)
    elevation = np.degrees(np.arcsin(v @ up))
    azimuth = np.degrees(np.arctan2(v @ east, v @ north)) % 360
    print(f"{name}: высота = {elevation:7.3f}°   азимут = {azimuth:7.3f}°")
"""Считает, где Солнце и Земля находятся относительно Луны каждый час,
и сохраняет результат в data/sun_earth.json.

Запуск (из папки проекта, с включённым .venv):
    python tools/make_ephemeris.py
"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from skyfield.api import Loader, PlanetaryConstants

# ---------- Настройки (их можно менять) ----------
START = datetime(2026, 11, 1, tzinfo=timezone.utc)   # с какого момента считаем
END = datetime(2028, 1, 1, tzinfo=timezone.utc)      # до какого (не включая)
STEP_HOURS = 1                                       # шаг по времени
# -------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "tools" / "raw"      # сюда Skyfield складывает скачанные файлы NASA
OUT = ROOT / "data" / "sun_earth.json"
RAW.mkdir(parents=True, exist_ok=True)
OUT.parent.mkdir(parents=True, exist_ok=True)

load = Loader(str(RAW))           # «загрузчик»: скачивает файлы, если их ещё нет

# 1. Файлы NASA JPL: положения тел и ориентация Луны (с учётом либрации)
ts = load.timescale()
eph = load("de421.bsp")
pc = PlanetaryConstants()
pc.read_text(load("moon_080317.tf"))
pc.read_text(load("pck00008.tpc"))
pc.read_binary(load("moon_pa_de421_1900-2050.bpc"))
frame = pc.build_frame_named("MOON_ME_DE421")   # система координат, «приклеенная» к Луне

moon, sun, earth = eph["moon"], eph["sun"], eph["earth"]

# 2. Список моментов времени
n = int((END - START).total_seconds() // 3600 // STEP_HOURS)
times = [START + timedelta(hours=STEP_HOURS * i) for i in range(n)]
t = ts.from_datetimes(times)

# 3. Куда смотреть из центра Луны на Солнце и Землю (в «лунной» системе)
def direction_and_distance(body):
    vec = moon.at(t).observe(body)      # учитывает время, за которое летит свет
    xyz = vec.frame_xyz(frame).km       # три числа x, y, z в «лунной» системе
    dist = np.linalg.norm(xyz, axis=0)
    return (xyz / dist).T, dist         # единичные стрелки и расстояния

sun_dir, sun_dist = direction_and_distance(sun)
earth_dir, earth_dist = direction_and_distance(earth)

# 4. Сохраняем компактно
def rnd(a, k):
    return np.round(a, k).tolist()

data = {
    "description": "Directions (unit vectors) from the Moon's centre to the Sun and Earth "
                   "in the Moon-fixed Mean-Earth/polar-axis frame (MOON_ME_DE421), "
                   "light-time corrected. Libration is included. "
                   "Source: NASA JPL DE421 + lunar orientation kernel, computed with Skyfield.",
    "start_utc": START.strftime("%Y-%m-%dT%H:%M:%SZ"),
    "step_hours": STEP_HOURS,
    "count": n,
    "sun": rnd(sun_dir, 5),                 # [[x,y,z], ...]
    "earth": rnd(earth_dir, 5),             # [[x,y,z], ...]
    "sun_distance_km": rnd(sun_dist, 0),
    "earth_distance_km": rnd(earth_dist, 0),
}
OUT.write_text(json.dumps(data, separators=(",", ":")))

print(f"Готово: {n} моментов времени")
print(f"Первый момент: {times[0].isoformat()}")
print(f"Файл: {OUT}  ({OUT.stat().st_size / 1e6:.2f} МБ)")
print("Солнце в первый момент (x,y,z):", sun_dir[0].round(4))
print("Земля  в первый момент (x,y,z):", earth_dir[0].round(4))
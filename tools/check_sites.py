"""Проверяет data/sites.json: все ли поля на месте, нет ли опечаток в координатах и повторов.

Запуск (из папки проекта):
    python3 tools/check_sites.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILE = ROOT / "data" / "sites.json"

REQUIRED = ["id", "name", "country", "type", "lat", "lon", "date", "status", "source"]
TYPES = {"heritage", "impact", "landed", "planned"}

try:
    sites = json.loads(FILE.read_text(encoding="utf-8"))
except json.JSONDecodeError as e:
    sys.exit(f"ОШИБКА: файл не читается как JSON (строка {e.lineno}, символ {e.colno}): {e.msg}\n"
             "Обычно это лишняя или пропущенная запятая, скобка или кавычка рядом с этим местом.")

errors, warnings, seen = [], [], set()

for n, s in enumerate(sites, start=1):
    label = f"#{n} {s.get('id') or s.get('name') or '???'}"
    for field in REQUIRED:
        if s.get(field) in (None, ""):
            errors.append(f"{label}: нет поля «{field}»")
    if s.get("type") not in TYPES and s.get("type"):
        errors.append(f"{label}: type должен быть один из {sorted(TYPES)}, а не «{s.get('type')}»")
    lat, lon = s.get("lat"), s.get("lon")
    if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
        if not -90 <= lat <= 90:
            errors.append(f"{label}: широта {lat} вне диапазона от -90 до 90")
        if not -180 <= lon <= 180:
            errors.append(f"{label}: долгота {lon} вне диапазона от -180 до 180 "
                          "(если в источнике 0–360, вычтите 360 из значений больше 180)")
    elif lat is not None or lon is not None:
        errors.append(f"{label}: lat и lon должны быть числами без кавычек")
    if s.get("source") and not str(s["source"]).startswith("http"):
        errors.append(f"{label}: source должен быть ссылкой, начинающейся с http")
    if s.get("id") in seen:
        errors.append(f"{label}: повторяющийся id")
    seen.add(s.get("id"))
    if not s.get("description"):
        warnings.append(f"{label}: нет description (карточка будет без текста)")
    if s.get("photo"):
        if not (ROOT / s["photo"]).exists():
            errors.append(f"{label}: файла фото «{s['photo']}» нет в папке проекта")
        if not s.get("photo_credit"):
            errors.append(f"{label}: у фото нет photo_credit (автор обязателен)")

for w in warnings:
    print("Внимание:", w)
for e in errors:
    print("ОШИБКА:", e)
print(f"\nМест в файле: {len(sites)}. Ошибок: {len(errors)}. Замечаний: {len(warnings)}.")
sys.exit(1 if errors else 0)

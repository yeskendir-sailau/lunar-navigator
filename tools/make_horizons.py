#!/usr/bin/env python3
"""Считает «маску горизонта» для мест у Южного полюса и пишет data/horizons.json.

Маска = 360 чисел: для каждого азимута 0..359° (от севера по часовой) — самый большой угол,
под которым из точки видна местность (в градусах над ровным горизонтом).
Солнце или Земля видны, только если они выше маски в своём азимуте.

Запуск:
  python tools/make_horizons.py                       # места из data/sites.json южнее -80° + data/pole_points.json
  python tools/make_horizons.py --point "Мой холм" -89.5 10
  python tools/make_horizons.py --max-km 60 --mast 2

Честные ограничения: карта LOLA покрывает только южнее 80° ю. ш. (80 м на пиксель);
где луч доходит до края карты, маска там занижена — это видно в поле reach_km.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window
from pyproj import CRS, Transformer

R = 1_737_400.0   # радиус Луны для карт LOLA, м
FALLBACK_PROJ = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"


def make_transformer(ds):
    """Из (долгота, широта) в координаты карты (x, y). Берём проекцию из файла, иначе запасную."""
    crs = None
    if ds.crs is not None:
        try:
            crs = CRS.from_user_input(ds.crs.to_wkt())
        except Exception:
            crs = None
    if crs is None or not crs.is_projected:
        print("  (в файле нет понятной проекции — использую запасную полярную стереографическую)")
        crs = CRS.from_proj4(FALLBACK_PROJ)
    return Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)


def bilinear(arr, rows, cols):
    """Высота в дробных пикселях. Если рядом нет данных — NaN."""
    h, w = arr.shape
    r = rows - 0.5   # центр пикселя (i, j) лежит в (i+0.5, j+0.5)
    c = cols - 0.5
    r0 = np.floor(r).astype(int)
    c0 = np.floor(c).astype(int)
    ok = (r0 >= 0) & (c0 >= 0) & (r0 < h - 1) & (c0 < w - 1)
    r0c = np.clip(r0, 0, h - 2)
    c0c = np.clip(c0, 0, w - 2)
    fr = r - r0
    fc = c - c0
    v = (arr[r0c, c0c] * (1 - fr) * (1 - fc) + arr[r0c, c0c + 1] * (1 - fr) * fc +
         arr[r0c + 1, c0c] * fr * (1 - fc) + arr[r0c + 1, c0c + 1] * fr * fc)
    v = np.where(ok, v, np.nan)
    return v


def horizon_for_point(ds, tr, lat, lon, max_km, mast_m, step_m=None):
    """Возвращает dict с маской или None, если точка вне карты."""
    px = abs(ds.transform.a)
    step = step_m or px
    x0, y0 = tr.transform(lon, lat)
    inv = ~ds.transform
    c0, r0 = inv * (x0, y0)
    if not (0 <= c0 < ds.width and 0 <= r0 < ds.height):
        return None

    # Читаем только нужный квадрат вокруг точки, а не весь файл
    half = int(math.ceil((max_km * 1000 + 3 * step) / px))
    col_a, row_a = max(0, int(c0) - half), max(0, int(r0) - half)
    col_b, row_b = min(ds.width, int(c0) + half + 1), min(ds.height, int(r0) + half + 1)
    win = Window(col_a, row_a, col_b - col_a, row_b - row_a)
    arr = ds.read(1, window=win).astype("float64")
    if ds.nodata is not None:
        arr[arr == ds.nodata] = np.nan
    wt = ds.window_transform(win)
    winv = ~wt

    def sample(lats, lons):
        xs, ys = tr.transform(np.degrees(lons), np.degrees(lats))
        cc, rr = winv * (xs, ys)
        return bilinear(arr, np.asarray(rr), np.asarray(cc))

    phi, lam = math.radians(lat), math.radians(lon)
    h0 = float(sample(np.array([phi]), np.array([lam]))[0])
    if not math.isfinite(h0):
        return None

    dist = np.arange(step, max_km * 1000 + step, step)            # метры вдоль луча
    delta = dist / R                                               # угловое расстояние
    az = np.radians(np.arange(360))[:, None]                       # (360, 1)
    sd, cd = np.sin(delta)[None, :], np.cos(delta)[None, :]
    lat2 = np.arcsin(math.sin(phi) * cd + math.cos(phi) * sd * np.cos(az))
    lon2 = lam + np.arctan2(np.sin(az) * sd * math.cos(phi), cd - math.sin(phi) * np.sin(lat2))
    h1 = sample(lat2.ravel(), lon2.ravel()).reshape(lat2.shape)    # (360, N)

    # Точный угол над горизонтом до вершины на сфере:
    # tan(eps) = (r1*cos(theta) - r0) / (r1*sin(theta)), r0 — глаз (поверхность + мачта), r1 — вершина.
    r_eye = R + h0 + mast_m
    r1 = R + h1
    eps = np.degrees(np.arctan2(r1 * cd - r_eye, r1 * sd))
    eps = np.where(np.isfinite(h1), eps, -np.inf)

    mask = eps.max(axis=1)
    # reach: до какого расстояния данные идут без пропусков (край карты = обрыв)
    valid = np.isfinite(h1)
    first_bad = np.where(valid.all(axis=1), valid.shape[1], np.argmin(valid, axis=1))
    reach_km = first_bad * step / 1000.0
    mask = np.where(np.isfinite(mask), mask, np.nan)
    return {"height_m": round(h0, 1), "mask": mask, "reach_km": reach_km}


def load_places(args):
    places = []
    sites_path = Path("data/sites.json")
    if sites_path.exists():
        for s in json.loads(sites_path.read_text(encoding="utf-8")):
            if s["lat"] <= args.lat_limit:
                places.append({"id": s["id"], "name": s["name"], "lat": s["lat"], "lon": s["lon"]})
    extra = Path("data/pole_points.json")
    if extra.exists():
        for s in json.loads(extra.read_text(encoding="utf-8")):
            if s["lat"] <= args.lat_limit and all(p["id"] != s["id"] for p in places):
                places.append({"id": s["id"], "name": s["name"], "lat": s["lat"], "lon": s["lon"]})
    for name, lat, lon in args.point or []:
        places.append({"id": "pt-" + name.lower().replace(" ", "-"), "name": name,
                       "lat": float(lat), "lon": float(lon)})
    return places


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dem", default="tools/raw/LDEM_80S_80MPP_ADJ.TIF")
    ap.add_argument("--out", default="data/horizons.json")
    ap.add_argument("--max-km", type=float, default=100.0, help="как далеко смотрим (км)")
    ap.add_argument("--mast", type=float, default=2.0, help="высота глаза над поверхностью (м)")
    ap.add_argument("--lat-limit", type=float, default=-80.0, help="берём места не севернее этой широты")
    ap.add_argument("--point", nargs=3, action="append", metavar=("NAME", "LAT", "LON"))
    args = ap.parse_args()

    if not Path(args.dem).exists():
        sys.exit(f"Нет файла {args.dem}. Скачай его (шаг 1 плана) и положи в tools/raw/")
    places = load_places(args)
    if not places:
        sys.exit("Нет мест южнее -80°. Добавь их в data/pole_points.json или через --point NAME LAT LON")

    out = []
    with rasterio.open(args.dem) as ds:
        tr = make_transformer(ds)
        for p in places:
            print(f"{p['name']} ({p['lat']}, {p['lon']}) ...", end=" ", flush=True)
            res = horizon_for_point(ds, tr, p["lat"], p["lon"], args.max_km, args.mast)
            if res is None:
                print("вне карты (севернее 80°ю. ш. или нет данных) — пропускаю")
                continue
            m = res["mask"]
            k = int(np.nanargmax(m))
            short = int((res["reach_km"] < args.max_km * 0.5).sum())
            print(f"высота {res['height_m']} м, самый высокий горизонт {m[k]:.2f}° на азимуте {k}°, "
                  f"медиана {np.nanmedian(m):.2f}°, направлений с обрезанным обзором: {short}/360")
            out.append({**p, "height_m": res["height_m"],
                        "mask": [None if not math.isfinite(v) else round(float(v), 3) for v in m],
                        "reach_km": [round(float(v), 1) for v in res["reach_km"]]})

    meta = {
        "source": "LOLA LDEM_80S_80MPP_ADJ (Barker et al. 2023, Planet. Sci. J. 4, 183, doi:10.3847/PSJ/acf3e1)",
        "moon_radius_m": R, "max_km": args.max_km, "eye_height_m": args.mast,
        "azimuth": "0..359 градусов от севера по часовой стрелке, шаг 1",
        "note": "reach_km — до какого расстояния есть данные; если мало, горизонт в этом направлении занижен",
    }
    Path(args.out).write_text(json.dumps({"meta": meta, "places": out}, ensure_ascii=False), encoding="utf-8")
    print(f"Записано {len(out)} мест в {args.out}")


if __name__ == "__main__":
    main()

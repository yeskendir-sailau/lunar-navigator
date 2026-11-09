#!/usr/bin/env python3
"""Смотрит на файл рельефа LOLA и печатает главное: размер, проекцию, размер пикселя, диапазон высот."""
import sys
from pathlib import Path
import numpy as np
import rasterio

path = Path(sys.argv[1] if len(sys.argv) > 1 else "tools/raw/LDEM_80S_80MPP_ADJ.TIF")
if not path.exists():
    sys.exit(f"Нет файла {path}. Скачай его (см. план, шаг 1) и положи в tools/raw/")

with rasterio.open(path) as ds:
    print("Файл:        ", path)
    print("Размер:      ", ds.width, "x", ds.height, "пикселей")
    print("Пиксель:     ", abs(ds.transform.a), "x", abs(ds.transform.e), "(единицы карты, обычно метры)")
    print("Границы:     ", ds.bounds)
    print("Проекция:    ", ds.crs.to_string()[:300] if ds.crs else "НЕТ (будет использована запасная)")
    print("nodata:      ", ds.nodata)
    print("Тип данных:  ", ds.dtypes[0])
    # Читаем уменьшенную копию (1/20), чтобы не грузить весь файл
    step = 20
    small = ds.read(1, out_shape=(ds.height // step, ds.width // step)).astype("float64")
    if ds.nodata is not None:
        small[small == ds.nodata] = np.nan
    print("Высоты, м:   ", f"min {np.nanmin(small):.0f}, max {np.nanmax(small):.0f}, среднее {np.nanmean(small):.0f}")
    # Центр карты должен быть Южным полюсом
    cx, cy = ds.xy(ds.height // 2, ds.width // 2)
    print("Центр карты (x, y):", round(cx, 1), round(cy, 1), "<- должно быть около 0, 0 (это полюс)")

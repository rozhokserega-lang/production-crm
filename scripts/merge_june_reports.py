#!/usr/bin/env python3
"""Объединяет отчёты по листам и чёрной обвязке в один Excel."""
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
MATERIAL_XLSX = ROOT / "расчет_материала_июнь_результат.xlsx"
STRAP_XLSX = ROOT / "расчет_обвязка_черная_июнь.xlsx"
OUT_XLSX = ROOT / "расчет_материала_июнь_полный.xlsx"
OUT_DESKTOP = Path(r"c:\Users\ПК\OneDrive\Desktop\расчет_материала_июнь_полный.xlsx")

SHEETS = [
    (MATERIAL_XLSX, "Сводка", "Сводка — листы"),
    (MATERIAL_XLSX, "По заказам", "Листы — по заказам"),
    (MATERIAL_XLSX, "Итого по материалам", "Листы — по материалам"),
    (STRAP_XLSX, "Сводка", "Сводка — обвязка"),
    (STRAP_XLSX, "По типам планок", "Обвязка — по типам"),
    (STRAP_XLSX, "По заказам", "Обвязка — по заказам"),
]


def main():
    for src, _, _ in SHEETS:
        if not src.exists():
            raise FileNotFoundError(f"Нет файла: {src}")

    for out_path in (OUT_XLSX, OUT_DESKTOP):
        try:
            with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
                for src, sheet_in, sheet_out in SHEETS:
                    df = pd.read_excel(src, sheet_name=sheet_in)
                    df.to_excel(writer, sheet_name=sheet_out, index=False)
            print(f"OK: {out_path}")
        except OSError as e:
            print(f"Skip {out_path}: {e}")


if __name__ == "__main__":
    main()

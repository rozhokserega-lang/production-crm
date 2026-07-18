#!/usr/bin/env python3
"""Список позиций плана, где было 0 листов, и что исправлено."""
from __future__ import annotations

import importlib.util
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("p", ROOT / "scripts/calc_june_material_plan.py")
p = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(p)

WAS_ZERO_CODES = {
    "GXktPinoXBBt", "GXktPinoXBGe", "GXktPinoXBVo", "GXktPinoXBOk", "GXktPinoXBOs",
    "GXktPinoXLMBOSt", "GXktPinoXBUt", "GXktPinoXBAAD",
    "GXktFlamingoLDRBT", "GXktFlamingoLDRGE", "GXktFlamingoLDRVO", "GXktFlamingoLDROK",
    "GXktFlamingoLDROS", "GXktFlamingoLDRUT", "GXktFlamingoLDRAAD", "GXktFlamingoLMOSt",
    "GXktFlamingoLDPWWW", "GXktFlamingoLDPOB", "GXktFlamingoLDPTSA",
    "GXssBracketsB", "GXssBaseW", "GXssBaseB",
    "GXssShShelf400WOS", "GXssShShelf600WOS", "GXssShShelf900WOS",
    "GXssShelf44-400BVO", "GXssShelf600WOS", "GXssShelf44-600BVO", "GXssShelf900WOS", "GXssShelf44-900BVO",
    "GXss2-400-600hWOS", "GXss44-2-400-600hBVO", "GXss2-400-600hBVO",
    "GXss1-600WOS", "GXss1-600BVO", "GXss44-1-600BVO",
    "GXss1-900hWOS", "GXss44-1-900hBVO", "GXss1-900hBVO",
    "GXss1-900WOS", "GXss44-1-900BVO", "GXss1-900BVO",
    "GXss2-900hWOS", "GXss44-2-900hBVO", "GXss2-900hBVO",
    "GXssHanger600W", "GXssHanger600B", "GXssHanger900W", "GXssHanger900B", "GXssBoxP34-1-600B",
    "GXtvsLoftGVo", "GXtvsLoftGOs", "GXtvsLoftGUt", "GXtvsLoftBt", "GXtvsLoftVo",
    "GXtvsLoftOk", "GXtvsLoftOs", "GXtvsLoftUt", "GXtvsLoftAAD",
    "GXtvsS1OdGe", "GXtvsS1IntEr", "GXtvsS1BSkyGe", "GXtvsS1HIntEr", "GXtvsS1HIvEr", "GXtvsS1IvEr",
    "GxtvsS2_150VoBr", "GxtvsS2_150IntGr", "GXtvsS2_150HVoBr", "GXtvsS2_150HIntGr", "GxtvsS2IntGr",
    "GXtvsS3HUtGeoW", "GxtvsS3UtGeoW",
}

METAL_CODES = {
    "GXssBracketsB", "GXssBaseW", "GXssBaseB",
    "GXssHanger600W", "GXssHanger600B", "GXssHanger900W", "GXssHanger900B", "GXssBoxP34-1-600B",
}


def extract_material_from_item_name(name: str) -> str:
    n = name.lower()
    for m in (
        "бетон", "герион", "дуб вотан", "дуб коми", "дуб сонома", "юта",
        "ясень анкор", "лмдф дуб сторсунд", "выбеленное дерево", "дуб бардолино", "трансильвания",
    ):
        if m in n:
            return m
    return ""


def calc_sheets(code, name, section, item, material, qty, templates):
    material = p.normalize_material(material or extract_material_from_item_name(name))
    kits_rule = p.resolve_output_per_sheet(section, name, material)
    if kits_rule > 0:
        return math.ceil(qty / kits_rule), material
    if code.upper().startswith("GXSS") or "система хранения" in p.norm(name) or "полка системы" in p.norm(name):
        sheets, _, _ = p.calc_shelf_sheets(code, qty, material, name)
        return sheets, material
    tpl = p.find_template(templates, item, section)
    if tpl:
        kits_db = float(tpl.get("kits_per_sheet") or 0)
        details = tpl.get("details") or []
        if kits_db > 0:
            s = math.ceil(qty / kits_db) if kits_db >= 1 else math.ceil(qty * kits_db)
            return s, material
        if details:
            s, _ = p.estimate_sheets_from_template(details, qty)
            return s, material
    return 0, material


def describe_fix(code: str, name: str, sheets: int) -> str:
    if code in METAL_CODES:
        return "Не менялось: металл/фурнитура, листов ЛДСП нет"
    n = p.norm(name)
    if "pino x" in n:
        return "Правило Pino X (как Donini 750: 6 или 4 компл./лист по формату материала)"
    if "flamingo" in n:
        kind = "круглый" if "кругл" in n else "прямоугольный" if "прямоуголь" in n else "круглый"
        return f"Шаблон Flamingo {kind} + раскрой по деталям"
    if code.upper().startswith("GXSS") or "система хранения" in n or "полка системы" in n:
        return "Каталог полок GX (раскрой по артикулу)"
    if "siena" in n:
        if "siena 2" in n and "150" in n:
            return "Шаблон Siena 2 150 (0,4 листа/комплект) в БД"
        return "Шаблон Siena + раскрой по деталям"
    if "лофт" in n:
        return "Шаблон ТВ тумба / 1500 + раскрой по деталям"
    return "planSheetEstimation.js + шаблоны в БД"


def main():
    df = p.load_plan(None)
    article_map = p.load_article_map()
    templates = p.load_templates()
    rows = []
    for num, r in enumerate(df.itertuples(index=False), start=1):
        code = str(r.code).strip()
        if code not in WAS_ZERO_CODES:
            continue
        name = str(r.name).strip()
        qty = float(r.qty)
        meta = article_map.get(code, {})
        material = p.normalize_material(meta.get("material") or p.extract_material_from_name(name))
        if "pino x" in p.norm(name) and material and material not in p.MATERIAL_SIZE and "pino x" in material:
            material = p.normalize_material(extract_material_from_item_name(name))
        elif "flamingo" in p.norm(name) and material and "flamingo" in material:
            material = p.normalize_material(extract_material_from_item_name(name))
        section = meta.get("section") or ""
        item = meta.get("item_name") or name
        sheets, _ = calc_sheets(code, name, section, item, material, qty, templates)
        fix = describe_fix(code, name, sheets)
        rows.append((num, code, name, int(qty) if qty == int(qty) else qty, sheets, fix))

    out = ROOT / "_plan_zero_sheets_fix_list.md"
    lines = [
        "# План июнь 2026 в2 — позиции с 0 листов и исправления",
        "",
        f"Всего позиций в плане: **{len(df)}**",
        f"Было без расчёта листов: **{len(rows)}**",
        f"Исправлено (теперь считаются): **{sum(1 for r in rows if r[4] > 0)}**",
        f"Остаётся 0 (металл): **{sum(1 for r in rows if r[4] <= 0)}**",
        "",
        "| № | Артикул | Наименование | Шт | Листов | Что исправлено |",
        "|---:|---|---|---:|---:|---|",
    ]
    for num, code, name, qty, sheets, fix in rows:
        lines.append(f"| {num} | `{code}` | {name.replace('|', '/')} | {qty} | {sheets or '—'} | {fix} |")
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(out)


if __name__ == "__main__":
    main()

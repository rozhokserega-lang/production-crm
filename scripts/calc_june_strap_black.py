#!/usr/bin/env python3
"""Расчёт чёрной обвязки по июньскому плану — логика CRM (workshopStrapNeeds)."""
from __future__ import annotations

import csv
import json
import math
import re
from collections import defaultdict
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PLAN_CSV = ROOT / "_june_plan_v2_utf8.csv"
TEMPLATES_JSON = Path(__file__).resolve().parent / "data" / "furniture_templates.json"
OUT_JSON = ROOT / "_june_strap_black.json"
OUT_XLSX = ROOT / "расчет_обвязка_черная_июнь.xlsx"

STRAP_SHEET_W = 2800
STRAP_SHEET_H = 2070

STRAP_TYPE_CODES = {
    "316_167", "1000_80", "558_80", "750_80", "618_80", "600_80", "586_80",
    "1158_50", "600_50", "502_80", "544_80", "288_80", "520_80", "396_305", "153x320",
}

STRAP_DISPLAY = {
    "316_167": "Бока (316_167)",
    "1000_80": "Обвязка (1000_80)",
    "558_80": "Обвязка (558_80)",
    "750_80": "Обвязка (750_80)",
    "618_80": "Обвязка (618_80)",
    "600_80": "Обвязка (600_80)",
    "586_80": "Обвязка (586_80)",
    "1158_50": "Обвязка (1158_50)",
    "600_50": "Обвязка (600_50)",
    "502_80": "Обвязка (502_80)",
    "544_80": "Обвязка (544_80)",
    "288_80": "Обвязка (288_80)",
    "520_80": "Обвязка (520_80)",
    "396_305": "Фасад (396_305)",
}

DETAIL_CATALOG = [
    ("Донини", "%обвязка%1000_80%"),
    ("Донини", "%обвязка%558_80%"),
    ("Донини R", "%обвязка%502_80%"),
    ("Донини R", "%обвязка%544_80%"),
    ("Донини R", "%обвязка%288_80%"),
    ("Донини R", "%обвязка%520_80%"),
    ("Донини Гранде", "%обвязка%750_80%"),
    ("Донини Гранде", "%обвязка%618_80%"),
    ("Донини Гранде", "%обвязка%600_80%"),
    ("Донини Гранде", "%обвязка%586_80%"),
    ("Авелла Лайт", "%обвязка%1158_50%"),
    ("Авелла Лайт", "%обвязка%600_50%"),
    ("Авелла", "%обвязка%1158_50%"),
    ("Авелла", "%обвязка%600_50%"),
    ("ТВ Лофт", "%обвязка%316_167%"),
    ("ТВ Лофт", "%бока%316_167%"),
    ("ТВ Лофт 1500", "%бока%316_167%"),
    ("тв тумба", "%бока%316_167%"),
    ("тв тумба 1500", "%бока%316_167%"),
]

LINE_RULES = {
    "donini_r": {"288_80": 4, "502_80": 2, "520_80": 2, "544_80": 2},
    "donini": {"1000_80": 2, "558_80": 4},
    "donini_grande": {"750_80": 2, "600_80": 4, "618_80": 2, "586_80": 2},
    "avella_lite": {"1158_50": 2, "600_50": 2},
}


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", str(s or "").lower().replace("ё", "е").strip())


def norm_strap_key(v: str) -> str:
    return norm(v).replace("avella", "авелла").replace("lite", "лайт")


def strip_code(code: str) -> str:
    return re.sub(r"\s+", "_", str(code or "").strip().replace("x", "_").replace("X", "_"))


def extract_strap_code(detail_name: str) -> str:
    m = re.search(r"\((\d{2,5}[_x]\d{2,5})\)", str(detail_name or ""), re.I)
    return strip_code(m.group(1)) if m else ""


def pattern_to_strap_name(pattern: str) -> str:
    m = re.search(r"(\d{3,4}_\d{2,3})", str(pattern or ""))
    if m:
        return f"Обвязка ({m.group(1)})"
    return ""


def strap_color(item: str) -> str:
    return "Белый" if "бел" in norm_strap_key(item) else "Черный"


def resolve_alias(item: str) -> str:
    t = norm(item)
    if "donini grande" in t or "донини гранде" in t or "donini grande" in t:
        return "донини гранде"
    if "donini r" in t or "донини r" in t:
        return "донини r"
    if "donini" in t or "донини" in t:
        return "донини"
    if ("avella lite" in t or "авелла лайт" in t or "авела лайт" in t) and "черная тумба" in t:
        return "авелла лайт"
    if "avella" in t or "авелла" in t or "авела" in t:
        return "авелла"
    if "siena" in t:
        return "siena"
    if "лофт" in t and ("150" in t or "1500" in t):
        return "тв тумба 1500"
    if "лофт" in t or "тв лофт" in t:
        return "тв тумба"
    if "solito" in t and "1150" in t:
        return "солито 1150"
    if "solito" in t and "1350" in t:
        return "солито 1350"
    if "solito2" in t or "solito 2" in t:
        return "solito2"
    if "premier" in t or "премьер" in t:
        return "примьера"
    if "klassiko" in t or "классико" in t:
        return "классико"
    return ""


def detect_line(item: str) -> str:
    a = resolve_alias(item)
    if a == "донини гранде":
        return "donini_grande"
    if a == "донини r":
        return "donini_r"
    if a == "донини":
        return "donini"
    if a == "авелла лайт":
        return "avella_lite"
    return ""


def order_keys(item: str) -> list[str]:
    keys = set()
    a = resolve_alias(item)
    if a:
        keys.add(a)
    keys.add(norm_strap_key(item.split(".")[0] if "." in item else item))
    return [k for k in keys if k]


def parse_strap_size(name: str) -> tuple[int, int] | None:
    m = re.search(r"\((\d+)\s*[_xх]\s*(\d+)\)", str(name or ""), re.I)
    if not m:
        return None
    length, width = int(m.group(1)), int(m.group(2))
    if length <= 0 or width <= 0:
        return None
    return length, width


def sheets_for_strap(name: str, qty: int) -> tuple[int, int]:
    size = parse_strap_size(name)
    if not size or qty <= 0:
        return 0, 0
    length, width = size
    strips = STRAP_SHEET_H // width
    per_strip = STRAP_SHEET_W // length
    per_sheet = strips * per_strip
    if per_sheet <= 0:
        return 0, 0
    return math.ceil(qty / per_sheet), per_sheet


def load_templates() -> dict[str, list]:
    data = json.loads(TEMPLATES_JSON.read_text(encoding="utf-8"))
    out = {}
    for t in data:
        name = str(t.get("product_name", "")).strip()
        details = []
        for d in t.get("details") or []:
            dn = str(d.get("detailName") or d.get("detail_name") or "")
            pu = float(d.get("perUnit") or d.get("per_unit") or 0)
            if dn and pu > 0:
                details.append({"detailName": dn, "perUnit": pu})
        if name and details:
            out[norm(name)] = details
    return out


def template_for_item(item: str, templates: dict[str, list]) -> list | None:
    key = norm(item)
    if key in templates:
        return templates[key]
    alias = resolve_alias(item)
    if alias and alias in templates:
        return templates[alias]
    if "siena 2" in key and "150" in key:
        return templates.get(norm("Тумба под ТВ Siena 2 150. Интра - Серый"))
    if "siena" in key:
        return templates.get(norm("Siena"))
    if "лофт" in key and "150" in key:
        return templates.get(norm("ТВ тумба 1500"))
    if "лофт" in key:
        return templates.get(norm("ТВ тумба"))
    for tk, details in templates.items():
        if tk and (tk in key or key in tk):
            return details
    return None


def is_strap_detail(detail_name: str) -> bool:
    n = norm(detail_name)
    return n.startswith("обвязка") or n.startswith("бока")


def needs_from_template(item: str, qty: float, templates: dict[str, list]) -> list[dict]:
    tpl = template_for_item(item, templates)
    if not tpl:
        return []
    needs = []
    for d in tpl:
        if not is_strap_detail(d["detailName"]):
            continue
        code = extract_strap_code(d["detailName"])
        if code not in STRAP_TYPE_CODES:
            continue
        total = d["perUnit"] * qty
        if total > 0:
            needs.append({"code": code, "needed": total, "name": STRAP_DISPLAY.get(code, d["detailName"])})
    return needs


def needs_from_catalog(item: str, qty: float) -> list[dict]:
    keys = set(order_keys(item))
    bucket = set()
    for prod, pattern in DETAIL_CATALOG:
        pk = norm_strap_key(prod)
        if not any(pk == ok or ok in pk or pk in ok for ok in keys):
            continue
        name = pattern_to_strap_name(pattern)
        if name:
            bucket.add(name)
    by_code: dict[str, dict] = {}
    for name in bucket:
        code = extract_strap_code(name)
        if code not in STRAP_TYPE_CODES:
            continue
        by_code[code] = {"code": code, "needed": qty, "name": STRAP_DISPLAY.get(code, name)}
    return list(by_code.values())


def apply_overrides(line: str, qty: float, needs: list[dict]) -> list[dict]:
    rules = LINE_RULES.get(line)
    if line == "donini_r":
        out = []
        for code, mul in rules.items():
            target = max(0, round(qty * mul))
            if target > 0:
                out.append({"code": code, "needed": target, "name": STRAP_DISPLAY.get(code, code)})
        return sorted(out, key=lambda x: x["name"])
    if not rules:
        return needs
    by_code = {n["code"]: dict(n) for n in needs}
    for code, mul in rules.items():
        target = max(0, round(qty * mul))
        if code in by_code:
            by_code[code]["needed"] = target
        elif target > 0:
            by_code[code] = {"code": code, "needed": target, "name": STRAP_DISPLAY.get(code, code)}
    return [x for x in by_code.values() if x["needed"] > 0]


def resolved_needs(item: str, qty: float, templates: dict[str, list]) -> list[dict]:
    from_tpl = needs_from_template(item, qty, templates)
    from_cat = [] if from_tpl else needs_from_catalog(item, qty)
    merged = from_tpl if from_tpl else from_cat
    # TV: каталог даёт 1 шт/заказ, в шаблоне 2 бока — приоритет шаблону
    if not from_tpl and resolve_alias(item) in ("тв тумба", "тв тумба 1500"):
        tv_tpl = templates.get(norm("ТВ тумба 1500" if "150" in norm(item) else "ТВ тумба"))
        if tv_tpl:
            merged = needs_from_template(item, qty, {norm("ТВ тумба"): tv_tpl})
    line = detect_line(item)
    return apply_overrides(line, qty, merged)


def load_plan(plan_csv: Path | None = None) -> list[dict]:
    path = plan_csv or PLAN_CSV
    rows = []
    with path.open(encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for r in reader:
            qty = float(r.get("qty") or 0)
            if qty > 0:
                rows.append({"code": r["code"].strip(), "name": r["name"].strip(), "qty": qty})
    return rows


def compute_strap_black(plan: list[dict]) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Возвращает (сводка, по типам планок, по заказам)."""
    templates = load_templates()
    by_code: dict[str, dict] = defaultdict(lambda: {"pieces": 0, "name": ""})
    order_rows = []

    for row in plan:
        item, qty = row["name"], row["qty"]
        if strap_color(item) != "Черный":
            continue
        if "WOS" in row["code"].upper() or "белая" in norm(item):
            continue
        needs = resolved_needs(item, qty, templates)
        if not needs:
            continue
        line_straps = []
        for n in needs:
            code = n["code"]
            by_code[code]["pieces"] += int(round(n["needed"]))
            by_code[code]["name"] = n["name"]
            s, ps = sheets_for_strap(n["name"], int(round(n["needed"])))
            line_straps.append({"Тип": n["name"], "Шт. планок": int(round(n["needed"])), "Листов": s, "На листе": ps})
        order_rows.append({
            "Код": row["code"],
            "Наименование": item,
            "Шт. изделий": int(qty) if qty == int(qty) else qty,
            "Планок всего": sum(x["Шт. планок"] for x in line_straps),
            "Листов": sum(x["Листов"] for x in line_straps),
            "_straps": line_straps,
        })

    summary_types = []
    total_pieces = 0
    total_sheets = 0
    for code, data in sorted(by_code.items(), key=lambda x: -x[1]["pieces"]):
        pieces = data["pieces"]
        name = data["name"] or STRAP_DISPLAY.get(code, code)
        sheets, per_sheet = sheets_for_strap(name, pieces)
        total_pieces += pieces
        total_sheets += sheets
        summary_types.append({
            "Тип планки": name,
            "Код": code,
            "Шт. планок": pieces,
            "На листе (шт)": per_sheet,
            "Листов": sheets,
        })

    orders_flat = []
    for o in order_rows:
        for s in o["_straps"]:
            orders_flat.append({
                "Код": o["Код"],
                "Наименование": o["Наименование"],
                "Шт. изделий": o["Шт. изделий"],
                "Тип планки": s["Тип"],
                "Шт. планок": s["Шт. планок"],
                "Листов (тип)": s["Листов"],
            })

    summary_df = pd.DataFrame([
        {"Показатель": "Позиций в плане", "Значение": len(plan)},
        {"Показатель": "Позиций с чёрной обвязкой", "Значение": len(order_rows)},
        {"Показатель": "Всего планок (шт)", "Значение": total_pieces},
        {"Показатель": "Всего листов обвязки", "Значение": total_sheets},
    ])
    types_df = pd.DataFrame(summary_types)
    orders_df = pd.DataFrame(orders_flat)
    return summary_df, types_df, orders_df


def main():
    plan = load_plan()
    summary_df, types_df, orders_df = compute_strap_black(plan)

    with pd.ExcelWriter(OUT_XLSX, engine="openpyxl") as w:
        summary_df.to_excel(w, sheet_name="Сводка", index=False)
        types_df.to_excel(w, sheet_name="По типам планок", index=False)
        orders_df.to_excel(w, sheet_name="По заказам", index=False)

    result = {
        "totalPieces": int(summary_df.loc[summary_df["Показатель"] == "Всего планок (шт)", "Значение"].iloc[0]),
        "totalSheets": int(summary_df.loc[summary_df["Показатель"] == "Всего листов обвязки", "Значение"].iloc[0]),
        "byType": types_df.to_dict(orient="records"),
    }
    OUT_JSON.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Планок: {result['totalPieces']}, листов: {result['totalSheets']}")
    print(f"Excel: {OUT_XLSX}")
    for row in result["byType"]:
        print(f"  {row['Тип планки']}: {row['Шт. планок']} шт -> {row['Листов']} лист.")


if __name__ == "__main__":
    main()

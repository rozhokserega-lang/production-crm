#!/usr/bin/env python3
"""Расчёт листового материала по плану — логика CRM + конструктор мебели + каталог полок."""
from __future__ import annotations

import importlib.util
import json
import math
import re
from collections import defaultdict
from pathlib import Path

import pandas as pd

_strap_mod_path = Path(__file__).resolve().parent / "calc_june_strap_black.py"
_strap_spec = importlib.util.spec_from_file_location("calc_june_strap_black", _strap_mod_path)
_strap_mod = importlib.util.module_from_spec(_strap_spec)
assert _strap_spec.loader is not None
_strap_spec.loader.exec_module(_strap_mod)
compute_strap_black = _strap_mod.compute_strap_black

ROOT = Path(__file__).resolve().parents[1]
TEMPLATES_JSON = Path(__file__).resolve().parent / "data" / "furniture_templates.json"
DEFAULT_PLAN_XLSX = Path(r"c:\Users\ПК\Downloads\Telegram Desktop\план июнь 2026 в2.xlsx")
PLAN_CSV = ROOT / "_june_plan_v2_utf8.csv"
ARTICLE_SQL = ROOT / "supabase/migrations/20260414054021_sync_web_get_section_articles_mapped_articles.sql"
OUT_XLSX = ROOT / "расчет_материала_июнь_2026_в2_результат.xlsx"
OUT_XLSX_DESKTOP = Path(r"c:\Users\ПК\OneDrive\Desktop\расчет_материала_июнь_2026_в2_результат.xlsx")

SHEET_W = 2800
SHEET_H = 2070
CUT_GAP = 3

# Каталог полок (fronted/src/components/ShelfCalculator.jsx)
SHELF_CATALOG: dict[str, list[tuple[str, int]]] = {
    "GXssShShelf400WOS": [("полка 387x330", 1)],
    "GXssShShelf600WOS": [("полка 587x330", 1)],
    "GXssShShelf900WOS": [("полка 887x330", 1)],
    "GXssShelf400WOS": [("полка 387x340", 1)],
    "GXssShelf44-400BVO": [("полка 387x340", 1)],
    "GXssShelf600WOS": [("полка 587x340", 1)],
    "GXssShelf44-600BVO": [("полка 587x340", 1)],
    "GXssShelf900WOS": [("полка 887x340", 1)],
    "GXssShelf44-900BVO": [("полка 887x340", 1)],
    "GXss2-400-600hWOS": [("полка 387x340", 5), ("полка 587x330", 1)],
    "GXss44-2-400-600hBVO": [("полка 387x340", 5), ("полка 587x330", 1)],
    "GXss2-400-600hBVO": [("полка 387x340", 5), ("полка 587x330", 1)],
    "GXss1-600WOS": [("полка 587x340", 5)],
    "GXss1-600BVO": [("полка 587x340", 5)],
    "GXss44-1-600BVO": [("полка 587x340", 5)],
    "GXss1-900hWOS": [("полка 887x340", 2), ("полка 887x330", 1)],
    "GXss44-1-900hBVO": [("полка 887x340", 2), ("полка 887x330", 1)],
    "GXss1-900hBVO": [("полка 887x340", 2), ("полка 887x330", 1)],
    "GXss1-900WOS": [("полка 887x340", 5)],
    "GXss44-1-900BVO": [("полка 887x340", 5)],
    "GXss1-900BVO": [("полка 887x340", 5)],
    "GXss2-900hWOS": [("полка 887x340", 4), ("полка 887x330", 2)],
    "GXss44-2-900hBVO": [("полка 887x340", 4), ("полка 887x330", 2)],
    "GXss2-900hBVO": [("полка 887x340", 4), ("полка 887x330", 2)],
}

MATERIAL_SIZE = {
    "белый": "2800x2070",
    "бетон": "2750x1830",
    "бетон чикаго": "2800x2070",
    "бетон чикаго 25": "2800x2070",
    "бетон чикаго светло-серый": "2800x2070",
    "выбеленное дерево": "2750x1830",
    "герион": "2750x1830",
    "дуб вотан": "2800x2070",
    "дуб вотан 25": "2800x2070",
    "дуб галифакс олово": "2800x2070",
    "дуб делано": "2750x1830",
    "дуб кальяри": "2750x1830",
    "дуб коми": "2750x1830",
    "дуб марсала": "2800x2070",
    "дуб хантон": "2800x2070",
    "дуб хантон 25": "2800x2070",
    "дуб чарльзтон": "2800x2070",
    "дуб чарльстон тёмно-коричневый": "2800x2070",
    "интра": "2750x1830",
    "камень пьетра гриджиа": "2800x2070",
    "камень пьетра гриджиа чёрный": "2800x2070",
    "кейптаун": "2750x1830",
    "маренго": "2750x1830",
    "мрамор кристал": "2800x2070",
    "мрамор кристалл": "2800x2070",
    "муза": "2750x1830",
    "сланец скиваро": "2800x2070",
    "сланец скиваро 25": "2800x2070",
    "слоновая кость": "2750x1830",
    "слэйт": "2750x1830",
    "солнечный": "2750x1830",
    "сонома / бардолино": "2800x2070",
    "сонома / бардолино темная": "2800x2070",
    "сосна касцина": "2800x2070",
    "темное небо": "2750x1830",
    "ночное небо": "2800x2070",
    "трансильвания": "2750x1830",
    "цемент": "2750x1830",
    "черный": "2800x2070",
    "чили": "2750x1830",
    "юта": "2750x1830",
    "ясень анкор": "2750x1830",
    "ясень анкор темный": "2750x1830",
    "ясень тронхейм": "2800x2070",
    "ясень тронхейм 25": "2800x2070",
    "дуб бардолино натуральный": "2800x2070",
    "бардолино": "2800x2070",
    "дуб канзас 25": "2800x2070",
    "дуб канзас коричневый": "2800x2070",
    "ателье светлое": "2750x1830",
    "эра": "2750x1830",
    "геометрия белая": "2800x2070",
    "дуб сонома": "2800x2070",
}

MATERIAL_ALIASES = {
    "дуб сонома": "сонома / бардолино",
    "дуб бардолино натуральный": "дуб бардолино натуральный",
    "дуб хантон темный": "дуб хантон",
    "дуб хантон тёмный": "дуб хантон",
    "ясень анкор темный": "ясень анкор",
    "камень пьетра гриджиа черный": "камень пьетра гриджиа чёрный",
    "бетон чикаго светло-серый": "бетон чикаго светло-серый",
    "дуб канзас коричневый": "дуб канзас 25",
    "слоновья кость": "слоновая кость",
    "ночное небо-герион": "ночное небо",
    "дуб делано темный-герион": "дуб делано",
    "интра - эра": "интра",
    "интра - серый": "интра",
    "дуб вотан - коричневый": "дуб вотан",
    "юта - геометрия белая": "юта",
    "ночное небо - геометрия белая": "темное небо",
}


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", str(s or "").lower().replace("ё", "е").strip())


def load_article_map() -> dict:
    text = ARTICLE_SQL.read_text(encoding="utf-8")
    article_map = {}
    pattern = re.compile(
        r"\('([^']+)',\s*'((?:[^'\\]|\\.)*)',\s*'[^']*',\s*'((?:[^'\\]|\\.)*)',\s*'((?:[^'\\]|\\.)*)'",
    )
    for m in pattern.finditer(text):
        article_map[m.group(1)] = {
            "item_name": m.group(2).replace("\\'", "'"),
            "section": m.group(3).replace("\\'", "'"),
            "material": m.group(4).replace("\\'", "'"),
        }
    return article_map


def load_templates() -> list[dict]:
    if TEMPLATES_JSON.exists():
        return json.loads(TEMPLATES_JSON.read_text(encoding="utf-8"))
    return []


def normalize_material(raw: str) -> str:
    key = norm(raw)
    key = MATERIAL_ALIASES.get(key, key)
    if key in MATERIAL_SIZE:
        return key
    for mk in MATERIAL_SIZE:
        if norm(mk) == key:
            return mk
    return key


def extract_material_from_name(name: str) -> str:
    parts = [p.strip() for p in str(name).split(".") if p.strip()]
    skip = {"черная тумба", "белая", "черный", "белый", "подвесная"}
    for part in reversed(parts):
        key = norm(part).rstrip(".")
        if key and key not in skip and not key.endswith("шт"):
            return key
    return ""


def resolve_output_per_sheet(section: str, item: str, material: str, format_type: str = "") -> float:
    v_section = norm(section)
    v_item = norm(item)
    v_material = norm(material)
    v_format = norm(format_type)
    v_material_dims = re.sub(r"[\s*хx×]", "", v_material)

    flags = {
        "cremona": "cremona" in v_section or "cremona" in v_item,
        "solito2": "solito2" in v_section or "solito2" in v_item or "solito 2" in v_item,
        "solito1150": "серия 1150" in v_item or ("solito" in v_item and "1150" in v_item and "1350" not in v_item),
        "solito1350": "серия 1350" in v_item or ("1350" in v_item and "solito" in v_item),
        "stabile": "stabile" in v_section or "stabile" in v_item,
        "donini_grande": "donini grande" in v_item,
        "klassiko": "классико" in v_item,
        "premier": "премьер" in v_item,
        "donini_r": "donini r" in v_item,
        "pino_x": "pino x" in v_item,
    }
    donini_target = (
        "avella" in v_section
        or "avella" in v_item
        or any(flags.values())
        or "donini 806" in v_item
        or "donini 750" in v_item
    )
    if not donini_target:
        return 0.0
    if flags["solito1350"]:
        return 4.0
    if flags["premier"]:
        return 5.0
    if flags["klassiko"]:
        return 6.0
    if flags["donini_grande"]:
        return 3.0
    if flags["donini_r"]:
        return 4.0
    if flags["solito2"]:
        return 6.0
    if flags["solito1150"]:
        return 6.0
    if v_format in ("small", "малый"):
        return 1.5 if flags["cremona"] else 4.0
    if v_format in ("large", "большой"):
        return 2.0 if flags["cremona"] else 6.0

    mapped = MATERIAL_SIZE.get(v_material, "")
    mapped_dims = re.sub(r"[\s*хx×]", "", mapped)
    if flags["stabile"]:
        if mapped_dims == "28002070":
            return 4.0
        if mapped_dims == "27501830":
            return 3.0
    if mapped_dims == "28002070":
        return 2.0 if flags["cremona"] else 6.0
    if mapped_dims == "27501830":
        return 1.5 if flags["cremona"] else 4.0
    if "28002070" in v_material_dims:
        return 4.0 if flags["stabile"] else (2.0 if flags["cremona"] else 6.0)
    if "27501830" in v_material_dims:
        return 3.0 if flags["stabile"] else (1.5 if flags["cremona"] else 4.0)
    return 0.0


def parse_panel_size(text: str) -> tuple[int, int] | None:
    m = re.search(r"(\d+(?:\.\d+)?)\s*[_xх×]\s*(\d+(?:\.\d+)?)", str(text), re.I)
    if not m:
        return None
    a, b = float(m.group(1)), float(m.group(2))
    if a <= 0 or b <= 0:
        return None
    return int(math.ceil(max(a, b))), int(math.ceil(min(a, b)))


def parse_shelf_size(text: str) -> tuple[int, int] | None:
    m = re.search(r"(\d+)\s*[xх]\s*(\d+)", str(text), re.I)
    if not m:
        return None
    a, b = int(m.group(1)), int(m.group(2))
    return max(a, b), min(a, b)


def can_fit(piece: tuple[int, int], sheet_w: int, sheet_h: int, gap: int) -> bool:
    gw, gh = piece[0] + gap, piece[1] + gap
    return (gw <= sheet_w and gh <= sheet_h) or (gh <= sheet_w and gw <= sheet_h)


def fit_to_rows(piece: tuple[int, int], rows: list, sheet_w: int, gap: int) -> bool:
    variants = [(piece[0] + gap, piece[1] + gap), (piece[1] + gap, piece[0] + gap)]
    for w, h in variants:
        for row in rows:
            if h <= row["height"] and row["used"] + w <= sheet_w:
                row["used"] += w
                return True
    return False


def estimate_sheets_from_pieces(pieces: list[tuple[int, int]], sheet_w: int, sheet_h: int, gap: int = CUT_GAP) -> int:
    if not pieces:
        return 0
    for p in pieces:
        if not can_fit(p, sheet_w, sheet_h, gap):
            return 0
    pieces = sorted(pieces, key=lambda p: p[0] * p[1], reverse=True)
    sheets: list[dict] = []
    for piece in pieces:
        placed = False
        for sheet in sheets:
            if fit_to_rows(piece, sheet["rows"], sheet_w, gap):
                placed = True
                break
            variants = [(piece[0] + gap, piece[1] + gap), (piece[1] + gap, piece[0] + gap)]
            for w, h in variants:
                if sheet["used_height"] + h <= sheet_h and w <= sheet_w:
                    sheet["rows"].append({"height": h, "used": w})
                    sheet["used_height"] += h
                    placed = True
                    break
            if placed:
                break
        if not placed:
            variants = [(piece[0] + gap, piece[1] + gap), (piece[1] + gap, piece[0] + gap)]
            first = next((v for v in variants if v[0] <= sheet_w and v[1] <= sheet_h), None)
            if not first:
                return 0
            sheets.append({"rows": [{"height": first[1], "used": first[0]}], "used_height": first[1]})
    return len(sheets)


def estimate_sheets_from_template(details: list, order_qty: float, sheet_w: int = SHEET_W, sheet_h: int = SHEET_H) -> tuple[int, float]:
    pieces: list[tuple[int, int]] = []
    for d in details or []:
        name = d.get("detailName") or d.get("detail_name") or ""
        per_unit = float(d.get("perUnit") or d.get("per_unit") or 0)
        if per_unit <= 0:
            continue
        size = parse_panel_size(name)
        if not size:
            continue
        total = int(math.ceil(per_unit * order_qty))
        for _ in range(total):
            pieces.append(size)
    sheets = estimate_sheets_from_pieces(pieces, sheet_w, sheet_h)
    kits = round(order_qty / sheets, 3) if sheets > 0 and order_qty > 0 else 0
    return sheets, kits


def resolve_furniture_template_key(name: str, section: str) -> str:
    n = norm(name)
    sec = norm(section)
    if "siena 2" in n and "150" in n:
        # Все варианты Siena 2 150 используют один состав деталей из конструктора
        return "Тумба под ТВ Siena 2 150. Интра - Серый"
    if "siena 3" in n:
        return "Siena"
    if "siena 1" in n or ("siena" in n and "siena 2" not in n):
        return "Siena"
    if "лофт" in n and ("150" in n or "1500" in sec):
        return "ТВ тумба 1500"
    if "лофт" in n or "тв лофт" in sec:
        return "ТВ тумба"
    if "flamingo" in n and "кругл" in n:
        return "Flamingo круглый"
    if "flamingo" in n and "прямоуголь" in n:
        return "Flamingo прямоугольный"
    if "flamingo" in n:
        return "Flamingo круглый"
    return ""


def find_template(templates: list[dict], name: str, section: str) -> dict | None:
    by_name = {t["product_name"]: t for t in templates}
    item = str(name or "").strip()
    key = resolve_furniture_template_key(item, section)
    if key and key in by_name:
        return by_name[key]
    if item in by_name:
        return by_name[item]
    item_n = norm(item)
    for t in templates:
        tn = norm(t["product_name"])
        if tn and (tn in item_n or item_n in tn):
            return t
    return None


def calc_shelf_sheets(code: str, qty: float, material: str, name: str = "") -> tuple[int, str, str]:
    pairs = SHELF_CATALOG.get(code.strip())
    if not pairs:
        return 0, "", "нет в каталоге полок"
    pieces: list[tuple[int, int]] = []
    for shelf_name, per_kit in pairs:
        size = parse_shelf_size(shelf_name)
        if not size:
            continue
        total = int(per_kit * qty)
        pieces.extend([size] * total)
    sheets = estimate_sheets_from_pieces(pieces, SHEET_W, SHEET_H)
    name_l = norm(name)
    if "BVO" in code.upper() or "вотан" in name_l:
        mat = "дуб вотан"
    else:
        mat = "сонома / бардолино"
    return sheets, mat, "раскрой полок (ShelfCalculator)"


def resolve_qty_column(df: pd.DataFrame, raw_header_row: list | None) -> str:
    cols = {norm(c): c for c in df.columns}
    if raw_header_row:
        for idx, label in enumerate(raw_header_row):
            key = norm(label)
            if "план производства" in key and idx < len(df.columns):
                return df.columns[idx]
    for key, col in cols.items():
        if "план производства" in key:
            return col
    for key, col in cols.items():
        if "план" in key and "производ" in key:
            return col
    for key, col in cols.items():
        if "кол" in key or key.endswith("шт") or " шт" in key:
            return col
    return df.columns[-1]


def load_plan(plan_path: Path | None = None) -> pd.DataFrame:
    plan_xlsx = plan_path or DEFAULT_PLAN_XLSX
    if plan_xlsx.exists():
        raw = pd.read_excel(plan_xlsx, sheet_name=0, header=None)
        hdr = 0
        header_labels: list | None = None
        for i in range(min(8, len(raw))):
            row = [str(x).lower() for x in raw.iloc[i].tolist()]
            if any("код" in x or "артикул" in x for x in row):
                hdr = i
                if i > 0:
                    header_labels = [str(x) if pd.notna(x) else "" for x in raw.iloc[i - 1].tolist()]
                break
        df = pd.read_excel(plan_xlsx, sheet_name=0, header=hdr)
        cols = {norm(c): c for c in df.columns}
        code_c = next((cols[k] for k in cols if "код" in k or "артикул" in k), df.columns[0])
        name_c = next((cols[k] for k in cols if "наимен" in k or "назван" in k), df.columns[1] if len(df.columns) > 1 else df.columns[0])
        qty_c = resolve_qty_column(df, header_labels)
        out = pd.DataFrame({
            "code": df[code_c].astype(str).str.strip(),
            "name": df[name_c].astype(str).str.strip(),
            "qty": pd.to_numeric(df[qty_c], errors="coerce").fillna(0),
        })
        out = out[out["code"].str.len() > 0]
        out = out[out["qty"] > 0]
        out.to_csv(PLAN_CSV, index=False, encoding="utf-8-sig")
        return out
    return pd.read_csv(PLAN_CSV)


def main():
    import sys

    plan_path = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    article_map = load_article_map()
    templates = load_templates()
    df = load_plan(plan_path)
    print(f"Plan: {plan_path or DEFAULT_PLAN_XLSX} ({len(df)} positions, {int(df['qty'].sum())} pcs)")

    rows = []
    by_material = defaultdict(float)
    not_calc = []

    for _, r in df.iterrows():
        code = str(r["code"]).strip()
        name = str(r["name"]).strip()
        qty = float(r["qty"])
        meta = article_map.get(code, {})
        material = normalize_material(meta.get("material") or extract_material_from_name(name))
        section = meta.get("section") or ""
        item = meta.get("item_name") or name

        sheets = 0
        kits = 0.0
        method = ""

        kits_rule = resolve_output_per_sheet(section, name, material)
        if kits_rule > 0:
            kits = kits_rule
            sheets = math.ceil(qty / kits)
            method = "правило CRM (web_resolve_output_per_sheet)"
        elif code.upper().startswith("GXSS") or "система хранения" in norm(name) or "полка системы" in norm(name):
            sheets, mat2, method = calc_shelf_sheets(code, qty, material, name)
            if mat2:
                material = normalize_material(mat2)
        else:
            tpl = find_template(templates, item, section)
            if tpl:
                kits_db = float(tpl.get("kits_per_sheet") or 0)
                details = tpl.get("details") or []
                if kits_db > 0:
                    kits = kits_db
                    # kits >= 1: «комплектов на лист»; 0 < kits < 1: «листов на комплект» (как Siena 2 150: 0,4 → 20 шт = 8 листов)
                    if kits_db >= 1:
                        sheets = math.ceil(qty / kits)
                        method = f"конструктор: {tpl['product_name']} ({kits:g} компл./лист)"
                    else:
                        sheets = math.ceil(qty * kits)
                        method = f"конструктор: {tpl['product_name']} ({kits:g} лист/компл.)"
                elif details:
                    sheets, kits_est = estimate_sheets_from_template(details, qty)
                    kits = kits_est
                    method = f"раскрой деталей: {tpl['product_name']}"
                else:
                    method = f"шаблон без данных: {tpl['product_name']}"
            else:
                method = "не найден шаблон"

        if sheets > 0:
            by_material[material or "(без материала)"] += sheets
        else:
            not_calc.append(code)

        rows.append({
            "Код": code,
            "Наименование": name,
            "Шт": int(qty) if qty == int(qty) else qty,
            "Материал": material,
            "Секция": section,
            "Компл./лист": round(kits, 3) if kits else "",
            "Листов": sheets if sheets else "",
            "Метод расчёта": method,
        })

    total_sheets = sum(by_material.values())
    orders_df = pd.DataFrame(rows)
    mat_rows = [{"Материал": m, "Листов": int(s) if s == int(s) else s} for m, s in sorted(by_material.items(), key=lambda x: -x[1])]
    mat_rows.append({"Материал": "ИТОГО", "Листов": int(total_sheets) if total_sheets == int(total_sheets) else total_sheets})
    materials_df = pd.DataFrame(mat_rows)

    summary_df = pd.DataFrame([
        {"Показатель": "Позиций в плане", "Значение": len(rows)},
        {"Показатель": "Всего изделий (шт.)", "Значение": int(df["qty"].sum())},
        {"Показатель": "Рассчитано позиций", "Значение": len(rows) - len(not_calc)},
        {"Показатель": "Не рассчитано", "Значение": len(not_calc)},
        {"Показатель": "Всего листов", "Значение": int(total_sheets)},
    ])

    plan_rows = [
        {"code": str(r["code"]), "name": str(r["name"]), "qty": float(r["qty"])}
        for _, r in df.iterrows()
    ]
    strap_summary_df, strap_types_df, strap_orders_df = compute_strap_black(plan_rows)
    strap_pieces = int(
        strap_summary_df.loc[strap_summary_df["Показатель"] == "Всего планок (шт)", "Значение"].iloc[0]
    )
    strap_sheets = int(
        strap_summary_df.loc[strap_summary_df["Показатель"] == "Всего листов обвязки", "Значение"].iloc[0]
    )
    print(f"Strap (black): {strap_pieces} pieces, {strap_sheets} sheets")

    for path in (OUT_XLSX, OUT_XLSX_DESKTOP):
        try:
            with pd.ExcelWriter(path, engine="openpyxl") as writer:
                summary_df.to_excel(writer, sheet_name="Сводка", index=False)
                orders_df.to_excel(writer, sheet_name="По заказам", index=False)
                materials_df.to_excel(writer, sheet_name="Итого по материалам", index=False)
                strap_summary_df.to_excel(writer, sheet_name="Обвязка", index=False, startrow=0)
                row_types = len(strap_summary_df) + 2
                strap_types_df.to_excel(writer, sheet_name="Обвязка", index=False, startrow=row_types)
                row_orders = row_types + len(strap_types_df) + 2
                strap_orders_df.to_excel(writer, sheet_name="Обвязка", index=False, startrow=row_orders)
            print(f"Excel: {path}")
        except OSError as e:
            print(f"Skip {path}: {e}")

    print(f"Total sheets (material): {total_sheets:.0f}, not calculated: {len(not_calc)}")


if __name__ == "__main__":
    main()

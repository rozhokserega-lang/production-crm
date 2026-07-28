#!/usr/bin/env python3
"""Generate docs/june-plans-july-2026-carryover.md from exported orders JSON."""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SRC = ROOT / "docs" / "_june_july_orders_export.json"
DEST = ROOT / "docs" / "june-plans-july-2026-carryover.md"

STAGE_LABELS = {
    "pilka": "Пила",
    "kromka": "Кромка",
    "pras": "Присадка",
    "warehouse_kit": "На комплектации",
    "ready_to_ship": "Готов к отгрузке",
    "shipped": "Отгружен",
}


def fmt_qty(n: float) -> str:
    return str(int(n)) if n == int(n) else str(n)


def stage_label(stage: str) -> str:
    return STAGE_LABELS.get(stage, stage or "—")


def simplify_item(item: str) -> str:
    if "GXss" in item or "полка" in item.lower():
        art = re.search(r"\{\{ART:([^}]+)\}\}", item)
        if art:
            return f"Система хранения ({art.group(1)})"
        pm = re.search(r"полка\s+[\dx]+", item, re.I)
        if pm:
            return f"Полка {pm.group(0)}"
    return item.split("{{")[0].strip()


def storage_variant(item: str) -> str | None:
    i = item.upper()
    if "GXSS" not in i and "ПОЛКА" not in item.lower():
        return None
    if "WOS" in i or "БАРДОЛИНО" in i.upper():
        return "Бардолино (WOS)"
    if "BVO" in i or "ВОТАН" in i.upper():
        return "Вотан (BVO)"
    return "Система хранения (прочее)"


def line_of(item: str) -> str:
    i = item.lower()
    if "gxss" in i or "полка" in i or "система хранения" in i:
        return "Система хранения"
    if "siena" in i or "сиена" in i:
        return "Siena"
    if "donini" in i or "донини" in i:
        return "Donini"
    if "avella" in i or "авелла" in i:
        return "Avella lite"
    if "лофт" in i or "loft" in i:
        return "Лофт"
    if "stabile" in i or "стабиле" in i:
        return "Stabile"
    if "cremona" in i or "кремона" in i:
        return "Cremona"
    if "premier" in i or "премьер" in i:
        return "Premier"
    if "solito" in i or "солито" in i:
        return "Solito"
    if "классико" in i:
        return "Классико"
    if re.match(r"\d+_\d+", item.strip()):
        return "Обвязка"
    return "Прочее"


def load_rows(src: Path) -> list:
    text = src.read_text(encoding="utf-8")
    if text.lstrip().startswith("["):
        rows = json.loads(text)
    elif text.lstrip().startswith("{"):
        outer = json.loads(text)
        inner = outer.get("result", "")
        if isinstance(inner, str):
            text = inner
            m = re.search(r"<untrusted-data-[^>]+>\s*(\[.*?\])\s*</untrusted-data", text, re.S)
            if m:
                rows = json.loads(m.group(1))
            else:
                m = re.search(r"(\[.*\])", text, re.S)
                rows = json.loads(m.group(1)) if m else []
        else:
            rows = inner
    else:
        m = re.search(r"<untrusted-data-[^>]+>\s*(\[.*?\])\s*</untrusted-data", text, re.S)
        if not m:
            raise SystemExit(f"Cannot parse JSON from {src}")
        rows = json.loads(m.group(1))
    for r in rows:
        r["qty"] = float(r.get("qty") or 0)
    return rows


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
    rows = load_rows(src)
    july_rows = [r for r in rows if r["closed_in"] == "july"]
    june_closed = [r for r in rows if r["closed_in"] == "june"]

    pilka_by_day: dict = defaultdict(lambda: {"orders": 0, "units": 0, "plans": Counter()})
    kromka_by_day: dict = defaultdict(lambda: {"orders": 0, "units": 0})
    pras_by_day: dict = defaultdict(lambda: {"orders": 0, "units": 0, "plans": Counter()})
    for r in july_rows:
        if str(r.get("pilka_msk", "")).startswith("2026-07"):
            d = r["pilka_msk"][:10]
            pilka_by_day[d]["orders"] += 1
            pilka_by_day[d]["units"] += r["qty"]
            pilka_by_day[d]["plans"][r["plan_week"]] += 1
        if str(r.get("kromka_msk", "")).startswith("2026-07"):
            d = r["kromka_msk"][:10]
            kromka_by_day[d]["orders"] += 1
            kromka_by_day[d]["units"] += r["qty"]
        if str(r.get("pras_msk", "")).startswith("2026-07"):
            d = r["pras_msk"][:10]
            pras_by_day[d]["orders"] += 1
            pras_by_day[d]["units"] += r["qty"]
            pras_by_day[d]["plans"][r["plan_week"]] += 1

    plan_stats = defaultdict(lambda: {"total": 0, "units": 0, "june": 0, "june_u": 0, "july": 0, "july_u": 0})
    for r in rows:
        p = r["plan_week"]
        plan_stats[p]["total"] += 1
        plan_stats[p]["units"] += r["qty"]
        if r["closed_in"] == "june":
            plan_stats[p]["june"] += 1
            plan_stats[p]["june_u"] += r["qty"]
        elif r["closed_in"] == "july":
            plan_stats[p]["july"] += 1
            plan_stats[p]["july_u"] += r["qty"]

    total_july_orders = len(july_rows)
    total_july_units = sum(r["qty"] for r in july_rows)
    week1_pilka = sum(
        1 for r in july_rows if str(r.get("pilka_msk", "")).startswith("2026-07-0")
    )
    week1_pras = sum(
        1 for r in july_rows if str(r.get("pras_msk", "")).startswith("2026-07-0")
    )

    out: list[str] = []
    out += [
        "# Июньские планы, доделанные в июле 2026",
        "",
        "> **Источник:** production CRM, таблица `orders`.",
        "> **Время этапов:** Europe/Moscow (МСК).",
        "> **Охват:** планы недель **76, 77, 78, 79** (месяц «Июнь»). Планы 80+ не включены.",
        "> **Срез:** на момент выгрузки из базы.",
        "",
        "## Содержание",
        "",
        "1. [Методология](#1-методология)",
        "2. [Краткие выводы](#2-краткие-выводы)",
        "3. [Сводка по планам](#3-сводка-по-планам)",
        "4. [Типы доделывания в июле](#4-типы-доделывания-в-июле)",
        "5. [Первая неделя июля (1–7)](#5-первая-неделя-июля-17)",
        "6. [Динамика по дням (весь июль)](#6-динамика-по-дням-весь-июль)",
        "7. [По линейкам и системе хранения](#7-по-линейкам-и-системе-хранения)",
        "8. [Статусы после цеха (июльские закрытия)](#8-статусы-после-цеха-июльские-закрытия)",
        "9. [Детализация по планам 76, 77, 79](#9-детализация-по-планам-76-77-79)",
        "10. [План 78 — закрыт полностью в июне](#10-план-78--закрыт-полностью-в-июне)",
        "11. [Контекст: закрыто в июне](#11-контекст-закрыто-в-июне)",
        "12. [Полный реестр всех заказов (149)](#12-полный-реестр-всех-заказов-149)",
        "",
        "---",
        "",
        "## 1. Методология",
        "",
        "### Что считаем «закрытым в цеху»",
        "",
        "Заказ считается **закрытым в цеху**, когда заполнено поле `pras_done_at` (этап присадки завершён).",
        "",
        "### Критерии периодов",
        "",
        "| Метка | Условие |",
        "|-------|---------|",
        "| **Закрыто в июне** | `pras_done_at` < 2026-07-01 00:00 МСК |",
        "| **Доделано в июле** | `pras_done_at` ≥ 2026-07-01 00:00 МСК |",
        "",
        "### Типы доделывания",
        "",
        "| Тип | Описание |",
        "|-----|----------|",
        "| **Полный цикл в июле** | Пила (`pilka_done_at`) и присадка обе в июле |",
        "| **Хвост присадки** | Пила завершена в июне, присадка — только в июле |",
        "",
        "### Поля в таблицах",
        "",
        "- **Пила / Кромка / Присадка** — дата и время завершения этапа (МСК).",
        "- **Статус** — текущий `pipeline_stage` в CRM.",
        "",
        "---",
        "",
        "## 2. Краткие выводы",
        "",
        f"- Всего **{total_july_orders}** заказов ({fmt_qty(total_july_units)} шт.) из июньских планов закрыты в цеху **только в июле**.",
        "- **План 78** — единственный полностью закрытый до 1 июля: 30/30 заказов, в июле работ не было.",
        f"- **План 79** — главный хвост: **27/46** заказов и **{fmt_qty(plan_stats['79']['july_u'])} шт.** ({plan_stats['79']['july_u'] / plan_stats['79']['units'] * 100:.0f}% объёма плана).",
        f"- **План 76** — 9 заказов ({fmt_qty(plan_stats['76']['july_u'])} шт.), в основном Donini (Интра, Кейптаун, Мрамор).",
        f"- **План 77** — 1 заказ (Stabile Интра, 30 шт.).",
        f"- **1–7 июля:** старт пилы у **{week1_pilka}** заказов, закрытие присадки у **{week1_pras}**.",
        "- **4 июля** — 6 заказов системы хранения Бардолино (520 шт.) — единовременный запуск WOS-полок.",
        "- **6 июля** — 8 заказов системы хранения Вотан (1 057 шт. по пиле) — основной BVO-блок.",
        f"- Из {total_july_orders} июльских закрытий: **{sum(1 for r in july_rows if r['pipeline_stage'] == 'warehouse_kit')}** на комплектации, "
        f"**{sum(1 for r in july_rows if r['pipeline_stage'] == 'ready_to_ship')}** готовы к отгрузке, "
        f"**{sum(1 for r in july_rows if r['pipeline_stage'] == 'shipped')}** отгружены.",
        "",
        "---",
        "",
        "## 3. Сводка по планам",
        "",
        "| План | Заказов | Шт. | % объёма в июле | Закрыто до 01.07 | Доделано в июле |",
        "|------|--------:|----:|----------------:|-----------------:|----------------:|",
    ]

    for p in ["76", "77", "78", "79"]:
        s = plan_stats[p]
        pct = (s["july_u"] / s["units"] * 100) if s["units"] else 0
        out.append(
            f"| **{p}** | {s['total']} | {fmt_qty(s['units'])} | {pct:.0f}% | "
            f"{s['june']} зак. ({fmt_qty(s['june_u'])} шт.) | {s['july']} зак. ({fmt_qty(s['july_u'])} шт.) |"
        )

    out += [
        "",
        "**Итого по 4 планам:** "
        f"{sum(plan_stats[p]['total'] for p in ['76','77','78','79'])} зак., "
        f"{fmt_qty(sum(plan_stats[p]['units'] for p in ['76','77','78','79']))} шт., "
        f"из них в июле закрыто {total_july_orders} зак. ({fmt_qty(total_july_units)} шт.).",
        "",
        "---",
        "",
        "## 4. Типы доделывания в июле",
        "",
        "| Тип | Заказов | Шт. |",
        "|-----|--------:|----:|",
    ]
    types = Counter(r["july_work_type"] for r in july_rows)
    type_units = defaultdict(float)
    for r in july_rows:
        type_units[r["july_work_type"]] += r["qty"]
    out.append(
        f"| Полный цикл в июле | {types['full_july']} | {fmt_qty(type_units['full_july'])} |"
    )
    out.append(
        f"| Хвост присадки (пила/кромка в июне) | {types['pras_tail']} | {fmt_qty(type_units['pras_tail'])} |"
    )

    out += [
        "",
        "### 4.1. Хвост присадки — детально",
        "",
        "Заказы, у которых пила и кромка завершены **до 1 июля**, а присадка — **в июле**.",
        "Типичная картина: очередь на присадке в конце июня перешла на первые дни июля.",
        "",
        "| ID | План | Изделие | Шт. | Пила | Кромка | Присадка | Статус |",
        "|----|-----:|---------|----:|------|--------|----------|--------|",
    ]
    for r in sorted(
        [x for x in july_rows if x["july_work_type"] == "pras_tail"],
        key=lambda x: (x["plan_week"], x["pras_msk"]),
    ):
        out.append(
            f"| {r['order_id']} | {r['plan_week']} | {simplify_item(r['item'])} | {fmt_qty(r['qty'])} | "
            f"{r['pilka_msk']} | {r['kromka_msk']} | {r['pras_msk']} | {stage_label(r['pipeline_stage'])} |"
        )

    out += [
        "",
        "---",
        "",
        "## 5. Первая неделя июля (1–7)",
        "",
        "Период, когда цех одновременно закрывал хвост июня и стартовал основной объём плана 79.",
        "",
        "### Заказы с активной пилой 1–7 июля",
        "",
        "| ID | План | Изделие | Шт. | Пила |",
        "|----|-----:|---------|----:|------|",
    ]
    week1_rows = sorted(
        [r for r in july_rows if str(r.get("pilka_msk", "")).startswith("2026-07-0")],
        key=lambda x: x["pilka_msk"],
    )
    for r in week1_rows:
        out.append(
            f"| {r['order_id']} | {r['plan_week']} | {simplify_item(r['item'])} | "
            f"{fmt_qty(r['qty'])} | {r['pilka_msk']} |"
        )

    out += [
        "",
        f"**Итого 1–7 июля:** {len(week1_rows)} зак., {fmt_qty(sum(r['qty'] for r in week1_rows))} шт.",
        "",
        "### Закрытие присадки 1–7 июля",
        "",
        "| ID | План | Изделие | Шт. | Присадка |",
        "|----|-----:|---------|----:|----------|",
    ]
    week1_pras_rows = sorted(
        [r for r in july_rows if str(r.get("pras_msk", "")).startswith("2026-07-0")],
        key=lambda x: x["pras_msk"],
    )
    for r in week1_pras_rows:
        out.append(
            f"| {r['order_id']} | {r['plan_week']} | {simplify_item(r['item'])} | "
            f"{fmt_qty(r['qty'])} | {r['pras_msk']} |"
        )
    out.append(
        f"\n**Итого закрыто присадкой 1–7 июля:** {len(week1_pras_rows)} зак., "
        f"{fmt_qty(sum(r['qty'] for r in week1_pras_rows))} шт."
    )

    out += [
        "",
        "---",
        "",
        "## 6. Динамика по дням (весь июль)",
        "",
        "### 6.1. Старт пилы",
        "",
        "| Дата | Заказов | Шт. | Планы (кол-во зак.) |",
        "|------|--------:|----:|---------------------|",
    ]
    for d in sorted(pilka_by_day.keys()):
        s = pilka_by_day[d]
        plans = ", ".join(f"п.{k}: {v}" for k, v in sorted(s["plans"].items()))
        out.append(f"| {d} | {s['orders']} | {fmt_qty(s['units'])} | {plans} |")

    out += [
        "",
        "### 6.2. Закрытие кромки",
        "",
        "| Дата | Заказов | Шт. |",
        "|------|--------:|----:|",
    ]
    for d in sorted(kromka_by_day.keys()):
        s = kromka_by_day[d]
        out.append(f"| {d} | {s['orders']} | {fmt_qty(s['units'])} |")

    out += [
        "",
        "### 6.3. Закрытие присадки",
        "",
        "| Дата | Заказов | Шт. | Планы (кол-во зак.) |",
        "|------|--------:|----:|---------------------|",
    ]
    for d in sorted(pras_by_day.keys()):
        s = pras_by_day[d]
        plans = ", ".join(f"п.{k}: {v}" for k, v in sorted(s["plans"].items()))
        out.append(f"| {d} | {s['orders']} | {fmt_qty(s['units'])} | {plans} |")

    out += [
        "",
        "---",
        "",
        "## 7. По линейкам и системе хранения",
        "",
        "### 7.1. Линейки (доделано в июле)",
        "",
        "| Линейка | Заказов | Шт. | Доля шт. |",
        "|---------|--------:|----:|---------:|",
    ]
    line_stats = defaultdict(lambda: {"orders": 0, "units": 0})
    for r in july_rows:
        ln = line_of(r["item"])
        line_stats[ln]["orders"] += 1
        line_stats[ln]["units"] += r["qty"]
    for ln, s in sorted(line_stats.items(), key=lambda x: -x[1]["units"]):
        share = s["units"] / total_july_units * 100 if total_july_units else 0
        out.append(f"| {ln} | {s['orders']} | {fmt_qty(s['units'])} | {share:.0f}% |")

    storage_rows = [r for r in july_rows if line_of(r["item"]) == "Система хранения"]
    storage_variants = defaultdict(lambda: {"orders": 0, "units": 0})
    for r in storage_rows:
        v = storage_variant(r["item"]) or "Прочее"
        storage_variants[v]["orders"] += 1
        storage_variants[v]["units"] += r["qty"]

    out += [
        "",
        "### 7.2. Система хранения — разбивка",
        "",
        f"Всего **{len(storage_rows)}** заказов, **{fmt_qty(sum(r['qty'] for r in storage_rows))}** шт. "
        f"({len(storage_rows) / total_july_orders * 100:.0f}% заказов, "
        f"{sum(r['qty'] for r in storage_rows) / total_july_units * 100:.0f}% объёма).",
        "",
        "| Серия / декор | Заказов | Шт. | Дата запуска пилы |",
        "|---------------|--------:|----:|-------------------|",
    ]
    for v, s in sorted(storage_variants.items(), key=lambda x: -x[1]["units"]):
        sample_dates = sorted(
            {r["pilka_msk"][:10] for r in storage_rows if storage_variant(r["item"]) == v}
        )
        out.append(
            f"| {v} | {s['orders']} | {fmt_qty(s['units'])} | {', '.join(sample_dates)} |"
        )

    out += [
        "",
        "<details>",
        "<summary>7.3. Все заказы системы хранения (14 шт.)</summary>",
        "",
        "| ID | Артикул | Шт. | Пила | Кромка | Присадка |",
        "|----|---------|----:|------|--------|----------|",
    ]
    for r in sorted(storage_rows, key=lambda x: x["pilka_msk"]):
        art = re.search(r"\{\{ART:([^}]+)\}\}", r["item"])
        art_s = art.group(1) if art else "—"
        out.append(
            f"| {r['order_id']} | {art_s} | {fmt_qty(r['qty'])} | {r['pilka_msk']} | "
            f"{r['kromka_msk']} | {r['pras_msk']} |"
        )
    out += ["", "</details>", ""]

    out += [
        "---",
        "",
        "## 8. Статусы после цеха (июльские закрытия)",
        "",
        "Куда ушли заказы после завершения присадки в июле:",
        "",
        "| Статус | Заказов | Шт. |",
        "|--------|--------:|----:|",
    ]
    stage_stats = defaultdict(lambda: {"orders": 0, "units": 0})
    for r in july_rows:
        st = r["pipeline_stage"]
        stage_stats[st]["orders"] += 1
        stage_stats[st]["units"] += r["qty"]
    for st, s in sorted(stage_stats.items(), key=lambda x: -x[1]["orders"]):
        out.append(f"| {stage_label(st)} | {s['orders']} | {fmt_qty(s['units'])} |")

    section = 9
    out += ["", "---", "", f"## {section}. Детализация по планам 76, 77, 79", ""]
    section += 1

    for plan in ["76", "77", "79"]:
        plan_july = [r for r in july_rows if r["plan_week"] == plan]
        if not plan_july:
            continue
        out += [
            f"### План {plan} — {len(plan_july)} зак., {fmt_qty(sum(r['qty'] for r in plan_july))} шт.",
            "",
            "| ID | Изделие | Шт. | Тип | Пила | Кромка | Присадка | Статус |",
            "|----|---------|----:|-----|------|--------|----------|--------|",
        ]
        for r in sorted(plan_july, key=lambda x: x["pras_msk"]):
            typ = "хвост" if r["july_work_type"] == "pras_tail" else "полный цикл"
            out.append(
                f"| {r['order_id']} | {simplify_item(r['item'])} | {fmt_qty(r['qty'])} | {typ} | "
                f"{r['pilka_msk']} | {r['kromka_msk']} | {r['pras_msk']} | {stage_label(r['pipeline_stage'])} |"
            )
        out.append("")

    out += [
        "---",
        "",
        "## 10. План 78 — закрыт полностью в июне",
        "",
        f"Все **{plan_stats['78']['total']}** заказов ({fmt_qty(plan_stats['78']['units'])} шт.) "
        "прошли присадку до 1 июля 2026. В июле цеховых работ по этому плану не было.",
        "",
        "| Статус сейчас | Заказов |",
        "|---------------|--------:|",
    ]
    p78_stages = Counter(r["pipeline_stage"] for r in rows if r["plan_week"] == "78")
    for st, cnt in p78_stages.most_common():
        out.append(f"| {stage_label(st)} | {cnt} |")

    out += [
        "",
        "<details>",
        "<summary>Полный список плана 78 (30 зак.)</summary>",
        "",
        "| ID | Изделие | Шт. | Присадка | Статус |",
        "|----|---------|----:|----------|--------|",
    ]
    for r in sorted([x for x in rows if x["plan_week"] == "78"], key=lambda x: x["pras_msk"]):
        out.append(
            f"| {r['order_id']} | {simplify_item(r['item'])} | {fmt_qty(r['qty'])} | "
            f"{r['pras_msk']} | {stage_label(r['pipeline_stage'])} |"
        )
    out += ["", "</details>", ""]

    june_wh = [r for r in june_closed if r["pipeline_stage"] == "warehouse_kit"]
    june_shipped = [r for r in june_closed if r["pipeline_stage"] == "shipped"]
    june_ready = [r for r in june_closed if r["pipeline_stage"] == "ready_to_ship"]

    out += [
        "---",
        "",
        "## 11. Контекст: закрыто в июне",
        "",
        "Заказы, которые **успели пройти присадку в июне**, но часть из них всё ещё не отгружена.",
        "",
        f"- На комплектации: **{len(june_wh)}** зак. ({fmt_qty(sum(r['qty'] for r in june_wh))} шт.)",
        f"- Готовы к отгрузке: **{len(june_ready)}** зак.",
        f"- Уже отгружено: **{len(june_shipped)}** зак. ({fmt_qty(sum(r['qty'] for r in june_shipped))} шт.)",
        "",
        "<details>",
        "<summary>Закрыты в июне, но на комплектации (96 зак.)</summary>",
        "",
        "| План | ID | Изделие | Шт. | Присадка |",
        "|-----:|----|---------|----:|----------|",
    ]
    for r in sorted(june_wh, key=lambda x: (x["plan_week"], x["pras_msk"])):
        out.append(
            f"| {r['plan_week']} | {r['order_id']} | {simplify_item(r['item'])} | "
            f"{fmt_qty(r['qty'])} | {r['pras_msk']} |"
        )
    out += ["", "</details>", ""]

    out += [
        "---",
        "",
        "## 12. Полный реестр всех заказов (149)",
        "",
        "Все заказы планов 76–79 с меткой периода закрытия в цеху.",
        "",
        "| План | ID | Изделие | Шт. | Закрытие | Тип (июль) | Присадка | Статус |",
        "|-----:|----|---------|----:|----------|------------|----------|--------|",
    ]
    closed_label = {"june": "Июнь", "july": "Июль", "open": "Не закрыт"}
    type_label = {"full_july": "полный цикл", "pras_tail": "хвост", None: "—"}
    for r in sorted(rows, key=lambda x: (int(x["plan_week"]), x.get("pras_msk") or "9999")):
        out.append(
            f"| {r['plan_week']} | {r['order_id']} | {simplify_item(r['item'])} | {fmt_qty(r['qty'])} | "
            f"{closed_label.get(r['closed_in'], r['closed_in'])} | "
            f"{type_label.get(r.get('july_work_type'))} | "
            f"{r.get('pras_msk') or '—'} | {stage_label(r['pipeline_stage'])} |"
        )

    out += [
        "",
        "---",
        "",
        "*Сгенерировано скриптом `scripts/generate_june_july_report.py`. "
        "Для обновления — повторная выгрузка из `orders` и запуск скрипта.*",
    ]

    DEST.write_text("\n".join(out), encoding="utf-8")
    print(f"Wrote {DEST} ({len(out)} lines, {len(rows)} orders)")


if __name__ == "__main__":
    main()

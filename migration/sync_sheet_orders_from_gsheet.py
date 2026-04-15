#!/usr/bin/env python3
import argparse
import csv
import io
import os
import re
import subprocess
import sys
import urllib.request


def build_export_url(sheet_id: str, gid: str) -> str:
    return f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"


def sql_escape(value: str) -> str:
    return (value or "").replace("'", "''")


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def normalize_for_match(value: str) -> str:
    s = clean(value).lower().replace("ё", "е")
    s = re.sub(r"[^\w\s]", " ", s, flags=re.UNICODE)
    return re.sub(r"\s+", " ", s).strip()


def parse_int(value: str):
    raw = clean(value)
    if not raw:
        return None
    raw = raw.replace(",", ".")
    if re.fullmatch(r"-?\d+(\.0+)?", raw):
        try:
            return int(float(raw))
        except ValueError:
            return None
    return None


def parse_numeric(value: str):
    raw = clean(value)
    if not raw:
        return None
    raw = raw.replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None


def extract_order_code(item_label: str) -> str:
    # Pattern: "... [OBV-260330-090527]"
    match = re.search(r"\[([^\]]+)\]\s*$", item_label or "")
    return clean(match.group(1)) if match else ""


def load_article_mapping(sheet_id: str, mapping_gid: str):
    if not mapping_gid:
        return {}
    url = build_export_url(sheet_id, mapping_gid)
    with urllib.request.urlopen(url) as response:
        content = response.read().decode("utf-8-sig", errors="replace")

    reader = csv.reader(io.StringIO(content))
    mapping = {}
    for idx, row in enumerate(reader, start=1):
        if idx == 1 or len(row) < 3:
            continue
        item_name = clean(row[0])
        color_name = clean(row[1])
        article = clean(row[2])
        if not item_name or not article:
            continue
        key = f"{normalize_for_match(item_name)}|{normalize_for_match(color_name)}"
        mapping[key] = {
            "article": article,
            "map_item_name": item_name,
            "map_color_name": color_name,
        }
    return mapping


def sql_literal(value):
    if value is None:
        return "null"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return f"{value:.2f}"
    return f"'{sql_escape(str(value))}'"


def generate_sql(sheet_id: str, gid: str, mapping_gid: str = ""):
    url = build_export_url(sheet_id, gid)
    with urllib.request.urlopen(url) as response:
        content = response.read().decode("utf-8-sig", errors="replace")

    reader = csv.reader(io.StringIO(content))
    values_rows = []
    parsed_count = 0
    mapping = load_article_mapping(sheet_id, mapping_gid)

    for idx, row in enumerate(reader, start=1):
        if idx == 1:
            continue
        if len(row) < 24:
            continue

        # Mapping follows exported header:
        # [0]=created_at, [1]=item, [2]=material, [3]=plan, [4]=qty,
        # [5..18]=stage fields, [19]=overall status, [20]=Order ID,
        # [21]=Telegram Message ID, [23]=shipped.
        item_label = clean(row[1])
        if not item_label or item_label == "*-*":
            continue

        parsed_count += 1
        source_order_id = clean(row[20]) if len(row) > 20 else ""
        material_raw = clean(row[2]) or None
        order_code = source_order_id or extract_order_code(item_label)
        map_key = f"{normalize_for_match(item_label)}|{normalize_for_match(material_raw or '')}"
        map_hit = mapping.get(map_key)
        mapped_article = (map_hit or {}).get("article")
        mapped_item_name = (map_hit or {}).get("map_item_name")
        mapped_color_name = (map_hit or {}).get("map_color_name")
        article_code = mapped_article or order_code

        values_rows.append(
            (
                sheet_id,
                gid,
                idx,
                clean(row[0]) or None,   # created at raw
                material_raw,
                article_code or None,
                mapped_article or None,
                mapped_item_name or None,
                mapped_color_name or None,
                order_code or None,
                source_order_id or None,
                clean(row[21]) or None,  # telegram message id
                item_label,
                parse_int(row[3]),  # plan
                parse_numeric(row[4]),  # qty
                clean(row[5]) or None,   # pilka start
                clean(row[6]) or None,   # pilka end
                clean(row[7]) or None,   # pilka status
                clean(row[8]) or None,   # kromka start
                clean(row[9]) or None,   # kromka end
                clean(row[10]) or None,  # kromka executor
                clean(row[11]) or None,  # kromka status
                clean(row[12]) or None,  # prisadka start
                clean(row[13]) or None,  # prisadka end
                clean(row[14]) or None,  # prisadka executor
                clean(row[15]) or None,  # prisadka status
                clean(row[16]) or None,  # assembly status
                clean(row[17]) or None,  # assembly time
                clean(row[18]) or None,  # notification
                clean(row[19]) or None,  # overall status
                clean(row[23]) or None,  # shipped
            )
        )

    lines = [
        "-- Auto-generated by migration/sync_sheet_orders_from_gsheet.py",
        "-- Source columns: B..Y from production Google Sheet tab export.",
        "",
        "insert into public.sheet_orders_mirror (",
        "  sheet_id, sheet_gid, sheet_row, source_created_at_raw, material_raw, article_code, mapped_article_code, mapped_item_name, mapped_color_name,",
        "  order_code, source_order_id_raw, telegram_message_id_raw, item_label, plan_value, qty_value,",
        "  pilka_started_at_raw, pilka_finished_at_raw, pilka_status_raw,",
        "  kromka_started_at_raw, kromka_finished_at_raw, kromka_executor_raw, kromka_status_raw,",
        "  prisadka_started_at_raw, prisadka_finished_at_raw, prisadka_executor_raw, prisadka_status_raw,",
        "  assembly_status_raw, assembly_time_raw, notification_raw, overall_status_raw, shipped_raw, source_synced_at",
        ")",
        "values",
    ]

    for index, rec in enumerate(values_rows):
        suffix = "," if index < len(values_rows) - 1 else ""
        lines.append(
            "  ("
            + ", ".join(
                [
                    sql_literal(rec[0]),
                    sql_literal(rec[1]),
                    sql_literal(rec[2]),
                    sql_literal(rec[3]),
                    sql_literal(rec[4]),
                    sql_literal(rec[5]),
                    sql_literal(rec[6]),
                    sql_literal(rec[7]),
                    sql_literal(rec[8]),
                    sql_literal(rec[9]),
                    sql_literal(rec[10]),
                    sql_literal(rec[11]),
                    sql_literal(rec[12]),
                    sql_literal(rec[13]),
                    sql_literal(rec[14]),
                    sql_literal(rec[15]),
                    sql_literal(rec[16]),
                    sql_literal(rec[17]),
                    sql_literal(rec[18]),
                    sql_literal(rec[19]),
                    sql_literal(rec[20]),
                    sql_literal(rec[21]),
                    sql_literal(rec[22]),
                    sql_literal(rec[23]),
                    sql_literal(rec[24]),
                    sql_literal(rec[25]),
                    sql_literal(rec[26]),
                    sql_literal(rec[27]),
                    sql_literal(rec[28]),
                    sql_literal(rec[29]),
                    sql_literal(rec[30]),
                    "now()",
                ]
            )
            + f"){suffix}"
        )

    lines += [
        "on conflict (sheet_id, sheet_gid, sheet_row) do update",
        "set",
        "  source_created_at_raw = excluded.source_created_at_raw,",
        "  material_raw = excluded.material_raw,",
        "  article_code = excluded.article_code,",
        "  mapped_article_code = excluded.mapped_article_code,",
        "  mapped_item_name = excluded.mapped_item_name,",
        "  mapped_color_name = excluded.mapped_color_name,",
        "  order_code = excluded.order_code,",
        "  source_order_id_raw = excluded.source_order_id_raw,",
        "  telegram_message_id_raw = excluded.telegram_message_id_raw,",
        "  item_label = excluded.item_label,",
        "  plan_value = excluded.plan_value,",
        "  qty_value = excluded.qty_value,",
        "  pilka_started_at_raw = excluded.pilka_started_at_raw,",
        "  pilka_finished_at_raw = excluded.pilka_finished_at_raw,",
        "  pilka_status_raw = excluded.pilka_status_raw,",
        "  kromka_started_at_raw = excluded.kromka_started_at_raw,",
        "  kromka_finished_at_raw = excluded.kromka_finished_at_raw,",
        "  kromka_executor_raw = excluded.kromka_executor_raw,",
        "  kromka_status_raw = excluded.kromka_status_raw,",
        "  prisadka_started_at_raw = excluded.prisadka_started_at_raw,",
        "  prisadka_finished_at_raw = excluded.prisadka_finished_at_raw,",
        "  prisadka_executor_raw = excluded.prisadka_executor_raw,",
        "  prisadka_status_raw = excluded.prisadka_status_raw,",
        "  assembly_status_raw = excluded.assembly_status_raw,",
        "  assembly_time_raw = excluded.assembly_time_raw,",
        "  notification_raw = excluded.notification_raw,",
        "  overall_status_raw = excluded.overall_status_raw,",
        "  shipped_raw = excluded.shipped_raw,",
        "  source_synced_at = now();",
        "",
    ]

    return "\n".join(lines), parsed_count, len(mapping)


def main():
    parser = argparse.ArgumentParser(
        description="Generate and apply upsert SQL for production orders from Google Sheet."
    )
    parser.add_argument("--sheet-id", required=True, help="Google Sheet document ID")
    parser.add_argument("--gid", required=True, help="Google Sheet tab gid")
    parser.add_argument(
        "--mapping-gid",
        default="",
        help="Optional gid for mapping sheet with columns: item_name, color, article",
    )
    parser.add_argument(
        "--out",
        default="migration/sheet_orders_sync_from_gsheet.sql",
        help="Output SQL path",
    )
    parser.add_argument(
        "--db-url-env",
        default="SUPABASE_DB_URL",
        help="Environment variable with Postgres URL",
    )
    parser.add_argument(
        "--no-apply",
        action="store_true",
        help="Only generate SQL file, do not execute with psql",
    )
    args = parser.parse_args()

    sql, rows, mapping_rows = generate_sql(args.sheet_id, args.gid, args.mapping_gid)
    out_dir = os.path.dirname(os.path.abspath(args.out))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="\n") as f:
        f.write(sql)

    print(f"Generated: {args.out}")
    print(f"Rows parsed: {rows}")
    print(f"Mapping rows loaded: {mapping_rows}")

    if args.no_apply:
        print("Apply skipped (--no-apply).")
        return

    db_url = os.getenv(args.db_url_env, "").strip()
    if not db_url:
        print(
            f"Skip apply: env {args.db_url_env} is not set. "
            f"Run with --no-apply or set {args.db_url_env}."
        )
        sys.exit(2)

    cmd = ["psql", db_url, "-v", "ON_ERROR_STOP=1", "-f", args.out]
    print("Running:", " ".join(["psql", "<db-url>", "-v", "ON_ERROR_STOP=1", "-f", args.out]))
    result = subprocess.run(cmd, check=False)
    if result.returncode != 0:
        print(f"psql failed with exit code {result.returncode}")
        sys.exit(result.returncode)
    print("Applied successfully.")


if __name__ == "__main__":
    main()

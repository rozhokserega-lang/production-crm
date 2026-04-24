#!/usr/bin/env python3
"""
Verify Google Sheet cell notes against Supabase consume records.

Checks that notes contain both:
  - OrderID: <order_id>
  - [timestamp] расход <qty>

Compares extracted (order_id, qty) pairs from notes with DB rows from
public.materials_moves where move_type='expense' and source_type='order'.
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import json
import re
import sys
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, List, Optional, Tuple

import requests


ORDER_RE = re.compile(r"OrderID:\s*([A-Za-z0-9\-_.]+)")
SPEND_RE = re.compile(r"расход\s+([0-9]+(?:[.,][0-9]+)?)", re.IGNORECASE)


def q2(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@dataclasses.dataclass(frozen=True)
class ConsumeRecord:
    order_id: str
    qty: Decimal
    created_at: str
    material: str


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Verify consume notes in Google Sheet.")
    p.add_argument("--sheet-id", required=True, help="Google spreadsheet id")
    p.add_argument("--gid", required=True, type=int, help="Target sheet gid")
    p.add_argument("--supabase-url", required=True, help="https://<ref>.supabase.co")
    p.add_argument("--service-role-key", required=True, help="Supabase service role key")
    p.add_argument("--google-access-token", required=True, help="OAuth access token for Google Sheets API")
    p.add_argument("--days", type=int, default=7, help="How many days back to compare")
    return p.parse_args()


def fetch_db_records(url: str, service_key: str, days: int) -> List[ConsumeRecord]:
    since = (dt.datetime.utcnow() - dt.timedelta(days=days)).replace(microsecond=0).isoformat() + "Z"
    params = {
        "select": "created_at,source_ref,material,qty_sheets,move_type,source_type",
        "move_type": "eq.expense",
        "source_type": "eq.order",
        "created_at": f"gte.{since}",
        "order": "created_at.desc",
        "limit": "5000",
    }
    resp = requests.get(
        f"{url.rstrip('/')}/rest/v1/materials_moves",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
        params=params,
        timeout=60,
    )
    if not resp.ok:
        raise RuntimeError(f"DB fetch failed: {resp.status_code} {resp.text[:500]}")
    rows = resp.json()
    out: List[ConsumeRecord] = []
    for r in rows:
        order_id = str(r.get("source_ref") or "").strip()
        qty = q2(Decimal(str(r.get("qty_sheets") or "0")))
        if not order_id or qty <= 0:
            continue
        created_at_raw = str(r.get("created_at") or "").strip()
        out.append(
            ConsumeRecord(
                order_id=order_id,
                qty=qty,
                created_at=created_at_raw,
                material=str(r.get("material") or ""),
            )
        )
    return out


def fetch_sheet_meta(sheet_id: str, token: str) -> dict:
    resp = requests.get(
        f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}?fields=sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))",
        headers={"Authorization": f"Bearer {token}"},
        timeout=60,
    )
    if not resp.ok:
        raise RuntimeError(f"Sheets meta failed: {resp.status_code} {resp.text[:500]}")
    return resp.json()


def fetch_sheet_notes(sheet_id: str, gid: int, token: str, rows: int, cols: int) -> dict:
    end_col = max(cols, 60) - 1
    end_row = max(rows, 120)
    req = {
        "ranges": [
            {
                "sheetId": gid,
                "startRowIndex": 0,
                "endRowIndex": end_row,
                "startColumnIndex": 0,
                "endColumnIndex": end_col,
            }
        ],
        "includeGridData": True,
    }
    resp = requests.post(
        f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}:getByDataFilter?fields=sheets(data(rowData(values(note,userEnteredValue))))",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        data=json.dumps(req),
        timeout=90,
    )
    if not resp.ok:
        raise RuntimeError(f"Sheets notes fetch failed: {resp.status_code} {resp.text[:500]}")
    return resp.json()


def extract_from_notes(payload: dict) -> List[Tuple[str, Decimal]]:
    pairs: List[Tuple[str, Decimal]] = []
    sheets = payload.get("sheets") or []
    for s in sheets:
        for block in s.get("data") or []:
            for row in block.get("rowData") or []:
                for v in row.get("values") or []:
                    note = str(v.get("note") or "").strip()
                    if not note:
                        continue
                    order_ids = ORDER_RE.findall(note)
                    spends = SPEND_RE.findall(note)
                    if not order_ids or not spends:
                        continue
                    # Notes can contain multiple historical entries; match each OrderID
                    # with the nearest spend quantity by occurrence order.
                    n = min(len(order_ids), len(spends))
                    for i in range(n):
                        oid = order_ids[i].strip()
                        qty = q2(Decimal(spends[i].replace(",", ".")))
                        if oid and qty > 0:
                            pairs.append((oid, qty))
    return pairs


def multiset(items: List[Tuple[str, Decimal]]) -> Dict[Tuple[str, Decimal], int]:
    out: Dict[Tuple[str, Decimal], int] = {}
    for x in items:
        out[x] = out.get(x, 0) + 1
    return out


def main() -> int:
    args = parse_args()

    print("1) Loading DB consume records...")
    db_records = fetch_db_records(args.supabase_url, args.service_role_key, args.days)
    db_pairs = [(r.order_id, r.qty) for r in db_records]
    db_ms = multiset(db_pairs)
    print(f"   DB rows: {len(db_records)}")

    print("2) Loading sheet metadata...")
    meta = fetch_sheet_meta(args.sheet_id, args.google_access_token)
    target = None
    for s in meta.get("sheets") or []:
        props = s.get("properties") or {}
        if int(props.get("sheetId") or 0) == int(args.gid):
            target = props
            break
    if not target:
        raise RuntimeError(f"Sheet gid={args.gid} not found")
    row_count = int((target.get("gridProperties") or {}).get("rowCount") or 120)
    col_count = int((target.get("gridProperties") or {}).get("columnCount") or 60)
    print(f"   Sheet: {target.get('title')} (rows={row_count}, cols={col_count})")

    print("3) Reading notes...")
    notes_payload = fetch_sheet_notes(args.sheet_id, args.gid, args.google_access_token, row_count, col_count)
    note_pairs = extract_from_notes(notes_payload)
    note_ms = multiset(note_pairs)
    print(f"   Parsed note entries: {len(note_pairs)}")

    missing_in_notes: List[Tuple[str, Decimal, int]] = []
    extra_in_notes: List[Tuple[str, Decimal, int]] = []

    keys = set(db_ms.keys()) | set(note_ms.keys())
    for k in sorted(keys):
        db_n = db_ms.get(k, 0)
        note_n = note_ms.get(k, 0)
        if db_n > note_n:
            missing_in_notes.append((k[0], k[1], db_n - note_n))
        elif note_n > db_n:
            extra_in_notes.append((k[0], k[1], note_n - db_n))

    print("\n=== RESULT ===")
    print(f"DB unique pairs: {len(db_ms)}")
    print(f"Notes unique pairs: {len(note_ms)}")
    print(f"Missing in notes: {sum(x[2] for x in missing_in_notes)}")
    print(f"Extra in notes: {sum(x[2] for x in extra_in_notes)}")

    if missing_in_notes:
        print("\n-- Missing in notes (present in DB) --")
        for oid, qty, n in missing_in_notes[:100]:
            print(f"{oid} | {qty} | x{n}")
    if extra_in_notes:
        print("\n-- Extra in notes (not found in DB) --")
        for oid, qty, n in extra_in_notes[:100]:
            print(f"{oid} | {qty} | x{n}")

    return 0 if not missing_in_notes else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)

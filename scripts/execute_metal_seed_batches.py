#!/usr/bin/env python3
"""Execute metal catalog seed SQL batches via Supabase MCP-style SQL API.

Reads batch files from scripts/seed_batches/_run_*.sql and prints each batch
for manual MCP execute_sql, or set SUPABASE_DB_URL to run via psycopg2.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BATCH_DIR = ROOT / "scripts" / "seed_batches"


def main() -> None:
    batches = sorted(BATCH_DIR.glob("_run_[0-9].sql")) + sorted(
        BATCH_DIR.glob("_run_[0-9][0-9].sql")
    )
    if not batches:
        batches = [BATCH_DIR / "_run_final.sql"]

    db_url = os.environ.get("SUPABASE_DB_URL", "").strip()
    if db_url:
        try:
            import psycopg2
        except ImportError:
            print("Install psycopg2: pip install psycopg2-binary", file=sys.stderr)
            raise SystemExit(1)
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        cur = conn.cursor()
        for path in batches:
            sql = path.read_text(encoding="utf-8").strip()
            cur.execute(sql)
            row = cur.fetchone()
            print(f"{path.name}: {row}")
        cur.close()
        conn.close()
        return

    for path in batches:
        sql = path.read_text(encoding="utf-8").strip()
        print(f"--- {path.name} ({len(sql)} bytes) ---")


if __name__ == "__main__":
    main()

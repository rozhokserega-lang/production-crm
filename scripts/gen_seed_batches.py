#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "scripts" / "data" / "metal_catalog_sergey.json"
OUT_DIR = ROOT / "scripts" / "seed_batches"
BATCH_SIZE = 50


def main() -> None:
    rows = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    OUT_DIR.mkdir(exist_ok=True)
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        replace = (i + BATCH_SIZE) >= len(rows)
        payload = json.dumps(batch, ensure_ascii=False)
        if "$metal_catalog_seed$" in payload:
            raise SystemExit("delimiter found in payload")
        sql = (
            "select public.web_import_metal_catalog(\n"
            f"  $metal_catalog_seed${payload}$metal_catalog_seed$::jsonb,\n"
            f"  {'true' if replace else 'false'}\n"
            ");"
        )
        path = OUT_DIR / f"batch_{i // BATCH_SIZE + 1:02d}.sql"
        path.write_text(sql, encoding="utf-8")
        print(path.name, len(batch), "replace=" + str(replace), len(sql))


if __name__ == "__main__":
    main()

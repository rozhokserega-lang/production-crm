#!/usr/bin/env python3
"""Import metal catalog JSON into Supabase via RPC."""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "scripts" / "data" / "metal_catalog_sergey.json"
ENV_PATH = ROOT / "fronted" / ".env.local"
BATCH_SIZE = 50


def load_env() -> tuple[str, str]:
    url = os.environ.get("VITE_SUPABASE_URL", "").strip()
    key = os.environ.get("VITE_SUPABASE_ANON_KEY", "").strip()
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            name = name.strip()
            value = value.strip().strip('"').strip("'")
            if name == "VITE_SUPABASE_URL" and not url:
                url = value
            if name == "VITE_SUPABASE_ANON_KEY" and not key:
                key = value
    if not url or not key:
        raise SystemExit("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY")
    return url.rstrip("/"), key


def rpc_import(url: str, key: str, items: list, replace_missing: bool) -> dict:
    endpoint = f"{url}/rest/v1/rpc/web_import_metal_catalog"
    payload = json.dumps(
        {"p_items": items, "p_replace_missing": replace_missing},
        ensure_ascii=False,
    ).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=payload,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = resp.read().decode("utf-8")
        return json.loads(body) if body else {}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--replace-missing",
        action="store_true",
        help="Deactivate catalog items not in the JSON (requires a single full import)",
    )
    args = parser.parse_args()

    rows = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    url, key = load_env()

    if args.replace_missing:
        result = rpc_import(url, key, rows, True)
        print(f"full import: {result}")
        return

    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        try:
            result = rpc_import(url, key, batch, False)
        except urllib.error.HTTPError as e:
            err = e.read().decode("utf-8", errors="replace")
            print(f"HTTP {e.code} batch {i // BATCH_SIZE + 1}: {err}", file=sys.stderr)
            raise SystemExit(1)
        imported = result.get("imported", result)
        print(f"batch {i // BATCH_SIZE + 1}: imported={imported}")
        total += len(batch)
    print(f"done: {total} rows sent (use --replace-missing for full replace)")


if __name__ == "__main__":
    main()

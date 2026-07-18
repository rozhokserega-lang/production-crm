#!/usr/bin/env python3
"""Print seed batch SQL files for manual/MCP import (one batch per stdout block)."""
from __future__ import annotations

from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent / "seed_batches"


def main() -> None:
    files = sorted(OUT_DIR.glob("batch_*.sql"))
    if not files:
        raise SystemExit(f"No batch files in {OUT_DIR}")
    for path in files:
        print(f"--- {path.name} ---")
        print(path.read_text(encoding="utf-8").strip())
        print()


if __name__ == "__main__":
    main()

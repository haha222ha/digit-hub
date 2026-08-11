# -*- coding: utf-8 -*-
"""Sync packages/base → each app's base/ for static hosting."""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "packages" / "base"
TARGETS = [
    ROOT / "apps" / "web" / "base",
    ROOT / "apps" / "faka" / "base",  # scaffold when present / create for future
]


def main():
    if not SRC.is_dir():
        raise SystemExit(f"missing {SRC}")
    for dest in TARGETS:
        dest.mkdir(parents=True, exist_ok=True)
        for f in SRC.iterdir():
            if f.is_file():
                shutil.copy2(f, dest / f.name)
        print("synced →", dest)


if __name__ == "__main__":
    main()

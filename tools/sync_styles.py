# -*- coding: utf-8 -*-
"""Sync style-packs → apps/web/styles and apps/gen-os/styles."""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "packages" / "style-packs"
TARGETS = [
    ROOT / "apps" / "web" / "styles",
    ROOT / "apps" / "gen-os" / "styles",
]


def main():
    for dest in TARGETS:
        dest.mkdir(parents=True, exist_ok=True)
        for f in SRC.glob("*.json"):
            shutil.copy2(f, dest / f.name)
        print("synced styles →", dest)


if __name__ == "__main__":
    main()

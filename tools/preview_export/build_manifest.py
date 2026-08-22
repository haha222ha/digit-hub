# -*- coding: utf-8 -*-
"""Build preview_manifest.json from preview_results.json for xlx clone tests."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(r"D:\digit-hub-git\apps\psy-dist\tests")

SPECS = {
    "past_new": {
        "test_name": "历史人物匹配·新",
        "renderer": "xlx_past_v1",
        "theme": "past",
    },
    "muse_new": {
        "test_name": "文学原型·新",
        "renderer": "xlx_muse_v1",
        "theme": "muse",
    },
}


def main() -> int:
    for code, meta in SPECS.items():
        test_dir = ROOT / code
        data_path = test_dir / "preview_results.json"
        if not data_path.is_file():
            print("SKIP", code, "no preview_results.json")
            continue
        manifest = {
            "schema_version": 1,
            "test_code": code,
            "test_name": meta["test_name"],
            "renderer": meta["renderer"],
            "supported": True,
            "theme": meta["theme"],
            "data_url": "preview_results.json",
        }
        out = test_dir / "preview_manifest.json"
        out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("OK", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

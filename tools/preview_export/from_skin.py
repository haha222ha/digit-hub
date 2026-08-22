# -*- coding: utf-8 -*-
"""Export preview_results.json + preview_manifest.json from theme-pack skins."""
from __future__ import annotations

import json
from pathlib import Path

SKINS = Path(r"D:\digit-hub-git\packages\skins")
TESTS = Path(r"D:\digit-hub-git\apps\psy-dist\tests")
CATALOG = Path(r"D:\digit-hub-git\packages\psy-dist\tests-catalog.json")

SKIP = {"past_new", "muse_new", "catalog"}


def main() -> int:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    tests_by_code = {t["code"]: t for t in catalog.get("tests") or []}
    exported = []

    for skin_path in sorted(SKINS.glob("*.json")):
        code = skin_path.stem
        if code in SKIP:
            continue
        test_dir = TESTS / code
        if not test_dir.is_dir():
            continue
        skin = json.loads(skin_path.read_text(encoding="utf-8"))
        results = skin.get("results") or {}
        dims = skin.get("dimensions") or []
        if not results:
            print("SKIP", code, "no results in skin")
            continue

        items = []
        for dim_id, res in results.items():
            dim_label = next((d.get("label") for d in dims if d.get("id") == dim_id), dim_id)
            totals = {d.get("id"): (12 if d.get("id") == dim_id else 4) for d in dims if d.get("id")}
            items.append(
                {
                    "code": dim_id,
                    "name": res.get("type") or dim_label,
                    "label": res.get("short") or dim_label,
                    "result": {
                        "type": res.get("type") or "",
                        "short": res.get("short") or "",
                        "quote": res.get("quote") or "",
                        "tags": res.get("tags") or [],
                        "emoji": res.get("emoji", ""),
                        "full": res.get("full") or [],
                        "totals": totals,
                    },
                }
            )

        data = {"test_code": code, "items": items}
        (test_dir / "preview_results.json").write_text(
            json.dumps(data, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        manifest = {
            "schema_version": 1,
            "test_code": code,
            "test_name": skin.get("title") or tests_by_code.get(code, {}).get("name") or code,
            "renderer": "skin_v1",
            "supported": True,
            "theme": "default",
            "data_url": "preview_results.json",
        }
        (test_dir / "preview_manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        exported.append(code)
        print("OK", code, len(items), "variants")

    # Update catalog preview flags
    if exported:
        for t in catalog.get("tests") or []:
            if t.get("code") in exported:
                t["preview"] = {"supported": True, "renderer": "skin_v1", "theme": "default"}
        CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("catalog updated:", ", ".join(exported))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

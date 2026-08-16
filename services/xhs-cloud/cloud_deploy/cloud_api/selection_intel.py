# -*- coding: utf-8 -*-
"""超管测评选品报告：读取精简快照 JSON。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_CANDIDATES = [
    Path(__file__).resolve().parents[4] / "packages" / "psy-dist" / "selection-intel" / "latest.json",
    Path(__file__).resolve().parents[1] / "assets" / "psy-dist" / "selection-intel" / "latest.json",
    Path("/opt/digit-hub/packages/psy-dist/selection-intel/latest.json"),
    Path("/opt/xhs-cloud/cloud_deploy/assets/psy-dist/selection-intel/latest.json"),
]


def _resolve_path() -> Path | None:
    for p in _CANDIDATES:
        try:
            if p.is_file():
                return p
        except OSError:
            continue
    return None


def load_selection_intel(*, theme: str | None = None) -> dict[str, Any]:
    path = _resolve_path()
    if not path:
        raise FileNotFoundError(
            "未找到测评选品快照 selection-intel/latest.json。"
            "请在本机运行: python tools/build_psy_selection_intel.py"
        )
    data = json.loads(path.read_text(encoding="utf-8"))
    theme_q = (theme or "").strip()
    if theme_q:
        themes = [t for t in (data.get("themes") or []) if theme_q in str(t.get("name") or "")]
        items = [i for i in (data.get("top_items") or []) if theme_q in str(i.get("theme") or "")]
        data = {
            **data,
            "themes": themes,
            "top_items": items,
            "filter_theme": theme_q,
        }
    data["_path"] = str(path)
    return data

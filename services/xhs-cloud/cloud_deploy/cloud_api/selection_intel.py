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


def load_selection_intel(*, theme: str | None = None, day: str | None = None) -> dict[str, Any]:
    path = _resolve_path()
    if not path:
        raise FileNotFoundError(
            "未找到测评选品快照 selection-intel/latest.json。"
            "请在本机运行: python tools/build_psy_selection_intel.py"
        )
    data = json.loads(path.read_text(encoding="utf-8"))
    theme_q = (theme or "").strip()
    day_q = (day or "").strip().lstrip("全量")

    # 按日：用 daily_digest 覆盖明细视角
    if day_q:
        digest = None
        for d in data.get("daily_digest") or []:
            if str(d.get("day") or "") == day_q or day_q in str(d.get("source_name") or ""):
                digest = d
                break
        if digest:
            data = {
                **data,
                "focus_day": day_q,
                "top_items": digest.get("top_items") or [],
                "focus_digest": digest,
            }

    if theme_q:
        themes = [t for t in (data.get("themes") or []) if theme_q in str(t.get("name") or "")]
        discovered = [
            t for t in (data.get("discovered_themes") or []) if theme_q in str(t.get("name") or "")
        ]
        items = [
            i
            for i in (data.get("top_items") or [])
            if theme_q in str(i.get("theme") or "") or theme_q in str(i.get("title") or "")
        ]
        # 若主题带 day_series，附加到 filter 结果便于前端画趋势
        uncat = [
            i
            for i in (data.get("uncategorized_top") or [])
            if theme_q in str(i.get("title") or "")
        ]
        tiers = data.get("action_tiers") or {}
        filtered_tiers = {}
        for key in ("high", "mid", "avoid", "rising", "new", "watchlist", "discover"):
            filtered_tiers[key] = [
                t for t in (tiers.get(key) or []) if theme_q in str(t.get("name") or "")
            ]
        data = {
            **data,
            "themes": themes,
            "discovered_themes": discovered,
            "top_items": items,
            "uncategorized_top": uncat,
            "action_tiers": filtered_tiers,
            "premium_shortlist": filtered_tiers.get("high")
            or [
                t
                for t in (data.get("premium_shortlist") or [])
                if theme_q in str(t.get("name") or "")
            ],
            "filter_theme": theme_q,
        }
    data["_path"] = str(path)
    return data

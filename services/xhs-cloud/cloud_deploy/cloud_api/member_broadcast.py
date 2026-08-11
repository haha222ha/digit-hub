# -*- coding: utf-8 -*-
"""会员站内广播 — 重大版本更新等一次性弹窗推送。"""
from __future__ import annotations

import json
import os
from typing import Any

_ASSETS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
_BROADCAST_FILE = os.path.join(_ASSETS, "member_broadcast.json")

_cached: dict[str, Any] | None = None


def _load_broadcast_file() -> dict[str, Any] | None:
    global _cached
    if _cached is not None:
        return _cached
    path = os.environ.get("XHS_MEMBER_BROADCAST_FILE", _BROADCAST_FILE)
    if not os.path.isfile(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and data.get("id"):
            _cached = data
            return _cached
    except (OSError, json.JSONDecodeError):
        pass
    return None


def get_active_broadcast() -> dict[str, Any] | None:
    data = _load_broadcast_file()
    if not data or data.get("enabled") is False:
        return None
    return {
        "id": str(data.get("id") or ""),
        "version": data.get("version") or "",
        "title": data.get("title") or "",
        "subtitle": data.get("subtitle") or "",
        "published_at": data.get("published_at") or "",
        "badge": data.get("badge") or "重大更新",
        "sections": data.get("sections") or [],
        "highlights": data.get("highlights") or [],
        "footer": data.get("footer") or "",
        "cta_label": data.get("cta_label") or "我知道了",
    }


def member_broadcast_payload(user_id: int, *, is_active: bool) -> dict[str, Any]:
    from cloud_deploy.cloud_api import database as db

    broadcast = get_active_broadcast()
    if not broadcast or not is_active:
        return {"broadcast": broadcast, "show_popup": False, "acknowledged": True}

    bid = broadcast["id"]
    ack = db.has_member_broadcast_ack(user_id, bid)
    return {
        "broadcast": broadcast,
        "show_popup": not ack,
        "acknowledged": ack,
    }

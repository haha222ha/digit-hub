# -*- coding: utf-8 -*-
"""会员端联系配置 — PG 存储，供 admin 后台配置微信二维码等。"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

SETTINGS_KEY = "member_contact"

DEFAULT_PUBLIC = {
    "wechat_qr_url": "",
    "wechat_label": "扫码联系客服",
    "contact_text": "开通会员 / 定制分析 / 技术支持",
    "float_icon_url": "",
    "updated_at": None,
}


def _ensure_table(conn) -> None:
    with conn.cursor() as cur:
        cur.execute("SET search_path TO xhs_monitor, public")
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS system_settings (
                key VARCHAR(64) PRIMARY KEY,
                value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )


def _load_raw(conn) -> dict[str, Any]:
    _ensure_table(conn)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT value_json FROM system_settings WHERE key = %s",
            (SETTINGS_KEY,),
        )
        row = cur.fetchone()
    if not row:
        return {}
    val = row[0]
    if isinstance(val, dict):
        return val
    if isinstance(val, str):
        return json.loads(val)
    return {}


def get_public_config(conn) -> dict[str, Any]:
    """公开 GET — 未登录用户读取微信二维码 URL。"""
    raw = _load_raw(conn)
    out = {**DEFAULT_PUBLIC}
    for k in ("wechat_qr_url", "wechat_label", "contact_text", "float_icon_url", "updated_at"):
        if k in raw and raw[k] is not None:
            out[k] = raw[k]
    return out


def save_config(conn, payload: dict[str, Any]) -> dict[str, Any]:
    """Admin PUT — 保存微信二维码配置。"""
    raw = _load_raw(conn)
    merged = {**raw}
    for k in ("wechat_qr_url", "wechat_label", "contact_text", "float_icon_url"):
        if k in payload and payload[k] is not None:
            merged[k] = payload[k]
    merged["updated_at"] = datetime.now(timezone.utc).isoformat()
    _ensure_table(conn)
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO system_settings (key, value_json, updated_at)
            VALUES (%s, %s::jsonb, NOW())
            ON CONFLICT (key) DO UPDATE SET
              value_json = EXCLUDED.value_json,
              updated_at = NOW()
            """,
            (SETTINGS_KEY, json.dumps(merged, ensure_ascii=False)),
        )
    conn.commit()
    return get_public_config(conn)

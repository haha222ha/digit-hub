# -*- coding: utf-8 -*-
"""
评测发货助手 → 闲鱼：自动导卡 + 绑货（P0 桥接）

依赖：
  - 发货助手本地 API :19527（应用需在运行）
  - 闲鱼 backend-web :8089

用法：
  1. 复制 ops/xy_card_bridge_map.example.json → ops/xy_card_bridge_map.json 并填映射
  2. python ops/xy_card_bridge.py
  3. 可选：python ops/xy_card_bridge.py --dry-run
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parents[1]
MAP_PATH = ROOT / "ops" / "xy_card_bridge_map.json"
OUT_PATH = ROOT / "ops" / "_xy_card_bridge_last.json"


def load_map() -> dict[str, Any]:
    if not MAP_PATH.exists():
        example = ROOT / "ops" / "xy_card_bridge_map.example.json"
        raise SystemExit(
            f"缺少 {MAP_PATH}，请先复制 {example.name} 为 xy_card_bridge_map.json 并填写映射"
        )
    return json.loads(MAP_PATH.read_text(encoding="utf-8"))


def xy_login(base: str, username: str, password: str) -> str:
    r = requests.post(
        f"{base}/auth/login",
        json={"username": username, "password": password},
        timeout=30,
    )
    r.raise_for_status()
    body = r.json()
    token = body.get("token") or (body.get("data") or {}).get("token")
    if not token:
        raise RuntimeError(f"login failed: {body}")
    return str(token)


def xy_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def list_xy_cards(base: str, token: str) -> list[dict]:
    r = requests.get(f"{base}/cards", headers=xy_headers(token), timeout=60)
    r.raise_for_status()
    body = r.json()
    data = body.get("data") if isinstance(body, dict) else body
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("list") or data.get("items") or []
    return []


def find_card_for_item(cards: list[dict], item_id: str, name: str | None) -> dict | None:
    for c in cards:
        ids = c.get("item_ids") or []
        if item_id in ids:
            if name and c.get("name") == name:
                return c
            if not name:
                return c
    if name:
        for c in cards:
            if c.get("name") == name:
                return c
    return None


def merge_lines(existing: str | None, new_lines: list[str]) -> str:
    seen: set[str] = set()
    out: list[str] = []
    for line in (existing or "").splitlines() + new_lines:
        s = (line or "").strip()
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
    return "\n".join(out)


def pull_unused_from_xhs(
    xhs_base: str, shop_id: str, product_id: str, max_cards: int
) -> tuple[int | None, list[str]]:
    if not shop_id:
        raise RuntimeError("map.xhs_shop_id 为空：请填写千帆 shopId")
    br = requests.get(f"{xhs_base}/api/products/bindings/{shop_id}", timeout=30)
    br.raise_for_status()
    bbody = br.json()
    bindings = bbody.get("data") if isinstance(bbody, dict) else bbody
    if not isinstance(bindings, list):
        bindings = (bbody or {}).get("bindings") or []
    binding = None
    for b in bindings:
        if str(b.get("product_id") or b.get("productId") or "") == str(product_id):
            binding = b
            break
    if not binding:
        raise RuntimeError(f"发货助手未找到 product_id={product_id} 的绑定（shop={shop_id}）")
    binding_id = binding.get("id") or binding.get("binding_id")
    cr = requests.get(
        f"{xhs_base}/api/products/cards/{binding_id}",
        params={"status": "unused", "limit": max_cards, "offset": 0},
        timeout=60,
    )
    cr.raise_for_status()
    cbody = cr.json()
    rows = cbody.get("data") if isinstance(cbody, dict) else cbody
    if isinstance(rows, dict):
        rows = rows.get("list") or rows.get("cards") or []
    lines: list[str] = []
    for row in rows or []:
        content = row.get("card_content") or row.get("content") or row.get("cardContent")
        if content:
            lines.append(str(content).strip())
        if len(lines) >= max_cards:
            break
    return (int(binding_id) if binding_id is not None else None), lines


def upsert_xy_data_card(
    base: str,
    token: str,
    *,
    item_id: str,
    name: str,
    lines: list[str],
    dry_run: bool,
) -> dict[str, Any]:
    cards = list_xy_cards(base, token)
    existing = find_card_for_item(cards, item_id, name)
    merged = merge_lines(
        (existing or {}).get("data_content") if existing else None, lines
    )
    if dry_run:
        return {
            "dry_run": True,
            "existing_id": (existing or {}).get("id"),
            "line_count": len(merged.splitlines()) if merged else 0,
            "new_lines": len(lines),
        }

    if existing and existing.get("id"):
        cid = int(existing["id"])
        r = requests.put(
            f"{base}/cards/{cid}",
            headers=xy_headers(token),
            json={
                "name": name,
                "type": "data",
                "enabled": True,
                "data_content": merged,
            },
            timeout=60,
        )
        r.raise_for_status()
        r2 = requests.put(
            f"{base}/cards/{cid}/items",
            headers=xy_headers(token),
            json={"item_ids": [item_id]},
            timeout=30,
        )
        # items 接口若已包含该 item，失败也不阻断
        return {
            "ok": True,
            "mode": "update",
            "card_id": cid,
            "bind_status": r2.status_code,
            "stock_lines": len(merged.splitlines()) if merged else 0,
        }

    r = requests.post(
        f"{base}/cards/batch-save",
        headers=xy_headers(token),
        json={
            "item_ids": [item_id],
            "name": name,
            "type": "data",
            "enabled": True,
            "data_content": merged,
            "description": "xy_card_bridge 自动导入",
        },
        timeout=60,
    )
    r.raise_for_status()
    body = r.json()
    return {
        "ok": True,
        "mode": "create",
        "response": body,
        "stock_lines": len(merged.splitlines()) if merged else 0,
    }


def run_pair(cfg: dict[str, Any], pair: dict[str, Any], token: str, dry_run: bool) -> dict:
    mode = (pair.get("mode") or "pull_unused_cards").strip()
    xy_item = str(pair.get("xy_item_id") or "").strip()
    name = str(pair.get("xy_card_name") or f"桥接-{xy_item}").strip()
    if not xy_item:
        return {"ok": False, "error": "missing xy_item_id"}

    if mode == "pull_unused_cards":
        xhs_pid = str(pair.get("xhs_product_id") or "").strip()
        if not xhs_pid:
            return {"ok": False, "error": "missing xhs_product_id"}
        binding_id, lines = pull_unused_from_xhs(
            cfg["xhs_api_base"],
            str(cfg.get("xhs_shop_id") or ""),
            xhs_pid,
            int(pair.get("max_cards") or 50),
        )
        if not lines:
            return {
                "ok": False,
                "error": "no unused cards on xhs binding",
                "xhs_binding_id": binding_id,
                "xhs_product_id": xhs_pid,
            }
        result = upsert_xy_data_card(
            cfg["xy_api_base"],
            token,
            item_id=xy_item,
            name=name,
            lines=lines,
            dry_run=dry_run,
        )
        result.update(
            {
                "xhs_product_id": xhs_pid,
                "xhs_binding_id": binding_id,
                "imported": len(lines),
                "xy_item_id": xy_item,
                "note": "默认未在 XHS 侧标记 exported，请确保库存不双花",
            }
        )
        return result

    if mode == "claim_from_cloud":
        return {
            "ok": False,
            "error": "claim_from_cloud 需配置云端 token，P0b 再实现；当前请用 pull_unused_cards 或手工导入链接",
            "psy_test_code": pair.get("psy_test_code"),
        }

    return {"ok": False, "error": f"unknown mode={mode}"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    cfg = load_map()
    token = xy_login(
        cfg["xy_api_base"],
        cfg.get("xy_username") or "admin",
        cfg.get("xy_password") or "admin123",
    )
    results = []
    for pair in cfg.get("pairs") or []:
        try:
            results.append(run_pair(cfg, pair, token, args.dry_run))
        except Exception as exc:
            results.append({"ok": False, "error": str(exc), "pair": pair})
    payload = {"dry_run": bool(args.dry_run), "results": results}
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    ok = all(r.get("ok") for r in results) if results else False
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())

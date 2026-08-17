# -*- coding: utf-8 -*-
"""
评测云端 / 发货助手 → 闲鱼：自动导卡 + 绑货（P0 / P0b 桥接）

依赖：
  - 闲鱼 backend-web :8089
  - P0b：心象测云端 https://psy.xhs365.cn（claim-links）
  - P0 联调可选：发货助手本地 API :19527（勿作正式库存源）

用法：
  1. 复制 ops/xy_card_bridge_map.example.json → ops/xy_card_bridge_map.json 并填映射
  2. 设置 PSY_INTEGRATION_TOKEN（推荐），或 ops/.psy_token，或 map 内 psy_token / psy_username+psy_password
  3. python ops/xy_card_bridge.py --dry-run
  4. python ops/xy_card_bridge.py
  5. 低水位巡检：python ops/xy_card_bridge.py --only-low-water
     （Windows 计划任务可跑 ops/xy_card_autotopup.bat）
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parents[1]
MAP_PATH = ROOT / "ops" / "xy_card_bridge_map.json"
OUT_PATH = ROOT / "ops" / "_xy_card_bridge_last.json"
PSY_TOKEN_FILE = ROOT / "ops" / ".psy_token"
DEFAULT_PSY_API = "https://psy.xhs365.cn"

# 对齐小红书发货助手 link_card 四轮文案；闲鱼用 ###### 拆成多条 IM（段间约 0.5s）
# XHS 用空行分隔；闲鱼原生分隔符是 ######，语义一致。
XY_LINK_CARD_DESCRIPTION = "\n".join(
    [
        "{DELIVERY_CONTENT}",
        "######",
        "使用方法一：直接在闲鱼上点击打开并测试",
        "######",
        "使用方法二：",
        "1.复制您的专属链接到手机浏览器",
        "2.长按浏览器地址栏（长条输入框，苹果Safari是在最底部）",
        "3.点击粘贴打开前进，不要使用搜索方式，会进入错误网站~",
        "######",
        "宝，链接在上面哈，具体往上滑动屏幕可以看到~",
    ]
)


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
    cards: list[dict] = []
    if isinstance(body, list):
        cards = body
    elif isinstance(body, dict):
        if isinstance(body.get("list"), list):
            cards = body["list"]
        else:
            data = body.get("data")
            if isinstance(data, list):
                cards = data
            elif isinstance(data, dict):
                cards = data.get("list") or data.get("items") or []

    # list 接口常不带 item_ids，补拉绑定避免重复建卡
    for c in cards:
        if c.get("item_ids"):
            continue
        cid = c.get("id")
        if cid is None:
            continue
        try:
            ir = requests.get(
                f"{base}/cards/{int(cid)}/items",
                headers=xy_headers(token),
                timeout=20,
            )
            if not ir.ok:
                continue
            payload = ir.json()
            data = payload.get("data") if isinstance(payload, dict) else payload
            ids = (data or {}).get("item_ids") if isinstance(data, dict) else None
            if isinstance(ids, list):
                c["item_ids"] = [str(x) for x in ids]
        except Exception:
            continue
    return cards


def stock_lines_of(card: dict | None) -> int:
    if not card:
        return 0
    content = card.get("data_content") or ""
    return len([x for x in str(content).splitlines() if x.strip()])


def find_card_for_item(cards: list[dict], item_id: str, name: str | None) -> dict | None:
    item_id = str(item_id)
    # 1) 同名且已绑该商品
    if name:
        for c in cards:
            if str(c.get("type") or "") not in ("", "data"):
                continue
            ids = [str(x) for x in (c.get("item_ids") or [])]
            if item_id in ids and c.get("name") == name:
                return c
    # 2) 任意已绑该商品的 data 卡
    for c in cards:
        if str(c.get("type") or "") != "data":
            continue
        if c.get("enabled") is False:
            continue
        ids = [str(x) for x in (c.get("item_ids") or [])]
        if item_id in ids:
            return c
    # 3) 仅按名称（兼容 list 接口未返回 item_ids）
    if name:
        for c in cards:
            if c.get("name") == name and str(c.get("type") or "") in ("", "data"):
                return c
    return None


def resolve_delivery_description(cfg: dict[str, Any], pair: dict[str, Any]) -> str:
    raw = (
        pair.get("delivery_description")
        or cfg.get("delivery_description")
        or XY_LINK_CARD_DESCRIPTION
    )
    return str(raw).strip() or XY_LINK_CARD_DESCRIPTION


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
    description: str | None = None,
) -> dict[str, Any]:
    cards = list_xy_cards(base, token)
    existing = find_card_for_item(cards, item_id, name)
    merged = merge_lines(
        (existing or {}).get("data_content") if existing else None, lines
    )
    desc = (description or "").strip() or XY_LINK_CARD_DESCRIPTION
    if dry_run:
        return {
            "dry_run": True,
            "existing_id": (existing or {}).get("id"),
            "line_count": len(merged.splitlines()) if merged else 0,
            "new_lines": len(lines),
            "description_preview": desc[:80],
        }

    payload_common = {
        "name": name,
        "type": "data",
        "enabled": True,
        "data_content": merged,
        "description": desc,
    }

    if existing and existing.get("id"):
        cid = int(existing["id"])
        r = requests.put(
            f"{base}/cards/{cid}",
            headers=xy_headers(token),
            json=payload_common,
            timeout=60,
        )
        r.raise_for_status()
        r2 = requests.put(
            f"{base}/cards/{cid}/items",
            headers=xy_headers(token),
            json={"item_ids": [item_id]},
            timeout=30,
        )
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
            **payload_common,
            "item_ids": [item_id],
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


def _unwrap_data(body: dict[str, Any] | None) -> Any:
    if not isinstance(body, dict):
        return body
    if "data" in body:
        return body.get("data")
    return body


def resolve_psy_token(cfg: dict[str, Any]) -> tuple[str, str]:
    """返回 (token, source_label)。优先 env / 本地文件，避免密码入库。"""
    env_tok = (os.environ.get("PSY_INTEGRATION_TOKEN") or "").strip()
    if env_tok:
        return env_tok, "env:PSY_INTEGRATION_TOKEN"

    if PSY_TOKEN_FILE.exists():
        file_tok = PSY_TOKEN_FILE.read_text(encoding="utf-8").strip()
        if file_tok:
            return file_tok, f"file:{PSY_TOKEN_FILE.name}"

    map_tok = str(cfg.get("psy_token") or "").strip()
    if map_tok:
        return map_tok, "map:psy_token"

    user = str(cfg.get("psy_username") or os.environ.get("PSY_USERNAME") or "").strip()
    password = str(
        cfg.get("psy_password") or os.environ.get("PSY_PASSWORD") or ""
    ).strip()
    if user and password:
        base = str(cfg.get("psy_api_base") or DEFAULT_PSY_API).rstrip("/")
        r = requests.post(
            f"{base}/api/auth/login",
            json={"username": user, "password": password},
            timeout=30,
        )
        r.raise_for_status()
        body = r.json()
        data = _unwrap_data(body) or {}
        tok = (
            str(data.get("integration_token") or data.get("api_token") or "").strip()
            or str(data.get("token") or "").strip()
        )
        if not tok:
            raise RuntimeError(f"psy login ok but no token: {body}")
        return tok, "login:psy_username"

    raise RuntimeError(
        "缺少心象测对接凭证：请设置环境变量 PSY_INTEGRATION_TOKEN，"
        f"或写入 {PSY_TOKEN_FILE}，或在 map 中配置 psy_token / psy_username+psy_password"
    )


def psy_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def psy_inventory(base: str, token: str, test_code: str) -> dict[str, Any]:
    r = requests.get(
        f"{base}/api/faka/inventory",
        headers=psy_headers(token),
        params={"testCode": test_code},
        timeout=30,
    )
    r.raise_for_status()
    body = r.json()
    if body.get("success") is False:
        raise RuntimeError(body.get("message") or "inventory failed")
    data = _unwrap_data(body) or {}
    return data if isinstance(data, dict) else {}


def psy_generate_links(
    base: str, token: str, test_code: str, count: int
) -> dict[str, Any]:
    r = requests.post(
        f"{base}/api/links/generate",
        headers=psy_headers(token),
        json={"testCode": test_code, "count": int(count)},
        timeout=60,
    )
    r.raise_for_status()
    body = r.json()
    if body.get("success") is False:
        raise RuntimeError(body.get("message") or "generate failed")
    data = _unwrap_data(body) or {}
    return {
        "generated": int(
            (data or {}).get("generatedCount")
            or len((data or {}).get("links") or [])
            or count
        ),
        "message": body.get("message") or "",
    }


def psy_claim_links(
    base: str,
    token: str,
    *,
    test_code: str,
    count: int,
    client_id: str,
    product_id: str = "",
    shop_id: str = "xianyu",
) -> dict[str, Any]:
    r = requests.post(
        f"{base}/api/faka/claim-links",
        headers=psy_headers(token),
        json={
            "testCode": test_code,
            "count": int(count),
            "clientId": client_id,
            "productId": product_id,
            "shopId": shop_id,
        },
        timeout=60,
    )
    r.raise_for_status()
    body = r.json()
    if body.get("success") is False:
        raise RuntimeError(body.get("message") or "claim-links failed")
    data = _unwrap_data(body) or {}
    links = (data or {}).get("links") or []
    urls: list[str] = []
    for link in links:
        url = str((link or {}).get("url") or "").strip()
        if url:
            urls.append(url)
    return {
        "claimed": int((data or {}).get("claimed") or len(urls)),
        "batch_id": str((data or {}).get("batchId") or (data or {}).get("batch_id") or ""),
        "urls": urls,
        "remaining_unclaimed": int((data or {}).get("remaining_unclaimed") or 0),
        "message": body.get("message") or "",
    }


def claim_from_cloud(
    cfg: dict[str, Any],
    pair: dict[str, Any],
    xy_token: str,
    dry_run: bool,
    *,
    only_low_water: bool = False,
) -> dict[str, Any]:
    test_code = str(pair.get("psy_test_code") or "").strip()
    xy_item = str(pair.get("xy_item_id") or "").strip()
    name = str(pair.get("xy_card_name") or f"桥接-{test_code}-{xy_item}").strip()
    if not test_code:
        return {"ok": False, "error": "missing psy_test_code"}
    if not xy_item:
        return {"ok": False, "error": "missing xy_item_id"}

    claim_count = max(
        1,
        min(
            int(
                pair.get("refill_batch")
                or pair.get("claim_count")
                or cfg.get("refill_batch")
                or cfg.get("claim_count")
                or 20
            ),
            200,
        ),
    )
    low_water = int(pair.get("low_water") or cfg.get("low_water") or 10)
    allow_generate = bool(pair.get("allow_generate", cfg.get("allow_generate", True)))
    client_id = str(
        pair.get("client_id") or cfg.get("psy_client_id") or "xianyu"
    ).strip() or "xianyu"
    psy_base = str(cfg.get("psy_api_base") or DEFAULT_PSY_API).rstrip("/")
    description = resolve_delivery_description(cfg, pair)

    # 先看闲鱼库存，低水位才补
    cards = list_xy_cards(cfg["xy_api_base"], xy_token)
    existing = find_card_for_item(cards, xy_item, name)
    stock_now = stock_lines_of(existing)
    if only_low_water or pair.get("respect_low_water", True):
        if stock_now >= low_water:
            # 库存够时仍同步发卡文案（多段 ######），保证模板升级能落地
            synced = False
            if existing and existing.get("id") and not dry_run:
                cur_desc = str(existing.get("description") or "")
                if cur_desc.strip() != description.strip():
                    cid = int(existing["id"])
                    requests.put(
                        f"{cfg['xy_api_base']}/cards/{cid}",
                        headers=xy_headers(xy_token),
                        json={
                            "name": name,
                            "type": "data",
                            "enabled": True,
                            "data_content": existing.get("data_content") or "",
                            "description": description,
                        },
                        timeout=60,
                    ).raise_for_status()
                    requests.put(
                        f"{cfg['xy_api_base']}/cards/{cid}/items",
                        headers=xy_headers(xy_token),
                        json={"item_ids": [xy_item]},
                        timeout=30,
                    )
                    synced = True
            return {
                "ok": True,
                "skipped": True,
                "mode": "claim_from_cloud",
                "psy_test_code": test_code,
                "xy_item_id": xy_item,
                "stock_lines": stock_now,
                "low_water": low_water,
                "description_synced": synced,
                "note": f"库存 {stock_now} >= 低水位 {low_water}，跳过补卡"
                + ("（已同步多段发卡文案）" if synced else ""),
            }

    psy_token, token_source = resolve_psy_token(cfg)
    generated = 0
    inv_before = psy_inventory(psy_base, psy_token, test_code)
    unclaimed = int(
        inv_before.get("unclaimed_unused")
        or inv_before.get("unclaimed")
        or 0
    )

    if dry_run:
        need_generate = max(0, claim_count - max(0, unclaimed)) if allow_generate else 0
        return {
            "ok": True,
            "dry_run": True,
            "mode": "claim_from_cloud",
            "psy_test_code": test_code,
            "xy_item_id": xy_item,
            "client_id": client_id,
            "stock_lines": stock_now,
            "low_water": low_water,
            "would_claim": claim_count,
            "would_generate": need_generate,
            "inventory_unclaimed": unclaimed,
            "psy_token_source": token_source,
            "note": "dry-run 不调用 claim-links，不扣云端库存",
        }

    if allow_generate and unclaimed < claim_count:
        deficit = max(1, claim_count - max(0, unclaimed))
        try:
            gen = psy_generate_links(psy_base, psy_token, test_code, deficit)
            generated = int(gen.get("generated") or 0)
        except Exception as gen_exc:
            if unclaimed <= 0:
                return {
                    "ok": False,
                    "error": f"云端无可领链接且 generate 失败: {gen_exc}",
                    "psy_test_code": test_code,
                    "inventory": inv_before,
                    "psy_token_source": token_source,
                }

    claim = psy_claim_links(
        psy_base,
        psy_token,
        test_code=test_code,
        count=claim_count,
        client_id=client_id,
        product_id=str(pair.get("xy_item_id") or ""),
        shop_id="xianyu",
    )
    urls = list(claim.get("urls") or [])
    if not urls:
        return {
            "ok": False,
            "error": claim.get("message") or "云端无可领取链接",
            "psy_test_code": test_code,
            "generated": generated,
            "inventory": inv_before,
            "psy_token_source": token_source,
            "stock_lines": stock_now,
        }

    result = upsert_xy_data_card(
        cfg["xy_api_base"],
        xy_token,
        item_id=xy_item,
        name=name,
        lines=urls,
        dry_run=False,
        description=description,
    )
    result.update(
        {
            "ok": True if result.get("ok") else bool(result.get("ok")),
            "mode": "claim_from_cloud",
            "psy_test_code": test_code,
            "xy_item_id": xy_item,
            "client_id": client_id,
            "imported": len(urls),
            "generated": generated,
            "batch_id": claim.get("batch_id") or "",
            "remaining_unclaimed": claim.get("remaining_unclaimed"),
            "sample_url": urls[0],
            "stock_before": stock_now,
            "low_water": low_water,
            "psy_token_source": token_source,
            "note": "已从云端为闲鱼单独 claim，禁止与 XHS 共用同一批 unused",
        }
    )
    return result


def run_pair(
    cfg: dict[str, Any],
    pair: dict[str, Any],
    token: str,
    dry_run: bool,
    *,
    only_low_water: bool = False,
) -> dict:
    mode = (pair.get("mode") or "pull_unused_cards").strip()
    xy_item = str(pair.get("xy_item_id") or "").strip()
    name = str(pair.get("xy_card_name") or f"桥接-{xy_item}").strip()
    if not xy_item:
        return {"ok": False, "error": "missing xy_item_id"}

    if mode == "pull_unused_cards":
        if only_low_water:
            return {
                "ok": True,
                "skipped": True,
                "mode": mode,
                "note": "only-low-water 模式跳过 pull_unused_cards",
            }
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
            description=resolve_delivery_description(cfg, pair),
        )
        result.update(
            {
                "xhs_product_id": xhs_pid,
                "xhs_binding_id": binding_id,
                "imported": len(lines),
                "xy_item_id": xy_item,
                "note": "默认未在 XHS 侧标记 exported，请确保库存不双花；正式请用 claim_from_cloud",
            }
        )
        return result

    if mode == "claim_from_cloud":
        return claim_from_cloud(
            cfg, pair, token, dry_run, only_low_water=only_low_water
        )

    return {"ok": False, "error": f"unknown mode={mode}"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--only-low-water",
        action="store_true",
        help="仅当闲鱼卡池低于 low_water 时才 claim（用于定时巡检）",
    )
    ap.add_argument(
        "--force-refill",
        action="store_true",
        help="忽略低水位，强制按 claim_count/refill_batch 补货",
    )
    args = ap.parse_args()
    cfg = load_map()
    token = xy_login(
        cfg["xy_api_base"],
        cfg.get("xy_username") or "admin",
        cfg.get("xy_password") or "admin123",
    )
    results = []
    token_source = None
    for pair in cfg.get("pairs") or []:
        pair_eff = dict(pair)
        if args.force_refill:
            pair_eff["respect_low_water"] = False
        try:
            one = run_pair(
                cfg,
                pair_eff,
                token,
                args.dry_run,
                only_low_water=bool(args.only_low_water),
            )
            if one.get("psy_token_source"):
                token_source = one.get("psy_token_source")
            results.append(one)
        except Exception as exc:
            results.append({"ok": False, "error": str(exc), "pair": pair})
    payload: dict[str, Any] = {
        "dry_run": bool(args.dry_run),
        "only_low_water": bool(args.only_low_water),
        "results": results,
    }
    if token_source:
        payload["psy_token_source"] = token_source
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    ok = all(r.get("ok") for r in results) if results else False
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())

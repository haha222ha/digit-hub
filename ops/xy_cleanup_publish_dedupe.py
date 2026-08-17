# -*- coding: utf-8 -*-
"""一次性：迁移字段 + 全量同步对账 + 素材去重 + 回写 published_item_id + 对齐 map。"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(r"D:\Program Files\ProductAnalyzer\xianyu-auto-reply")
HUB = Path(r"D:\选品报告\资料生产工厂\digit-hub")
sys.path.insert(0, str(ROOT))
os.chdir(str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / "backend-web" / ".env")

from sqlalchemy import delete, select, text
from common.db.session import async_session_maker
from common.models.product_material import ProductMaterial
from common.models.publish_log import PublishLog
from common.models.xy_account import XYAccount
from common.services.item_service import ItemService
from common.services.product_publish_guard import extract_rule_code

AID = "1737335886"
MAP_PATH = HUB / "ops" / "xy_card_bridge_map.json"
_CODE_RE = re.compile(r"(?:^|;)\s*code=([A-Za-z0-9_\-]+)", re.I)


async def ensure_column():
    async with async_session_maker() as s:
        exists = (
            await s.execute(
                text(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS "
                    "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='xy_product_materials' "
                    "AND COLUMN_NAME='published_item_id'"
                )
            )
        ).scalar()
        if not exists:
            await s.execute(
                text(
                    "ALTER TABLE xy_product_materials "
                    "ADD COLUMN published_item_id VARCHAR(64) DEFAULT NULL "
                    "COMMENT '最近一次成功发布到闲鱼的商品ID（防重复发布）' AFTER remark"
                )
            )
            await s.commit()
            print("added published_item_id column")
        else:
            print("published_item_id already exists")


async def sync_and_prune():
    async with async_session_maker() as s:
        acc = (
            await s.execute(select(XYAccount).where(XYAccount.account_id == AID))
        ).scalar_one_or_none()
        if not acc:
            raise SystemExit("account missing")
        svc = ItemService(s)
        result = await svc.fetch_all_items_from_account(account=acc)
        print("sync", {k: result.get(k) for k in ("success", "total_count", "saved_count", "pruned_count", "message")})
        return result


async def backfill_and_dedupe_materials(live_ids: set[str]):
    async with async_session_maker() as s:
        mats = (
            await s.execute(select(ProductMaterial).order_by(ProductMaterial.id.desc()))
        ).scalars().all()
        logs = (
            await s.execute(
                select(PublishLog).where(
                    PublishLog.account_id == AID,
                    PublishLog.status == "success",
                    PublishLog.item_id.is_not(None),
                )
            )
        ).scalars().all()

        # material_id -> latest success item_id (prefer live)
        by_mid: dict[int, list[str]] = defaultdict(list)
        by_title: dict[str, list[str]] = defaultdict(list)
        for lg in sorted(logs, key=lambda x: x.id, reverse=True):
            iid = str(lg.item_id or "").strip()
            if not iid:
                continue
            if lg.material_id:
                by_mid[int(lg.material_id)].append(iid)
            if lg.title:
                by_title[str(lg.title).strip()].append(iid)

        def pick_item(candidates: list[str]) -> str | None:
            for c in candidates:
                if c in live_ids:
                    return c
            return candidates[0] if candidates else None

        # group by code (preferred) else title；code 兼容 psy:xx / code=xx
        # 另：lbt 与 lnnd 视为同一测题
        CODE_ALIASES = {"lbt": "lnnd", "lnnd": "lnnd"}
        groups: dict[str, list[ProductMaterial]] = defaultdict(list)
        for m in mats:
            code = extract_rule_code(m.remark)
            if code:
                code = CODE_ALIASES.get(code, code)
                key = f"code:{code}"
            else:
                key = f"title:{(m.title or '').strip()}"
            groups[key].append(m)

        keep_ids: list[int] = []
        delete_ids: list[int] = []
        code_to_item: dict[str, str] = {}
        code_to_material: dict[str, int] = {}

        for key, rows in groups.items():
            # prefer material whose published/success item is live, else highest id
            scored = []
            for m in rows:
                cands = []
                if m.published_item_id:
                    cands.append(str(m.published_item_id).strip())
                cands.extend(by_mid.get(int(m.id), []))
                cands.extend(by_title.get(str(m.title or "").strip(), []))
                # dedupe preserve order
                seen = set()
                uniq = []
                for c in cands:
                    if c and c not in seen:
                        seen.add(c)
                        uniq.append(c)
                picked = pick_item(uniq)
                score = (2 if picked and picked in live_ids else 0) + (1 if picked else 0)
                scored.append((score, int(m.id), m, picked))
            scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
            winner = scored[0]
            keep_ids.append(winner[1])
            picked = winner[3]
            if picked:
                winner[2].published_item_id = picked
            code = extract_rule_code(winner[2].remark)
            if code and picked:
                code_to_item[code] = picked
                code_to_material[code] = winner[1]
            elif code and winner[2].published_item_id:
                code_to_item[code] = str(winner[2].published_item_id)
                code_to_material[code] = winner[1]
            for _, mid, _, _ in scored[1:]:
                delete_ids.append(mid)

        if delete_ids:
            await s.execute(
                delete(ProductMaterial).where(ProductMaterial.id.in_(delete_ids))
            )
        await s.commit()
        print(
            "materials keep",
            len(keep_ids),
            "deleted",
            len(delete_ids),
            "codes",
            code_to_item,
        )
        return code_to_item, code_to_material


def realign_map(code_to_item: dict[str, str], live_ids: set[str]):
    cfg = json.loads(MAP_PATH.read_text(encoding="utf-8"))
    changed = []
    for pair in cfg.get("pairs") or []:
        code = str(pair.get("psy_test_code") or "").strip().lower()
        # map uses lnnd but materials used lbt historically
        lookup = code
        if code == "lnnd" and "lnnd" not in code_to_item and "lbt" in code_to_item:
            lookup = "lbt"
        new_id = code_to_item.get(lookup) or code_to_item.get(code)
        if not new_id:
            continue
        old = str(pair.get("xy_item_id") or "").strip()
        aliases = [str(x).strip() for x in (pair.get("xy_item_aliases") or []) if str(x).strip()]
        if old and old != new_id and old not in aliases:
            aliases.append(old)
        # keep previous aliases + any other success ids? only old primary
        pair["xy_item_id"] = new_id
        # unique aliases excluding primary
        pair["xy_item_aliases"] = [a for a in dict.fromkeys(aliases) if a != new_id]
        pair["live_onsale"] = new_id in live_ids
        changed.append(
            {
                "code": code,
                "old": old,
                "new": new_id,
                "live": new_id in live_ids,
                "aliases": pair["xy_item_aliases"],
            }
        )
    MAP_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("map_updated", len(changed))
    for c in changed:
        print(c)
    return changed


async def main():
    await ensure_column()
    sync = await sync_and_prune()
    live_ids = set()
    for it in sync.get("items") or []:
        iid = str(it.get("id") or "").strip()
        if iid and not iid.startswith("auto_"):
            live_ids.add(iid)
    print("live_ids", sorted(live_ids))
    code_to_item, _ = await backfill_and_dedupe_materials(live_ids)
    realign_map(code_to_item, live_ids)


if __name__ == "__main__":
    asyncio.run(main())

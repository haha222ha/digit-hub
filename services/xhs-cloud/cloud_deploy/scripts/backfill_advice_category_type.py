#!/usr/bin/env python3
"""为历史 advice.json 补 category_type（physical/virtual/mixed），供 archive 三层目录使用。

用法:
  python3 backfill_advice_category_type.py --root /opt/xhs-cloud/data/advisor_published --write
  python3 backfill_advice_category_type.py --root ... --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
import re
from typing import Any

VIRTUAL_HINTS = (
    "虚拟", "网课", "课程", "教辅", "资料", "电子书", "电子", "软件", "源码",
    "账号", "会员卡", "模板", "模版", "素材", "PPT", "pdf", "PDF", "题库",
    "课件", "网盘", "激活码", "序列号", "服务", "咨询", "设计素材", "短视频脚本",
    "文档", "讲义", "试卷", "幼小", "一年级", "二年级", "三年级", "四年级",
    "五年级", "六年级", "考研", "公考", "考证",
)

PHYSICAL_HINTS = (
    "服装", "美妆", "护肤", "食品", "零食", "家居", "收纳", "宠物", "植物",
    "数码", "3C", "母婴", "鞋", "箱包", "家具", "厨", "洗护", "日用",
)


def infer_category_type(item: dict[str, Any]) -> str:
    existing = str(item.get("category_type") or "").strip().lower()
    if existing in ("physical", "virtual", "mixed"):
        return existing
    text = " ".join(
        str(item.get(k) or "")
        for k in ("title", "key", "category", "summary", "headline")
    )
    v_hit = any(h in text for h in VIRTUAL_HINTS)
    p_hit = any(h in text for h in PHYSICAL_HINTS)
    if v_hit and not p_hit:
        return "virtual"
    if p_hit and not v_hit:
        return "physical"
    if v_hit and p_hit:
        return "mixed"
    # 关键词榜常见是实体；无信号时用 physical，避免全部挤进 other
    if re.search(r"(涨粉|蓝海|爆|低价|价格带|销量)", text):
        return "physical"
    return "mixed"


def process_file(path: str, write: bool) -> tuple[int, int]:
    with open(path, encoding="utf-8") as f:
        advice = json.load(f)
    dirs = advice.get("direction_advices") or []
    changed = 0
    for d in dirs:
        if not isinstance(d, dict):
            continue
        before = str(d.get("category_type") or "").strip().lower()
        after = infer_category_type(d)
        if before != after:
            d["category_type"] = after
            changed += 1
    if write and changed:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(advice, f, ensure_ascii=False, indent=2)
            f.write("\n")
    return len(dirs), changed


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.environ.get("XHS_ADVISOR_PUBLISH_DIR", "data/advisor_published"))
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    write = bool(args.write) and not args.dry_run
    root = args.root
    if not os.path.isdir(root):
        print(f"root missing: {root}")
        return 1
    for name in sorted(os.listdir(root)):
        path = os.path.join(root, name, "advice.json")
        if not os.path.isfile(path):
            continue
        total, changed = process_file(path, write=write)
        # 统计结果
        advice = json.load(open(path, encoding="utf-8"))
        cts: dict[str, int] = {}
        for d in advice.get("direction_advices") or []:
            c = str((d or {}).get("category_type") or "none")
            cts[c] = cts.get(c, 0) + 1
        print(f"{name}: total={total} changed={changed} types={cts} write={write}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

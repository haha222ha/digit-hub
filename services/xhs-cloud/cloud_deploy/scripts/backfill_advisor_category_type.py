#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""为已发布 advice.json 补齐 direction_advices.category_type 并写回。"""
from __future__ import annotations

import argparse
import json
import os
import sys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="", help="advisor_published 根目录")
    ap.add_argument("--date", default="", help="仅处理一日 YYYY-MM-DD；默认全部")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    root = args.root or os.environ.get(
        "XHS_ADVISOR_PUBLISH_DIR",
        "/opt/xhs-cloud/data/advisor_published",
    )
    if not os.path.isabs(root):
        cloud = os.environ.get("XHS_CLOUD_ROOT", "/opt/xhs-cloud")
        root = os.path.join(cloud, root)

    # 保证可 import cloud_deploy
    here = os.path.dirname(os.path.abspath(__file__))
    cloud_deploy = os.path.dirname(here)
    xhs_cloud = os.path.dirname(cloud_deploy)
    if xhs_cloud not in sys.path:
        sys.path.insert(0, xhs_cloud)

    from cloud_deploy.rank_engine.entity_type import enrich_advice_directions

    dates = []
    if args.date:
        dates = [args.date]
    else:
        for name in sorted(os.listdir(root)):
            if os.path.isfile(os.path.join(root, name, "advice.json")):
                dates.append(name)

    changed = 0
    for d in dates:
        path = os.path.join(root, d, "advice.json")
        if not os.path.isfile(path):
            print(f"skip missing {path}")
            continue
        with open(path, encoding="utf-8") as f:
            advice = json.load(f)
        before = [
            (x.get("key"), x.get("category_type"))
            for x in (advice.get("direction_advices") or [])
            if isinstance(x, dict)
        ]
        advice = enrich_advice_directions(advice, context=None)
        after = [
            (x.get("key"), x.get("category_type"))
            for x in (advice.get("direction_advices") or [])
            if isinstance(x, dict)
        ]
        if before == after:
            print(f"{d}: unchanged n={len(after)}")
            continue
        print(f"{d}: {before} -> {after}")
        if not args.dry_run:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(advice, f, ensure_ascii=False, indent=2)
                f.write("\n")
        changed += 1
    print(f"done changed={changed} dry_run={args.dry_run}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

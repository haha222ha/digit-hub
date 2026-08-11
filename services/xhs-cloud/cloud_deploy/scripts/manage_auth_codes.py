# -*- coding: utf-8 -*-
"""统一授权码管理 CLI — 各 product 共享 xhs-cloud 发码/激活内核。

用法:
  cd /opt/xhs-cloud && export PYTHONPATH=/opt/xhs-cloud

  # 查看产品注册表
  ./venv/bin/python cloud_deploy/scripts/manage_auth_codes.py products

  # 按 product/sku 发码（推荐）
  ./venv/bin/python cloud_deploy/scripts/manage_auth_codes.py generate \\
    --product assess --sku card --count 50 --channel xianyu-batch-001 --export

  # 兼容旧 --plan
  ./venv/bin/python cloud_deploy/scripts/manage_auth_codes.py generate --plan monthly --count 5

  ./venv/bin/python cloud_deploy/scripts/manage_auth_codes.py list --limit 100
"""
from __future__ import annotations

import argparse
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from cloud_deploy.scripts.bootstrap_env import bootstrap

bootstrap()


def _print_products(include_reserved: bool = False) -> None:
    from cloud_deploy.cloud_api.auth_product_registry import list_products

    for p in list_products(include_reserved=include_reserved):
        print(f"\n[{p['product']}] {p['label']} — {p.get('description') or ''}")
        print(f"  激活链接模板: {p['activate_url_template']}")
        for s in p["skus"]:
            flag = " (reserved)" if s.get("reserved") else ""
            print(
                f"  - sku={s['sku']}{flag}: {s['label']} → plan={s['plan_code']} "
                f"{s['duration_days']}天 max={s['max_activations']}"
            )


def _resolve_generate_args(args) -> dict:
    from cloud_deploy.cloud_api.auth_product_registry import (
        build_fulfillment_note,
        format_batch_export,
        resolve_plan,
        resolve_sku,
    )
    from cloud_deploy.cloud_api.payment_plans import entitlements_note_for_payment_plan

    channel = (args.channel or "").strip()
    remark = (args.note or "").strip()

    if args.product and args.sku:
        spec = resolve_sku(args.product, args.sku)
        plan_code = spec["plan_code"]
        days = args.days or spec["duration_days"]
        max_act = args.max_activations or spec["max_activations"]
        note = build_fulfillment_note(
            plan_code,
            product=spec["product"],
            sku=spec["sku"],
            channel=channel,
            remark=remark,
        )
        product = spec["product"]
        sku = spec["sku"]
        label = f"{spec['product_label']} · {spec['sku_label']}"
    elif args.plan:
        plan_code = args.plan
        spec = resolve_plan(plan_code)
        days = args.days or (spec["duration_days"] if spec else 30)
        max_act = args.max_activations
        product = spec["product"] if spec else ""
        sku = spec["sku"] if spec else ""
        base = entitlements_note_for_payment_plan(plan_code)
        if base:
            payload = json.loads(base)
            meta = payload.setdefault("meta", {})
            if channel:
                meta["channel"] = channel
            if remark:
                meta["remark"] = remark
            note = json.dumps(payload, ensure_ascii=False)
        else:
            note = remark or channel
        label = plan_code
    else:
        raise SystemExit("请指定 --product + --sku，或 --plan")

    return {
        "plan_code": plan_code,
        "duration_days": days,
        "max_activations": max_act,
        "note": note,
        "product": product,
        "sku": sku,
        "label": label,
        "channel": channel,
        "export": bool(args.export),
        "count": args.count,
    }


def main() -> None:
    from cloud_deploy.cloud_api.database import generate_auth_codes, init_db, list_auth_codes

    init_db()

    ap = argparse.ArgumentParser(description="统一授权码管理（xhs-cloud 共享基座）")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("products", help="列出已注册 product/sku")
    p.add_argument("--all", action="store_true", help="包含 reserved 预留 sku")

    g = sub.add_parser("generate", help="生成授权码")
    g.add_argument("--product", default="", help="产品: assess | insight | faka | push")
    g.add_argument("--sku", default="", help="规格: single | card | monthly | ...")
    g.add_argument(
        "--plan",
        default="",
        help="legacy 套餐码（与 --product/--sku 二选一）",
    )
    g.add_argument("--days", type=int, default=0, help="有效天数（0=sku 默认）")
    g.add_argument("--count", type=int, default=1, help="生成数量")
    g.add_argument("--max-activations", type=int, default=0, help="每码最多激活次数（0=sku 默认）")
    g.add_argument("--channel", default="", help="渠道/批次备注（小红书/闲鱼/订单号）")
    g.add_argument("--note", default="", help="额外备注")
    g.add_argument(
        "--export",
        action="store_true",
        help="输出 码+激活链接 TSV（发卡平台导入）",
    )

    ls = sub.add_parser("list", help="列出最近授权码")
    ls.add_argument("--limit", type=int, default=100)

    args = ap.parse_args()

    if args.cmd == "products":
        _print_products(include_reserved=bool(args.all))
        return

    if args.cmd == "generate":
        from cloud_deploy.cloud_api.auth_product_registry import format_batch_export

        spec = _resolve_generate_args(args)
        codes = generate_auth_codes(
            count=spec["count"],
            plan_code=spec["plan_code"],
            duration_days=spec["duration_days"],
            max_activations=spec["max_activations"],
            note=spec["note"],
        )
        print(
            f"已生成 {len(codes)} 个授权码 · {spec['label']} · "
            f"plan={spec['plan_code']} · {spec['duration_days']}天"
        )
        if spec["channel"]:
            print(f"渠道: {spec['channel']}")
        if spec["export"] and spec["product"]:
            print()
            print(format_batch_export(
                spec["product"],
                spec["sku"],
                codes,
                channel=spec["channel"],
            ))
        else:
            for c in codes:
                print(c)
        return

    if args.cmd == "list":
        items = list_auth_codes(args.limit)
        if not items:
            print("暂无授权码")
            return
        for it in items:
            print(
                f"{it['code']}  {it['plan_label']}  {it['duration_days']}天  "
                f"已用{it['current_activations']}/{it['max_activations']}  "
                f"{it['status']}  {it['note']}"
            )


if __name__ == "__main__":
    main()

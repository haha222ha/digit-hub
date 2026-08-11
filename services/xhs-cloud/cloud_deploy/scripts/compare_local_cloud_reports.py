# -*- coding: utf-8
"""
比对本地每日选品报告 vs 已打包上云的 historical_reports。

- 按 goods_id 去重（全局唯一）
- 分报告统计行数 / 日期
- 对比 server_sync_pack 与本地差异（缺哪些天、多多少唯一 ID）
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUD_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
if CLOUD_ROOT not in sys.path:
    sys.path.insert(0, CLOUD_ROOT)

from cloud_deploy.cloud_api.sync_service import parse_data_js, _field, COL


def _scan_root(root: str, pattern: str = "*") -> list[Path]:
    root_p = Path(root)
    if not root_p.is_dir():
        return []
    out: list[Path] = []
    for d in sorted(root_p.glob(pattern)):
        if d.is_dir() and (d / "data.js").is_file():
            out.append(d / "data.js")
    # 根目录自身的 data.js
    if (root_p / "data.js").is_file():
        out.insert(0, root_p / "data.js")
    return out


def _load_report(path: Path) -> dict:
    report_date, meta, items = parse_data_js(str(path))
    ids: set[str] = set()
    for item in items:
        gid = str(_field(item, "goods_id", "") or "").strip()
        if gid:
            ids.add(gid)
    return {
        "path": str(path),
        "folder": path.parent.name,
        "report_date": report_date,
        "meta_count": int(meta.get("count") or len(items)),
        "items_len": len(items),
        "unique_goods": len(ids),
        "goods_ids": ids,
        "meta": meta,
    }


def _summarize(reports: list[dict]) -> dict:
    all_ids: set[str] = set()
    by_date: dict[str, set[str]] = {}
    for r in reports:
        all_ids |= r["goods_ids"]
        d = r["report_date"]
        by_date.setdefault(d, set()).update(r["goods_ids"])
    return {
        "report_count": len(reports),
        "total_rows": sum(r["items_len"] for r in reports),
        "unique_goods_global": len(all_ids),
        "unique_by_date": {d: len(s) for d, s in sorted(by_date.items())},
        "all_ids": all_ids,
    }


def _compare(local: dict, cloud: dict) -> dict:
    la, ca = local["all_ids"], cloud["all_ids"]
    return {
        "local_only": len(la - ca),
        "cloud_only": len(ca - la),
        "overlap": len(la & ca),
        "local_unique": len(la),
        "cloud_unique": len(ca),
        "union_unique": len(la | ca),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="本地报告 vs 上云包 去重比对")
    ap.add_argument(
        "--local-root",
        default=r"D:\每日选品全量数据",
        help="本地每日选品根目录",
    )
    ap.add_argument(
        "--cloud-pack",
        default=os.path.join(CLOUD_ROOT, "server_sync_pack", "historical_reports"),
        help="已打包上云的历史报告目录",
    )
    ap.add_argument(
        "--local-pattern",
        default="*",
        help="扫描子目录 glob，默认全部含 data.js 的目录",
    )
    ap.add_argument("--json-out", default="", help="可选输出 JSON 路径")
    args = ap.parse_args()

    local_files = _scan_root(args.local_root, args.local_pattern)
    cloud_files = _scan_root(args.cloud_pack, "*")

    if not local_files:
        print(f"本地未找到 data.js: {args.local_root}")
        return 1

    local_reports = [_load_report(p) for p in local_files]
    cloud_reports = [_load_report(p) for p in cloud_files] if cloud_files else []

    local_sum = _summarize(local_reports)
    cloud_sum = _summarize(cloud_reports) if cloud_reports else None

    print("=" * 60)
    print("本地报告目录:", args.local_root)
    print("=" * 60)
    print(f"{'文件夹':<22} {'报告日':<12} {'行数':>8} {'唯一ID':>10} {'meta.count':>10}")
    print("-" * 60)
    for r in local_reports:
        mc = r["meta"].get("count", "")
        print(
            f"{r['folder']:<22} {r['report_date']:<12} {r['items_len']:>8,} "
            f"{r['unique_goods']:>10,} {str(mc):>10}"
        )
    print("-" * 60)
    print(f"本地报告份数:     {local_sum['report_count']}")
    print(f"本地总行数:       {local_sum['total_rows']:,}")
    print(f"本地全局唯一ID:   {local_sum['unique_goods_global']:,}  (goods_id 去重)")
    print("按报告日唯一ID:")
    for d, n in local_sum["unique_by_date"].items():
        print(f"  {d}: {n:,}")

    if cloud_sum:
        print()
        print("=" * 60)
        print("已打包上云 (server_sync_pack/historical_reports)")
        print("=" * 60)
        for r in cloud_reports:
            print(
                f"{r['folder']:<22} {r['report_date']:<12} {r['items_len']:>8,} "
                f"{r['unique_goods']:>10,}"
            )
        print("-" * 60)
        print(f"上云报告份数:     {cloud_sum['report_count']}")
        print(f"上云全局唯一ID:   {cloud_sum['unique_goods_global']:,}")

        cmp = _compare(local_sum, cloud_sum)
        print()
        print("=" * 60)
        print("本地 vs 上云包 (goods_id 去重)")
        print("=" * 60)
        print(f"交集(两边都有):   {cmp['overlap']:,}")
        print(f"仅本地有:         {cmp['local_only']:,}")
        print(f"仅上云包有:       {cmp['cloud_only']:,}")
        print(f"合并后全局唯一:   {cmp['union_unique']:,}")

        local_dates = set(local_sum["unique_by_date"])
        cloud_dates = set(cloud_sum["unique_by_date"])
        only_local_dates = sorted(local_dates - cloud_dates)
        only_cloud_dates = sorted(cloud_dates - local_dates)
        if only_local_dates:
            print(f"\n本地有、上云包没有的报告日: {', '.join(only_local_dates)}")
        if only_cloud_dates:
            print(f"上云包有、本地没有的报告日: {', '.join(only_cloud_dates)}")

        # 上云标准包 全量0615-0619 子集对比
        cloud_std = [r for r in cloud_reports if re.match(r"全量06\d{2}", r["folder"])]
        if cloud_std:
            std_ids: set[str] = set()
            for r in cloud_std:
                std_ids |= r["goods_ids"]
            local_std_folders = {r["folder"] for r in local_reports if r["folder"] in {x["folder"] for x in cloud_std}}
            missing_folders = {r["folder"] for r in cloud_std} - local_std_folders
            print(f"\n标准上云目录(全量0615-0619) 唯一ID: {len(std_ids):,}")
            if missing_folders:
                print(f"本地缺少同名文件夹: {', '.join(sorted(missing_folders))}")

    # 监控池入库口径：v1d>0 or actual_v1d>0
    pool_ids: set[str] = set()
    for r in local_reports:
        _, _, items = parse_data_js(r["path"])
        for item in items:
            gid = str(_field(item, "goods_id", "") or "").strip()
            v1d = float(_field(item, "v1d", 0) or 0)
            av1d = float(_field(item, "actual_v1d", 0) or 0)
            if gid and (v1d > 0 or av1d > 0):
                pool_ids.add(gid)
    print()
    print("=" * 60)
    print("监控池口径 (v1d>0 或 actual_v1d>0，跨报告去重)")
    print("=" * 60)
    print(f"唯一商品数: {len(pool_ids):,}  ← 与 PG monitor_goods 冷启动口径一致")

    if args.json_out:
        payload = {
            "local": {
                "reports": [
                    {k: v for k, v in r.items() if k != "goods_ids"}
                    for r in local_reports
                ],
                "summary": {
                    k: v for k, v in local_sum.items() if k != "all_ids"
                },
                "pool_eligible_unique": len(pool_ids),
            },
        }
        if cloud_sum:
            payload["cloud"] = {
                "summary": {k: v for k, v in cloud_sum.items() if k != "all_ids"},
                "compare": cmp,
            }
        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        print(f"\nJSON 已写入: {args.json_out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

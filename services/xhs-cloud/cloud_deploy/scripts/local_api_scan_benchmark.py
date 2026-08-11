#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本地纯 API 压测 — 直连云端 PG，统计采集失败率（不写 drissionpage）。

用法（Windows 本地）:
  cd D:\\vuemonitor\\xhs-cloud
  set XHS_DATABASE_URL=postgresql://user:pass@服务器IP:5432/vuemonitor
  set XHS_CRAWLER_ROOT=D:\\vuemonitor\\xhs-cloud\\cloud_deploy\\crawler_runtime
  python cloud_deploy/scripts/local_api_scan_benchmark.py --limit 200 --dry-run

  写入 PG（与云端 daemon 相同口径，仅 engine=api）:
  python cloud_deploy/scripts/local_api_scan_benchmark.py --limit 500 --write-pg

  从 .env 读配置:
  python cloud_deploy/scripts/local_api_scan_benchmark.py --env-file D:\\path\\cloud.env --limit 100

说明:
  - 仅测试 api 引擎，auto_fallback=False，不会走 drissionpage
  - 默认 --dry-run，只统计不写库；加 --write-pg 才更新 monitor_goods / snapshots
  - 需本机能连上云端 PostgreSQL（安全组放行 5432 或 SSH 隧道）
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUD_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
if CLOUD_ROOT not in sys.path:
    sys.path.insert(0, CLOUD_ROOT)


def _setup_crawler_path() -> str:
    default = os.path.join(CLOUD_ROOT, "cloud_deploy", "crawler_runtime")
    crawler = os.environ.get("XHS_CRAWLER_ROOT", default).strip() or default
    if os.path.isdir(crawler) and crawler not in sys.path:
        sys.path.insert(0, crawler)
    os.environ.setdefault("XHS_ENABLE_PLAYWRIGHT", "0")
    return crawler


def _pick_goods(conn, limit: int, sample: str) -> list[dict]:
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        if sample == "random":
            c.execute(
                """SELECT goods_id, title, last_v1d, last_sold, tier, pool, priority_score
                   FROM monitor_goods
                   WHERE monitor_status IN ('active','idle')
                   ORDER BY RANDOM() LIMIT %s""",
                (limit,),
            )
        elif sample == "low_sold":
            c.execute(
                """SELECT goods_id, title, last_v1d, last_sold, tier, pool, priority_score
                   FROM monitor_goods
                   WHERE monitor_status IN ('active','idle')
                     AND COALESCE(last_sold,0) BETWEEN 10 AND 500
                   ORDER BY RANDOM() LIMIT %s""",
                (limit,),
            )
        elif sample == "high_v1d":
            c.execute(
                """SELECT goods_id, title, last_v1d, last_sold, tier, pool, priority_score
                   FROM monitor_goods
                   WHERE monitor_status IN ('active','idle')
                   ORDER BY last_v1d DESC NULLS LAST
                   LIMIT %s""",
                (limit,),
            )
        else:
            c.execute(
                """SELECT goods_id, title, last_v1d, last_sold, tier, pool, priority_score
                   FROM monitor_goods
                   WHERE monitor_status IN ('active','idle')
                   ORDER BY priority_score DESC NULLS LAST, last_v1d DESC NULLS LAST
                   LIMIT %s""",
                (limit,),
            )
        cols = (
            "goods_id",
            "title",
            "last_v1d",
            "last_sold",
            "tier",
            "pool",
            "priority_score",
        )
        return [dict(zip(cols, row)) for row in c.fetchall()]


def _fetch_one(goods: dict, fetcher) -> dict:
    gid = str(goods["goods_id"])
    t0 = time.time()
    try:
        detail, status, meta = fetcher(
            gid,
            engine="api",
            fallback_chain=("api",),
            auto_fallback=False,
        )
    except Exception as exc:
        return {
            "goods_id": gid,
            "status": "fail",
            "sold": None,
            "message": str(exc)[:200],
            "engine": "api",
            "ms": int((time.time() - t0) * 1000),
        }
    meta = dict(meta or {})
    sold = None
    if status == "ok" and detail:
        sold = int(detail.get("real_sales") or detail.get("product_sales") or 0)
    return {
        "goods_id": gid,
        "status": status,
        "sold": sold,
        "message": str(meta.get("message") or "")[:200],
        "engine": str(meta.get("engine") or "api"),
        "ms": int((time.time() - t0) * 1000),
    }


def _write_pg(conn, row: dict) -> None:
    from cloud_deploy.cloud_api.sync_service import mark_scan_result, record_cloud_scan

    gid = row["goods_id"]
    status = row["status"]
    meta = {"won_engine": "api", "engine": "api", "message": row.get("message", "")}
    if status == "ok" and row.get("sold") is not None:
        record_cloud_scan(conn, gid, int(row["sold"]), data_source="local_api_benchmark")
        mark_scan_result(conn, gid, "ok", engine="api")
    elif status == "frozen":
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                "UPDATE monitor_goods SET monitor_status='delisted', updated_at=NOW() WHERE goods_id=%s",
                (gid,),
            )
        conn.commit()
        mark_scan_result(conn, gid, "frozen", engine="api")
    else:
        mark_scan_result(conn, gid, status if status in ("risk", "fail") else "fail", engine="api")


def run_benchmark(args) -> dict:
    from cloud_deploy.scripts.bootstrap_env import bootstrap

    if args.env_file:
        bootstrap(args.env_file)
    else:
        bootstrap()

    if args.database_url:
        os.environ["XHS_DATABASE_URL"] = args.database_url

    db_url = os.environ.get("XHS_DATABASE_URL", "")
    if not db_url.startswith("postgres"):
        raise SystemExit("需要 XHS_DATABASE_URL（postgresql://...）")

    crawler = _setup_crawler_path()
    try:
        from xhs_full_sold_fetch import fetch_sold_detail
    except ImportError as exc:
        raise SystemExit(
            f"无法导入 xhs_full_sold_fetch，请设置 XHS_CRAWLER_ROOT\n"
            f"  当前: {crawler}\n  错误: {exc}"
        ) from exc

    from cloud_deploy.cloud_api.database_pg import _conn, init_db

    init_db()
    conn = _conn()
    try:
        batch = _pick_goods(conn, args.limit, args.sample)
        if not batch:
            raise SystemExit("监控池无商品")
    finally:
        conn.close()

    print(f"[benchmark] 模式=纯api 样本={args.sample} 数量={len(batch)} 并发={args.concurrency}")
    print(f"[benchmark] PG={db_url.split('@')[-1] if '@' in db_url else db_url}")
    print(f"[benchmark] 爬虫={crawler}  写PG={'是' if args.write_pg else '否(dry-run)'}")
    print("")

    results: list[dict] = []
    t_start = time.time()

    with ThreadPoolExecutor(max_workers=max(1, args.concurrency)) as pool:
        futs = {pool.submit(_fetch_one, g, fetch_sold_detail): g for g in batch}
        done = 0
        for fut in as_completed(futs):
            row = fut.result()
            results.append(row)
            done += 1
            if done % max(1, len(batch) // 10) == 0 or done == len(batch):
                print(f"  进度 {done}/{len(batch)} ...", flush=True)

    wall = time.time() - t_start
    status_cnt = Counter(r["status"] for r in results)
    msg_cnt = Counter(r["message"] or "(empty)" for r in results if r["status"] != "ok")
    ok = status_cnt.get("ok", 0)
    total = len(results)
    ok_ms = [r["ms"] for r in results if r["status"] == "ok"]
    fail_ms = [r["ms"] for r in results if r["status"] != "ok"]

    summary = {
        "mode": "api_only",
        "sample": args.sample,
        "total": total,
        "ok": ok,
        "fail": status_cnt.get("fail", 0),
        "risk": status_cnt.get("risk", 0),
        "frozen": status_cnt.get("frozen", 0),
        "no_store": status_cnt.get("no_store", 0),
        "success_rate_pct": round(ok / total * 100, 2) if total else 0,
        "wall_sec": round(wall, 1),
        "throughput_per_hour": round(ok / wall * 3600) if wall > 0 else 0,
        "avg_ms_ok": round(sum(ok_ms) / len(ok_ms)) if ok_ms else 0,
        "avg_ms_fail": round(sum(fail_ms) / len(fail_ms)) if fail_ms else 0,
        "top_fail_messages": msg_cnt.most_common(10),
        "write_pg": args.write_pg,
    }

    if args.write_pg:
        conn = _conn()
        try:
            for r in results:
                _write_pg(conn, r)
        finally:
            conn.close()
        summary["pg_written"] = total

    print("")
    print("=" * 56)
    print("纯 API 压测结果")
    print("=" * 56)
    print(f"  总数:     {total}")
    print(f"  成功 ok:  {ok}  ({summary['success_rate_pct']}%)")
    print(f"  失败:     {summary['fail']}")
    print(f"  风控:     {summary['risk']}")
    print(f"  下架:     {summary['frozen']}")
    print(f"  无店铺:   {summary['no_store']}")
    print(f"  耗时:     {summary['wall_sec']}s")
    print(f"  成功吞吐: ~{summary['throughput_per_hour']}/小时 (按当前并发)")
    print(f"  平均耗时: ok={summary['avg_ms_ok']}ms  fail={summary['avg_ms_fail']}ms")
    if msg_cnt:
        print("  失败原因 TOP:")
        for msg, n in msg_cnt.most_common(5):
            print(f"    [{n}] {msg[:80]}")
    print("=" * 56)

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump({"summary": summary, "results": results}, f, ensure_ascii=False, indent=2)
        print(f"JSON: {args.json_out}")

    return summary


def main() -> int:
    ap = argparse.ArgumentParser(description="本地纯 API 压测云端 PG 监控池")
    ap.add_argument("--env-file", default="", help=".env 路径（含 XHS_DATABASE_URL）")
    ap.add_argument("--database-url", default="", help="覆盖 PG 连接串")
    ap.add_argument("--limit", type=int, default=200, help="测试商品数")
    ap.add_argument("--concurrency", type=int, default=3, help="并发数")
    ap.add_argument(
        "--sample",
        choices=("priority", "random", "high_v1d", "low_sold"),
        default="random",
        help="取样方式",
    )
    ap.add_argument("--write-pg", action="store_true", help="写入 PG（默认仅统计）")
    ap.add_argument("--dry-run", action="store_true", help="显式不写 PG（默认）")
    ap.add_argument("--json-out", default="", help="保存详细结果 JSON")
    args = ap.parse_args()
    if args.dry_run:
        args.write_pg = False
    run_benchmark(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本地 Playwright 补采云端 risk 商品 → 回写 PG（服务器不跑浏览器）。

场景：云端 2G 小机只跑 API daemon（XHS_ENABLE_PLAYWRIGHT=0）；risk 由本地 PC
开 Playwright 采集，采完 --write-pg 直连 PG 回传，写库口径与 daemon 一致。

用法（Windows 本地，需能连云端 PG）:
  cd D:\\vuemonitor\\xhs-cloud
  set XHS_DATABASE_URL=postgresql://user:pass@服务器IP:5432/vuemonitor
  set XHS_CRAWLER_ROOT=D:\\vuemonitor\\xhs-cloud\\cloud_deploy\\crawler_runtime
  set XHS_ENABLE_PLAYWRIGHT=1
  pip install playwright
  playwright install chromium

  试跑 50 条（不写库）:
  python cloud_deploy/scripts/local_risk_playwright_scan.py --limit 50

  并发 5 写回 PG:
  python cloud_deploy/scripts/local_risk_playwright_scan.py --limit 2000 --concurrency 5 --write-pg

  从 .env 读配置:
  python cloud_deploy/scripts/local_risk_playwright_scan.py --env-file D:\\path\\.env --write-pg

说明:
  - 仅处理今日 last_scan_status=risk 的商品
  - 使用 playwright 引擎（多进程并发，每进程独立浏览器）
  - --write-pg 时调用 record_cloud_scan，与云端 daemon 同口径
  - 与云端 daemon 可同时跑（补不同商品）；避免两边扫同一 goods_id
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import date

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUD_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
if CLOUD_ROOT not in sys.path:
    sys.path.insert(0, CLOUD_ROOT)


def _worker_init(crawler: str, cloud_root: str) -> None:
    if cloud_root not in sys.path:
        sys.path.insert(0, cloud_root)
    if crawler and os.path.isdir(crawler) and crawler not in sys.path:
        sys.path.insert(0, crawler)
    os.environ["XHS_ENABLE_PLAYWRIGHT"] = "1"


def _worker_fetch(payload: tuple[str, str]) -> dict:
    goods_id, crawler = payload
    cloud_root = os.environ.get("_RISK_PW_CLOUD_ROOT", CLOUD_ROOT)
    _worker_init(crawler, cloud_root)
    from xhs_full_sold_fetch import fetch_sold_detail

    t0 = time.time()
    gid = str(goods_id)
    try:
        detail, status, meta = fetch_sold_detail(
            gid,
            engine="playwright",
            fallback_chain=("playwright",),
            auto_fallback=False,
        )
    except Exception as exc:
        return {
            "goods_id": gid,
            "status": "fail",
            "sold": None,
            "message": str(exc)[:200],
            "engine": "playwright",
            "ms": int((time.time() - t0) * 1000),
            "detail": None,
        }
    meta = dict(meta or {})
    sold = None
    detail_out = None
    if status == "ok" and detail:
        sold = int(detail.get("real_sales") or detail.get("product_sales") or 0)
        detail_out = detail
    return {
        "goods_id": gid,
        "status": status,
        "sold": sold,
        "message": str(meta.get("message") or "")[:200],
        "engine": str(meta.get("won_engine") or meta.get("engine") or "playwright"),
        "ms": int((time.time() - t0) * 1000),
        "detail": detail_out,
    }


def _pick_risk_goods(conn, limit: int, scan_date: str) -> list[dict]:
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            """SELECT goods_id, title
               FROM monitor_goods
               WHERE monitor_status IN ('active', 'idle')
                 AND last_scan_status = 'risk'
                 AND last_scan_at::date = %s::date
               ORDER BY priority_score DESC NULLS LAST, last_v1d DESC NULLS LAST
               LIMIT %s""",
            (scan_date, limit),
        )
        return [{"goods_id": str(r[0]), "title": r[1] or ""} for r in c.fetchall()]


def _write_pg(conn, row: dict) -> None:
    from cloud_deploy.cloud_api.sync_service import mark_scan_result, record_cloud_scan

    gid = row["goods_id"]
    status = row["status"]
    engine = str(row.get("engine") or "playwright")[:32]
    detail = row.get("detail") or {}
    if status == "ok" and row.get("sold") is not None:
        deal_price = None
        try:
            deal_price = float(detail.get("deal_price") or detail.get("product_price") or 0)
        except (TypeError, ValueError):
            deal_price = None
        record_cloud_scan(
            conn,
            gid,
            int(row["sold"]),
            data_source="local_playwright",
            deal_price=deal_price,
            detail=detail if isinstance(detail, dict) else None,
        )
        mark_scan_result(conn, gid, "ok", engine=engine)
    elif status == "frozen":
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                "UPDATE monitor_goods SET monitor_status='delisted', updated_at=NOW() WHERE goods_id=%s",
                (gid,),
            )
        conn.commit()
        mark_scan_result(conn, gid, "frozen", engine=engine)
    else:
        mark_scan_result(conn, gid, status if status in ("risk", "fail") else "fail", engine=engine)


def run_scan(args) -> dict:
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

    crawler = os.environ.get(
        "XHS_CRAWLER_ROOT",
        os.path.join(CLOUD_ROOT, "cloud_deploy", "crawler_runtime"),
    ).strip()
    scan_date = args.date or date.today().isoformat()

    from cloud_deploy.cloud_api.database_pg import _conn, init_db

    init_db()
    conn = _conn()
    try:
        batch = _pick_risk_goods(conn, args.limit, scan_date)
    finally:
        conn.close()

    if not batch:
        print(f"[risk-pw] 无 risk 商品（date={scan_date}）")
        return {"total": 0, "ok": 0}

    print(
        f"[risk-pw] date={scan_date} 数量={len(batch)} "
        f"并发={args.concurrency} 写PG={'是' if args.write_pg else '否'}"
    )
    print(f"[risk-pw] PG={db_url.split('@')[-1] if '@' in db_url else db_url}")
    print(f"[risk-pw] 爬虫={crawler}")
    print("")

    os.environ["_RISK_PW_CLOUD_ROOT"] = CLOUD_ROOT
    results: list[dict] = []
    t_start = time.time()
    work = [(g["goods_id"], crawler) for g in batch]

    with ProcessPoolExecutor(
        max_workers=max(1, args.concurrency),
        initializer=_worker_init,
        initargs=(crawler, CLOUD_ROOT),
    ) as pool:
        futs = {pool.submit(_worker_fetch, item): item[0] for item in work}
        done = 0
        for fut in as_completed(futs):
            row = fut.result()
            results.append(row)
            done += 1
            if done % max(1, len(batch) // 20) == 0 or done == len(batch):
                ok_so_far = sum(1 for r in results if r["status"] == "ok")
                print(f"  进度 {done}/{len(batch)} ok={ok_so_far} ...", flush=True)

    wall = time.time() - t_start
    status_cnt = Counter(r["status"] for r in results)
    ok = status_cnt.get("ok", 0)
    total = len(results)

    if args.write_pg:
        conn = _conn()
        try:
            for row in results:
                _write_pg(conn, row)
        finally:
            conn.close()
        print("[risk-pw] 已写回 PG")

    print("")
    print(f"  合计:   {total}")
    print(f"  成功:   {ok} ({ok/total*100:.1f}%)" if total else "  成功:   0")
    print(f"  风控:   {status_cnt.get('risk', 0)}")
    print(f"  失败:   {status_cnt.get('fail', 0)}")
    print(f"  下架:   {status_cnt.get('frozen', 0)}")
    print(f"  耗时:   {wall:.1f}s")
    if ok:
        ok_ms = [r["ms"] for r in results if r["status"] == "ok"]
        print(f"  成功均耗: {sum(ok_ms)/len(ok_ms):.0f}ms/条")

    if args.json_out:
        import json

        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"  明细:   {args.json_out}")

    return {"total": total, "ok": ok, "wall_s": wall}


def main():
    ap = argparse.ArgumentParser(description="本地 Playwright 补采云端 risk 商品")
    ap.add_argument("--limit", type=int, default=500, help="最多处理条数")
    ap.add_argument("--concurrency", type=int, default=5, help="进程并发（每进程独立浏览器）")
    ap.add_argument("--date", default="", help="补采日期 YYYY-MM-DD，默认今天")
    ap.add_argument("--write-pg", action="store_true", help="写回 PG")
    ap.add_argument("--env-file", default="", help=".env 路径")
    ap.add_argument("--database-url", default="", help="覆盖 XHS_DATABASE_URL")
    ap.add_argument("--json-out", default="", help="保存明细 JSON")
    args = ap.parse_args()
    run_scan(args)


if __name__ == "__main__":
    main()

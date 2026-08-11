#!/usr/bin/env python3
"""单商品多引擎探测 + 今日扫描状态分布（排查 ok=0 fail=200）。"""
from __future__ import annotations

import os
import sys

ROOT = os.environ.get("XHS_CLOUD_ROOT", "/opt/xhs-cloud")
sys.path.insert(0, ROOT)


def main() -> int:
    from cloud_deploy.scripts.bootstrap_env import bootstrap

    bootstrap()
    crawler = os.environ.get("XHS_CRAWLER_ROOT", "/opt/xhs/crawler")
    if crawler and os.path.isdir(crawler) and crawler not in sys.path:
        sys.path.insert(0, crawler)

    from cloud_deploy.cloud_api.database_pg import _conn

    conn = _conn()
    goods_id = None
    try:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """SELECT last_scan_status, COUNT(*)
                   FROM monitor_goods
                   WHERE monitor_status IN ('active','idle')
                     AND updated_at::date = CURRENT_DATE
                   GROUP BY 1 ORDER BY 2 DESC"""
            )
            print("=== 今日 monitor_goods 扫描状态（按 updated_at）===")
            for st, n in c.fetchall():
                print(f"  {st or '(null)'}: {n:,}")

            c.execute(
                """SELECT COUNT(*) FROM monitor_goods
                   WHERE monitor_status IN ('active','idle')
                     AND last_scan_status='ok'
                     AND last_scan_at::date = CURRENT_DATE"""
            )
            ok_today = int(c.fetchone()[0] or 0)
            c.execute(
                """SELECT COUNT(*) FROM monitor_goods
                   WHERE monitor_status IN ('active','idle')"""
            )
            pool = int(c.fetchone()[0] or 0)
            print(f"\n今日成功(ok)已扫: {ok_today:,} / 池 {pool:,}")

            c.execute(
                """SELECT goods_id FROM monitor_goods
                   WHERE monitor_status IN ('active','idle')
                     AND (
                       last_scan_at IS NULL
                       OR last_scan_at::date < CURRENT_DATE
                     )
                   ORDER BY last_v1d DESC NULLS LAST LIMIT 1"""
            )
            row = c.fetchone()
            goods_id = str(row[0]) if row else None
    finally:
        conn.close()

    if not goods_id:
        print("监控池为空")
        return 1

    print(f"\n=== 探测商品 {goods_id}（今日未尝试） ===")
    print(f"XHS_CRAWLER_ROOT={crawler}")

    try:
        from xhs_web_fallback_module import load_cookie_str
    except ImportError:
        load_cookie_str = lambda: os.environ.get("XHS_COOKIE", "").strip()  # noqa: E731

    cookie_str = load_cookie_str()
    if cookie_str:
        print(f"cookie: 已加载 ({len(cookie_str)} 字符, web_session={'web_session=' in cookie_str})")
    else:
        print("cookie: 未配置（公开 H5 不需要；dp 预热自动拿匿名 cookie）")

    try:
        from xhs_full_sold_fetch import fetch_sold_detail, get_engine_chain, probe_engines, warmup_drissionpage
    except ImportError as exc:
        print(f"✗ 无法导入 xhs_full_sold_fetch: {exc}")
        return 2

    warmup_drissionpage(print)
    print("\n--- 单引擎探测 ---")
    for eng in get_engine_chain():
        detail, status, meta = fetch_sold_detail(
            goods_id, engine=eng, fallback_chain=(eng,), auto_fallback=False
        )
        sold = (detail or {}).get("real_sales", 0) if status == "ok" else 0
        msg = (meta or {}).get("message", "")
        print(f"  {eng}: status={status} sold={sold} msg={msg[:120]}")

    alive = probe_engines(goods_id, log_func=print, min_ok=1)
    print(f"\n可用引擎: {alive or '(无)'}")

    detail, status, meta = fetch_sold_detail(goods_id, engine="drissionpage", auto_fallback=True)
    sold = (detail or {}).get("real_sales", 0) if status == "ok" else 0
    print(f"\n自动降级链(从dp): status={status} sold={sold}")
    print(f"meta={meta}")

    from cloud_deploy.daemon.cloud_engine import build_fallback_chain

    chain = build_fallback_chain("drissionpage", {})
    detail2, status2, meta2 = fetch_sold_detail(
        goods_id, engine="drissionpage", fallback_chain=chain, auto_fallback=True
    )
    sold2 = (detail2 or {}).get("real_sales", 0) if status2 == "ok" else 0
    print(f"\n显式链 {chain}: status={status2} sold={sold2} tried={(meta2 or {}).get('tried')}")
    return 0 if status2 == "ok" else 3


if __name__ == "__main__":
    raise SystemExit(main())

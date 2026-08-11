#!/usr/bin/env python3
# -*- coding: utf-8
"""
纯 API 极限压测 — 直连 PG，无 drissionpage 降级，可跑 24h。

与 xhs-daemon 区别:
  - 仅 engine=api，auto_fallback=False
  - 可调 batch / 并发 / 轮间冷却，用于测失败率与日吞吐上限

服务器用法（先停生产 daemon 避免抢锁）:
  sudo systemctl stop xhs-daemon
  set -a && source /opt/xhs-cloud/.env && set +a
  export PYTHONPATH=/opt/xhs-cloud
  export XHS_CRAWLER_ROOT=/opt/xhs/crawler
  nohup /opt/xhs-cloud/venv/bin/python \\
    /opt/xhs-cloud/cloud_deploy/scripts/api_stress_scan.py \\
    --duration-hours 24 --batch-size 800 --concurrency 3 --cooldown 30 \\
    --write-pg --skip-today \\
    > /opt/xhs-cloud/data/api_stress.log 2>&1 &

  tail -f /opt/xhs-cloud/data/api_stress.log

恢复生产:
  sudo systemctl start xhs-daemon
"""
from __future__ import annotations

import argparse
import json
import os
import signal
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUD_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
if CLOUD_ROOT not in sys.path:
    sys.path.insert(0, CLOUD_ROOT)


class ApiStressRunner:
    def __init__(self, args):
        self.args = args
        self._stop = False
        self.round = 0
        self.t0 = time.time()
        self.totals = Counter()
        self.msg_fail = Counter()

    def _setup(self):
        from cloud_deploy.scripts.bootstrap_env import bootstrap

        bootstrap()
        crawler = os.environ.get("XHS_CRAWLER_ROOT", "/opt/xhs/crawler")
        if crawler and os.path.isdir(crawler) and crawler not in sys.path:
            sys.path.insert(0, crawler)
        os.environ["XHS_ENABLE_PLAYWRIGHT"] = "0"

        if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
            raise SystemExit("需要 XHS_DATABASE_URL")

        from xhs_full_sold_fetch import fetch_sold_detail

        self.fetcher = fetch_sold_detail
        from cloud_deploy.cloud_api.database_pg import init_db

        init_db()

    def _pick_batch(self) -> list[dict]:
        from cloud_deploy.cloud_api.database_pg import _conn

        conn = _conn()
        try:
            with conn.cursor() as c:
                c.execute("SET search_path TO xhs_monitor, public")
                if self.args.skip_today:
                    c.execute(
                        """SELECT goods_id, title, last_v1d, last_sold
                           FROM monitor_goods
                           WHERE monitor_status IN ('active','idle')
                           ORDER BY
                             NOT (
                               last_scan_status = 'ok'
                               AND last_scan_at IS NOT NULL
                               AND last_scan_at::date = CURRENT_DATE
                             ) DESC,
                             priority_score DESC NULLS LAST,
                             last_v1d DESC NULLS LAST
                           LIMIT %s""",
                        (self.args.batch_size,),
                    )
                else:
                    c.execute(
                        """SELECT goods_id, title, last_v1d, last_sold
                           FROM monitor_goods
                           WHERE monitor_status IN ('active','idle')
                           ORDER BY priority_score DESC NULLS LAST, last_v1d DESC NULLS LAST
                           LIMIT %s""",
                        (self.args.batch_size,),
                    )
                cols = ("goods_id", "title", "last_v1d", "last_sold")
                return [dict(zip(cols, row)) for row in c.fetchall()]
        finally:
            conn.close()

    def _fetch_one(self, goods: dict) -> dict:
        gid = str(goods["goods_id"])
        t0 = time.time()
        try:
            detail, status, meta = self.fetcher(
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
            "ms": int((time.time() - t0) * 1000),
        }

    def _write_pg(self, row: dict) -> None:
        from cloud_deploy.cloud_api.database_pg import _conn
        from cloud_deploy.cloud_api.sync_service import mark_scan_result, record_cloud_scan

        conn = _conn()
        try:
            gid = row["goods_id"]
            status = row["status"]
            if status == "ok" and row.get("sold") is not None:
                record_cloud_scan(
                    conn, gid, int(row["sold"]), data_source="api_stress"
                )
                mark_scan_result(conn, gid, "ok", engine="api")
            elif status == "frozen":
                with conn.cursor() as c:
                    c.execute("SET search_path TO xhs_monitor, public")
                    c.execute(
                        """UPDATE monitor_goods SET monitor_status='delisted', updated_at=NOW()
                           WHERE goods_id=%s""",
                        (gid,),
                    )
                conn.commit()
                mark_scan_result(conn, gid, "frozen", engine="api")
            else:
                mark_scan_result(
                    conn,
                    gid,
                    status if status in ("risk", "fail") else "fail",
                    engine="api",
                )
        finally:
            conn.close()

    def _record_batch_stats(self, batch_n: int, ok: int, fail: int, risk: int, frozen: int, wall_ms: int):
        from cloud_deploy.cloud_api.database_pg import _conn
        from cloud_deploy.cloud_api.sync_service import record_daemon_batch_stats

        note = f"API-STRESS R{self.round} engines={{'api': {ok}}}"
        conn = _conn()
        try:
            record_daemon_batch_stats(conn, batch_n, ok, fail, risk, frozen, wall_ms, note)
        finally:
            conn.close()

    def run_once(self) -> dict | None:
        batch = self._pick_batch()
        if not batch:
            self._log("监控池无候选，休眠 300s")
            time.sleep(300)
            return None

        self.round += 1
        t0 = time.time()
        results: list[dict] = []
        with ThreadPoolExecutor(max_workers=self.args.concurrency) as pool:
            futs = [pool.submit(self._fetch_one, g) for g in batch]
            for fut in as_completed(futs):
                if self._stop:
                    break
                results.append(fut.result())

        cnt = Counter(r["status"] for r in results)
        ok = cnt.get("ok", 0)
        fail = cnt.get("fail", 0)
        risk = cnt.get("risk", 0)
        frozen = cnt.get("frozen", 0)
        wall_ms = int((time.time() - t0) * 1000)

        for r in results:
            if r["status"] != "ok" and r.get("message"):
                self.msg_fail[r["message"]] += 1

        if self.args.write_pg:
            for r in results:
                self._write_pg(r)

        self.totals["batch"] += 1
        self.totals["goods"] += len(results)
        self.totals["ok"] += ok
        self.totals["fail"] += fail
        self.totals["risk"] += risk
        self.totals["frozen"] += frozen

        if self.args.write_pg:
            self._record_batch_stats(len(batch), ok, fail, risk, frozen, wall_ms)

        elapsed_h = (time.time() - self.t0) / 3600
        ok_per_h = self.totals["ok"] / elapsed_h if elapsed_h > 0.01 else 0
        rate = ok / len(results) * 100 if results else 0

        self._log(
            f"R{self.round} 批={len(batch)} ok={ok} fail={fail} risk={risk} frozen={frozen} "
            f"{wall_ms}ms 本批成功率={rate:.1f}% | 累计ok={self.totals['ok']:,} "
            f"~{ok_per_h:.0f}/h 运行{elapsed_h:.1f}h"
        )
        return {"ok": ok, "fail": fail, "batch": len(batch), "wall_ms": wall_ms}

    def _log(self, msg: str):
        line = f"[{datetime.now():%Y-%m-%d %H:%M:%S}] [api-stress] {msg}"
        print(line, flush=True)

    def _print_summary(self):
        elapsed = time.time() - self.t0
        h = elapsed / 3600
        goods = self.totals["goods"]
        ok = self.totals["ok"]
        self._log("=" * 50)
        self._log(
            f"结束 轮数={self.totals['batch']} 商品={goods:,} ok={ok:,} "
            f"fail={self.totals['fail']:,} risk={self.totals['risk']:,} "
            f"成功率={ok/goods*100:.1f}% 运行{h:.2f}h ~{ok/h:.0f}ok/h"
        )
        if self.msg_fail:
            self._log("失败原因 TOP5:")
            for msg, n in self.msg_fail.most_common(5):
                self._log(f"  [{n}] {msg[:100]}")

    def run(self):
        self._setup()
        deadline = self.t0 + self.args.duration_hours * 3600
        self._log(
            f"启动 纯API batch={self.args.batch_size} conc={self.args.concurrency} "
            f"cooldown={self.args.cooldown}s 时长={self.args.duration_hours}h "
            f"写PG={'是' if self.args.write_pg else '否'}"
        )

        def _sig(_s, _f):
            self._log("收到停止信号")
            self._stop = True

        signal.signal(signal.SIGINT, _sig)
        signal.signal(signal.SIGTERM, _sig)

        while not self._stop and time.time() < deadline:
            self.run_once()
            if self._stop or time.time() >= deadline:
                break
            for _ in range(self.args.cooldown):
                if self._stop:
                    break
                time.sleep(1)

        self._print_summary()
        if self.args.json_out:
            payload = {
                "totals": dict(self.totals),
                "elapsed_hours": round((time.time() - self.t0) / 3600, 2),
                "top_fail_messages": self.msg_fail.most_common(20),
                "config": vars(self.args),
            }
            with open(self.args.json_out, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            self._log(f"JSON: {self.args.json_out}")


def main() -> int:
    ap = argparse.ArgumentParser(description="纯 API 24h 极限压测（服务器）")
    ap.add_argument("--duration-hours", type=float, default=24.0)
    ap.add_argument("--batch-size", type=int, default=800)
    ap.add_argument("--concurrency", type=int, default=3)
    ap.add_argument("--cooldown", type=int, default=30, help="每批完成后休眠秒数")
    ap.add_argument("--write-pg", action="store_true", help="写入 PG + daemon_scan_stats")
    ap.add_argument("--skip-today", action="store_true", default=True)
    ap.add_argument("--no-skip-today", action="store_true")
    ap.add_argument("--json-out", default="")
    args = ap.parse_args()
    if args.no_skip_today:
        args.skip_today = False
    ApiStressRunner(args).run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

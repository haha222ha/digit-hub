# -*- coding: utf-8
"""
xhs-cloud 端到端测试（本地 / CI 可跑）。

用法:
  cd E:\\vuemonitor\\xhs-cloud
  set XHS_CLOUD_ROOT=%CD%
  set XHS_ENV_FILE=%CD%\\.env.test
  python cloud_deploy/tests/e2e_test.py

有 PG 时设置:
  set E2E_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/e2e_xhs
"""
from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

PASS = 0
FAIL = 0
SKIP = 0
ERRORS: list[str] = []


def ok(name: str) -> None:
    global PASS
    PASS += 1
    print(f"  [OK] {name}")


def fail(name: str, detail: str) -> None:
    global FAIL
    FAIL += 1
    msg = f"{name}: {detail}"
    ERRORS.append(msg)
    print(f"  [FAIL] {msg}")


def skip(name: str, reason: str) -> None:
    global SKIP
    SKIP += 1
    print(f"  [SKIP] {name} ({reason})")


def assert_true(cond: bool, name: str, detail: str = "") -> None:
    if cond:
        ok(name)
    else:
        fail(name, detail or "assertion failed")


def _sample_items() -> list:
    return [
        [
            "g001", "测试商品A实体", 99.0, 1000, 1.0, 3.0, 12.0, 15.0,
            1.2, 1.5, 0.01, 0.015, 0.0, 0.0, "WATCH", "2026-06-01 10:00:00",
            "s001", "测试店", "2026-05-01 10:00:00", 5000, 1000, 4.8, 4.9,
            "", 0, 24.0, "2026-06-01 10:00:00", 0,
        ],
        [
            "g002", "测试商品B虚拟", 49.0, 500, 0.5, 2.0, 3.0, 4.0,
            0.6, 0.8, 0.02, 0.02, 0.0, 0.0, "NEW", "2026-06-02 10:00:00",
            "s002", "虚拟店", "2026-05-15 10:00:00", 2000, 500, 4.5, 4.6,
            "", 1, 24.0, "2026-06-02 10:00:00", 0,
        ],
        [
            "g003", "将被删除的商品", 10.0, 100, 0.0, 0.0, 0.0, 0.0,
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0, "WATCH", "", "s003", "店", "",
            0, 0, 0.0, 0.0, "", 0, 24.0, "", 0,
        ],
    ]


def _write_data_js(path: Path, report_date: str, items: list | None = None, scope: str = "daily") -> None:
    items = items if items is not None else _sample_items()
    payload = {
        "meta": {
            "date": report_date,
            "scope": scope,
            "count": len(items),
            "physical_v1d": 1,
            "virtual_v1d": 1,
            "source": "e2e_test",
        },
        "columns": [],
        "items": items,
        "charts": {},
    }
    path.write_text(
        "var REPORT_DATA = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )


def setup_test_env(work: Path) -> None:
    env = {
        "XHS_CLOUD_ROOT": str(ROOT),
        "XHS_ENV_FILE": str(work / ".env.test"),
        "XHS_DATA_DIR": str(work / "data"),
        "XHS_REPORT_INCOMING_DIR": str(work / "data" / "incoming"),
        "XHS_REPORT_ARCHIVE_DIR": str(work / "data" / "report_archives"),
        "XHS_REPORT_OUTPUT_DIR": str(work / "data" / "reports"),
        "XHS_HTML_TEMPLATE": str(ROOT / "cloud_deploy" / "assets" / "index_with_gr.html"),
        "XHS_CLOUD_HOST": "127.0.0.1",
        "XHS_CLOUD_PORT": "8765",
        "XHS_CLOUD_SYNC_KEY": "e2e-sync-key",
        "XHS_CLOUD_JWT_SECRET": "e2e-jwt-secret",
        "XHS_CLOUD_ADMIN_USER": "admin",
        "XHS_CLOUD_ADMIN_PASS": "admin123",
        "XHS_CLOUD_API_DB": str(work / "data" / "cloud_api.db"),
    }
    lines = [f"{k}={v}" for k, v in env.items()]
    pg_url = os.environ.get("E2E_DATABASE_URL", "")
    if pg_url:
        lines.append(f"XHS_DATABASE_URL={pg_url}")
    (work / ".env.test").write_text("\n".join(lines) + "\n", encoding="utf-8")
    for k, v in env.items():
        os.environ[k] = v
    if pg_url:
        os.environ["XHS_DATABASE_URL"] = pg_url
    else:
        os.environ.pop("XHS_DATABASE_URL", None)


def test_unit_logic() -> None:
    print("\n[0] unit logic (no PG)")
    from cloud_deploy.reporting.pg_reader import dedup_by_title, passes_threshold, sold_row_to_item
    from cloud_deploy.reporting.constants import DEFAULT_MIN_V1D, DEFAULT_MIN_ACTUAL

    item_ok = [
        "g1", "标题A", 10.0, 100,
        0.0, 0.0,
        6.0, 7.0,
        0.0, 0.0,
        0.0, 0.0,
        0.0, 0.0,
        "WATCH", "", "", "",
        "", 0, 0, 0.0, 0.0,
        "", 0, 0.0, "", 0,
    ]
    assert_true(passes_threshold(item_ok), "passes_threshold normal item")
    item_dirty = list(item_ok)
    item_dirty[3] = 300000
    assert_true(not passes_threshold(item_dirty), "passes_threshold rejects high sold")

    dup = dedup_by_title([item_ok, list(item_ok)])
    assert_true(len(dup) == 1, "dedup_by_title collapses same title")

    no_title = list(item_ok)
    no_title[1] = ""
    dup2 = dedup_by_title([no_title, item_ok])
    assert_true(len(dup2) == 1, "dedup drops empty title like gen_report")

    r_delta = sold_row_to_item({"goods_id": "g1", "sold_num": 100, "delta": 12}, None)
    assert_true(r_delta and r_delta[6] == 12.0, "sold_row delta fallback")

    r_prev = sold_row_to_item({"goods_id": "g1", "sold_num": 100, "delta": 0}, 88)
    assert_true(r_prev is None, "sold_row skip when delta=0 (no sold-prev fallback)")

    r_skip = sold_row_to_item({"goods_id": "g1", "sold_num": 100, "delta": 0}, None)
    assert_true(r_skip is None, "sold_row skip no baseline")

    r_price = sold_row_to_item(
        {"goods_id": "g1", "sold_num": 100, "delta": 12, "deal_price": 29.9, "title": "t"},
        None,
    )
    assert_true(r_price and r_price[2] == 29.9, "sold_row deal_price")

    from cloud_deploy.reporting.data_js_builder import build_report_payload

    payload = build_report_payload([], "2026-06-21", pool_stats={"active_goods": 100, "total_goods": 200})
    assert_true(payload.get("field_guide"), "field_guide in payload")
    assert_true(payload["meta"].get("active_goods") == 100, "active_goods meta")

    # threshold boundary: v1d must be > 5 not >=
    border = list(item_ok)
    border[7] = 5.0
    border[6] = 4.0
    assert_true(not passes_threshold(border), "v1d=5 not pass (need >5)")
    border[6] = 5.0
    assert_true(passes_threshold(border), "actual>=5 pass")


def test_real_report_parse() -> None:
    print("\n[1b] real data.js parse")
    from cloud_deploy.cloud_api.sync_service import parse_data_js

    candidates = [
        ROOT.parent / "每日选品全量数据" / "全量0619" / "data.js",
        Path(r"C:\Users\Administrator\Desktop\每日选品全量数据\全量0619\data.js"),
    ]
    found = None
    for p in candidates:
        if p.is_file():
            found = p
            break
    if not found:
        skip("real data.js", "not found on disk")
        return
    d, meta, items = parse_data_js(str(found))
    assert_true(len(items) > 0, f"real report items ({found.name})", str(len(items)))
    assert_true(bool(meta.get("date")), "real report meta.date")


def test_parse_and_pack(work: Path) -> None:
    print("\n[1] parse + pack")
    from cloud_deploy.cloud_api.sync_service import parse_data_js
    from cloud_deploy.scripts.report_packager import pack_report_dir

    report_dir = work / "data" / "全量0619"
    report_dir.mkdir(parents=True, exist_ok=True)
    _write_data_js(report_dir / "data.js", "2026-06-19")
    shutil.copy2(ROOT / "cloud_deploy" / "assets" / "index_with_gr.html", report_dir / "index_with_gr.html")

    d, meta, items = parse_data_js(str(report_dir / "data.js"))
    assert_true(d == "2026-06-19", "parse_data_js date")
    assert_true(len(items) == 3, "parse_data_js items count", str(len(items)))

    info = pack_report_dir(str(report_dir))
    assert_true(os.path.isfile(info["zip_path"]), "pack zip exists")
    assert_true(info["file_size_bytes"] > 100, "pack zip size")


def test_pg_sync(work: Path) -> None:
    print("\n[2] PG sync_service")
    pg_url = os.environ.get("XHS_DATABASE_URL", "")
    if not pg_url.startswith("postgres"):
        skip("PG sync", "未配置 E2E_DATABASE_URL / XHS_DATABASE_URL")
        return

    from cloud_deploy.scripts.bootstrap_env import bootstrap

    bootstrap(str(work / ".env.test"))
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.sync_service import (
        apply_daily_report,
        apply_sold_history_batch,
        apply_sold_snapshots_batch,
        parse_data_js,
        prune_sold_snapshots,
        record_cloud_scan,
    )

    init_db()
    report_dir = work / "data" / "全量0620"
    report_dir.mkdir(parents=True, exist_ok=True)
    _write_data_js(report_dir / "data.js", "2026-06-20")
    report_date, meta, items = parse_data_js(str(report_dir / "data.js"))

    conn = _conn()
    try:
        r1 = apply_daily_report(conn, report_date, meta, items, source="e2e")
        assert_true(r1["items_upserted"] == 3, "apply_daily_report upsert count")
        assert_true(r1["monitor_pool_total"] == 2, "monitor pool v1d>0 count", str(r1))

        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute("SELECT COUNT(*) FROM report_daily_items WHERE report_date=%s", (report_date,))
            n1 = c.fetchone()[0]
        assert_true(n1 == 3, "report_daily_items count after first sync", str(n1))

        # re-sync 去掉 g003，应删除 stale 行
        items2 = [it for it in items if it[0] != "g003"]
        meta2 = dict(meta)
        meta2["count"] = len(items2)
        apply_daily_report(conn, report_date, meta2, items2, source="e2e_resync")
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute("SELECT COUNT(*) FROM report_daily_items WHERE report_date=%s", (report_date,))
            n2 = c.fetchone()[0]
            c.execute("SELECT 1 FROM report_daily_items WHERE report_date=%s AND goods_id='g003'", (report_date,))
            stale = c.fetchone()
        assert_true(n2 == 2, "stale row deleted", f"count={n2}")
        assert_true(stale is None, "g003 removed")

        # sold_history batch
        n = apply_sold_history_batch(
            conn,
            [
                {"goods_id": "g001", "snapshot_date": "2026-06-19", "sold_num": 980, "delta": 5},
                {"goods_id": "g001", "snapshot_date": "2026-06-20", "sold_num": 1000, "delta": 20},
            ],
        )
        assert_true(n == 2, "sold_history batch", str(n))

        # record_cloud_scan delta
        record_cloud_scan(conn, "g001", 1010, data_source="e2e_scan")
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                "SELECT sold_num, delta FROM goods_sold_daily WHERE goods_id='g001' AND snapshot_date=%s",
                (date.today().isoformat(),),
            )
            row = c.fetchone()
        assert_true(row is not None and row[1] >= 0, "record_cloud_scan daily row", str(row))

        # snapshots + prune
        old = datetime.now() - timedelta(days=100)
        apply_sold_snapshots_batch(
            conn,
            [{"goods_id": "g001", "snapshot_time": old.isoformat(), "sold_num": 900}],
        )
        apply_sold_snapshots_batch(
            conn,
            [{"goods_id": "g001", "snapshot_time": datetime.now().isoformat(), "sold_num": 1010}],
        )
        deleted = prune_sold_snapshots(conn, retention_days=90)
        assert_true(deleted >= 1, "prune old snapshots", str(deleted))
    finally:
        conn.close()


def test_pg_reader(work: Path) -> None:
    print("\n[3] pg_reader sold_daily")
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        skip("pg_reader", "no PG")
        return

    from cloud_deploy.scripts.bootstrap_env import bootstrap
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.reporting.pg_reader import fetch_items_from_sold_daily, sold_row_to_item

    bootstrap(str(work / ".env.test"))
    init_db()
    conn = _conn()
    try:
        item_none = sold_row_to_item({"sold_num": 100, "delta": 8, "goods_id": "x"}, None)
        assert_true(item_none is not None and item_none[4] == 8.0, "sold_row uses delta when no prev")

        item_bad = sold_row_to_item({"sold_num": 100, "delta": 0, "goods_id": "x"}, None)
        assert_true(item_bad is None, "sold_row skip when no prev and delta=0")

        today = date.today().isoformat()
        items = fetch_items_from_sold_daily(conn, today)
        assert_true(isinstance(items, list), "fetch_items_from_sold_daily returns list")
    finally:
        conn.close()


def test_rules(work: Path) -> None:
    print("\n[4] rule_engine")
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        skip("rule_engine", "no PG")
        return

    from cloud_deploy.scripts.bootstrap_env import bootstrap
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.rules.rule_engine import evaluate_rules

    bootstrap(str(work / ".env.test"))
    init_db()
    conn = _conn()
    try:
        r = evaluate_rules(conn)
        assert_true(r["goods_checked"] >= 0, "evaluate_rules runs", str(r))
    finally:
        conn.close()


def test_pipeline_ingest(work: Path) -> None:
    print("\n[5] ingest pipeline")
    from cloud_deploy.scripts.bootstrap_env import bootstrap

    bootstrap(str(work / ".env.test"))
    incoming = work / "data" / "incoming" / "全量0621"
    incoming.mkdir(parents=True, exist_ok=True)
    _write_data_js(incoming / "data.js", "2026-06-21")
    shutil.copy2(ROOT / "cloud_deploy" / "assets" / "index_with_gr.html", incoming / "index_with_gr.html")

    from cloud_deploy.scripts.run_daily_pipeline import run_ingest

    result = run_ingest(report_dir=str(incoming))
    assert_true(result.get("report_date") == "2026-06-21", "ingest report_date")
    assert_true(os.path.isfile(result.get("zip", "")), "ingest zip created")


def test_period_report_no_pg_pollute(work: Path) -> None:
    print("\n[6] period report no PG pollute")
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        skip("period report", "no PG")
        return

    from cloud_deploy.scripts.bootstrap_env import bootstrap
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.scripts import cloud_period_report as cpr

    bootstrap(str(work / ".env.test"))
    init_db()

    # seed daily items for period
    conn = _conn()
    from cloud_deploy.cloud_api.sync_service import apply_daily_report, parse_data_js

    rd = work / "data" / "seed"
    rd.mkdir(parents=True, exist_ok=True)
    _write_data_js(rd / "data.js", "2026-06-15")
    d, m, items = parse_data_js(str(rd / "data.js"))
    apply_daily_report(conn, d, m, items, source="e2e_seed")
    conn.close()

    before = _count_daily_items("2026-06-15")
    try:
        cpr.generate_period_report("weekly", "2026-06-15")
    except Exception as e:
        fail("period report generate", str(e))
        return
    after = _count_daily_items("2026-06-15")
    assert_true(before == after, "period report did not change daily items count", f"{before}->{after}")


def _count_daily_items(report_date: str) -> int:
    from cloud_deploy.cloud_api.database_pg import _conn

    conn = _conn()
    try:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute("SELECT COUNT(*) FROM report_daily_items WHERE report_date=%s", (report_date,))
            return c.fetchone()[0]
    finally:
        conn.close()


def test_api_http(work: Path) -> None:
    print("\n[7] API HTTP")
    from cloud_deploy.scripts.bootstrap_env import bootstrap

    bootstrap(str(work / ".env.test"))

    port = int(os.environ.get("XHS_CLOUD_PORT", "8765"))
    base = f"http://127.0.0.1:{port}"

    def run_server():
        import uvicorn

        uvicorn.run("cloud_deploy.cloud_api.main:app", host="127.0.0.1", port=port, log_level="error")

    t = threading.Thread(target=run_server, daemon=True)
    t.start()
    time.sleep(2)

    def get(path: str, headers: dict | None = None):
        req = urllib.request.Request(base + path, headers=headers or {})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())

    def post(path: str, body: dict, headers: dict | None = None):
        h = {"Content-Type": "application/json", **(headers or {})}
        req = urllib.request.Request(
            base + path,
            data=json.dumps(body, ensure_ascii=False).encode(),
            headers=h,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())

    try:
        h = get("/api/v1/health")
        assert_true(h.get("status") == "ok", "health")

        login = post("/api/v1/auth/login", {"username": "admin", "password": "admin123"})
        token = login.get("access_token", "")
        assert_true(bool(token), "login token")

        auth_h = {"Authorization": f"Bearer {token}"}
        try:
            get("/api/v1/member/reports", auth_h)
            fail("member reports legacy 410", "expected HTTP 410")
        except urllib.error.HTTPError as e:
            assert_true(e.code == 410, "member reports legacy 410", f"got {e.code}")
            body = json.loads(e.read().decode("utf-8", errors="replace"))
            detail = body.get("detail") if isinstance(body, dict) else body
            if isinstance(detail, dict):
                assert_true(detail.get("migration_url") == "/member#today", "legacy migration_url")

        sync_h = {"X-Sync-Key": "e2e-sync-key"}
        status = get("/api/v1/sync/status", sync_h)
        assert_true("monitor_pool_active" in status, "sync status")

        if os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
            sync_body = {
                "report_date": "2026-06-22",
                "meta": {"date": "2026-06-22", "count": 1},
                "items": _sample_items()[:1],
                "source": "e2e_api",
            }
            sr = post("/api/v1/sync/daily-report", sync_body, sync_h)
            assert_true(sr.get("items_upserted", 0) >= 1, "API daily-report sync", str(sr))
        else:
            try:
                post("/api/v1/sync/daily-report", {"report_date": "x", "items": []}, sync_h)
                fail("API daily-report without PG", "should return 503")
            except urllib.error.HTTPError as e:
                assert_true(e.code == 503, "API daily-report 503 without PG", str(e.code))
    except urllib.error.HTTPError as e:
        fail("API HTTP", f"HTTP {e.code} {e.read().decode(errors='replace')}")
    except Exception as e:
        fail("API HTTP", str(e))


def test_run_full_no_crash(work: Path) -> None:
    print("\n[8] run_full_pipeline")
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        skip("run_full", "no PG")
        return

    from cloud_deploy.scripts.bootstrap_env import bootstrap

    bootstrap(str(work / ".env.test"))

    # seed sold_daily for cloud gen
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.sync_service import apply_sold_history_batch

    init_db()
    conn = _conn()
    today = date.today().isoformat()
    yest = (date.today() - timedelta(days=1)).isoformat()
    apply_sold_history_batch(
        conn,
        [
            {"goods_id": "g001", "snapshot_date": yest, "sold_num": 990, "delta": 10},
            {"goods_id": "g001", "snapshot_date": today, "sold_num": 1005, "delta": 15},
            {"goods_id": "g002", "snapshot_date": yest, "sold_num": 490, "delta": 2},
            {"goods_id": "g002", "snapshot_date": today, "sold_num": 495, "delta": 5},
        ],
    )
    conn.close()

    from cloud_deploy.scripts.run_full_pipeline import run_full

    try:
        result = run_full(report_date=today, source="sold_daily")
        assert_true("output_dir" in result or "report_date" in result, "run_full completed", str(result.keys()))
        out = result.get("output_dir") or ""
        if out:
            assert_true(os.path.isfile(os.path.join(out, "data.js")), "run_full data.js")
    except Exception as e:
        fail("run_full_pipeline", str(e))


def try_init_pg_schema(pg_url: str) -> bool:
    try:
        import psycopg2

        conn = psycopg2.connect(pg_url)
        conn.autocommit = True
        with conn.cursor() as c:
            c.execute("SELECT 1")
        conn.close()
        os.environ["XHS_DATABASE_URL"] = pg_url
        os.environ["E2E_DATABASE_URL"] = pg_url
        from cloud_deploy.scripts.bootstrap_env import bootstrap
        from cloud_deploy.cloud_api.database_pg import init_db, ensure_admin

        bootstrap()
        init_db()
        ensure_admin()
        return True
    except Exception as e:
        print(f"  PG unavailable: {e}")
        return False


def main() -> int:
    print("=" * 60)
    print("xhs-cloud E2E Test")
    print("=" * 60)

    work = Path(tempfile.mkdtemp(prefix="xhs_e2e_"))
    print(f"workdir: {work}")

    pg_url = os.environ.get("E2E_DATABASE_URL", os.environ.get("XHS_DATABASE_URL", ""))
    setup_test_env(work)

    if pg_url:
        if not try_init_pg_schema(pg_url):
            skip("PG init", pg_url)
            os.environ.pop("XHS_DATABASE_URL", None)
    else:
        print("  hint: set E2E_DATABASE_URL for full PG tests")

    try:
        test_unit_logic()
        test_parse_and_pack(work)
        test_real_report_parse()
        test_pg_sync(work)
        test_pg_reader(work)
        test_rules(work)
        test_pipeline_ingest(work)
        test_period_report_no_pg_pollute(work)
        test_api_http(work)
        test_run_full_no_crash(work)
    finally:
        shutil.rmtree(work, ignore_errors=True)

    print("\n" + "=" * 60)
    print(f"PASS={PASS}  FAIL={FAIL}  SKIP={SKIP}")
    if ERRORS:
        print("\nFailures:")
        for e in ERRORS:
            print(f"  - {e}")
    print("=" * 60)
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())

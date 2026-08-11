#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""会员顾问「每日三问」健康检查。

1) 今日（或昨晚）advice.json 是否存在，manifest / meta.mode 是否符合预期
2) Feature / Advisor 相关 systemd timer 最近是否有失败（可选 journal）
3) keyword_goods_mapping 今日是否有写入（爬虫闭环）

退出码：0=全绿，1=有告警，2=致命（无报告）

用法:
  python3 daily_advisor_health_check.py
  python3 daily_advisor_health_check.py --date 2026-07-14
  python3 daily_advisor_health_check.py --json
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.request
from datetime import date, datetime, timedelta
from typing import Any


def _cloud_root() -> str:
    return os.environ.get("XHS_CLOUD_ROOT") or os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..")
    )


def _advisor_root() -> str:
    sub = os.environ.get("XHS_ADVISOR_PUBLISH_DIR", "data/advisor_published")
    p = sub if os.path.isabs(sub) else os.path.join(_cloud_root(), sub)
    return p


def _resolve_report_date(explicit: str) -> str:
    if explicit:
        return explicit
    today = date.today().isoformat()
    root = _advisor_root()
    if os.path.isfile(os.path.join(root, today, "advice.json")):
        return today
    # 凌晨未产出时回退昨日
    y = (date.today() - timedelta(days=1)).isoformat()
    if os.path.isfile(os.path.join(root, y, "advice.json")):
        return y
    return today


def check_advice(report_date: str) -> dict[str, Any]:
    path = os.path.join(_advisor_root(), report_date, "advice.json")
    manifest = os.path.join(_advisor_root(), report_date, "report_manifest.json")
    out: dict[str, Any] = {
        "ok": False,
        "report_date": report_date,
        "path": path,
        "exists": os.path.isfile(path),
        "mode": "",
        "source_mode": "",
        "directions": 0,
        "with_source_refs": 0,
        "issues": [],
    }
    if not out["exists"]:
        out["issues"].append("advice.json 不存在")
        return out
    try:
        advice = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        out["issues"].append(f"advice.json 无法解析: {e}")
        return out
    meta = advice.get("meta") or {}
    out["mode"] = str(meta.get("mode") or "")
    dirs = advice.get("direction_advices") or []
    out["directions"] = len(dirs)
    out["with_source_refs"] = sum(
        1 for d in dirs if isinstance(d, dict) and d.get("source_refs")
    )
    if os.path.isfile(manifest):
        try:
            m = json.load(open(manifest, encoding="utf-8"))
            out["source_mode"] = str(m.get("source_mode") or m.get("mode") or "")
        except Exception:
            pass
    if out["directions"] <= 0:
        out["issues"].append("direction_advices 为空")
    # 会员默认读根目录；B 优先
    if out["mode"] and "b" not in out["mode"].lower() and out["source_mode"].upper() != "B":
        out["issues"].append(f"模式非 B：meta.mode={out['mode']} source_mode={out['source_mode']}")
    out["ok"] = len(out["issues"]) == 0
    return out


def check_api() -> dict[str, Any]:
    port = os.environ.get("XHS_CLOUD_PORT", "8080")
    url = f"http://127.0.0.1:{port}/api/v1/health"
    out: dict[str, Any] = {"ok": False, "url": url, "issues": []}
    try:
        with urllib.request.urlopen(url, timeout=8) as resp:
            out["status"] = resp.status
            out["ok"] = resp.status == 200
            if not out["ok"]:
                out["issues"].append(f"health HTTP {resp.status}")
    except Exception as e:
        out["issues"].append(str(e))
    return out


def check_keyword_mapping(report_date: str) -> dict[str, Any]:
    out: dict[str, Any] = {
        "ok": True,
        "skipped": False,
        "scan_date": report_date,
        "rows": None,
        "keywords": None,
        "issues": [],
    }
    dsn = os.environ.get("XHS_PREMIUM_DATABASE_URL") or os.environ.get("XHS_DATABASE_URL") or ""
    if not dsn.startswith("postgres"):
        out["skipped"] = True
        out["issues"].append("未配置 PG DSN，跳过 keyword_goods_mapping")
        return out
    try:
        import psycopg2

        conn = psycopg2.connect(dsn)
        cur = conn.cursor()
        cur.execute("SET search_path TO xhs_monitor, public")
        cur.execute(
            """
            SELECT EXISTS (
              SELECT 1 FROM information_schema.tables
              WHERE table_schema = current_schema()
                AND table_name = 'keyword_goods_mapping'
            )
            """
        )
        exists = bool(cur.fetchone()[0])
        if not exists:
            conn.close()
            out["skipped"] = True
            out["ok"] = True
            out["issues"].append(
                "云库无 keyword_goods_mapping（正常：表在本地爬虫 xhs_monitor；"
                "请在爬虫机查今日写入并确保已重启爬虫）"
            )
            return out
        cur.execute(
            """
            SELECT COUNT(*), COUNT(DISTINCT keyword)
            FROM keyword_goods_mapping WHERE scan_date = %s
            """,
            (report_date,),
        )
        row = cur.fetchone()
        conn.close()
        out["rows"] = int(row[0] or 0)
        out["keywords"] = int(row[1] or 0)
        if out["rows"] <= 0:
            out["ok"] = False
            out["issues"].append("今日 keyword_goods_mapping 无写入（爬虫可能未重启/未跑）")
    except Exception as e:
        msg = str(e)
        if "does not exist" in msg:
            out["skipped"] = True
            out["ok"] = True
            out["issues"].append("云库无 keyword_goods_mapping（以本地爬虫库为准）")
        else:
            out["ok"] = False
            out["issues"].append(f"查询 keyword_goods_mapping 失败: {e}")
    return out


def check_timers() -> dict[str, Any]:
    """尽力读取最近 timer/service 失败（无 systemd 时跳过）。"""
    units = [
        "xhs-advisor-generate.service",
        "xhs-feature-metrics.service",
        "xhs-ab-test-daily.service",
    ]
    out: dict[str, Any] = {"ok": True, "skipped": False, "units": {}, "issues": []}
    if not os.path.isdir("/run/systemd") and sys.platform.startswith("win"):
        out["skipped"] = True
        return out
    for u in units:
        try:
            r = subprocess.run(
                ["systemctl", "show", u, "-p", "ActiveState", "-p", "Result", "-p", "ExecMainStatus"],
                capture_output=True,
                text=True,
                timeout=8,
            )
            info = {}
            for line in (r.stdout or "").splitlines():
                if "=" in line:
                    k, v = line.split("=", 1)
                    info[k.strip()] = v.strip()
            out["units"][u] = info
            if info.get("Result") in ("failed", "exit-code", "signal", "core-dump"):
                out["ok"] = False
                out["issues"].append(f"{u} Result={info.get('Result')}")
        except Exception as e:
            out["units"][u] = {"error": str(e)}
    if not out["units"]:
        out["skipped"] = True
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="顾问每日三问健康检查")
    ap.add_argument("--date", default="")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    report_date = _resolve_report_date(args.date)

    result = {
        "checked_at": datetime.now().isoformat(timespec="seconds"),
        "report_date": report_date,
        "q1_advice": check_advice(report_date),
        "q2_timers": check_timers(),
        "q3_keyword_mapping": check_keyword_mapping(report_date),
        "api": check_api(),
    }

    fatal = not result["q1_advice"]["ok"]
    warn = (
        (not result["api"]["ok"])
        or (not result["q2_timers"]["ok"] and not result["q2_timers"].get("skipped"))
        or (not result["q3_keyword_mapping"]["ok"] and not result["q3_keyword_mapping"].get("skipped"))
    )

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"=== advisor health {result['checked_at']} date={report_date} ===")
        a = result["q1_advice"]
        print(f"[1] advice.json exists={a['exists']} mode={a['mode'] or '-'} "
              f"source_mode={a['source_mode'] or '-'} dirs={a['directions']} "
              f"with_refs={a['with_source_refs']} ok={a['ok']}")
        for i in a["issues"]:
            print(f"    ! {i}")
        t = result["q2_timers"]
        print(f"[2] timers skipped={t.get('skipped')} ok={t['ok']}")
        for i in t["issues"]:
            print(f"    ! {i}")
        k = result["q3_keyword_mapping"]
        print(
            f"[3] keyword_goods_mapping rows={k.get('rows')} keywords={k.get('keywords')} "
            f"skipped={k.get('skipped')} ok={k['ok']}"
        )
        for i in k["issues"]:
            print(f"    ! {i}")
        api = result["api"]
        print(f"[+] API health ok={api['ok']}")
        for i in api["issues"]:
            print(f"    ! {i}")
        print("===", "FAIL" if fatal else ("WARN" if warn else "OK"), "===")

    if fatal:
        return 2
    if warn:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

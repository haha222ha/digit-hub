#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AI 顾问每日三问健康检查（电脑小白友好）。

检查：
  1) 今日（或最近）advice.json 是否存在，meta.source_mode / mode 是否合理
  2) systemd timer 近期是否成功（可选，非 Linux 跳过）
  3) API /api/v1/health 是否 200

用法（云主机）:
  python3 /opt/xhs-cloud/cloud_deploy/scripts/advisor_daily_health_check.py
  python3 .../advisor_daily_health_check.py --date 2026-07-14

退出码：0=全绿，1=有告警，2=致命失败
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime, timedelta


def _cloud_root() -> str:
    env = os.environ.get("XHS_CLOUD_ROOT")
    if env:
        return env
    here = os.path.dirname(os.path.abspath(__file__))
    # .../cloud_deploy/scripts → /opt/xhs-cloud
    return os.path.dirname(os.path.dirname(here))


def _publish_root() -> str:
    sub = os.environ.get("XHS_ADVISOR_PUBLISH_DIR", "data/advisor_published")
    if os.path.isabs(sub):
        return sub
    return os.path.join(_cloud_root(), sub)


def check_advice(date: str) -> tuple[int, list[str]]:
    """返回 (severity 0/1/2, messages)。"""
    msgs: list[str] = []
    root = _publish_root()
    path = os.path.join(root, date, "advice.json")
    if not os.path.isfile(path):
        # 尝试最近 2 天
        for i in range(1, 3):
            d2 = (datetime.strptime(date, "%Y-%m-%d") - timedelta(days=i)).strftime("%Y-%m-%d")
            p2 = os.path.join(root, d2, "advice.json")
            if os.path.isfile(p2):
                msgs.append(f"[WARN] 今日 {date} 无 advice.json，最近有 {d2}")
                path = p2
                date = d2
                break
        else:
            msgs.append(f"[FAIL] 未找到 {date} 及近 2 日的 advice.json @ {root}")
            return 2, msgs

    try:
        with open(path, encoding="utf-8") as f:
            advice = json.load(f)
    except Exception as e:
        msgs.append(f"[FAIL] advice.json 无法解析: {e}")
        return 2, msgs

    dirs = advice.get("direction_advices") or []
    meta = advice.get("meta") or {}
    mode = str(meta.get("mode") or advice.get("mode") or "")
    manifest_path = os.path.join(os.path.dirname(path), "report_manifest.json")
    source_mode = ""
    if os.path.isfile(manifest_path):
        try:
            manifest = json.load(open(manifest_path, encoding="utf-8"))
            source_mode = str(manifest.get("source_mode") or "")
        except Exception:
            pass

    msgs.append(
        f"[OK] 报告 {date}: directions={len(dirs)} mode={mode or '-'} "
        f"source_mode={source_mode or '-'} policy={meta.get('source_ref_policy') or '-'}"
    )
    if len(dirs) < 1:
        msgs.append("[WARN] direction_advices 为空")
        return 1, msgs

    with_refs = sum(1 for d in dirs if isinstance(d, dict) and d.get("source_refs"))
    if mode == "b_mode" and with_refs == 0:
        msgs.append("[WARN] B 模式但 direction 无 source_refs（可能是旧包或未升级）")
        return 1, msgs
    if with_refs:
        msgs.append(f"[OK] 含 source_refs 的方向: {with_refs}/{len(dirs)}")
    return 0, msgs


def check_timers() -> tuple[int, list[str]]:
    msgs: list[str] = []
    if sys.platform.startswith("win"):
        msgs.append("[SKIP] Windows 跳过 systemd timer 检查")
        return 0, msgs
    timers = (
        "xhs-advisor-generate.timer",
        "xhs-feature-metrics.timer",
        "xhs-ab-test-daily.timer",
    )
    worst = 0
    for t in timers:
        try:
            out = subprocess.check_output(
                ["systemctl", "is-active", t],
                stderr=subprocess.STDOUT,
                text=True,
                timeout=8,
            ).strip()
            if out == "active":
                msgs.append(f"[OK] timer {t} = active")
            else:
                msgs.append(f"[WARN] timer {t} = {out}")
                worst = max(worst, 1)
        except FileNotFoundError:
            msgs.append("[SKIP] 无 systemctl")
            return 0, msgs
        except Exception as e:
            msgs.append(f"[WARN] timer {t}: {e}")
            worst = max(worst, 1)
    return worst, msgs


def check_api_health() -> tuple[int, list[str]]:
    msgs: list[str] = []
    url = os.environ.get("XHS_HEALTH_URL", "http://127.0.0.1:8080/api/v1/health")
    try:
        with urllib.request.urlopen(url, timeout=8) as resp:
            code = resp.getcode()
            body = resp.read(200).decode("utf-8", errors="replace")
        if code == 200:
            msgs.append(f"[OK] API health {code} {body[:80]}")
            return 0, msgs
        msgs.append(f"[FAIL] API health HTTP {code}")
        return 2, msgs
    except Exception as e:
        msgs.append(f"[FAIL] API health: {e}")
        return 2, msgs


def main() -> int:
    ap = argparse.ArgumentParser(description="AI 顾问每日健康检查")
    ap.add_argument("--date", default=datetime.now().strftime("%Y-%m-%d"))
    args = ap.parse_args()

    print(f"=== advisor daily health @ {datetime.now().isoformat(timespec='seconds')} ===")
    print(f"publish_root={_publish_root()}")
    scores = []
    for name, fn in (
        ("advice", lambda: check_advice(args.date)),
        ("timers", check_timers),
        ("api", check_api_health),
    ):
        code, msgs = fn()
        scores.append(code)
        print(f"-- {name} (severity={code})")
        for m in msgs:
            print("  ", m)

    final = max(scores) if scores else 2
    label = {0: "GREEN", 1: "YELLOW", 2: "RED"}.get(final, "RED")
    print(f"=== RESULT {label} exit={final} ===")
    return final


if __name__ == "__main__":
    raise SystemExit(main())

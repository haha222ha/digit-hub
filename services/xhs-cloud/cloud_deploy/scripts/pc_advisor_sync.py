#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PC / 运维：会员 token 同步最新 ai_advisor ZIP 到本地目录。"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

ARCHIVE_AI_ADVISOR = "member_ai_advisor_zip"


def _base() -> str:
    return (os.environ.get("XHS_CLOUD_BASE_URL") or "https://monitor.xhs365.cn").rstrip("/")


def _token() -> str:
    t = os.environ.get("XHS_MEMBER_TOKEN", "").strip()
    if not t:
        raise RuntimeError("缺少 XHS_MEMBER_TOKEN")
    return t


def _get_json(path: str, token: str) -> dict:
    req = urllib.request.Request(
        _base() + path,
        headers={"Authorization": f"Bearer {token}"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _latest_date(token: str) -> str:
    data = _get_json("/api/v1/member/advisor/library", token)
    dates = [str(it.get("report_date") or "")[:10] for it in data.get("items") or []]
    dates = sorted({d for d in dates if d})
    if not dates:
        raise RuntimeError("云端尚无 ai_advisor 报告")
    return dates[-1]


def _out_dir() -> Path:
    root = os.environ.get("XHS_PC_REPORTS_DIR", "")
    if root:
        return Path(root)
    return Path.cwd() / "reports"


def sync(*, force: bool = False) -> dict:
    token = _token()
    report_date = _latest_date(token)
    dest = _out_dir() / f"ai_advisor_{report_date}"
    if dest.is_dir() and not force:
        return {"status": "skipped", "report_date": report_date, "path": str(dest)}

    url = f"{_base()}/api/v1/member/advisor/{report_date}/download"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"}, method="GET")
    cache = _out_dir() / "_cache"
    cache.mkdir(parents=True, exist_ok=True)
    zip_path = cache / f"ai_advisor_{report_date}.zip"
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            zip_path.write_bytes(resp.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"download HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:300]}") from e

    if dest.exists():
        import shutil

        shutil.rmtree(dest)
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(dest)
    advice = dest / "advice.json"
    if not advice.is_file():
        raise RuntimeError("ZIP 内缺少 advice.json")
    return {"status": "synced", "report_date": report_date, "path": str(dest)}


def main() -> int:
    ap = argparse.ArgumentParser(description="同步云 ai_advisor ZIP")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    try:
        result = sync(force=args.force)
    except Exception as e:
        print(f"[pc_advisor_sync] error: {e}", file=sys.stderr)
        return 1
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

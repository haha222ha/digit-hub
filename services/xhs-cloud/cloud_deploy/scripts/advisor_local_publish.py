#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本地发布 advisor context → 云 ingest（A4）。

用法:
  cd xhs_shelf_time
  py -3.11 scripts/advisor_local_publish.py --date 2026-07-12
  py -3.11 scripts/advisor_local_publish.py --date 2026-07-12 --dry-run
  py -3.11 scripts/advisor_local_publish.py --context-file data/advisor_context.json

配置（优先级 env > advisor_config.yaml）:
  XHS_CLOUD_INGEST_URL  默认 https://monitor.xhs365.cn
  XHS_CLOUD_SYNC_KEY
"""
from __future__ import annotations

import argparse
import gzip
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_SENSITIVE = frozenset({"goods_id", "product_id", "store_id", "shop_id", "store_name", "shop_name", "goods_url"})


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _load_yaml_config() -> dict:
    path = _repo_root() / "advisor_config.yaml"
    if not path.is_file():
        return {}
    try:
        import yaml  # type: ignore
    except ImportError:
        return {}
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return data if isinstance(data, dict) else {}


def _cloud_cfg() -> dict:
    yml = _load_yaml_config()
    cloud = yml.get("cloud") if isinstance(yml.get("cloud"), dict) else {}
    base = (
        os.environ.get("XHS_CLOUD_INGEST_URL")
        or cloud.get("ingest_url")
        or cloud.get("base_url")
        or "https://monitor.xhs365.cn"
    ).rstrip("/")
    sync_key = os.environ.get("XHS_CLOUD_SYNC_KEY") or cloud.get("sync_key") or ""
    return {"base_url": base, "sync_key": sync_key.strip()}


def _sanitize(obj):
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items() if k not in _SENSITIVE}
    if isinstance(obj, list):
        return [_sanitize(x) for x in obj[:200]]
    return obj


def _build_from_rank_engine(target_date: str) -> dict | None:
    root = _repo_root()
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    try:
        from rank_engine.pipeline import AdvisoryRankingPipeline  # type: ignore
    except ImportError:
        return None
    cfg_path = root / "advisor_config.yaml"
    pipeline = AdvisoryRankingPipeline(str(cfg_path) if cfg_path.is_file() else None)
    result = pipeline.run(target_date=target_date)
    payload = getattr(result, "payload", None) or getattr(result, "context", None)
    if isinstance(payload, dict):
        return _sanitize(payload)
    if hasattr(result, "to_dict"):
        return _sanitize(result.to_dict())
    return None


def _build_template_context(target_date: str) -> dict:
    return {
        "target_date": target_date,
        "market_summary": f"{target_date} 市场观察：本地 context 已上传，等待云侧 LLM 生成完整解读。",
        "directions": [
            {"key": "sales_increment", "title": "销量增量", "summary": "增速品类整体活跃。"},
            {"key": "price_band", "title": "价格带", "summary": "中低价格带需求稳定。"},
            {"key": "seasonal", "title": "季节趋势", "summary": "应季品类关注度上升。"},
        ],
    }


def build_context(target_date: str, *, context_file: str = "") -> dict:
    if context_file:
        with open(context_file, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and isinstance(data.get("context"), dict):
            return _sanitize(data["context"])
        if isinstance(data, dict):
            return _sanitize(data)
        raise ValueError("context 文件必须是 JSON 对象")
    ctx = _build_from_rank_engine(target_date)
    if ctx:
        return ctx
    return _build_template_context(target_date)


def upload_context(target_date: str, context: dict, *, dry_run: bool = False) -> dict:
    cloud = _cloud_cfg()
    if not cloud["sync_key"]:
        raise RuntimeError("缺少 XHS_CLOUD_SYNC_KEY（env 或 advisor_config.yaml cloud.sync_key）")
    body = {
        "target_date": target_date,
        "context": context,
        "source": "local_rank_engine",
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
    if dry_run:
        print(f"[dry-run] would POST {len(raw)} bytes to {cloud['base_url']}/api/v1/internal/advisor/context")
        return {"ok": True, "dry_run": True, "target_date": target_date, "bytes": len(raw)}

    url = f"{cloud['base_url']}/api/v1/internal/advisor/context"
    req = urllib.request.Request(
        url,
        data=gzip.compress(raw),
        headers={
            "Content-Type": "application/json",
            "Content-Encoding": "gzip",
            "X-Sync-Key": cloud["sync_key"],
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            out = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:500]
        raise RuntimeError(f"ingest HTTP {e.code}: {detail}") from e
    print(f"[advisor] ingested {target_date}: {out}")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="本地 advisor context → 云 ingest")
    ap.add_argument("--date", default="", help="YYYY-MM-DD，默认今天")
    ap.add_argument("--context-file", default="", help="直接上传已有 JSON context")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    target = (args.date or datetime.now().strftime("%Y-%m-%d"))[:10]
    if not _DATE_RE.match(target):
        print("invalid --date", file=sys.stderr)
        return 1

    context = build_context(target, context_file=args.context_file)
    upload_context(target, context, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

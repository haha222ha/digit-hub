# -*- coding: utf-8 -*-
"""加载环境变量；独立部署不依赖爬虫仓库。"""
from __future__ import annotations

import os
import sys


def detect_cloud_root() -> str:
    env = os.environ.get("XHS_CLOUD_ROOT", "").strip()
    if env and os.path.isdir(env):
        return env
    here = os.path.dirname(os.path.abspath(__file__))
    candidate = os.path.dirname(os.path.dirname(here))
    if os.path.isdir(os.path.join(candidate, "cloud_deploy")):
        return candidate
    return env or "/opt/xhs-cloud"


def load_dotenv(path: str | None = None) -> None:
    if path is None:
        root = detect_cloud_root()
        os.environ.setdefault("XHS_CLOUD_ROOT", root)
        path = os.environ.get("XHS_ENV_FILE", os.path.join(root, ".env"))
    if not path or not os.path.isfile(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            os.environ.setdefault(k, v)


def setup_python_path() -> None:
    root = detect_cloud_root()
    os.environ.setdefault("XHS_CLOUD_ROOT", root)
    if root and root not in sys.path and os.path.isdir(root):
        sys.path.insert(0, root)
    # 可选：仅 sold_history 回补时只读挂载本地主库，不参与日常
    crawler = os.environ.get("XHS_CRAWLER_ROOT", "")
    if crawler and crawler not in sys.path and os.path.isdir(crawler):
        sys.path.insert(0, crawler)


def bootstrap(env_file: str | None = None) -> None:
    load_dotenv(env_file)
    setup_python_path()
    from cloud_deploy.cloud_api.config import get_settings

    s = get_settings()
    for d in (s.xhs_data_dir, s.xhs_report_archive_dir, s.xhs_report_incoming_dir):
        if d:
            os.makedirs(d, exist_ok=True)

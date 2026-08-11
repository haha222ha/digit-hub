# -*- coding: utf-8 -*-
"""云主机精品库策略：报告在本地生成，默认不同步精品库到云 PG。"""
from __future__ import annotations

import os


def premium_cloud_sync_enabled() -> bool:
    """仅当 XHS_PREMIUM_CLOUD_SYNC=1 时允许云 API 接收精品库同步。"""
    return os.environ.get("XHS_PREMIUM_CLOUD_SYNC", "0").strip().lower() in (
        "1",
        "true",
        "yes",
    )


PREMIUM_CLOUD_SYNC_DISABLED_MSG = (
    "精品库报告在本地生成，云主机已关闭精品库同步（勿设 XHS_PREMIUM_CLOUD_SYNC=1）"
)

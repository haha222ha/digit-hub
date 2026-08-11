# -*- coding: utf-8 -*-
"""按 XHS_DATABASE_URL 自动选择 PostgreSQL 或 SQLite。"""
from __future__ import annotations

import os

if os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
    from cloud_deploy.cloud_api.database_pg import *  # noqa: F403
else:
    from cloud_deploy.cloud_api.database_sqlite import *  # noqa: F403

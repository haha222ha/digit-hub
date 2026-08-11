# -*- coding: utf-8
"""打包 + 登记 + PG 同步 公共步骤。"""
from __future__ import annotations

import json
import os
import re
import shutil
from datetime import datetime

from cloud_deploy.scripts.report_packager import pack_report_dir


def parse_meta_from_data_js(data_js_path: str) -> dict:
    """读取 meta；大 bundle 优先轻量正则，避免 json.loads 整文件 OOM。"""
    with open(data_js_path, "r", encoding="utf-8") as f:
        head = f.read(65536)
    m_date = re.search(r'"date"\s*:\s*"(\d{4}-\d{2}-\d{2})"', head)
    m_count = re.search(r'"count"\s*:\s*(\d+)', head)
    if m_date and m_count:
        return _meta_from_head_regex(head)

    from cloud_deploy.cloud_api.sync_service import _parse_report_payload

    with open(data_js_path, "r", encoding="utf-8") as f:
        text = f.read()
    try:
        return _parse_report_payload(text).get("meta") or {}
    except Exception:
        return {}


def _meta_from_head_regex(head: str) -> dict:
    meta: dict = {}
    m_date = re.search(r'"date"\s*:\s*"(\d{4}-\d{2}-\d{2})"', head)
    if m_date:
        meta["date"] = m_date.group(1)
    m_count = re.search(r'"count"\s*:\s*(\d+)', head)
    if m_count:
        meta["count"] = int(m_count.group(1))
    for key in ("report_kind", "filter_label"):
        m = re.search(rf'"{key}"\s*:\s*"([^"]*)"', head)
        if m:
            meta[key] = m.group(1)
    m_bundle = re.search(r'"bundle"\s*:\s*(true|false)', head, re.I)
    if m_bundle:
        meta["bundle"] = m_bundle.group(1).lower() == "true"
    return meta


def pack_register_sync(
    report_dir: str,
    archive_type: str,
    archive_dir: str,
    sync_pg: bool = True,
    *,
    force: bool = False,
) -> dict:
    from cloud_deploy.cloud_api import database
    from cloud_deploy.cloud_api.config import get_settings
    from cloud_deploy.cloud_api.ingest_guard import (
        existing_published_row_count,
        ingest_force_enabled,
        min_ingest_row_count,
        validate_ingest_row_count,
    )

    database.init_db()
    s = get_settings()

    data_js = os.path.join(report_dir, "data.js")
    meta = parse_meta_from_data_js(data_js) if os.path.isfile(data_js) else {}
    row_count = int(meta.get("count") or 0)
    report_date = str(meta.get("date") or datetime.now().strftime("%Y-%m-%d"))[:10]
    effective_force = force or ingest_force_enabled()
    existing_rows = existing_published_row_count(report_date, archive_type)
    validate_ingest_row_count(
        row_count,
        report_date,
        force=effective_force,
        existing_row_count=existing_rows,
        archive_type=archive_type,
    )

    pack_info = pack_report_dir(report_dir)
    os.makedirs(archive_dir, exist_ok=True)
    dest_zip = os.path.join(archive_dir, pack_info["file_name"])
    if os.path.abspath(pack_info["zip_path"]) != os.path.abspath(dest_zip):
        shutil.copy2(pack_info["zip_path"], dest_zip)

    meta["_sha256"] = pack_info["sha256"]

    st = os.stat(dest_zip)
    database.upsert_report_archive(
        report_date=report_date,
        archive_type=archive_type,
        storage_path=dest_zip,
        file_name=os.path.basename(dest_zip),
        file_size=int(st.st_size),
        sha256=str(pack_info["sha256"]),
        row_count=int(meta.get("count") or 0),
        meta=meta,
    )

    pg_result = {}
    if sync_pg and s.xhs_database_url.startswith("postgres") and os.path.isfile(data_js):
        from cloud_deploy.scripts.sync_report_to_pg import sync_report_to_pg

        pg_result = sync_report_to_pg(data_js, source=meta.get("source", "cloud_pipeline"))

    return {
        "report_date": report_date,
        "archive_type": archive_type,
        "zip": dest_zip,
        "meta_count": meta.get("count"),
        "pg": pg_result,
        "ingest_guard": {
            "min_rows": min_ingest_row_count(),
            "existing_row_count": existing_rows,
            "forced": effective_force,
        },
    }

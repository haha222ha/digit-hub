# -*- coding: utf-8 -*-
"""登记 AI 顾问 ZIP 到 report_archives。"""
from __future__ import annotations

import hashlib
import os
import shutil


def register_advisor_zip(zip_path: str, report_date: str) -> dict:
    from cloud_deploy.cloud_api import database as db

    archive_type = "member_ai_advisor_zip"
    archives_dir = os.environ.get("XHS_REPORT_ARCHIVE_DIR", "/opt/xhs-cloud/data/report_archives")
    os.makedirs(archives_dir, exist_ok=True)
    dest = os.path.join(archives_dir, f"ai_advisor_{report_date}.zip")
    shutil.copy2(zip_path, dest)
    size = os.path.getsize(dest)
    sha = hashlib.sha256()
    with open(dest, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            sha.update(chunk)
    db.upsert_report_archive(
        report_date=report_date,
        archive_type=archive_type,
        storage_path=dest,
        file_name=os.path.basename(dest),
        file_size=size,
        sha256=sha.hexdigest(),
        row_count=0,
        meta={"source": "advisor_cloud_generate", "summary": f"AI 选品顾问 {report_date}"},
    )
    return {"report_date": report_date, "archive_type": archive_type, "path": dest, "file_size_bytes": size}

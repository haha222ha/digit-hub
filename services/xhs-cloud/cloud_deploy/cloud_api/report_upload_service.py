# -*- coding: utf-8
"""方案 B：本地 zip 上传 → 解压 incoming → 打 zip 登记 → 会员下载。"""
from __future__ import annotations

import os
import shutil
import tempfile
import zipfile

from cloud_deploy.reporting.constants import (
    ARCHIVE_CUSTOM,
    ARCHIVE_DAILY,
    ARCHIVE_MONTHLY,
    ARCHIVE_WEEKLY,
)


def _archive_type_for_folder(folder_name: str) -> str:
    if folder_name.startswith("周报"):
        return ARCHIVE_WEEKLY
    if folder_name.startswith("月报"):
        return ARCHIVE_MONTHLY
    if folder_name.startswith("全量"):
        return ARCHIVE_DAILY
    return ARCHIVE_CUSTOM


def _report_sync_pg_enabled() -> bool:
    return os.environ.get("XHS_REPORT_INGEST_SYNC_PG", "0").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def extract_report_zip(zip_path: str, incoming_dir: str) -> str:
    """解压 zip 到 incoming，返回含 data.js 的报告目录。"""
    os.makedirs(incoming_dir, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as zf:
        names = [n for n in zf.namelist() if n and not n.endswith("/")]
        if not names:
            raise ValueError("zip 为空")
        tops = {n.split("/")[0].split("\\")[0] for n in names if "/" in n or "\\" in n}
        if not tops:
            raise ValueError("zip 需包含顶层目录（如 全量MMDD/data.js）")
        folder = sorted(tops)[0]
        dest_root = os.path.join(incoming_dir, folder)
        if os.path.isdir(dest_root):
            shutil.rmtree(dest_root)
        zf.extractall(incoming_dir)
    report_dir = os.path.join(incoming_dir, folder)
    if not os.path.isfile(os.path.join(report_dir, "data.js")):
        raise ValueError(f"解压后缺少 data.js: {report_dir}")
    return report_dir


def ingest_report_zip_file(zip_path: str, *, force: bool = False) -> dict:
    """上传的 zip → 解压 → pack_register_sync（默认不写 PG 明细，仅登记 zip）。"""
    from cloud_deploy.cloud_api.config import get_settings
    from cloud_deploy.scripts.pipeline_common import pack_register_sync

    s = get_settings()
    report_dir = extract_report_zip(zip_path, s.xhs_report_incoming_dir)
    folder = os.path.basename(report_dir.rstrip("/\\"))
    archive_type = _archive_type_for_folder(folder)
    result = pack_register_sync(
        report_dir,
        archive_type,
        s.xhs_report_archive_dir,
        sync_pg=_report_sync_pg_enabled(),
        force=force,
    )
    result["report_dir"] = report_dir
    result["mode"] = "plan_b_upload"
    return result


def ingest_report_upload_bytes(data: bytes, filename: str = "report.zip", *, force: bool = False) -> dict:
    suffix = ".zip" if not filename.lower().endswith(".zip") else ""
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix or ".zip") as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    try:
        return ingest_report_zip_file(tmp_path, force=force)
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass

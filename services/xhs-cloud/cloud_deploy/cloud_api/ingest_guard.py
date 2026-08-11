# -*- coding: utf-8 -*-
"""报告入库/推云最低条数校验（服务端）。"""
from __future__ import annotations

import os

DEFAULT_MIN_INGEST_ROWS = 10000


def min_ingest_row_count(archive_type: str = "") -> int:
    if archive_type == "member_custom_zip":
        raw = os.environ.get("XHS_CLOUD_CUSTOM_UPLOAD_MIN_ROWS", "1").strip()
    else:
        raw = os.environ.get("XHS_CLOUD_UPLOAD_MIN_ROWS", str(DEFAULT_MIN_INGEST_ROWS)).strip()
    try:
        return max(0, int(raw or DEFAULT_MIN_INGEST_ROWS))
    except ValueError:
        return DEFAULT_MIN_INGEST_ROWS


def ingest_force_enabled(*, header_value: str = "") -> bool:
    if header_value.strip().lower() in ("1", "true", "yes", "on"):
        return True
    return os.environ.get("XHS_CLOUD_UPLOAD_FORCE", "0").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def validate_ingest_row_count(
    row_count: int,
    report_date: str = "",
    *,
    force: bool = False,
    existing_row_count: int | None = None,
    archive_type: str = "",
) -> None:
    """条数不足时抛出 ValueError（HTTP 400）。"""
    if force:
        return
    min_rows = min_ingest_row_count(archive_type)
    if min_rows > 0 and row_count > 0 and row_count < min_rows:
        raise ValueError(
            f"报告仅 {row_count} 条，低于最低 {min_rows} 条"
            f"{f'（{report_date}）' if report_date else ''}，已拒绝入库"
        )
    if (
        existing_row_count
        and existing_row_count >= min_rows
        and row_count > 0
        and row_count < existing_row_count
    ):
        raise ValueError(
            f"拒绝降级覆盖：新报告 {row_count} 条 < 已发布 {existing_row_count} 条"
            f"{f'（{report_date}）' if report_date else ''}"
        )


def existing_published_row_count(report_date: str, archive_type: str = "member_daily_zip") -> int:
    if not report_date:
        return 0
    try:
        from cloud_deploy.cloud_api import database as db

        for row in db.list_archives(archive_type=archive_type):
            if str(row.get("report_date") or "")[:10] == report_date[:10]:
                return int(row.get("row_count") or 0)
    except Exception:
        pass
    return 0

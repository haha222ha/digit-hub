# -*- coding: utf-8 -*-
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    xhs_cloud_root: str
    xhs_data_dir: str
    xhs_report_incoming_dir: str
    xhs_cloud_api_db: str
    xhs_report_archive_dir: str
    xhs_cloud_host: str
    xhs_cloud_port: int
    xhs_cloud_sync_key: str
    xhs_cloud_jwt_secret: str
    xhs_cloud_admin_user: str
    xhs_cloud_admin_pass: str
    xhs_cloud_jwt_ttl_days: int = 30
    xhs_database_url: str = ""
    xhs_db_path: str = ""
    xhs_local_agent_key: str = ""
    xhs_agent_ip_allowlist: str = ""
    xhs_pay_api_url: str = ""
    xhs_pay_alipay_api_url: str = ""
    xhs_pay_pid: str = ""
    xhs_pay_key: str = ""
    xhs_pay_alipay_pid: str = ""
    xhs_pay_alipay_key: str = ""
    xhs_pay_notify_base: str = ""


def get_settings() -> Settings:
    root = os.environ.get("XHS_CLOUD_ROOT", "/opt/xhs-cloud")
    data = os.environ.get("XHS_DATA_DIR", os.path.join(root, "data"))
    return Settings(
        xhs_cloud_root=root,
        xhs_data_dir=data,
        xhs_report_incoming_dir=os.environ.get(
            "XHS_REPORT_INCOMING_DIR", os.path.join(data, "incoming")
        ),
        xhs_cloud_api_db=os.environ.get("XHS_CLOUD_API_DB", os.path.join(data, "cloud_api.db")),
        xhs_report_archive_dir=os.environ.get(
            "XHS_REPORT_ARCHIVE_DIR", os.path.join(data, "report_archives")
        ),
        xhs_cloud_host=os.environ.get("XHS_CLOUD_HOST", "127.0.0.1"),
        xhs_cloud_port=int(os.environ.get("XHS_CLOUD_PORT", "8080")),
        xhs_cloud_sync_key=os.environ.get("XHS_CLOUD_SYNC_KEY", "change-me"),
        xhs_cloud_jwt_secret=os.environ.get("XHS_CLOUD_JWT_SECRET", "change-me"),
        xhs_cloud_admin_user=os.environ.get("XHS_CLOUD_ADMIN_USER", "admin"),
        xhs_cloud_admin_pass=os.environ.get("XHS_CLOUD_ADMIN_PASS", "change-me"),
        xhs_cloud_jwt_ttl_days=int(os.environ.get("XHS_CLOUD_JWT_TTL_DAYS", "30")),
        xhs_database_url=os.environ.get("XHS_DATABASE_URL", ""),
        xhs_db_path=os.environ.get("XHS_DB_PATH", ""),
        xhs_local_agent_key=os.environ.get("XHS_LOCAL_AGENT_KEY", ""),
        xhs_agent_ip_allowlist=os.environ.get("XHS_AGENT_IP_ALLOWLIST", ""),
        xhs_pay_api_url=os.environ.get("XHS_PAY_API_URL", "https://pay.hwxun.cn/"),
        xhs_pay_alipay_api_url=os.environ.get("XHS_PAY_ALIPAY_API_URL", "https://xapay.hwxun.cn/"),
        xhs_pay_pid=os.environ.get("XHS_PAY_PID", ""),
        xhs_pay_key=os.environ.get("XHS_PAY_KEY", ""),
        xhs_pay_alipay_pid=os.environ.get("XHS_PAY_ALIPAY_PID", ""),
        xhs_pay_alipay_key=os.environ.get("XHS_PAY_ALIPAY_KEY", ""),
        xhs_pay_notify_base=os.environ.get("XHS_PAY_NOTIFY_BASE", ""),
    )

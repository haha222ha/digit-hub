# -*- coding: utf-8 -*-
"""会员邮件（SMTP）。"""
from __future__ import annotations

import os
import smtplib
import ssl
from email.message import EmailMessage

from cloud_deploy.cloud_api.config import get_settings


def smtp_configured() -> bool:
    host = os.environ.get("XHS_SMTP_HOST", "").strip()
    from_addr = os.environ.get("XHS_SMTP_FROM", "").strip()
    return bool(host and from_addr)


def send_member_mail(*, to_addr: str, subject: str, body_text: str, body_html: str = "") -> None:
    host = os.environ.get("XHS_SMTP_HOST", "").strip()
    port = int(os.environ.get("XHS_SMTP_PORT", "465"))
    user = os.environ.get("XHS_SMTP_USER", "").strip()
    password = os.environ.get("XHS_SMTP_PASS", "")
    from_addr = os.environ.get("XHS_SMTP_FROM", "").strip()
    use_tls = os.environ.get("XHS_SMTP_USE_TLS", "1").strip().lower() not in ("0", "false", "no")
    if not host or not from_addr:
        raise RuntimeError("未配置邮件服务（XHS_SMTP_HOST / XHS_SMTP_FROM）")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg.set_content(body_text)
    if body_html:
        msg.add_alternative(body_html, subtype="html")

    if use_tls and port == 465:
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(host, port, context=ctx, timeout=30) as smtp:
            if user:
                smtp.login(user, password)
            smtp.send_message(msg)
        return

    with smtplib.SMTP(host, port, timeout=30) as smtp:
        if use_tls:
            smtp.starttls(context=ssl.create_default_context())
        if user:
            smtp.login(user, password)
        smtp.send_message(msg)


def member_public_base() -> str:
    base = os.environ.get("XHS_MEMBER_PUBLIC_BASE", "").strip()
    if base:
        return base.rstrip("/")
    notify = get_settings().xhs_pay_notify_base.strip()
    if notify:
        return notify.rstrip("/")
    return "https://monitor.xhs365.cn"

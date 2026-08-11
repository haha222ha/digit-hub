# -*- coding: utf-8 -*-
"""邮箱找回密码。"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta

from cloud_deploy.cloud_api import database as db
from cloud_deploy.cloud_api.email_service import member_public_base, send_member_mail, smtp_configured


def _token_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def request_password_reset(email: str) -> dict:
    """发送重置邮件。无论邮箱是否存在均返回相同提示（防枚举）。"""
    if not smtp_configured():
        raise RuntimeError("邮件服务未配置，请联系管理员或使用授权码登录")
    addr = (email or "").strip().lower()
    if not addr or "@" not in addr:
        raise ValueError("请输入有效邮箱")
    user = db.get_user_by_email(addr)
    if user:
        raw = secrets.token_urlsafe(32)
        db.create_password_reset_token(int(user["id"]), _token_hash(raw), hours=2)
        link = f"{member_public_base()}/member?reset={raw}"
        subject = "选品报告会员 — 重置登录密码"
        text = (
            f"您好 {user.get('username') or ''}，\n\n"
            f"请点击以下链接重置密码（2 小时内有效）：\n{link}\n\n"
            "如非本人操作请忽略此邮件。"
        )
        html = (
            f"<p>您好 <strong>{user.get('username') or ''}</strong>，</p>"
            f'<p><a href="{link}">点击此处重置密码</a>（2 小时内有效）</p>'
            "<p>如非本人操作请忽略此邮件。</p>"
        )
        send_member_mail(to_addr=addr, subject=subject, body_text=text, body_html=html)
    return {"message": "若该邮箱已绑定会员账号，我们已发送重置链接，请查收邮件（含垃圾箱）"}


def reset_password_with_token(token: str, new_password: str) -> dict:
    raw = (token or "").strip()
    if len(raw) < 16:
        raise ValueError("重置链接无效或已过期")
    if len(new_password or "") < 6:
        raise ValueError("新密码至少 6 位")
    user_id = db.consume_password_reset_token(_token_hash(raw))
    if not user_id:
        raise ValueError("重置链接无效或已过期")
    db.change_password(user_id, new_password, current_password=None)
    profile = db.get_member_profile(user_id) or {}
    return {
        "message": "密码已重置，请使用新密码登录",
        "username": profile.get("username") or "",
        "membership": profile,
    }

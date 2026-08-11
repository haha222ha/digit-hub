# -*- coding: utf-8 -*-
"""运营后台登录 — 浏览器管理授权码（不暴露 Sync Key）。"""
from __future__ import annotations

import secrets
import time

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from cloud_deploy.cloud_api.auth import _b64url, decode_token, security
from cloud_deploy.cloud_api.config import get_settings

ADMIN_ROLE = "cloud_admin"


def verify_admin_credentials(username: str, password: str) -> bool:
    s = get_settings()
    u = (username or "").strip()
    p = password or ""
    if not u or not p:
        return False
    return secrets.compare_digest(u, s.xhs_cloud_admin_user.strip()) and secrets.compare_digest(
        p, s.xhs_cloud_admin_pass
    )


def create_admin_portal_token(username: str, *, ttl_hours: int = 12) -> str:
    import hashlib
    import hmac
    import json

    s = get_settings()
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": username.strip(),
        "role": ADMIN_ROLE,
        "exp": int(time.time()) + ttl_hours * 3600,
    }
    h = _b64url(json.dumps(header, separators=(",", ":")).encode())
    p = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    sig = hmac.new(
        s.xhs_cloud_jwt_secret.encode(),
        f"{h}.{p}".encode(),
        hashlib.sha256,
    ).digest()
    return f"{h}.{p}.{_b64url(sig)}"


def verify_admin_portal(
    cred: HTTPAuthorizationCredentials | None = Depends(security),
) -> str:
    if not cred or not cred.credentials:
        raise HTTPException(status_code=401, detail="需要管理员登录")
    payload = decode_token(cred.credentials)
    if payload.get("role") != ADMIN_ROLE:
        raise HTTPException(status_code=403, detail="非管理员令牌")
    username = str(payload.get("sub") or "").strip()
    if not username:
        raise HTTPException(status_code=401, detail="无效管理员令牌")
    return username

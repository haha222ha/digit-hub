# -*- coding: utf-8 -*-
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any

from fastapi import Depends, HTTPException, Header, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from cloud_deploy.cloud_api.config import get_settings
from cloud_deploy.cloud_api import database as db

security = HTTPBearer(auto_error=False)
MEMBER_COOKIE = "xhs_member_session"


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def create_token(
    user: dict,
    *,
    device_id: str = "",
    session_version: int = 0,
    ttl_hours: int | None = None,
) -> str:
    s = get_settings()
    if ttl_hours is None:
        ttl_hours = s.xhs_cloud_jwt_ttl_days * 24
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": str(user["id"]),
        "username": user["username"],
        "exp": int(time.time()) + ttl_hours * 3600,
    }
    if device_id and session_version > 0:
        payload["did"] = device_id
        payload["sv"] = int(session_version)
    h = _b64url(json.dumps(header, separators=(",", ":")).encode())
    p = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    sig = hmac.new(
        s.xhs_cloud_jwt_secret.encode(),
        f"{h}.{p}".encode(),
        hashlib.sha256,
    ).digest()
    return f"{h}.{p}.{_b64url(sig)}"


def decode_token(token: str) -> dict[str, Any]:
    return _decode_token_payload(token, allow_expired=False)


def decode_token_graceful(token: str, grace_seconds: int = 7 * 86400) -> dict[str, Any]:
    """允许 JWT 过期后在 grace 窗口内刷新。"""
    return _decode_token_payload(token, allow_expired=True, grace_seconds=grace_seconds)


def _decode_token_payload(
    token: str,
    *,
    allow_expired: bool = False,
    grace_seconds: int = 0,
) -> dict[str, Any]:
    s = get_settings()
    try:
        h, p, sig = token.split(".")
        expect = hmac.new(
            s.xhs_cloud_jwt_secret.encode(),
            f"{h}.{p}".encode(),
            hashlib.sha256,
        ).digest()
        got = base64.urlsafe_b64decode(sig + "==")
        if not hmac.compare_digest(expect, got):
            raise ValueError("bad sig")
        pad = "=" * (-len(p) % 4)
        payload = json.loads(base64.urlsafe_b64decode(p + pad))
        exp = int(payload.get("exp", 0) or 0)
        now = int(time.time())
        if exp and exp < now:
            if not allow_expired or exp + grace_seconds < now:
                raise ValueError("expired")
        return payload
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"无效令牌: {e}") from e


def verify_sync_key(x_sync_key: str | None = Header(default=None, alias="X-Sync-Key")) -> None:
    s = get_settings()
    if not x_sync_key or not hmac.compare_digest(x_sync_key, s.xhs_cloud_sync_key):
        raise HTTPException(status_code=401, detail="Sync Key 无效")


def _client_ip(request: Request) -> str:
    forwarded = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
    if forwarded:
        return forwarded
    if request.client:
        return request.client.host or ""
    return ""


def verify_agent_access(
    request: Request,
    x_agent_key: str | None = Header(default=None, alias="X-Agent-Key"),
) -> None:
    """本地采集 Agent 专用鉴权（与会员 Sync Key 分离，可配 IP 白名单）。"""
    s = get_settings()
    expected = (s.xhs_local_agent_key or s.xhs_cloud_sync_key or "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="未配置 XHS_LOCAL_AGENT_KEY")
    if not x_agent_key or not hmac.compare_digest(x_agent_key, expected):
        raise HTTPException(status_code=401, detail="Agent Key 无效")
    allowlist = (s.xhs_agent_ip_allowlist or "").strip()
    if not allowlist:
        return
    ip = _client_ip(request)
    allowed = {x.strip() for x in allowlist.split(",") if x.strip()}
    if ip not in allowed:
        raise HTTPException(status_code=403, detail="IP 未授权")


def resolve_member_token(
    cred: HTTPAuthorizationCredentials | None,
    request: Request | None = None,
    access_token: str = "",
) -> str:
    if cred and cred.credentials:
        return cred.credentials.strip()
    token = (access_token or "").strip()
    if token:
        return token
    if request is not None:
        cookie = (request.cookies.get(MEMBER_COOKIE) or "").strip()
        if cookie:
            return cookie
    return ""


def member_auth_response(payload: dict) -> JSONResponse:
    """登录/续期响应：写入 HttpOnly Cookie，浏览器刷新后仍可鉴权。"""
    s = get_settings()
    resp = JSONResponse(content=payload)
    token = (payload.get("access_token") or "").strip()
    if not token:
        return resp
    resp.set_cookie(
        key=MEMBER_COOKIE,
        value=token,
        max_age=max(int(s.xhs_cloud_jwt_ttl_days or 30), 1) * 86400,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )
    return resp


def clear_member_cookie_response(payload: dict | None = None) -> JSONResponse:
    resp = JSONResponse(content=payload or {"message": "已退出"})
    resp.delete_cookie(MEMBER_COOKIE, path="/", samesite="lax")
    return resp


def current_member(
    request: Request,
    cred: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    user = current_user(request, cred)
    member = db.get_active_member(user["id"])
    if not member:
        raise HTTPException(status_code=402, detail="会员已过期或停用")
    return member


def current_user(
    request: Request,
    cred: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    token = resolve_member_token(cred, request)
    if not token:
        raise HTTPException(status_code=401, detail="需要登录")
    return user_from_token(token)


def _device_kick_message(device_id: str) -> str:
    did = db.normalize_device_id(device_id)
    if did.startswith("pc:"):
        return "账号已在其他电脑登录，当前会话已失效"
    if did.startswith("web:"):
        return "账号已在其他浏览器登录，当前会话已失效"
    return "账号已在其他设备登录，当前会话已失效"


def user_from_token(token: str) -> dict:
    payload = decode_token(token)
    uid = int(payload["sub"])
    username = str(payload.get("username") or "")
    if not username:
        profile = db.get_member_profile(uid)
        if profile:
            username = profile.get("username") or ""
    if not username:
        raise HTTPException(status_code=401, detail="用户不存在")
    did = str(payload.get("did") or "").strip()
    sv = int(payload.get("sv") or 0)
    if not did or sv <= 0:
        raise HTTPException(status_code=401, detail="登录已失效，请重新登录")
    if not db.verify_member_session(uid, did, sv):
        raise HTTPException(status_code=401, detail=_device_kick_message(did))
    return {"id": uid, "username": username}


def optional_user(
    request: Request,
    cred: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict | None:
    token = resolve_member_token(cred, request)
    if not token:
        return None
    try:
        return user_from_token(token)
    except HTTPException:
        return None


def issue_member_token(
    user_id: int,
    username: str,
    device_id: str,
    device_label: str = "",
) -> str:
    try:
        sv = db.bind_member_session(user_id, device_id, device_label)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    did = db.normalize_device_id(device_id)
    return create_token({"id": user_id, "username": username}, device_id=did, session_version=sv)


def login_member(
    username: str,
    password: str,
    device_id: str,
    device_label: str = "",
) -> dict:
    user = db.authenticate_user(username, password)
    if not user:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    token = issue_member_token(user["id"], user["username"], device_id, device_label)
    profile = db.get_member_profile(user["id"]) or user
    return {
        "access_token": token,
        "token_type": "bearer",
        "membership": profile,
        "login_method": "password",
    }


def login_member_by_code(
    auth_code: str,
    device_id: str,
    device_label: str = "",
) -> dict:
    code = (auth_code or "").strip()
    from cloud_deploy.cloud_api.payment_plans import is_psy_dist_plan

    # 额度兑换码不得用于登录/找回（U4）
    row = db.get_auth_code_row(code)
    if row and is_psy_dist_plan(str(row.get("plan_code") or "")):
        raise HTTPException(
            status_code=400,
            detail="该码为分销额度兑换码，请在控制台「兑换额度」使用，不能用于登录",
        )

    login_method = "auth_code"
    try:
        profile = db.login_with_auth_code(code)
    except ValueError as e:
        msg = str(e)
        if "尚未开通" not in msg:
            raise HTTPException(status_code=401, detail=msg) from e
        # 未激活码：会员码可开通；额度码已在上方拦截
        try:
            profile = db.register_with_auth_code(code, code, code)
            login_method = "auth_code_redeem"
        except ValueError as e2:
            raise HTTPException(status_code=400, detail=str(e2)) from e2
    token = issue_member_token(profile["id"], profile["username"], device_id, device_label)
    return {
        "access_token": token,
        "token_type": "bearer",
        "membership": profile,
        "login_method": login_method,
        "auth_code": code,
        "login_hint": "授权码可作为账号与密码登录会员中心",
    }


def refresh_member_token(token: str) -> dict:
    payload = decode_token_graceful(token)
    uid = int(payload["sub"])
    did = str(payload.get("did") or "").strip()
    sv = int(payload.get("sv") or 0)
    if not did or sv <= 0:
        raise HTTPException(status_code=401, detail="登录已失效，请重新登录")
    if not db.verify_member_session(uid, did, sv):
        raise HTTPException(status_code=401, detail=_device_kick_message(did))
    profile = db.get_member_profile(uid)
    if not profile:
        raise HTTPException(status_code=401, detail="用户不存在")
    new_token = create_token(
        {"id": uid, "username": profile["username"]},
        device_id=did,
        session_version=sv,
    )
    return {
        "access_token": new_token,
        "token_type": "bearer",
        "membership": profile,
    }


def member_from_token(token: str) -> dict:
    user = user_from_token(token)
    member = db.get_active_member(user["id"])
    if not member:
        raise HTTPException(status_code=402, detail="会员已过期或停用")
    return member


def change_member_password(
    user_id: int,
    new_password: str,
    current_password: str | None = None,
) -> None:
    try:
        db.change_password(user_id, new_password, current_password=current_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


def register_dist_user(
    username: str,
    password: str,
    *,
    email: str = "",
    invite_code: str = "",
    device_id: str,
    device_label: str = "psy-dist",
    client_ip: str = "",
) -> dict:
    from cloud_deploy.cloud_api import dist_db

    # U1: 保留用户名
    if dist_db.is_reserved_username(username):
        raise ValueError("该用户名为系统保留，请更换")

    # U2: 简易注册限频（同 IP 每小时最多 5 次）
    _check_register_rate(client_ip or device_id or "")

    profile = db.register_user_account(username, password, email=email)
    uid = int(profile["id"])
    dist_db.ensure_distributor(uid)
    # U2: 注册只绑定邀请人，不发额度；首购时再返利
    if invite_code:
        inviter = dist_db.find_distributor_by_invite_code(invite_code)
        if inviter:
            inviter_uid = int(inviter["user_id"])
            if inviter_uid != uid:
                dist_db.set_inviter(uid, inviter_uid)
    token = issue_member_token(uid, profile.get("username") or username, device_id, device_label)
    return {
        "access_token": token,
        "token_type": "bearer",
        "membership": profile,
    }


_REGISTER_HITS: dict[str, list[float]] = {}


def _check_register_rate(key: str) -> None:
    import time

    k = (key or "unknown").strip() or "unknown"
    now = time.time()
    window = 3600.0
    limit = int(os.environ.get("XHS_DIST_REGISTER_RATE_PER_HOUR", "5") or 5)
    bucket = [t for t in _REGISTER_HITS.get(k, []) if now - t < window]
    if len(bucket) >= max(1, limit):
        raise ValueError("注册过于频繁，请稍后再试")
    bucket.append(now)
    _REGISTER_HITS[k] = bucket
    # 粗略清理
    if len(_REGISTER_HITS) > 5000:
        stale = [kk for kk, vv in _REGISTER_HITS.items() if not vv or now - vv[-1] > window]
        for kk in stale[:1000]:
            _REGISTER_HITS.pop(kk, None)

# -*- coding: utf-8 -*-
from __future__ import annotations

import os
import sys
import zipfile
from datetime import datetime

CRAWLER_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if CRAWLER_ROOT not in sys.path:
    sys.path.insert(0, CRAWLER_ROOT)

from cloud_deploy.scripts.bootstrap_env import bootstrap

bootstrap()

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

from cloud_deploy.cloud_api import database as db
from cloud_deploy.cloud_api.auth import (
    change_member_password,
    current_member,
    current_user,
    issue_member_token,
    login_member,
    login_member_by_code,
    clear_member_cookie_response,
    member_auth_response,
    refresh_member_token,
    resolve_member_token,
    security,
    verify_agent_access,
    verify_sync_key,
    optional_user,
    register_dist_user,
    user_from_token,
)
from cloud_deploy.cloud_api.admin_portal_auth import (
    create_admin_portal_token,
    verify_admin_credentials,
    verify_admin_portal,
)
from cloud_deploy.cloud_api.config import get_settings
from cloud_deploy.cloud_api.dist_routes import compat_router as dist_compat_router
from cloud_deploy.cloud_api.dist_routes import router as dist_router
from cloud_deploy.cloud_api import payment_service as pay
from cloud_deploy.cloud_api.request_ip import public_ipv4_for_pay, resolve_client_ip
from cloud_deploy.cloud_api.email_service import smtp_configured
from cloud_deploy.cloud_api.password_reset_service import (
    request_password_reset,
    reset_password_with_token,
)
from cloud_deploy.cloud_api.insight_routes import router as insight_router
from cloud_deploy.cloud_api.advisor_member_routes import router as advisor_member_router
from cloud_deploy.cloud_api.advisor_routes import router as advisor_internal_router
from cloud_deploy.cloud_api.member_entitlements import assess_access_for_user, enrich_member_profile

_ASSETS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")

app = FastAPI(title="XHS 选品云服务", version="1.1.0")
app.include_router(insight_router)
app.include_router(advisor_member_router)
app.include_router(advisor_internal_router)
app.include_router(dist_router)
app.include_router(dist_compat_router)


@app.on_event("startup")
def _startup():
    db.init_db()
    db.ensure_admin()
    try:
        from cloud_deploy.cloud_api.dist_db import init_dist_tables

        init_dist_tables()
    except Exception as e:
        print(f"[startup] init_dist_tables failed: {e}", flush=True)
    try:
        from cloud_deploy.scripts.insight_llm_runtime import apply_admin_insight_llm

        apply_admin_insight_llm(log_prefix="startup")
    except Exception:
        pass


class DeviceAuthBody(BaseModel):
    device_id: str = Field(..., min_length=8, max_length=160)
    device_label: str = Field(default="", max_length=64)


class LoginBody(DeviceAuthBody):
    username: str
    password: str


class LoginCodeBody(DeviceAuthBody):
    auth_code: str = Field(..., min_length=8, max_length=64)


class ChangePasswordBody(BaseModel):
    new_password: str = Field(..., min_length=6, max_length=128)
    current_password: str = Field(default="")


class RegisterBody(DeviceAuthBody):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=6, max_length=128)
    auth_code: str = Field(..., min_length=8, max_length=64)


class ActivateBody(BaseModel):
    auth_code: str = Field(..., min_length=8, max_length=64)


class RenewWithCodeBody(DeviceAuthBody):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=6, max_length=128)
    auth_code: str = Field(..., min_length=8, max_length=64)


class PaymentCreateBody(BaseModel):
    plan_code: str = Field(..., min_length=3, max_length=32)
    channel: str = Field(default="wxpay", pattern="^(wxpay|alipay)$")
    # 易支付 device：pc=扫码；mobile/alipay/wechat/jump=优先返回可跳转 payurl
    device: str = Field(default="pc", pattern="^(pc|mobile|wechat|alipay|jump)$")


class PaymentCompleteBody(DeviceAuthBody):
    mode: str = Field(..., pattern="^(register|login)$")
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=6, max_length=128)


class ForgotPasswordBody(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)


class ResetPasswordBody(DeviceAuthBody):
    token: str = Field(..., min_length=16, max_length=128)
    new_password: str = Field(..., min_length=6, max_length=128)


class BindEmailBody(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)


def _client_ip(request: Request) -> str:
    return resolve_client_ip(request) or "127.0.0.1"


def _renew_message(profile: dict) -> str:
    stack = profile.get("renew_stack") or {}
    expires = profile.get("expires_at") or stack.get("expires_at") or ""
    if stack.get("stacked"):
        prev = int(stack.get("previous_days_remaining") or 0)
        added = int(stack.get("days_added") or 0)
        return f"续费成功：已叠加剩余 {prev} 天 + 新授权 {added} 天，到期 {expires}"
    if stack.get("days_added"):
        return f"续费成功：会员已延长 {stack['days_added']} 天，到期 {expires}"
    return f"续费成功，到期时间 {expires}" if expires else "续费成功"


class WatchlistUpsertBody(BaseModel):
    goods_ids: list[str] = Field(default_factory=list, max_length=500)
    items: list[dict] = Field(default_factory=list, max_length=500)
    source: str = ""


class WatchlistDeleteBody(BaseModel):
    goods_ids: list[str] = Field(..., min_length=1, max_length=500)


class MemberFeedbackBody(BaseModel):
    category: str = Field(default="suggestion", max_length=32)
    content: str = Field(..., min_length=4, max_length=8000)
    contact: str = Field(default="", max_length=255)
    app_version: str = Field(default="", max_length=32)
    machine_id: str = Field(default="", max_length=64)


class MemberKeywordRequestBody(BaseModel):
    keywords: str = Field(..., min_length=1, max_length=4000)
    note: str = Field(default="", max_length=2000)
    app_version: str = Field(default="", max_length=32)
    machine_id: str = Field(default="", max_length=64)


class CustomAnalysisSubmitBody(BaseModel):
    keywords: str = Field(..., min_length=1, max_length=4000)
    note: str = Field(default="", max_length=2000)
    app_version: str = Field(default="", max_length=32)
    machine_id: str = Field(default="", max_length=64)


class AdminFeedbackUpdateBody(BaseModel):
    status: str | None = Field(default=None, max_length=16)
    admin_note: str | None = Field(default=None, max_length=2000)


class GenerateCodesBody(BaseModel):
    count: int = Field(default=1, ge=1, le=100)
    plan_code: str = Field(default="", max_length=32)
    product: str = Field(default="", max_length=32)
    sku: str = Field(default="", max_length=32)
    channel: str = Field(default="", max_length=128)
    duration_days: int = Field(default=0, ge=0, le=36500)
    max_activations: int = Field(default=0, ge=0, le=1000)
    note: str = ""


class AdminPortalLoginBody(BaseModel):
    username: str = Field(..., min_length=2, max_length=64)
    password: str = Field(..., min_length=4, max_length=128)


class DailyReportSyncBody(BaseModel):
    report_date: str
    meta: dict = Field(default_factory=dict)
    items: list
    source: str = "local_gen_report"


class SoldHistorySyncBody(BaseModel):
    batch_id: str = ""
    rows: list[dict]
    final_batch: bool = False


class SoldSnapshotsSyncBody(BaseModel):
    batch_id: str = ""
    rows: list[dict]
    final_batch: bool = False


class PremiumUpsertBody(BaseModel):
    client_id: str = ""
    sync_version: int = 0
    rows: list[dict]


class PremiumSnapshotsBackfillBody(BaseModel):
    client_id: str = ""
    goods_id: str
    goods_daily: list[dict] = Field(default_factory=list)
    store_daily: list[dict] = Field(default_factory=list)


class PremiumCatalogBody(BaseModel):
    local_ids: list[str] = Field(default_factory=list)
    since_date: str = ""


class PeriodReportTriggerBody(BaseModel):
    scope: str = Field(..., pattern="^(weekly|monthly)$")
    end_date: str = ""
    page: int = 0
    page_size: int = 5000


class PremiumFetchBody(BaseModel):
    goods_ids: list[str] = Field(default_factory=list)


class PremiumDailyFetchBody(BaseModel):
    goods_ids: list[str] = Field(default_factory=list)
    since_date: str = ""
    max_rows: int = 25000


class PremiumBatchSyncBody(BaseModel):
    batch_id: str = ""
    rows: list[dict]
    final_batch: bool = False


class AgentScanRow(BaseModel):
    goods_id: str
    status: str
    sold: int | None = None
    engine: str = "playwright"
    message: str = ""
    ms: int = 0
    deal_price: float | None = None
    detail: dict = Field(default_factory=dict)


class AgentScanUploadBody(BaseModel):
    batch_id: str = ""
    agent_id: str = ""
    scan_date: str = ""
    rows: list[AgentScanRow] = Field(default_factory=list)


@app.get("/api/v1/agent/risk-worklist")
def agent_risk_worklist(
    limit: int = 100,
    scan_date: str = "",
    include_pending: int = 0,
    agent_id: str = "",
    min_age_hours: float = 2.0,
    _: None = Depends(verify_agent_access),
):
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    from datetime import date

    from cloud_deploy.cloud_api.agent_service import (
        DEFAULT_CLAIM_TTL_MINUTES,
        list_risk_worklist,
    )
    from cloud_deploy.cloud_api.database_pg import _conn, init_db

    limit = max(1, min(int(limit), 1000))
    day = (scan_date or date.today().isoformat())[:10]
    init_db()
    conn = _conn()
    try:
        return list_risk_worklist(
            conn,
            day,
            limit,
            include_pending=bool(include_pending),
            agent_id=agent_id.strip(),
            min_age_hours=max(0.0, float(min_age_hours)),
            claim_ttl_minutes=DEFAULT_CLAIM_TTL_MINUTES,
        )
    finally:
        conn.close()


@app.post("/api/v1/agent/scan-results")
def agent_scan_results(body: AgentScanUploadBody, _: None = Depends(verify_agent_access)):
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    if not body.rows:
        raise HTTPException(status_code=400, detail="rows 为空")
    if len(body.rows) > 500:
        raise HTTPException(status_code=400, detail="单批最多 500 条")
    from cloud_deploy.cloud_api.agent_service import apply_local_scan_batch
    from cloud_deploy.cloud_api.database_pg import _conn, init_db

    init_db()
    conn = _conn()
    try:
        payload = [r.model_dump() for r in body.rows]
        return apply_local_scan_batch(
            conn,
            payload,
            agent_id=body.agent_id,
            batch_id=body.batch_id,
        )
    finally:
        conn.close()


@app.get("/", response_class=HTMLResponse)
@app.get("/member", response_class=HTMLResponse)
def member_portal_page():
    path = os.path.join(_ASSETS, "member_portal.html")
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="会员看板未部署")
    return FileResponse(
        path,
        media_type="text/html; charset=utf-8",
        headers={"Cache-Control": "no-store, must-revalidate"},
    )


@app.get("/api/v1/health")
def health():
    return {"status": "ok"}


@app.post("/api/v1/auth/login")
def login(body: LoginBody):
    return member_auth_response(
        login_member(body.username, body.password, body.device_id, body.device_label)
    )


@app.post("/api/v1/auth/login-code")
def login_with_code(body: LoginCodeBody):
    return member_auth_response(
        login_member_by_code(body.auth_code, body.device_id, body.device_label)
    )


@app.get("/api/v1/auth/password-reset-available")
def password_reset_available():
    return {"available": smtp_configured()}


@app.post("/api/v1/auth/forgot-password")
def forgot_password(body: ForgotPasswordBody):
    try:
        return request_password_reset(body.email)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


@app.post("/api/v1/auth/reset-password")
def reset_password(body: ResetPasswordBody):
    try:
        result = reset_password_with_token(body.token, body.new_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    username = result.get("username") or ""
    membership = result.get("membership") or {}
    token = issue_member_token(
        int(membership["id"]),
        username,
        body.device_id,
        body.device_label,
    )
    return member_auth_response({
        "access_token": token,
        "token_type": "bearer",
        "membership": membership,
        "message": result.get("message") or "密码已重置",
    })


@app.post("/api/v1/auth/register")
def register(body: RegisterBody):
    try:
        profile = db.register_with_auth_code(body.username, body.password, body.auth_code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"开通失败: {e}") from e
    try:
        token = issue_member_token(profile["id"], profile["username"], body.device_id, body.device_label)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"登录令牌生成失败: {e}") from e
    return member_auth_response({
        "access_token": token,
        "token_type": "bearer",
        "membership": profile,
    })


@app.post("/api/v1/auth/logout")
def logout_member():
    return clear_member_cookie_response()


@app.post("/api/v1/auth/activate")
def activate_code(body: ActivateBody, user: dict = Depends(current_user)):
    try:
        profile = db.renew_with_auth_code(user["id"], body.auth_code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"membership": profile, "message": _renew_message(profile)}


@app.post("/api/v1/auth/renew-with-code")
def renew_with_code(body: RenewWithCodeBody):
    """已注册用户：账号密码 + 新授权码续费（支持剩余天数叠加）。"""
    try:
        profile = db.renew_with_credentials(body.username, body.password, body.auth_code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    token = issue_member_token(profile["id"], profile["username"], body.device_id, body.device_label)
    return member_auth_response({
        "access_token": token,
        "token_type": "bearer",
        "membership": profile,
        "message": _renew_message(profile),
    })


@app.post("/api/v1/auth/refresh")
def refresh_token(
    request: Request,
    cred: HTTPAuthorizationCredentials | None = Depends(security),
    access_token: str = "",
):
    token = resolve_member_token(cred, request, access_token)
    if not token:
        raise HTTPException(status_code=401, detail="需要登录")
    return member_auth_response(refresh_member_token(token))


@app.get("/api/v1/payment/channels")
def payment_channels():
    return {"channels": pay.list_payment_channels()}


@app.get("/api/v1/payment/plans")
def payment_plans():
    return pay.list_public_plans()


@app.post("/api/v1/payment/orders")
def payment_create_order(
    body: PaymentCreateBody,
    request: Request,
    user: dict | None = Depends(optional_user),
):
    try:
        order = pay.create_order(
            plan_code=body.plan_code,
            user_id=user["id"] if user else None,
            # hwxun 拒收 IPv6 / 内网 / 空 IP →「用户IP地址不合法」
            client_ip=public_ipv4_for_pay(request),
            channel=body.channel,
            device=body.device,
        )
    except pay.PayRateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    return order


@app.get("/api/v1/payment/orders/{order_no}")
def payment_get_order(order_no: str):
    row = pay.get_order_public(order_no)
    if not row:
        raise HTTPException(status_code=404, detail="订单不存在")
    return row


@app.post("/api/v1/payment/orders/{order_no}/claim")
def payment_claim_order(order_no: str, user: dict = Depends(current_user)):
    try:
        return pay.claim_paid_order(order_no, user["id"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/api/v1/payment/orders/{order_no}/guest-unlock")
def payment_guest_unlock_order(order_no: str, body: DeviceAuthBody):
    """游客支付后静默开通：授权码即账号与初始密码，无需手填注册表单。"""
    try:
        result = pay.guest_unlock_paid_order(order_no)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    token = issue_member_token(
        result["membership"]["id"],
        result["username"],
        body.device_id,
        body.device_label,
    )
    return member_auth_response({
        "access_token": token,
        "token_type": "bearer",
        "membership": result["membership"],
        "message": result["message"],
        "username": result["username"],
        "auth_code": result.get("auth_code") or "",
        "login_hint": result.get("login_hint") or "",
        "already_fulfilled": bool(result.get("already_fulfilled")),
    })


@app.post("/api/v1/payment/orders/{order_no}/complete")
def payment_complete_order(order_no: str, body: PaymentCompleteBody):
    """支付成功后：新用户注册开通 / 老用户登录绑定（无需授权码）。"""
    try:
        result = pay.complete_paid_order(
            order_no,
            mode=body.mode,
            username=body.username,
            password=body.password,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    token = issue_member_token(result["membership"]["id"], result["username"], body.device_id, body.device_label)
    return member_auth_response({
        "access_token": token,
        "token_type": "bearer",
        "membership": result["membership"],
        "message": result["message"],
    })


@app.get("/api/v1/payment/qrcode")
def payment_qrcode_image(data: str = ""):
    """服务端生成支付二维码（不依赖前端 CDN）。"""
    text = (data or "").strip()
    if not text or len(text) > 2048:
        raise HTTPException(status_code=400, detail="无效的二维码内容")
    try:
        import io

        import segno

        buf = io.BytesIO()
        segno.make(text, error="m").save(buf, kind="png", scale=6, border=1)
        return Response(content=buf.getvalue(), media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"二维码生成失败: {e}") from e


@app.api_route("/api/v1/payment/notify/hwxun", methods=["GET", "POST"])
async def payment_notify_hwxun(request: Request):
    if request.method == "POST":
        form = await request.form()
        params = dict(form)
    else:
        params = dict(request.query_params)
    result = pay.handle_hwxun_notify(params)
    return PlainTextResponse(result)


@app.get("/api/v1/member/profile")
def member_profile(user: dict = Depends(current_user)):
    profile = db.get_member_profile(user["id"])
    if not profile:
        raise HTTPException(status_code=404, detail="用户不存在")
    return enrich_member_profile(profile, user["id"])


@app.get("/api/v1/assess/access")
def assess_access(skin_id: str = "", user: dict | None = Depends(optional_user)):
    """心象测完整报告门控 — CONTRACT: { allowed, reason, entitlements, skin_id }"""
    if not user:
        return {
            "allowed": False,
            "reason": "need_login_or_pay",
            "entitlements": {},
            "skin_id": skin_id or "",
        }
    return assess_access_for_user(user["id"], skin_id or "")


@app.get("/api/v1/member/broadcast")
def member_broadcast(user: dict = Depends(current_user)):
    """当前站内广播；有效会员且未 ack 时 show_popup=true。"""
    from cloud_deploy.cloud_api.member_broadcast import member_broadcast_payload

    profile = db.get_member_profile(user["id"])
    is_active = bool(profile and profile.get("is_active"))
    return member_broadcast_payload(user["id"], is_active=is_active)


class BroadcastAckBody(BaseModel):
    broadcast_id: str = Field(..., min_length=1, max_length=64)


@app.post("/api/v1/member/broadcast/ack")
def member_broadcast_ack(body: BroadcastAckBody, user: dict = Depends(current_user)):
    from cloud_deploy.cloud_api.member_broadcast import get_active_broadcast

    active = get_active_broadcast()
    bid = (body.broadcast_id or "").strip()
    if not active or active.get("id") != bid:
        raise HTTPException(status_code=400, detail="无效的广播 ID")
    db.ack_member_broadcast(user["id"], bid)
    return {"message": "已记录", "broadcast_id": bid, "acknowledged": True}


@app.post("/api/v1/member/change-password")
def member_change_password(body: ChangePasswordBody, user: dict = Depends(current_user)):
    current = body.current_password.strip() or None
    change_member_password(user["id"], body.new_password, current_password=current)
    return {"message": "密码已更新，下次可使用新密码登录"}


@app.post("/api/v1/member/bind-email")
def member_bind_email(body: BindEmailBody, user: dict = Depends(current_user)):
    try:
        db.set_user_email(user["id"], body.email)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    addr = body.email.strip().lower()
    return {"message": "邮箱已绑定，可用于找回密码", "email": addr}


@app.get("/api/v1/member/reports")
def member_reports_legacy_gone(
    archive_type: str = "member_daily_zip",
    user: dict = Depends(current_member),
):
    """Legacy 表格数据包列表已下线。"""
    raise HTTPException(
        status_code=410,
        detail={
            "detail": "表格数据包已下线，请使用 AI 选品分析中心阅读最新报告",
            "migration_url": "/member#today",
            "archive_type": archive_type,
        },
    )


@app.get("/api/v1/member/library")
def member_library(user: dict = Depends(current_user)):
    """全部历史报告库（日报 + 周报 + 月报）。"""
    import logging

    logger = logging.getLogger(__name__)
    try:
        profile = db.get_member_profile(user["id"])
        if not profile:
            raise HTTPException(status_code=404, detail="用户不存在")
        ent = db.get_member_entitlements(user["id"])
        if ent:
            profile = dict(profile)
            profile["entitlements"] = ent
            profile["plan_label"] = db.PLAN_LABELS.get("experience", "体验会员")
        if not profile.get("is_active"):
            return {
                "membership": profile,
                "library": {"daily": [], "weekly": [], "monthly": [], "custom": []},
                "expired": True,
            }
        library = db.list_report_library(user["id"])
        return {"membership": profile, "library": library}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("member_library failed for user_id=%s", user.get("id"))
        raise HTTPException(status_code=500, detail=f"报告库加载失败: {e}") from e


@app.get("/api/v1/member/watchlist")
def member_watchlist(
    limit: int = 500,
    user: dict = Depends(current_member),
):
    items = db.list_member_watchlist(user["id"], limit=min(max(limit, 1), 2000))
    return {"items": items, "count": len(items)}


@app.post("/api/v1/member/watchlist")
def member_watchlist_upsert(body: WatchlistUpsertBody, user: dict = Depends(current_member)):
    items = body.items or []
    if body.goods_ids and not items:
        items = [{"goods_id": gid.strip()} for gid in body.goods_ids if str(gid).strip()]
    if not items:
        raise HTTPException(status_code=400, detail="缺少 goods_ids 或 items")
    result = db.upsert_member_watchlist(user["id"], items, source=body.source or "")
    return {"message": "收藏已同步", **result}


@app.delete("/api/v1/member/watchlist")
def member_watchlist_delete(body: WatchlistDeleteBody, user: dict = Depends(current_member)):
    removed = db.delete_member_watchlist(user["id"], body.goods_ids)
    return {"message": f"已移除 {removed} 项", "removed": removed}


@app.post("/api/v1/member/feedback")
def member_submit_feedback(body: MemberFeedbackBody, request: Request, user: dict = Depends(current_member)):
    try:
        result = db.create_member_feedback(
            user_id=int(user["id"]),
            username=str(user.get("username") or ""),
            category=body.category.strip() or "suggestion",
            content=body.content.strip(),
            contact=(body.contact or "").strip(),
            app_version=(body.app_version or "").strip(),
            machine_id=(body.machine_id or "").strip(),
            client_ip=_client_ip(request),
        )
        return {"message": "感谢反馈，我们已收到", **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"提交失败: {e}") from e


@app.post("/api/v1/member/keyword-requests")
def member_submit_keyword_request(body: MemberKeywordRequestBody, request: Request, user: dict = Depends(current_member)):
    keywords = (body.keywords or "").strip()
    if not keywords:
        raise HTTPException(status_code=400, detail="请填写关键词")
    try:
        result = db.create_member_keyword_request(
            user_id=int(user["id"]),
            username=str(user.get("username") or ""),
            keywords=keywords,
            note=(body.note or "").strip(),
            app_version=(body.app_version or "").strip(),
            machine_id=(body.machine_id or "").strip(),
            client_ip=_client_ip(request),
        )
        return {
            "message": "关键词已提交，将纳入监控总词库排队；不保证采集结果",
            **result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"提交失败: {e}") from e


@app.post("/api/v1/member/custom-analysis/submit")
def member_submit_custom_analysis(
    body: CustomAnalysisSubmitBody, request: Request, user: dict = Depends(current_member)
):
    keywords = (body.keywords or "").strip()
    if not keywords:
        raise HTTPException(status_code=400, detail="请填写关键词或需求描述")
    credits = db.get_addon_credits(int(user["id"]), "custom_analysis")
    if credits <= 0:
        raise HTTPException(status_code=402, detail="无可用定制分析次数，请先购买")
    if not db.consume_addon_credit(int(user["id"]), "custom_analysis"):
        raise HTTPException(status_code=402, detail="无可用定制分析次数，请先购买")
    note = (body.note or "").strip()
    full_note = "[定制分析] " + note if note else "[定制分析]"
    try:
        result = db.create_member_keyword_request(
            user_id=int(user["id"]),
            username=str(user.get("username") or ""),
            keywords=keywords,
            note=full_note[:2000],
            app_version=(body.app_version or "").strip(),
            machine_id=(body.machine_id or "").strip(),
            client_ip=_client_ip(request),
        )
        remaining = db.get_addon_credits(int(user["id"]), "custom_analysis")
        return {
            "message": "定制分析需求已提交，已扣减 1 次额度",
            "credits_remaining": remaining,
            **result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"提交失败: {e}") from e


@app.get("/public/trial/preview")
def public_trial_preview_page():
    from fastapi.responses import RedirectResponse

    return RedirectResponse(url="/public/advisor-demo", status_code=302)


@app.get("/public/trial/{file_name}")
def public_trial_static_asset(file_name: str):
    from fastapi.responses import RedirectResponse

    return RedirectResponse(url="/public/advisor-demo", status_code=302)


@app.get("/public/trial")
def public_trial_redirect():
    from fastapi.responses import RedirectResponse

    return RedirectResponse(url="/public/advisor-demo", status_code=302)


_TRIAL_REPORT_GONE = {
    "detail": "表格体验包已下线，请使用 AI 选品样例",
    "migration_url": "/public/advisor-demo",
}


@app.get("/api/v1/public/trial-report/info")
def public_trial_report_info():
    raise HTTPException(status_code=410, detail=_TRIAL_REPORT_GONE)


@app.get("/api/v1/public/trial-report/download")
def public_trial_report_download():
    raise HTTPException(status_code=410, detail=_TRIAL_REPORT_GONE)


@app.get("/api/v1/public/trial-report/view/{file_name}")
def public_trial_report_view_file(file_name: str):
    raise HTTPException(status_code=410, detail=_TRIAL_REPORT_GONE)


@app.get("/public/advisor-demo", response_class=HTMLResponse)
def public_advisor_demo_shell():
    from cloud_deploy.cloud_api.advisor_demo_service import demo_shell_response

    return demo_shell_response()


@app.get("/api/v1/public/advisor-demo/info")
def public_advisor_demo_info():
    from cloud_deploy.cloud_api.advisor_demo_service import demo_info

    return demo_info()


@app.get("/api/v1/public/advisor-demo/directions")
def public_advisor_demo_directions():
    from cloud_deploy.cloud_api.advisor_demo_service import demo_directions

    return demo_directions()


@app.get("/api/v1/public/advisor-demo/view")
def public_advisor_demo_view(date: str = "", category: str = ""):
    from cloud_deploy.cloud_api.advisor_demo_service import demo_view_response

    return demo_view_response(date, category)


@app.get("/api/v1/public/advisor-demo/advice")
def public_advisor_demo_advice():
    """返回静态样例 advice.json（后 15 方向内容替换为加锁文案）。"""
    from cloud_deploy.cloud_api.advisor_demo_service import demo_advice_response

    return demo_advice_response()


@app.get("/api/v1/admin/auth-products")
def admin_auth_products(_: None = Depends(verify_sync_key)):
    from cloud_deploy.cloud_api.auth_product_registry import list_products

    return {"products": list_products()}


@app.post("/api/v1/admin/auth-codes")
def admin_generate_codes(body: GenerateCodesBody, _: None = Depends(verify_sync_key)):
    from cloud_deploy.cloud_api.admin_auth_codes_service import generate_auth_codes_request

    return generate_auth_codes_request(
        count=body.count,
        plan_code=body.plan_code,
        product=body.product,
        sku=body.sku,
        channel=body.channel,
        note=body.note,
        duration_days=body.duration_days,
        max_activations=body.max_activations,
    )


@app.post("/api/v1/portal/admin/login")
def portal_admin_login(body: AdminPortalLoginBody):
    if not verify_admin_credentials(body.username, body.password):
        raise HTTPException(status_code=401, detail="管理员账号或密码错误")
    token = create_admin_portal_token(body.username)
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": body.username.strip(),
        "role": "cloud_admin",
    }


@app.get("/api/v1/portal/admin/me")
def portal_admin_me(admin_user: str = Depends(verify_admin_portal)):
    return {"username": admin_user, "role": "cloud_admin"}


@app.get("/api/v1/portal/admin/auth-products")
def portal_admin_products(_admin: str = Depends(verify_admin_portal)):
    from cloud_deploy.cloud_api.auth_product_registry import list_products

    return {"products": list_products(include_reserved=True)}


@app.get("/api/v1/portal/admin/stats")
def portal_admin_stats(_admin: str = Depends(verify_admin_portal)):
    from cloud_deploy.cloud_api.admin_portal_service import collect_admin_stats

    return {"stats": collect_admin_stats()}


@app.get("/api/v1/portal/admin/status")
def portal_admin_status(_admin: str = Depends(verify_admin_portal)):
    from cloud_deploy.cloud_api.admin_portal_service import cloud_status_payload

    return cloud_status_payload(health_ok=True)


@app.get("/api/v1/portal/admin/member-feedback")
def portal_admin_list_feedback(
    _admin: str = Depends(verify_admin_portal),
    limit: int = 100,
    status: str | None = None,
):
    try:
        items = db.list_member_feedback(limit=min(max(limit, 1), 500), status=status)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"数据库未就绪: {e}") from e
    return {"items": items, "total": len(items)}


@app.patch("/api/v1/portal/admin/member-feedback/{item_id}")
def portal_admin_patch_feedback(
    item_id: int,
    body: AdminFeedbackUpdateBody,
    _admin: str = Depends(verify_admin_portal),
):
    try:
        ok = db.update_member_feedback(item_id, status=body.status, admin_note=body.admin_note)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"数据库未就绪: {e}") from e
    if not ok:
        raise HTTPException(status_code=404, detail="记录不存在或无变更")
    return {"message": "已更新"}


@app.get("/api/v1/portal/admin/member-keyword-requests")
def portal_admin_list_keyword_requests(
    _admin: str = Depends(verify_admin_portal),
    limit: int = 100,
    status: str | None = None,
):
    try:
        items = db.list_member_keyword_requests(limit=min(max(limit, 1), 500), status=status)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"数据库未就绪: {e}") from e
    return {"items": items, "total": len(items)}


@app.patch("/api/v1/portal/admin/member-keyword-requests/{item_id}")
def portal_admin_patch_keyword_request(
    item_id: int,
    body: AdminFeedbackUpdateBody,
    _admin: str = Depends(verify_admin_portal),
):
    try:
        ok = db.update_member_keyword_request(
            item_id, status=body.status, admin_note=body.admin_note
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"数据库未就绪: {e}") from e
    if not ok:
        raise HTTPException(status_code=404, detail="记录不存在或无变更")
    return {"message": "已更新"}


@app.get("/api/v1/portal/admin/auth-codes")
def portal_admin_list_codes(
    _admin: str = Depends(verify_admin_portal),
    limit: int = 100,
    status: str | None = None,
    product: str | None = None,
):
    from cloud_deploy.cloud_api.admin_portal_service import filter_auth_codes_by_product

    try:
        items = db.list_auth_codes(limit=limit, status=status or None)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"数据库未就绪: {e}") from e
    items = filter_auth_codes_by_product(items, product)
    return {"items": items, "total": len(items)}


@app.get("/api/v1/portal/admin/dist/overview")
def portal_admin_dist_overview(
    _admin: str = Depends(verify_admin_portal),
    link_status: str | None = None,
    limit: int = 100,
):
    from cloud_deploy.cloud_api.admin_portal_service import collect_dist_admin_payload

    try:
        return collect_dist_admin_payload(link_status=link_status, limit=limit)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"分销数据未就绪: {e}") from e


@app.get("/api/v1/portal/admin/dist/stats")
def portal_admin_dist_stats(_admin: str = Depends(verify_admin_portal)):
    from cloud_deploy.cloud_api import dist_db

    try:
        return dist_db.admin_dist_stats()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"分销统计失败: {e}") from e


@app.post("/api/v1/portal/admin/auth-codes")
def portal_admin_generate_codes(
    body: GenerateCodesBody,
    _admin: str = Depends(verify_admin_portal),
):
    from cloud_deploy.cloud_api.admin_auth_codes_service import generate_auth_codes_request

    return generate_auth_codes_request(
        count=body.count,
        plan_code=body.plan_code,
        product=body.product,
        sku=body.sku,
        channel=body.channel,
        note=body.note,
        duration_days=body.duration_days,
        max_activations=body.max_activations,
    )


@app.post("/api/v1/portal/admin/auth-codes/{code}/revoke")
def portal_admin_revoke_code(code: str, _admin: str = Depends(verify_admin_portal)):
    try:
        return db.revoke_auth_code(code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"数据库未就绪: {e}") from e


@app.get("/api/v1/admin/auth-codes")
def admin_list_codes(
    _: None = Depends(verify_sync_key),
    limit: int = 100,
    status: str | None = None,
):
    try:
        items = db.list_auth_codes(limit=limit, status=status or None)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"数据库未就绪: {e}") from e
    return {"items": items}


@app.post("/api/v1/admin/auth-codes/{code}/revoke")
def admin_revoke_code(code: str, _: None = Depends(verify_sync_key)):
    try:
        return db.revoke_auth_code(code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"数据库未就绪: {e}") from e


@app.get("/api/v1/admin/stats")
def admin_stats(_: None = Depends(verify_sync_key)):
    from cloud_deploy.cloud_api.admin_portal_service import collect_admin_stats

    return collect_admin_stats()


@app.get("/api/v1/admin/member-feedback")
def admin_list_member_feedback(
    limit: int = 100,
    status: str | None = None,
    _: None = Depends(verify_sync_key),
):
    try:
        items = db.list_member_feedback(limit=min(max(limit, 1), 500), status=status)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"数据库未就绪: {e}") from e
    return {"items": items, "total": len(items)}


@app.patch("/api/v1/admin/member-feedback/{item_id}")
def admin_update_member_feedback(
    item_id: int,
    body: AdminFeedbackUpdateBody,
    _: None = Depends(verify_sync_key),
):
    try:
        ok = db.update_member_feedback(
            item_id,
            status=body.status,
            admin_note=body.admin_note,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"数据库未就绪: {e}") from e
    if not ok:
        raise HTTPException(status_code=404, detail="记录不存在或无变更")
    return {"message": "已更新"}


@app.get("/api/v1/admin/member-keyword-requests")
def admin_list_member_keyword_requests(
    limit: int = 100,
    status: str | None = None,
    _: None = Depends(verify_sync_key),
):
    try:
        items = db.list_member_keyword_requests(limit=min(max(limit, 1), 500), status=status)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"数据库未就绪: {e}") from e
    return {"items": items, "total": len(items)}


@app.patch("/api/v1/admin/member-keyword-requests/{item_id}")
def admin_update_member_keyword_request(
    item_id: int,
    body: AdminFeedbackUpdateBody,
    _: None = Depends(verify_sync_key),
):
    try:
        ok = db.update_member_keyword_request(
            item_id,
            status=body.status,
            admin_note=body.admin_note,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"数据库未就绪: {e}") from e
    if not ok:
        raise HTTPException(status_code=404, detail="记录不存在或无变更")
    return {"message": "已更新"}


class InsightLlmConfigBody(BaseModel):
    enabled: bool | None = None
    provider: str | None = Field(default=None, max_length=32)
    base_url: str | None = Field(default=None, max_length=256)
    model: str | None = Field(default=None, max_length=64)
    api_key: str | None = Field(default=None, max_length=512)
    thinking_disabled: bool | None = None
    budget_tokens_per_day: int | None = Field(default=None, ge=1000, le=10_000_000)


@app.get("/api/v1/admin/insight-llm-config")
def admin_get_insight_llm_config(_: None = Depends(verify_sync_key)):
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="需要 PostgreSQL")
    try:
        from cloud_deploy.cloud_api.database_pg import _conn, init_db
        from cloud_deploy.cloud_api.insight_settings import get_public_config

        init_db()
        conn = _conn()
        try:
            return {"config": get_public_config(conn)}
        finally:
            conn.close()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"读取配置失败: {e}") from e


@app.put("/api/v1/admin/insight-llm-config")
def admin_put_insight_llm_config(body: InsightLlmConfigBody, _: None = Depends(verify_sync_key)):
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="需要 PostgreSQL")
    try:
        from cloud_deploy.cloud_api.database_pg import _conn, init_db
        from cloud_deploy.cloud_api.insight_settings import save_config

        init_db()
        conn = _conn()
        try:
            cfg = save_config(conn, body.model_dump(exclude_unset=True))
            return {"message": "已保存", "config": cfg}
        finally:
            conn.close()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"保存配置失败: {e}") from e


@app.post("/api/v1/admin/insight-llm-config/test")
def admin_test_insight_llm_config(_: None = Depends(verify_sync_key)):
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="需要 PostgreSQL")
    try:
        from cloud_deploy.cloud_api.database_pg import init_db
        from cloud_deploy.cloud_api.insight_settings import apply_runtime_env, describe_public, resolve_runtime_config
        from cloud_deploy.reporting.insight_llm_client import LLMError, chat_json_with_usage

        init_db()
        cfg = apply_runtime_env(resolve_runtime_config())
        if not cfg.get("api_key"):
            raise HTTPException(status_code=400, detail="未配置 API Key")
        parsed, usage = chat_json_with_usage(
            "你是助手。",
            '回复 JSON：{"ok":true,"message":"pong"}',
            temperature=0,
        )
        return {
            "ok": bool(parsed.get("ok")),
            "message": parsed.get("message") or "连接成功",
            "usage": {
                "prompt_tokens": usage.prompt_tokens,
                "completion_tokens": usage.completion_tokens,
                "model": usage.model,
            },
            "config": describe_public(cfg),
        }
    except HTTPException:
        raise
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"测试失败: {e}") from e


# ===== 会员联系配置（微信二维码） =====
class MemberContactBody(BaseModel):
    wechat_qr_url: str = ""
    wechat_label: str = "扫码联系客服"
    contact_text: str = "开通会员 / 定制分析 / 技术支持"
    float_icon_url: str = ""


@app.get("/api/v1/public/member-contact")
def public_get_member_contact():
    """公开接口 — 未登录用户读取微信二维码配置。"""
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        return {"config": {}}
    try:
        from cloud_deploy.cloud_api.database_pg import _conn, init_db
        from cloud_deploy.cloud_api.member_contact_settings import get_public_config

        init_db()
        conn = _conn()
        try:
            return {"config": get_public_config(conn)}
        finally:
            conn.close()
    except Exception as e:
        return {"config": {}, "error": str(e)}


@app.get("/api/v1/admin/member-contact")
def admin_get_member_contact(_: None = Depends(verify_sync_key)):
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="需要 PostgreSQL")
    try:
        from cloud_deploy.cloud_api.database_pg import _conn, init_db
        from cloud_deploy.cloud_api.member_contact_settings import get_public_config

        init_db()
        conn = _conn()
        try:
            return {"config": get_public_config(conn)}
        finally:
            conn.close()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"读取配置失败: {e}") from e


@app.put("/api/v1/admin/member-contact")
def admin_put_member_contact(body: MemberContactBody, _: None = Depends(verify_sync_key)):
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="需要 PostgreSQL")
    try:
        from cloud_deploy.cloud_api.database_pg import _conn, init_db
        from cloud_deploy.cloud_api.member_contact_settings import save_config

        init_db()
        conn = _conn()
        try:
            cfg = save_config(conn, body.model_dump(exclude_unset=True))
            return {"message": "已保存", "config": cfg}
        finally:
            conn.close()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"保存配置失败: {e}") from e


@app.post("/api/v1/admin/member-contact/upload")
async def admin_upload_member_contact_qr(
    file: UploadFile = File(...),
    _: None = Depends(verify_sync_key),
):
    """Admin 后台上传微信二维码图片 → 保存到 assets/uploads/，返回可访问 URL。"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="缺少上传文件")
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="上传文件为空")
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="图片超过 5MB 限制")
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".png", ".jpg", ".jpeg", ".gif", ".webp"):
        raise HTTPException(status_code=400, detail="仅支持 png/jpg/jpeg/gif/webp 格式")
    uploads_dir = os.path.join(_ASSETS, "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    short_ext = ext.lstrip(".") or "png"
    filename = f"wechat_qr_{ts}.{short_ext}"
    save_path = os.path.join(uploads_dir, filename)
    with open(save_path, "wb") as f:
        f.write(raw)
    url = f"/assets/uploads/{filename}"
    return {"url": url, "filename": filename, "size": len(raw)}


@app.get("/api/v1/portal/admin/member-contact")
def portal_admin_get_member_contact(_admin: str = Depends(verify_admin_portal)):
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        return {"config": {}}
    try:
        from cloud_deploy.cloud_api.database_pg import _conn, init_db
        from cloud_deploy.cloud_api.member_contact_settings import get_public_config

        init_db()
        conn = _conn()
        try:
            return {"config": get_public_config(conn)}
        finally:
            conn.close()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"读取配置失败: {e}") from e


@app.put("/api/v1/portal/admin/member-contact")
def portal_admin_put_member_contact(
    body: MemberContactBody,
    _admin: str = Depends(verify_admin_portal),
):
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="需要 PostgreSQL")
    try:
        from cloud_deploy.cloud_api.database_pg import _conn, init_db
        from cloud_deploy.cloud_api.member_contact_settings import save_config

        init_db()
        conn = _conn()
        try:
            cfg = save_config(conn, body.model_dump(exclude_unset=True))
            return {"message": "已保存", "config": cfg}
        finally:
            conn.close()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"保存配置失败: {e}") from e


@app.post("/api/v1/portal/admin/member-contact/upload")
async def portal_admin_upload_contact_qr(
    file: UploadFile = File(...),
    _admin: str = Depends(verify_admin_portal),
):
    return await admin_upload_member_contact_qr(file, _=None)  # type: ignore[arg-type]


# ========== A/B 测试指标 API ==========

class AbTestScoreBody(BaseModel):
    test_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    ranking_key: str = Field(..., min_length=1, max_length=128)
    mode: str = Field(..., pattern=r"^[AB]$")
    accuracy_score: int | None = Field(default=None, ge=1, le=5)
    insight_score: int | None = Field(default=None, ge=1, le=5)
    hallucination: int | None = Field(default=None, ge=0, le=1)


@app.get("/api/v1/admin/ab-test/metrics")
def admin_ab_test_metrics(
    date_from: str | None = None,
    date_to: str | None = None,
    ranking_key: str | None = None,
    mode: str | None = None,
    limit: int = 1000,
    _: None = Depends(verify_sync_key),
):
    """查询 A/B 测试指标（明细）。"""
    try:
        from cloud_deploy.rank_engine.ab_test import list_metrics

        items = list_metrics(
            date_from=date_from,
            date_to=date_to,
            ranking_key=ranking_key,
            mode=mode,
            limit=limit,
        )
        return {"items": items, "count": len(items)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询指标失败: {e}") from e


@app.get("/api/v1/admin/ab-test/aggregate")
def admin_ab_test_aggregate(
    date_from: str | None = None,
    date_to: str | None = None,
    _: None = Depends(verify_sync_key),
):
    """A/B 测试聚合指标（按日 + 总计）。"""
    try:
        from cloud_deploy.rank_engine.ab_test import aggregate_daily, aggregate_total

        return {
            "daily": aggregate_daily(date_from=date_from, date_to=date_to),
            "total": aggregate_total(date_from=date_from, date_to=date_to),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"聚合指标失败: {e}") from e


@app.get("/api/v1/admin/ab-test/dates")
def admin_ab_test_dates(_: None = Depends(verify_sync_key)):
    """列出有 A/B 测试数据的日期（下拉选择用）。"""
    try:
        from cloud_deploy.rank_engine.ab_test import list_test_dates

        return {"dates": list_test_dates(limit=60)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"列日期失败: {e}") from e


@app.put("/api/v1/admin/ab-test/score")
def admin_ab_test_score(body: AbTestScoreBody, _: None = Depends(verify_sync_key)):
    """人工评分录入（准确率/洞察/幻觉标记）。"""
    try:
        from cloud_deploy.rank_engine.ab_test import update_quality_score

        affected = update_quality_score(
            test_date=body.test_date,
            ranking_key=body.ranking_key,
            mode=body.mode,
            accuracy_score=body.accuracy_score,
            insight_score=body.insight_score,
            hallucination=body.hallucination,
        )
        return {"affected": affected, "message": "已更新" if affected else "未找到记录"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"评分录入失败: {e}") from e


@app.get("/api/v1/admin/ab-test/report")
def admin_ab_test_report(
    report_date: str,
    mode: str = "A",
    _: None = Depends(verify_sync_key),
):
    """读取指定日期 + 模式的 advice.json（用于 admin 并排预览 A/B 报告）。"""
    import re as _re

    if not _re.match(r"^\d{4}-\d{2}-\d{2}$", report_date):
        raise HTTPException(status_code=400, detail="report_date 格式应为 YYYY-MM-DD")
    if mode not in ("A", "B"):
        raise HTTPException(status_code=400, detail="mode 必须是 A 或 B")
    cloud_root = os.environ.get("XHS_CLOUD_ROOT", "/opt/xhs-cloud")
    advice_path = os.path.join(
        cloud_root, "data", "advisor_published", report_date, f"mode_{mode.lower()}", "advice.json"
    )
    if not os.path.isfile(advice_path):
        raise HTTPException(status_code=404, detail=f"未找到报告: {advice_path}")
    try:
        with open(advice_path, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取报告失败: {e}") from e


@app.get("/api/v1/sync/status")
def sync_status(_: None = Depends(verify_sync_key)):
    from cloud_deploy.reporting.constants import ARCHIVE_DAILY, ARCHIVE_MONTHLY, ARCHIVE_WEEKLY

    daily_archives = db.list_archives(archive_type=ARCHIVE_DAILY)
    weekly_archives = db.list_archives(archive_type=ARCHIVE_WEEKLY)
    monthly_archives = db.list_archives(archive_type=ARCHIVE_MONTHLY)
    archives = daily_archives
    pool_size = 0
    pending_backfill = 0
    pending_snapshots = 0
    if os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        try:
            from cloud_deploy.cloud_api.database_pg import _conn

            conn = _conn()
            with conn.cursor() as c:
                c.execute("SET search_path TO xhs_monitor, public")
                c.execute("SELECT COUNT(*) FROM monitor_goods WHERE monitor_status='active'")
                pool_size = c.fetchone()[0]
                c.execute(
                    "SELECT COUNT(*) FROM goods_sync_state WHERE sold_daily_backfill_done=FALSE"
                )
                pending_backfill = c.fetchone()[0]
                c.execute(
                    "SELECT COUNT(*) FROM goods_sync_state WHERE sold_snapshots_backfill_done=FALSE"
                )
                pending_snapshots = c.fetchone()[0]
            conn.close()
        except Exception:
            pass
    return {
        "archive_count": len(archives),
        "latest": daily_archives[0] if daily_archives else None,
        "library": {
            "daily": daily_archives[:5],
            "weekly": weekly_archives[:5],
            "monthly": monthly_archives[:5],
        },
        "latest_weekly": weekly_archives[0] if weekly_archives else None,
        "latest_monthly": monthly_archives[0] if monthly_archives else None,
        "monitor_pool_active": pool_size,
        "sold_history_pending_backfill": pending_backfill,
        "sold_snapshots_pending_backfill": pending_snapshots,
    }


@app.post("/api/v1/sync/trigger-period-report")
def sync_trigger_period_report(body: PeriodReportTriggerBody, _: None = Depends(verify_sync_key)):
    """本地编排触发云端周报/月报（PG 聚合 → 同日报 HTML 模板 → zip 登记）。"""
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    from cloud_deploy.scripts.cloud_period_report import generate_period_report

    try:
        result = generate_period_report(body.scope, body.end_date)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    latest = result.get("report_date") or result.get("end_date") or ""
    return {
        "ok": True,
        "scope": body.scope,
        "report_date": latest,
        "row_count": result.get("row_count"),
        "file_name": result.get("file_name"),
        "output_dir": result.get("output_dir"),
        "archive_type": result.get("archive_type"),
    }


@app.post("/api/v1/sync/daily-report")
def sync_daily_report(body: DailyReportSyncBody, _: None = Depends(verify_sync_key)):
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.sync_service import apply_daily_report

    init_db()
    conn = _conn()
    try:
        return apply_daily_report(conn, body.report_date, body.meta, body.items, source=body.source)
    finally:
        conn.close()


@app.post("/api/v1/sync/report-upload")
async def sync_report_upload(
    request: Request,
    file: UploadFile = File(...),
    _: None = Depends(verify_sync_key),
):
    """方案 B：本地 gen_report 打包 zip 上传 → 解压 ingest → 会员可下载。

    产品策略：默认拒绝选品报告上传（XHS_REPORT_UPLOAD_DISABLED=1，默认开启）。
    紧急恢复：服务器设 XHS_REPORT_UPLOAD_DISABLED=0。
    """
    disabled = os.environ.get("XHS_REPORT_UPLOAD_DISABLED", "1").strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )
    if disabled:
        raise HTTPException(
            status_code=403,
            detail="选品报告上传已关闭（会员页不再提供全量日报下载）",
        )
    from cloud_deploy.cloud_api.ingest_guard import ingest_force_enabled

    if not file.filename:
        raise HTTPException(status_code=400, detail="缺少上传文件")
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="上传文件为空")
    max_mb = int(os.environ.get("XHS_REPORT_UPLOAD_MAX_MB", "200") or 200)
    if len(raw) > max_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"文件超过 {max_mb}MB 限制")
    force = ingest_force_enabled(header_value=request.headers.get("X-Upload-Force", ""))
    try:
        from cloud_deploy.cloud_api.report_upload_service import ingest_report_upload_bytes

        return ingest_report_upload_bytes(raw, filename=file.filename or "report.zip", force=force)
    except zipfile.BadZipFile as e:
        raise HTTPException(status_code=400, detail=f"无效 zip: {e}") from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ingest 失败: {e}") from e


@app.post("/api/v1/sync/sold-history")
def sync_sold_history(body: SoldHistorySyncBody, _: None = Depends(verify_sync_key)):
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.sync_service import apply_sold_history_batch

    init_db()
    conn = _conn()
    try:
        n = apply_sold_history_batch(conn, body.rows)
        return {"batch_id": body.batch_id, "rows_upserted": n, "final_batch": body.final_batch}
    finally:
        conn.close()


@app.post("/api/v1/sync/sold-snapshots")
def sync_sold_snapshots(body: SoldSnapshotsSyncBody, _: None = Depends(verify_sync_key)):
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.sync_service import apply_sold_snapshots_batch

    init_db()
    conn = _conn()
    try:
        n = apply_sold_snapshots_batch(conn, body.rows)
        return {"batch_id": body.batch_id, "rows_upserted": n, "final_batch": body.final_batch}
    finally:
        conn.close()


@app.post("/api/v1/sync/prune-snapshots")
def sync_prune_snapshots(_: None = Depends(verify_sync_key)):
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.retention_policy import (
        retention_policy_summary,
        snapshot_prune_enabled,
    )
    from cloud_deploy.cloud_api.sync_service import prune_sold_snapshots

    if not snapshot_prune_enabled():
        return {
            "deleted_rows": 0,
            "skipped": "retention_disabled",
            **retention_policy_summary(),
        }

    init_db()
    conn = _conn()
    try:
        deleted = prune_sold_snapshots(conn)
        return {"deleted_rows": deleted, **retention_policy_summary()}
    finally:
        conn.close()


@app.post("/api/v1/sync/premium-upsert")
def sync_premium_upsert(body: PremiumUpsertBody, _: None = Depends(verify_sync_key)):
    from cloud_deploy.cloud_api.premium_cloud_policy import (
        PREMIUM_CLOUD_SYNC_DISABLED_MSG,
        premium_cloud_sync_enabled,
    )

    if not premium_cloud_sync_enabled():
        raise HTTPException(status_code=410, detail=PREMIUM_CLOUD_SYNC_DISABLED_MSG)
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.premium_sync_service import apply_premium_upsert

    init_db()
    conn = _conn()
    try:
        result = apply_premium_upsert(conn, body.rows, client_id=body.client_id)
        conn.commit()
        return result
    finally:
        conn.close()


@app.get("/api/v1/sync/premium-changes")
def sync_premium_changes(
    since: int = 0,
    limit: int = 500,
    _: None = Depends(verify_sync_key),
):
    from cloud_deploy.cloud_api.premium_cloud_policy import (
        PREMIUM_CLOUD_SYNC_DISABLED_MSG,
        premium_cloud_sync_enabled,
    )

    if not premium_cloud_sync_enabled():
        raise HTTPException(status_code=410, detail=PREMIUM_CLOUD_SYNC_DISABLED_MSG)
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.premium_sync_service import get_premium_changes

    init_db()
    conn = _conn()
    try:
        return get_premium_changes(conn, since=since, limit=limit)
    finally:
        conn.close()


@app.post("/api/v1/sync/premium-snapshots-backfill")
def sync_premium_snapshots_backfill(
    body: PremiumSnapshotsBackfillBody,
    _: None = Depends(verify_sync_key),
):
    from cloud_deploy.cloud_api.premium_cloud_policy import (
        PREMIUM_CLOUD_SYNC_DISABLED_MSG,
        premium_cloud_sync_enabled,
    )

    if not premium_cloud_sync_enabled():
        raise HTTPException(status_code=410, detail=PREMIUM_CLOUD_SYNC_DISABLED_MSG)
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.premium_sync_service import apply_snapshots_backfill

    init_db()
    conn = _conn()
    try:
        result = apply_snapshots_backfill(
            conn, body.goods_id, body.goods_daily, body.store_daily
        )
        conn.commit()
        return result
    finally:
        conn.close()


@app.post("/api/v1/sync/premium-catalog")
def sync_premium_catalog(body: PremiumCatalogBody, _: None = Depends(verify_sync_key)):
    from cloud_deploy.cloud_api.premium_cloud_policy import (
        PREMIUM_CLOUD_SYNC_DISABLED_MSG,
        premium_cloud_sync_enabled,
    )

    if not premium_cloud_sync_enabled():
        raise HTTPException(status_code=410, detail=PREMIUM_CLOUD_SYNC_DISABLED_MSG)
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.premium_sync_service import apply_premium_catalog

    init_db()
    conn = _conn()
    try:
        return apply_premium_catalog(
            conn,
            body.local_ids,
            since_date=body.since_date,
            page=body.page,
            page_size=body.page_size,
        )
    finally:
        conn.close()


@app.post("/api/v1/sync/premium-fetch")
def sync_premium_fetch(body: PremiumFetchBody, _: None = Depends(verify_sync_key)):
    """按 goods_id 拉取云精品行（本地缺的 cloud_only 商品）。"""
    from cloud_deploy.cloud_api.premium_cloud_policy import (
        PREMIUM_CLOUD_SYNC_DISABLED_MSG,
        premium_cloud_sync_enabled,
    )

    if not premium_cloud_sync_enabled():
        raise HTTPException(status_code=410, detail=PREMIUM_CLOUD_SYNC_DISABLED_MSG)
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.premium_sync_service import fetch_premium_goods_by_ids

    init_db()
    conn = _conn()
    try:
        rows = fetch_premium_goods_by_ids(conn, body.goods_ids[:2000])
        return {"rows": rows, "count": len(rows)}
    finally:
        conn.close()


@app.post("/api/v1/sync/premium-daily-fetch")
def sync_premium_daily_fetch(body: PremiumDailyFetchBody, _: None = Depends(verify_sync_key)):
    """按 goods_id 批量拉取云 premium_goods_daily 日快照。"""
    from cloud_deploy.cloud_api.premium_cloud_policy import (
        PREMIUM_CLOUD_SYNC_DISABLED_MSG,
        premium_cloud_sync_enabled,
    )

    if not premium_cloud_sync_enabled():
        raise HTTPException(status_code=410, detail=PREMIUM_CLOUD_SYNC_DISABLED_MSG)
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.premium_sync_service import fetch_premium_goods_daily_by_ids

    init_db()
    conn = _conn()
    try:
        return fetch_premium_goods_daily_by_ids(
            conn,
            body.goods_ids[:500],
            since_date=body.since_date,
            max_rows=body.max_rows,
        )
    finally:
        conn.close()


@app.post("/api/v1/sync/premium-daily-upsert")
def sync_premium_daily_upsert(body: PremiumBatchSyncBody, _: None = Depends(verify_sync_key)):
    """批量推送 premium_goods_daily 日快照（本地历史 → 云 PG）。"""
    from cloud_deploy.cloud_api.premium_cloud_policy import (
        PREMIUM_CLOUD_SYNC_DISABLED_MSG,
        premium_cloud_sync_enabled,
    )

    if not premium_cloud_sync_enabled():
        raise HTTPException(status_code=410, detail=PREMIUM_CLOUD_SYNC_DISABLED_MSG)
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    if not body.rows:
        raise HTTPException(status_code=400, detail="rows 为空")
    if len(body.rows) > 2000:
        raise HTTPException(status_code=400, detail="单批最多 2000 行")
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.premium_sync_service import apply_premium_goods_daily_batch

    init_db()
    conn = _conn()
    try:
        n = apply_premium_goods_daily_batch(conn, body.rows)
        conn.commit()
        return {
            "batch_id": body.batch_id,
            "rows_upserted": n,
            "final_batch": body.final_batch,
        }
    finally:
        conn.close()


app.mount("/assets", StaticFiles(directory=_ASSETS), name="member_assets")


def main():
    s = get_settings()
    import uvicorn

    uvicorn.run(
        "cloud_deploy.cloud_api.main:app",
        host=s.xhs_cloud_host,
        port=s.xhs_cloud_port,
        reload=False,
        workers=1,
    )


if __name__ == "__main__":
    main()

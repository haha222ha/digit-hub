# -*- coding: utf-8 -*-
"""心理测评分销 API 兼容路由（/api/* 与 /api/v1/dist/*）。"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, Field

from cloud_deploy.cloud_api import database as db
from cloud_deploy.cloud_api import dist_orders as dist_ord
from cloud_deploy.cloud_api import dist_db
from cloud_deploy.cloud_api import dist_service as svc
from cloud_deploy.cloud_api.auth import (
    current_user,
    issue_member_token,
    login_member,
    user_from_token,
)
from cloud_deploy.cloud_api.dist_db import init_dist_tables

router = APIRouter(tags=["psy-dist"])
compat_router = APIRouter(tags=["psy-dist-compat"])


def _ok(data: Any = None, message: str = "ok") -> dict:
    return {"code": 200, "message": message, "data": data}


def _fail(message: str, code: int = 400) -> dict:
    return {"code": code, "message": message, "data": None}


class DistLoginBody(BaseModel):
    usernameOrEmail: str = Field(default="")
    username: str = Field(default="")
    password: str = Field(min_length=1)


class DistRegisterBody(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    email: str = Field(default="", max_length=255)
    password: str = Field(min_length=6, max_length=128)
    inviteCode: str = Field(default="")


class LinkGenerateBody(BaseModel):
    testCode: str
    count: int = Field(default=1, ge=1, le=50)


class TokenBody(BaseModel):
    token: str = Field(min_length=8)


class CompleteTestBody(BaseModel):
    token: str = Field(min_length=8)
    resultData: Any = None
    perspective: str | None = None


class RedeemBody(BaseModel):
    code: str = Field(min_length=4)


class OrderCreateBody(BaseModel):
    package_id: int | None = None
    packageId: int | None = None
    payment_method: str = "wxpay"
    paymentMethod: str | None = None


class OrderPayBody(BaseModel):
    payment_method: str = "wxpay"
    paymentMethod: str | None = None
    device_type: str = "mobile"
    deviceType: str | None = None


class RevokeLinkBody(BaseModel):
    linkId: int


class UnlimitedStartBody(BaseModel):
    testCode: str


def _dist_token(request: Request) -> dict:
    auth = request.headers.get("authorization") or ""
    token = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
    if not token:
        raise HTTPException(status_code=401, detail="需要登录")
    return user_from_token(token)


@compat_router.get("/test/{test_code}/{token}", response_class=HTMLResponse)
def compat_test_iframe_shell(test_code: str, token: str):
    """C 端分销入口：iframe 壳内嵌 /tests/{code}/index.html?token=..."""
    safe_code = (test_code or "").replace('"', "")
    safe_token = (token or "").replace('"', "")
    return HTMLResponse(
        f"""<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>心理测评</title><style>html,body,iframe{{margin:0;height:100%;width:100%;border:0}}</style></head><body><iframe src="/tests/{safe_code}/index.html?token={safe_token}"></iframe></body></html>"""
    )


# ----- v1 dist API -----


@router.get("/api/v1/dist/tests/list")
def dist_tests_list_v1():
    return _ok({"tests": svc.list_tests()}, "获取测单列表成功")


@router.get("/api/v1/dist/quota/info")
def dist_quota_info_v1(user: dict = Depends(current_user)):
    return _ok(svc.quota_info(user["id"]), "查询额度信息成功")


@router.post("/api/v1/dist/links/generate")
def dist_links_generate_v1(body: LinkGenerateBody, user: dict = Depends(current_user)):
    try:
        return _ok(svc.generate_links(user["id"], body.testCode, body.count), "生成链接成功")
    except ValueError as e:
        return JSONResponse(_fail(str(e)), status_code=200)


@router.post("/api/v1/dist/links/validate")
def dist_links_validate_v1(body: TokenBody):
    return _ok(svc.validate_token(body.token), "链接校验完成")


@router.post("/api/v1/dist/links/start-test")
def dist_links_start_v1(body: TokenBody):
    try:
        return _ok(svc.start_test(body.token), "测试开始记录成功")
    except ValueError as e:
        return JSONResponse(_fail(str(e)), status_code=200)


@router.post("/api/v1/dist/links/complete-test")
def dist_links_complete_v1(body: CompleteTestBody):
    try:
        return _ok(
            svc.complete_test(body.token, result_data=body.resultData, perspective=body.perspective),
            "测试完成记录成功",
        )
    except ValueError as e:
        return JSONResponse(_fail(str(e)), status_code=200)
    except Exception as e:
        return JSONResponse(_fail(f"完成失败: {e}"), status_code=200)


@router.post("/api/v1/dist/quota/redeem")
def dist_quota_redeem_v1(body: RedeemBody, user: dict = Depends(current_user)):
    try:
        data = svc.redeem_quota_code(user["id"], body.code)
        return _ok(data, "兑换成功")
    except ValueError as e:
        return JSONResponse(_fail(str(e)), status_code=200)


@router.get("/api/v1/dist/admin/packages/list")
def dist_packages_v1():
    return _ok({"packages": svc.list_packages()})


# ----- lingbo-compatible /api/* -----


@compat_router.get("/api/tests/list")
def compat_tests_list():
    return dist_tests_list_v1()


@compat_router.post("/api/auth/login")
def compat_auth_login(body: DistLoginBody, request: Request):
    username = (body.usernameOrEmail or body.username or "").strip()
    device_id = request.headers.get("x-device-id") or "web:psy-dist"
    try:
        res = login_member(username, body.password, device_id, "psy-dist")
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    uid = int(res["membership"]["id"])
    user = svc.map_user_for_dist(uid)
    token = res["access_token"]
    return _ok({"user": user, "token": token}, "登录成功")


@compat_router.post("/api/auth/register")
def compat_auth_register(body: DistRegisterBody, request: Request):
    from cloud_deploy.cloud_api.auth import register_dist_user

    try:
        res = register_dist_user(
            body.username,
            body.password,
            email=body.email,
            invite_code=body.inviteCode,
            device_id=request.headers.get("x-device-id") or "web:psy-dist",
            device_label="psy-dist",
        )
    except ValueError as e:
        return JSONResponse(_fail(str(e)), status_code=200)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    except Exception as e:
        return JSONResponse(_fail(f"注册失败: {e}"), status_code=200)
    uid = int(res["membership"]["id"])
    user = svc.map_user_for_dist(uid)
    return _ok({"user": user, "token": res["access_token"]}, "注册成功")


@compat_router.get("/api/quota/info")
def compat_quota_info(request: Request):
    user = _dist_token(request)
    return _ok(svc.quota_info(user["id"]), "查询额度信息成功")


@compat_router.post("/api/quota/redeem")
def compat_quota_redeem(body: RedeemBody, request: Request):
    user = _dist_token(request)
    try:
        return _ok(svc.redeem_quota_code(user["id"], body.code), "兑换成功")
    except ValueError as e:
        return JSONResponse(_fail(str(e)), status_code=200)


@compat_router.post("/api/links/generate")
def compat_links_generate(body: LinkGenerateBody, request: Request):
    user = _dist_token(request)
    try:
        return _ok(svc.generate_links(user["id"], body.testCode, body.count), "生成链接成功")
    except ValueError as e:
        return JSONResponse(_fail(str(e)), status_code=200)


@compat_router.post("/api/links/validate")
def compat_links_validate(body: TokenBody):
    return dist_links_validate_v1(body)


@compat_router.post("/api/links/start-test")
def compat_links_start(body: TokenBody):
    return dist_links_start_v1(body)


@compat_router.post("/api/links/complete-test")
def compat_links_complete(body: CompleteTestBody):
    return dist_links_complete_v1(body)


@compat_router.get("/api/admin/packages/list")
def compat_packages():
    return dist_packages_v1()


@compat_router.get("/api/admin/payment/purchase-methods")
def compat_purchase_methods():
    return _ok(dist_ord.purchase_methods())


@compat_router.post("/api/orders/create")
def compat_orders_create(body: OrderCreateBody, request: Request):
    user = _dist_token(request)
    pkg_id = int(body.package_id or body.packageId or 0)
    pm = body.payment_method or body.paymentMethod or "wxpay"
    try:
        from cloud_deploy.cloud_api.request_ip import resolve_client_ip

        ip = resolve_client_ip(request) or "127.0.0.1"
        order = dist_ord.create_order(
            user["id"],
            package_id=pkg_id,
            payment_method=pm,
            client_ip=ip,
        )
        return _ok({"order": order}, "订单创建成功")
    except ValueError as e:
        return JSONResponse(_fail(str(e)), status_code=200)
    except Exception as e:
        from cloud_deploy.cloud_api.payment_service import PayRateLimitError

        if isinstance(e, PayRateLimitError):
            return JSONResponse(_fail(str(e)), status_code=200)
        raise


@compat_router.get("/api/orders/{order_no}")
def compat_orders_detail(order_no: str, request: Request):
    user = _dist_token(request)
    try:
        return _ok(dist_ord.get_order_for_user(order_no, user["id"]))
    except ValueError as e:
        return JSONResponse(_fail(str(e)), status_code=200)


@compat_router.post("/api/orders/{order_no}/pay")
def compat_orders_pay(order_no: str, body: OrderPayBody, request: Request):
    user = _dist_token(request)
    pm = body.payment_method or body.paymentMethod or "wxpay"
    dt = body.device_type or body.deviceType or "mobile"
    try:
        data = dist_ord.start_pay(order_no, user["id"], payment_method=pm, device_type=dt)
        if data.get("paid"):
            return _ok({**data, "paid": True}, "支付成功")
        return _ok(data, "发起支付成功")
    except ValueError as e:
        return JSONResponse(_fail(str(e)), status_code=200)


@compat_router.post("/api/orders/{order_no}/pay/html")
def compat_orders_pay_html(order_no: str, body: OrderPayBody, request: Request):
    user = _dist_token(request)
    pm = body.payment_method or body.paymentMethod or "alipay"
    try:
        data = dist_ord.start_pay(order_no, user["id"], payment_method=pm, device_type="mobile")
        payurl = data.get("pay_data") or ""
        if not payurl:
            return HTMLResponse("<h1>未获取到支付链接</h1>", status_code=400)
        html = f'<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="0;url={payurl}"></head><body><p>正在跳转支付…<a href="{payurl}">点此继续</a></p></body></html>'
        return HTMLResponse(html)
    except ValueError as e:
        return HTMLResponse(f"<h1>{e}</h1>", status_code=400)


@compat_router.post("/api/links/revoke")
def compat_links_revoke(body: RevokeLinkBody, request: Request):
    user = _dist_token(request)
    try:
        link = dist_db.revoke_link(user["id"], body.linkId)
        return _ok({"link": link}, "链接已撤销")
    except ValueError as e:
        return JSONResponse(_fail(str(e)), status_code=200)


@compat_router.get("/api/links/list")
def compat_links_list(request: Request, status: str = "", page: str = "1", perPage: str = "20"):
    user = _dist_token(request)
    links = dist_db.list_links(user["id"], status=status or None, limit=int(perPage or 20))
    return _ok(
        {
            "links": links,
            "pagination": {"page": int(page or 1), "perPage": int(perPage or 20), "total": len(links)},
        },
        "获取链接列表成功",
    )


@compat_router.post("/api/admin/unlimited-test/start")
def compat_unlimited_start(body: UnlimitedStartBody, request: Request):
    user = _dist_token(request)
    session = dist_db.create_unlimited_session(user["id"], body.testCode)
    return _ok(session, "无限测模式已开启")


@compat_router.post("/api/admin/unlimited-test/validate")
def compat_unlimited_validate(body: TokenBody):
    session = dist_db.get_unlimited_session(body.token)
    if not session:
        return _ok({"valid": False, "message": "无效 token"}, "链接无效")
    meta = svc.list_tests()
    test = next((t for t in meta if t["test_code"] == session.get("test_code")), None)
    return _ok(
        {
            "valid": True,
            "message": "无限测试模式",
            "unlimited": True,
            "testCode": session.get("test_code"),
            "is_dual_perspective": bool(test and test.get("is_dual_perspective")),
        },
        "链接有效",
    )

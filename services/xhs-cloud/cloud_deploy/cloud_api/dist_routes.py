# -*- coding: utf-8 -*-
"""心理测评分销 API 兼容路由（/api/* 与 /api/v1/dist/*）。"""
from __future__ import annotations

from typing import Any

import os
import time
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, Response
from pydantic import BaseModel, Field

from cloud_deploy.cloud_api import database as db
from cloud_deploy.cloud_api import dist_orders as dist_ord
from cloud_deploy.cloud_api import dist_db
from cloud_deploy.cloud_api import dist_service as svc
from cloud_deploy.cloud_api.auth import (
    change_member_password,
    current_user,
    issue_member_token,
    login_member,
    login_member_by_code,
    user_from_token,
)
from cloud_deploy.cloud_api.dist_db import init_dist_tables

router = APIRouter(tags=["psy-dist"])
compat_router = APIRouter(tags=["psy-dist-compat"])


def _ok(data: Any = None, message: str = "ok") -> dict:
    return {"code": 200, "message": message, "data": data}


def _fail(message: str, code: int = 400) -> dict:
    return {"code": code, "message": message, "data": None}


def _csv_response(rows: list[dict], columns: list[tuple[str, str]], filename: str) -> Response:
    import csv
    import io

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([label for _, label in columns])
    for row in rows:
        writer.writerow([row.get(key, "") for key, _ in columns])
    content = buf.getvalue().encode("utf-8-sig")
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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
    linkId: int | None = None
    linkIds: list[int] | None = None


class LinksExportBody(BaseModel):
    linkIds: list[int] | None = None
    status: str | None = None
    testCode: str | None = None
    test_code: str | None = None
    startDate: str | None = None
    start_date: str | None = None
    endDate: str | None = None
    end_date: str | None = None
    sortBy: str | None = None
    sort_by: str | None = None
    sortOrder: str | None = None
    sort_order: str | None = None


class UnlimitedStartBody(BaseModel):
    testCode: str


class LoginCodeBody(BaseModel):
    auth_code: str = Field(default="")
    authCode: str = Field(default="")
    code: str = Field(default="")


class ChangePasswordBody(BaseModel):
    new_password: str = Field(default="", min_length=0)
    newPassword: str = Field(default="")
    current_password: str = Field(default="")
    currentPassword: str = Field(default="")


class RecoverWithCodeBody(BaseModel):
    auth_code: str = Field(default="")
    authCode: str = Field(default="")
    code: str = Field(default="")
    new_password: str = Field(default="", min_length=0)
    newPassword: str = Field(default="")


def _pick_code(*vals: str) -> str:
    for v in vals:
        s = (v or "").strip()
        if s:
            return s
    return ""


def _dist_token(request: Request) -> dict:
    auth = request.headers.get("authorization") or ""
    token = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
    if not token:
        raise HTTPException(status_code=401, detail="需要登录")
    return user_from_token(token)


def _assert_dist_can_login(user_id: int) -> None:
    dist = dist_db.ensure_distributor(int(user_id))
    st = (dist.get("status") or "active").strip().lower()
    if st in ("deleted", "disabled", "banned"):
        raise HTTPException(status_code=403, detail="账号已停用或已删除，请联系管理员")


@compat_router.get("/test/{test_code}/{token}", response_class=HTMLResponse)
def compat_test_iframe_shell(test_code: str, token: str):
    """C 端分销入口：iframe 壳内嵌 /tests/{code}/index.html?token=..."""
    safe_code = (test_code or "").replace('"', "")
    safe_token = (token or "").replace('"', "")
    return HTMLResponse(
        f"""<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>心象测</title><style>html,body,iframe{{margin:0;height:100%;width:100%;border:0}}</style></head><body><iframe src="/tests/{safe_code}/index.html?token={safe_token}"></iframe></body></html>"""
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
    try:
        _assert_dist_can_login(uid)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    user = svc.map_user_for_dist(uid)
    token = res["access_token"]
    return _ok({"user": user, "token": token}, "登录成功")


@compat_router.post("/api/auth/register")
def compat_auth_register(body: DistRegisterBody, request: Request):
    from cloud_deploy.cloud_api.auth import register_dist_user
    from cloud_deploy.cloud_api.request_ip import resolve_client_ip

    try:
        res = register_dist_user(
            body.username,
            body.password,
            email=body.email,
            invite_code=body.inviteCode,
            device_id=request.headers.get("x-device-id") or "web:psy-dist",
            device_label="psy-dist",
            client_ip=resolve_client_ip(request) or "",
        )
    except ValueError as e:
        return JSONResponse(_fail(str(e)), status_code=200)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    except Exception as e:
        return JSONResponse(_fail(f"注册失败: {e}"), status_code=200)
    uid = int(res["membership"]["id"])
    try:
        _assert_dist_can_login(uid)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    user = svc.map_user_for_dist(uid)
    return _ok({"user": user, "token": res["access_token"]}, "注册成功")


@compat_router.post("/api/auth/login-code")
def compat_auth_login_code(body: LoginCodeBody, request: Request):
    """授权码登录：码须已绑定到账号（如兑换额度时写入 activations）。"""
    code = _pick_code(body.auth_code, body.authCode, body.code)
    if len(code) < 8:
        return JSONResponse(_fail("请输入有效授权码"), status_code=200)
    device_id = request.headers.get("x-device-id") or "web:psy-dist"
    try:
        res = login_member_by_code(code, device_id, "psy-dist")
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    uid = int(res["membership"]["id"])
    try:
        _assert_dist_can_login(uid)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    user = svc.map_user_for_dist(uid)
    return _ok(
        {
            "user": user,
            "token": res["access_token"],
            "login_method": res.get("login_method") or "auth_code",
            "login_hint": res.get("login_hint")
            or "授权码登录成功，建议立即修改密码",
        },
        "授权码登录成功",
    )


@compat_router.post("/api/auth/change-password")
def compat_auth_change_password(body: ChangePasswordBody, request: Request):
    user = _dist_token(request)
    new_pw = _pick_code(body.new_password, body.newPassword)
    cur_pw = _pick_code(body.current_password, body.currentPassword) or None
    if len(new_pw) < 6:
        return JSONResponse(_fail("新密码至少 6 位"), status_code=200)
    try:
        change_member_password(int(user["id"]), new_pw, current_password=cur_pw)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    return _ok({"ok": True}, "密码已更新")


@compat_router.post("/api/auth/recover-with-code")
def compat_auth_recover_with_code(body: RecoverWithCodeBody, request: Request):
    """忘记密码：授权码验证身份后直接设新密码（无需邮箱）。"""
    code = _pick_code(body.auth_code, body.authCode, body.code)
    new_pw = _pick_code(body.new_password, body.newPassword)
    if len(code) < 8:
        return JSONResponse(_fail("请输入有效授权码"), status_code=200)
    if len(new_pw) < 6:
        return JSONResponse(_fail("新密码至少 6 位"), status_code=200)
    device_id = request.headers.get("x-device-id") or "web:psy-dist"
    try:
        res = login_member_by_code(code, device_id, "psy-dist")
        uid = int(res["membership"]["id"])
        change_member_password(uid, new_pw, current_password=None)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    user = svc.map_user_for_dist(uid)
    return _ok(
        {
            "user": user,
            "token": res["access_token"],
            "message": "密码已重置，请使用新密码登录",
        },
        "密码已重置",
    )


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
    ids = list(body.linkIds or [])
    if body.linkId is not None:
        ids.append(int(body.linkId))
    # 去重保序
    seen: set[int] = set()
    uniq: list[int] = []
    for i in ids:
        try:
            ii = int(i)
        except Exception:
            continue
        if ii in seen:
            continue
        seen.add(ii)
        uniq.append(ii)
    try:
        out = dist_db.revoke_links(user["id"], uniq)
        msg = "链接已撤销"
        if int(out.get("refundedQuota") or 0) > 0:
            msg = f"撤销成功，退还 {out['refundedQuota']} 个额度"
        return _ok(out, msg)
    except ValueError as e:
        return JSONResponse(_fail(str(e)), status_code=200)


@compat_router.get("/api/links/list")
def compat_links_list(
    request: Request,
    status: str = "",
    page: str = "1",
    perPage: str = "20",
    per_page: str = "",
    testCode: str = "",
    test_code: str = "",
    startDate: str = "",
    start_date: str = "",
    endDate: str = "",
    end_date: str = "",
    sortBy: str = "",
    sort_by: str = "",
    sortOrder: str = "",
    sort_order: str = "",
):
    user = _dist_token(request)
    pp = int(perPage or per_page or 20)
    pg = int(page or 1)
    tc = (testCode or test_code or "").strip() or None
    data = dist_db.list_links_page(
        user["id"],
        status=(status or "").strip() or None,
        test_code=tc,
        start_date=(startDate or start_date or "").strip() or None,
        end_date=(endDate or end_date or "").strip() or None,
        sort_by=(sortBy or sort_by or "").strip() or None,
        sort_order=(sortOrder or sort_order or "").strip() or None,
        page=pg,
        per_page=pp,
    )
    total = int(data.get("total") or 0)
    return _ok(
        {
            "links": data.get("links") or [],
            "pagination": {
                "page": int(data.get("page") or pg),
                "perPage": int(data.get("per_page") or pp),
                "total": total,
                "totalPages": max(1, (total + pp - 1) // pp) if total else 0,
            },
        },
        "获取链接列表成功",
    )


@compat_router.post("/api/links/export")
def compat_links_export(body: LinksExportBody, request: Request):
    user = _dist_token(request)
    tc = (body.testCode or body.test_code or "").strip() or None
    links = dist_db.export_links_rows(
        user["id"],
        link_ids=body.linkIds,
        status=(body.status or "").strip() or None,
        test_code=tc,
        start_date=(body.startDate or body.start_date or "").strip() or None,
        end_date=(body.endDate or body.end_date or "").strip() or None,
        sort_by=(body.sortBy or body.sort_by or "").strip() or None,
        sort_order=(body.sortOrder or body.sort_order or "").strip() or None,
    )
    lines = ["测试代码\t分销链接\t状态"]
    for l in links:
        code = l.get("test_code") or ""
        token = l.get("token") or ""
        st = l.get("status") or ""
        lines.append(f"{code}\t/test/{code}/{token}\t{st}")
    blob = "\n".join(lines) + ("\n" if lines else "")
    headers = {
        "Content-Disposition": 'attachment; filename="links_export.txt"',
        "Cache-Control": "no-store",
    }
    return Response(content=blob.encode("utf-8"), media_type="text/plain; charset=utf-8", headers=headers)


def _require_unlimited_access(request: Request) -> tuple[dict, dict]:
    """超管始终可开；商家剩余额度 > 10 可开免费测。"""
    user = _dist_token(request)
    dist = svc.map_user_for_dist(int(user["id"]))
    if (dist.get("role") or "") == "super_admin":
        return user, dist
    rem = int(dist.get("remaining_quota") or 0)
    if rem > 10:
        return user, dist
    raise HTTPException(status_code=403, detail="剩余额度需大于 10 才能使用免费测试，请先购买或兑换额度")


@compat_router.post("/api/admin/unlimited-test/start")
def compat_unlimited_start(body: UnlimitedStartBody, request: Request):
    try:
        _user, dist = _require_unlimited_access(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    session = dist_db.create_unlimited_session(int(dist["id"] or _user["id"]), body.testCode)
    return _ok(session, "免费测试已开启（24小时内有效）")


@compat_router.get("/api/quota/redeem-history")
def compat_redeem_history(request: Request, page: str = "1", perPage: str = "20", per_page: str = ""):
    user = _dist_token(request)
    data = dist_db.list_redeem_history(
        user["id"],
        page=int(page or 1),
        per_page=int(perPage or per_page or 20),
    )
    return _ok(data, "ok")


@compat_router.get("/api/admin/quota-logs/list")
def compat_admin_quota_logs(
    request: Request,
    page: str = "1",
    perPage: str = "20",
    per_page: str = "",
    changeType: str = "",
    change_type: str = "",
):
    user = _dist_token(request)
    data = dist_db.list_quota_logs_page(
        user["id"],
        page=int(page or 1),
        per_page=int(perPage or per_page or 20),
        change_type=(changeType or change_type or "").strip() or None,
    )
    return _ok(data, "ok")


@compat_router.get("/api/admin/test-results/list")
def compat_admin_test_results(
    request: Request,
    page: str = "1",
    perPage: str = "20",
    per_page: str = "",
    testCode: str = "",
    test_code: str = "",
    startDate: str = "",
    start_date: str = "",
    endDate: str = "",
    end_date: str = "",
):
    user = _dist_token(request)
    data = dist_db.list_test_results_page(
        user["id"],
        test_code=(testCode or test_code or "").strip() or None,
        start_date=(startDate or start_date or "").strip() or None,
        end_date=(endDate or end_date or "").strip() or None,
        page=int(page or 1),
        per_page=int(perPage or per_page or 20),
    )
    return _ok(data, "ok")


@compat_router.get("/api/admin/test-results/export")
def compat_admin_test_results_export(
    request: Request,
    testCode: str = "",
    test_code: str = "",
    startDate: str = "",
    start_date: str = "",
    endDate: str = "",
    end_date: str = "",
):
    user = _dist_token(request)
    data = dist_db.list_test_results_page(
        user["id"],
        test_code=(testCode or test_code or "").strip() or None,
        start_date=(startDate or start_date or "").strip() or None,
        end_date=(endDate or end_date or "").strip() or None,
        page=1,
        per_page=5000,
    )
    rows = data.get("results") or []
    return _csv_response(
        rows,
        [
            ("id", "ID"),
            ("testCode", "测题"),
            ("token", "Token"),
            ("completedAt", "完成时间"),
            ("perspective", "视角"),
            ("unlimited", "免费测"),
        ],
        "test_results_export.csv",
    )


def _psy_uploads_dir() -> Path:
    env = (os.environ.get("PSY_DIST_UPLOAD_DIR") or "").strip()
    if env:
        return Path(env)
    # 生产默认与 nginx /uploads/ 同源
    prod = Path("/opt/digit-hub/apps/psy-dist/uploads")
    if prod.parent.is_dir() or prod.is_dir():
        return prod
    # 本地 digit-hub 树：.../services/xhs-cloud/cloud_deploy/cloud_api → 上 4 级到 digit-hub
    here = Path(__file__).resolve()
    try:
        return here.parents[4] / "apps" / "psy-dist" / "uploads"
    except Exception:
        return Path("uploads")


@compat_router.post("/api/upload/image")
async def compat_upload_image(request: Request, file: UploadFile = File(...)):
    """上传图片（客服微信二维码等）→ /uploads/..."""
    try:
        _dist_token(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    if not file.filename:
        return JSONResponse(_fail("缺少上传文件"), status_code=200)
    raw = await file.read()
    if not raw:
        return JSONResponse(_fail("上传文件为空"), status_code=200)
    if len(raw) > 5 * 1024 * 1024:
        return JSONResponse(_fail("图片超过 5MB 限制"), status_code=200)
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".png", ".jpg", ".jpeg", ".gif", ".webp"):
        return JSONResponse(_fail("仅支持 png/jpg/jpeg/gif/webp"), status_code=200)
    uploads = _psy_uploads_dir()
    try:
        uploads.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        return JSONResponse(_fail(f"无法创建上传目录: {e}"), status_code=200)
    name = f"file-{int(time.time() * 1000)}-{os.getpid()}{ext}"
    save_path = uploads / name
    try:
        save_path.write_bytes(raw)
    except Exception as e:
        return JSONResponse(_fail(f"保存失败: {e}"), status_code=200)
    url = f"/uploads/{name}"
    return _ok({"url": url, "filename": name, "size": len(raw)}, "上传成功")


@compat_router.post("/api/admin/unlimited-test/validate")
def compat_unlimited_validate(body: TokenBody, request: Request):
    # 须登录；普通分销商也可校验自己开的…但现仅超管可开，故任意登录用户持 token 即可验
    try:
        _dist_token(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    session = dist_db.get_unlimited_session(body.token)
    if not session:
        return _ok({"valid": False, "message": "无限测 token 无效或已过期"}, "链接无效")
    meta = svc.list_tests()
    test = next((t for t in meta if t["test_code"] == session.get("test_code")), None)
    return _ok(
        {
            "valid": True,
            "message": "无限测试模式",
            "unlimited": True,
            "testCode": session.get("test_code"),
            "expiresAt": session.get("expires_at"),
            "is_dual_perspective": bool(test and test.get("is_dual_perspective")),
        },
        "链接有效",
    )


# ----- invite -----


@compat_router.get("/api/invite/info")
def compat_invite_info(request: Request):
    user = _dist_token(request)
    origin = str(request.base_url).rstrip("/")
    # Cloudflare / reverse proxy may report http; prefer public origin when set
    return _ok(dist_db.invite_info(user["id"], site_origin=origin), "ok")


@compat_router.get("/api/invite/records")
def compat_invite_records(request: Request, page: int = 1, per_page: int = 20, perPage: int = 0):
    user = _dist_token(request)
    pp = int(perPage or per_page or 20)
    return _ok(dist_db.invite_records(user["id"], page=int(page or 1), per_page=pp), "ok")


# ----- super-admin -----


class AdjustQuotaBody(BaseModel):
    user_id: int | None = None
    userId: int | None = None
    amount: int = 0
    remark: str = ""


class ToggleStatusBody(BaseModel):
    user_id: int | None = None
    userId: int | None = None
    status: str = "active"


class ResetPasswordBody(BaseModel):
    user_id: int | None = None
    userId: int | None = None
    new_password: str = Field(default="")
    newPassword: str = Field(default="")


class SetRoleBody(BaseModel):
    user_id: int | None = None
    userId: int | None = None
    role: str = "distributor"


class DeleteUserBody(BaseModel):
    user_id: int | None = None
    userId: int | None = None


def _require_super(request: Request) -> tuple[dict, dict]:
    user = _dist_token(request)
    dist = svc.map_user_for_dist(int(user["id"]))
    if (dist.get("role") or "") != "super_admin":
        raise HTTPException(status_code=403, detail="需要超级管理员")
    return user, dist


@compat_router.get("/api/super-admin/dashboard/stats")
def sa_dashboard_stats(request: Request):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    return _ok(dist_db.admin_dist_stats(), "ok")


@compat_router.get("/api/super-admin/users/list")
def sa_users_list(request: Request, limit: int = 100):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    try:
        users = dist_db.admin_list_distributors(limit=int(limit or 100))
        return _ok({"users": users, "list": users, "total": len(users)}, "ok")
    except Exception as e:
        return JSONResponse(_fail(f"加载分销商失败: {e}"), status_code=200)


@compat_router.post("/api/super-admin/users/adjust-quota")
def sa_adjust_quota(body: AdjustQuotaBody, request: Request):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    uid = int(body.user_id or body.userId or 0)
    amount = int(body.amount or 0)
    if uid <= 0 or amount == 0:
        return JSONResponse(_fail("请指定用户与非零额度"), status_code=200)
    try:
        dist = dist_db.adjust_quota(uid, amount, remark=body.remark or "")
        return _ok({"user": dist}, "调额成功")
    except ValueError as e:
        return JSONResponse(_fail(str(e)), status_code=200)


@compat_router.post("/api/super-admin/users/toggle-status")
def sa_toggle_status(body: ToggleStatusBody, request: Request):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    uid = int(body.user_id or body.userId or 0)
    if uid <= 0:
        return JSONResponse(_fail("请指定用户"), status_code=200)
    try:
        return _ok({"user": dist_db.set_distributor_status(uid, body.status)}, "状态已更新")
    except ValueError as e:
        return JSONResponse(_fail(str(e)), status_code=200)


@compat_router.post("/api/super-admin/users/reset-password")
def sa_reset_password(body: ResetPasswordBody, request: Request):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    uid = int(body.user_id or body.userId or 0)
    new_pw = _pick_code(body.new_password, body.newPassword)
    if uid <= 0 or len(new_pw) < 6:
        return JSONResponse(_fail("请指定用户且新密码至少 6 位"), status_code=200)
    try:
        change_member_password(uid, new_pw, current_password=None)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    return _ok({"ok": True}, "密码已重置")


@compat_router.post("/api/super-admin/users/set-role")
def sa_set_role(body: SetRoleBody, request: Request):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    uid = int(body.user_id or body.userId or 0)
    if uid <= 0:
        return JSONResponse(_fail("请指定用户"), status_code=200)
    try:
        return _ok({"user": dist_db.set_distributor_role(uid, body.role)}, "角色已更新")
    except ValueError as e:
        return JSONResponse(_fail(str(e)), status_code=200)


@compat_router.post("/api/super-admin/users/delete")
def sa_delete_user(body: DeleteUserBody, request: Request):
    try:
        user, dist = _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    uid = int(body.user_id or body.userId or 0)
    if uid <= 0:
        return JSONResponse(_fail("请指定用户"), status_code=200)
    if int(user["id"]) == uid:
        return JSONResponse(_fail("不能删除当前登录账号"), status_code=200)
    try:
        row = dist_db.delete_distributor(uid)
    except ValueError as e:
        return JSONResponse(_fail(str(e)), status_code=200)
    from cloud_deploy.cloud_api import dist_ops

    a = {"id": int(user["id"]), "username": dist.get("username") or user.get("username") or ""}
    dist_ops.log_op(
        actor_user_id=a["id"],
        actor_username=a["username"],
        action="user.delete",
        target_id=str(uid),
        detail={"status": "deleted"},
    )
    return _ok({"user": row}, "用户已删除")


@compat_router.get("/api/super-admin/orders")
def sa_orders(request: Request, limit: int = 100):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    raw = dist_db.list_orders_admin(limit=int(limit or 100))
    from cloud_deploy.cloud_api.payment_plans import get_plan

    orders = []
    for row in raw:
        plan = get_plan(row.get("plan_code") or "") or {}
        orders.append(dist_ord.map_order_row(row, plan))
    return _ok({"orders": orders, "list": orders, "total": len(orders)}, "ok")


@compat_router.get("/api/super-admin/orders/export")
def sa_orders_export(request: Request, limit: int = 2000):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    raw = dist_db.list_orders_admin(limit=int(limit or 2000))
    from cloud_deploy.cloud_api.payment_plans import get_plan

    rows = [dist_ord.map_order_row(row, get_plan(row.get("plan_code") or "") or {}) for row in raw]
    return _csv_response(
        rows,
        [
            ("order_no", "订单号"),
            ("package_name", "套餐"),
            ("amount", "金额(分)"),
            ("quota_amount", "额度"),
            ("status", "状态"),
            ("payment_method", "支付方式"),
            ("created_at", "创建时间"),
            ("paid_at", "支付时间"),
        ],
        "orders_export.csv",
    )


@compat_router.get("/api/super-admin/test-results/list")
def sa_test_results(
    request: Request,
    page: str = "1",
    perPage: str = "20",
    per_page: str = "",
    testCode: str = "",
    test_code: str = "",
    userId: str = "",
    user_id: str = "",
):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    uid_raw = (userId or user_id or "").strip()
    uid = int(uid_raw) if uid_raw.isdigit() else None
    data = dist_db.list_test_results_admin(
        user_id=uid,
        test_code=(testCode or test_code or "").strip() or None,
        page=int(page or 1),
        per_page=int(perPage or per_page or 20),
    )
    return _ok(data, "ok")


@compat_router.get("/api/super-admin/quota-logs/list")
def sa_quota_logs(request: Request, limit: int = 100):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    logs = dist_db.list_quota_logs_admin(limit=int(limit or 100))
    return _ok({"logs": logs, "list": logs, "total": len(logs)}, "ok")


@compat_router.get("/api/super-admin/invite-stats/list")
def sa_invite_stats(request: Request, limit: int = 100):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    return _ok(dist_db.admin_invite_overview(limit=int(limit or 100)), "ok")


@compat_router.get("/api/admin/dashboard/stats")
def admin_dashboard_stats(request: Request):
    """分销商工作台简易统计（本人链接 + 近 7 日趋势）。"""
    user = _dist_token(request)
    uid = int(user["id"])
    links = dist_db.list_links(uid, limit=500)
    unused = sum(1 for l in links if (l.get("status") or "unused") == "unused")
    used = sum(1 for l in links if l.get("status") == "used")
    q = svc.quota_info(uid)
    trends = dist_db.merchant_dashboard_trends(uid, days=7)
    return _ok(
        {
            "remaining_quota": q.get("remaining_quota"),
            "quota": q.get("quota"),
            "used_quota": q.get("used_quota"),
            "links_total": len(links),
            "links_unused": unused,
            "links_used": used,
            "trends": trends,
        },
        "ok",
    )

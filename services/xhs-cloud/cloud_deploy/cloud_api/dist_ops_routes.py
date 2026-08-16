# -*- coding: utf-8 -*-
"""心理测评分销 · 运营/超管扩展路由（公告/教程/套餐/兑换码/支付统计等）。"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from cloud_deploy.cloud_api import database as db
from cloud_deploy.cloud_api import dist_db
from cloud_deploy.cloud_api import dist_ops
from cloud_deploy.cloud_api import dist_service as svc
from cloud_deploy.cloud_api.auth import user_from_token
from cloud_deploy.cloud_api.admin_auth_codes_service import generate_auth_codes_request

ops_router = APIRouter(tags=["psy-dist-ops"])


def _ok(data: Any = None, message: str = "ok") -> dict:
    return {"code": 200, "message": message, "data": data}


def _fail(message: str, code: int = 400) -> dict:
    return {"code": code, "message": message, "data": None}


def _token_user(request: Request) -> dict:
    auth = request.headers.get("authorization") or ""
    token = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
    if not token:
        raise HTTPException(status_code=401, detail="需要登录")
    return user_from_token(token)


def _require_super(request: Request) -> tuple[dict, dict]:
    user = _token_user(request)
    dist = svc.map_user_for_dist(int(user["id"]))
    if (dist.get("role") or "") != "super_admin":
        raise HTTPException(status_code=403, detail="需要超级管理员")
    return user, dist


def _actor(user: dict, dist: dict) -> dict:
    return {"id": int(user["id"]), "username": dist.get("username") or user.get("username") or ""}


# ----- merchant-facing -----


@ops_router.get("/api/announcements/list")
def announcements_list(request: Request):
    user = _token_user(request)
    items = dist_ops.announcements_for_user(user["id"])
    unread = sum(1 for a in items if not a.get("is_read"))
    return _ok({"announcements": items, "list": items, "unread": unread})


@ops_router.get("/api/announcements/unread-count")
def announcements_unread(request: Request):
    user = _token_user(request)
    return _ok({"count": dist_ops.announcement_unread_count(user["id"])})


@ops_router.post("/api/announcements/mark-read")
def announcements_mark_read(request: Request, body: dict | None = None):
    user = _token_user(request)
    aid = (body or {}).get("id") or (body or {}).get("announcement_id")
    dist_ops.mark_announcements_read(user["id"], int(aid) if aid else None)
    return _ok({"ok": True})


@ops_router.post("/api/announcements/mark-all-read")
def announcements_mark_all(request: Request):
    user = _token_user(request)
    dist_ops.mark_announcements_read(user["id"], None)
    return _ok({"ok": True})


@ops_router.get("/api/admin/config/get")
@ops_router.get("/api/config/customer-service")
def admin_config_get(request: Request):
    _token_user(request)
    cfg = dist_ops.get_config()
    # 商家只看客服相关
    return _ok(
        {
            "customer_service_wechat": cfg.get("customer_service_wechat"),
            "customer_service_hours": cfg.get("customer_service_hours"),
            "customer_service_response_time": cfg.get("customer_service_response_time"),
            "customer_service_qrcode": cfg.get("customer_service_qrcode"),
            "xianyu_shop_link": cfg.get("xianyu_shop_link"),
            "xianyu_shop_qrcode": cfg.get("xianyu_shop_qrcode"),
            "site_name": cfg.get("site_name"),
            "invite_rebate_percent": cfg.get("invite_rebate_percent"),
        }
    )


@ops_router.get("/api/tutorials/list")
def tutorials_public(request: Request):
    _token_user(request)
    items = dist_ops.list_tutorials(published_only=True)
    return _ok({"tutorials": items, "list": items})


@ops_router.get("/api/tutorials/guide")
def tutorials_guide(request: Request):
    user = _token_user(request)
    return _ok(dist_ops.tutorial_guide(int(user["id"])), "获取教程指导成功")


@ops_router.get("/api/help-documents/list")
def help_public(request: Request):
    _token_user(request)
    items = dist_ops.list_help_docs(published_only=True)
    return _ok({"documents": items, "list": items})


@ops_router.get("/api/admin/package-documents/list")
def admin_package_docs_list(request: Request):
    _token_user(request)
    docs = dist_ops.list_package_documents()
    return _ok({"documents": docs, "list": docs, "total": len(docs)})


# ----- super-admin config -----


@ops_router.get("/api/super-admin/config/get")
def sa_config_get(request: Request):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    return _ok(dist_ops.get_config())


class ConfigUpdateBody(BaseModel):
    class Config:
        extra = "allow"


@ops_router.post("/api/super-admin/config/update")
def sa_config_update(body: dict, request: Request):
    try:
        user, dist = _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    cfg = dist_ops.update_config(body or {})
    a = _actor(user, dist)
    dist_ops.log_op(actor_user_id=a["id"], actor_username=a["username"], action="config.update", detail=body)
    return _ok(cfg, "配置已保存")


@ops_router.post("/api/super-admin/config/test-wecom-webhook")
def sa_test_wecom(request: Request):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    cfg = dist_ops.get_config()
    url = (cfg.get("wecom_webhook") or "").strip()
    if not url:
        return JSONResponse(_fail("未配置企微 Webhook"), status_code=200)
    try:
        import urllib.request

        req = urllib.request.Request(
            url,
            data='{"msgtype":"text","text":{"content":"xinxiangce super-admin webhook ok"}}'.encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            raw = resp.read().decode("utf-8", errors="ignore")
        return _ok({"response": raw[:500]}, "已发送测试消息")
    except Exception as e:
        return JSONResponse(_fail(f"发送失败: {e}"), status_code=200)


# ----- announcements CRUD -----


@ops_router.get("/api/super-admin/announcements/list")
def sa_ann_list(request: Request):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    items = dist_ops.list_announcements(published_only=False)
    return _ok({"announcements": items, "list": items, "total": len(items)})


@ops_router.post("/api/super-admin/announcements/save")
def sa_ann_save(body: dict, request: Request):
    try:
        user, dist = _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    try:
        row = dist_ops.save_announcement(body or {})
    except ValueError as e:
        return JSONResponse(_fail(str(e)), status_code=200)
    a = _actor(user, dist)
    dist_ops.log_op(actor_user_id=a["id"], actor_username=a["username"], action="announcement.save", target_id=str(row.get("id")), detail=body)
    return _ok(row, "已保存")


@ops_router.post("/api/super-admin/announcements/delete/{aid}")
@ops_router.delete("/api/super-admin/announcements/delete/{aid}")
def sa_ann_delete(aid: int, request: Request):
    try:
        user, dist = _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    dist_ops.delete_announcement(aid)
    a = _actor(user, dist)
    dist_ops.log_op(actor_user_id=a["id"], actor_username=a["username"], action="announcement.delete", target_id=str(aid))
    return _ok({"ok": True}, "已删除")


# ----- tutorials / help -----


@ops_router.get("/api/super-admin/tutorials/list")
def sa_tut_list(request: Request):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    items = dist_ops.list_tutorials(published_only=False)
    return _ok({"tutorials": items, "list": items})


@ops_router.post("/api/super-admin/tutorials/save")
def sa_tut_save(body: dict, request: Request):
    try:
        user, dist = _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    try:
        row = dist_ops.save_tutorial(body or {})
    except ValueError as e:
        return JSONResponse(_fail(str(e)), status_code=200)
    a = _actor(user, dist)
    dist_ops.log_op(actor_user_id=a["id"], actor_username=a["username"], action="tutorial.save", target_id=str(row.get("id")))
    return _ok(row)


@ops_router.post("/api/super-admin/tutorials/delete/{tid}")
def sa_tut_delete(tid: int, request: Request):
    try:
        user, dist = _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    dist_ops.delete_tutorial(tid)
    a = _actor(user, dist)
    dist_ops.log_op(actor_user_id=a["id"], actor_username=a["username"], action="tutorial.delete", target_id=str(tid))
    return _ok({"ok": True})


@ops_router.get("/api/super-admin/help-documents/list")
def sa_help_list(request: Request):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    items = dist_ops.list_help_docs(published_only=False)
    return _ok({"documents": items, "list": items})


@ops_router.post("/api/super-admin/help-documents/save")
def sa_help_save(body: dict, request: Request):
    try:
        user, dist = _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    try:
        row = dist_ops.save_help_doc(body or {})
    except ValueError as e:
        return JSONResponse(_fail(str(e)), status_code=200)
    a = _actor(user, dist)
    dist_ops.log_op(actor_user_id=a["id"], actor_username=a["username"], action="help.save", target_id=str(row.get("id")))
    return _ok(row)


@ops_router.post("/api/super-admin/help-documents/delete/{hid}")
def sa_help_delete(hid: int, request: Request):
    try:
        user, dist = _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    dist_ops.delete_help_doc(hid)
    a = _actor(user, dist)
    dist_ops.log_op(actor_user_id=a["id"], actor_username=a["username"], action="help.delete", target_id=str(hid))
    return _ok({"ok": True})


# ----- packages -----


@ops_router.get("/api/super-admin/packages/list")
def sa_pkg_list(request: Request):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    pkgs = dist_ops.list_packages_merged(include_disabled=True)
    return _ok({"packages": pkgs, "list": pkgs, "total": len(pkgs)})


@ops_router.post("/api/super-admin/packages/save")
def sa_pkg_save(body: dict, request: Request):
    try:
        user, dist = _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    try:
        row = dist_ops.save_package(body or {})
    except ValueError as e:
        return JSONResponse(_fail(str(e)), status_code=200)
    a = _actor(user, dist)
    dist_ops.log_op(actor_user_id=a["id"], actor_username=a["username"], action="package.save", target_id=str(row.get("plan_code")), detail=body)
    return _ok(row, "套餐已保存")


@ops_router.post("/api/super-admin/packages/delete/{key}")
def sa_pkg_delete(key: str, request: Request):
    try:
        user, dist = _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    dist_ops.delete_package(key)
    a = _actor(user, dist)
    dist_ops.log_op(actor_user_id=a["id"], actor_username=a["username"], action="package.delete", target_id=str(key))
    return _ok({"ok": True}, "已删除")


# ----- tests -----


@ops_router.get("/api/super-admin/tests/list")
def sa_tests_list_full(request: Request):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    tests = svc.list_tests(include_disabled=True)
    return _ok({"tests": tests, "list": tests, "total": len(tests)})


@ops_router.post("/api/super-admin/tests/save")
@ops_router.post("/api/super-admin/tests/toggle-status")
def sa_tests_save(body: dict, request: Request):
    try:
        user, dist = _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    try:
        row = dist_ops.save_test_override(body or {})
    except ValueError as e:
        return JSONResponse(_fail(str(e)), status_code=200)
    a = _actor(user, dist)
    dist_ops.log_op(actor_user_id=a["id"], actor_username=a["username"], action="test.override", target_id=str(row.get("test_code")), detail=body)
    return _ok(row, "已更新")


@ops_router.post("/api/super-admin/tests/update-order")
def sa_tests_order(body: dict, request: Request):
    try:
        user, dist = _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    items = body.get("items") or body.get("tests") or []
    dist_ops.update_test_orders(items)
    a = _actor(user, dist)
    dist_ops.log_op(actor_user_id=a["id"], actor_username=a["username"], action="test.reorder", detail={"count": len(items)})
    return _ok({"ok": True}, "排序已更新")


# ----- redeem codes -----


class RedeemGenBody(BaseModel):
    count: int = Field(default=1, ge=1, le=200)
    plan_code: str = "psy_quota_100"
    product: str = "psy_dist"
    sku: str = ""
    note: str = ""
    channel: str = "psy-console"


@ops_router.get("/api/super-admin/redeem-codes/list")
def sa_redeem_list(request: Request, limit: int = 100):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    rows = db.list_auth_codes(limit=max(1, min(int(limit or 100), 500)))
    rows = [r for r in rows if str(r.get("plan_code") or "").startswith("psy_quota") or str(r.get("plan_code") or "").startswith("psy_dist")]
    return _ok({"codes": rows, "list": rows, "total": len(rows)})


@ops_router.post("/api/super-admin/redeem-codes/generate")
def sa_redeem_gen(body: RedeemGenBody, request: Request):
    try:
        user, dist = _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    sku = (body.sku or "").strip()
    plan = (body.plan_code or "").strip()
    if not sku:
        # map common plans
        if plan.endswith("100000") or "100000" in plan:
            sku = "quota_100000"
        elif plan.endswith("500"):
            sku = "quota_500"
        else:
            sku = "quota_100"
            plan = plan or "psy_quota_100"
    try:
        res = generate_auth_codes_request(
            count=body.count,
            plan_code=plan if not body.product else "",
            product=body.product or "psy_dist",
            sku=sku,
            channel=body.channel or "psy-console",
            note=body.note or "",
        )
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    a = _actor(user, dist)
    dist_ops.log_op(
        actor_user_id=a["id"],
        actor_username=a["username"],
        action="redeem.generate",
        detail={"count": body.count, "sku": sku, "plan": plan},
    )
    return _ok(res, "已生成兑换码")


class RedeemRevokeBody(BaseModel):
    code: str = ""


@ops_router.post("/api/super-admin/redeem-codes/revoke")
def sa_redeem_revoke(body: RedeemRevokeBody, request: Request):
    try:
        user, dist = _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    code = (body.code or "").strip()
    if not code:
        return JSONResponse(_fail("请提供兑换码"), status_code=200)
    try:
        row = db.revoke_auth_code(code)
    except Exception as e:
        return JSONResponse(_fail(str(e)), status_code=200)
    a = _actor(user, dist)
    dist_ops.log_op(actor_user_id=a["id"], actor_username=a["username"], action="redeem.revoke", target_id=code)
    return _ok(row, "已吊销")


# ----- payment stats / ops logs -----


@ops_router.get("/api/super-admin/payment-stats")
def sa_pay_stats(request: Request):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    return _ok(dist_ops.payment_stats())


@ops_router.get("/api/super-admin/payment-stats/range")
def sa_pay_stats_range(request: Request, start_date: str = "", end_date: str = ""):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    return _ok(dist_ops.payment_stats_range(start_date, end_date))


@ops_router.get("/api/super-admin/selection-reports")
def sa_selection_reports(request: Request, theme: str = ""):
    """测评类选品/成交情报（热库快照），仅超管。"""
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    try:
        from cloud_deploy.cloud_api.selection_intel import load_selection_intel

        data = load_selection_intel(theme=theme or None)
    except FileNotFoundError as e:
        return JSONResponse(_fail(str(e), code=404), status_code=200)
    except Exception as e:
        return JSONResponse(_fail(f"读取选品快照失败: {e}", code=500), status_code=200)
    return _ok(data, "测评选品报告")


@ops_router.get("/api/super-admin/payment-config")
def sa_pay_config(request: Request):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    cfg = dist_ops.get_config()
    return _ok(
        {
            "wxpay_configured": cfg.get("payment_wxpay_configured"),
            "alipay_configured": cfg.get("payment_alipay_configured"),
            "wechat_enabled": str(cfg.get("payment_wechat_enabled", "true")).lower() in ("1", "true", "yes"),
            "alipay_enabled": str(cfg.get("payment_alipay_enabled", "true")).lower() in ("1", "true", "yes"),
            "xianyu_fallback_enabled": str(cfg.get("payment_xianyu_fallback_enabled", "true")).lower()
            in ("1", "true", "yes"),
            "notify_base": cfg.get("payment_notify_base"),
            "test_enabled": cfg.get("payment_test_enabled"),
            "note": "支付密钥仅能通过服务器环境变量配置；此处可开关展示通道与闲鱼兜底。",
        }
    )


@ops_router.post("/api/super-admin/payment-config")
def sa_pay_config_save(body: dict, request: Request):
    try:
        user, dist = _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    payload = body or {}
    mapped = {}
    if "wechat_enabled" in payload:
        mapped["payment_wechat_enabled"] = "true" if payload.get("wechat_enabled") else "false"
    if "alipay_enabled" in payload:
        mapped["payment_alipay_enabled"] = "true" if payload.get("alipay_enabled") else "false"
    if "xianyu_fallback_enabled" in payload:
        mapped["payment_xianyu_fallback_enabled"] = "true" if payload.get("xianyu_fallback_enabled") else "false"
    dist_ops.update_payment_config(mapped)
    a = _actor(user, dist)
    dist_ops.log_op(
        actor_user_id=a["id"],
        actor_username=a["username"],
        action="payment_config.update",
        detail=mapped,
    )
    return sa_pay_config(request)


@ops_router.get("/api/super-admin/payment-notify-logs")
def sa_payment_notify_logs(
    request: Request,
    page: str = "1",
    perPage: str = "20",
    per_page: str = "",
    orderNo: str = "",
    order_no: str = "",
    status: str = "",
):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    data = dist_db.list_payment_notify_logs_page(
        page=int(page or 1),
        per_page=int(perPage or per_page or 20),
        order_no=(orderNo or order_no or "").strip() or None,
        status=(status or "").strip() or None,
    )
    return _ok(data)


@ops_router.get("/api/super-admin/payment-notify-logs/{log_id}")
def sa_payment_notify_log_detail(log_id: int, request: Request):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    row = dist_db.get_payment_notify_log(int(log_id))
    if not row:
        return JSONResponse(_fail("记录不存在"), status_code=200)
    return _ok(row)


@ops_router.get("/api/super-admin/payment-notify-logs/export")
def sa_payment_notify_logs_export(
    request: Request,
    limit: int = 5000,
    orderNo: str = "",
    order_no: str = "",
    status: str = "",
):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    from fastapi.responses import Response
    import csv
    import io

    logs = dist_db.list_payment_notify_logs_export(
        limit=int(limit or 5000),
        order_no=(orderNo or order_no or "").strip() or None,
        status=(status or "").strip() or None,
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["ID", "订单号", "交易状态", "验证结果", "响应", "客户端IP", "时间"])
    for row in logs:
        writer.writerow(
            [
                row.get("id"),
                row.get("order_no") or "",
                row.get("trade_status") or "",
                row.get("status") or "",
                row.get("response_text") or "",
                row.get("client_ip") or "",
                row.get("created_at") or "",
            ]
        )
    content = buf.getvalue().encode("utf-8-sig")
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="payment_notify_logs_export.csv"'},
    )


@ops_router.get("/api/super-admin/operation-logs/list")
def sa_op_logs(request: Request, limit: int = 100):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    logs = dist_ops.list_operation_logs(limit=int(limit or 100))
    return _ok({"logs": logs, "list": logs, "total": len(logs)})


@ops_router.get("/api/super-admin/operation-logs/export")
def sa_op_logs_export(request: Request, limit: int = 5000):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    from fastapi.responses import Response
    import csv
    import io

    logs = dist_db.list_operation_logs_export(limit=int(limit or 5000))
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["ID", "操作者", "动作", "目标", "详情", "时间"])
    for row in logs:
        writer.writerow(
            [
                row.get("id"),
                row.get("actor_username") or row.get("actor_user_id") or "",
                row.get("action") or "",
                row.get("target_id") or "",
                row.get("detail") or "",
                row.get("created_at") or "",
            ]
        )
    content = buf.getvalue().encode("utf-8-sig")
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="operation_logs_export.csv"'},
    )


@ops_router.get("/api/super-admin/operation-logs/detail/{log_id}")
def sa_op_log_detail(log_id: int, request: Request):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    row = dist_db.get_operation_log(int(log_id))
    if not row:
        return JSONResponse(_fail("记录不存在"), status_code=200)
    return _ok(row)


@ops_router.post("/api/super-admin/users/toggle-detailed-tutorial-access")
def sa_tut_access(body: dict, request: Request):
    try:
        user, dist = _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    uid = int(body.get("user_id") or body.get("userId") or 0)
    enabled = bool(body.get("enabled", body.get("detailed_tutorial_access", True)))
    if uid <= 0:
        return JSONResponse(_fail("请指定用户"), status_code=200)
    row = dist_ops.set_tutorial_access(uid, enabled)
    a = _actor(user, dist)
    dist_ops.log_op(actor_user_id=a["id"], actor_username=a["username"], action="user.tutorial_access", target_id=str(uid), detail={"enabled": enabled})
    return _ok({"user": row, "detailed_tutorial_access": bool(row.get("detailed_tutorial_access"))})


@ops_router.get("/api/super-admin/package-documents/list")
def sa_package_docs_list(request: Request):
    try:
        _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    docs = dist_ops.list_package_documents()
    return _ok({"documents": docs, "list": docs, "total": len(docs)})


@ops_router.post("/api/super-admin/package-documents/save")
def sa_package_docs_save(body: dict, request: Request):
    try:
        user, dist = _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    try:
        row = dist_ops.save_package_document(body or {})
    except ValueError as e:
        return JSONResponse(_fail(str(e)), status_code=200)
    a = _actor(user, dist)
    dist_ops.log_op(
        actor_user_id=a["id"],
        actor_username=a["username"],
        action="package_document.save",
        target_id=str(row.get("id")),
        detail=body,
    )
    return _ok(row, "保存成功")


@ops_router.post("/api/super-admin/package-documents/delete/{doc_id}")
@ops_router.delete("/api/super-admin/package-documents/delete/{doc_id}")
def sa_package_docs_delete(doc_id: int, request: Request):
    try:
        user, dist = _require_super(request)
    except HTTPException as e:
        return JSONResponse(_fail(str(e.detail), code=e.status_code), status_code=200)
    dist_ops.delete_package_document(int(doc_id))
    a = _actor(user, dist)
    dist_ops.log_op(
        actor_user_id=a["id"],
        actor_username=a["username"],
        action="package_document.delete",
        target_id=str(doc_id),
    )
    return _ok(None, "已删除")

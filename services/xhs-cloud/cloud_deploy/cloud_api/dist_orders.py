# -*- coding: utf-8 -*-
"""心理测评分销 · 订单桥接（分销 Vue 管理台 ↔ xhs-cloud hwxun 支付）。"""
from __future__ import annotations

from cloud_deploy.cloud_api import database as db
from cloud_deploy.cloud_api import payment_service as pay
from cloud_deploy.cloud_api.payment_plans import get_plan


def _packages_index() -> dict[int, dict]:
    from cloud_deploy.cloud_api import dist_ops

    out: dict[int, dict] = {}
    for p in dist_ops.list_packages_merged(include_disabled=False):
        pid = int(p.get("list_id") or p.get("id") or 0)
        if pid:
            out[pid] = {
                **p,
                "id": pid,
                "label": p.get("name") or p.get("label") or p.get("plan_code"),
                "amount": str(p.get("price_yuan") if p.get("price_yuan") is not None else p.get("amount") or "0"),
                "quota_amount": int(p.get("quota_amount") or p.get("quota") or 0),
            }
    return out


def get_package(package_id: int) -> dict | None:
    from cloud_deploy.cloud_api import dist_ops

    pkg = dist_ops.get_package_by_id(int(package_id))
    if not pkg:
        return _packages_index().get(int(package_id))
    return {
        **pkg,
        "id": int(pkg.get("list_id") or pkg.get("id") or package_id),
        "label": pkg.get("name") or pkg.get("label") or pkg.get("plan_code"),
        "amount": str(pkg.get("price_yuan") if pkg.get("price_yuan") is not None else pkg.get("amount") or "0"),
        "quota_amount": int(pkg.get("quota_amount") or pkg.get("quota") or 0),
        "plan_code": pkg.get("plan_code"),
    }


def _yuan_to_cents(amount: str | float) -> int:
    try:
        return int(round(float(amount) * 100))
    except (TypeError, ValueError):
        return 0


def map_order_row(row: dict, plan: dict | None = None) -> dict:
    plan = plan or get_plan(row.get("plan_code") or "") or {}
    amount_cents = _yuan_to_cents(row.get("amount") or plan.get("amount") or 0)
    quota = int(plan.get("quota_amount") or 0)
    status = row.get("status") or "pending"
    if status == "paid":
        vue_status = "paid"
    elif status in ("expired", "cancelled"):
        vue_status = "closed"
    else:
        vue_status = "pending"
    return {
        "id": row.get("id"),
        "order_no": row.get("order_no") or "",
        "package_id": next(
            (pid for pid, p in _packages_index().items() if p.get("plan_code") == row.get("plan_code")),
            None,
        ),
        "package_name": plan.get("label") or row.get("plan_code") or "",
        "quota_amount": quota,
        "quota_value": quota,
        "amount": amount_cents,
        "status": vue_status,
        "payment_method": row.get("channel") or "wxpay",
        "created_at": row.get("created_at") or "",
        "paid_at": row.get("paid_at"),
    }


def create_order(
    user_id: int,
    *,
    package_id: int,
    payment_method: str = "wxpay",
    client_ip: str = "127.0.0.1",
    device: str = "mobile",
) -> dict:
    pkg = get_package(package_id)
    if not pkg:
        raise ValueError("套餐不存在")
    channel = "alipay" if str(payment_method or "").lower().startswith("ali") else "wxpay"
    created = pay.create_order(
        plan_code=pkg["plan_code"],
        user_id=user_id,
        client_ip=client_ip,
        channel=channel,
        device=device,
    )
    row = db.get_payment_order(created["order_no"]) or created
    return map_order_row(row, pkg)


def get_order_for_user(order_key: str, user_id: int) -> dict:
    row = db.get_payment_order(str(order_key or "").strip())
    if not row:
        raise ValueError("订单不存在")
    if row.get("user_id") and int(row["user_id"]) != int(user_id):
        raise ValueError("无权查看该订单")
    plan = get_plan(row.get("plan_code") or "")
    return {"order": map_order_row(row, plan)}


def _payurl_for_row(row: dict) -> tuple[str, str]:
    from cloud_deploy.cloud_api.hwxun_pay import build_epay_submit_url
    from cloud_deploy.cloud_api.payment_plans import is_addon_plan, is_assess_plan, is_psy_dist_plan

    plan = get_plan(row.get("plan_code") or "") or {}
    channel = row.get("channel") or "wxpay"
    if is_assess_plan(plan.get("plan_code") or ""):
        goods_name = f"心象测-{plan.get('label') or '测评'}"
    elif is_addon_plan(plan.get("plan_code") or ""):
        goods_name = f"定制分析-{plan.get('label') or '定制'}"
    elif is_psy_dist_plan(plan.get("plan_code") or ""):
        goods_name = f"心理分销-{plan.get('label') or '额度'}"
    else:
        goods_name = f"AI选品会员-{plan.get('label') or '会员'}"
    payurl = build_epay_submit_url(
        channel=channel,
        out_trade_no=row["order_no"],
        amount=row["amount"],
        name=goods_name,
        notify_url=pay._notify_url(),
        return_url=pay._return_url(row["order_no"]),
        sitename="心理分销",
    )
    qrcode = (row.get("qrcode") or "").strip()
    return payurl, qrcode


def start_pay(order_key: str, user_id: int, *, payment_method: str = "wxpay", device_type: str = "mobile") -> dict:
    detail = get_order_for_user(order_key, user_id)
    order = detail["order"]
    row = db.get_payment_order(order["order_no"])
    if not row:
        raise ValueError("订单不存在")
    if row.get("status") == "paid":
        return {"order": order, "paid": True, "pay_type": "paid", "pay_data": ""}

    channel = "alipay" if str(payment_method or "").lower().startswith("ali") else "wxpay"
    row = {**row, "channel": channel}
    payurl, qrcode = _payurl_for_row(row)
    if payurl:
        return {"order": order, "pay_type": "jsapi_link", "pay_data": payurl}
    if qrcode:
        return {"order": order, "pay_type": "code_url", "pay_data": qrcode}
    raise ValueError("未获取到支付链接，请稍后重试")


def purchase_methods() -> dict:
    from cloud_deploy.cloud_api.hwxun_pay import channel_merchant_credentials

    wechat = False
    alipay = False
    try:
        channel_merchant_credentials("wxpay")
        wechat = True
    except RuntimeError:
        wechat = False
    try:
        channel_merchant_credentials("alipay")
        alipay = True
    except RuntimeError:
        alipay = False
    online = wechat or alipay
    return {
        "wechat": wechat,
        "alipay": alipay,
        "wechat_available": wechat,
        "alipay_available": alipay,
        "online_payment_available": online,
        "any_purchase_available": online,
        "mock_mode": not online,
        "xianyu_fallback_enabled": False,
    }

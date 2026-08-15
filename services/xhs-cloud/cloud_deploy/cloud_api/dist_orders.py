# -*- coding: utf-8 -*-
"""心理测评分销 · 订单桥接（分销 Vue 管理台 ↔ xhs-cloud 支付：hwxun / Waffo）。"""
from __future__ import annotations

from cloud_deploy.cloud_api import database as db
from cloud_deploy.cloud_api import payment_service as pay
from cloud_deploy.cloud_api.payment_plans import get_plan, normalize_currency, resolve_plan_amount


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


def _normalize_method(payment_method: str) -> str:
    m = str(payment_method or "wxpay").strip().lower()
    if m.startswith("ali"):
        return "alipay"
    if m in ("waffo", "card", "international", "intl", "sea"):
        return "waffo"
    if m.startswith("wx") or m == "wechat":
        return "wxpay"
    return m or "wxpay"


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
        "currency": row.get("currency") or "CNY",
        "psp": row.get("psp") or "hwxun",
        "country": row.get("country") or "",
        "status": vue_status,
        "payment_method": row.get("channel") or "wxpay",
        "payurl": row.get("payurl") or "",
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
    currency: str | None = None,
    country: str | None = None,
) -> dict:
    pkg = get_package(package_id)
    if not pkg:
        raise ValueError("套餐不存在")
    channel = _normalize_method(payment_method)
    created = pay.create_order(
        plan_code=pkg["plan_code"],
        user_id=user_id,
        client_ip=client_ip,
        channel=channel,
        device=device,
        currency=currency,
        country=country,
    )
    row = db.get_payment_order(created["order_no"]) or created
    mapped = map_order_row(row, pkg)
    mapped["payurl"] = created.get("payurl") or mapped.get("payurl") or ""
    return mapped


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

    if (row.get("channel") or "").lower() == "waffo" or (row.get("psp") or "") == "waffo":
        return (row.get("payurl") or "").strip(), (row.get("qrcode") or "").strip()

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

    # 已有网关链接（尤其 Waffo）直接复用
    existing = (row.get("payurl") or "").strip()
    if existing and (
        (row.get("channel") or "").lower() == "waffo"
        or (row.get("psp") or "") == "waffo"
        or _normalize_method(payment_method) == "waffo"
    ):
        return {"order": order, "pay_type": "redirect", "pay_data": existing}

    channel = _normalize_method(payment_method)
    if channel == "waffo":
        if existing:
            return {"order": order, "pay_type": "redirect", "pay_data": existing}
        raise ValueError("国际支付链接已失效，请重新下单")

    row = {**row, "channel": channel}
    payurl, qrcode = _payurl_for_row(row)
    if payurl:
        return {"order": order, "pay_type": "redirect", "pay_data": payurl}
    if qrcode:
        return {"order": order, "pay_type": "code_url", "pay_data": qrcode}
    raise ValueError("未获取到支付链接，请稍后重试")


def purchase_methods(*, country: str | None = None, currency: str | None = None) -> dict:
    from cloud_deploy.cloud_api.hwxun_pay import channel_merchant_credentials
    from cloud_deploy.cloud_api import dist_ops
    from cloud_deploy.cloud_api import waffo_pay
    from cloud_deploy.cloud_api.payment_plans import COUNTRY_CURRENCY, list_psy_dist_plans, public_plan_row

    cfg = dist_ops.get_config()
    cc = (country or "").strip().upper()
    cur = normalize_currency(currency, country=cc)

    def _on(key: str) -> bool:
        return str(cfg.get(key) or "true").strip().lower() in ("1", "true", "yes")

    wechat_env = False
    alipay_env = False
    try:
        channel_merchant_credentials("wxpay")
        wechat_env = True
    except RuntimeError:
        wechat_env = False
    try:
        channel_merchant_credentials("alipay")
        alipay_env = True
    except RuntimeError:
        alipay_env = False

    # 国际访客默认不展示微信/支付宝（除非显式 CNY）
    show_cn = cur == "CNY" and (not cc or cc == "CN")
    wechat = wechat_env and _on("payment_wechat_enabled") and show_cn
    alipay = alipay_env and _on("payment_alipay_enabled") and show_cn
    waffo_on = waffo_pay.waffo_configured() and (
        not show_cn or str(cfg.get("payment_waffo_enabled") or "true").strip().lower() in ("1", "true", "yes")
    )
    # 国内默认关 Waffo，除非配置打开
    if show_cn and str(cfg.get("payment_waffo_enabled") or "").strip().lower() not in ("1", "true", "yes"):
        waffo_on = False
    if not show_cn:
        waffo_on = waffo_pay.waffo_configured()

    online = wechat or alipay or waffo_on
    xianyu = show_cn and _on("payment_xianyu_fallback_enabled") and bool(
        (cfg.get("xianyu_shop_link") or "").strip() or (cfg.get("xianyu_shop_qrcode") or "").strip()
    )

    # 东南亚本地支付展示名（实际通道由 Waffo 收银台承载）
    local_methods: list[dict] = []
    if waffo_on and cc:
        sea = {
            "SG": [{"id": "card", "label": "Card / PayNow"}],
            "MY": [{"id": "card", "label": "Card / FPX"}],
            "ID": [{"id": "qris", "label": "QRIS / E-wallet"}],
            "TH": [{"id": "promptpay", "label": "PromptPay / Card"}],
            "VN": [{"id": "local", "label": "Local bank / Card"}],
            "PH": [{"id": "gcash", "label": "GCash / Card"}],
            "US": [{"id": "card", "label": "Credit / Debit Card"}],
            "GB": [{"id": "card", "label": "Card"}],
            "AU": [{"id": "card", "label": "Card"}],
            "CA": [{"id": "card", "label": "Card"}],
        }
        local_methods = sea.get(cc, [{"id": "card", "label": "Card"}] if not show_cn else [])

    plans = [public_plan_row(p, currency=cur, locale="en" if not show_cn else "zh-CN") for p in list_psy_dist_plans()]

    return {
        "wechat": wechat,
        "alipay": alipay,
        "waffo": waffo_on,
        "wechat_available": wechat,
        "alipay_available": alipay,
        "waffo_available": waffo_on,
        "online_payment_available": online,
        "any_purchase_available": online or xianyu,
        "mock_mode": not online,
        "xianyu_fallback_enabled": xianyu,
        "xianyu": xianyu,
        "offline": xianyu,
        "currency": cur,
        "country": cc,
        "default_currency_by_country": dict(COUNTRY_CURRENCY),
        "local_methods": local_methods,
        "plans": plans,
    }

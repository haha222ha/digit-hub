# -*- coding: utf-8 -*-
"""选品会员 hwxun 支付：下单、回调履约、订单查询。"""
from __future__ import annotations

import json
import logging
import secrets
from datetime import datetime, timedelta

from cloud_deploy.cloud_api import database as db
from cloud_deploy.cloud_api.config import get_settings
from cloud_deploy.cloud_api.hwxun_pay import (
    build_epay_submit_url,
    channel_merchant_credentials,
    create_epay_order,
    verify_notify_epay,
)
from cloud_deploy.cloud_api.payment_plans import get_plan

logger = logging.getLogger(__name__)

# Same actor (IP / user) + channel: min gap between new gateway creates.
_PAY_CREATE_COOLDOWN_SEC = 10
# Cap open pending orders in a rolling window.
_PAY_MAX_PENDING = 5
_PAY_PENDING_WINDOW_MIN = 30


class PayRateLimitError(ValueError):
    """Too many create-order attempts; map to HTTP 429."""


def _notify_url() -> str:
    base = (get_settings().xhs_pay_notify_base or "").strip().rstrip("/")
    if not base:
        raise RuntimeError("未配置 XHS_PAY_NOTIFY_BASE")
    return f"{base}/api/v1/payment/notify/hwxun"


def _return_url(order_no: str) -> str:
    """支付完成浏览器回跳（对齐发卡网 epay_return；履约仍靠异步 notify）。"""
    base = (get_settings().xhs_pay_notify_base or "").strip().rstrip("/")
    if not base:
        raise RuntimeError("未配置 XHS_PAY_NOTIFY_BASE")
    return f"{base}/?paid_order={order_no}"


def _payment_fulfillment_note(order_no: str, channel: str, plan_code: str) -> str:
    """V2 套餐写入 entitlements 到 auth_codes.note（PR-1）。"""
    from cloud_deploy.cloud_api.payment_plans_v2 import INSIGHT_PLAN_BY_CODE, entitlements_note_for_plan

    code = str(plan_code or "").strip()
    if code in INSIGHT_PLAN_BY_CODE:
        try:
            data = json.loads(entitlements_note_for_plan(code))
        except Exception:
            data = {"entitlements": {"plan_code": code}}
        if isinstance(data, dict):
            data.setdefault("order_no", order_no)
            data.setdefault("source", f"hwxun_{channel}")
            return json.dumps(data, ensure_ascii=False)
    from cloud_deploy.cloud_api.payment_plans import entitlements_note_for_payment_plan

    note = entitlements_note_for_payment_plan(code)
    if note:
        try:
            data = json.loads(note)
        except Exception:
            data = {}
        if isinstance(data, dict):
            data.setdefault("order_no", order_no)
            data.setdefault("source", f"hwxun_{channel}")
            return json.dumps(data, ensure_ascii=False)
    return json.dumps({"order_no": order_no, "source": f"hwxun_{channel}"}, ensure_ascii=False)


def _gen_order_no() -> str:
    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    return f"XHSP{ts}{secrets.token_hex(3).upper()}"


def list_public_plans() -> dict:
    from cloud_deploy.cloud_api.payment_plans import (
        CUSTOM_ANALYSIS_PRICING,
        list_active_plans,
        list_addon_plans,
        list_assess_plans,
    )

    def _pub(p: dict) -> dict:
        row = {
            "plan_code": p["plan_code"],
            "label": p["label"],
            "duration_days": p["duration_days"],
            "amount": p["amount"],
            "price_yuan": p["price_yuan"],
            "summary": p["summary"],
        }
        if p.get("is_test"):
            row["is_test"] = True
        if p.get("recommended"):
            row["recommended"] = True
        if p.get("plan_type"):
            row["plan_type"] = p["plan_type"]
        if p.get("requires_active_member"):
            row["requires_active_member"] = True
        if p.get("product"):
            row["product"] = p["product"]
        return row

    return {
        "plans": [_pub(p) for p in list_active_plans()],
        "addons": [_pub(p) for p in list_addon_plans()],
        "assess_plans": [_pub(p) for p in list_assess_plans()],
        "custom_analysis": dict(CUSTOM_ANALYSIS_PRICING),
    }


def list_payment_channels() -> list[dict]:
    """返回已配置凭证的支付方式（微信/支付宝/Waffo）。"""
    labels = {"wxpay": "微信支付", "alipay": "支付宝", "waffo": "Card / International"}
    out: list[dict] = []
    for ch in ("wxpay", "alipay"):
        try:
            channel_merchant_credentials(ch)
            out.append({"channel": ch, "label": labels[ch]})
        except RuntimeError:
            continue
    from cloud_deploy.cloud_api import waffo_pay

    if waffo_pay.waffo_configured():
        out.append({"channel": "waffo", "label": labels["waffo"], "psp": "waffo"})
    return out


def _waffo_notify_url() -> str:
    base = (get_settings().xhs_pay_notify_base or "").strip().rstrip("/")
    if not base:
        raise RuntimeError("未配置 XHS_PAY_NOTIFY_BASE")
    return f"{base}/api/v1/payment/notify/waffo"


def create_order(
    *,
    plan_code: str,
    user_id: int | None,
    client_ip: str,
    channel: str = "wxpay",
    device: str = "pc",
    currency: str | None = None,
    country: str | None = None,
) -> dict:
    from cloud_deploy.cloud_api.payment_plans import (
        is_addon_plan,
        is_assess_plan,
        is_psy_dist_plan,
        normalize_currency,
        resolve_plan_amount,
        resolve_psp_for_pay,
    )

    plan = get_plan(plan_code)
    if not plan:
        raise ValueError("无效套餐")
    if plan.get("requires_active_member"):
        if not user_id:
            raise ValueError("请先登录有效会员账号后再购买会员价定制分析")
        profile = db.get_member_profile(int(user_id)) or {}
        if not profile.get("is_active"):
            raise ValueError("当前账号非有效会员，请购买非会员价或先开通会员")

    pay_channel = (channel or "wxpay").strip().lower()
    if pay_channel in ("card", "international", "intl"):
        pay_channel = "waffo"
    country_code = (country or "").strip().upper()[:8]
    cur = normalize_currency(currency, country=country_code)
    amount_str, cur = resolve_plan_amount(plan, cur)
    psp = resolve_psp_for_pay(currency=cur, channel=pay_channel)

    if psp == "hwxun" and pay_channel not in ("wxpay", "alipay"):
        pay_channel = "wxpay"
    if psp == "waffo":
        pay_channel = "waffo"
        from cloud_deploy.cloud_api import waffo_pay

        if not waffo_pay.waffo_configured():
            raise RuntimeError("国际支付通道未配置（Waffo）")
    elif pay_channel not in ("wxpay", "alipay"):
        raise ValueError("支付方式仅支持 wxpay、alipay 或 waffo")

    pay_device = (device or "pc").strip().lower()
    if pay_device not in ("pc", "mobile", "wechat", "alipay", "jump"):
        pay_device = "pc"

    recent = db.count_recent_payment_orders(
        client_ip=client_ip or "",
        user_id=user_id,
        channel=pay_channel,
        within_seconds=_PAY_CREATE_COOLDOWN_SEC,
    )
    if recent > 0:
        raise PayRateLimitError(
            f"下单过于频繁，请 {_PAY_CREATE_COOLDOWN_SEC} 秒后再试"
        )

    pending_n = db.count_pending_payment_orders(
        client_ip=client_ip or "",
        user_id=user_id,
        within_minutes=_PAY_PENDING_WINDOW_MIN,
    )
    if pending_n >= _PAY_MAX_PENDING:
        raise PayRateLimitError("待支付订单过多，请先完成已有支付或稍后再试")

    order_no = _gen_order_no()
    expires_at = (datetime.now() + timedelta(minutes=30)).strftime("%Y-%m-%d %H:%M:%S")
    db.insert_payment_order(
        order_no=order_no,
        user_id=user_id,
        plan_code=plan["plan_code"],
        duration_days=int(plan["duration_days"]),
        amount=amount_str,
        channel=pay_channel,
        client_ip=client_ip,
        expires_at=expires_at,
        currency=cur,
        psp=psp,
        country=country_code,
        meta={"currency": cur, "psp": psp, "country": country_code},
    )
    if is_assess_plan(plan["plan_code"]):
        goods_name = f"心象测-{plan['label']}"
    elif is_addon_plan(plan["plan_code"]):
        goods_name = f"定制分析-{plan['label']}"
    elif is_psy_dist_plan(plan["plan_code"]):
        goods_name = plan.get("label_en") if cur != "CNY" else f"心理分销-{plan['label']}"
        goods_name = goods_name or f"XinXiangCe-{plan['label']}"
    else:
        goods_name = f"AI选品会员-{plan['label']}"

    qrcode = ""
    gateway_trade_no = ""
    pay_mode = "jump"
    payurl = ""

    if psp == "waffo":
        from cloud_deploy.cloud_api import waffo_pay

        return_base = (get_settings().xhs_pay_notify_base or "").strip().rstrip("/")
        success_url = f"{return_base}/admin/purchase-quota?paid_order={order_no}"
        gw = waffo_pay.create_order(
            merchant_order_id=order_no,
            amount=amount_str,
            currency=cur,
            description=str(goods_name),
            notify_url=_waffo_notify_url(),
            success_redirect_url=success_url,
            failed_redirect_url=success_url,
            cancel_redirect_url=success_url,
            user_id=str(user_id or "guest"),
            goods_name=str(goods_name),
            goods_url="https://psy.xhs365.cn/pricing/",
        )
        payurl = gw["payurl"]
        gateway_trade_no = gw.get("gateway_trade_no") or ""
        pay_mode = "jump"
    else:
        try:
            payurl = build_epay_submit_url(
                channel=pay_channel,
                out_trade_no=order_no,
                amount=amount_str,
                name=goods_name,
                notify_url=_notify_url(),
                return_url=_return_url(order_no),
                sitename="心象测",
            )
        except Exception:
            gw = create_epay_order(
                channel=pay_channel,
                out_trade_no=order_no,
                amount=amount_str,
                name=goods_name,
                notify_url=_notify_url(),
                clientip=client_ip,
                device=pay_device if pay_device != "pc" else "mobile",
            )
            qrcode = str(gw.get("qrcode") or gw.get("code_url") or "").strip()
            payurl = str(
                gw.get("payurl") or gw.get("urlscheme") or gw.get("url") or ""
            ).strip()
            gateway_trade_no = str(gw.get("trade_no") or "").strip()
            if not qrcode and not payurl:
                raise RuntimeError("支付网关未返回支付链接")
            pay_mode = "qrcode" if qrcode and not payurl else "jump"

    db.update_payment_order_gateway(
        order_no,
        qrcode=qrcode,
        payurl=payurl,
        gateway_trade_no=gateway_trade_no,
    )
    return {
        "order_no": order_no,
        "plan_code": plan["plan_code"],
        "plan_label": plan["label"],
        "amount": amount_str,
        "currency": cur,
        "psp": psp,
        "country": country_code,
        "duration_days": plan["duration_days"],
        "qrcode": qrcode,
        "payurl": payurl,
        "expires_at": expires_at,
        "status": "pending",
        "channel": pay_channel,
        "reused": False,
        "device": pay_device,
        "pay_mode": pay_mode,
    }


def get_order_public(order_no: str) -> dict | None:
    row = db.get_payment_order(order_no)
    if not row:
        return None
    db.expire_stale_payment_order(order_no)
    row = db.get_payment_order(order_no) or row
    plan = get_plan(row["plan_code"]) or {}
    fulfilled = bool(row.get("fulfilled_user_id"))
    out = {
        "order_no": row["order_no"],
        "plan_code": row["plan_code"],
        "plan_label": plan.get("label") or row["plan_code"],
        "amount": row["amount"],
        "duration_days": row["duration_days"],
        "status": row["status"],
        "expires_at": row["expires_at"],
        "paid_at": row.get("paid_at"),
        "qrcode": row.get("qrcode") or "",
        "payurl": row.get("payurl") or "",
        "fulfilled": fulfilled,
        "channel": row.get("channel") or "wxpay",
        "currency": row.get("currency") or "CNY",
        "psp": row.get("psp") or "hwxun",
        "country": row.get("country") or "",
    }
    if row["status"] == "paid":
        if fulfilled:
            out["message"] = "支付成功，会员已生效"
            out["next_action"] = "none"
        else:
            from cloud_deploy.cloud_api.payment_plans import is_assess_plan

            if is_assess_plan(row["plan_code"]):
                out["message"] = "支付成功，即将自动解锁完整报告"
                out["next_action"] = "guest_unlock"
            else:
                out["message"] = "支付成功，请设置账号或登录已有账号以完成开通"
                out["next_action"] = "complete_account"
    return out


def complete_paid_order(
    order_no: str,
    *,
    mode: str,
    username: str,
    password: str,
) -> dict:
    """支付成功后：新用户注册开通，或老用户登录绑定续期（不再暴露授权码）。"""
    row = db.get_payment_order(order_no)
    if not row:
        raise ValueError("订单不存在")
    if row["status"] != "paid":
        raise ValueError("订单尚未支付")
    if row.get("fulfilled_user_id"):
        uid = int(row["fulfilled_user_id"])
        profile = db.get_member_profile(uid) or {}
        return {
            "membership": profile,
            "message": "该订单已完成开通",
            "username": profile.get("username") or "",
            "auth_code": (row.get("auth_code") or "").strip(),
        }
    code = (row.get("auth_code") or "").strip()
    if not code:
        raise ValueError("订单处理中，请稍后刷新或联系客服")

    username = (username or "").strip()
    password = password or ""
    if not username or not password:
        raise ValueError("请填写用户名和密码")
    if len(username) < 3:
        raise ValueError("用户名至少 3 个字符")
    if len(password) < 6:
        raise ValueError("密码至少 6 位")

    mode = (mode or "").strip().lower()
    from cloud_deploy.cloud_api.payment_plans import is_addon_plan

    is_addon = is_addon_plan(row["plan_code"])
    if mode == "register":
        profile = db.register_with_auth_code(username, password, code)
        msg = (
            "定制分析订单已提交，请在 PC 端「使用说明」填写词库需求或联系客服"
            if is_addon
            else f"开通成功，会员已生效 {row['duration_days']} 天"
        )
    elif mode == "login":
        profile = db.renew_with_credentials(username, password, code)
        if is_addon:
            msg = "定制分析订单已提交，请在 PC 端「使用说明」填写词库需求或联系客服"
        else:
            stack = profile.get("renew_stack") or {}
            if stack.get("stacked"):
                msg = (
                    f"续费成功：已叠加剩余 {stack.get('previous_days_remaining', 0)} 天 + "
                    f"新购 {stack.get('days_added', 0)} 天"
                )
            else:
                msg = profile.get("message") or f"会员已延长 {stack.get('days_added', row['duration_days'])} 天"
    else:
        raise ValueError("无效操作，请选择新用户开通或已有账号登录")

    db.mark_payment_order_fulfilled(order_no, int(profile["id"]))
    return {
        "membership": profile,
        "message": msg,
        "username": profile.get("username") or username,
        "auth_code": code,
    }


def guest_unlock_paid_order(order_no: str) -> dict:
    """游客支付后静默开通：授权码即账号，同码为初始密码（对标发卡网 / vuemonitor）。"""
    row = db.get_payment_order(order_no)
    if not row:
        raise ValueError("订单不存在")
    if row["status"] != "paid":
        raise ValueError("订单尚未支付")

    code = (row.get("auth_code") or "").strip()
    if row.get("fulfilled_user_id"):
        uid = int(row["fulfilled_user_id"])
        profile = db.get_member_profile(uid) or {}
        return {
            "membership": profile,
            "message": "权益已开通",
            "username": profile.get("username") or "",
            "auth_code": code,
            "already_fulfilled": True,
        }

    if not code:
        raise ValueError("订单处理中，请稍后刷新或联系客服")

    username = code
    password = code
    from cloud_deploy.cloud_api.payment_plans import is_addon_plan

    is_addon = is_addon_plan(row["plan_code"])
    profile = db.register_with_auth_code(username, password, code)
    msg = (
        "定制分析订单已提交，请在 PC 端「使用说明」填写词库需求或联系客服"
        if is_addon
        else f"开通成功，完整报告已解锁（授权码即账号与密码，请妥善保存）"
    )
    db.mark_payment_order_fulfilled(order_no, int(profile["id"]))
    return {
        "membership": profile,
        "message": msg,
        "username": profile.get("username") or username,
        "auth_code": code,
        "login_hint": "授权码可作为账号与密码登录会员中心",
    }


def claim_paid_order(order_no: str, user_id: int) -> dict:
    row = db.get_payment_order(order_no)
    if not row:
        raise ValueError("订单不存在")
    if row["status"] != "paid":
        raise ValueError("订单尚未支付")
    if row.get("fulfilled_user_id"):
        if int(row["fulfilled_user_id"]) == user_id:
            profile = db.get_member_profile(user_id) or {}
            return {
                "membership": profile,
                "message": "该订单已履约",
                "auth_code": (row.get("auth_code") or "").strip(),
            }
        raise ValueError("该订单已被其他账号使用")
    code = row.get("auth_code")
    if not code:
        raise ValueError("订单缺少授权码，请联系客服")
    from cloud_deploy.cloud_api.payment_plans import is_addon_plan

    profile = db.renew_with_auth_code(user_id, code)
    db.mark_payment_order_fulfilled(order_no, user_id)
    if is_addon_plan(row["plan_code"]):
        return {
            "membership": profile,
            "message": "定制分析订单已提交，请在 PC 端「使用说明」填写词库需求或联系客服",
            "auth_code": (code or "").strip(),
        }
    stack = profile.get("renew_stack") or {}
    if stack.get("stacked"):
        msg = (
            f"续费成功：已叠加剩余 {stack.get('previous_days_remaining', 0)} 天 + "
            f"新授权 {stack.get('days_added', 0)} 天"
        )
    else:
        msg = f"会员已延长 {stack.get('days_added', row['duration_days'])} 天"
    return {"membership": profile, "message": msg, "auth_code": (code or "").strip()}


def handle_hwxun_notify(params: dict) -> str:
    order_no = str(params.get("out_trade_no") or "").strip()
    row = db.get_payment_order(order_no) if order_no else None
    ch = (row or {}).get("channel") or params.get("type") or "wxpay"
    try:
        expect_pid, key = channel_merchant_credentials(str(ch))
    except RuntimeError:
        return "fail"
    notify_pid = str(params.get("pid") or "").strip()
    if notify_pid and notify_pid != expect_pid:
        return "fail"
    if not verify_notify_epay(params, key):
        return "fail"
    trade_status = str(params.get("trade_status") or "").strip().upper()
    # 无 trade_status 时不可返回 success，否则网关认为已通知成功而不再重试
    if not trade_status:
        return "fail"
    if trade_status != "TRADE_SUCCESS":
        return "success"
    order_no = str(params.get("out_trade_no") or "").strip()
    money = str(params.get("money") or "").strip()
    gateway_trade_no = str(params.get("trade_no") or "").strip()
    if not order_no:
        return "fail"
    if not row:
        row = db.get_payment_order(order_no)
    if not row:
        return "fail"
    if row["status"] == "paid":
        # 已支付但未履约：允许网关重试补发（尤其是额度订单）
        if row.get("fulfilled_user_id"):
            return "success"
        from cloud_deploy.cloud_api.payment_plans import is_psy_dist_plan

        if is_psy_dist_plan(row["plan_code"]) and row.get("user_id"):
            try:
                from cloud_deploy.cloud_api import dist_service

                dist_service.fulfill_quota_from_payment(int(row["user_id"]), row["plan_code"], order_no)
                if not db.mark_payment_order_fulfilled(order_no, int(row["user_id"])):
                    # 并发下可能已被同用户标记
                    refreshed = db.get_payment_order(order_no) or {}
                    if refreshed.get("fulfilled_user_id"):
                        return "success"
                    return "fail"
                return "success"
            except Exception as e:
                logger.exception(
                    "psy_dist quota fulfill retry failed order_no=%s user_id=%s",
                    order_no,
                    row.get("user_id"),
                )
                try:
                    db.mark_payment_order_fulfill_error(
                        order_no,
                        error=f"psy_dist_retry_failed: {type(e).__name__}: {e}",
                    )
                except Exception:
                    pass
                return "fail"
        return "success"
    if f"{float(row['amount']):.2f}" != f"{float(money):.2f}":
        return "fail"
    paid_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    ch = row.get("channel") or "wxpay"
    from cloud_deploy.cloud_api.payment_plans import is_addon_plan, is_psy_dist_plan

    if is_psy_dist_plan(row["plan_code"]):
        ok = db.mark_payment_order_paid(
            order_no,
            gateway_trade_no=gateway_trade_no,
            auth_code="",
            paid_at=paid_at,
        )
        if not ok:
            ok = db.mark_payment_order_paid_force(
                order_no,
                gateway_trade_no=gateway_trade_no,
                auth_code="",
                paid_at=paid_at,
            )
        if not ok:
            return "fail"
        user_id = row.get("user_id")
        if not user_id:
            return "fail"
        try:
            from cloud_deploy.cloud_api import dist_service

            dist_service.fulfill_quota_from_payment(int(user_id), row["plan_code"], order_no)
            if not db.mark_payment_order_fulfilled(order_no, int(user_id)):
                refreshed = db.get_payment_order(order_no) or {}
                if refreshed.get("fulfilled_user_id"):
                    return "success"
                return "fail"
            return "success"
        except Exception as e:
            logger.exception(
                "psy_dist quota fulfill failed order_no=%s user_id=%s",
                order_no,
                user_id,
            )
            try:
                db.mark_payment_order_fulfill_error(
                    order_no,
                    error=f"psy_dist_failed: {type(e).__name__}: {e}",
                )
            except Exception:
                pass
            return "fail"

    note = _payment_fulfillment_note(order_no, ch, row["plan_code"])
    codes = db.generate_auth_codes(
        count=1,
        plan_code=row["plan_code"],
        duration_days=int(row["duration_days"]),
        max_activations=1,
        note=note,
    )
    auth_code = codes[0] if codes else ""
    ok = db.mark_payment_order_paid(
        order_no,
        gateway_trade_no=gateway_trade_no,
        auth_code=auth_code,
        paid_at=paid_at,
    )
    if not ok:
        ok = db.mark_payment_order_paid_force(
            order_no,
            gateway_trade_no=gateway_trade_no,
            auth_code=auth_code,
            paid_at=paid_at,
        )
    if not ok:
        return "fail"
    user_id = row.get("user_id")
    if user_id and auth_code:
        from cloud_deploy.cloud_api.payment_plans import is_addon_plan

        if not is_addon_plan(row["plan_code"]):
            try:
                db.renew_with_auth_code(int(user_id), auth_code)
                db.mark_payment_order_fulfilled(order_no, int(user_id))
            except Exception as e:
                logger.exception(
                    "payment auto-fulfill renew failed order_no=%s user_id=%s",
                    order_no,
                    user_id,
                )
                try:
                    db.mark_payment_order_fulfill_error(
                        order_no,
                        error=f"renew_failed: {type(e).__name__}: {e}",
                    )
                except Exception:
                    logger.exception(
                        "mark_payment_order_fulfill_error failed order_no=%s", order_no
                    )
                return "fail"
        else:
            try:
                db.fulfill_addon_order(int(user_id), auth_code, row["plan_code"])
                db.mark_payment_order_fulfilled(order_no, int(user_id))
            except Exception as e:
                logger.exception(
                    "payment auto-fulfill addon failed order_no=%s user_id=%s plan=%s",
                    order_no,
                    user_id,
                    row.get("plan_code"),
                )
                try:
                    db.mark_payment_order_fulfill_error(
                        order_no,
                        error=f"addon_failed: {type(e).__name__}: {e}",
                    )
                except Exception:
                    logger.exception(
                        "mark_payment_order_fulfill_error failed order_no=%s", order_no
                    )
                return "fail"
    return "success"


def _fulfill_psy_dist_paid(row: dict, *, order_no: str, gateway_trade_no: str, paid_at: str) -> str:
    """标记已付并履约额度；成功返回 success，否则 fail。"""
    from cloud_deploy.cloud_api.payment_plans import is_psy_dist_plan

    if not is_psy_dist_plan(row["plan_code"]):
        return "fail"
    ok = db.mark_payment_order_paid(
        order_no,
        gateway_trade_no=gateway_trade_no,
        auth_code="",
        paid_at=paid_at,
    )
    if not ok:
        ok = db.mark_payment_order_paid_force(
            order_no,
            gateway_trade_no=gateway_trade_no,
            auth_code="",
            paid_at=paid_at,
        )
    if not ok:
        return "fail"
    user_id = row.get("user_id")
    if not user_id:
        return "fail"
    try:
        from cloud_deploy.cloud_api import dist_service

        dist_service.fulfill_quota_from_payment(int(user_id), row["plan_code"], order_no)
        if not db.mark_payment_order_fulfilled(order_no, int(user_id)):
            refreshed = db.get_payment_order(order_no) or {}
            if refreshed.get("fulfilled_user_id"):
                return "success"
            return "fail"
        return "success"
    except Exception as e:
        logger.exception(
            "psy_dist quota fulfill failed order_no=%s user_id=%s",
            order_no,
            user_id,
        )
        try:
            db.mark_payment_order_fulfill_error(
                order_no,
                error=f"psy_dist_failed: {type(e).__name__}: {e}",
            )
        except Exception:
            pass
        return "fail"


def handle_waffo_notify(raw_body: str, signature: str) -> tuple[str, str]:
    """处理 Waffo Webhook。返回 (response_json, response_signature)。"""
    from cloud_deploy.cloud_api import waffo_pay
    from cloud_deploy.cloud_api.payment_plans import is_psy_dist_plan

    def _resp(msg: str) -> tuple[str, str]:
        return waffo_pay.webhook_response(msg)

    if not waffo_pay.verify_waffo_signature(raw_body, signature or ""):
        return _resp("failed")
    try:
        body = json.loads(raw_body) if raw_body else {}
    except json.JSONDecodeError:
        return _resp("failed")
    if not isinstance(body, dict):
        return _resp("failed")

    parsed = waffo_pay.parse_payment_notification(body)
    order_no = parsed["merchant_order_id"]
    status = parsed["order_status"]
    if not order_no:
        return _resp("failed")

    # 非终态成功：确认收到即可，避免无谓重试
    if status and status not in ("PAY_SUCCESS", "SUCCESS", "PAID"):
        if status in ("PAY_IN_PROGRESS", "AUTHORIZATION_REQUIRED", "AUTHED_WAITING_CAPTURE"):
            return _resp("success")
        # ORDER_CLOSE 等：标记成功接收，不履约
        return _resp("success")

    row = db.get_payment_order(order_no)
    if not row:
        return _resp("failed")

    money = parsed["order_amount"] or row.get("amount") or ""
    currency = (parsed["order_currency"] or row.get("currency") or "USD").upper()
    row_cur = (row.get("currency") or "CNY").upper()
    if currency and row_cur and currency != row_cur:
        logger.warning(
            "waffo currency mismatch order=%s notify=%s row=%s",
            order_no,
            currency,
            row_cur,
        )
        return _resp("failed")
    try:
        if money and f"{float(row['amount']):.2f}" != f"{float(money):.2f}":
            # IDR/VND 可能无小数
            if abs(float(row["amount"]) - float(money)) > 0.011:
                return _resp("failed")
    except (TypeError, ValueError):
        return _resp("failed")

    gateway_trade_no = parsed["acquiring_order_id"] or (row.get("gateway_trade_no") or "")
    paid_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if row["status"] == "paid":
        if row.get("fulfilled_user_id"):
            return _resp("success")
        if is_psy_dist_plan(row["plan_code"]) and row.get("user_id"):
            try:
                from cloud_deploy.cloud_api import dist_service

                dist_service.fulfill_quota_from_payment(
                    int(row["user_id"]), row["plan_code"], order_no
                )
                db.mark_payment_order_fulfilled(order_no, int(row["user_id"]))
            except Exception:
                logger.exception("waffo psy_dist retry fulfill failed order_no=%s", order_no)
                return _resp("failed")
        return _resp("success")

    if is_psy_dist_plan(row["plan_code"]):
        result = _fulfill_psy_dist_paid(
            row, order_no=order_no, gateway_trade_no=gateway_trade_no, paid_at=paid_at
        )
        return _resp("success" if result == "success" else "failed")

    # 非分销套餐：走授权码路径（与 hwxun 一致）
    note = _payment_fulfillment_note(order_no, "waffo", row["plan_code"])
    codes = db.generate_auth_codes(
        count=1,
        plan_code=row["plan_code"],
        duration_days=int(row["duration_days"]),
        max_activations=1,
        note=note,
    )
    auth_code = codes[0] if codes else ""
    ok = db.mark_payment_order_paid(
        order_no,
        gateway_trade_no=gateway_trade_no,
        auth_code=auth_code,
        paid_at=paid_at,
    )
    if not ok:
        ok = db.mark_payment_order_paid_force(
            order_no,
            gateway_trade_no=gateway_trade_no,
            auth_code=auth_code,
            paid_at=paid_at,
        )
    if not ok:
        return _resp("failed")
    user_id = row.get("user_id")
    if user_id and auth_code:
        from cloud_deploy.cloud_api.payment_plans import is_addon_plan

        if not is_addon_plan(row["plan_code"]):
            try:
                db.renew_with_auth_code(int(user_id), auth_code)
                db.mark_payment_order_fulfilled(order_no, int(user_id))
            except Exception:
                logger.exception("waffo renew fulfill failed order_no=%s", order_no)
                return _resp("failed")
    return _resp("success")


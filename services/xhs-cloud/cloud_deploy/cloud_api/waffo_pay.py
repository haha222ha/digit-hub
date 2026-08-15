# -*- coding: utf-8 -*-
"""Waffo 国际收款：RSA 签名下单 + Webhook 验签。

环境变量（PKCS#8 PEM，可用 \\n 转义）：
  WAFFO_API_KEY / WAFFO_MERCHANT_ID / WAFFO_PRIVATE_KEY / WAFFO_PUBLIC_KEY
  WAFFO_API_BASE（默认沙箱 https://api-sandbox.waffo.com；生产 https://api.waffo.com）
"""
from __future__ import annotations

import base64
import json
import logging
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

logger = logging.getLogger(__name__)

_API_VERSION = "1.0.0"


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def waffo_configured() -> bool:
    return bool(
        _env("WAFFO_API_KEY")
        and _env("WAFFO_MERCHANT_ID")
        and _env("WAFFO_PRIVATE_KEY")
        and _env("WAFFO_PUBLIC_KEY")
    )


def api_base() -> str:
    base = _env("WAFFO_API_BASE") or _env("WAFFO_ENV_URL")
    if base:
        return base.rstrip("/")
    env = _env("WAFFO_ENV", "sandbox").lower()
    if env in ("prod", "production", "live"):
        return "https://api.waffo.com"
    return "https://api-sandbox.waffo.com"


def _normalize_pem(raw: str, *, kind: str) -> bytes:
    text = (raw or "").strip().replace("\\n", "\n")
    if "BEGIN" not in text:
        # bare base64 → wrap as PKCS#8 / SPKI
        body = "".join(text.split())
        header = (
            "-----BEGIN PRIVATE KEY-----"
            if kind == "private"
            else "-----BEGIN PUBLIC KEY-----"
        )
        footer = (
            "-----END PRIVATE KEY-----"
            if kind == "private"
            else "-----END PUBLIC KEY-----"
        )
        lines = [body[i : i + 64] for i in range(0, len(body), 64)]
        text = header + "\n" + "\n".join(lines) + "\n" + footer + "\n"
    return text.encode("utf-8")


def _load_private_key():
    from cryptography.hazmat.primitives import serialization

    pem = _normalize_pem(_env("WAFFO_PRIVATE_KEY"), kind="private")
    return serialization.load_pem_private_key(pem, password=None)


def _load_waffo_public_key():
    from cryptography.hazmat.primitives import serialization

    pem = _normalize_pem(_env("WAFFO_PUBLIC_KEY"), kind="public")
    return serialization.load_pem_public_key(pem)


def sign_body(body: str | bytes) -> str:
    """SHA256WithRSA (PKCS1v15) → Base64，用于请求/响应 X-SIGNATURE。"""
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding

    data = body.encode("utf-8") if isinstance(body, str) else body
    key = _load_private_key()
    sig = key.sign(data, padding.PKCS1v15(), hashes.SHA256())
    return base64.b64encode(sig).decode("ascii")


def verify_waffo_signature(body: str | bytes, signature_b64: str) -> bool:
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding

    if not signature_b64:
        return False
    data = body.encode("utf-8") if isinstance(body, str) else body
    try:
        sig = base64.b64decode(signature_b64)
        pub = _load_waffo_public_key()
        pub.verify(sig, data, padding.PKCS1v15(), hashes.SHA256())
        return True
    except (InvalidSignature, ValueError, TypeError) as e:
        logger.warning("waffo signature verify failed: %s", e)
        return False


def _post_json(path: str, payload: dict) -> dict:
    if not waffo_configured():
        raise RuntimeError("未配置 Waffo（WAFFO_API_KEY / MERCHANT_ID / PRIVATE_KEY / PUBLIC_KEY）")
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    url = f"{api_base()}{path}"
    req = urllib.request.Request(
        url,
        data=body.encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "X-API-KEY": _env("WAFFO_API_KEY"),
            "X-API-VERSION": _API_VERSION,
            "X-SIGNATURE": sign_body(body),
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        logger.error("waffo HTTP %s: %s", e.code, err_body[:500])
        raise RuntimeError(f"Waffo 下单失败 HTTP {e.code}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Waffo 网络错误: {e}") from e
    try:
        data = json.loads(raw) if raw else {}
    except json.JSONDecodeError as e:
        raise RuntimeError("Waffo 返回非 JSON") from e
    if not isinstance(data, dict):
        raise RuntimeError("Waffo 返回格式异常")
    code = str(data.get("code") or "")
    if code and code != "0":
        msg = data.get("message") or data.get("msg") or code
        raise RuntimeError(f"Waffo 业务错误: {msg}")
    return data


def _extract_pay_url(order_action: Any) -> str:
    if isinstance(order_action, str) and order_action.strip().startswith("{"):
        try:
            order_action = json.loads(order_action)
        except json.JSONDecodeError:
            return ""
    if not isinstance(order_action, dict):
        return ""
    for key in ("webUrl", "web_url", "deeplinkUrl", "deeplink_url", "url"):
        val = str(order_action.get(key) or "").strip()
        if val.startswith("http"):
            return val
    action_data = order_action.get("actionData") or order_action.get("action_data") or {}
    if isinstance(action_data, dict):
        for key in ("webUrl", "paymentUrl", "cashierUrl"):
            val = str(action_data.get(key) or "").strip()
            if val.startswith("http"):
                return val
    return ""


def create_order(
    *,
    merchant_order_id: str,
    amount: str,
    currency: str,
    description: str,
    notify_url: str,
    success_redirect_url: str,
    failed_redirect_url: str = "",
    cancel_redirect_url: str = "",
    user_id: str = "",
    user_email: str = "",
    goods_name: str = "",
    goods_url: str = "https://psy.xhs365.cn/",
) -> dict:
    """创建一笔一次性支付；返回 {payurl, gateway_trade_no, raw}。"""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    payment_request_id = uuid4().hex
    cur = (currency or "USD").strip().upper()
    amt = f"{float(amount):.2f}"
    payload = {
        "paymentRequestId": payment_request_id,
        "merchantOrderId": merchant_order_id,
        "orderCurrency": cur,
        "orderAmount": amt,
        "orderDescription": (description or goods_name or "XinXiangCe quota")[:256],
        "orderRequestedAt": now,
        "notifyUrl": notify_url,
        "successRedirectUrl": success_redirect_url,
        "failedRedirectUrl": failed_redirect_url or success_redirect_url,
        "cancelRedirectUrl": cancel_redirect_url or success_redirect_url,
        "merchantInfo": {"merchantId": _env("WAFFO_MERCHANT_ID")},
        "userInfo": {
            "userId": str(user_id or "guest")[:64],
            "userEmail": (user_email or "noreply@xhs365.cn")[:128],
            "userTerminal": "WEB",
        },
        "paymentInfo": {"productName": "ONE_TIME_PAYMENT"},
        "goodsInfo": {
            "goodsName": (goods_name or description or "Quota")[:128],
            "goodsUrl": goods_url[:512],
        },
    }
    resp = _post_json("/api/v1/order/create", payload)
    data = resp.get("data") if isinstance(resp.get("data"), dict) else resp
    acquiring_id = str(data.get("acquiringOrderId") or data.get("acquiring_order_id") or "").strip()
    payurl = _extract_pay_url(data.get("orderAction") or data.get("order_action"))
    if not payurl:
        # 部分环境把收银台 URL 放在顶层
        payurl = str(data.get("webUrl") or data.get("cashierUrl") or data.get("payUrl") or "").strip()
    if not payurl:
        raise RuntimeError("Waffo 未返回支付跳转链接（orderAction.webUrl）")
    return {
        "payurl": payurl,
        "gateway_trade_no": acquiring_id or payment_request_id,
        "payment_request_id": payment_request_id,
        "order_status": str(data.get("orderStatus") or ""),
        "raw": data,
    }


def parse_payment_notification(body: dict) -> dict:
    """从 Webhook JSON 抽出履约字段。"""
    result = body.get("result") if isinstance(body.get("result"), dict) else body
    if not isinstance(result, dict):
        result = {}
    return {
        "event_type": str(body.get("eventType") or body.get("event_type") or ""),
        "merchant_order_id": str(
            result.get("merchantOrderId") or result.get("merchant_order_id") or ""
        ).strip(),
        "acquiring_order_id": str(
            result.get("acquiringOrderId") or result.get("acquiring_order_id") or ""
        ).strip(),
        "order_status": str(result.get("orderStatus") or result.get("order_status") or "").strip().upper(),
        "order_amount": str(result.get("orderAmount") or result.get("order_amount") or "").strip(),
        "order_currency": str(
            result.get("orderCurrency") or result.get("order_currency") or ""
        )
        .strip()
        .upper(),
    }


def webhook_response(message: str = "success") -> tuple[str, str]:
    """返回 (json_body, x_signature)。"""
    body = json.dumps({"message": message}, separators=(",", ":"))
    try:
        sig = sign_body(body) if waffo_configured() and _env("WAFFO_PRIVATE_KEY") else ""
    except Exception:
        sig = ""
    return body, sig

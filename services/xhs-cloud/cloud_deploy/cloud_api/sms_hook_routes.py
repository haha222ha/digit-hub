# -*- coding: utf-8 -*-
"""支付宝风控短信 Webhook（对接 SMS Forwarder → order_core 回填）。

对外地址（部署后，以 monitor.xhs365.cn 为例）:
  POST https://monitor.xhs365.cn/api/v1/hooks/sms-forward?token=<TOKEN>
  GET  https://monitor.xhs365.cn/api/v1/hooks/sms-code/latest?token=<TOKEN>&consume=1

手机模板建议（纯文本整段推送）:
  {发件人手机号} {短信正文} {{手机尾号4位}}{发送时间}
  例: 95188 【支付宝】支付宝验证码：448291，… {{7214}}2026-08-22 00:36:25

环境变量:
  XHS_SMS_HOOK_TOKEN   必填（与 order_config.sms_hook_token 一致）
  XHS_SMS_PHONE_TAIL   可选，只接受 {{尾号}} 匹配的短信（如 7214）
"""
from __future__ import annotations

import json
import os
import re
import threading
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse

from cloud_deploy.cloud_api.config import get_settings

router = APIRouter(tags=["sms-hook"])

_lock = threading.Lock()

# 支付宝常见：支付宝验证码：448291 / 验证码448291
_ALIPAY_CODE_RE = re.compile(
    r"(?:支付宝)?验证码\s*[：:\s]*(\d{4,8})",
    re.I,
)
# 仅匹配「验证码」关键词之后的 6 位，避免 106980095188000001 末尾 000001 误命中
_CODE_RE = re.compile(
    r"(?:验证码|校验码|动态码|code)[^\d]{0,12}(\d{4,8})",
    re.I,
)
_CODE_FALLBACK = re.compile(r"(?<!\d)(\d{6})(?!\d)")
_LEADING_LONG_DIGITS_RE = re.compile(r"^\d{12,}")
_HOTLINE_RE = re.compile(r"95188\d+")
# 模板尾：{{7214}}2026-08-22 00:36:25
_TAIL_MARK_RE = re.compile(
    r"\{\{(\d{4})\}\}\s*"
    r"(?:\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?)?"
)
_LEADING_SENDER_RE = re.compile(
    r"^\s*(\+?\d{5,15}|106\d{5,})\s+"
)


def _token_ok(token: str | None, header_token: str | None = None) -> bool:
    expected = (os.environ.get("XHS_SMS_HOOK_TOKEN") or "").strip()
    if not expected or expected in ("change-me", "change-me-sms-hook"):
        return False
    got = (token or header_token or "").strip()
    return bool(got) and got == expected


def _auth(request: Request, token: str | None) -> None:
    hdr = request.headers.get("x-sms-token") or request.headers.get("authorization")
    if hdr and hdr.lower().startswith("bearer "):
        hdr = hdr[7:].strip()
    if not _token_ok(token, hdr):
        raise HTTPException(status_code=401, detail="invalid sms hook token")


def _expected_phone_tail() -> str:
    return (os.environ.get("XHS_SMS_PHONE_TAIL") or "").strip()


def _store_path() -> str:
    s = get_settings()
    base = s.xhs_data_dir or os.path.join(s.xhs_cloud_root, "data")
    os.makedirs(base, exist_ok=True)
    return os.path.join(base, "sms_hook_latest.json")


def _strip_template_noise(text: str) -> str:
    """去掉 {{尾号}}时间 与热线干扰，便于抽码。"""
    t = _TAIL_MARK_RE.sub(" ", text or "")
    t = re.sub(r"唯一热线\s*\d+", " ", t)
    t = re.sub(r"\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?", " ", t)
    return t


def _extract_phone_tail(text: str) -> str:
    m = _TAIL_MARK_RE.search(text or "")
    return m.group(1) if m else ""


def _extract_leading_sender(text: str) -> str:
    m = _LEADING_SENDER_RE.match(text or "")
    return m.group(1) if m else ""


def _is_plausible_code(code: str, text: str) -> bool:
    if not code or not code.isdigit() or not (4 <= len(code) <= 8):
        return False
    if len(code) == 6 and code.startswith(("106", "095", "880", "000")):
        return False
    if code.startswith("95188"):
        return False
    pos = text.find(code)
    if pos >= 0 and pos < 18:
        kw = text.find("验证码")
        if kw < 0 or pos < kw:
            return False
    return True


def _extract_code(text: str) -> str | None:
    text = (text or "").strip()
    if not text:
        return None
    body = _strip_template_noise(text)
    body = _LEADING_LONG_DIGITS_RE.sub("", body)
    body = _HOTLINE_RE.sub(" ", body)
    body = re.sub(r"唯一热线\s*\d+", " ", body)

    for src in (body, text):
        m = _ALIPAY_CODE_RE.search(src)
        if m:
            code = m.group(1)
            if _is_plausible_code(code, text):
                return code
        m = _CODE_RE.search(src)
        if m:
            code = m.group(1)
            if _is_plausible_code(code, text):
                return code

    nums = [
        n for n in _CODE_FALLBACK.findall(body)
        if _is_plausible_code(n, text)
    ]
    if len(nums) == 1:
        return nums[0]
    if nums and ("支付宝" in text or "alipay" in text.lower() or "验证码" in text):
        # 优先取「验证码」关键词之后出现的数字
        kw = text.find("验证码")
        if kw >= 0:
            after = [n for n in nums if text.find(n) > kw]
            if after:
                return after[0]
        return nums[0]
    return None


def _read_store() -> dict[str, Any]:
    path = _store_path()
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f) or {}
    except Exception:
        return {}


def _write_store(data: dict[str, Any]) -> None:
    path = _store_path()
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def _pick_text(payload: Any, raw_body: str) -> str:
    if isinstance(payload, dict):
        for k in (
            "text", "message", "msg", "content", "body", "sms",
            "sms_content", "Content", "Message", "msg_content",
        ):
            v = payload.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
        for k in ("data", "payload"):
            inner = payload.get(k)
            if isinstance(inner, dict):
                t = _pick_text(inner, "")
                if t:
                    return t
            if isinstance(inner, str) and inner.strip():
                return inner.strip()
    if isinstance(payload, str) and payload.strip():
        return payload.strip()
    return (raw_body or "").strip()


def _pick_sender(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    for k in ("from", "sender", "address", "phone", "number", "From"):
        v = payload.get(k)
        if v is not None and str(v).strip():
            return str(v).strip()
    return ""


@router.post("/api/v1/hooks/sms-forward")
@router.post("/hooks/sms-forward")
async def sms_forward(
    request: Request,
    token: str | None = Query(default=None),
):
    """接收 SMS Forwarder 推送。兼容 JSON / form / 纯文本。"""
    _auth(request, token)

    raw = (await request.body()).decode("utf-8", errors="replace")
    ctype = (request.headers.get("content-type") or "").lower()
    payload: Any
    if "application/json" in ctype or raw.strip().startswith("{"):
        try:
            payload = json.loads(raw) if raw else {}
        except Exception:
            payload = {"text": raw}
    elif "application/x-www-form-urlencoded" in ctype or "multipart/form-data" in ctype:
        form = await request.form()
        payload = {k: form.get(k) for k in form.keys()}
    else:
        payload = {"text": raw}

    text = _pick_text(payload, raw)
    sender = _pick_sender(payload) or _extract_leading_sender(text)
    phone_tail = _extract_phone_tail(text)
    code = _extract_code(text)

    expected_tail = _expected_phone_tail()
    if expected_tail and phone_tail and phone_tail != expected_tail:
        return PlainTextResponse(
            f"ignored tail={phone_tail} expect={expected_tail}",
            status_code=200,
        )

    now = time.time()
    rec = {
        "ts": now,
        "iso": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(now)),
        "sender": sender,
        "phone_tail": phone_tail,
        "text": text[:2000],
        "code": code,
        "used": False,
    }
    with _lock:
        _write_store(rec)

    return PlainTextResponse(
        f"ok code={'yes' if code else 'no'}"
        + (f" tail={phone_tail}" if phone_tail else ""),
        status_code=200,
    )


@router.get("/api/v1/hooks/sms-code/latest")
@router.get("/hooks/sms-code/latest")
async def sms_code_latest(
    request: Request,
    token: str | None = Query(default=None),
    consume: int = Query(default=1, ge=0, le=1),
    max_age: int = Query(default=180, ge=30, le=600),
    phone_tail: str | None = Query(default=None),
):
    """电脑脚本拉取最新验证码。默认 consume=1 用后标记已用。"""
    _auth(request, token)

    want_tail = (phone_tail or _expected_phone_tail() or "").strip()

    with _lock:
        rec = _read_store()
        if not rec or not rec.get("code"):
            return JSONResponse({"ok": False, "code": None, "reason": "empty"})
        if want_tail:
            got_tail = str(rec.get("phone_tail") or "").strip()
            if got_tail and got_tail != want_tail:
                return JSONResponse(
                    {
                        "ok": False,
                        "code": None,
                        "reason": "tail_mismatch",
                        "phone_tail": got_tail,
                    }
                )
        age = time.time() - float(rec.get("ts") or 0)
        if age > max_age:
            return JSONResponse(
                {"ok": False, "code": None, "reason": "expired", "age": int(age)}
            )
        if rec.get("used"):
            return JSONResponse({"ok": False, "code": None, "reason": "used"})
        code = str(rec.get("code") or "")
        if not (len(code) == 6 and code.isdigit()):
            return JSONResponse({"ok": False, "code": None, "reason": "bad_code"})
        if consume:
            rec["used"] = True
            rec["consumed_at"] = time.time()
            _write_store(rec)
        return JSONResponse(
            {
                "ok": True,
                "code": code,
                "age": int(age),
                "sender": rec.get("sender") or "",
                "phone_tail": rec.get("phone_tail") or "",
                "iso": rec.get("iso") or "",
                "raw_preview": str(rec.get("text") or "")[:240],
            }
        )

# -*- coding: utf-8 -*-
"""支付宝风控短信 Webhook（对接 SMS Forwarder → order_core 回填）。

对外地址（部署后，以 monitor.xhs365.cn 为例）:
  POST https://monitor.xhs365.cn/api/v1/hooks/sms-forward?token=<TOKEN>
  GET  https://monitor.xhs365.cn/api/v1/hooks/sms-code/latest?token=<TOKEN>&consume=1

环境变量:
  XHS_SMS_HOOK_TOKEN  必填（与 order_config.sms_hook_token 一致）
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
_CODE_RE = re.compile(
    r"(?:验证码|校验码|动态码|code)[^\d]{0,12}(\d{6})"
    r"|(\d{6})[^\d]{0,12}(?:验证码|校验码|为您的|动态)",
    re.I,
)
_CODE_FALLBACK = re.compile(r"(?<!\d)(\d{6})(?!\d)")


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


def _store_path() -> str:
    s = get_settings()
    base = s.xhs_data_dir or os.path.join(s.xhs_cloud_root, "data")
    os.makedirs(base, exist_ok=True)
    return os.path.join(base, "sms_hook_latest.json")


def _extract_code(text: str) -> str | None:
    text = (text or "").strip()
    if not text:
        return None
    m = _CODE_RE.search(text)
    if m:
        return next(g for g in m.groups() if g)
    nums = _CODE_FALLBACK.findall(text)
    if len(nums) == 1:
        return nums[0]
    if "支付宝" in text or "alipay" in text.lower() or "验证码" in text:
        if nums:
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
    sender = _pick_sender(payload)
    code = _extract_code(text)
    now = time.time()
    rec = {
        "ts": now,
        "iso": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(now)),
        "sender": sender,
        "text": text[:2000],
        "code": code,
        "used": False,
    }
    with _lock:
        _write_store(rec)

    return PlainTextResponse(
        f"ok code={'yes' if code else 'no'}",
        status_code=200,
    )


@router.get("/api/v1/hooks/sms-code/latest")
@router.get("/hooks/sms-code/latest")
async def sms_code_latest(
    request: Request,
    token: str | None = Query(default=None),
    consume: int = Query(default=1, ge=0, le=1),
    max_age: int = Query(default=180, ge=30, le=600),
):
    """电脑脚本拉取最新验证码。默认 consume=1 用后标记已用。"""
    _auth(request, token)

    with _lock:
        rec = _read_store()
        if not rec or not rec.get("code"):
            return JSONResponse({"ok": False, "code": None, "reason": "empty"})
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
                "iso": rec.get("iso") or "",
            }
        )

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
W1-5：Shadow 验收冒烟 — profile / insight library / view

用法（云主机）:
  export XHS_MEMBER_TOKEN='eyJ...'   # 见下方「Token 从哪来」
  python3 /opt/xhs-cloud/cloud_deploy/scripts/insight_shadow_smoke.py

或账号登录:
  export XHS_SMOKE_USER='你的用户名'
  export XHS_SMOKE_PASS='你的密码'
  python3 cloud_deploy/scripts/insight_shadow_smoke.py

期望 persona（可选校验）:
  export XHS_SMOKE_EXPECT=legacy_dual   # legacy_dual | insight_only | auto
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
import uuid
from urllib.parse import quote

ROOT = os.environ.get("XHS_CLOUD_ROOT", "/opt/xhs-cloud")
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

BASE = os.environ.get("XHS_SMOKE_BASE", "http://127.0.0.1:8080").rstrip("/")
EXPECT = (os.environ.get("XHS_SMOKE_EXPECT") or "auto").strip().lower()

PASS = 0
FAIL = 0


def _log(ok: bool, name: str, detail: str = "") -> None:
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  [PASS] {name}" + (f" — {detail}" if detail else ""))
    else:
        FAIL += 1
        print(f"  [FAIL] {name}" + (f" — {detail}" if detail else ""))


def _request(
    method: str,
    path: str,
    *,
    token: str | None = None,
    body: dict | None = None,
    parse_json: bool = True,
) -> tuple[int, dict | str]:
    url = f"{BASE}{path}"
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8", "replace")
            if not parse_json:
                return resp.status, raw
            if not raw:
                return resp.status, {}
            try:
                return resp.status, json.loads(raw)
            except json.JSONDecodeError:
                return resp.status, {"_raw_len": len(raw)}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        if not parse_json:
            return e.code, raw
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, {"detail": raw[:300]}


def _login() -> str:
    token = (os.environ.get("XHS_MEMBER_TOKEN") or os.environ.get("XHS_SMOKE_TOKEN") or "").strip()
    if token:
        return token
    user = (os.environ.get("XHS_SMOKE_USER") or "").strip()
    password = (os.environ.get("XHS_SMOKE_PASS") or "").strip()
    if not user or not password:
        print(
            "缺少 Token。任选其一:\n"
            "  1) export XHS_MEMBER_TOKEN=...  （浏览器 localStorage xhs_member_token）\n"
            "  2) export XHS_SMOKE_USER=... XHS_SMOKE_PASS=...\n",
            file=sys.stderr,
        )
        sys.exit(2)
    code, data = _request(
        "POST",
        "/api/v1/auth/login",
        body={
            "username": user,
            "password": password,
            "device_id": f"smoke:{uuid.uuid4().hex[:12]}",
            "device_label": "insight_shadow_smoke",
        },
    )
    if code != 200:
        print(f"登录失败 HTTP {code}: {data}", file=sys.stderr)
        sys.exit(2)
    token = (data.get("access_token") or "").strip()
    if not token:
        print("登录响应无 access_token", file=sys.stderr)
        sys.exit(2)
    print(f"  [info] 已登录 user={user}")
    return token


def _check_persona(profile: dict) -> None:
    insight = bool(profile.get("insight_enabled"))
    legacy = bool(profile.get("legacy_zip_enabled"))
    route = str(profile.get("portal_route") or "")
    plan = str(profile.get("plan_code") or "")

    if EXPECT == "auto":
        _log(insight, "profile.insight_enabled", str(insight))
        _log(legacy or not insight, "profile.legacy_zip 与 insight 组合合法", f"route={route} plan={plan}")
        return

    if EXPECT == "legacy_dual":
        _log(insight and legacy, "legacy_dual: insight+legacy", f"route={route}")
        _log(route == "legacy_dual", "portal_route=legacy_dual", route)
    elif EXPECT == "insight_only":
        _log(insight and not legacy, "insight_only: 仅 AI", f"route={route}")
        _log(route == "insight_only", "portal_route=insight_only", route)
    else:
        _log(False, "未知 XHS_SMOKE_EXPECT", EXPECT)


def main() -> int:
    print(f"Insight Shadow Smoke @ {BASE}")
    print(f"  expect persona: {EXPECT}")

    code, health = _request("GET", "/api/v1/health")
    _log(code == 200 and health.get("status") == "ok", "health", str(health))

    token = _login()

    code, profile = _request("GET", "/api/v1/member/profile", token=token)
    _log(code == 200, "GET /member/profile", f"HTTP {code}")
    if code != 200:
        print(json.dumps(profile, ensure_ascii=False, indent=2))
        return 1

    print(
        "  profile:",
        json.dumps(
            {
                k: profile.get(k)
                for k in ("username", "plan_code", "insight_enabled", "legacy_zip_enabled", "portal_route")
            },
            ensure_ascii=False,
        ),
    )
    _check_persona(profile)

    code, lib = _request("GET", "/api/v1/member/insight/library", token=token)
    items = lib.get("items") or []
    _log(code == 200, "GET /member/insight/library", f"items={len(items)}")
    if code == 200:
        shadow = lib.get("shadow_mode")
        _log(shadow is True or len(items) > 0, "shadow 库有数据或 shadow_mode", f"shadow={shadow}")

    code_r, radar = _request("GET", "/api/v1/member/insight/radar", token=token)
    if code_r == 200 and isinstance(radar, dict):
        hl = len(radar.get("highlights") or [])
        _log(hl >= 0, "GET /member/insight/radar", f"highlights={hl} source={radar.get('source')}")
    else:
        _log(False, "GET /member/insight/radar", f"HTTP {code_r}")

    code_rec, rec = _request("GET", "/api/v1/member/insight/recommendations", token=token)
    _log(code_rec == 200, "GET /member/insight/recommendations", f"HTTP {code_rec}")

    code_h, health = _request("GET", "/api/v1/member/insight/health-score", token=token)
    if code_h == 200 and isinstance(health, dict):
        _log("score" in health, "GET /member/insight/health-score", f"score={health.get('score')}")
    else:
        _log(False, "GET /member/insight/health-score", f"HTTP {code_h}")

    code_n, notif = _request("GET", "/api/v1/member/insight/notifications", token=token)
    _log(code_n == 200 and isinstance(notif, dict), "GET /member/insight/notifications", f"HTTP {code_n} count={notif.get('count') if isinstance(notif, dict) else ''}")

    ent = profile.get("entitlements") or {}
    if ent.get("insight_compare") and len(items) >= 2:
        cats = ",".join(str(it.get("category") or "") for it in items[:2])
        code_c, cmp_data = _request("GET", f"/api/v1/member/insight/compare?categories={quote(cats, safe='')}", token=token)
        ok_cmp = code_c == 200 and isinstance(cmp_data, dict) and len(cmp_data.get("categories") or []) >= 2
        _log(ok_cmp, "GET /member/insight/compare (Pro)", f"HTTP {code_c}")
    else:
        code_c, _ = _request("GET", "/api/v1/member/insight/compare?categories=a,b", token=token)
        _log(code_c in (403, 400), "GET /member/insight/compare 门控", f"HTTP {code_c}")

    if ent.get("insight_timeline_days") and items:
        cat = str(items[0].get("category") or "")
        days = int(ent.get("insight_timeline_days") or 7)
        code_t, tl = _request(
            "GET",
            f"/api/v1/member/insight/timeline?category={quote(cat, safe='')}&days={days}",
            token=token,
        )
        _log(code_t == 200 and isinstance(tl, dict), "GET /member/insight/timeline (Pro)", f"HTTP {code_t}")
    else:
        code_t, _ = _request("GET", "/api/v1/member/insight/timeline?category=test&days=7", token=token)
        _log(code_t in (403, 400), "GET /member/insight/timeline 门控", f"HTTP {code_t}")

    if items:
        first = items[0]
        cat = str(first.get("category") or "")
        code_s, sim = _request("GET", f"/api/v1/member/insight/similar?category={quote(cat, safe='')}", token=token)
        ok_sim = code_s == 200 and isinstance(sim, dict) and sim.get("category") == cat
        _log(ok_sim, "GET /member/insight/similar", f"HTTP {code_s} source={sim.get('source') if isinstance(sim, dict) else ''}")

    if items:
        first = items[0]
        date = str(first.get("report_date") or "")[:10]
        cat = first.get("category") or ""
        view_path = (
            f"/api/v1/member/insight/{quote(date, safe='')}/{quote(cat, safe='')}"
            f"/view?access_token={quote(token, safe='')}"
        )
        vcode, html = _request("GET", view_path, parse_json=False)
        detail = f"{date}/{cat} HTTP {vcode}"
        if vcode == 200 and isinstance(html, str):
            detail += f" bytes={len(html.encode('utf-8'))}"
        _log(vcode == 200, "GET insight view HTML", detail)
    else:
        _log(False, "insight library 非空", "请先跑 run_insight_report_shadow.sh")

    print("")
    print(f"Result: {PASS} passed, {FAIL} failed")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

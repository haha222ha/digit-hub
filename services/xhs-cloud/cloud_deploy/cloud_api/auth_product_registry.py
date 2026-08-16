# -*- coding: utf-8 -*-
"""统一授权码产品注册表 — 各业务系统共享一套发码/激活轮子。

设计：
- **product**（产品/system）：assess | insight | faka | push
- **sku**（套餐/发卡规格）：各 product 独立定义，映射到 plan_code + entitlements
- **plan_code**：写入 auth_codes.plan_code，激活时 merge_entitlements 履约
- **activate_url**：各 product 独立落地页，便于第三方发卡平台填「使用说明」

CLI / Admin API / 支付履约 均通过本模块解析，避免每个系统各写一套脚本。
"""
from __future__ import annotations

import json
import os
from typing import Any

# 默认激活域名（可被环境变量覆盖）
DEFAULT_ACTIVATE_ORIGIN = os.environ.get(
    "XHS_AUTH_ACTIVATE_ORIGIN", "https://monitor.xhs365.cn"
).rstrip("/")


def _url(path: str, *, query: str = "") -> str:
    base = DEFAULT_ACTIVATE_ORIGIN
    q = f"?{query}" if query else ""
    if path.startswith("http"):
        return f"{path}{q}"
    if not path.startswith("/"):
        path = f"/{path}"
    return f"{base}{path}{q}"


# product → sku → 发码/激活元数据
AUTH_PRODUCT_REGISTRY: dict[str, dict[str, Any]] = {
    "assess": {
        "label": "心象测",
        "description": "心理/趣味测评完整报告解锁",
        "activate_path": "/",
        "activate_query": "api=live&code={code}",
        "skus": {
            "single": {
                "label": "单次完整报告",
                "plan_code": "assess_single",
                "duration_days": 7,
                "max_activations": 1,
                "summary": "7 天 · 1 份完整报告",
            },
            "card": {
                "label": "第三方发卡码",
                "plan_code": "assess_code",
                "duration_days": 7,
                "max_activations": 1,
                "summary": "小红书/闲鱼发卡 · 1 份完整报告",
            },
            "monthly": {
                "label": "月度测评会员",
                "plan_code": "assess_monthly",
                "duration_days": 30,
                "max_activations": 1,
                "summary": "30 天 · 报告额度 30",
            },
        },
    },
    "insight": {
        "label": "AI 选品情报",
        "description": "选品 insight / 类目情报阅读",
        "activate_path": "/member",
        "activate_query": "code={code}",
        "skus": {
            "experience_3d": {
                "label": "体验卡 3 天",
                "plan_code": "experience_3d",
                "duration_days": 3,
                "max_activations": 1,
            },
            "monthly": {
                "label": "月度会员",
                "plan_code": "monthly",
                "duration_days": 30,
                "max_activations": 1,
            },
            "quarterly": {
                "label": "季度会员",
                "plan_code": "quarterly",
                "duration_days": 90,
                "max_activations": 1,
            },
            "halfyear": {
                "label": "半年会员",
                "plan_code": "halfyear",
                "duration_days": 183,
                "max_activations": 1,
            },
            "yearly": {
                "label": "年度会员",
                "plan_code": "yearly",
                "duration_days": 365,
                "max_activations": 1,
            },
        },
    },
    "faka": {
        "label": "云发卡商城",
        "description": "虚拟资料 / 网盘链接发货（预留）",
        "activate_path": "/shop",
        "activate_query": "code={code}",
        "skus": {
            "download_once": {
                "label": "单次下载",
                "plan_code": "faka_once",
                "duration_days": 7,
                "max_activations": 1,
                "summary": "预留 · 单次资料下载",
                "reserved": True,
            },
        },
    },
    "push": {
        "label": "校招推送",
        "description": "校招信息推送（预留）",
        "activate_path": "/push",
        "activate_query": "code={code}",
        "skus": {
            "monthly": {
                "label": "月度推送",
                "plan_code": "push_monthly",
                "duration_days": 30,
                "max_activations": 1,
                "summary": "预留 · 校招推送月卡",
                "reserved": True,
            },
        },
    },
    "psy_dist": {
        "label": "心理测评分销",
        "description": "分销商额度码 · 生成测评链接",
        "activate_path": os.environ.get("XHS_PSY_ORIGIN", "https://psy.xhs365.cn").rstrip("/") + "/login",
        "activate_query": "code={code}",
        "skus": {
            "quota_100": {
                "label": "额度 100 次",
                "plan_code": "psy_quota_100",
                "duration_days": 365,
                "max_activations": 1,
                "summary": "100 次链接生成额度",
                "quota_amount": 100,
            },
            "quota_500": {
                "label": "额度 500 次",
                "plan_code": "psy_quota_500",
                "duration_days": 365,
                "max_activations": 1,
                "summary": "500 次链接生成额度",
                "quota_amount": 500,
            },
            "quota_100000": {
                "label": "额度 100000 次",
                "plan_code": "psy_quota_100000",
                "duration_days": 365,
                "max_activations": 1,
                "summary": "100000 次链接生成额度（大额兑换）",
                "quota_amount": 100000,
            },
        },
    },
}


def list_products(*, include_reserved: bool = False) -> list[dict]:
    out = []
    for pid, prod in AUTH_PRODUCT_REGISTRY.items():
        skus = []
        for sid, sku in (prod.get("skus") or {}).items():
            if sku.get("reserved") and not include_reserved:
                continue
            skus.append(
                {
                    "sku": sid,
                    "label": sku.get("label"),
                    "plan_code": sku.get("plan_code"),
                    "duration_days": sku.get("duration_days"),
                    "max_activations": sku.get("max_activations", 1),
                    "summary": sku.get("summary"),
                    "reserved": bool(sku.get("reserved")),
                }
            )
        if not skus and not include_reserved:
            continue
        out.append(
            {
                "product": pid,
                "label": prod.get("label"),
                "description": prod.get("description"),
                "activate_url_template": activation_url_template(pid),
                "skus": skus,
            }
        )
    return out


def get_product(product: str) -> dict | None:
    return AUTH_PRODUCT_REGISTRY.get(str(product or "").strip().lower())


def resolve_sku(product: str, sku: str) -> dict:
    """product + sku → plan_code / duration / note 等发码参数。"""
    pid = str(product or "").strip().lower()
    sid = str(sku or "").strip().lower()
    prod = get_product(pid)
    if not prod:
        raise ValueError(f"未知 product: {product}（可用: {', '.join(AUTH_PRODUCT_REGISTRY)}）")
    skus = prod.get("skus") or {}
    row = skus.get(sid)
    if not row:
        raise ValueError(
            f"未知 sku: {product}/{sku}（可用: {', '.join(skus)}）"
        )
    if row.get("reserved"):
        raise ValueError(f"sku {product}/{sku} 尚未上线（reserved）")
    plan_code = row["plan_code"]
    duration_days = int(row.get("duration_days") or 30)
    max_act = int(row.get("max_activations") or 1)
    note = build_fulfillment_note(plan_code, product=pid, sku=sid)
    return {
        "product": pid,
        "sku": sid,
        "product_label": prod.get("label"),
        "sku_label": row.get("label"),
        "plan_code": plan_code,
        "duration_days": duration_days,
        "max_activations": max_act,
        "note": note,
        "activate_url_template": activation_url_template(pid),
    }


def resolve_plan(plan_code: str) -> dict | None:
    """legacy：仅 plan_code 反查 product/sku（CLI --plan 兼容）。"""
    code = str(plan_code or "").strip()
    for pid, prod in AUTH_PRODUCT_REGISTRY.items():
        for sid, sku in (prod.get("skus") or {}).items():
            if sku.get("plan_code") == code:
                return resolve_sku(pid, sid)
    return None


def build_fulfillment_note(
    plan_code: str,
    *,
    product: str = "",
    sku: str = "",
    channel: str = "",
    remark: str = "",
) -> str:
    """写入 auth_codes.note — 与支付履约 JSON 同构，激活时 merge_entitlements。"""
    from cloud_deploy.cloud_api.payment_plans import entitlements_note_for_payment_plan

    base = entitlements_note_for_payment_plan(plan_code)
    payload: dict[str, Any] = {}
    if base:
        try:
            payload = json.loads(base)
        except json.JSONDecodeError:
            payload = {"raw": base}
    meta = payload.setdefault("meta", {})
    if product:
        meta["product"] = product
    if sku:
        meta["sku"] = sku
    if channel:
        meta["channel"] = channel
    if remark:
        meta["remark"] = remark
    return json.dumps(payload, ensure_ascii=False)


def activation_url(code: str, product: str) -> str:
    """生成用户激活链接。"""
    prod = get_product(product)
    if not prod:
        return _url("/", query=f"api=live&code={code}")
    path = prod.get("activate_path") or "/"
    qtpl = prod.get("activate_query") or "code={code}"
    query = qtpl.format(code=code)
    return _url(path, query=query)


def activation_url_template(product: str) -> str:
    return activation_url("{code}", product)


def format_batch_export(
    product: str,
    sku: str,
    codes: list[str],
    *,
    channel: str = "",
) -> str:
    """发卡平台导入友好格式：码 + 激活链接。"""
    lines = [
        f"# product={product} sku={sku} channel={channel or '-'} count={len(codes)}",
        "# code\tactivate_url",
    ]
    for c in codes:
        lines.append(f"{c}\t{activation_url(c, product)}")
    return "\n".join(lines)

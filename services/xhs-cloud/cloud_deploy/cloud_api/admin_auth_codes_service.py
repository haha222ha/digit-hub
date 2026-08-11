# -*- coding: utf-8 -*-
"""Admin 授权码生成 — Sync Key API 与浏览器后台共用。"""
from __future__ import annotations

import json

from fastapi import HTTPException

from cloud_deploy.cloud_api import database as db


def generate_auth_codes_request(
    *,
    count: int,
    plan_code: str = "",
    product: str = "",
    sku: str = "",
    channel: str = "",
    note: str = "",
    duration_days: int = 0,
    max_activations: int = 0,
) -> dict:
    from cloud_deploy.cloud_api.auth_product_registry import (
        activation_url_template,
        build_fulfillment_note,
        format_batch_export,
        resolve_plan,
        resolve_sku,
    )
    from cloud_deploy.cloud_api.payment_plans import entitlements_note_for_payment_plan

    channel = (channel or "").strip()
    remark = (note or "").strip()

    if product and sku:
        spec = resolve_sku(product, sku)
        plan_code = spec["plan_code"]
        duration_days = duration_days or spec["duration_days"]
        max_activations = max_activations or spec["max_activations"]
        note_json = build_fulfillment_note(
            plan_code,
            product=spec["product"],
            sku=spec["sku"],
            channel=channel,
            remark=remark,
        )
        product = spec["product"]
        sku = spec["sku"]
        label = f"{spec['product_label']} · {spec['sku_label']}"
    elif plan_code:
        spec = resolve_plan(plan_code)
        duration_days = duration_days or (spec["duration_days"] if spec else 30)
        max_activations = max_activations or (spec["max_activations"] if spec else 1)
        product = spec["product"] if spec else ""
        sku = spec["sku"] if spec else ""
        label = plan_code
        base = entitlements_note_for_payment_plan(plan_code)
        if base:
            payload = json.loads(base)
            meta = payload.setdefault("meta", {})
            if channel:
                meta["channel"] = channel
            if remark:
                meta["remark"] = remark
            note_json = json.dumps(payload, ensure_ascii=False)
        else:
            note_json = remark or channel
    else:
        raise HTTPException(status_code=400, detail="需要 product+sku 或 plan_code")

    codes = db.generate_auth_codes(
        count=count,
        plan_code=plan_code,
        duration_days=duration_days,
        max_activations=max_activations,
        note=note_json,
    )
    export = format_batch_export(product, sku, codes, channel=channel) if product else ""
    return {
        "codes": codes,
        "product": product or None,
        "sku": sku or None,
        "label": label,
        "plan_code": plan_code,
        "duration_days": duration_days,
        "max_activations": max_activations,
        "channel": channel or None,
        "activate_url_template": activation_url_template(product) if product else None,
        "export_tsv": export,
    }

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""本地模拟 hwxun 支付回调（验签 + 履约联调 / 网关已扣款但 notify 未到时补单）。

用法（在服务器 /opt/xhs-cloud 下）:
  cd /opt/xhs-cloud
  PYTHONPATH=/opt/xhs-cloud ./venv/bin/python cloud_deploy/scripts/simulate_hwxun_notify.py XHSP..."""
from __future__ import annotations

import argparse
import os
import sys
import urllib.parse
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUD_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
if CLOUD_ROOT not in sys.path:
    sys.path.insert(0, CLOUD_ROOT)

from cloud_deploy.scripts.bootstrap_env import bootstrap
bootstrap()

from cloud_deploy.cloud_api import database as db
from cloud_deploy.cloud_api.hwxun_pay import _epay_sign, channel_merchant_credentials


def main() -> int:
    parser = argparse.ArgumentParser(description="模拟 hwxun 异步通知")
    parser.add_argument("order_no", help="商户订单号")
    parser.add_argument("--trade-no", default="SIMulatedGW001", help="网关订单号")
    parser.add_argument("--port", default=os.environ.get("XHS_CLOUD_PORT", "8080"))
    parser.add_argument("--dry-run", action="store_true", help="只打印参数，不发送")
    args = parser.parse_args()

    order_no = args.order_no.strip()
    row = db.get_payment_order(order_no)
    if not row:
        print(f"订单不存在: {order_no}")
        return 1

    ch = row.get("channel") or "alipay"
    pid, key = channel_merchant_credentials(str(ch))
    params = {
        "pid": pid,
        "trade_no": args.trade_no,
        "out_trade_no": order_no,
        "type": ch,
        "name": f"选品报告会员-{row.get('plan_code', '')}",
        "money": f"{float(row['amount']):.2f}",
        "trade_status": "TRADE_SUCCESS",
    }
    params["sign"] = _epay_sign(params, key)
    params["sign_type"] = "MD5"

    print("通道:", ch)
    print("PID:", pid)
    print("金额:", params["money"])
    print("当前状态:", row.get("status"))
    print("签名参数:", params)

    if args.dry_run:
        return 0

    body = urllib.parse.urlencode(params).encode()
    url = f"http://127.0.0.1:{args.port}/api/v1/payment/notify/hwxun"
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    with urllib.request.urlopen(req, timeout=15) as resp:
        result = resp.read().decode()
    print("notify 响应:", result)

    after = db.get_payment_order(order_no)
    print("更新后状态:", after.get("status") if after else None)
    print("paid_at:", after.get("paid_at") if after else None)
    return 0 if after and after.get("status") == "paid" else 2


if __name__ == "__main__":
    raise SystemExit(main())

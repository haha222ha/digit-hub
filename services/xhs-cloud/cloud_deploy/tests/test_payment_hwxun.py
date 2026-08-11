# -*- coding: utf-8 -*-
"""hwxun 支付：签名、回调履约、叠加续费。"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, os.path.dirname(ROOT))

from cloud_deploy.scripts.bootstrap_env import bootstrap

bootstrap()

from cloud_deploy.cloud_api import database as db
from cloud_deploy.cloud_api.hwxun_pay import _epay_sign, verify_notify_epay
from cloud_deploy.cloud_api import payment_service as pay


class HwxunSignTest(unittest.TestCase):
    def test_sign_and_verify(self):
        params = {
            "pid": "1001",
            "type": "wxpay",
            "out_trade_no": "XHSP202607081200001",
            "money": "99.00",
            "trade_status": "TRADE_SUCCESS",
        }
        key = "test_secret_key"
        params["sign"] = _epay_sign(params, key)
        self.assertTrue(verify_notify_epay(params, key))


class PaymentFulfillTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self._tmp.close()
        os.environ["XHS_DATABASE_URL"] = ""
        os.environ["XHS_CLOUD_API_DB"] = self._tmp.name
        os.environ["XHS_PAY_KEY"] = "test_pay_key"
        os.environ["XHS_PAY_PID"] = "1001"
        os.environ["XHS_PAY_NOTIFY_BASE"] = "https://monitor.xhs365.cn"
        db.init_db()

    def tearDown(self):
        try:
            os.unlink(self._tmp.name)
        except OSError:
            pass

    def test_notify_paid_generates_code_and_renews_logged_in_user(self):
        profile = db.register_with_auth_code("payuser", "pass123456", db.generate_auth_codes(count=1, duration_days=7)[0])
        uid = profile["id"]
        db.insert_payment_order(
            order_no="XHSPTEST001",
            user_id=uid,
            plan_code="monthly",
            duration_days=30,
            amount="99.00",
            channel="wxpay",
            client_ip="127.0.0.1",
            expires_at="2099-01-01 00:00:00",
        )
        params = {
            "pid": "1001",
            "trade_no": "GW123",
            "out_trade_no": "XHSPTEST001",
            "type": "wxpay",
            "name": "选品报告会员",
            "money": "99.00",
            "trade_status": "TRADE_SUCCESS",
        }
        params["sign"] = _epay_sign(params, "test_pay_key")
        self.assertEqual(pay.handle_hwxun_notify(params), "success")
        row = db.get_payment_order("XHSPTEST001")
        self.assertEqual(row["status"], "paid")
        self.assertTrue(row["auth_code"])
        self.assertEqual(int(row["fulfilled_user_id"]), uid)
        after = db.get_member_profile(uid)
        self.assertGreaterEqual(after["days_remaining"], 30)

    def test_notify_without_trade_status_returns_fail(self):
        db.insert_payment_order(
            order_no="XHSPTEST003",
            user_id=None,
            plan_code="pay_test",
            duration_days=1,
            amount="1.00",
            channel="alipay",
            client_ip="127.0.0.1",
            expires_at="2099-01-01 00:00:00",
        )
        params = {
            "pid": "1001",
            "trade_no": "GW125",
            "out_trade_no": "XHSPTEST003",
            "money": "1.00",
        }
        params["sign"] = _epay_sign(params, "test_pay_key")
        self.assertEqual(pay.handle_hwxun_notify(params), "fail")

    def test_guest_order_claim_after_login(self):
            order_no="XHSPTEST002",
            user_id=None,
            plan_code="monthly",
            duration_days=30,
            amount="99.00",
            channel="wxpay",
            client_ip="127.0.0.1",
            expires_at="2099-01-01 00:00:00",
        )
        params = {
            "pid": "1001",
            "trade_no": "GW124",
            "out_trade_no": "XHSPTEST002",
            "money": "99.00",
            "trade_status": "TRADE_SUCCESS",
        }
        params["sign"] = _epay_sign(params, "test_pay_key")
        pay.handle_hwxun_notify(params)
        profile = db.register_with_auth_code("guestclaim", "pass123456", db.generate_auth_codes(count=1, duration_days=1)[0])
        uid = profile["id"]
        result = pay.claim_paid_order("XHSPTEST002", uid)
        self.assertIn("membership", result)
        self.assertGreaterEqual(result["membership"]["days_remaining"], 30)


if __name__ == "__main__":
    unittest.main()

# -*- coding: utf-8 -*-
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
from cloud_deploy.cloud_api import payment_service as pay


class PayRateLimitTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self._tmp.close()
        os.environ["XHS_CLOUD_API_DB"] = self._tmp.name
        os.environ["XHS_DATABASE_URL"] = ""
        # force sqlite reload
        import importlib
        import cloud_deploy.cloud_api.database as database_mod
        import cloud_deploy.cloud_api.config as config_mod

        importlib.reload(config_mod)
        importlib.reload(database_mod)
        global db, pay
        from cloud_deploy.cloud_api import database as db  # noqa: F811
        from cloud_deploy.cloud_api import payment_service as pay  # noqa: F811

        db.init_db()

    def tearDown(self):
        try:
            os.unlink(self._tmp.name)
        except OSError:
            pass

    def test_rate_limit_after_create(self):
        plan = {"plan_code": "assess_single", "label": "单次", "amount": "1.99", "duration_days": 7, "price_yuan": 1.99}

        with patch.object(pay, "get_plan", return_value=plan), patch.object(
            pay, "create_epay_order", return_value={"qrcode": "https://pay.example/qr", "trade_no": "T1"}
        ), patch.object(pay, "_notify_url", return_value="https://example.com/notify"):
            first = pay.create_order(
                plan_code="assess_single",
                user_id=None,
                client_ip="8.8.8.8",
                channel="wxpay",
            )
            self.assertEqual(first["status"], "pending")
            # same channel immediately → reuse, not rate limit
            second = pay.create_order(
                plan_code="assess_single",
                user_id=None,
                client_ip="8.8.8.8",
                channel="wxpay",
            )
            self.assertTrue(second.get("reused"))
            self.assertEqual(second["order_no"], first["order_no"])


if __name__ == "__main__":
    unittest.main()

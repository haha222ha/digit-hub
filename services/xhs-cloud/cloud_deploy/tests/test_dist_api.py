# -*- coding: utf-8 -*-
"""心理测评分销 API 冒烟测试。"""
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
from cloud_deploy.cloud_api import dist_db
from cloud_deploy.cloud_api import dist_ops
from cloud_deploy.cloud_api import dist_orders as dist_ord
from cloud_deploy.cloud_api import dist_service as svc


class DistApiTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self._tmp.close()
        os.environ["XHS_DATABASE_URL"] = ""
        os.environ["XHS_CLOUD_API_DB"] = self._tmp.name
        db.init_db()
        db.ensure_admin()

    def tearDown(self):
        try:
            os.unlink(self._tmp.name)
        except OSError:
            pass

    def test_list_tests_from_catalog(self):
        tests = svc.list_tests()
        self.assertGreaterEqual(len(tests), 30)
        codes = {t["test_code"] for t in tests}
        self.assertIn("mbti", codes)
        self.assertIn("7v7", codes)

    def test_generate_validate_complete_link(self):
        profile = db.register_user_account("distuser1", "pass123456")
        uid = int(profile["id"])
        dist_db.ensure_distributor(uid, default_quota=10)
        links = svc.generate_links(uid, "7v7", 1)
        items = links.get("links") if isinstance(links, dict) else links
        self.assertEqual(len(items), 1)
        token = items[0]["token"]
        valid = svc.validate_token(token, "7v7")
        self.assertTrue(valid.get("valid"))
        svc.start_test(token)
        done = svc.complete_test(token, result_data={"score": 88, "type": "demo"})
        self.assertTrue(done.get("success"))
        self.assertEqual(done.get("usedCount"), 1)

    def test_dist_order_package_mapping(self):
        pkg = dist_ord.get_package(1)
        self.assertIsNotNone(pkg)
        self.assertEqual(pkg["plan_code"], "psy_quota_100")
        methods = dist_ord.purchase_methods()
        self.assertIn("online_payment_available", methods)

    def test_admin_dist_stats(self):
        profile = db.register_user_account("distadmin1", "pass123456")
        uid = int(profile["id"])
        dist_db.ensure_distributor(uid, default_quota=5)
        svc.generate_links(uid, "mbti", 1)
        stats = dist_db.admin_dist_stats()
        self.assertGreaterEqual(stats["distributors"], 1)
        self.assertGreaterEqual(stats["links_total"], 1)
        links = dist_db.admin_list_links(limit=10)
        self.assertTrue(any(x.get("test_code") == "mbti" for x in links))

    def test_payment_notify_log_list(self):
        dist_db.log_payment_notify(
            {"out_trade_no": "ORD_TEST_1", "trade_status": "TRADE_SUCCESS"},
            "success",
            client_ip="127.0.0.1",
            verify_ok=True,
        )
        dist_db.log_payment_notify(
            {"out_trade_no": "ORD_TEST_2", "trade_status": "TRADE_FAIL"},
            "fail",
            client_ip="127.0.0.1",
            verify_ok=False,
        )
        page = dist_db.list_payment_notify_logs_page(page=1, per_page=10)
        logs = page.get("logs") or []
        self.assertGreaterEqual(len(logs), 2)
        ok_logs = dist_db.list_payment_notify_logs_page(page=1, per_page=10, status="success")
        self.assertTrue(all(x.get("status") == "success" for x in ok_logs.get("logs") or []))
        detail = dist_db.get_payment_notify_log(int(logs[0]["id"]))
        self.assertIsNotNone(detail)
        self.assertIn("raw_body", detail)

    def test_package_documents_roundtrip(self):
        row = dist_ops.save_package_document(
            {
                "title": "测试文档",
                "document_url": "https://example.com/doc",
                "package_id": 0,
                "display_order": 1,
            }
        )
        self.assertTrue(row.get("id"))
        docs = dist_ops.list_package_documents()
        self.assertTrue(any(d.get("title") == "测试文档" for d in docs))

    def test_quota_logs_change_type_filter(self):
        profile = db.register_user_account("qloguser", "pass123456")
        uid = int(profile["id"])
        dist_db.ensure_distributor(uid, default_quota=5)
        dist_db.add_quota(uid, 3, change_type="redeem", remark="test-redeem")
        dist_db.add_quota(uid, 2, change_type="purchase", remark="test-purchase")
        all_logs = dist_db.list_quota_logs_page(uid, page=1, per_page=20)
        self.assertGreaterEqual(len(all_logs.get("logs") or []), 2)
        redeem_logs = dist_db.list_quota_logs_page(uid, page=1, per_page=20, change_type="redeem")
        self.assertTrue(all(x.get("change_type") == "redeem" for x in redeem_logs.get("logs") or []))

    def test_test_results_date_filter(self):
        profile = db.register_user_account("tresultuser", "pass123456")
        uid = int(profile["id"])
        dist_db.ensure_distributor(uid, default_quota=5)
        links = svc.generate_links(uid, "7v7", 1)
        token = links["links"][0]["token"]
        svc.start_test(token)
        svc.complete_test(token, result_data={"score": 1})
        data = dist_db.list_test_results_page(uid, page=1, per_page=10, test_code="7v7")
        self.assertGreaterEqual(len(data.get("results") or []), 1)

    def test_payment_stats_range(self):
        stats = dist_ops.payment_stats_range("2020-01-01", "2099-12-31")
        self.assertIn("summary", stats)
        self.assertIn("daily_trend", stats)

    def test_start_pay_redirect_or_qrcode(self):
        profile = db.register_user_account("payuser2", "pass123456")
        uid = int(profile["id"])
        dist_db.ensure_distributor(uid, default_quota=5)
        from datetime import datetime, timedelta

        order_no = "ORD_PAY_REDIRECT"
        db.insert_payment_order(
            order_no=order_no,
            user_id=uid,
            plan_code="psy_quota_100",
            duration_days=0,
            amount="9.90",
            channel="wxpay",
            client_ip="127.0.0.1",
            expires_at=(datetime.now() + timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S"),
        )
        with patch("cloud_deploy.cloud_api.hwxun_pay.build_epay_submit_url", return_value="https://pay.example/submit"), patch(
            "cloud_deploy.cloud_api.payment_service._notify_url", return_value="https://example.com/notify"
        ), patch("cloud_deploy.cloud_api.payment_service._return_url", return_value="https://example.com/return"):
            out = dist_ord.start_pay(order_no, uid, payment_method="wxpay")
        self.assertIn(out.get("pay_type"), ("redirect", "code_url"))
        self.assertTrue(out.get("pay_data"))

    def test_merchant_dashboard_trends(self):
        profile = db.register_user_account("dashuser", "pass123456")
        uid = int(profile["id"])
        dist_db.ensure_distributor(uid, default_quota=10)
        svc.generate_links(uid, "7v7", 2)
        trends = dist_db.merchant_dashboard_trends(uid, days=7)
        self.assertEqual(len(trends.get("days") or []), 7)
        self.assertEqual(len(trends.get("links_daily") or []), 7)
        self.assertGreaterEqual(sum(trends.get("links_daily") or []), 2)

    def test_delete_distributor_soft(self):
        profile = db.register_user_account("deluser", "pass123456")
        uid = int(profile["id"])
        dist_db.ensure_distributor(uid, default_quota=5)
        row = dist_db.delete_distributor(uid)
        self.assertEqual(row.get("status"), "deleted")

    def test_payment_notify_logs_export(self):
        dist_db.init_dist_tables()
        rows = dist_db.list_payment_notify_logs_export(limit=10)
        self.assertIsInstance(rows, list)

    def test_homepage_stats(self):
        data = svc.homepage_stats()
        self.assertIn("tests", data)
        self.assertIn("stats", data)
        self.assertGreaterEqual(len(data.get("tests") or []), 1)
        stats = data.get("stats") or {}
        self.assertIn("tests_catalog", stats)
        self.assertIn("links_total", stats)

    def test_faka_claim_no_reuse(self):
        profile = db.register_user_account("fakauser1", "pass123456")
        uid = int(profile["id"])
        dist_db.ensure_distributor(uid, default_quota=20)
        svc.generate_links(uid, "7v7", 5)
        inv0 = dist_db.faka_inventory(uid, test_code="7v7")
        self.assertEqual(inv0["unclaimed_unused"], 5)
        first = dist_db.claim_links_for_faka(uid, test_code="7v7", count=3, client_id="pc-1")
        self.assertEqual(first["claimed"], 3)
        self.assertEqual(len(first["links"]), 3)
        self.assertTrue(all(x.get("url", "").startswith("https://") for x in first["links"]))
        self.assertEqual(first["remaining_unclaimed"], 2)
        tokens = {x["token"] for x in first["links"]}
        second = dist_db.claim_links_for_faka(uid, test_code="7v7", count=10, client_id="pc-2")
        self.assertEqual(second["claimed"], 2)
        self.assertTrue(tokens.isdisjoint({x["token"] for x in second["links"]}))
        third = dist_db.claim_links_for_faka(uid, test_code="7v7", count=1)
        self.assertEqual(third["claimed"], 0)
        listed = dist_db.list_links_page(uid, test_code="7v7", faka_claimed="1", page=1, per_page=50)
        self.assertEqual(listed["total"], 5)
        # release batch then reclaim
        rel = dist_db.release_links_for_faka(uid, batch_id=first["batchId"])
        self.assertEqual(rel["released"], 3)
        again = dist_db.claim_links_for_faka(uid, test_code="7v7", count=2)
        self.assertEqual(again["claimed"], 2)


if __name__ == "__main__":
    unittest.main()

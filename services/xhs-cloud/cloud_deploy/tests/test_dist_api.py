# -*- coding: utf-8 -*-
"""心理测评分销 API 冒烟测试。"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, os.path.dirname(ROOT))

from cloud_deploy.scripts.bootstrap_env import bootstrap

bootstrap()

from cloud_deploy.cloud_api import database as db
from cloud_deploy.cloud_api import dist_db
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
        from cloud_deploy.cloud_api import dist_orders as dist_ord

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


if __name__ == "__main__":
    unittest.main()

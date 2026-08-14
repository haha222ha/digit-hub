# -*- coding: utf-8 -*-
"""订单履约：bindings/orders sync + allocate 幂等 + 公开 order-claim。"""
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


class OrderClaimTest(unittest.TestCase):
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

    def test_self_serve_and_im_idempotent(self):
        profile = db.register_user_account("order_claim_u", "pass123456")
        uid = int(profile["id"])
        dist_db.ensure_distributor(uid, default_quota=30)
        out_gen = svc.generate_links(uid, "mbti", 5)
        links = out_gen.get("links") if isinstance(out_gen, dict) else out_gen
        self.assertGreaterEqual(len(links or []), 3)

        dist_db.sync_product_bindings(
            uid,
            [{"product_id": "sku-1", "test_code": "mbti", "product_name": "MBTI测评"}],
        )
        # 未见订单：自助拒绝
        with self.assertRaises(ValueError) as cm:
            dist_db.order_claim_public("ORD-1001")
        self.assertIn("未同步", str(cm.exception))

        dist_db.sync_seen_orders(uid, [{"order_id": "ORD-1001", "product_id": "sku-1"}])
        out1 = dist_db.order_claim_public("ORD-1001")
        self.assertTrue(out1["url"])
        self.assertEqual(out1["test_code"], "mbti")
        self.assertFalse(out1["already"])
        self.assertEqual(out1["channel"], "self_serve")

        # 再次自助：原样返回
        out2 = dist_db.order_claim_public("ORD-1001")
        self.assertEqual(out2["url"], out1["url"])
        self.assertTrue(out2["already"])

        # IM 同单：同一 URL
        out3 = dist_db.allocate_link_for_order(
            uid, "ORD-1001", channel="im", product_id="sku-1"
        )
        self.assertEqual(out3["url"], out1["url"])
        self.assertTrue(out3["already"])

    def test_im_first_then_self_serve(self):
        profile = db.register_user_account("order_claim_u2", "pass123456")
        uid = int(profile["id"])
        dist_db.ensure_distributor(uid, default_quota=20)
        svc.generate_links(uid, "mbti", 2)
        dist_db.sync_product_bindings(
            uid, [{"product_id": "p2", "test_code": "mbti", "product_name": "p2"}]
        )
        # IM 先发（自动登记 seen）
        im = dist_db.allocate_link_for_order(
            uid, "ORD-2002", channel="im", product_id="p2"
        )
        self.assertFalse(im["already"])
        self.assertEqual(im["channel"], "im")
        # 自助再领同一单
        ss = dist_db.order_claim_public("ORD-2002")
        self.assertEqual(ss["url"], im["url"])
        self.assertTrue(ss["already"])

    def test_prefer_faka_claimed_stock(self):
        profile = db.register_user_account("order_claim_u3", "pass123456")
        uid = int(profile["id"])
        dist_db.ensure_distributor(uid, default_quota=20)
        svc.generate_links(uid, "mbti", 3)
        claimed = dist_db.claim_links_for_faka(uid, test_code="mbti", count=1, product_id="px")
        claimed_token = claimed["links"][0]["token"]
        dist_db.sync_product_bindings(
            uid, [{"product_id": "px", "test_code": "mbti", "product_name": "px"}]
        )
        out = dist_db.allocate_link_for_order(
            uid, "ORD-3003", channel="im", product_id="px"
        )
        self.assertEqual(out["token"], claimed_token)

    def test_no_binding_error(self):
        profile = db.register_user_account("order_claim_u4", "pass123456")
        uid = int(profile["id"])
        dist_db.ensure_distributor(uid, default_quota=10)
        svc.generate_links(uid, "mbti", 1)
        dist_db.sync_seen_orders(uid, [{"order_id": "ORD-4004", "product_id": "nobind"}])
        with self.assertRaises(ValueError) as cm:
            dist_db.order_claim_public("ORD-4004")
        self.assertIn("未绑定", str(cm.exception))


if __name__ == "__main__":
    unittest.main()

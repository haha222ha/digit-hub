# -*- coding: utf-8 -*-
"""发卡领取 API：防重复 claim / release。"""
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


class FakaClaimTest(unittest.TestCase):
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

    def test_claim_inventory_and_release(self):
        profile = db.register_user_account("faka_claim_u", "pass123456")
        uid = int(profile["id"])
        dist_db.ensure_distributor(uid, default_quota=30)
        svc.generate_links(uid, "mbti", 4)
        inv = dist_db.faka_inventory(uid, test_code="mbti")
        self.assertEqual(inv["unclaimed_unused"], 4)
        out = dist_db.claim_links_for_faka(uid, test_code="mbti", count=4, product_id="sku1")
        self.assertEqual(out["claimed"], 4)
        self.assertEqual(out["remaining_unclaimed"], 0)
        empty = dist_db.claim_links_for_faka(uid, test_code="mbti", count=1)
        self.assertEqual(empty["claimed"], 0)
        # start_test must still work on claimed links
        token = out["links"][0]["token"]
        svc.start_test(token)
        inv2 = dist_db.faka_inventory(uid, test_code="mbti")
        self.assertEqual(inv2["used"], 1)
        # cannot release after used
        rel = dist_db.release_links_for_faka(uid, link_ids=[out["links"][0]["id"]])
        self.assertEqual(rel["released"], 0)
        # release remaining unused claimed
        rel2 = dist_db.release_links_for_faka(uid, batch_id=out["batchId"])
        self.assertGreaterEqual(rel2["released"], 3)


if __name__ == "__main__":
    unittest.main()

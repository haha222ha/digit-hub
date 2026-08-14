# -*- coding: utf-8 -*-
from __future__ import annotations

import os
import tempfile
import unittest


class IntegrationTokenTest(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        os.environ["XHS_CLOUD_DB"] = os.path.join(self._td.name, "t.sqlite3")
        os.environ.pop("DATABASE_URL", None)
        from cloud_deploy.cloud_api import database as db
        from cloud_deploy.cloud_api import dist_db

        db.init_db()
        dist_db.init_dist_tables()
        self.db = db
        self.dist_db = dist_db

    def tearDown(self):
        self._td.cleanup()

    def test_api_token_create_auth_and_rotate(self):
        profile = self.db.register_user_account("integ_tok_u", "pass123456")
        uid = int(profile["id"])
        self.dist_db.ensure_distributor(uid)
        first = self.dist_db.get_or_create_api_token(uid)
        tok = first["token"]
        self.assertTrue(tok.startswith("xxpsy_"))
        user = self.dist_db.user_from_api_token(tok)
        self.assertIsNotNone(user)
        self.assertEqual(int(user["id"]), uid)
        again = self.dist_db.get_or_create_api_token(uid, rotate=False)
        self.assertEqual(again["token"], tok)
        rotated = self.dist_db.get_or_create_api_token(uid, rotate=True)
        self.assertNotEqual(rotated["token"], tok)
        self.assertIsNone(self.dist_db.user_from_api_token(tok))
        self.assertIsNotNone(self.dist_db.user_from_api_token(rotated["token"]))


if __name__ == "__main__":
    unittest.main()

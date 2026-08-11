# -*- coding: utf-8 -*-
from __future__ import annotations

import os
import sys
import unittest
from unittest.mock import MagicMock

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, os.path.dirname(ROOT))

from cloud_deploy.cloud_api.request_ip import public_ipv4_for_pay, resolve_client_ip
from cloud_deploy.cloud_api.hwxun_pay import _sanitize_clientip


def _req(**headers):
    r = MagicMock()
    r.headers = headers
    r.client = MagicMock()
    r.client.host = "10.0.0.1"
    return r


class RequestIpTest(unittest.TestCase):
    def test_prefers_cf_connecting_ip(self):
        req = _req(**{"CF-Connecting-IP": "8.8.8.8", "X-Forwarded-For": "1.2.3.4"})
        self.assertEqual(public_ipv4_for_pay(req), "8.8.8.8")

    def test_skips_ipv6_for_pay(self):
        req = _req(**{"CF-Connecting-IP": "2001:db8::1", "X-Forwarded-For": "1.2.3.4"})
        self.assertEqual(public_ipv4_for_pay(req), "1.2.3.4")

    def test_fallback_when_only_private(self):
        req = _req(**{"X-Real-IP": "127.0.0.1"})
        req.client.host = "192.168.1.1"
        self.assertEqual(public_ipv4_for_pay(req), "1.1.1.1")

    def test_resolve_keeps_ipv6(self):
        req = _req(**{"CF-Connecting-IP": "2001:db8::2"})
        self.assertEqual(resolve_client_ip(req), "2001:db8::2")

    def test_sanitize_rejects_loopback(self):
        self.assertEqual(_sanitize_clientip("127.0.0.1"), "1.1.1.1")
        self.assertEqual(_sanitize_clientip("2001:db8::3"), "1.1.1.1")
        self.assertEqual(_sanitize_clientip("8.8.8.8"), "8.8.8.8")
        self.assertEqual(_sanitize_clientip("::ffff:8.8.4.4"), "8.8.4.4")


if __name__ == "__main__":
    unittest.main()

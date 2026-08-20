#!/usr/bin/env python3
# Run on host: sudo /opt/xhs-cloud/venv/bin/python /tmp/mint_qa_tokens.py
"""Mint one unused QA link per autumn SKU for E2E."""
from __future__ import annotations

import json
import sys

sys.path.insert(0, "/opt/xhs-cloud")

from cloud_deploy.cloud_api import dist_db  # noqa: E402

CODES = ["ofpr", "jlpf", "slpz", "xzcp", "irms", "nly", "phd", "7v7"]
# use a known distributor user id; adjust if needed
USER_ID = 8


def main() -> None:
    out = []
    for code in CODES:
        links = dist_db.generate_links(USER_ID, code, 1, max_uses=3)
        tok = links[0]["token"]
        out.append(
            {
                "code": code,
                "token": tok,
                "url": f"https://psy.xhs365.cn/test/{code}/{tok}",
            }
        )
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

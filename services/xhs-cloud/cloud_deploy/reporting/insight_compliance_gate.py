# -*- coding: utf-8 -*-
"""发布前合规：k-匿名等小样本保护（REQ-COMP-002）。"""
from __future__ import annotations

import os


def k_anonymity_threshold() -> int:
    try:
        return max(1, int(os.environ.get("INSIGHT_K_ANONYMITY", "5")))
    except ValueError:
        return 5


def passes_k_anonymity(sample_size: int, *, k: int | None = None) -> bool:
    k = k if k is not None else k_anonymity_threshold()
    return int(sample_size or 0) >= k

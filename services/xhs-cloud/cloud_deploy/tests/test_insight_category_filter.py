# -*- coding: utf-8 -*-
"""聚合桶与 LLM 喂料过滤必须同源（报告 category_tag / 异名）。"""
from cloud_deploy.reporting.category_taxonomy import (
    category_equivalent,
    infer_category,
    normalize_category_tag,
)
from cloud_deploy.reporting.insight_llm_feed import filter_rows_for_category
from cloud_deploy.reporting.insight_metric_engine import aggregate_items_to_insights


def test_normalize_alias_primary():
    assert normalize_category_tag("小学教辅") == "小学资料"
    assert category_equivalent("小学教辅", "小学资料")


def test_infer_normalizes_to_report_tag():
    cat, sub = infer_category("小学数学暑假衔接练习册")
    assert cat == "小学资料"
    assert sub == "K12"


def test_filter_prefers_report_category_tag():
    rows = [
        {
            "title": "无关标题xyz",
            "category_tag": "小学资料",
            "delta": 10,
            "is_virtual": 1,
        },
        {
            "title": "厨房收纳置物架",
            "category_tag": "家居生活",
            "delta": 5,
            "is_virtual": 0,
        },
    ]
    hit = filter_rows_for_category(rows, "小学资料")
    assert len(hit) == 1
    assert hit[0]["category_tag"] == "小学资料"
    # 异名桶名也能命中
    hit2 = filter_rows_for_category(rows, "小学教辅")
    assert len(hit2) == 1


def test_aggregate_report_tags_not_empty_feed():
    items = [
        {
            "title": "任意标题",
            "category_tag": "小学资料",
            "price": 15,
            "delta": 10,
            "gr": 0.2,
            "is_new": False,
        },
        {
            "title": "另一个",
            "category_tag": "小学教辅",  # 异名 → 归一到小学资料
            "price": 12,
            "delta": 8,
            "gr": 0.15,
            "is_new": False,
        },
        {
            "title": "第三个",
            "category_tag": "小学资料",
            "price": 18,
            "delta": 6,
            "gr": 0.1,
            "is_new": False,
        },
    ]
    insights = aggregate_items_to_insights("2026-07-14", items, min_sample=3)
    cats = {i.category for i in insights}
    assert "小学资料" in cats
    feed_rows = filter_rows_for_category(items, "小学资料")
    assert len(feed_rows) == 3

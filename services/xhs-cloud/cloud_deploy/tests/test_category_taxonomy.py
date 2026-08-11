# -*- coding: utf-8 -*-
from cloud_deploy.reporting.category_taxonomy import infer_category, normalize_category_tag
from cloud_deploy.reporting.insight_compliance_gate import passes_k_anonymity
from cloud_deploy.reporting.insight_metric_engine import aggregate_items_to_insights


def test_infer_category_jiajiao():
    cat, sub = infer_category("小学数学暑假衔接练习册")
    assert cat == "小学资料"
    assert sub == "K12"


def test_infer_category_shouna():
    cat, sub = infer_category("厨房收纳置物架")
    assert cat == "家居生活"
    assert sub == "家居"


def test_infer_category_meizhuang_when_taxonomy_loaded():
    try:
        import yaml  # noqa: F401
    except ImportError:
        return
    cat, _ = infer_category("补水保湿面膜套装")
    assert cat == "美妆护肤"


def test_infer_virtual_fallback():
    cat, sub = infer_category("某虚拟资料", is_virtual=True)
    assert cat in ("综合类目", "其他虚拟", "虚拟综合")


def test_alias_jiaofu():
    assert normalize_category_tag("小学教辅") == "小学资料"


def test_k_anonymity():
    assert passes_k_anonymity(5, k=5)
    assert not passes_k_anonymity(4, k=5)


def test_aggregate_splits_categories():
    items = [
        {"title": "小学数学练习册", "price": 15, "delta": 10, "gr": 0.2, "is_new": False},
        {"title": "小学语文暑假作业", "price": 12, "delta": 8, "gr": 0.15, "is_new": False},
        {"title": "小学英语教辅", "price": 18, "delta": 6, "gr": 0.1, "is_new": False},
        {"title": "厨房收纳置物架", "price": 39, "delta": 20, "gr": 0.25, "is_new": True},
        {"title": "桌面收纳盒整理", "price": 29, "delta": 15, "gr": 0.2, "is_new": False},
        {"title": "衣柜收纳神器", "price": 49, "delta": 12, "gr": 0.18, "is_new": False},
    ]
    insights = aggregate_items_to_insights("2026-07-12", items, min_sample=3)
    cats = {i.category for i in insights}
    assert "小学资料" in cats
    assert "家居生活" in cats
    for ins in insights:
        assert ins.price_distribution

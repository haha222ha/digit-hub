# -*- coding: utf-8 -*-
"""A/B 测试指标存储 — 云端 SQLite（避免依赖云端 PG）。

表结构对应需求文档 48-PA-FEATURE-ENGINE-REQUIREMENTS.md §3.5。
路径：/opt/xhs-cloud/data/ab_test_metrics.db

用法：
    from cloud_deploy.rank_engine.ab_test import init_ab_test_db, record_metric
    init_ab_test_db()
    record_metric(test_date="2026-07-14", ranking_key="burst_top100",
                  mode="A", prompt_tokens=1234, completion_tokens=567,
                  total_tokens=1801, cost_cny=0.0123, duration_ms=2300,
                  report_path="/opt/xhs-cloud/data/advisor_published/2026-07-14/mode_a/advice.json")
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import threading
from contextlib import contextmanager
from datetime import date, datetime
from typing import Any, Iterator


# ========== 质量指标计算（§3.8.1） ==========

# emoji 正则（覆盖常见 emoji 范围）
_EMOJI_RE = re.compile(
    "[\U0001F300-\U0001F9FF"  # 符号 & 图片
    "\U0001FA00-\U0001FAFF"   # 扩展符号
    "\u2600-\u27BF"           # 杂项符号 + 装饰符号
    "]+",
    flags=re.UNICODE,
)
# 数字提取（用于 data_accuracy 比对）
_NUMBER_RE = re.compile(r"\d+\.?\d*")


def compute_quality_metrics(
    advice_item: dict[str, Any],
    *,
    draft_text: str = "",
) -> dict[str, Any]:
    """计算单条 advice（daily_overview / direction / cross_summary）的自动质量指标。

    对应需求文档 48 §3.8.1。

    参数：
        advice_item: advice dict，含 title/summary/content/key_points
        draft_text: B 模式的程序预计算草稿（用于 data_accuracy 比对）；A 模式传空

    返回：
        {
            "content_chars": int,
            "structure_score": int (0-4),
            "emoji_count": int,
            "markdown_score": int (0-5),
            "key_points_count": int,
            "data_accuracy": float (0-1, B 模式特有；A 模式为 None),
        }
    """
    title = str(advice_item.get("title") or "")
    summary = str(advice_item.get("summary") or "")
    content = str(advice_item.get("content") or "")
    key_points = advice_item.get("key_points") or []

    # 1. content_chars
    content_chars = len(content)

    # 2. structure_score（0-4）
    structure_score = 0
    if title.strip():
        structure_score += 1
    if summary.strip():
        structure_score += 1
    if content.strip():
        structure_score += 1
    if key_points:
        structure_score += 1

    # 3. emoji_count
    emoji_count = len(_EMOJI_RE.findall(title + content))

    # 4. markdown_score（0-5）
    markdown_score = 0
    if re.search(r"^#{1,6}\s", content, re.MULTILINE):  # 标题
        markdown_score += 1
    if re.search(r"\*\*.+?\*\*", content):  # 加粗
        markdown_score += 1
    if re.search(r"^>\s", content, re.MULTILINE):  # 引用
        markdown_score += 1
    if re.search(r"^[-*]\s", content, re.MULTILINE):  # 列表
        markdown_score += 1
    if re.search(r"`[^`]+`", content):  # 代码
        markdown_score += 1

    # 5. key_points_count
    key_points_count = len(key_points) if isinstance(key_points, list) else 0

    # 6. data_accuracy（B 模式特有：草稿数字 vs LLM 输出数字）
    data_accuracy = None
    if draft_text:
        draft_numbers = set(_NUMBER_RE.findall(draft_text))
        if draft_numbers:
            content_numbers = set(_NUMBER_RE.findall(content + summary))
            common = draft_numbers & content_numbers
            # 准确率 = 草稿数字被 LLM 引用的比例
            data_accuracy = round(len(common) / len(draft_numbers), 4) if draft_numbers else 0.0

    return {
        "content_chars": content_chars,
        "structure_score": structure_score,
        "emoji_count": emoji_count,
        "markdown_score": markdown_score,
        "key_points_count": key_points_count,
        "data_accuracy": data_accuracy,
    }

_LOCK = threading.Lock()


def _db_path() -> str:
    cloud_root = os.environ.get("XHS_CLOUD_ROOT", "/opt/xhs-cloud")
    data_dir = os.path.join(cloud_root, "data")
    os.makedirs(data_dir, exist_ok=True)
    return os.path.join(data_dir, "ab_test_metrics.db")


@contextmanager
def _conn() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(_db_path(), timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=30000")
        yield conn
    finally:
        conn.close()


DDL = """
CREATE TABLE IF NOT EXISTS ab_test_metrics (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    test_date         TEXT    NOT NULL,           -- YYYY-MM-DD
    ranking_key       TEXT    NOT NULL,           -- 榜单 key（daily_overview / cross_summary / 实际榜单 key）
    mode              TEXT    NOT NULL,           -- 'A' 或 'B'
    -- 成本
    prompt_tokens     INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens      INTEGER DEFAULT 0,
    cost_cny          REAL    DEFAULT 0,
    -- 速度
    duration_ms       INTEGER DEFAULT 0,
    -- 质量（人工填写，默认 NULL）
    accuracy_score    INTEGER,                    -- 1-5
    insight_score     INTEGER,                    -- 1-5
    hallucination     INTEGER DEFAULT 0,          -- 0/1
    -- 元数据
    report_path       TEXT,
    model             TEXT,
    extra_json        TEXT,                       -- 扩展字段（草稿长度、key_points 数等）
    created_at        TEXT    NOT NULL,
    UNIQUE(test_date, ranking_key, mode)
);
CREATE INDEX IF NOT EXISTS idx_ab_test_date ON ab_test_metrics(test_date);
CREATE INDEX IF NOT EXISTS idx_ab_test_mode ON ab_test_metrics(mode);
CREATE INDEX IF NOT EXISTS idx_ab_test_ranking ON ab_test_metrics(ranking_key);
"""


def init_ab_test_db() -> None:
    """初始化表（幂等）。"""
    with _LOCK, _conn() as c:
        c.executescript(DDL)


def record_metric(
    *,
    test_date: str,
    ranking_key: str,
    mode: str,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    total_tokens: int = 0,
    cost_cny: float = 0.0,
    duration_ms: int = 0,
    accuracy_score: int | None = None,
    insight_score: int | None = None,
    hallucination: int = 0,
    report_path: str = "",
    model: str = "",
    extra: dict[str, Any] | None = None,
) -> int:
    """写入一条指标。如已存在 (test_date, ranking_key, mode)，更新而非插入。

    返回 row id。
    """
    init_ab_test_db()
    if mode not in ("A", "B"):
        raise ValueError(f"mode 必须是 'A' 或 'B'，得到: {mode}")
    if not total_tokens:
        total_tokens = prompt_tokens + completion_tokens
    extra_json = json.dumps(extra, ensure_ascii=False) if extra else None
    created_at = datetime.utcnow().isoformat()

    with _LOCK, _conn() as c:
        cur = c.execute(
            """
            INSERT INTO ab_test_metrics (
                test_date, ranking_key, mode,
                prompt_tokens, completion_tokens, total_tokens, cost_cny,
                duration_ms, accuracy_score, insight_score, hallucination,
                report_path, model, extra_json, created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(test_date, ranking_key, mode) DO UPDATE SET
                prompt_tokens=excluded.prompt_tokens,
                completion_tokens=excluded.completion_tokens,
                total_tokens=excluded.total_tokens,
                cost_cny=excluded.cost_cny,
                duration_ms=excluded.duration_ms,
                report_path=excluded.report_path,
                model=excluded.model,
                extra_json=excluded.extra_json,
                created_at=excluded.created_at
            """,
            (
                test_date, ranking_key, mode,
                int(prompt_tokens), int(completion_tokens), int(total_tokens), float(cost_cny),
                int(duration_ms),
                int(accuracy_score) if accuracy_score is not None else None,
                int(insight_score) if insight_score is not None else None,
                int(1 if hallucination else 0),
                report_path, model, extra_json, created_at,
            ),
        )
        return int(cur.lastrowid)


def update_quality_score(
    *,
    test_date: str,
    ranking_key: str,
    mode: str,
    accuracy_score: int | None = None,
    insight_score: int | None = None,
    hallucination: int | None = None,
) -> int:
    """人工评分录入（accuracy_score / insight_score / hallucination）。

    返回受影响行数。
    """
    init_ab_test_db()
    sets: list[str] = []
    params: list[Any] = []
    if accuracy_score is not None:
        sets.append("accuracy_score=?")
        params.append(int(accuracy_score))
    if insight_score is not None:
        sets.append("insight_score=?")
        params.append(int(insight_score))
    if hallucination is not None:
        sets.append("hallucination=?")
        params.append(int(1 if hallucination else 0))
    if not sets:
        return 0
    params.extend([test_date, ranking_key, mode])
    with _LOCK, _conn() as c:
        cur = c.execute(
            f"UPDATE ab_test_metrics SET {', '.join(sets)} "
            f"WHERE test_date=? AND ranking_key=? AND mode=?",
            params,
        )
        return cur.rowcount


def list_metrics(
    *,
    date_from: str | None = None,
    date_to: str | None = None,
    ranking_key: str | None = None,
    mode: str | None = None,
    limit: int = 500,
) -> list[dict[str, Any]]:
    """查询指标（用于 Admin 后台 A/B 对比页）。"""
    init_ab_test_db()
    sql = "SELECT * FROM ab_test_metrics WHERE 1=1"
    params: list[Any] = []
    if date_from:
        sql += " AND test_date >= ?"
        params.append(date_from)
    if date_to:
        sql += " AND test_date <= ?"
        params.append(date_to)
    if ranking_key:
        sql += " AND ranking_key = ?"
        params.append(ranking_key)
    if mode:
        sql += " AND mode = ?"
        params.append(mode)
    sql += " ORDER BY test_date DESC, ranking_key ASC, mode ASC LIMIT ?"
    params.append(int(limit))
    with _conn() as c:
        rows = c.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def aggregate_daily(*, date_from: str | None = None, date_to: str | None = None) -> list[dict[str, Any]]:
    """按日聚合 A/B 对比（每日每模式一行汇总）。

    返回字段：test_date, mode, ranking_count, sum_tokens, sum_cost, avg_duration_ms, avg_accuracy, avg_insight, hallucination_count
    """
    init_ab_test_db()
    sql = """
        SELECT
            test_date,
            mode,
            COUNT(*)                                  AS ranking_count,
            SUM(total_tokens)                         AS sum_tokens,
            SUM(cost_cny)                             AS sum_cost,
            AVG(duration_ms)                          AS avg_duration_ms,
            AVG(accuracy_score)                       AS avg_accuracy,
            AVG(insight_score)                        AS avg_insight,
            SUM(hallucination)                        AS hallucination_count
        FROM ab_test_metrics
        WHERE 1=1
    """
    params: list[Any] = []
    if date_from:
        sql += " AND test_date >= ?"
        params.append(date_from)
    if date_to:
        sql += " AND test_date <= ?"
        params.append(date_to)
    sql += " GROUP BY test_date, mode ORDER BY test_date DESC, mode ASC"
    with _conn() as c:
        rows = c.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def aggregate_total(*, date_from: str | None = None, date_to: str | None = None) -> dict[str, Any]:
    """累计汇总：A vs B 总成本、总 token、平均耗时、平均评分。

    返回 {"A": {...}, "B": {...}, "savings_cny": B-A, "savings_pct": ...}
    """
    init_ab_test_db()
    sql = """
        SELECT
            mode,
            COUNT(*)                              AS ranking_count,
            SUM(total_tokens)                     AS sum_tokens,
            SUM(cost_cny)                         AS sum_cost,
            AVG(duration_ms)                      AS avg_duration_ms,
            AVG(accuracy_score)                   AS avg_accuracy,
            AVG(insight_score)                    AS avg_insight,
            SUM(hallucination)                    AS hallucination_count
        FROM ab_test_metrics
        WHERE 1=1
    """
    params: list[Any] = []
    if date_from:
        sql += " AND test_date >= ?"
        params.append(date_from)
    if date_to:
        sql += " AND test_date <= ?"
        params.append(date_to)
    sql += " GROUP BY mode"
    with _conn() as c:
        rows = c.execute(sql, params).fetchall()
    out: dict[str, Any] = {"A": None, "B": None, "savings_cny": 0.0, "savings_pct": 0.0}
    for r in rows:
        out[r["mode"]] = dict(r)
    a_cost = (out["A"] or {}).get("sum_cost") or 0
    b_cost = (out["B"] or {}).get("sum_cost") or 0
    out["savings_cny"] = round(a_cost - b_cost, 4)
    out["savings_pct"] = round((a_cost - b_cost) / a_cost * 100, 2) if a_cost > 0 else 0.0
    return out


def list_test_dates(limit: int = 30) -> list[str]:
    """列出有测试数据的日期（用于下拉选择）。"""
    init_ab_test_db()
    with _conn() as c:
        rows = c.execute(
            "SELECT DISTINCT test_date FROM ab_test_metrics ORDER BY test_date DESC LIMIT ?",
            (int(limit),),
        ).fetchall()
    return [r["test_date"] for r in rows]

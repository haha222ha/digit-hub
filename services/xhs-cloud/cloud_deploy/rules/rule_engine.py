# -*- coding: utf-8
"""监控池规则引擎（轻量，不依赖云扫描 Worker）。"""
from __future__ import annotations

import json
from datetime import date, timedelta


def _zero_v1d_streak(conn, goods_id: str, days: int) -> bool:
    """连续 N 个日历日 v1d 与 actual_v1d 均为 0（缺 metrics 行则 streak 中断）。"""
    end = date.today()
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        for i in range(days):
            d = (end - timedelta(days=i)).isoformat()
            c.execute(
                """SELECT COALESCE(actual_v1d,0), COALESCE(v1d,0)
                   FROM goods_metrics_daily WHERE goods_id=%s AND metric_date=%s""",
                (goods_id, d),
            )
            row = c.fetchone()
            if not row:
                return False
            if float(row[0] or 0) > 0 or float(row[1] or 0) > 0:
                return False
    return True


def _actual_drop_pct(conn, goods_id: str) -> float:
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            """SELECT actual_v1d FROM goods_metrics_daily
               WHERE goods_id=%s ORDER BY metric_date DESC LIMIT 2""",
            (goods_id,),
        )
        rows = [float(r[0] or 0) for r in c.fetchall()]
    if len(rows) < 2 or rows[1] <= 0:
        return 0.0
    return max(0.0, (rows[1] - rows[0]) / rows[1] * 100)


def _alert_exists_today(conn, goods_id: str, alert_type: str) -> bool:
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            """SELECT 1 FROM monitor_alerts
               WHERE goods_id=%s AND alert_type=%s
                 AND created_at >= CURRENT_DATE
               LIMIT 1""",
            (goods_id, alert_type),
        )
        return c.fetchone() is not None


def _apply_action(conn, goods_id: str, rule_id: int, action: dict, ctx: dict) -> list[str]:
    events: list[str] = []
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        pool = action.get("set_pool")
        boost = float(action.get("priority_boost") or 0)
        if pool:
            c.execute(
                """UPDATE monitor_goods SET
                       pool=%s,
                       priority_score = priority_score + CASE
                           WHEN pool IS DISTINCT FROM %s THEN %s ELSE 0 END,
                       updated_at=NOW()
                   WHERE goods_id=%s AND pool IS DISTINCT FROM %s""",
                (pool, pool, boost, goods_id, pool),
            )
            if c.rowcount:
                events.append(f"pool→{pool}")
        elif boost:
            c.execute(
                """UPDATE monitor_goods SET priority_score = priority_score + %s, updated_at=NOW()
                   WHERE goods_id=%s""",
                (boost, goods_id),
            )
            if c.rowcount:
                events.append(f"priority+{boost}")
        if status := action.get("set_status"):
            c.execute(
                """UPDATE monitor_goods SET monitor_status=%s, updated_at=NOW()
                   WHERE goods_id=%s AND monitor_status IS DISTINCT FROM %s""",
                (status, goods_id, status),
            )
            if c.rowcount:
                events.append(f"status→{status}")
        if alert_type := action.get("alert_type"):
            if _alert_exists_today(conn, goods_id, alert_type):
                return events
            c.execute(
                """INSERT INTO monitor_alerts (goods_id, rule_id, alert_type, payload_json)
                   VALUES (%s,%s,%s,%s)""",
                (goods_id, rule_id, alert_type, json.dumps(ctx, ensure_ascii=False)),
            )
            events.append(f"alert:{alert_type}")
    return events


def evaluate_rules(conn, goods_id: str | None = None, extra_ctx: dict | None = None) -> dict:
    """评估 monitor_rules，可选限定单 goods_id。全池时分批 commit 降低与 daemon 死锁。"""
    applied = 0
    alerts = 0
    batch_size = 200 if not goods_id else 0

    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute("SELECT id, name, rule_json FROM monitor_rules WHERE enabled=TRUE ORDER BY id")
        rules = [(r[0], r[1], r[2]) for r in c.fetchall()]

        if goods_id:
            c.execute(
                """SELECT goods_id, pool, monitor_status, last_v1d, last_actual_v1d
                   FROM monitor_goods WHERE goods_id=%s""",
                (goods_id,),
            )
            goods_rows = c.fetchall()
        else:
            c.execute(
                """SELECT goods_id, pool, monitor_status, last_v1d, last_actual_v1d
                   FROM monitor_goods WHERE monitor_status IN ('active','idle')
                   ORDER BY goods_id"""
            )
            goods_rows = c.fetchall()

    extra_ctx = extra_ctx or {}

    def _eval_batch(batch: list) -> tuple[int, int]:
        nonlocal applied, alerts
        b_applied = b_alerts = 0
        for gid, pool, status, last_v1d, last_actual in batch:
            ctx = {
                "goods_id": gid,
                "pool": pool,
                "status": status,
                "last_v1d": float(last_v1d or 0),
                "last_actual_v1d": float(last_actual or 0),
                **(extra_ctx if gid == goods_id or not goods_id else {}),
            }
            for rule_id, _name, rule_json in rules:
                rule = rule_json if isinstance(rule_json, dict) else json.loads(rule_json)
                when = rule.get("when") or {}
                action = rule.get("action") or {}
                if not action:
                    continue

                matched = True
                if th := when.get("last_v1d_gte"):
                    matched = matched and ctx["last_v1d"] >= float(th)
                if pool_not := when.get("pool_not"):
                    matched = matched and (pool or "") != pool_not
                if when.get("zero_v1d_days_gte"):
                    matched = matched and _zero_v1d_streak(conn, gid, int(when["zero_v1d_days_gte"]))
                if when.get("actual_v1d_drop_pct_gte"):
                    drop = _actual_drop_pct(conn, gid)
                    matched = matched and drop >= float(when["actual_v1d_drop_pct_gte"])
                    ctx["drop_pct"] = drop
                if scan_status := when.get("scan_status"):
                    matched = matched and ctx.get("scan_status") == scan_status

                if matched:
                    ev = _apply_action(conn, gid, rule_id, action, ctx)
                    if ev:
                        b_applied += 1
                        if any(e.startswith("alert:") for e in ev):
                            b_alerts += 1
        conn.commit()
        return b_applied, b_alerts

    if batch_size and len(goods_rows) > batch_size:
        for i in range(0, len(goods_rows), batch_size):
            chunk = goods_rows[i : i + batch_size]
            a, al = _eval_batch(chunk)
            applied += a
            alerts += al
    else:
        a, al = _eval_batch(goods_rows)
        applied += a
        alerts += al

    return {
        "rules_evaluated": len(rules),
        "goods_checked": len(goods_rows),
        "actions_applied": applied,
        "alerts": alerts,
    }

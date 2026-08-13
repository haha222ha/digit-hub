# -*- coding: utf-8 -*-
"""心理测评分销 · 运营配置（套餐/公告/教程/客服/测题覆盖/操作日志/支付统计）。"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from typing import Any

from cloud_deploy.cloud_api import dist_db


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _use_pg() -> bool:
    return bool(dist_db._USE_PG)  # noqa: SLF001


def _conn():
    return dist_db._pg_conn() if _use_pg() else dist_db._sqlite_conn()  # noqa: SLF001


def _cur(conn):
    return dist_db._pg_cur(conn) if _use_pg() else conn.cursor()  # noqa: SLF001


def _row(row):
    return dist_db._row_dict(row) or {}


def log_op(
    *,
    actor_user_id: int | None,
    actor_username: str = "",
    action: str,
    target_type: str = "",
    target_id: str = "",
    detail: Any = None,
) -> None:
    dist_db.init_dist_tables()
    detail_s = detail if isinstance(detail, str) else json.dumps(detail or {}, ensure_ascii=False)
    if _use_pg():
        conn = _conn()
        try:
            c = _cur(conn)
            c.execute(
                """INSERT INTO dist_operation_logs
                   (actor_user_id, actor_username, action, target_type, target_id, detail)
                   VALUES (%s,%s,%s,%s,%s,%s)""",
                (actor_user_id, actor_username or "", action, target_type, str(target_id or ""), detail_s),
            )
            conn.commit()
        finally:
            conn.close()
        return
    conn = _conn()
    c = conn.cursor()
    c.execute(
        """INSERT INTO dist_operation_logs
           (actor_user_id, actor_username, action, target_type, target_id, detail, created_at)
           VALUES (?,?,?,?,?,?,?)""",
        (actor_user_id, actor_username or "", action, target_type, str(target_id or ""), detail_s, _now()),
    )
    conn.commit()
    conn.close()


def list_operation_logs(limit: int = 100) -> list[dict]:
    dist_db.init_dist_tables()
    limit = max(1, min(int(limit or 100), 500))
    if _use_pg():
        conn = _conn()
        try:
            c = _cur(conn)
            c.execute(
                "SELECT * FROM dist_operation_logs ORDER BY id DESC LIMIT %s",
                (limit,),
            )
            return [_row(r) for r in c.fetchall()]
        finally:
            conn.close()
    conn = _conn()
    c = conn.cursor()
    c.execute("SELECT * FROM dist_operation_logs ORDER BY id DESC LIMIT ?", (limit,))
    rows = [_row(r) for r in c.fetchall()]
    conn.close()
    return rows


# ----- site config (客服 / 支付展示等) -----

_DEFAULT_CONFIG = {
    "customer_service_wechat": "",
    "customer_service_hours": "工作日 10:00–18:00",
    "customer_service_response_time": "通常 2 小时内回复",
    "customer_service_qrcode": "",
    "xianyu_shop_link": "",
    "xianyu_shop_qrcode": "",
    "link_max_uses": "3",
    "link_expire_hours": "72",
    "expire_type": "custom_days",
    "expire_days": "3",
    "link_idle_days": "90",
    "wecom_webhook": "",
    "site_name": "心象测",
    "invite_rebate_percent": "20",
}


def get_config() -> dict[str, Any]:
    dist_db.init_dist_tables()
    out = dict(_DEFAULT_CONFIG)
    if _use_pg():
        conn = _conn()
        try:
            c = _cur(conn)
            c.execute("SELECT key, value FROM dist_site_config")
            for r in c.fetchall():
                d = _row(r)
                out[str(d.get("key"))] = d.get("value") or ""
        finally:
            conn.close()
    else:
        conn = _conn()
        c = conn.cursor()
        c.execute("SELECT key, value FROM dist_site_config")
        for r in c.fetchall():
            d = _row(r)
            out[str(d.get("key"))] = d.get("value") or ""
        conn.close()
    # 支付通道状态（只读环境信息，密钥不回传）
    out["payment_wxpay_configured"] = bool(
        os.environ.get("XHS_HWXUN_PID") or os.environ.get("HWXUN_PID")
    )
    out["payment_notify_base"] = (os.environ.get("XHS_PAY_NOTIFY_BASE") or "").rstrip("/")
    out["payment_test_enabled"] = os.environ.get("XHS_PSY_PAY_TEST", "").strip() in ("1", "true", "yes")
    return out


def update_config(payload: dict[str, Any]) -> dict[str, Any]:
    dist_db.init_dist_tables()
    allowed = set(_DEFAULT_CONFIG.keys())
    for k, v in (payload or {}).items():
        if k not in allowed:
            continue
        val = "" if v is None else str(v)
        if _use_pg():
            conn = _conn()
            try:
                c = _cur(conn)
                c.execute(
                    """INSERT INTO dist_site_config (key, value, updated_at)
                       VALUES (%s,%s,NOW())
                       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()""",
                    (k, val),
                )
                conn.commit()
            finally:
                conn.close()
        else:
            conn = _conn()
            c = conn.cursor()
            c.execute(
                """INSERT INTO dist_site_config (key, value, updated_at) VALUES (?,?,?)
                   ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at""",
                (k, val, _now()),
            )
            conn.commit()
            conn.close()
    return get_config()


# ----- packages -----


def _builtin_packages() -> list[dict]:
    from cloud_deploy.cloud_api.payment_plans import list_psy_dist_plans

    out = []
    for i, p in enumerate(list_psy_dist_plans(), start=1):
        price_yuan = float(p.get("price_yuan") or p.get("amount") or 0)
        features = [x.strip() for x in (p.get("summary") or "").split("·") if x.strip()]
        out.append(
            {
                "id": i,
                "name": p["label"],
                "price": int(round(price_yuan * 100)),
                "price_yuan": price_yuan,
                "quota": int(p.get("quota_amount") or 0),
                "quota_amount": int(p.get("quota_amount") or 0),
                "is_enabled": True,
                "display_order": i,
                "subtitle": p.get("summary") or "",
                "features": features or [p.get("summary") or ""],
                "plan_code": p["plan_code"],
                "recommended": bool(p.get("recommended")),
                "source": "builtin",
            }
        )
    if os.environ.get("XHS_PSY_PAY_TEST", "").strip() in ("1", "true", "yes"):
        out.append(
            {
                "id": 9001,
                "name": "测试额度·1次",
                "price": 1,
                "price_yuan": 0.01,
                "quota": 1,
                "quota_amount": 1,
                "is_enabled": True,
                "display_order": 99,
                "subtitle": "支付联调 ¥0.01",
                "features": ["支付联调"],
                "plan_code": "psy_quota_test",
                "recommended": False,
                "source": "test",
            }
        )
    return out


def _db_packages() -> list[dict]:
    dist_db.init_dist_tables()
    rows: list[dict] = []
    if _use_pg():
        conn = _conn()
        try:
            c = _cur(conn)
            c.execute("SELECT * FROM dist_packages ORDER BY display_order ASC, id ASC")
            rows = [_row(r) for r in c.fetchall()]
        finally:
            conn.close()
    else:
        conn = _conn()
        c = conn.cursor()
        c.execute("SELECT * FROM dist_packages ORDER BY display_order ASC, id ASC")
        rows = [_row(r) for r in c.fetchall()]
        conn.close()
    out = []
    for r in rows:
        price_yuan = float(r.get("price_yuan") or 0)
        out.append(
            {
                "id": int(r["id"]) + 10000,
                "db_id": int(r["id"]),
                "name": r.get("name") or r.get("plan_code"),
                "price": int(round(price_yuan * 100)),
                "price_yuan": price_yuan,
                "quota": int(r.get("quota_amount") or 0),
                "quota_amount": int(r.get("quota_amount") or 0),
                "is_enabled": bool(r.get("is_enabled", True)),
                "display_order": int(r.get("display_order") or 0),
                "subtitle": r.get("subtitle") or "",
                "features": [r.get("subtitle") or ""],
                "plan_code": r.get("plan_code"),
                "recommended": bool(r.get("recommended")),
                "source": "db",
            }
        )
    return out


def list_packages_merged(*, include_disabled: bool = False) -> list[dict]:
    by_code: dict[str, dict] = {}
    for p in _builtin_packages():
        by_code[p["plan_code"]] = p
    for p in _db_packages():
        # DB 覆盖同 plan_code；新 plan_code 追加
        base = by_code.get(p["plan_code"], {})
        merged = {**base, **p, "id": p.get("id") or base.get("id")}
        by_code[p["plan_code"]] = merged
    items = list(by_code.values())
    items.sort(key=lambda x: (int(x.get("display_order") or 999), str(x.get("plan_code"))))
    if not include_disabled:
        items = [x for x in items if x.get("is_enabled", True)]
    # 稳定前端 id
    for i, p in enumerate(items, start=1):
        p["list_id"] = i
        if "id" not in p or p.get("source") == "builtin":
            p["id"] = i
    return items


def get_package_by_plan(plan_code: str) -> dict | None:
    code = (plan_code or "").strip()
    if not code:
        return None
    for p in list_packages_merged(include_disabled=True):
        if p.get("plan_code") == code:
            return p
    return None


def get_package_by_id(package_id: int) -> dict | None:
    pid = int(package_id)
    for p in list_packages_merged(include_disabled=True):
        if int(p.get("id") or 0) == pid or int(p.get("list_id") or 0) == pid or int(p.get("db_id") or 0) == pid:
            return p
    # fallback: 1-based index into enabled list
    enabled = list_packages_merged(include_disabled=False)
    if 1 <= pid <= len(enabled):
        return enabled[pid - 1]
    return None


def save_package(payload: dict) -> dict:
    dist_db.init_dist_tables()
    plan_code = (payload.get("plan_code") or "").strip()
    if not plan_code.startswith("psy_quota") and not plan_code.startswith("psy_dist"):
        raise ValueError("plan_code 须以 psy_quota 或 psy_dist 开头")
    name = (payload.get("name") or payload.get("label") or plan_code).strip()
    price_yuan = float(payload.get("price_yuan") or (int(payload.get("price") or 0) / 100) or 0)
    quota_amount = int(payload.get("quota_amount") or payload.get("quota") or 0)
    if quota_amount <= 0:
        raise ValueError("额度必须大于 0")
    subtitle = (payload.get("subtitle") or payload.get("summary") or "").strip()
    is_enabled = 1 if payload.get("is_enabled", True) else 0
    display_order = int(payload.get("display_order") or 0)
    recommended = 1 if payload.get("recommended") else 0
    db_id = payload.get("db_id") or (payload.get("id") if int(payload.get("id") or 0) > 10000 else None)
    if db_id and int(db_id) > 10000:
        db_id = int(db_id) - 10000

    if _use_pg():
        conn = _conn()
        try:
            c = _cur(conn)
            if db_id:
                c.execute(
                    """UPDATE dist_packages SET plan_code=%s, name=%s, price_yuan=%s, quota_amount=%s,
                       subtitle=%s, is_enabled=%s, display_order=%s, recommended=%s, updated_at=NOW()
                       WHERE id=%s RETURNING *""",
                    (plan_code, name, price_yuan, quota_amount, subtitle, bool(is_enabled), display_order, bool(recommended), int(db_id)),
                )
                row = _row(c.fetchone())
            else:
                c.execute(
                    """INSERT INTO dist_packages
                       (plan_code, name, price_yuan, quota_amount, subtitle, is_enabled, display_order, recommended)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                       ON CONFLICT (plan_code) DO UPDATE SET
                         name=EXCLUDED.name, price_yuan=EXCLUDED.price_yuan, quota_amount=EXCLUDED.quota_amount,
                         subtitle=EXCLUDED.subtitle, is_enabled=EXCLUDED.is_enabled,
                         display_order=EXCLUDED.display_order, recommended=EXCLUDED.recommended, updated_at=NOW()
                       RETURNING *""",
                    (plan_code, name, price_yuan, quota_amount, subtitle, bool(is_enabled), display_order, bool(recommended)),
                )
                row = _row(c.fetchone())
            conn.commit()
        finally:
            conn.close()
    else:
        conn = _conn()
        c = conn.cursor()
        now = _now()
        if db_id:
            c.execute(
                """UPDATE dist_packages SET plan_code=?, name=?, price_yuan=?, quota_amount=?,
                   subtitle=?, is_enabled=?, display_order=?, recommended=?, updated_at=? WHERE id=?""",
                (plan_code, name, price_yuan, quota_amount, subtitle, is_enabled, display_order, recommended, now, int(db_id)),
            )
            c.execute("SELECT * FROM dist_packages WHERE id=?", (int(db_id),))
            row = _row(c.fetchone())
        else:
            c.execute("SELECT id FROM dist_packages WHERE plan_code=?", (plan_code,))
            exist = c.fetchone()
            if exist:
                eid = int((_row(exist) or {}).get("id") or exist[0])
                c.execute(
                    """UPDATE dist_packages SET name=?, price_yuan=?, quota_amount=?, subtitle=?,
                       is_enabled=?, display_order=?, recommended=?, updated_at=? WHERE id=?""",
                    (name, price_yuan, quota_amount, subtitle, is_enabled, display_order, recommended, now, eid),
                )
                c.execute("SELECT * FROM dist_packages WHERE id=?", (eid,))
                row = _row(c.fetchone())
            else:
                c.execute(
                    """INSERT INTO dist_packages
                       (plan_code, name, price_yuan, quota_amount, subtitle, is_enabled, display_order, recommended, created_at, updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    (plan_code, name, price_yuan, quota_amount, subtitle, is_enabled, display_order, recommended, now, now),
                )
                c.execute("SELECT * FROM dist_packages WHERE plan_code=?", (plan_code,))
                row = _row(c.fetchone())
        conn.commit()
        conn.close()

    # 动态注册到 PLAN_BY_CODE，供支付金额解析
    _register_plan_runtime(plan_code, name, price_yuan, quota_amount, subtitle)
    return get_package_by_plan(plan_code) or row


def delete_package(package_key: str | int) -> None:
    dist_db.init_dist_tables()
    # 只删 DB 套餐，不删内置
    if _use_pg():
        conn = _conn()
        try:
            c = _cur(conn)
            if str(package_key).isdigit() and int(package_key) > 10000:
                c.execute("DELETE FROM dist_packages WHERE id=%s", (int(package_key) - 10000,))
            else:
                c.execute("DELETE FROM dist_packages WHERE plan_code=%s OR id=%s", (str(package_key), int(package_key) if str(package_key).isdigit() else -1))
            conn.commit()
        finally:
            conn.close()
        return
    conn = _conn()
    c = conn.cursor()
    if str(package_key).isdigit() and int(package_key) > 10000:
        c.execute("DELETE FROM dist_packages WHERE id=?", (int(package_key) - 10000,))
    elif str(package_key).isdigit():
        c.execute("DELETE FROM dist_packages WHERE id=?", (int(package_key),))
    else:
        c.execute("DELETE FROM dist_packages WHERE plan_code=?", (str(package_key),))
    conn.commit()
    conn.close()


def _register_plan_runtime(plan_code: str, name: str, price_yuan: float, quota_amount: int, subtitle: str) -> None:
    from cloud_deploy.cloud_api import payment_plans as pp

    amount = f"{float(price_yuan):.2f}"
    pp.PLAN_BY_CODE[plan_code] = {
        "plan_code": plan_code,
        "label": name,
        "duration_days": 365,
        "amount": amount,
        "price_yuan": float(price_yuan),
        "quota_amount": int(quota_amount),
        "summary": subtitle or name,
        "product": "psy_dist",
    }


def sync_db_plans_into_registry() -> None:
    for p in _db_packages():
        _register_plan_runtime(
            p["plan_code"],
            p["name"],
            float(p["price_yuan"]),
            int(p["quota_amount"]),
            p.get("subtitle") or "",
        )
    if os.environ.get("XHS_PSY_PAY_TEST", "").strip() in ("1", "true", "yes"):
        _register_plan_runtime("psy_quota_test", "测试额度·1次", 0.01, 1, "支付联调")


# ----- announcements -----


def list_announcements(*, published_only: bool = False) -> list[dict]:
    dist_db.init_dist_tables()
    if _use_pg():
        conn = _conn()
        try:
            c = _cur(conn)
            if published_only:
                c.execute("SELECT * FROM dist_announcements WHERE is_published=TRUE ORDER BY id DESC")
            else:
                c.execute("SELECT * FROM dist_announcements ORDER BY id DESC")
            return [_row(r) for r in c.fetchall()]
        finally:
            conn.close()
    conn = _conn()
    c = conn.cursor()
    if published_only:
        c.execute("SELECT * FROM dist_announcements WHERE is_published=1 ORDER BY id DESC")
    else:
        c.execute("SELECT * FROM dist_announcements ORDER BY id DESC")
    rows = [_row(r) for r in c.fetchall()]
    conn.close()
    return rows


def save_announcement(payload: dict) -> dict:
    dist_db.init_dist_tables()
    title = (payload.get("title") or "").strip()
    content = (payload.get("content") or "").strip()
    if not title:
        raise ValueError("标题必填")
    is_published = 1 if payload.get("is_published", True) else 0
    aid = payload.get("id")
    if _use_pg():
        conn = _conn()
        try:
            c = _cur(conn)
            if aid:
                c.execute(
                    """UPDATE dist_announcements SET title=%s, content=%s, is_published=%s, updated_at=NOW()
                       WHERE id=%s RETURNING *""",
                    (title, content, bool(is_published), int(aid)),
                )
                row = _row(c.fetchone())
            else:
                c.execute(
                    """INSERT INTO dist_announcements (title, content, is_published)
                       VALUES (%s,%s,%s) RETURNING *""",
                    (title, content, bool(is_published)),
                )
                row = _row(c.fetchone())
            conn.commit()
            return row
        finally:
            conn.close()
    conn = _conn()
    c = conn.cursor()
    now = _now()
    if aid:
        c.execute(
            """UPDATE dist_announcements SET title=?, content=?, is_published=?, updated_at=? WHERE id=?""",
            (title, content, is_published, now, int(aid)),
        )
        c.execute("SELECT * FROM dist_announcements WHERE id=?", (int(aid),))
    else:
        c.execute(
            """INSERT INTO dist_announcements (title, content, is_published, created_at, updated_at)
               VALUES (?,?,?,?,?)""",
            (title, content, is_published, now, now),
        )
        c.execute("SELECT * FROM dist_announcements ORDER BY id DESC LIMIT 1")
    row = _row(c.fetchone())
    conn.commit()
    conn.close()
    return row


def delete_announcement(aid: int) -> None:
    dist_db.init_dist_tables()
    if _use_pg():
        conn = _conn()
        try:
            c = _cur(conn)
            c.execute("DELETE FROM dist_announcements WHERE id=%s", (int(aid),))
            conn.commit()
        finally:
            conn.close()
        return
    conn = _conn()
    c = conn.cursor()
    c.execute("DELETE FROM dist_announcements WHERE id=?", (int(aid),))
    conn.commit()
    conn.close()


def announcement_unread_count(user_id: int) -> int:
    pubs = list_announcements(published_only=True)
    if not pubs:
        return 0
    dist_db.init_dist_tables()
    if _use_pg():
        conn = _conn()
        try:
            c = _cur(conn)
            c.execute(
                "SELECT COUNT(*) AS c FROM dist_announcement_reads WHERE user_id=%s",
                (int(user_id),),
            )
            read_n = int((_row(c.fetchone()) or {}).get("c") or 0)
        finally:
            conn.close()
    else:
        conn = _conn()
        c = conn.cursor()
        c.execute(
            "SELECT COUNT(*) AS c FROM dist_announcement_reads WHERE user_id=?",
            (int(user_id),),
        )
        read_n = int((_row(c.fetchone()) or {}).get("c") or 0)
        conn.close()
    return max(0, len(pubs) - read_n)


def mark_announcements_read(user_id: int, announcement_id: int | None = None) -> None:
    dist_db.init_dist_tables()
    ids = [int(announcement_id)] if announcement_id else [int(a["id"]) for a in list_announcements(published_only=True)]
    for aid in ids:
        if _use_pg():
            conn = _conn()
            try:
                c = _cur(conn)
                c.execute(
                    """INSERT INTO dist_announcement_reads (user_id, announcement_id)
                       VALUES (%s,%s) ON CONFLICT DO NOTHING""",
                    (int(user_id), aid),
                )
                conn.commit()
            finally:
                conn.close()
        else:
            conn = _conn()
            c = conn.cursor()
            c.execute(
                """INSERT OR IGNORE INTO dist_announcement_reads (user_id, announcement_id, read_at)
                   VALUES (?,?,?)""",
                (int(user_id), aid, _now()),
            )
            conn.commit()
            conn.close()


# ----- tutorials / help -----


def list_tutorials(*, published_only: bool = False) -> list[dict]:
    dist_db.init_dist_tables()
    if _use_pg():
        conn = _conn()
        try:
            c = _cur(conn)
            sql = "SELECT * FROM dist_tutorials"
            if published_only:
                sql += " WHERE is_published=TRUE"
            sql += " ORDER BY display_order ASC, id DESC"
            c.execute(sql)
            return [_row(r) for r in c.fetchall()]
        finally:
            conn.close()
    conn = _conn()
    c = conn.cursor()
    sql = "SELECT * FROM dist_tutorials"
    if published_only:
        sql += " WHERE is_published=1"
    sql += " ORDER BY display_order ASC, id DESC"
    c.execute(sql)
    rows = [_row(r) for r in c.fetchall()]
    conn.close()
    return rows


def save_tutorial(payload: dict) -> dict:
    dist_db.init_dist_tables()
    title = (payload.get("title") or "").strip()
    if not title:
        raise ValueError("标题必填")
    fields = (
        title,
        (payload.get("description") or "").strip(),
        (payload.get("tutorial_link") or "").strip(),
        (payload.get("access_password") or "").strip(),
        (payload.get("platform_color") or "#0f766e").strip(),
        int(payload.get("display_order") or 0),
        1 if payload.get("is_published", True) else 0,
    )
    tid = payload.get("id")
    if _use_pg():
        conn = _conn()
        try:
            c = _cur(conn)
            if tid:
                c.execute(
                    """UPDATE dist_tutorials SET title=%s, description=%s, tutorial_link=%s, access_password=%s,
                       platform_color=%s, display_order=%s, is_published=%s WHERE id=%s RETURNING *""",
                    (*fields[:6], bool(fields[6]), int(tid)),
                )
                row = _row(c.fetchone())
            else:
                c.execute(
                    """INSERT INTO dist_tutorials
                       (title, description, tutorial_link, access_password, platform_color, display_order, is_published)
                       VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
                    (*fields[:6], bool(fields[6])),
                )
                row = _row(c.fetchone())
            conn.commit()
            return row
        finally:
            conn.close()
    conn = _conn()
    c = conn.cursor()
    now = _now()
    if tid:
        c.execute(
            """UPDATE dist_tutorials SET title=?, description=?, tutorial_link=?, access_password=?,
               platform_color=?, display_order=?, is_published=? WHERE id=?""",
            (*fields, int(tid)),
        )
        c.execute("SELECT * FROM dist_tutorials WHERE id=?", (int(tid),))
    else:
        c.execute(
            """INSERT INTO dist_tutorials
               (title, description, tutorial_link, access_password, platform_color, display_order, is_published, created_at)
               VALUES (?,?,?,?,?,?,?,?)""",
            (*fields, now),
        )
        c.execute("SELECT * FROM dist_tutorials ORDER BY id DESC LIMIT 1")
    row = _row(c.fetchone())
    conn.commit()
    conn.close()
    return row


def delete_tutorial(tid: int) -> None:
    dist_db.init_dist_tables()
    if _use_pg():
        conn = _conn()
        try:
            c = _cur(conn)
            c.execute("DELETE FROM dist_tutorials WHERE id=%s", (int(tid),))
            conn.commit()
        finally:
            conn.close()
        return
    conn = _conn()
    c = conn.cursor()
    c.execute("DELETE FROM dist_tutorials WHERE id=?", (int(tid),))
    conn.commit()
    conn.close()


def list_help_docs(*, published_only: bool = False) -> list[dict]:
    dist_db.init_dist_tables()
    if _use_pg():
        conn = _conn()
        try:
            c = _cur(conn)
            sql = "SELECT * FROM dist_help_documents"
            if published_only:
                sql += " WHERE is_published=TRUE"
            sql += " ORDER BY display_order ASC, id DESC"
            c.execute(sql)
            return [_row(r) for r in c.fetchall()]
        finally:
            conn.close()
    conn = _conn()
    c = conn.cursor()
    sql = "SELECT * FROM dist_help_documents"
    if published_only:
        sql += " WHERE is_published=1"
    sql += " ORDER BY display_order ASC, id DESC"
    c.execute(sql)
    rows = [_row(r) for r in c.fetchall()]
    conn.close()
    return rows


def save_help_doc(payload: dict) -> dict:
    dist_db.init_dist_tables()
    title = (payload.get("title") or "").strip()
    content = (payload.get("content") or "").strip()
    if not title:
        raise ValueError("标题必填")
    category = (payload.get("category") or "general").strip()
    display_order = int(payload.get("display_order") or 0)
    is_published = 1 if payload.get("is_published", True) else 0
    hid = payload.get("id")
    if _use_pg():
        conn = _conn()
        try:
            c = _cur(conn)
            if hid:
                c.execute(
                    """UPDATE dist_help_documents SET title=%s, content=%s, category=%s, display_order=%s,
                       is_published=%s, updated_at=NOW() WHERE id=%s RETURNING *""",
                    (title, content, category, display_order, bool(is_published), int(hid)),
                )
                row = _row(c.fetchone())
            else:
                c.execute(
                    """INSERT INTO dist_help_documents (title, content, category, display_order, is_published)
                       VALUES (%s,%s,%s,%s,%s) RETURNING *""",
                    (title, content, category, display_order, bool(is_published)),
                )
                row = _row(c.fetchone())
            conn.commit()
            return row
        finally:
            conn.close()
    conn = _conn()
    c = conn.cursor()
    now = _now()
    if hid:
        c.execute(
            """UPDATE dist_help_documents SET title=?, content=?, category=?, display_order=?,
               is_published=?, updated_at=? WHERE id=?""",
            (title, content, category, display_order, is_published, now, int(hid)),
        )
        c.execute("SELECT * FROM dist_help_documents WHERE id=?", (int(hid),))
    else:
        c.execute(
            """INSERT INTO dist_help_documents
               (title, content, category, display_order, is_published, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?)""",
            (title, content, category, display_order, is_published, now, now),
        )
        c.execute("SELECT * FROM dist_help_documents ORDER BY id DESC LIMIT 1")
    row = _row(c.fetchone())
    conn.commit()
    conn.close()
    return row


def delete_help_doc(hid: int) -> None:
    dist_db.init_dist_tables()
    if _use_pg():
        conn = _conn()
        try:
            c = _cur(conn)
            c.execute("DELETE FROM dist_help_documents WHERE id=%s", (int(hid),))
            conn.commit()
        finally:
            conn.close()
        return
    conn = _conn()
    c = conn.cursor()
    c.execute("DELETE FROM dist_help_documents WHERE id=?", (int(hid),))
    conn.commit()
    conn.close()


# ----- test overrides -----


def apply_test_overrides(tests: list[dict]) -> list[dict]:
    dist_db.init_dist_tables()
    ov: dict[str, dict] = {}
    if _use_pg():
        conn = _conn()
        try:
            c = _cur(conn)
            c.execute("SELECT * FROM dist_test_overrides")
            for r in c.fetchall():
                d = _row(r)
                ov[str(d.get("test_code"))] = d
        finally:
            conn.close()
    else:
        conn = _conn()
        c = conn.cursor()
        c.execute("SELECT * FROM dist_test_overrides")
        for r in c.fetchall():
            d = _row(r)
            ov[str(d.get("test_code"))] = d
        conn.close()
    out = []
    for t in tests:
        code = t.get("test_code")
        o = ov.get(code) or {}
        item = dict(t)
        if o:
            if o.get("is_enabled") is not None:
                item["is_enabled"] = bool(o.get("is_enabled"))
            if o.get("is_hot") is not None:
                item["is_hot"] = bool(o.get("is_hot"))
            if o.get("display_order") is not None:
                item["display_order"] = int(o.get("display_order"))
        out.append(item)
    out.sort(key=lambda x: (int(x.get("display_order") or 9999), str(x.get("test_code"))))
    return out


def save_test_override(payload: dict) -> dict:
    dist_db.init_dist_tables()
    code = (payload.get("test_code") or payload.get("code") or "").strip()
    if not code:
        raise ValueError("test_code 必填")
    is_enabled = None if payload.get("is_enabled") is None else (1 if payload.get("is_enabled") else 0)
    is_hot = None if payload.get("is_hot") is None else (1 if payload.get("is_hot") else 0)
    display_order = payload.get("display_order")
    if _use_pg():
        conn = _conn()
        try:
            c = _cur(conn)
            c.execute(
                """INSERT INTO dist_test_overrides (test_code, is_enabled, is_hot, display_order, updated_at)
                   VALUES (%s,%s,%s,%s,NOW())
                   ON CONFLICT (test_code) DO UPDATE SET
                     is_enabled=COALESCE(EXCLUDED.is_enabled, dist_test_overrides.is_enabled),
                     is_hot=COALESCE(EXCLUDED.is_hot, dist_test_overrides.is_hot),
                     display_order=COALESCE(EXCLUDED.display_order, dist_test_overrides.display_order),
                     updated_at=NOW()
                   RETURNING *""",
                (
                    code,
                    None if is_enabled is None else bool(is_enabled),
                    None if is_hot is None else bool(is_hot),
                    None if display_order is None else int(display_order),
                ),
            )
            row = _row(c.fetchone())
            conn.commit()
            return row
        finally:
            conn.close()
    conn = _conn()
    c = conn.cursor()
    now = _now()
    c.execute("SELECT * FROM dist_test_overrides WHERE test_code=?", (code,))
    exist = _row(c.fetchone())
    if exist:
        en = exist.get("is_enabled") if is_enabled is None else is_enabled
        hot = exist.get("is_hot") if is_hot is None else is_hot
        order = exist.get("display_order") if display_order is None else int(display_order)
        c.execute(
            """UPDATE dist_test_overrides SET is_enabled=?, is_hot=?, display_order=?, updated_at=? WHERE test_code=?""",
            (en, hot, order, now, code),
        )
    else:
        c.execute(
            """INSERT INTO dist_test_overrides (test_code, is_enabled, is_hot, display_order, updated_at)
               VALUES (?,?,?,?,?)""",
            (code, 1 if is_enabled is None else is_enabled, is_hot, display_order, now),
        )
    c.execute("SELECT * FROM dist_test_overrides WHERE test_code=?", (code,))
    row = _row(c.fetchone())
    conn.commit()
    conn.close()
    return row


def update_test_orders(items: list[dict]) -> None:
    for it in items or []:
        save_test_override(
            {
                "test_code": it.get("test_code") or it.get("code"),
                "display_order": it.get("display_order") or it.get("order"),
                "is_enabled": it.get("is_enabled"),
                "is_hot": it.get("is_hot"),
            }
        )


# ----- payment stats -----


def payment_stats() -> dict:
    from cloud_deploy.cloud_api import database as db

    orders = db.list_payment_orders_by_plan_prefix("psy_quota", limit=500)
    today = datetime.now().strftime("%Y-%m-%d")
    month = datetime.now().strftime("%Y-%m")

    def _sum(rows):
        revenue = 0.0
        paid = 0
        unpaid = 0
        for o in rows:
            st = o.get("status") or ""
            if st == "paid":
                paid += 1
                try:
                    revenue += float(o.get("amount") or 0)
                except Exception:
                    pass
            elif st in ("pending", "created"):
                unpaid += 1
        return {"revenue": round(revenue, 2), "paid_order_count": paid, "unpaid_order_count": unpaid}

    today_rows = [o for o in orders if str(o.get("paid_at") or o.get("created_at") or "").startswith(today)]
    month_rows = [o for o in orders if str(o.get("paid_at") or o.get("created_at") or "").startswith(month)]
    method: dict[str, int] = {}
    for o in orders:
        if o.get("status") != "paid":
            continue
        ch = o.get("channel") or "unknown"
        method[ch] = method.get(ch, 0) + 1
    ratio = [{"method": k, "count": v} for k, v in method.items()]
    return {
        "today": _sum(today_rows),
        "month": _sum(month_rows),
        "payment_method_ratio": ratio,
        "today_revenue": _sum(today_rows)["revenue"],
        "month_revenue": _sum(month_rows)["revenue"],
        "today_paid_order_count": _sum(today_rows)["paid_order_count"],
        "today_unpaid_order_count": _sum(today_rows)["unpaid_order_count"],
    }


def payment_stats_range(start_date: str, end_date: str) -> dict:
    from cloud_deploy.cloud_api import database as db

    orders = db.list_payment_orders_by_plan_prefix("psy_quota", limit=1000)
    start = (start_date or "")[:10]
    end = (end_date or "")[:10]
    filtered = []
    for o in orders:
        d = str(o.get("paid_at") or o.get("created_at") or "")[:10]
        if start and d < start:
            continue
        if end and d > end:
            continue
        filtered.append(o)
    daily: dict[str, dict] = {}
    revenue = 0.0
    paid = 0
    method: dict[str, int] = {}
    for o in filtered:
        if o.get("status") != "paid":
            continue
        paid += 1
        try:
            amt = float(o.get("amount") or 0)
        except Exception:
            amt = 0
        revenue += amt
        day = str(o.get("paid_at") or o.get("created_at") or "")[:10]
        slot = daily.setdefault(day, {"date": day, "revenue": 0.0, "paid_order_count": 0})
        slot["revenue"] = round(slot["revenue"] + amt, 2)
        slot["paid_order_count"] += 1
        ch = o.get("channel") or "unknown"
        method[ch] = method.get(ch, 0) + 1
    return {
        "start_date": start,
        "end_date": end,
        "summary": {"revenue": round(revenue, 2), "paid_order_count": paid, "unpaid_order_count": 0},
        "payment_method_ratio": [{"method": k, "count": v} for k, v in method.items()],
        "daily_trend": [daily[k] for k in sorted(daily.keys())],
    }


def set_tutorial_access(user_id: int, enabled: bool) -> dict:
    dist_db.init_dist_tables()
    val = 1 if enabled else 0
    if _use_pg():
        conn = _conn()
        try:
            c = _cur(conn)
            c.execute(
                "UPDATE dist_distributors SET detailed_tutorial_access=%s WHERE user_id=%s",
                (bool(enabled), int(user_id)),
            )
            conn.commit()
        finally:
            conn.close()
    else:
        conn = _conn()
        c = conn.cursor()
        c.execute(
            "UPDATE dist_distributors SET detailed_tutorial_access=? WHERE user_id=?",
            (val, int(user_id)),
        )
        conn.commit()
        conn.close()
    return dist_db.ensure_distributor(int(user_id))

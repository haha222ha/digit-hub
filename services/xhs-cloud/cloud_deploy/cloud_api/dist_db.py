# -*- coding: utf-8 -*-
"""心理测评分销 · 数据层（Quota / Link / Results）。"""
from __future__ import annotations

import json
import os
import secrets
import sqlite3
from datetime import datetime
from typing import Any

from cloud_deploy.cloud_api.config import get_settings

_USE_PG = os.environ.get("XHS_DATABASE_URL", "").startswith("postgres")
_DIST_PG_READY = False


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _gen_token() -> str:
    return secrets.token_urlsafe(16)[:22]


def _sqlite_conn():
    s = get_settings()
    os.makedirs(os.path.dirname(s.xhs_cloud_api_db), exist_ok=True)
    conn = sqlite3.connect(s.xhs_cloud_api_db, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def _pg_conn():
    """业务表在 xhs_monitor schema；未 SET search_path 时 CREATE/FK 会失败。"""
    from cloud_deploy.cloud_api.database_pg import _conn as _raw_pg_conn

    conn = _raw_pg_conn()
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
    return conn


def _pg_cur(conn):
    import psycopg2.extras

    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


def init_dist_tables() -> None:
    global _DIST_PG_READY
    if _USE_PG:
        if _DIST_PG_READY:
            return
        _init_dist_tables_pg()
        _migrate_dist_schema()
        _DIST_PG_READY = True
    else:
        _init_dist_tables_sqlite()
        _migrate_dist_schema()


def _migrate_dist_schema() -> None:
    """增量列与运营表（幂等）。"""
    stmts_sqlite = [
        "ALTER TABLE dist_distributors ADD COLUMN inviter_user_id INTEGER",
        "ALTER TABLE dist_distributors ADD COLUMN detailed_tutorial_access INTEGER NOT NULL DEFAULT 0",
        """CREATE TABLE IF NOT EXISTS dist_announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            is_published INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS dist_tutorials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            tutorial_link TEXT NOT NULL DEFAULT '',
            access_password TEXT NOT NULL DEFAULT '',
            platform_color TEXT NOT NULL DEFAULT '#0f766e',
            display_order INTEGER NOT NULL DEFAULT 0,
            is_published INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS dist_help_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT 'general',
            display_order INTEGER NOT NULL DEFAULT 0,
            is_published INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS dist_site_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS dist_packages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            price_yuan REAL NOT NULL,
            quota_amount INTEGER NOT NULL,
            subtitle TEXT NOT NULL DEFAULT '',
            is_enabled INTEGER NOT NULL DEFAULT 1,
            display_order INTEGER NOT NULL DEFAULT 0,
            recommended INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS dist_operation_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            actor_user_id INTEGER,
            actor_username TEXT,
            action TEXT NOT NULL,
            target_type TEXT,
            target_id TEXT,
            detail TEXT,
            created_at TEXT NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS dist_test_overrides (
            test_code TEXT PRIMARY KEY,
            is_enabled INTEGER NOT NULL DEFAULT 1,
            is_hot INTEGER,
            display_order INTEGER,
            updated_at TEXT NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS dist_announcement_reads (
            user_id INTEGER NOT NULL,
            announcement_id INTEGER NOT NULL,
            read_at TEXT NOT NULL,
            PRIMARY KEY (user_id, announcement_id)
        )""",
    ]
    stmts_pg = [
        "ALTER TABLE dist_distributors ADD COLUMN IF NOT EXISTS inviter_user_id INTEGER",
        "ALTER TABLE dist_distributors ADD COLUMN IF NOT EXISTS detailed_tutorial_access BOOLEAN NOT NULL DEFAULT FALSE",
        """CREATE TABLE IF NOT EXISTS dist_announcements (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            is_published BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS dist_tutorials (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            tutorial_link TEXT NOT NULL DEFAULT '',
            access_password TEXT NOT NULL DEFAULT '',
            platform_color TEXT NOT NULL DEFAULT '#0f766e',
            display_order INTEGER NOT NULL DEFAULT 0,
            is_published BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS dist_help_documents (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT 'general',
            display_order INTEGER NOT NULL DEFAULT 0,
            is_published BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS dist_site_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT '',
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS dist_packages (
            id SERIAL PRIMARY KEY,
            plan_code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            price_yuan DOUBLE PRECISION NOT NULL,
            quota_amount INTEGER NOT NULL,
            subtitle TEXT NOT NULL DEFAULT '',
            is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            display_order INTEGER NOT NULL DEFAULT 0,
            recommended BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS dist_operation_logs (
            id SERIAL PRIMARY KEY,
            actor_user_id INTEGER,
            actor_username TEXT,
            action TEXT NOT NULL,
            target_type TEXT,
            target_id TEXT,
            detail TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS dist_test_overrides (
            test_code TEXT PRIMARY KEY,
            is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            is_hot BOOLEAN,
            display_order INTEGER,
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS dist_announcement_reads (
            user_id INTEGER NOT NULL,
            announcement_id INTEGER NOT NULL,
            read_at TIMESTAMP NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, announcement_id)
        )""",
    ]
    if _USE_PG:
        conn = _pg_conn()
        try:
            c = conn.cursor()
            for sql in stmts_pg:
                try:
                    c.execute(sql)
                except Exception:
                    pass
            conn.commit()
        finally:
            conn.close()
        return
    conn = _sqlite_conn()
    c = conn.cursor()
    for sql in stmts_sqlite:
        try:
            c.execute(sql)
        except Exception:
            pass
    conn.commit()
    conn.close()


def _init_dist_tables_sqlite() -> None:
    conn = _sqlite_conn()
    c = conn.cursor()
    c.executescript(
        """
        CREATE TABLE IF NOT EXISTS dist_distributors (
            user_id INTEGER PRIMARY KEY,
            quota INTEGER NOT NULL DEFAULT 0,
            used_quota INTEGER NOT NULL DEFAULT 0,
            invite_code TEXT UNIQUE,
            role TEXT NOT NULL DEFAULT 'distributor',
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS dist_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT UNIQUE NOT NULL,
            user_id INTEGER NOT NULL,
            test_code TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'unused',
            used_count INTEGER NOT NULL DEFAULT 0,
            max_uses INTEGER NOT NULL DEFAULT 3,
            expires_at TEXT,
            revoked_at TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS dist_test_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            link_id INTEGER,
            token TEXT NOT NULL,
            test_code TEXT NOT NULL,
            user_id INTEGER,
            perspective TEXT,
            result_data TEXT,
            unlimited INTEGER NOT NULL DEFAULT 0,
            completed_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS dist_quota_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            change_type TEXT NOT NULL,
            amount INTEGER NOT NULL,
            before_remaining INTEGER NOT NULL,
            after_remaining INTEGER NOT NULL,
            remark TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS dist_unlimited_sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            test_code TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_dist_links_token ON dist_links(token);
        CREATE INDEX IF NOT EXISTS idx_dist_links_user ON dist_links(user_id);
        """
    )
    conn.commit()
    conn.close()


def _init_dist_tables_pg() -> None:
    conn = _pg_conn()
    try:
        c = conn.cursor()
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS dist_distributors (
                user_id INTEGER PRIMARY KEY REFERENCES users(id),
                quota INTEGER NOT NULL DEFAULT 0,
                used_quota INTEGER NOT NULL DEFAULT 0,
                invite_code TEXT UNIQUE,
                role TEXT NOT NULL DEFAULT 'distributor',
                status TEXT NOT NULL DEFAULT 'active',
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS dist_links (
                id SERIAL PRIMARY KEY,
                token TEXT UNIQUE NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id),
                test_code TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'unused',
                used_count INTEGER NOT NULL DEFAULT 0,
                max_uses INTEGER NOT NULL DEFAULT 3,
                expires_at TIMESTAMP,
                revoked_at TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS dist_test_results (
                id SERIAL PRIMARY KEY,
                link_id INTEGER REFERENCES dist_links(id),
                token TEXT NOT NULL,
                test_code TEXT NOT NULL,
                user_id INTEGER,
                perspective TEXT,
                result_data JSONB,
                unlimited BOOLEAN NOT NULL DEFAULT FALSE,
                completed_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS dist_quota_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                change_type TEXT NOT NULL,
                amount INTEGER NOT NULL,
                before_remaining INTEGER NOT NULL,
                after_remaining INTEGER NOT NULL,
                remark TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS dist_unlimited_sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                test_code TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_dist_links_token ON dist_links(token)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_dist_links_user ON dist_links(user_id)")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _row_dict(row) -> dict | None:
    if row is None:
        return None
    if isinstance(row, sqlite3.Row):
        return dict(row)
    if hasattr(row, "keys"):
        return dict(row)
    if isinstance(row, dict):
        return row
    return None


def _pg_scalar(row, key: str = "id"):
    """RealDictCursor 行不能用 [0] 下标。"""
    if row is None:
        return None
    if hasattr(row, "keys"):
        if key in row:
            return row[key]
        # COUNT(*) AS n / 单列匿名
        vals = list(row.values())
        return vals[0] if vals else None
    if isinstance(row, (list, tuple)):
        return row[0]
    return row


def ensure_distributor(user_id: int, *, default_quota: int = 5) -> dict:
    init_dist_tables()
    from cloud_deploy.cloud_api import database as db

    profile = db.get_member_profile(user_id)
    if not profile:
        if _USE_PG:
            conn = _pg_conn()
            c = _pg_cur(conn)
            c.execute("SELECT id, username, email FROM users WHERE id=%s", (user_id,))
            row = c.fetchone()
            conn.close()
            if not row:
                raise ValueError("用户不存在")
            rd = _row_dict(row) or {}
            profile = {
                "id": rd.get("id") or user_id,
                "username": rd.get("username") or "",
                "email": rd.get("email") or "",
            }
        else:
            conn = _sqlite_conn()
            c = conn.cursor()
            c.execute("SELECT id, username, email FROM users WHERE id=?", (user_id,))
            row = c.fetchone()
            conn.close()
            if not row:
                raise ValueError("用户不存在")
            rd = _row_dict(row) or {}
            profile = {
                "id": rd.get("id") or user_id,
                "username": rd.get("username") or "",
                "email": rd.get("email") or "",
            }
    if _USE_PG:
        return _ensure_distributor_pg(user_id, default_quota=default_quota)
    conn = _sqlite_conn()
    c = conn.cursor()
    c.execute("SELECT * FROM dist_distributors WHERE user_id=?", (user_id,))
    row = c.fetchone()
    if not row:
        code = secrets.token_hex(4).upper()
        now = _now()
        c.execute(
            """INSERT INTO dist_distributors (user_id, quota, used_quota, invite_code, created_at)
               VALUES (?,?,?,?,?)""",
            (user_id, default_quota, 0, code, now),
        )
        conn.commit()
        c.execute("SELECT * FROM dist_distributors WHERE user_id=?", (user_id,))
        row = c.fetchone()
    conn.close()
    return _map_distributor(_row_dict(row), profile)


def _ensure_distributor_pg(user_id: int, *, default_quota: int) -> dict:
    from cloud_deploy.cloud_api import database as db

    profile = db.get_member_profile(user_id)
    if not profile:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute("SELECT id, username, email FROM users WHERE id=%s", (user_id,))
        row = c.fetchone()
        conn.close()
        if not row:
            raise ValueError("用户不存在")
        rd = _row_dict(row) or {}
        profile = {
            "id": rd.get("id") or user_id,
            "username": rd.get("username") or "",
            "email": rd.get("email") or "",
        }
    conn = _pg_conn()
    try:
        c = _pg_cur(conn)
        c.execute("SELECT * FROM dist_distributors WHERE user_id=%s", (user_id,))
        row = c.fetchone()
        if not row:
            code = secrets.token_hex(4).upper()
            c.execute(
                """INSERT INTO dist_distributors (user_id, quota, used_quota, invite_code)
                   VALUES (%s,%s,0,%s) RETURNING *""",
                (user_id, default_quota, code),
            )
            row = c.fetchone()
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return _map_distributor(_row_dict(row), profile)


def _map_distributor(dist: dict | None, profile: dict) -> dict:
    dist = dist or {}
    try:
        quota = int(dist.get("quota") or 0)
    except (TypeError, ValueError):
        quota = 0
    try:
        used = int(dist.get("used_quota") or 0)
    except (TypeError, ValueError):
        used = 0
    # 前端 SPA 仅认 admin / super_admin；distributor 需映射为 admin 才能进后台
    raw_role = str(dist.get("role") or "distributor").strip().lower()
    if raw_role in ("super_admin", "superadmin"):
        role = "super_admin"
    else:
        role = "admin"
    return {
        "id": profile.get("id"),
        "user_id": profile.get("id"),
        "username": profile.get("username") or "",
        "email": profile.get("email") or "",
        "role": role,
        "status": dist.get("status") or "active",
        "quota": quota,
        "used_quota": used,
        "remaining_quota": max(0, quota - used),
        "invite_code": dist.get("invite_code") or "",
        "inviter_user_id": dist.get("inviter_user_id"),
        "detailed_tutorial_access": bool(dist.get("detailed_tutorial_access")),
    }


def find_distributor_by_invite_code(invite_code: str) -> dict | None:
    init_dist_tables()
    code = (invite_code or "").strip().upper()
    if not code:
        return None
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute("SELECT * FROM dist_distributors WHERE UPPER(invite_code)=%s", (code,))
        row = c.fetchone()
        conn.close()
        if not row:
            return None
        return _row_dict(row)
    conn = _sqlite_conn()
    c = conn.cursor()
    c.execute("SELECT * FROM dist_distributors WHERE UPPER(invite_code)=?", (code,))
    row = c.fetchone()
    conn.close()
    return _row_dict(row)


def set_inviter(user_id: int, inviter_user_id: int) -> None:
    """绑定邀请人（仅首次）。"""
    init_dist_tables()
    uid = int(user_id)
    iid = int(inviter_user_id)
    if uid <= 0 or iid <= 0 or uid == iid:
        return
    if _USE_PG:
        conn = _pg_conn()
        try:
            c = _pg_cur(conn)
            c.execute(
                "UPDATE dist_distributors SET inviter_user_id=%s WHERE user_id=%s AND inviter_user_id IS NULL",
                (iid, uid),
            )
            conn.commit()
        finally:
            conn.close()
        return
    conn = _sqlite_conn()
    c = conn.cursor()
    c.execute(
        "UPDATE dist_distributors SET inviter_user_id=? WHERE user_id=? AND inviter_user_id IS NULL",
        (iid, uid),
    )
    conn.commit()
    conn.close()


def count_purchase_logs(user_id: int) -> int:
    init_dist_tables()
    if _USE_PG:
        conn = _pg_conn()
        try:
            c = _pg_cur(conn)
            c.execute(
                "SELECT COUNT(*) AS c FROM dist_quota_logs WHERE user_id=%s AND change_type=%s",
                (int(user_id), "purchase"),
            )
            return int((_row_dict(c.fetchone()) or {}).get("c") or 0)
        finally:
            conn.close()
    conn = _sqlite_conn()
    c = conn.cursor()
    c.execute(
        "SELECT COUNT(*) AS c FROM dist_quota_logs WHERE user_id=? AND change_type=?",
        (int(user_id), "purchase"),
    )
    n = int((_row_dict(c.fetchone()) or {}).get("c") or 0)
    conn.close()
    return n


def apply_first_purchase_invite_rebate(buyer_user_id: int, quota_amount: int, order_no: str) -> dict | None:
    """首购返利：邀请人获得购额 N%（默认 20%，可配置）。在 purchase 入账之后调用。"""
    init_dist_tables()
    buyer = ensure_distributor(int(buyer_user_id))
    inviter_id = buyer.get("inviter_user_id")
    if not inviter_id:
        return None
    # purchase 已写入后，恰好 1 条 = 首购
    if count_purchase_logs(int(buyer_user_id)) != 1:
        return None
    q = int(quota_amount or 0)
    percent = 20
    try:
        from cloud_deploy.cloud_api import dist_ops

        percent = int(float(dist_ops.get_config().get("invite_rebate_percent") or 20))
    except Exception:
        percent = 20
    percent = max(0, min(percent, 100))
    rebate = max(1, q * percent // 100) if q > 0 and percent > 0 else 0
    if rebate <= 0:
        return None
    return add_quota(
        int(inviter_id),
        rebate,
        change_type="invite_rebate",
        remark=f"首购返利{percent}% 订单 {order_no} 买家{buyer_user_id}",
    )


def get_distributor(user_id: int) -> dict | None:
    init_dist_tables()
    from cloud_deploy.cloud_api import database as db

    profile = db.get_member_profile(user_id)
    if not profile:
        return None
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute("SELECT * FROM dist_distributors WHERE user_id=%s", (user_id,))
        row = c.fetchone()
        conn.close()
        if not row:
            return None
        return _map_distributor(_row_dict(row), profile)
    conn = _sqlite_conn()
    c = conn.cursor()
    c.execute("SELECT * FROM dist_distributors WHERE user_id=?", (user_id,))
    row = c.fetchone()
    conn.close()
    if not row:
        return None
    return _map_distributor(_row_dict(row), profile)


def add_quota(user_id: int, amount: int, *, change_type: str, remark: str = "") -> dict:
    init_dist_tables()
    dist = ensure_distributor(user_id)
    amount = int(amount)
    if amount <= 0:
        raise ValueError("额度必须大于 0")
    before = dist["remaining_quota"]
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute(
            "UPDATE dist_distributors SET quota = quota + %s WHERE user_id=%s",
            (amount, user_id),
        )
        c.execute(
            """INSERT INTO dist_quota_logs
               (user_id, change_type, amount, before_remaining, after_remaining, remark)
               VALUES (%s,%s,%s,%s,%s,%s)""",
            (user_id, change_type, amount, before, before + amount, remark),
        )
        conn.commit()
        conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute("UPDATE dist_distributors SET quota = quota + ? WHERE user_id=?", (amount, user_id))
        c.execute(
            """INSERT INTO dist_quota_logs
               (user_id, change_type, amount, before_remaining, after_remaining, remark, created_at)
               VALUES (?,?,?,?,?,?,?)""",
            (user_id, change_type, amount, before, before + amount, remark, _now()),
        )
        conn.commit()
        conn.close()
    return ensure_distributor(user_id)


def adjust_quota(user_id: int, amount: int, *, remark: str = "") -> dict:
    """超管调额：正数加额度，负数提高 used_quota（扣可用）。"""
    amount = int(amount)
    if amount == 0:
        raise ValueError("调额不能为 0")
    if amount > 0:
        return add_quota(user_id, amount, change_type="admin_adjust", remark=remark or "超管调额")
    init_dist_tables()
    dist = ensure_distributor(user_id)
    cut = abs(amount)
    before = dist["remaining_quota"]
    if before < cut:
        raise ValueError("可用额度不足，无法扣减")
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute(
            "UPDATE dist_distributors SET used_quota = used_quota + %s WHERE user_id=%s",
            (cut, user_id),
        )
        c.execute(
            """INSERT INTO dist_quota_logs
               (user_id, change_type, amount, before_remaining, after_remaining, remark)
               VALUES (%s,'admin_adjust',%s,%s,%s,%s)""",
            (user_id, -cut, before, before - cut, remark or "超管扣额"),
        )
        conn.commit()
        conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute(
            "UPDATE dist_distributors SET used_quota = used_quota + ? WHERE user_id=?",
            (cut, user_id),
        )
        c.execute(
            """INSERT INTO dist_quota_logs
               (user_id, change_type, amount, before_remaining, after_remaining, remark, created_at)
               VALUES (?,?,?,?,?,?,?)""",
            (user_id, "admin_adjust", -cut, before, before - cut, remark or "超管扣额", _now()),
        )
        conn.commit()
        conn.close()
    return ensure_distributor(user_id)


def generate_links(user_id: int, test_code: str, count: int, *, max_uses: int = 3) -> list[dict]:
    init_dist_tables()
    dist = ensure_distributor(user_id)
    count = max(1, min(int(count), 50))
    remaining = dist["remaining_quota"]
    if remaining < count:
        raise ValueError(f"可用额度不足，当前可用：{remaining}，需要：{count}")
    test_code = (test_code or "").strip()
    if not test_code:
        raise ValueError("请选择测题")
    links: list[dict] = []
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        before = remaining
        for _ in range(count):
            token = _gen_token()
            c.execute(
                """INSERT INTO dist_links (token, user_id, test_code, max_uses)
                   VALUES (%s,%s,%s,%s) RETURNING id, token, test_code, status, used_count, max_uses, created_at""",
                (token, user_id, test_code, max_uses),
            )
            row = c.fetchone()
            links.append(_map_link_row(row, c.description))
        c.execute(
            "UPDATE dist_distributors SET used_quota = used_quota + %s WHERE user_id=%s",
            (count, user_id),
        )
        c.execute(
            """INSERT INTO dist_quota_logs
               (user_id, change_type, amount, before_remaining, after_remaining, remark)
               VALUES (%s,'consume',%s,%s,%s,%s)""",
            (user_id, count, before, before - count, f"生成 {count} 个 {test_code} 链接"),
        )
        conn.commit()
        conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        now = _now()
        before = remaining
        for _ in range(count):
            token = _gen_token()
            c.execute(
                """INSERT INTO dist_links (token, user_id, test_code, max_uses, created_at)
                   VALUES (?,?,?,?,?)""",
                (token, user_id, test_code, max_uses, now),
            )
            lid = c.lastrowid
            c.execute("SELECT * FROM dist_links WHERE id=?", (lid,))
            links.append(_map_link(_row_dict(c.fetchone())))
        c.execute(
            "UPDATE dist_distributors SET used_quota = used_quota + ? WHERE user_id=?",
            (count, user_id),
        )
        c.execute(
            """INSERT INTO dist_quota_logs
               (user_id, change_type, amount, before_remaining, after_remaining, remark, created_at)
               VALUES (?,?,?,?,?,?,?)""",
            (user_id, "consume", count, before, before - count, f"生成 {count} 个 {test_code} 链接", now),
        )
        conn.commit()
        conn.close()
    return links


def _map_link(row: dict | None) -> dict:
    row = row or {}
    return {
        "id": row.get("id"),
        "token": row.get("token"),
        "user_id": row.get("user_id"),
        "test_code": row.get("test_code"),
        "status": row.get("status") or "unused",
        "used_count": int(row.get("used_count") or 0),
        "max_uses": int(row.get("max_uses") or 3),
        "expires_at": row.get("expires_at"),
        "created_at": row.get("created_at"),
    }


def _map_link_row(row, description) -> dict:
    if not row:
        return {}
    if hasattr(row, "keys"):
        return _map_link(dict(row))
    cols = [d[0] for d in description]
    return _map_link(dict(zip(cols, row)))


def get_link_by_token(token: str) -> dict | None:
    init_dist_tables()
    token = (token or "").strip()
    if not token:
        return None
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute("SELECT * FROM dist_links WHERE token=%s", (token,))
        row = c.fetchone()
        conn.close()
        return _map_link(_row_dict(row))
    conn = _sqlite_conn()
    c = conn.cursor()
    c.execute("SELECT * FROM dist_links WHERE token=?", (token,))
    row = c.fetchone()
    conn.close()
    return _map_link(_row_dict(row))


def get_unlimited_session(token: str) -> dict | None:
    init_dist_tables()
    token = (token or "").strip()
    if not token:
        return None
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute("SELECT * FROM dist_unlimited_sessions WHERE token=%s", (token,))
        row = c.fetchone()
        conn.close()
        return _row_dict(row)
    conn = _sqlite_conn()
    c = conn.cursor()
    c.execute("SELECT * FROM dist_unlimited_sessions WHERE token=?", (token,))
    row = c.fetchone()
    conn.close()
    return _row_dict(row)


def validate_link_token(token: str) -> dict:
    unlimited = get_unlimited_session(token)
    if unlimited:
        return {
            "valid": True,
            "message": "无限测试模式",
            "unlimited": True,
            "testCode": unlimited.get("test_code"),
        }
    link = get_link_by_token(token)
    if not link or link.get("status") == "revoked":
        return {"valid": False, "message": "链接无效或已撤销"}
    return {
        "valid": True,
        "message": "链接有效",
        "link": link,
        "unlimited": False,
        "testCode": link.get("test_code"),
    }


def start_link_test(token: str) -> None:
    unlimited = get_unlimited_session(token)
    if unlimited:
        return
    link = get_link_by_token(token)
    if not link or link.get("status") == "revoked":
        raise ValueError("链接无效")
    if int(link.get("used_count") or 0) >= int(link.get("max_uses") or 3):
        raise ValueError("链接使用次数已达上限")


def complete_link_test(
    token: str,
    *,
    result_data: Any = None,
    perspective: str | None = None,
) -> dict:
    unlimited = get_unlimited_session(token)
    result_id = None
    if unlimited:
        if result_data is not None:
            result_id = _insert_test_result(
                link_id=None,
                token=token,
                test_code=str(unlimited.get("test_code") or ""),
                user_id=int(unlimited.get("user_id") or 0),
                perspective=perspective,
                result_data=result_data,
                unlimited=True,
            )
        return {
            "success": True,
            "usedCount": 0,
            "unlimited": True,
            "resultSaved": result_id is not None,
            "resultId": result_id,
        }
    link = get_link_by_token(token)
    if not link or link.get("status") == "revoked":
        raise ValueError("链接无效")
    used = int(link.get("used_count") or 0) + 1
    max_uses = int(link.get("max_uses") or 3)
    status = "used" if used >= max_uses else link.get("status") or "unused"
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute(
            "UPDATE dist_links SET used_count=%s, status=%s WHERE token=%s",
            (used, status, token),
        )
        conn.commit()
        conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute(
            "UPDATE dist_links SET used_count=?, status=? WHERE token=?",
            (used, status, token),
        )
        conn.commit()
        conn.close()
    if result_data is not None:
        result_id = _insert_test_result(
            link_id=link.get("id"),
            token=token,
            test_code=str(link.get("test_code") or ""),
            user_id=int(link.get("user_id") or 0) if link.get("user_id") else None,
            perspective=perspective,
            result_data=result_data,
            unlimited=False,
        )
    return {
        "success": True,
        "usedCount": used,
        "unlimited": False,
        "resultSaved": result_id is not None,
        "resultId": result_id,
    }


def _insert_test_result(
    *,
    link_id: int | None,
    token: str,
    test_code: str,
    user_id: int | None,
    perspective: str | None,
    result_data: Any,
    unlimited: bool,
) -> int:
    payload = json.dumps(result_data, ensure_ascii=False) if not isinstance(result_data, str) else result_data
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute(
            """INSERT INTO dist_test_results
               (link_id, token, test_code, user_id, perspective, result_data, unlimited)
               VALUES (%s,%s,%s,%s,%s,%s::jsonb,%s) RETURNING id""",
            (link_id, token, test_code, user_id, perspective, payload, unlimited),
        )
        rid = _pg_scalar(c.fetchone(), "id")
        conn.commit()
        conn.close()
        return int(rid)
    conn = _sqlite_conn()
    c = conn.cursor()
    c.execute(
        """INSERT INTO dist_test_results
           (link_id, token, test_code, user_id, perspective, result_data, unlimited, completed_at)
           VALUES (?,?,?,?,?,?,?,?)""",
        (link_id, token, test_code, user_id, perspective, payload, 1 if unlimited else 0, _now()),
    )
    rid = c.lastrowid
    conn.commit()
    conn.close()
    return int(rid)


def list_links(user_id: int, *, status: str | None = None, limit: int = 100) -> list[dict]:
    init_dist_tables()
    limit = max(1, min(limit, 500))
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        if status:
            c.execute(
                """SELECT * FROM dist_links WHERE user_id=%s AND status=%s
                   ORDER BY id DESC LIMIT %s""",
                (user_id, status, limit),
            )
        else:
            c.execute(
                "SELECT * FROM dist_links WHERE user_id=%s ORDER BY id DESC LIMIT %s",
                (user_id, limit),
            )
        rows = c.fetchall()
        conn.close()
        return [_map_link(_row_dict(r)) for r in rows]
    conn = _sqlite_conn()
    c = conn.cursor()
    if status:
        c.execute(
            """SELECT * FROM dist_links WHERE user_id=? AND status=?
               ORDER BY id DESC LIMIT ?""",
            (user_id, status, limit),
        )
    else:
        c.execute(
            "SELECT * FROM dist_links WHERE user_id=? ORDER BY id DESC LIMIT ?",
            (user_id, limit),
        )
    rows = c.fetchall()
    conn.close()
    return [_map_link(_row_dict(r)) for r in rows]


def revoke_link(user_id: int, link_id: int) -> dict:
    init_dist_tables()
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute(
            "UPDATE dist_links SET status='revoked', revoked_at=NOW() WHERE id=%s AND user_id=%s RETURNING *",
            (link_id, user_id),
        )
        row = c.fetchone()
        conn.commit()
        conn.close()
        if not row:
            raise ValueError("链接不存在")
        return _map_link(_row_dict(row))
    conn = _sqlite_conn()
    c = conn.cursor()
    c.execute("SELECT * FROM dist_links WHERE id=? AND user_id=?", (link_id, user_id))
    row = c.fetchone()
    if not row:
        conn.close()
        raise ValueError("链接不存在")
    c.execute(
        "UPDATE dist_links SET status='revoked', revoked_at=? WHERE id=?",
        (_now(), link_id),
    )
    conn.commit()
    c.execute("SELECT * FROM dist_links WHERE id=?", (link_id,))
    out = _map_link(_row_dict(c.fetchone()))
    conn.close()
    return out


def create_unlimited_session(user_id: int, test_code: str) -> dict:
    init_dist_tables()
    token = _gen_token()
    test_code = (test_code or "").strip()
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute(
            "INSERT INTO dist_unlimited_sessions (token, user_id, test_code) VALUES (%s,%s,%s)",
            (token, user_id, test_code),
        )
        conn.commit()
        conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute(
            "INSERT INTO dist_unlimited_sessions (token, user_id, test_code, created_at) VALUES (?,?,?,?)",
            (token, user_id, test_code, _now()),
        )
        conn.commit()
        conn.close()
    return {"token": token, "test_code": test_code, "user_id": user_id}


def admin_dist_stats() -> dict:
    """超管看板：分销商 / 链接 / 结果 / 额度订单汇总。"""
    init_dist_tables()
    from cloud_deploy.cloud_api import database as db

    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute(
            """SELECT COUNT(*) AS n, COALESCE(SUM(quota),0) AS q, COALESCE(SUM(used_quota),0) AS u
               FROM dist_distributors"""
        )
        drow = _row_dict(c.fetchone()) or {}
        distributors = int(drow.get("n") or 0)
        quota_sum = int(drow.get("q") or 0)
        used_sum = int(drow.get("u") or 0)
        c.execute("SELECT COUNT(*) AS n FROM dist_links")
        links_total = int(_pg_scalar(c.fetchone(), "n") or 0)
        c.execute("SELECT COUNT(*) AS n FROM dist_links WHERE status='unused'")
        links_unused = int(_pg_scalar(c.fetchone(), "n") or 0)
        c.execute("SELECT COUNT(*) AS n FROM dist_links WHERE status='used'")
        links_used = int(_pg_scalar(c.fetchone(), "n") or 0)
        c.execute("SELECT COUNT(*) AS n FROM dist_links WHERE status='revoked'")
        links_revoked = int(_pg_scalar(c.fetchone(), "n") or 0)
        c.execute("SELECT COUNT(*) AS n FROM dist_test_results")
        results_total = int(_pg_scalar(c.fetchone(), "n") or 0)
        c.execute(
            """SELECT test_code, COUNT(*) AS n FROM dist_links
               GROUP BY test_code ORDER BY n DESC LIMIT 12"""
        )
        by_test = []
        for x in c.fetchall():
            r = _row_dict(x) or {}
            by_test.append({"test_code": r.get("test_code"), "links": int(r.get("n") or 0)})
        conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute("SELECT COUNT(*), COALESCE(SUM(quota),0), COALESCE(SUM(used_quota),0) FROM dist_distributors")
        drow = c.fetchone()
        distributors = int(drow[0] or 0)
        quota_sum = int(drow[1] or 0)
        used_sum = int(drow[2] or 0)
        c.execute("SELECT COUNT(*) FROM dist_links")
        links_total = int(c.fetchone()[0])
        c.execute("SELECT COUNT(*) FROM dist_links WHERE status='unused'")
        links_unused = int(c.fetchone()[0])
        c.execute("SELECT COUNT(*) FROM dist_links WHERE status='used'")
        links_used = int(c.fetchone()[0])
        c.execute("SELECT COUNT(*) FROM dist_links WHERE status='revoked'")
        links_revoked = int(c.fetchone()[0])
        c.execute("SELECT COUNT(*) FROM dist_test_results")
        results_total = int(c.fetchone()[0])
        c.execute(
            """SELECT test_code, COUNT(*) AS n FROM dist_links
               GROUP BY test_code ORDER BY n DESC LIMIT 12"""
        )
        by_test = [{"test_code": r[0], "links": int(r[1])} for r in c.fetchall()]
        conn.close()

    orders = db.list_payment_orders_by_plan_prefix("psy_quota", limit=200)
    paid_orders = [o for o in orders if o.get("status") == "paid"]
    return {
        "distributors": distributors,
        "quota_total": quota_sum,
        "quota_used": used_sum,
        "quota_remaining": max(0, quota_sum - used_sum),
        "links_total": links_total,
        "links_unused": links_unused,
        "links_used": links_used,
        "links_revoked": links_revoked,
        "results_total": results_total,
        "orders_total": len(orders),
        "orders_paid": len(paid_orders),
        "links_by_test": by_test,
    }


def admin_list_links(*, status: str | None = None, limit: int = 100) -> list[dict]:
    init_dist_tables()
    limit = max(1, min(int(limit), 500))
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        if status:
            c.execute(
                """SELECT l.*, u.username FROM dist_links l
                   LEFT JOIN users u ON u.id = l.user_id
                   WHERE l.status=%s ORDER BY l.id DESC LIMIT %s""",
                (status, limit),
            )
        else:
            c.execute(
                """SELECT l.*, u.username FROM dist_links l
                   LEFT JOIN users u ON u.id = l.user_id
                   ORDER BY l.id DESC LIMIT %s""",
                (limit,),
            )
        rows = c.fetchall()
        conn.close()
        out = []
        for row in rows:
            data = _row_dict(row) or {}
            item = _map_link(data)
            item["username"] = data.get("username") or ""
            item["user_id"] = data.get("user_id")
            out.append(item)
        return out

    conn = _sqlite_conn()
    c = conn.cursor()
    if status:
        c.execute(
            """SELECT l.*, u.username FROM dist_links l
               LEFT JOIN users u ON u.id = l.user_id
               WHERE l.status=? ORDER BY l.id DESC LIMIT ?""",
            (status, limit),
        )
    else:
        c.execute(
            """SELECT l.*, u.username FROM dist_links l
               LEFT JOIN users u ON u.id = l.user_id
               ORDER BY l.id DESC LIMIT ?""",
            (limit,),
        )
    rows = c.fetchall()
    conn.close()
    out = []
    for row in rows:
        data = _row_dict(row) or {}
        item = _map_link(data)
        item["username"] = data.get("username") or ""
        item["user_id"] = data.get("user_id")
        out.append(item)
    return out


def admin_list_distributors(*, limit: int = 100) -> list[dict]:
    init_dist_tables()
    limit = max(1, min(int(limit), 500))

    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute(
            """SELECT d.*, u.username, u.email FROM dist_distributors d
               LEFT JOIN users u ON u.id = d.user_id
               ORDER BY d.user_id DESC LIMIT %s""",
            (limit,),
        )
        rows = c.fetchall()
        conn.close()
        out = []
        for row in rows:
            data = _row_dict(row) or {}
            profile = {
                "id": data.get("user_id"),
                "username": data.get("username") or "",
                "email": data.get("email") or "",
            }
            out.append(_map_distributor(data, profile))
        return out

    conn = _sqlite_conn()
    c = conn.cursor()
    c.execute(
        """SELECT d.*, u.username, u.email FROM dist_distributors d
           LEFT JOIN users u ON u.id = d.user_id
           ORDER BY d.user_id DESC LIMIT ?""",
        (limit,),
    )
    rows = c.fetchall()
    conn.close()
    out = []
    for row in rows:
        data = _row_dict(row) or {}
        profile = {
            "id": data.get("user_id"),
            "username": data.get("username") or "",
            "email": data.get("email") or "",
        }
        out.append(_map_distributor(data, profile))
    return out


def _super_usernames() -> set[str]:
    raw = (os.environ.get("PSY_DIST_SUPER_USERNAMES") or os.environ.get("XHS_DIST_SUPER_USERNAMES") or "admin").strip()
    return {x.strip().lower() for x in raw.split(",") if x.strip()}


def ensure_super_role(user_id: int, username: str) -> None:
    """环境变量白名单用户自动升为 super_admin。"""
    if (username or "").strip().lower() not in _super_usernames():
        return
    init_dist_tables()
    if _USE_PG:
        conn = _pg_conn()
        try:
            c = _pg_cur(conn)
            c.execute(
                "UPDATE dist_distributors SET role=%s WHERE user_id=%s AND role<>%s",
                ("super_admin", int(user_id), "super_admin"),
            )
            conn.commit()
        finally:
            conn.close()
        return
    conn = _sqlite_conn()
    c = conn.cursor()
    c.execute(
        "UPDATE dist_distributors SET role=? WHERE user_id=? AND role<>?",
        ("super_admin", int(user_id), "super_admin"),
    )
    conn.commit()
    conn.close()


def invite_info(user_id: int, site_origin: str = "") -> dict[str, Any]:
    dist = ensure_distributor(int(user_id))
    code = (dist.get("invite_code") or "").strip()
    origin = (site_origin or os.environ.get("PSY_DIST_PUBLIC_ORIGIN") or "https://psy.xhs365.cn").rstrip("/")
    invited = 0
    reward = 0
    if _USE_PG:
        conn = _pg_conn()
        try:
            c = _pg_cur(conn)
            c.execute(
                "SELECT COUNT(*) AS c FROM dist_quota_logs WHERE user_id=%s AND change_type=%s",
                (int(user_id), "invite"),
            )
            invited = int((_row_dict(c.fetchone()) or {}).get("c") or 0)
            c.execute(
                "SELECT COALESCE(SUM(amount),0) AS s FROM dist_quota_logs WHERE user_id=%s AND change_type=%s",
                (int(user_id), "invite"),
            )
            reward = int((_row_dict(c.fetchone()) or {}).get("s") or 0)
        finally:
            conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute(
            "SELECT COUNT(*) AS c FROM dist_quota_logs WHERE user_id=? AND change_type=?",
            (int(user_id), "invite"),
        )
        invited = int((_row_dict(c.fetchone()) or {}).get("c") or 0)
        c.execute(
            "SELECT COALESCE(SUM(amount),0) AS s FROM dist_quota_logs WHERE user_id=? AND change_type=?",
            (int(user_id), "invite"),
        )
        reward = int((_row_dict(c.fetchone()) or {}).get("s") or 0)
        conn.close()
    return {
        "invite_code": code,
        "invite_url": f"{origin}/register?invite={code}" if code else "",
        "total_invites": invited,
        "total_rewards": reward,
        "invited_count": invited,
        "reward_quota_total": reward,
        "reward_per_invite": 5,
    }


def invite_records(user_id: int, *, page: int = 1, per_page: int = 20) -> dict[str, Any]:
    page = max(1, int(page or 1))
    per_page = max(1, min(int(per_page or 20), 100))
    offset = (page - 1) * per_page
    total = 0
    rows: list[dict[str, Any]] = []
    if _USE_PG:
        conn = _pg_conn()
        try:
            c = _pg_cur(conn)
            c.execute(
                "SELECT COUNT(*) AS c FROM dist_quota_logs WHERE user_id=%s AND change_type=%s",
                (int(user_id), "invite"),
            )
            total = int((_row_dict(c.fetchone()) or {}).get("c") or 0)
            c.execute(
                """SELECT id, amount, after_remaining, remark, created_at
                   FROM dist_quota_logs
                   WHERE user_id=%s AND change_type=%s
                   ORDER BY id DESC LIMIT %s OFFSET %s""",
                (int(user_id), "invite", per_page, offset),
            )
            rows = [_row_dict(r) or {} for r in c.fetchall()]
        finally:
            conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute(
            "SELECT COUNT(*) AS c FROM dist_quota_logs WHERE user_id=? AND change_type=?",
            (int(user_id), "invite"),
        )
        total = int((_row_dict(c.fetchone()) or {}).get("c") or 0)
        c.execute(
            """SELECT id, amount, after_remaining, remark, created_at
               FROM dist_quota_logs
               WHERE user_id=? AND change_type=?
               ORDER BY id DESC LIMIT ? OFFSET ?""",
            (int(user_id), "invite", per_page, offset),
        )
        rows = [_row_dict(r) or {} for r in c.fetchall()]
        conn.close()
    records = []
    for r in rows:
        remark = str(r.get("remark") or "")
        invited_name = remark.replace("邀请 ", "").strip() if remark.startswith("邀请 ") else remark
        records.append(
            {
                "id": r.get("id"),
                "invitee_username": invited_name,
                "invitee_email": "",
                "redeem_quota": None,
                "reward_quota": int(r.get("amount") or 0),
                "rewarded_at": r.get("created_at"),
                "remark": remark,
            }
        )
    return {"records": records, "total": total, "page": page, "per_page": per_page}


def set_distributor_role(user_id: int, role: str) -> dict[str, Any]:
    role_in = (role or "distributor").strip().lower()
    if role_in in ("user", "admin", "distributor"):
        db_role = "distributor"
    elif role_in in ("super_admin", "superadmin"):
        db_role = "super_admin"
    else:
        raise ValueError("无效角色")
    init_dist_tables()
    if _USE_PG:
        conn = _pg_conn()
        try:
            c = _pg_cur(conn)
            c.execute("UPDATE dist_distributors SET role=%s WHERE user_id=%s", (db_role, int(user_id)))
            conn.commit()
        finally:
            conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute("UPDATE dist_distributors SET role=? WHERE user_id=?", (db_role, int(user_id)))
        conn.commit()
        conn.close()
    return ensure_distributor(int(user_id))


def set_distributor_status(user_id: int, status: str) -> dict[str, Any]:
    status = (status or "active").strip().lower()
    if status not in ("active", "disabled", "banned"):
        raise ValueError("无效状态")
    init_dist_tables()
    if _USE_PG:
        conn = _pg_conn()
        try:
            c = _pg_cur(conn)
            c.execute("UPDATE dist_distributors SET status=%s WHERE user_id=%s", (status, int(user_id)))
            conn.commit()
        finally:
            conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute("UPDATE dist_distributors SET status=? WHERE user_id=?", (status, int(user_id)))
        conn.commit()
        conn.close()
    return ensure_distributor(int(user_id))


def admin_invite_overview(limit: int = 100) -> dict[str, Any]:
    """全站邀请汇总（超管用）。"""
    init_dist_tables()
    limit = max(1, min(int(limit or 100), 500))
    if _USE_PG:
        conn = _pg_conn()
        try:
            c = _pg_cur(conn)
            c.execute(
                "SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS s FROM dist_quota_logs WHERE change_type=%s",
                ("invite",),
            )
            tot = _row_dict(c.fetchone()) or {}
            c.execute(
                """SELECT q.user_id, u.username, COUNT(*) AS invite_count, SUM(q.amount) AS reward_sum
                   FROM dist_quota_logs q
                   LEFT JOIN users u ON u.id = q.user_id
                   WHERE q.change_type=%s
                   GROUP BY q.user_id, u.username
                   ORDER BY invite_count DESC LIMIT %s""",
                ("invite", limit),
            )
            top = [_row_dict(r) or {} for r in c.fetchall()]
        finally:
            conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute(
            "SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS s FROM dist_quota_logs WHERE change_type=?",
            ("invite",),
        )
        tot = _row_dict(c.fetchone()) or {}
        c.execute(
            """SELECT q.user_id, u.username, COUNT(*) AS invite_count, SUM(q.amount) AS reward_sum
               FROM dist_quota_logs q
               LEFT JOIN users u ON u.id = q.user_id
               WHERE q.change_type=?
               GROUP BY q.user_id
               ORDER BY invite_count DESC LIMIT ?""",
            ("invite", limit),
        )
        top = [_row_dict(r) or {} for r in c.fetchall()]
        conn.close()
    items = [
        {
            "user_id": r.get("user_id"),
            "username": r.get("username") or "",
            "invite_count": int(r.get("invite_count") or 0),
            "reward_sum": int(r.get("reward_sum") or 0),
        }
        for r in top
    ]
    return {
        "total_invite_events": int(tot.get("c") or 0),
        "total_reward_quota": int(tot.get("s") or 0),
        "list": items,
        "top_inviters": items,
    }


def list_quota_logs_admin(limit: int = 100) -> list[dict[str, Any]]:
    init_dist_tables()
    limit = max(1, min(int(limit or 100), 500))
    if _USE_PG:
        conn = _pg_conn()
        try:
            c = _pg_cur(conn)
            c.execute(
                """SELECT q.*, u.username FROM dist_quota_logs q
                   LEFT JOIN users u ON u.id = q.user_id
                   ORDER BY q.id DESC LIMIT %s""",
                (limit,),
            )
            return [_row_dict(r) or {} for r in c.fetchall()]
        finally:
            conn.close()
    conn = _sqlite_conn()
    c = conn.cursor()
    c.execute(
        """SELECT q.*, u.username FROM dist_quota_logs q
           LEFT JOIN users u ON u.id = q.user_id
           ORDER BY q.id DESC LIMIT ?""",
        (limit,),
    )
    rows = c.fetchall()
    conn.close()
    return [_row_dict(r) or {} for r in rows]


def list_orders_admin(limit: int = 100) -> list[dict[str, Any]]:
    """额度购买订单（payment_orders / psy_quota*）。"""
    from cloud_deploy.cloud_api import database as db

    return db.list_payment_orders_by_plan_prefix("psy_quota", limit=max(1, min(int(limit or 100), 500)))

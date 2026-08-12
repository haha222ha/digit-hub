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
        _DIST_PG_READY = True
    else:
        _init_dist_tables_sqlite()


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
    quota = int(dist.get("quota") or 0)
    used = int(dist.get("used_quota") or 0)
    return {
        "id": profile.get("id"),
        "user_id": profile.get("id"),
        "username": profile.get("username") or "",
        "email": profile.get("email") or "",
        "role": dist.get("role") or "distributor",
        "status": dist.get("status") or "active",
        "quota": quota,
        "used_quota": used,
        "remaining_quota": max(0, quota - used),
        "invite_code": dist.get("invite_code") or "",
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
        cols = [d[0] for d in c.description]
        conn.close()
        out = []
        for row in rows:
            data = dict(zip(cols, row))
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
    from cloud_deploy.cloud_api import database as db

    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute(
            """SELECT d.*, u.username FROM dist_distributors d
               JOIN users u ON u.id = d.user_id
               ORDER BY d.user_id DESC LIMIT %s""",
            (limit,),
        )
        rows = c.fetchall()
        cols = [d[0] for d in c.description]
        conn.close()
        out = []
        for row in rows:
            data = dict(zip(cols, row))
            profile = {"id": data.get("user_id"), "username": data.get("username") or ""}
            out.append(_map_distributor(data, profile))
        return out

    conn = _sqlite_conn()
    c = conn.cursor()
    c.execute(
        """SELECT d.*, u.username FROM dist_distributors d
           JOIN users u ON u.id = d.user_id
           ORDER BY d.user_id DESC LIMIT ?""",
        (limit,),
    )
    rows = c.fetchall()
    conn.close()
    out = []
    for row in rows:
        data = _row_dict(row) or {}
        profile = {"id": data.get("user_id"), "username": data.get("username") or ""}
        out.append(_map_distributor(data, profile))
    return out

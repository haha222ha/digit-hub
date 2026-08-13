# -*- coding: utf-8 -*-
"""心理测评分销 · 数据层（Quota / Link / Results）。"""
from __future__ import annotations

import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta
from typing import Any

from cloud_deploy.cloud_api.config import get_settings

_USE_PG = os.environ.get("XHS_DATABASE_URL", "").startswith("postgres")
_DIST_PG_READY = False


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _now_dt() -> datetime:
    return datetime.now()


def _parse_ts(val: Any) -> datetime | None:
    if val is None or val == "":
        return None
    if isinstance(val, datetime):
        return val.replace(tzinfo=None) if val.tzinfo else val
    text = str(val).strip().replace("T", " ").replace("Z", "")
    if "+" in text[10:]:
        text = text.split("+")[0].strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d"):
        try:
            return datetime.strptime(text[:26], fmt)
        except ValueError:
            continue
    return None


def _fmt_ts(val: Any) -> str | None:
    if val is None or val == "":
        return None
    if isinstance(val, datetime):
        return val.strftime("%Y-%m-%d %H:%M:%S")
    parsed = _parse_ts(val)
    return parsed.strftime("%Y-%m-%d %H:%M:%S") if parsed else str(val)


def resolve_link_policy() -> dict[str, Any]:
    """链接策略：首次开测后 N 小时内最多 M 次（默认 72h / 3 次，对标源站）。"""
    max_uses = int(os.environ.get("XHS_DIST_LINK_MAX_USES", "3") or 3)
    expire_hours = int(os.environ.get("XHS_DIST_LINK_EXPIRE_HOURS", "72") or 72)
    idle_days = int(os.environ.get("XHS_DIST_LINK_IDLE_DAYS", "90") or 90)
    try:
        from cloud_deploy.cloud_api import dist_ops

        cfg = dist_ops.get_config()
        if cfg.get("link_max_uses") not in (None, ""):
            max_uses = max(1, int(float(cfg["link_max_uses"])))
        expire_type = (cfg.get("expire_type") or "").strip() or "custom_days"
        if expire_type == "permanent":
            expire_hours = 0
        elif expire_type == "24hours":
            expire_hours = 24
        elif expire_type == "custom_days" and cfg.get("expire_days") not in (None, ""):
            expire_hours = max(1, int(float(cfg["expire_days"])) * 24)
        elif cfg.get("link_expire_hours") not in (None, ""):
            expire_hours = max(0, int(float(cfg["link_expire_hours"])))
        if cfg.get("link_idle_days") not in (None, ""):
            idle_days = max(0, int(float(cfg["link_idle_days"])))
    except Exception:
        pass
    return {
        "max_uses": max(1, max_uses),
        "expire_hours": max(0, expire_hours),
        "idle_days": max(0, idle_days),
    }


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
        """CREATE TABLE IF NOT EXISTS dist_package_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            document_url TEXT NOT NULL DEFAULT '',
            document_type TEXT NOT NULL DEFAULT 'link',
            package_id INTEGER NOT NULL DEFAULT 0,
            display_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS dist_payment_notify_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_no TEXT NOT NULL DEFAULT '',
            trade_status TEXT NOT NULL DEFAULT '',
            verify_ok INTEGER NOT NULL DEFAULT 0,
            response_text TEXT NOT NULL DEFAULT '',
            client_ip TEXT NOT NULL DEFAULT '',
            raw_params TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        )""",
        "ALTER TABLE dist_links ADD COLUMN first_used_at TEXT",
        "ALTER TABLE dist_unlimited_sessions ADD COLUMN expires_at TEXT",
    ]
    stmts_pg = [
        "ALTER TABLE dist_distributors ADD COLUMN IF NOT EXISTS inviter_user_id INTEGER",
        "ALTER TABLE dist_distributors ADD COLUMN IF NOT EXISTS detailed_tutorial_access BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE dist_links ADD COLUMN IF NOT EXISTS first_used_at TIMESTAMP",
        "ALTER TABLE dist_unlimited_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP",
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
        """CREATE TABLE IF NOT EXISTS dist_package_documents (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            document_url TEXT NOT NULL DEFAULT '',
            document_type TEXT NOT NULL DEFAULT 'link',
            package_id INTEGER NOT NULL DEFAULT 0,
            display_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS dist_payment_notify_logs (
            id SERIAL PRIMARY KEY,
            order_no TEXT NOT NULL DEFAULT '',
            trade_status TEXT NOT NULL DEFAULT '',
            verify_ok BOOLEAN NOT NULL DEFAULT FALSE,
            response_text TEXT NOT NULL DEFAULT '',
            client_ip TEXT NOT NULL DEFAULT '',
            raw_params TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
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


def has_quota_log_remark(user_id: int, *, change_type: str, remark: str) -> bool:
    """按 remark 查是否已入账（用于支付履约幂等）。"""
    init_dist_tables()
    uid = int(user_id)
    ct = (change_type or "").strip()
    rm = (remark or "").strip()
    if not ct or not rm:
        return False
    if _USE_PG:
        conn = _pg_conn()
        try:
            c = _pg_cur(conn)
            c.execute(
                "SELECT 1 FROM dist_quota_logs WHERE user_id=%s AND change_type=%s AND remark=%s LIMIT 1",
                (uid, ct, rm),
            )
            return c.fetchone() is not None
        finally:
            conn.close()
    conn = _sqlite_conn()
    c = conn.cursor()
    c.execute(
        "SELECT 1 FROM dist_quota_logs WHERE user_id=? AND change_type=? AND remark=? LIMIT 1",
        (uid, ct, rm),
    )
    ok = c.fetchone() is not None
    conn.close()
    return ok


def add_quota(user_id: int, amount: int, *, change_type: str, remark: str = "") -> dict:
    init_dist_tables()
    dist = ensure_distributor(user_id)
    amount = int(amount)
    if amount <= 0:
        raise ValueError("额度必须大于 0")
    # 订单履约幂等：同 remark 不重复加额
    if remark and change_type in ("purchase", "invite_rebate") and has_quota_log_remark(
        user_id, change_type=change_type, remark=remark
    ):
        return ensure_distributor(user_id)
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
    expires_at = _fmt_ts(row.get("expires_at"))
    first_used_at = _fmt_ts(row.get("first_used_at"))
    created_at = _fmt_ts(row.get("created_at")) or row.get("created_at")
    used_count = int(row.get("used_count") or 0)
    max_uses = int(row.get("max_uses") or 3)
    out = {
        "id": row.get("id"),
        "token": row.get("token"),
        "user_id": row.get("user_id"),
        "test_code": row.get("test_code"),
        "status": row.get("status") or "unused",
        "used_count": used_count,
        "max_uses": max_uses,
        "expires_at": expires_at,
        "first_used_at": first_used_at,
        "created_at": created_at,
        # SDK / 源站兼容字段
        "usedCount": used_count,
        "maxUses": max_uses,
        "expiresAt": expires_at,
        "firstUsedAt": first_used_at,
    }
    return out


def _set_link_status(token: str, status: str) -> None:
    token = (token or "").strip()
    if not token:
        return
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute("UPDATE dist_links SET status=%s WHERE token=%s", (status, token))
        conn.commit()
        conn.close()
        return
    conn = _sqlite_conn()
    c = conn.cursor()
    c.execute("UPDATE dist_links SET status=? WHERE token=?", (status, token))
    conn.commit()
    conn.close()


def _link_access_error(link: dict, *, for_complete: bool = False) -> str | None:
    """返回不可用原因；可用则 None。含首次开测后过期、次数用尽、长期未激活。
    for_complete=True 时不因 used_count>=max 拒绝（最后一次 start 后仍允许交卷存结果）。
    """
    status = (link.get("status") or "unused").strip()
    if status == "revoked":
        return "链接无效或已撤销"
    if status == "expired":
        return "链接已过期"
    policy = resolve_link_policy()
    used = int(link.get("used_count") or 0)
    max_uses = int(link.get("max_uses") or policy["max_uses"] or 3)
    if not for_complete and used >= max_uses:
        if status != "used":
            _set_link_status(str(link.get("token") or ""), "used")
        return "链接使用次数已达上限"
    now = _now_dt()
    expires_at = _parse_ts(link.get("expires_at"))
    if expires_at and now > expires_at:
        _set_link_status(str(link.get("token") or ""), "expired")
        return "链接已过期（首次开测后的有效期已结束）"
    idle_days = int(policy.get("idle_days") or 0)
    first_used = _parse_ts(link.get("first_used_at"))
    created = _parse_ts(link.get("created_at"))
    if idle_days > 0 and not first_used and created and now > created + timedelta(days=idle_days):
        _set_link_status(str(link.get("token") or ""), "expired")
        return "链接已过期（长期未使用）"
    return None


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
        data = _row_dict(row)
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute("SELECT * FROM dist_unlimited_sessions WHERE token=?", (token,))
        row = c.fetchone()
        conn.close()
        data = _row_dict(row)
    if not data:
        return None
    exp = _parse_ts(data.get("expires_at"))
    if exp and _now_dt() > exp:
        return None
    return data


def create_unlimited_session(user_id: int, test_code: str, *, hours: int = 24) -> dict:
    """创建无限测会话（调用方须已做超管鉴权）。默认 24h 过期。"""
    init_dist_tables()
    token = _gen_token()
    test_code = (test_code or "").strip()
    hours = max(1, min(int(hours or 24), 168))
    exp_s = _fmt_ts(_now_dt() + timedelta(hours=hours))
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute(
            """INSERT INTO dist_unlimited_sessions (token, user_id, test_code, expires_at)
               VALUES (%s,%s,%s,%s)""",
            (token, user_id, test_code, exp_s),
        )
        conn.commit()
        conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute(
            """INSERT INTO dist_unlimited_sessions (token, user_id, test_code, created_at, expires_at)
               VALUES (?,?,?,?,?)""",
            (token, user_id, test_code, _now(), exp_s),
        )
        conn.commit()
        conn.close()
    return {
        "token": token,
        "test_code": test_code,
        "user_id": user_id,
        "expires_at": exp_s,
        "expiresAt": exp_s,
    }


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
    if not link:
        return {"valid": False, "message": "链接无效或已撤销"}
    err = _link_access_error(link)
    if err:
        # 刷新状态后的最新 link
        link = get_link_by_token(token) or link
        return {"valid": False, "message": err, "link": link}
    return {
        "valid": True,
        "message": "链接有效",
        "link": link,
        "unlimited": False,
        "testCode": link.get("test_code"),
        "expiresAt": link.get("expires_at"),
    }


def start_link_test(token: str) -> dict:
    """首次开测写入有效期；每次 start 原子 +1 used_count（防跳过 complete 白嫖复测）。"""
    unlimited = get_unlimited_session(token)
    if unlimited:
        return {"success": True, "unlimited": True, "expiresAt": unlimited.get("expires_at")}
    link = get_link_by_token(token)
    if not link:
        raise ValueError("链接无效")
    err = _link_access_error(link)
    if err:
        raise ValueError(err)

    policy = resolve_link_policy()
    first_used = _parse_ts(link.get("first_used_at"))
    hours = int(policy.get("expire_hours") or 0)
    now = _now_dt()
    first_s = _fmt_ts(first_used) if first_used else _fmt_ts(now)
    exp_s = _fmt_ts(link.get("expires_at"))
    if not first_used:
        exp_s = _fmt_ts((now + timedelta(hours=hours)) if hours > 0 else None)

    # 原子：写首次时间 + used_count+1，且 used_count < max_uses
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute(
            """UPDATE dist_links
               SET first_used_at = COALESCE(first_used_at, %s),
                   expires_at = COALESCE(expires_at, %s),
                   used_count = used_count + 1,
                   status = CASE
                     WHEN used_count + 1 >= max_uses THEN 'used'
                     ELSE status
                   END
               WHERE token=%s
                 AND status NOT IN ('revoked', 'expired')
                 AND used_count < max_uses
               RETURNING *""",
            (first_s, exp_s, token),
        )
        row = c.fetchone()
        conn.commit()
        conn.close()
        if not row:
            raise ValueError("链接使用次数已达上限或已失效")
        link = _map_link(_row_dict(row))
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute(
            """UPDATE dist_links
               SET first_used_at = COALESCE(NULLIF(first_used_at, ''), ?),
                   expires_at = COALESCE(NULLIF(expires_at, ''), ?),
                   used_count = used_count + 1,
                   status = CASE
                     WHEN used_count + 1 >= max_uses THEN 'used'
                     ELSE status
                   END
               WHERE token=?
                 AND status NOT IN ('revoked', 'expired')
                 AND used_count < max_uses""",
            (first_s, exp_s, token),
        )
        if c.rowcount <= 0:
            conn.close()
            raise ValueError("链接使用次数已达上限或已失效")
        conn.commit()
        c.execute("SELECT * FROM dist_links WHERE token=?", (token,))
        link = _map_link(_row_dict(c.fetchone()))
        conn.close()

    return {
        "success": True,
        "unlimited": False,
        "activated": not bool(first_used),
        "usedCount": int(link.get("used_count") or 0),
        "expiresAt": link.get("expires_at"),
        "link": link,
    }


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
            "reportUnlocked": True,
        }
    link = get_link_by_token(token)
    if not link:
        raise ValueError("链接无效")
    # 未 start 过则先 start（会消耗一次次数）
    if int(link.get("used_count") or 0) <= 0 or not _parse_ts(link.get("first_used_at")):
        start_link_test(token)
        link = get_link_by_token(token) or link
    err = _link_access_error(link, for_complete=True)
    if err:
        raise ValueError(err)

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
    refreshed = get_link_by_token(token) or link
    return {
        "success": True,
        "usedCount": int(refreshed.get("used_count") or 0),
        "unlimited": False,
        "resultSaved": result_id is not None,
        "resultId": result_id,
        "reportUnlocked": True,
        "expiresAt": refreshed.get("expires_at"),
        "link": refreshed,
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


def _link_sort_clause(sort_by: str | None, sort_order: str | None) -> str:
    col_map = {
        "id": "id",
        "created_at": "created_at",
        "createdat": "created_at",
        "test_code": "test_code",
        "testcode": "test_code",
        "status": "status",
        "used_count": "used_count",
        "usedcount": "used_count",
    }
    col = col_map.get((sort_by or "").strip().lower().replace("-", "_"), "id")
    order = "ASC" if (sort_order or "").strip().upper() == "ASC" else "DESC"
    return f"{col} {order}"


def list_links_page(
    user_id: int,
    *,
    status: str | None = None,
    test_code: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    sort_by: str | None = None,
    sort_order: str | None = None,
    page: int = 1,
    per_page: int = 20,
) -> dict:
    """真分页链接列表。返回 {links, total, page, per_page}。"""
    init_dist_tables()
    page = max(1, int(page or 1))
    per_page = max(1, min(int(per_page or 20), 100))
    offset = (page - 1) * per_page
    st = (status or "").strip() or None
    tc = (test_code or "").strip() or None
    sd = (start_date or "").strip()[:10] or None
    ed = (end_date or "").strip()[:10] or None
    where = ["user_id=%s" if _USE_PG else "user_id=?"]
    params: list[Any] = [int(user_id)]
    if st:
        where.append("status=%s" if _USE_PG else "status=?")
        params.append(st)
    if tc:
        where.append("test_code=%s" if _USE_PG else "test_code=?")
        params.append(tc)
    if sd:
        if _USE_PG:
            where.append("created_at >= %s::date")
        else:
            where.append("date(created_at) >= date(?)")
        params.append(sd)
    if ed:
        if _USE_PG:
            where.append("created_at < (%s::date + INTERVAL '1 day')")
        else:
            where.append("date(created_at) <= date(?)")
        params.append(ed)
    wh = " AND ".join(where)
    order_sql = _link_sort_clause(sort_by, sort_order)
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute(f"SELECT COUNT(*) AS c FROM dist_links WHERE {wh}", tuple(params))
        total = int((_row_dict(c.fetchone()) or {}).get("c") or 0)
        c.execute(
            f"SELECT * FROM dist_links WHERE {wh} ORDER BY {order_sql} LIMIT %s OFFSET %s",
            tuple(params + [per_page, offset]),
        )
        rows = c.fetchall()
        conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute(f"SELECT COUNT(*) AS c FROM dist_links WHERE {wh}", tuple(params))
        total = int((_row_dict(c.fetchone()) or {}).get("c") or 0)
        c.execute(
            f"SELECT * FROM dist_links WHERE {wh} ORDER BY {order_sql} LIMIT ? OFFSET ?",
            tuple(params + [per_page, offset]),
        )
        rows = c.fetchall()
        conn.close()
    links = [_map_link(_row_dict(r)) for r in rows]
    return {"links": links, "total": total, "page": page, "per_page": per_page}


def list_links(
    user_id: int,
    *,
    status: str | None = None,
    test_code: str | None = None,
    limit: int = 100,
) -> list[dict]:
    """兼容旧调用：返回最多 limit 条（无 offset）。"""
    limit = max(1, min(int(limit or 100), 500))
    return list_links_page(
        user_id, status=status, test_code=test_code, page=1, per_page=limit
    )["links"]


def revoke_links(user_id: int, link_ids: list[int]) -> dict:
    """批量撤销。未开测（used_count==0）退还 1 额度（used_quota-1）。"""
    init_dist_tables()
    ensure_distributor(user_id)
    ids = [int(x) for x in (link_ids or []) if x is not None]
    if not ids:
        raise ValueError("请选择要撤销的链接")
    revoked: list[dict] = []
    refunded = 0
    now = _now()
    uid = int(user_id)

    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        try:
            c.execute(
                "SELECT quota, used_quota FROM dist_distributors WHERE user_id=%s FOR UPDATE",
                (uid,),
            )
            drow = _row_dict(c.fetchone()) or {}
            rem = int(drow.get("quota") or 0) - int(drow.get("used_quota") or 0)
            for lid in ids:
                c.execute(
                    "SELECT * FROM dist_links WHERE id=%s AND user_id=%s FOR UPDATE",
                    (lid, uid),
                )
                row = c.fetchone()
                if not row:
                    continue
                link = _row_dict(row) or {}
                if (link.get("status") or "") == "revoked":
                    continue
                do_refund = int(link.get("used_count") or 0) == 0
                c.execute(
                    "UPDATE dist_links SET status='revoked', revoked_at=NOW() WHERE id=%s RETURNING *",
                    (lid,),
                )
                out_row = c.fetchone()
                if do_refund:
                    before = rem
                    c.execute(
                        """UPDATE dist_distributors
                           SET used_quota = GREATEST(0, used_quota - 1)
                           WHERE user_id=%s""",
                        (uid,),
                    )
                    rem = before + 1
                    c.execute(
                        """INSERT INTO dist_quota_logs
                           (user_id, change_type, amount, before_remaining, after_remaining, remark)
                           VALUES (%s,'refund',1,%s,%s,%s)""",
                        (uid, before, rem, "撤销未使用链接退还额度"),
                    )
                    refunded += 1
                if out_row:
                    revoked.append(_map_link(_row_dict(out_row)))
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        try:
            c.execute("SELECT quota, used_quota FROM dist_distributors WHERE user_id=?", (uid,))
            drow = _row_dict(c.fetchone()) or {}
            rem = int(drow.get("quota") or 0) - int(drow.get("used_quota") or 0)
            for lid in ids:
                c.execute("SELECT * FROM dist_links WHERE id=? AND user_id=?", (lid, uid))
                row = c.fetchone()
                if not row:
                    continue
                link = _row_dict(row) or {}
                if (link.get("status") or "") == "revoked":
                    continue
                do_refund = int(link.get("used_count") or 0) == 0
                c.execute(
                    "UPDATE dist_links SET status='revoked', revoked_at=? WHERE id=?",
                    (now, lid),
                )
                if do_refund:
                    before = rem
                    c.execute(
                        """UPDATE dist_distributors
                           SET used_quota = CASE WHEN used_quota > 0 THEN used_quota - 1 ELSE 0 END
                           WHERE user_id=?""",
                        (uid,),
                    )
                    rem = before + 1
                    c.execute(
                        """INSERT INTO dist_quota_logs
                           (user_id, change_type, amount, before_remaining, after_remaining, remark, created_at)
                           VALUES (?,?,?,?,?,?,?)""",
                        (uid, "refund", 1, before, rem, "撤销未使用链接退还额度", now),
                    )
                    refunded += 1
                c.execute("SELECT * FROM dist_links WHERE id=?", (lid,))
                out_row = c.fetchone()
                if out_row:
                    revoked.append(_map_link(_row_dict(out_row)))
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    return {
        "revokedCount": len(revoked),
        "refundedQuota": refunded,
        "links": revoked,
    }


def revoke_link(user_id: int, link_id: int) -> dict:
    out = revoke_links(user_id, [int(link_id)])
    if not out["links"]:
        raise ValueError("链接不存在")
    return out["links"][0]


def list_redeem_history(user_id: int, *, page: int = 1, per_page: int = 20) -> dict:
    """兑换记录：change_type=redeem。"""
    page = max(1, int(page or 1))
    per_page = max(1, min(int(per_page or 20), 100))
    offset = (page - 1) * per_page
    change_type = "redeem"
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute(
            "SELECT COUNT(*) AS c FROM dist_quota_logs WHERE user_id=%s AND change_type=%s",
            (int(user_id), change_type),
        )
        total = int((_row_dict(c.fetchone()) or {}).get("c") or 0)
        c.execute(
            """SELECT id, amount, before_remaining, after_remaining, remark, created_at
               FROM dist_quota_logs
               WHERE user_id=%s AND change_type=%s
               ORDER BY id DESC LIMIT %s OFFSET %s""",
            (int(user_id), change_type, per_page, offset),
        )
        rows = [_row_dict(r) or {} for r in c.fetchall()]
        conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute(
            "SELECT COUNT(*) AS c FROM dist_quota_logs WHERE user_id=? AND change_type=?",
            (int(user_id), change_type),
        )
        total = int((_row_dict(c.fetchone()) or {}).get("c") or 0)
        c.execute(
            """SELECT id, amount, before_remaining, after_remaining, remark, created_at
               FROM dist_quota_logs
               WHERE user_id=? AND change_type=?
               ORDER BY id DESC LIMIT ? OFFSET ?""",
            (int(user_id), change_type, per_page, offset),
        )
        rows = [_row_dict(r) or {} for r in c.fetchall()]
        conn.close()
    logs = []
    for r in rows:
        logs.append(
            {
                "id": r.get("id"),
                "amount": int(r.get("amount") or 0),
                "before_remaining": r.get("before_remaining"),
                "after_remaining": r.get("after_remaining"),
                "remark": r.get("remark") or "",
                "created_at": _fmt_ts(r.get("created_at")) or r.get("created_at"),
                "change_type": "redeem",
            }
        )
    return {
        "logs": logs,
        "pagination": {
            "page": page,
            "perPage": per_page,
            "total": total,
            "totalPages": max(1, (total + per_page - 1) // per_page) if total else 0,
        },
    }


def export_links_rows(
    user_id: int,
    *,
    link_ids: list[int] | None = None,
    status: str | None = None,
    test_code: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    sort_by: str | None = None,
    sort_order: str | None = None,
) -> list[dict]:
    """导出用：指定 ids 或按筛选拉全量（上限 5000）。"""
    init_dist_tables()
    ids = [int(x) for x in (link_ids or []) if x is not None]
    st = (status or "").strip() or None
    tc = (test_code or "").strip() or None
    if ids:
        ph = ",".join(["%s" if _USE_PG else "?"] * len(ids))
        sql = f"SELECT * FROM dist_links WHERE user_id={'%s' if _USE_PG else '?'} AND id IN ({ph}) ORDER BY id DESC"
        params = [int(user_id)] + ids
        if _USE_PG:
            conn = _pg_conn()
            c = _pg_cur(conn)
            c.execute(sql, tuple(params))
            rows = c.fetchall()
            conn.close()
        else:
            conn = _sqlite_conn()
            c = conn.cursor()
            c.execute(sql, tuple(params))
            rows = c.fetchall()
            conn.close()
        return [_map_link(_row_dict(r)) for r in rows]
    all_links: list[dict] = []
    page_i = 1
    total = 0
    while page_i <= 50:
        page = list_links_page(
            user_id,
            status=st,
            test_code=tc,
            start_date=start_date,
            end_date=end_date,
            sort_by=sort_by,
            sort_order=sort_order,
            page=page_i,
            per_page=100,
        )
        total = int(page.get("total") or 0)
        batch = page.get("links") or []
        if not batch:
            break
        all_links.extend(batch)
        if len(all_links) >= min(total, 5000) or len(batch) < 100:
            break
        page_i += 1
    return all_links[:5000]


def _map_test_result(row: dict | None) -> dict:
    row = row or {}
    completed = _fmt_ts(row.get("completed_at")) or row.get("completed_at")
    return {
        "id": row.get("id"),
        "link_id": row.get("link_id"),
        "token": row.get("token"),
        "test_code": row.get("test_code"),
        "testCode": row.get("test_code"),
        "user_id": row.get("user_id"),
        "perspective": row.get("perspective"),
        "unlimited": bool(row.get("unlimited")),
        "completed_at": completed,
        "completedAt": completed,
    }


def list_test_results_page(
    user_id: int,
    *,
    test_code: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    page: int = 1,
    per_page: int = 20,
) -> dict:
    init_dist_tables()
    page = max(1, int(page or 1))
    per_page = max(1, min(int(per_page or 20), 100))
    offset = (page - 1) * per_page
    tc = (test_code or "").strip() or None
    sd = (start_date or "").strip() or None
    ed = (end_date or "").strip() or None
    where = ["user_id=%s" if _USE_PG else "user_id=?"]
    params: list[Any] = [int(user_id)]
    if tc:
        where.append("test_code=%s" if _USE_PG else "test_code=?")
        params.append(tc)
    if sd:
        where.append("completed_at >= %s" if _USE_PG else "completed_at >= ?")
        params.append(sd if len(sd) > 10 else f"{sd} 00:00:00")
    if ed:
        where.append("completed_at <= %s" if _USE_PG else "completed_at <= ?")
        params.append(ed if len(ed) > 10 else f"{ed} 23:59:59")
    wh = " AND ".join(where)
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute(f"SELECT COUNT(*) AS c FROM dist_test_results WHERE {wh}", tuple(params))
        total = int((_row_dict(c.fetchone()) or {}).get("c") or 0)
        c.execute(
            f"""SELECT id, link_id, token, test_code, user_id, perspective, unlimited, completed_at
                FROM dist_test_results WHERE {wh}
                ORDER BY id DESC LIMIT %s OFFSET %s""",
            tuple(params + [per_page, offset]),
        )
        rows = [_map_test_result(_row_dict(r)) for r in c.fetchall()]
        conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute(f"SELECT COUNT(*) AS c FROM dist_test_results WHERE {wh}", tuple(params))
        total = int((_row_dict(c.fetchone()) or {}).get("c") or 0)
        c.execute(
            f"""SELECT id, link_id, token, test_code, user_id, perspective, unlimited, completed_at
                FROM dist_test_results WHERE {wh}
                ORDER BY id DESC LIMIT ? OFFSET ?""",
            tuple(params + [per_page, offset]),
        )
        rows = [_map_test_result(_row_dict(r)) for r in c.fetchall()]
        conn.close()
    return {
        "results": rows,
        "pagination": {
            "page": page,
            "perPage": per_page,
            "total": total,
            "totalPages": max(1, (total + per_page - 1) // per_page) if total else 0,
        },
    }


def list_test_results_admin(
    *,
    user_id: int | None = None,
    test_code: str | None = None,
    page: int = 1,
    per_page: int = 20,
) -> dict:
    init_dist_tables()
    page = max(1, int(page or 1))
    per_page = max(1, min(int(per_page or 20), 100))
    offset = (page - 1) * per_page
    where: list[str] = []
    params: list[Any] = []
    if user_id:
        where.append("r.user_id=%s" if _USE_PG else "r.user_id=?")
        params.append(int(user_id))
    tc = (test_code or "").strip() or None
    if tc:
        where.append("r.test_code=%s" if _USE_PG else "r.test_code=?")
        params.append(tc)
    wh = (" WHERE " + " AND ".join(where)) if where else ""
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute(f"SELECT COUNT(*) AS c FROM dist_test_results r{wh}", tuple(params))
        total = int((_row_dict(c.fetchone()) or {}).get("c") or 0)
        c.execute(
            f"""SELECT r.id, r.link_id, r.token, r.test_code, r.user_id, r.perspective, r.unlimited,
                       r.completed_at, u.username
                FROM dist_test_results r
                LEFT JOIN users u ON u.id = r.user_id
                {wh}
                ORDER BY r.id DESC LIMIT %s OFFSET %s""",
            tuple(params + [per_page, offset]),
        )
        rows = []
        for r in c.fetchall():
            item = _map_test_result(_row_dict(r))
            item["username"] = (_row_dict(r) or {}).get("username")
            rows.append(item)
        conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute(f"SELECT COUNT(*) AS c FROM dist_test_results r{wh}", tuple(params))
        total = int((_row_dict(c.fetchone()) or {}).get("c") or 0)
        c.execute(
            f"""SELECT r.id, r.link_id, r.token, r.test_code, r.user_id, r.perspective, r.unlimited,
                       r.completed_at, u.username
                FROM dist_test_results r
                LEFT JOIN users u ON u.id = r.user_id
                {wh}
                ORDER BY r.id DESC LIMIT ? OFFSET ?""",
            tuple(params + [per_page, offset]),
        )
        rows = []
        for r in c.fetchall():
            item = _map_test_result(_row_dict(r))
            item["username"] = (_row_dict(r) or {}).get("username")
            rows.append(item)
        conn.close()
    return {
        "results": rows,
        "pagination": {
            "page": page,
            "perPage": per_page,
            "total": total,
            "totalPages": max(1, (total + per_page - 1) // per_page) if total else 0,
        },
    }


def list_quota_logs_page(
    user_id: int,
    *,
    page: int = 1,
    per_page: int = 20,
    change_type: str | None = None,
) -> dict:
    init_dist_tables()
    page = max(1, int(page or 1))
    per_page = max(1, min(int(per_page or 20), 100))
    offset = (page - 1) * per_page
    uid = int(user_id)
    where = ["user_id=%s" if _USE_PG else "user_id=?"]
    params: list[Any] = [uid]
    ct = (change_type or "").strip()
    if ct:
        where.append("change_type=%s" if _USE_PG else "change_type=?")
        params.append(ct)
    wh = " AND ".join(where)
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute(f"SELECT COUNT(*) AS c FROM dist_quota_logs WHERE {wh}", tuple(params))
        total = int((_row_dict(c.fetchone()) or {}).get("c") or 0)
        c.execute(
            f"""SELECT id, change_type, amount, before_remaining, after_remaining, remark, created_at
               FROM dist_quota_logs WHERE {wh}
               ORDER BY id DESC LIMIT %s OFFSET %s""",
            tuple(params + [per_page, offset]),
        )
        rows = [_row_dict(r) or {} for r in c.fetchall()]
        conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute(f"SELECT COUNT(*) AS c FROM dist_quota_logs WHERE {wh}", tuple(params))
        total = int((_row_dict(c.fetchone()) or {}).get("c") or 0)
        c.execute(
            f"""SELECT id, change_type, amount, before_remaining, after_remaining, remark, created_at
               FROM dist_quota_logs WHERE {wh}
               ORDER BY id DESC LIMIT ? OFFSET ?""",
            tuple(params + [per_page, offset]),
        )
        rows = [_row_dict(r) or {} for r in c.fetchall()]
        conn.close()
    logs = []
    for r in rows:
        logs.append(
            {
                "id": r.get("id"),
                "change_type": r.get("change_type") or "",
                "amount": int(r.get("amount") or 0),
                "before_remaining": r.get("before_remaining"),
                "after_remaining": r.get("after_remaining"),
                "remark": r.get("remark") or "",
                "created_at": _fmt_ts(r.get("created_at")) or r.get("created_at"),
            }
        )
    return {
        "logs": logs,
        "pagination": {
            "page": page,
            "perPage": per_page,
            "total": total,
            "totalPages": max(1, (total + per_page - 1) // per_page) if total else 0,
        },
    }


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
    """超管用户名白名单。默认空（禁止自动提权）；须显式配置 PSY_DIST_SUPER_USERNAMES。"""
    raw = (os.environ.get("PSY_DIST_SUPER_USERNAMES") or os.environ.get("XHS_DIST_SUPER_USERNAMES") or "").strip()
    return {x.strip().lower() for x in raw.split(",") if x.strip()}


_RESERVED_USERNAMES = frozenset(
    {
        "admin",
        "administrator",
        "root",
        "super",
        "superadmin",
        "super_admin",
        "system",
        "support",
        "official",
        "xinxiang",
        "psy",
    }
)


def is_reserved_username(username: str) -> bool:
    name = (username or "").strip().lower()
    if not name:
        return True
    if name in _RESERVED_USERNAMES:
        return True
    if name.startswith("admin") and len(name) <= 12:
        return True
    return False


def ensure_super_role(user_id: int, username: str) -> None:
    """仅当用户名在显式环境白名单中时，升为 super_admin。默认白名单为空。"""
    allowed = _super_usernames()
    if not allowed:
        return
    if (username or "").strip().lower() not in allowed:
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
    # 统计：绑定人数 + 首购返利（注册不再发 +5）
    rebate_count = 0
    rebate_sum = 0
    bound = 0
    if _USE_PG:
        conn = _pg_conn()
        try:
            c = _pg_cur(conn)
            c.execute(
                "SELECT COUNT(*) AS c FROM dist_distributors WHERE inviter_user_id=%s",
                (int(user_id),),
            )
            bound = int((_row_dict(c.fetchone()) or {}).get("c") or 0)
            c.execute(
                "SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS s FROM dist_quota_logs WHERE user_id=%s AND change_type=%s",
                (int(user_id), "invite_rebate"),
            )
            row = _row_dict(c.fetchone()) or {}
            rebate_count = int(row.get("c") or 0)
            rebate_sum = int(row.get("s") or 0)
        finally:
            conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute(
            "SELECT COUNT(*) AS c FROM dist_distributors WHERE inviter_user_id=?",
            (int(user_id),),
        )
        bound = int((_row_dict(c.fetchone()) or {}).get("c") or 0)
        c.execute(
            "SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS s FROM dist_quota_logs WHERE user_id=? AND change_type=?",
            (int(user_id), "invite_rebate"),
        )
        row = _row_dict(c.fetchone()) or {}
        rebate_count = int(row.get("c") or 0)
        rebate_sum = int(row.get("s") or 0)
        conn.close()
    percent = 20
    try:
        from cloud_deploy.cloud_api import dist_ops

        percent = int(float(dist_ops.get_config().get("invite_rebate_percent") or 20))
    except Exception:
        percent = 20
    return {
        "invite_code": code,
        "invite_url": f"{origin}/register?invite={code}" if code else "",
        "total_invites": bound,
        "total_rewards": rebate_sum,
        "invited_count": bound,
        "reward_quota_total": rebate_sum,
        "reward_per_invite": 0,
        "invite_rebate_percent": percent,
        "rebate_count": rebate_count,
    }


def invite_records(user_id: int, *, page: int = 1, per_page: int = 20) -> dict[str, Any]:
    page = max(1, int(page or 1))
    per_page = max(1, min(int(per_page or 20), 100))
    offset = (page - 1) * per_page
    total = 0
    rows: list[dict[str, Any]] = []
    change_type = "invite_rebate"
    if _USE_PG:
        conn = _pg_conn()
        try:
            c = _pg_cur(conn)
            c.execute(
                "SELECT COUNT(*) AS c FROM dist_quota_logs WHERE user_id=%s AND change_type=%s",
                (int(user_id), change_type),
            )
            total = int((_row_dict(c.fetchone()) or {}).get("c") or 0)
            c.execute(
                """SELECT id, amount, after_remaining, remark, created_at
                   FROM dist_quota_logs
                   WHERE user_id=%s AND change_type=%s
                   ORDER BY id DESC LIMIT %s OFFSET %s""",
                (int(user_id), change_type, per_page, offset),
            )
            rows = [_row_dict(r) or {} for r in c.fetchall()]
        finally:
            conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute(
            "SELECT COUNT(*) AS c FROM dist_quota_logs WHERE user_id=? AND change_type=?",
            (int(user_id), change_type),
        )
        total = int((_row_dict(c.fetchone()) or {}).get("c") or 0)
        c.execute(
            """SELECT id, amount, after_remaining, remark, created_at
               FROM dist_quota_logs
               WHERE user_id=? AND change_type=?
               ORDER BY id DESC LIMIT ? OFFSET ?""",
            (int(user_id), change_type, per_page, offset),
        )
        rows = [_row_dict(r) or {} for r in c.fetchall()]
        conn.close()
    records = []
    for r in rows:
        remark = str(r.get("remark") or "")
        records.append(
            {
                "id": r.get("id"),
                "invitee_username": remark,
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
    if status not in ("active", "disabled", "banned", "deleted"):
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


def delete_distributor(user_id: int) -> dict[str, Any]:
    """软删除分销商（不可登录，数据保留）。"""
    dist = ensure_distributor(int(user_id))
    if (dist.get("role") or "") == "super_admin":
        raise ValueError("不能删除超级管理员")
    return set_distributor_status(int(user_id), "deleted")


def merchant_dashboard_trends(user_id: int, *, days: int = 7) -> dict[str, Any]:
    """近 N 日链接生成 / 测题完成趋势（商家工作台）。"""
    from datetime import date, timedelta

    init_dist_tables()
    days = max(1, min(int(days or 7), 30))
    today = date.today()
    start = today - timedelta(days=days - 1)
    labels = [(start + timedelta(days=i)).isoformat() for i in range(days)]
    link_counts = {d: 0 for d in labels}
    test_counts = {d: 0 for d in labels}
    start_s = start.isoformat()
    uid = int(user_id)

    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute(
            """SELECT to_char(created_at, 'YYYY-MM-DD') AS d, COUNT(*) AS n
               FROM dist_links WHERE user_id=%s AND created_at::date >= %s::date
               GROUP BY to_char(created_at, 'YYYY-MM-DD')""",
            (uid, start_s),
        )
        for row in c.fetchall():
            r = _row_dict(row) or {}
            d = str(r.get("d") or "")
            if d in link_counts:
                link_counts[d] = int(r.get("n") or 0)
        c.execute(
            """SELECT to_char(completed_at, 'YYYY-MM-DD') AS d, COUNT(*) AS n
               FROM dist_test_results WHERE user_id=%s AND completed_at::date >= %s::date
               GROUP BY to_char(completed_at, 'YYYY-MM-DD')""",
            (uid, start_s),
        )
        for row in c.fetchall():
            r = _row_dict(row) or {}
            d = str(r.get("d") or "")
            if d in test_counts:
                test_counts[d] = int(r.get("n") or 0)
        conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute(
            """SELECT date(created_at) AS d, COUNT(*) AS n
               FROM dist_links WHERE user_id=? AND date(created_at) >= ?
               GROUP BY date(created_at)""",
            (uid, start_s),
        )
        for row in c.fetchall():
            d = str(row[0] or "")
            if d in link_counts:
                link_counts[d] = int(row[1] or 0)
        c.execute(
            """SELECT date(completed_at) AS d, COUNT(*) AS n
               FROM dist_test_results WHERE user_id=? AND date(completed_at) >= ?
               GROUP BY date(completed_at)""",
            (uid, start_s),
        )
        for row in c.fetchall():
            d = str(row[0] or "")
            if d in test_counts:
                test_counts[d] = int(row[1] or 0)
        conn.close()

    return {
        "days": labels,
        "links_daily": [link_counts.get(d, 0) for d in labels],
        "tests_daily": [test_counts.get(d, 0) for d in labels],
    }


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


def log_payment_notify(
    params: dict[str, Any],
    response_text: str,
    *,
    client_ip: str = "",
    verify_ok: bool | None = None,
) -> None:
    import json

    init_dist_tables()
    order_no = str((params or {}).get("out_trade_no") or "").strip()
    trade_status = str((params or {}).get("trade_status") or "").strip()
    if verify_ok is None:
        verify_ok = response_text == "success" and trade_status.upper() == "TRADE_SUCCESS"
    raw = json.dumps(params or {}, ensure_ascii=False, default=str)
    now = _now()
    if _USE_PG:
        conn = _pg_conn()
        try:
            c = _pg_cur(conn)
            c.execute(
                """INSERT INTO dist_payment_notify_logs
                   (order_no, trade_status, verify_ok, response_text, client_ip, raw_params, created_at)
                   VALUES (%s,%s,%s,%s,%s,%s,NOW())""",
                (order_no, trade_status, bool(verify_ok), str(response_text or ""), client_ip or "", raw),
            )
            conn.commit()
        finally:
            conn.close()
        return
    conn = _sqlite_conn()
    c = conn.cursor()
    c.execute(
        """INSERT INTO dist_payment_notify_logs
           (order_no, trade_status, verify_ok, response_text, client_ip, raw_params, created_at)
           VALUES (?,?,?,?,?,?,?)""",
        (order_no, trade_status, 1 if verify_ok else 0, str(response_text or ""), client_ip or "", raw, now),
    )
    conn.commit()
    conn.close()


def list_payment_notify_logs_page(
    *,
    page: int = 1,
    per_page: int = 20,
    order_no: str | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    init_dist_tables()
    page = max(1, int(page or 1))
    per_page = max(1, min(int(per_page or 20), 100))
    offset = (page - 1) * per_page
    where: list[str] = []
    params: list[Any] = []
    ono = (order_no or "").strip()
    if ono:
        where.append("order_no=%s" if _USE_PG else "order_no=?")
        params.append(ono)
    st = (status or "").strip().lower()
    if st == "success":
        where.append("verify_ok=%s" if _USE_PG else "verify_ok=?")
        params.append(True if _USE_PG else 1)
    elif st == "fail":
        where.append("verify_ok=%s" if _USE_PG else "verify_ok=?")
        params.append(False if _USE_PG else 0)
    wh = (" WHERE " + " AND ".join(where)) if where else ""
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute(f"SELECT COUNT(*) AS c FROM dist_payment_notify_logs{wh}", tuple(params))
        total = int((_row_dict(c.fetchone()) or {}).get("c") or 0)
        c.execute(
            f"""SELECT id, order_no, trade_status, verify_ok, response_text, client_ip, created_at
                FROM dist_payment_notify_logs{wh}
                ORDER BY id DESC LIMIT %s OFFSET %s""",
            tuple(params + [per_page, offset]),
        )
        rows = [_row_dict(r) or {} for r in c.fetchall()]
        conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute(f"SELECT COUNT(*) AS c FROM dist_payment_notify_logs{wh}", tuple(params))
        total = int((_row_dict(c.fetchone()) or {}).get("c") or 0)
        c.execute(
            f"""SELECT id, order_no, trade_status, verify_ok, response_text, client_ip, created_at
                FROM dist_payment_notify_logs{wh}
                ORDER BY id DESC LIMIT ? OFFSET ?""",
            tuple(params + [per_page, offset]),
        )
        rows = [_row_dict(r) or {} for r in c.fetchall()]
        conn.close()
    logs = []
    for r in rows:
        ok = bool(r.get("verify_ok"))
        logs.append(
            {
                "id": r.get("id"),
                "order_no": r.get("order_no") or "",
                "trade_status": r.get("trade_status") or "",
                "status": "success" if ok else "fail",
                "verify_ok": ok,
                "response_text": r.get("response_text") or "",
                "client_ip": r.get("client_ip") or "",
                "created_at": _fmt_ts(r.get("created_at")) or r.get("created_at"),
            }
        )
    return {
        "logs": logs,
        "pagination": {
            "page": page,
            "perPage": per_page,
            "total": total,
            "totalPages": max(1, (total + per_page - 1) // per_page) if total else 0,
        },
    }


def get_payment_notify_log(log_id: int) -> dict[str, Any] | None:
    init_dist_tables()
    lid = int(log_id or 0)
    if lid <= 0:
        return None
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute("SELECT * FROM dist_payment_notify_logs WHERE id=%s", (lid,))
        row = _row_dict(c.fetchone())
        conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute("SELECT * FROM dist_payment_notify_logs WHERE id=?", (lid,))
        row = _row_dict(c.fetchone())
        conn.close()
    if not row:
        return None
    ok = bool(row.get("verify_ok"))
    return {
        **row,
        "status": "success" if ok else "fail",
        "raw_body": row.get("raw_params") or "",
        "created_at": _fmt_ts(row.get("created_at")) or row.get("created_at"),
    }


def get_operation_log(log_id: int) -> dict[str, Any] | None:
    init_dist_tables()
    lid = int(log_id or 0)
    if lid <= 0:
        return None
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute("SELECT * FROM dist_operation_logs WHERE id=%s", (lid,))
        row = _row_dict(c.fetchone())
        conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute("SELECT * FROM dist_operation_logs WHERE id=?", (lid,))
        row = _row_dict(c.fetchone())
        conn.close()
    if not row:
        return None
    row["created_at"] = _fmt_ts(row.get("created_at")) or row.get("created_at")
    return row


def list_payment_notify_logs_export(
    *,
    limit: int = 5000,
    order_no: str | None = None,
    status: str | None = None,
) -> list[dict[str, Any]]:
    init_dist_tables()
    limit = max(1, min(int(limit or 5000), 10000))
    where: list[str] = []
    params: list[Any] = []
    ono = (order_no or "").strip()
    if ono:
        where.append("order_no=%s" if _USE_PG else "order_no=?")
        params.append(ono)
    st = (status or "").strip().lower()
    if st == "success":
        where.append("verify_ok=%s" if _USE_PG else "verify_ok=?")
        params.append(True if _USE_PG else 1)
    elif st == "fail":
        where.append("verify_ok=%s" if _USE_PG else "verify_ok=?")
        params.append(False if _USE_PG else 0)
    wh = (" WHERE " + " AND ".join(where)) if where else ""
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute(
            f"""SELECT id, order_no, trade_status, verify_ok, response_text, client_ip, created_at
                FROM dist_payment_notify_logs{wh}
                ORDER BY id DESC LIMIT %s""",
            tuple(params + [limit]),
        )
        rows = [_row_dict(r) or {} for r in c.fetchall()]
        conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute(
            f"""SELECT id, order_no, trade_status, verify_ok, response_text, client_ip, created_at
                FROM dist_payment_notify_logs{wh}
                ORDER BY id DESC LIMIT ?""",
            tuple(params + [limit]),
        )
        rows = [_row_dict(r) or {} for r in c.fetchall()]
        conn.close()
    out = []
    for r in rows:
        ok = bool(r.get("verify_ok"))
        out.append(
            {
                "id": r.get("id"),
                "order_no": r.get("order_no") or "",
                "trade_status": r.get("trade_status") or "",
                "status": "success" if ok else "fail",
                "response_text": r.get("response_text") or "",
                "client_ip": r.get("client_ip") or "",
                "created_at": _fmt_ts(r.get("created_at")) or r.get("created_at"),
            }
        )
    return out


def list_operation_logs_export(limit: int = 5000) -> list[dict[str, Any]]:
    init_dist_tables()
    limit = max(1, min(int(limit or 5000), 10000))
    if _USE_PG:
        conn = _pg_conn()
        c = _pg_cur(conn)
        c.execute("SELECT * FROM dist_operation_logs ORDER BY id DESC LIMIT %s", (limit,))
        rows = [_row_dict(r) or {} for r in c.fetchall()]
        conn.close()
    else:
        conn = _sqlite_conn()
        c = conn.cursor()
        c.execute("SELECT * FROM dist_operation_logs ORDER BY id DESC LIMIT ?", (limit,))
        rows = [_row_dict(r) or {} for r in c.fetchall()]
        conn.close()
    for r in rows:
        r["created_at"] = _fmt_ts(r.get("created_at")) or r.get("created_at")
    return rows

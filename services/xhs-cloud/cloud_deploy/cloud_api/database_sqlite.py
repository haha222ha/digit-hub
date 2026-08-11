# -*- coding: utf-8 -*-
"""SQLite 业务库（未配置 PG 时使用）。"""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta

from cloud_deploy.cloud_api.config import get_settings


def _conn():
    s = get_settings()
    os.makedirs(os.path.dirname(s.xhs_cloud_api_db), exist_ok=True)
    conn = sqlite3.connect(s.xhs_cloud_api_db, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db() -> None:
    conn = _conn()
    c = conn.cursor()
    c.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS memberships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            plan_code TEXT DEFAULT 'monthly',
            activated_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS auth_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            plan_code TEXT NOT NULL DEFAULT 'monthly',
            duration_days INTEGER NOT NULL DEFAULT 30,
            max_activations INTEGER NOT NULL DEFAULT 1,
            current_activations INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'unused',
            note TEXT,
            created_at TEXT NOT NULL,
            expires_at TEXT
        );
        CREATE TABLE IF NOT EXISTS auth_code_activations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            auth_code_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            activated_at TEXT NOT NULL,
            UNIQUE(auth_code_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS report_archives (
            report_date TEXT NOT NULL,
            archive_type TEXT NOT NULL,
            storage_path TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_size_bytes INTEGER,
            sha256 TEXT,
            row_count INTEGER,
            meta_json TEXT,
            status TEXT DEFAULT 'published',
            published_at TEXT,
            PRIMARY KEY (report_date, archive_type)
        );
        CREATE TABLE IF NOT EXISTS report_download_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            report_date TEXT,
            archive_type TEXT,
            downloaded_at TEXT NOT NULL,
            ip TEXT
        );
        CREATE TABLE IF NOT EXISTS member_watchlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            goods_id TEXT NOT NULL,
            title TEXT,
            store_name TEXT,
            source TEXT,
            meta_json TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(user_id, goods_id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS member_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT,
            category TEXT NOT NULL DEFAULT 'suggestion',
            content TEXT NOT NULL,
            contact TEXT,
            app_version TEXT,
            machine_id TEXT,
            client_ip TEXT,
            status TEXT NOT NULL DEFAULT 'new',
            admin_note TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS member_keyword_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT,
            keywords TEXT NOT NULL,
            note TEXT,
            app_version TEXT,
            machine_id TEXT,
            client_ip TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            admin_note TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS user_addon_credits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            addon_type TEXT NOT NULL DEFAULT 'custom_analysis',
            credits INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL,
            UNIQUE(user_id, addon_type)
        );
        CREATE TABLE IF NOT EXISTS user_addon_credit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            addon_type TEXT NOT NULL,
            delta INTEGER NOT NULL,
            balance_after INTEGER NOT NULL,
            source TEXT,
            ref_id TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS payment_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_no TEXT UNIQUE NOT NULL,
            user_id INTEGER,
            plan_code TEXT NOT NULL,
            duration_days INTEGER NOT NULL,
            amount TEXT NOT NULL,
            channel TEXT NOT NULL DEFAULT 'wxpay',
            status TEXT NOT NULL DEFAULT 'pending',
            qrcode TEXT,
            payurl TEXT,
            gateway_trade_no TEXT,
            auth_code TEXT,
            client_ip TEXT,
            fulfilled_user_id INTEGER,
            meta_json TEXT,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            paid_at TEXT
        );
        """
    )
    _migrate_legacy_columns(c)
    conn.commit()
    conn.close()


def _migrate_legacy_columns(c) -> None:
    c.execute("PRAGMA table_info(report_archives)")
    cols = {row[1] for row in c.fetchall()}
    if "status" not in cols:
        c.execute("ALTER TABLE report_archives ADD COLUMN status TEXT DEFAULT 'published'")
    if "published_at" not in cols:
        c.execute("ALTER TABLE report_archives ADD COLUMN published_at TEXT")
    c.execute("PRAGMA table_info(users)")
    user_cols = {row[1] for row in c.fetchall()}
    for dtype in ("pc", "web"):
        if f"{dtype}_device_id" not in user_cols:
            c.execute(f"ALTER TABLE users ADD COLUMN {dtype}_device_id TEXT")
        if f"{dtype}_session_version" not in user_cols:
            c.execute(f"ALTER TABLE users ADD COLUMN {dtype}_session_version INTEGER NOT NULL DEFAULT 0")
        if f"{dtype}_device_label" not in user_cols:
            c.execute(f"ALTER TABLE users ADD COLUMN {dtype}_device_label TEXT")
        if f"{dtype}_bound_at" not in user_cols:
            c.execute(f"ALTER TABLE users ADD COLUMN {dtype}_bound_at TEXT")
    # 旧版单槽字段（保留兼容，新逻辑不再写入）
    if "session_device_id" not in user_cols:
        c.execute("ALTER TABLE users ADD COLUMN session_device_id TEXT")
    if "session_version" not in user_cols:
        c.execute("ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0")
    if "session_device_label" not in user_cols:
        c.execute("ALTER TABLE users ADD COLUMN session_device_label TEXT")
    if "session_bound_at" not in user_cols:
        c.execute("ALTER TABLE users ADD COLUMN session_bound_at TEXT")
    if "email" not in user_cols:
        c.execute("ALTER TABLE users ADD COLUMN email TEXT")
    c.execute(
        """CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            used_at TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )"""
    )
    c.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL AND email != ''"
    )
    c.execute("CREATE INDEX IF NOT EXISTS idx_prt_hash ON password_reset_tokens(token_hash)")
    _migrate_legacy_single_session(c)


def _migrate_legacy_single_session(c) -> None:
    """将旧版单设备 session 迁移到 pc/web 分槽（仅当分槽为空时）。"""
    c.execute(
        """SELECT id, session_device_id, session_version, session_device_label, session_bound_at
           FROM users
           WHERE session_device_id IS NOT NULL AND TRIM(session_device_id) != ''"""
    )
    rows = c.fetchall()
    for row in rows:
        did = str(row["session_device_id"] or "").strip()
        if ":" not in did:
            continue
        dtype = did.split(":", 1)[0].lower()
        if dtype not in ("pc", "web"):
            continue
        c.execute(
            f"""SELECT {dtype}_device_id, {dtype}_session_version FROM users WHERE id=?""",
            (row["id"],),
        )
        slot = c.fetchone()
        if slot and (slot[f"{dtype}_device_id"] or slot[f"{dtype}_session_version"]):
            continue
        c.execute(
            f"""UPDATE users SET {dtype}_device_id=?, {dtype}_session_version=?,
                   {dtype}_device_label=?, {dtype}_bound_at=?
               WHERE id=?""",
            (
                did,
                int(row["session_version"] or 0),
                row["session_device_label"] or "",
                row["session_bound_at"] or "",
                row["id"],
            ),
        )


def normalize_device_id(device_id: str, device_type: str = "") -> str:
    raw = (device_id or "").strip()
    if not raw:
        return ""
    if ":" in raw:
        prefix, rest = raw.split(":", 1)
        return f"{prefix.strip().lower()}:{rest.strip().upper()}"
    dt = (device_type or "unknown").strip().lower()
    return f"{dt}:{raw.upper()}"


_DEVICE_SLOTS = frozenset({"pc", "web"})


def _parse_device_slot(device_id: str) -> tuple[str, str]:
    did = normalize_device_id(device_id)
    parts = did.split(":", 1)
    if len(parts) != 2 or parts[0] not in _DEVICE_SLOTS or len(parts[1]) < 8:
        raise ValueError("device_id 无效")
    return parts[0], did


def get_member_session(user_id: int) -> dict | None:
    conn = _conn()
    c = conn.cursor()
    c.execute(
        """SELECT pc_device_id, pc_session_version, pc_device_label, pc_bound_at,
                  web_device_id, web_session_version, web_device_label, web_bound_at
           FROM users WHERE id=?""",
        (user_id,),
    )
    row = c.fetchone()
    conn.close()
    if not row:
        return None

    def _slot(prefix: str) -> dict:
        return {
            "device_id": row[f"{prefix}_device_id"] or "",
            "session_version": int(row[f"{prefix}_session_version"] or 0),
            "device_label": row[f"{prefix}_device_label"] or "",
            "bound_at": row[f"{prefix}_bound_at"] or "",
        }

    return {"pc": _slot("pc"), "web": _slot("web")}


def get_member_session_slot(user_id: int, device_type: str) -> dict | None:
    sessions = get_member_session(user_id)
    if not sessions:
        return None
    return sessions.get(device_type)


def bind_member_session(user_id: int, device_id: str, device_label: str = "") -> int:
    dtype, did = _parse_device_slot(device_id)
    current = get_member_session_slot(user_id, dtype) or {}
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    label = (device_label or "").strip()[:64]
    if current.get("device_id") == did and int(current.get("session_version") or 0) > 0:
        conn = _conn()
        c = conn.cursor()
        c.execute(
            f"UPDATE users SET {dtype}_device_label=?, {dtype}_bound_at=? WHERE id=?",
            (label or current.get("device_label"), now, user_id),
        )
        conn.commit()
        conn.close()
        return int(current["session_version"])
    new_sv = int(current.get("session_version") or 0) + 1
    conn = _conn()
    c = conn.cursor()
    c.execute(
        f"""UPDATE users SET {dtype}_device_id=?, {dtype}_session_version=?,
               {dtype}_device_label=?, {dtype}_bound_at=?
           WHERE id=?""",
        (did, new_sv, label, now, user_id),
    )
    conn.commit()
    conn.close()
    return new_sv


def verify_member_session(user_id: int, device_id: str, session_version: int) -> bool:
    try:
        dtype, did = _parse_device_slot(device_id)
    except ValueError:
        return False
    if session_version <= 0:
        return False
    current = get_member_session_slot(user_id, dtype)
    if not current or not current.get("device_id"):
        return False
    return (
        current["device_id"] == did
        and int(current["session_version"]) == int(session_version)
    )


def _hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.sha256(f"{salt}:{password}".encode()).hexdigest()
    return f"{salt}${digest}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    return _hash_password(password, salt).split("$", 1)[1] == digest


def ensure_admin() -> None:
    s = get_settings()
    conn = _conn()
    c = conn.cursor()
    c.execute("SELECT id FROM users WHERE username=?", (s.xhs_cloud_admin_user,))
    row = c.fetchone()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if not row:
        c.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)",
            (s.xhs_cloud_admin_user, _hash_password(s.xhs_cloud_admin_pass), now),
        )
        uid = c.lastrowid
        exp = (datetime.now() + timedelta(days=3650)).strftime("%Y-%m-%d %H:%M:%S")
        c.execute(
            """INSERT INTO memberships (user_id, plan_code, activated_at, expires_at, status)
               VALUES (?,?,?,?,?)""",
            (uid, "admin", now, exp, "active"),
        )
        conn.commit()
    conn.close()


def get_active_member(user_id: int) -> dict | None:
    conn = _conn()
    c = conn.cursor()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    c.execute(
        """SELECT u.id, u.username, u.email, m.expires_at, m.status, m.plan_code
           FROM users u JOIN memberships m ON m.user_id=u.id
           WHERE u.id=? AND m.status='active' AND m.expires_at > ?
           ORDER BY m.expires_at DESC LIMIT 1""",
        (user_id, now),
    )
    row = c.fetchone()
    conn.close()
    if not row:
        return None
    exp = datetime.strptime(row["expires_at"], "%Y-%m-%d %H:%M:%S")
    return {
        "id": row["id"],
        "username": row["username"],
        "email": (row["email"] or "").strip() if row["email"] else "",
        "expires_at": row["expires_at"],
        "plan_code": row["plan_code"] or "monthly",
        "days_remaining": max(0, (exp - datetime.now()).days),
    }


def authenticate_user(username: str, password: str) -> dict | None:
    conn = _conn()
    c = conn.cursor()
    c.execute("SELECT id, username, password_hash FROM users WHERE username=?", (username,))
    u = c.fetchone()
    conn.close()
    if not u or not _verify_password(password, u["password_hash"]):
        return None
    return {"id": u["id"], "username": u["username"]}


def authenticate(username: str, password: str) -> dict | None:
    conn = _conn()
    c = conn.cursor()
    c.execute("SELECT id, username, password_hash FROM users WHERE username=?", (username,))
    u = c.fetchone()
    if not u or not _verify_password(password, u["password_hash"]):
        conn.close()
        return None
    c.execute(
        "SELECT status, expires_at FROM memberships WHERE user_id=? ORDER BY id DESC LIMIT 1",
        (u["id"],),
    )
    m = c.fetchone()
    conn.close()
    if not m or m["status"] != "active":
        return None
    if m["expires_at"] < datetime.now().strftime("%Y-%m-%d %H:%M:%S"):
        return None
    return {"id": u["id"], "username": u["username"], "expires_at": m["expires_at"]}


def archive_display_label(
    report_date: str, archive_type: str = "member_daily_zip", file_name: str = ""
) -> str:
    date = str(report_date)[:10]
    mmdd = date.replace("-", "")[4:]
    if file_name:
        base = file_name.rsplit(".", 1)[0]
        if base.startswith(("全量", "周报", "月报")):
            return base
    if archive_type == "member_weekly_zip":
        return f"周报{mmdd}"
    if archive_type == "member_monthly_zip":
        return f"月报{date[:7].replace('-', '')}"
    if archive_type == "member_custom_zip":
        if file_name:
            return file_name.rsplit(".", 1)[0]
        return f"定制{mmdd}"
    return f"全量{mmdd}"


def list_archives(archive_type: str = "member_daily_zip") -> list[dict]:
    conn = _conn()
    c = conn.cursor()
    c.execute(
        """SELECT report_date, archive_type, file_name, file_size_bytes, row_count,
                  meta_json, published_at, status
           FROM report_archives
           WHERE archive_type=? AND status='published'
           ORDER BY report_date DESC""",
        (archive_type,),
    )
    rows = []
    for r in c.fetchall():
        meta = {}
        try:
            meta = json.loads(r["meta_json"] or "{}")
        except Exception:
            pass
        summary = meta.get("filter_label") or meta.get("set_label") or meta.get("title")
        if not summary:
            summary = archive_display_label(
                r["report_date"], r["archive_type"], r["file_name"] or ""
            )
        rows.append(
            {
                "report_date": r["report_date"],
                "archive_type": r["archive_type"],
                "file_name": r["file_name"],
                "file_size_bytes": r["file_size_bytes"],
                "row_count": r["row_count"],
                "summary": summary,
                "published_at": r["published_at"],
            }
        )
    conn.close()
    return rows


def get_archive_path(report_date: str, archive_type: str = "member_daily_zip") -> str | None:
    conn = _conn()
    c = conn.cursor()
    c.execute(
        """SELECT storage_path FROM report_archives
           WHERE report_date=? AND archive_type=? AND status='published'""",
        (report_date, archive_type),
    )
    r = c.fetchone()
    conn.close()
    return r["storage_path"] if r else None


def log_download(user_id: int, report_date: str, archive_type: str, ip: str) -> None:
    conn = _conn()
    conn.execute(
        """INSERT INTO report_download_logs (user_id, report_date, archive_type, downloaded_at, ip)
           VALUES (?,?,?,?,?)""",
        (user_id, report_date, archive_type, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), ip),
    )
    conn.commit()
    conn.close()


def upsert_report_archive(
    report_date: str,
    archive_type: str,
    storage_path: str,
    file_name: str,
    file_size: int,
    sha256: str,
    row_count: int,
    meta: dict,
) -> None:
    conn = _conn()
    c = conn.cursor()
    c.execute(
        """INSERT INTO report_archives (
               report_date, archive_type, storage_path, file_name,
               file_size_bytes, sha256, row_count, meta_json, status, published_at
           ) VALUES (?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(report_date, archive_type) DO UPDATE SET
               storage_path=excluded.storage_path,
               file_name=excluded.file_name,
               file_size_bytes=excluded.file_size_bytes,
               sha256=excluded.sha256,
               row_count=excluded.row_count,
               meta_json=excluded.meta_json,
               published_at=excluded.published_at""",
        (
            report_date,
            archive_type,
            storage_path,
            file_name,
            file_size,
            sha256,
            row_count,
            json.dumps(meta, ensure_ascii=False),
            "published",
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        ),
    )
    conn.commit()
    conn.close()


PLAN_LABELS = {
    "weekly": "周会员",
    "monthly": "月度会员",
    "quarterly": "季度会员",
    "halfyear": "半年会员",
    "yearly": "年度会员",
    "pay_test": "支付测试",
    "experience": "体验会员",
    "admin": "管理员",
}


def _parse_entitlements_from_note(note: str | None) -> dict | None:
    if not note:
        return None
    text = str(note).strip()
    if not text.startswith("{"):
        return None
    try:
        import json
        data = json.loads(text)
        if isinstance(data, dict):
            return data.get("entitlements") if isinstance(data.get("entitlements"), dict) else data
    except Exception:
        return None
    return None


def get_member_entitlements(user_id: int) -> dict | None:
    conn = _conn()
    c = conn.cursor()
    c.execute(
        """
        SELECT ac.plan_code, ac.note
        FROM auth_code_activations aca
        JOIN auth_codes ac ON ac.id = aca.auth_code_id
        WHERE aca.user_id=?
        ORDER BY aca.activated_at DESC
        """,
        (user_id,),
    )
    rows = c.fetchall()
    conn.close()
    for plan_code, note in rows:
        ent = _parse_entitlements_from_note(note)
        if ent:
            ent = dict(ent)
            ent.setdefault("plan_code", plan_code)
            return ent
        if str(plan_code or "") == "experience":
            return {"plan_code": "experience", "pc_full": True, "report_download_limited": True}
    return None


def filter_report_library_by_entitlements(library: dict, entitlements: dict | None) -> dict:
    if not library or not entitlements:
        return library
    allowed_dates = entitlements.get("allowed_report_dates") or entitlements.get("report_dates") or []
    allowed_types = entitlements.get("allowed_archive_types") or entitlements.get("archive_types") or []
    if not allowed_dates and not entitlements.get("report_download_limited"):
        return library
    allowed_dates = {str(x).strip() for x in allowed_dates if str(x).strip()}
    allowed_types = {str(x).strip() for x in allowed_types if str(x).strip()}
    archive_map = {
        "daily": "member_daily_zip",
        "weekly": "member_weekly_zip",
        "monthly": "member_monthly_zip",
        "custom": "member_custom_zip",
    }
    out = dict(library)
    total = 0
    for key in ("daily", "weekly", "monthly", "custom"):
        rows = list(out.get(key) or [])
        if allowed_types:
            atype = archive_map.get(key)
            if atype and atype not in allowed_types:
                rows = []
        if allowed_dates:
            rows = [
                r for r in rows
                if str(r.get("report_date") or r.get("date") or "")[:10] in allowed_dates
            ]
        out[key] = rows
        total += len(rows)
    out["total_count"] = total
    out["entitlements_applied"] = True
    return out


def member_can_download_report(user_id: int, report_date: str, archive_type: str) -> bool:
    ent = get_member_entitlements(user_id)
    if not ent:
        return True
    allowed_dates = ent.get("allowed_report_dates") or ent.get("report_dates") or []
    allowed_types = ent.get("allowed_archive_types") or ent.get("archive_types") or []
    if not allowed_dates and not allowed_types and not ent.get("report_download_limited"):
        return True
    day = str(report_date or "")[:10]
    if allowed_dates and day not in {str(x).strip()[:10] for x in allowed_dates}:
        return False
    if allowed_types and archive_type not in {str(x).strip() for x in allowed_types}:
        return False
    return True


def _normalize_code(code: str) -> str:
    return code.strip().upper().replace(" ", "").replace("-", "")


def _gen_auth_code() -> str:
    return f"XHS-{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}"


def generate_auth_codes(
    count: int = 1,
    plan_code: str = "monthly",
    duration_days: int = 30,
    max_activations: int = 1,
    note: str = "",
) -> list[str]:
    conn = _conn()
    c = conn.cursor()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    codes = []
    for _ in range(max(1, count)):
        code = _gen_auth_code()
        c.execute(
            """INSERT INTO auth_codes
               (code, plan_code, duration_days, max_activations, note, created_at)
               VALUES (?,?,?,?,?,?)""",
            (code, plan_code, duration_days, max_activations, note or None, now),
        )
        codes.append(code)
    conn.commit()
    conn.close()
    return codes


def list_auth_codes(limit: int = 100, status: str | None = None) -> list[dict]:
    conn = _conn()
    c = conn.cursor()
    sql = (
        """SELECT ac.id, ac.code, ac.plan_code, ac.duration_days, ac.max_activations,
                  ac.current_activations, ac.status, ac.note, ac.created_at, ac.expires_at,
                  act.first_activated_at,
                  act.activated_usernames,
                  mem.membership_expires_at
           FROM auth_codes ac
           LEFT JOIN (
               SELECT aca.auth_code_id,
                      MIN(aca.activated_at) AS first_activated_at,
                      GROUP_CONCAT(u.username, ', ') AS activated_usernames
               FROM auth_code_activations aca
               JOIN users u ON u.id = aca.user_id
               GROUP BY aca.auth_code_id
           ) act ON act.auth_code_id = ac.id
           LEFT JOIN (
               SELECT aca.auth_code_id,
                      MAX(m.expires_at) AS membership_expires_at
               FROM auth_code_activations aca
               JOIN memberships m ON m.user_id = aca.user_id
               GROUP BY aca.auth_code_id
           ) mem ON mem.auth_code_id = ac.id"""
    )
    params: list = []
    if status:
        sql += " WHERE ac.status = ?"
        params.append(status)
    sql += " ORDER BY ac.id DESC LIMIT ?"
    params.append(limit)
    c.execute(sql, params)
    rows = []
    now = datetime.now()
    for r in c.fetchall():
        membership_expires = r["membership_expires_at"] or ""
        days_remaining = None
        if membership_expires:
            try:
                exp_dt = datetime.fromisoformat(membership_expires.replace("Z", "+00:00"))
                if exp_dt.tzinfo:
                    exp_dt = exp_dt.replace(tzinfo=None)
                days_remaining = max(0, (exp_dt - now).days)
            except ValueError:
                days_remaining = None
        rows.append(
            {
                "id": r["id"],
                "code": r["code"],
                "plan_code": r["plan_code"],
                "plan_label": PLAN_LABELS.get(r["plan_code"], r["plan_code"]),
                "duration_days": r["duration_days"],
                "max_activations": r["max_activations"],
                "current_activations": r["current_activations"],
                "status": r["status"],
                "note": r["note"] or "",
                "created_at": r["created_at"] or "",
                "expires_at": r["expires_at"] or "",
                "first_activated_at": r["first_activated_at"] or "",
                "activated_usernames": r["activated_usernames"] or "",
                "membership_expires_at": membership_expires,
                "days_remaining": days_remaining,
            }
        )
    conn.close()
    return rows


def revoke_auth_code(code: str) -> dict:
    conn = _conn()
    c = conn.cursor()
    norm = _normalize_code(code)
    c.execute(
        """SELECT id, code, status FROM auth_codes
           WHERE REPLACE(REPLACE(UPPER(code), '-', ''), ' ', '') = ?""",
        (norm,),
    )
    row = c.fetchone()
    if not row:
        conn.close()
        raise ValueError("授权码不存在")
    if row["status"] == "revoked":
        conn.close()
        raise ValueError("授权码已被吊销")
    c.execute("UPDATE auth_codes SET status='revoked' WHERE id=?", (row["id"],))
    conn.commit()
    conn.close()
    return {"code": row["code"], "status": "revoked"}


def get_admin_stats() -> dict:
    conn = _conn()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM users")
    total_members = int(c.fetchone()[0])
    c.execute(
        """SELECT COUNT(DISTINCT u.id)
           FROM users u
           JOIN memberships m ON m.user_id = u.id
           WHERE m.expires_at > datetime('now')"""
    )
    active_members = int(c.fetchone()[0])
    c.execute("SELECT status, COUNT(*) FROM auth_codes GROUP BY status")
    code_by_status = {r[0]: int(r[1]) for r in c.fetchall()}
    c.execute(
        """SELECT report_date, file_name
           FROM report_archives
           WHERE archive_type = 'member_daily_zip' AND status = 'published'
           ORDER BY report_date DESC LIMIT 1"""
    )
    latest = c.fetchone()
    c.execute(
        """SELECT COUNT(*) FROM report_archives
           WHERE archive_type = 'member_daily_zip' AND status = 'published'"""
    )
    archive_count = int(c.fetchone()[0])
    conn.close()
    return {
        "total_members": total_members,
        "active_members": active_members,
        "auth_codes_unused": code_by_status.get("unused", 0),
        "auth_codes_active": code_by_status.get("active", 0),
        "auth_codes_revoked": code_by_status.get("revoked", 0),
        "auth_codes_total": sum(code_by_status.values()),
        "latest_report_date": latest[0] if latest else None,
        "latest_report_file": latest[1] if latest else None,
        "archive_count": archive_count,
    }


def _fetch_auth_code(c, code: str):
    norm = _normalize_code(code)
    c.execute("SELECT * FROM auth_codes")
    for r in c.fetchall():
        if _normalize_code(r["code"]) == norm:
            return r
    return None


def _validate_auth_code_row(row) -> dict:
    if not row:
        raise ValueError("授权码不存在")
    if row["status"] == "revoked":
        raise ValueError("授权码已被吊销")
    if row["current_activations"] >= row["max_activations"]:
        raise ValueError("授权码已达最大激活次数")
    if row["expires_at"] and row["expires_at"] < datetime.now().strftime("%Y-%m-%d %H:%M:%S"):
        raise ValueError("授权码已过期")
    return row


def _extend_membership(c, user_id: int, plan_code: str, duration_days: int) -> dict:
    now = datetime.now()
    c.execute(
        "SELECT expires_at FROM memberships WHERE user_id=? AND status='active' ORDER BY expires_at DESC LIMIT 1",
        (user_id,),
    )
    row = c.fetchone()
    base = now
    previous_days = 0
    stacked = False
    if row and row["expires_at"] > now.strftime("%Y-%m-%d %H:%M:%S"):
        base = datetime.strptime(row["expires_at"], "%Y-%m-%d %H:%M:%S")
        previous_days = max(0, (base - now).days)
        stacked = True
    expires = (base + timedelta(days=duration_days)).strftime("%Y-%m-%d %H:%M:%S")
    c.execute(
        """INSERT INTO memberships (user_id, plan_code, activated_at, expires_at, status)
           VALUES (?,?,?,?,?)""",
        (user_id, plan_code, now.strftime("%Y-%m-%d %H:%M:%S"), expires, "active"),
    )
    return {
        "expires_at": expires,
        "stacked": stacked,
        "previous_days_remaining": previous_days,
        "days_added": int(duration_days),
    }


def register_with_auth_code(username: str, password: str, code: str) -> dict:
    username = (username or "").strip()
    if len(username) < 3:
        raise ValueError("用户名至少 3 个字符")
    if len(password or "") < 6:
        raise ValueError("密码至少 6 位")
    conn = _conn()
    c = conn.cursor()
    c.execute("SELECT id FROM users WHERE username=?", (username,))
    if c.fetchone():
        conn.close()
        raise ValueError("用户名已存在，请切换到「授权码续费」或使用登录后在会员中心续费")
    row = _validate_auth_code_row(_fetch_auth_code(c, code))
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    c.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)",
        (username, _hash_password(password), now),
    )
    uid = c.lastrowid
    from cloud_deploy.cloud_api.payment_plans import is_addon_plan

    if is_addon_plan(row["plan_code"]):
        expires = ""
    else:
        extend_info = _extend_membership(c, uid, row["plan_code"], row["duration_days"])
        expires = extend_info["expires_at"]
    c.execute(
        "INSERT INTO auth_code_activations (auth_code_id, user_id, activated_at) VALUES (?,?,?)",
        (row["id"], uid, now),
    )
    c.execute(
        "UPDATE auth_codes SET current_activations=current_activations+1, status='active' WHERE id=?",
        (row["id"],),
    )
    conn.commit()
    conn.close()
    return get_member_profile(uid) or {
        "id": uid,
        "username": username,
        "expires_at": expires,
        "plan_code": row["plan_code"],
        "is_active": bool(expires),
    }


def login_with_auth_code(code: str) -> dict:
    code = (code or "").strip()
    if len(code) < 8:
        raise ValueError("授权码格式不正确")
    conn = _conn()
    c = conn.cursor()
    row = _fetch_auth_code(c, code)
    if not row:
        conn.close()
        raise ValueError("授权码不存在")
    c.execute(
        """SELECT u.id, u.username
           FROM auth_code_activations aca
           JOIN users u ON u.id = aca.user_id
           WHERE aca.auth_code_id=?
           ORDER BY aca.activated_at DESC, aca.id DESC
           LIMIT 1""",
        (row["id"],),
    )
    user = c.fetchone()
    conn.close()
    if user:
        profile = get_member_profile(user["id"])
        if not profile:
            raise ValueError("账号数据异常，请联系管理员")
        return profile
    _validate_auth_code_row(row)
    raise ValueError("授权码尚未开通，请购买会员完成首次开通")


def change_password(user_id: int, new_password: str, current_password: str | None = None) -> None:
    if len(new_password or "") < 6:
        raise ValueError("新密码至少 6 位")
    conn = _conn()
    c = conn.cursor()
    c.execute("SELECT password_hash FROM users WHERE id=?", (user_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        raise ValueError("用户不存在")
    if current_password:
        if not _verify_password(current_password, row["password_hash"]):
            conn.close()
            raise ValueError("当前密码不正确")
    c.execute(
        "UPDATE users SET password_hash=? WHERE id=?",
        (_hash_password(new_password), user_id),
    )
    conn.commit()
    conn.close()


def renew_with_auth_code(user_id: int, code: str) -> dict:
    conn = _conn()
    c = conn.cursor()
    row = _validate_auth_code_row(_fetch_auth_code(c, code))
    c.execute(
        "SELECT 1 FROM auth_code_activations WHERE auth_code_id=? AND user_id=?",
        (row["id"], user_id),
    )
    if c.fetchone():
        conn.close()
        raise ValueError("您已使用过此授权码")
    from cloud_deploy.cloud_api.payment_plans import is_addon_plan

    if is_addon_plan(row["plan_code"]):
        extend_info = {"stacked": False, "previous_days_remaining": 0, "days_added": 0, "expires_at": ""}
    else:
        extend_info = _extend_membership(c, user_id, row["plan_code"], row["duration_days"])
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    c.execute(
        "INSERT INTO auth_code_activations (auth_code_id, user_id, activated_at) VALUES (?,?,?)",
        (row["id"], user_id, now),
    )
    c.execute(
        "UPDATE auth_codes SET current_activations=current_activations+1, status='active' WHERE id=?",
        (row["id"],),
    )
    conn.commit()
    conn.close()
    profile = get_member_profile(user_id) or {}
    profile["renew_stack"] = {
        "stacked": extend_info["stacked"],
        "previous_days_remaining": extend_info["previous_days_remaining"],
        "days_added": extend_info["days_added"],
        "expires_at": extend_info["expires_at"],
    }
    return profile


def get_addon_credits(user_id: int, addon_type: str = "custom_analysis") -> int:
    addon_type = (addon_type or "custom_analysis").strip() or "custom_analysis"
    conn = _conn()
    c = conn.cursor()
    c.execute(
        "SELECT credits FROM user_addon_credits WHERE user_id=? AND addon_type=?",
        (user_id, addon_type),
    )
    row = c.fetchone()
    conn.close()
    return int(row[0]) if row else 0


def add_addon_credits(
    user_id: int,
    addon_type: str,
    amount: int,
    *,
    source: str = "",
    ref_id: str = "",
) -> int:
    addon_type = (addon_type or "custom_analysis").strip() or "custom_analysis"
    delta = int(amount or 0)
    if delta <= 0:
        return get_addon_credits(user_id, addon_type)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = _conn()
    c = conn.cursor()
    c.execute(
        "SELECT credits FROM user_addon_credits WHERE user_id=? AND addon_type=?",
        (user_id, addon_type),
    )
    row = c.fetchone()
    if row:
        balance = int(row[0]) + delta
        c.execute(
            "UPDATE user_addon_credits SET credits=?, updated_at=? WHERE user_id=? AND addon_type=?",
            (balance, now, user_id, addon_type),
        )
    else:
        balance = delta
        c.execute(
            "INSERT INTO user_addon_credits (user_id, addon_type, credits, updated_at) VALUES (?,?,?,?)",
            (user_id, addon_type, balance, now),
        )
    c.execute(
        """INSERT INTO user_addon_credit_log
           (user_id, addon_type, delta, balance_after, source, ref_id, created_at)
           VALUES (?,?,?,?,?,?,?)""",
        (user_id, addon_type, delta, balance, (source or "")[:255], (ref_id or "")[:64], now),
    )
    conn.commit()
    conn.close()
    return balance


def consume_addon_credit(user_id: int, addon_type: str = "custom_analysis") -> bool:
    addon_type = (addon_type or "custom_analysis").strip() or "custom_analysis"
    conn = _conn()
    c = conn.cursor()
    c.execute(
        "SELECT credits FROM user_addon_credits WHERE user_id=? AND addon_type=? AND credits > 0",
        (user_id, addon_type),
    )
    row = c.fetchone()
    if not row:
        conn.close()
        return False
    balance = int(row[0]) - 1
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    c.execute(
        "UPDATE user_addon_credits SET credits=?, updated_at=? WHERE user_id=? AND addon_type=?",
        (balance, now, user_id, addon_type),
    )
    c.execute(
        """INSERT INTO user_addon_credit_log
           (user_id, addon_type, delta, balance_after, source, ref_id, created_at)
           VALUES (?,?,?,?,?,?,?)""",
        (user_id, addon_type, -1, balance, "consume", "", now),
    )
    conn.commit()
    conn.close()
    return True


def fulfill_addon_order(user_id: int, code: str, plan_code: str) -> dict:
    from cloud_deploy.cloud_api.payment_plans import PLAN_BY_CODE

    profile = renew_with_auth_code(user_id, code)
    plan = PLAN_BY_CODE.get(str(plan_code or "").strip()) or {}
    tpl = plan.get("entitlements_template") or {}
    addon = str(tpl.get("addon") or "custom_analysis")
    credit = int(tpl.get("custom_analysis_credit") or 0)
    if credit > 0:
        balance = add_addon_credits(user_id, addon, credit, source="addon_order", ref_id=code)
        profile["custom_analysis_credits"] = balance
    else:
        profile["custom_analysis_credits"] = get_addon_credits(user_id, addon)
    return profile


def renew_with_credentials(username: str, password: str, code: str) -> dict:
    user = authenticate_user(username, password)
    if not user:
        raise ValueError("用户名或密码错误")
    return renew_with_auth_code(user["id"], code)


def get_member_profile(user_id: int) -> dict | None:
    member = get_active_member(user_id)
    if not member:
        conn = _conn()
        c = conn.cursor()
        c.execute("SELECT username, email FROM users WHERE id=?", (user_id,))
        u = c.fetchone()
        if not u:
            conn.close()
            return None
        c.execute(
            "SELECT plan_code, expires_at, status FROM memberships WHERE user_id=? ORDER BY id DESC LIMIT 1",
            (user_id,),
        )
        m = c.fetchone()
        conn.close()
        if not m:
            return None
        exp = datetime.strptime(m["expires_at"], "%Y-%m-%d %H:%M:%S")
        days = max(0, (exp - datetime.now()).days)
        return {
            "id": user_id,
            "username": u["username"],
            "email": (u["email"] or "").strip() if u["email"] else "",
            "plan_code": m["plan_code"],
            "plan_label": PLAN_LABELS.get(m["plan_code"], m["plan_code"]),
            "expires_at": m["expires_at"],
            "status": m["status"],
            "days_remaining": days,
            "is_active": False,
            "expiry_warning": "会员已过期，请使用下方「微信扫码续费」",
        }
    member["plan_label"] = PLAN_LABELS.get(member.get("plan_code", ""), member.get("plan_code", ""))
    member["is_active"] = True
    member["status"] = "active"
    days = member.get("days_remaining", 0)
    if days <= 0:
        member["expiry_warning"] = "会员今日到期，请尽快续费"
    elif days <= 7:
        member["expiry_warning"] = f"会员将在 {days} 天后到期"
    else:
        member["expiry_warning"] = ""
    member.setdefault("email", "")
    return member


def list_report_library(user_id: int | None = None) -> dict:
    """历史报告库 — Legacy zip 在 XHS_LEGACY_ZIP_DISABLED=1 时仅返回 ai_advisor。"""
    from cloud_deploy.cloud_api.member_entitlements import legacy_zip_globally_disabled

    archive_map = {"ai_advisor": "member_ai_advisor_zip"}
    if not legacy_zip_globally_disabled():
        archive_map.update(
            {
                "daily": "member_daily_zip",
                "weekly": "member_weekly_zip",
                "monthly": "member_monthly_zip",
                "custom": "member_custom_zip",
            }
        )
    out: dict = {}
    total = 0
    for key, archive_type in archive_map.items():
        rows = list_archives(archive_type)
        out[key] = rows
        total += len(rows)
    out["total_count"] = total
    if user_id:
        ent = get_member_entitlements(user_id)
        if ent:
            out = filter_report_library_by_entitlements(out, ent)
    return out


def list_member_watchlist(user_id: int, limit: int = 500) -> list:
    conn = _conn()
    rows = conn.execute(
        """SELECT goods_id, title, store_name, source, meta_json, created_at, updated_at
           FROM member_watchlist
           WHERE user_id=?
           ORDER BY updated_at DESC
           LIMIT ?""",
        (user_id, limit),
    ).fetchall()
    conn.close()
    out = []
    for r in rows:
        item = {
            "goods_id": r["goods_id"],
            "title": r["title"] or "",
            "store_name": r["store_name"] or "",
            "source": r["source"] or "",
            "created_at": r["created_at"] or "",
            "updated_at": r["updated_at"] or "",
        }
        if r["meta_json"]:
            try:
                item["meta"] = json.loads(r["meta_json"])
            except Exception:
                pass
        out.append(item)
    return out


def upsert_member_watchlist(user_id: int, items: list, source: str = "") -> dict:
    if not items:
        return {"upserted": 0}
    conn = _conn()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    upserted = 0
    for raw in items:
        if not isinstance(raw, dict):
            continue
        gid = str(raw.get("goods_id") or raw.get("product_id") or "").strip()
        if not gid:
            continue
        title = str(raw.get("title") or raw.get("product_name") or "")[:500]
        store = str(raw.get("store_name") or "")[:256]
        src = str(raw.get("source") or source or "")[:128]
        meta = {
            k: raw[k]
            for k in ("price", "sold", "actual_v1d", "report_id", "report_date")
            if raw.get(k) is not None
        }
        conn.execute(
            """INSERT INTO member_watchlist
               (user_id, goods_id, title, store_name, source, meta_json, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?)
               ON CONFLICT(user_id, goods_id) DO UPDATE SET
                 title=excluded.title,
                 store_name=excluded.store_name,
                 source=CASE WHEN excluded.source<>'' THEN excluded.source ELSE member_watchlist.source END,
                 meta_json=excluded.meta_json,
                 updated_at=excluded.updated_at""",
            (user_id, gid, title, store, src, json.dumps(meta) if meta else None, now, now),
        )
        upserted += 1
    conn.commit()
    conn.close()
    return {"upserted": upserted}


def delete_member_watchlist(user_id: int, goods_ids: list) -> int:
    clean = [str(g).strip() for g in goods_ids if str(g).strip()]
    if not clean:
        return 0
    conn = _conn()
    placeholders = ",".join("?" * len(clean))
    cur = conn.execute(
        f"DELETE FROM member_watchlist WHERE user_id=? AND goods_id IN ({placeholders})",
        [user_id, *clean],
    )
    removed = cur.rowcount
    conn.commit()
    conn.close()
    return removed


def _payment_order_row(row) -> dict | None:
    if not row:
        return None
    return {
        "id": row["id"],
        "order_no": row["order_no"],
        "user_id": row["user_id"],
        "plan_code": row["plan_code"],
        "duration_days": row["duration_days"],
        "amount": row["amount"],
        "channel": row["channel"],
        "status": row["status"],
        "qrcode": row["qrcode"],
        "payurl": row["payurl"],
        "gateway_trade_no": row["gateway_trade_no"],
        "auth_code": row["auth_code"],
        "client_ip": row["client_ip"],
        "fulfilled_user_id": row["fulfilled_user_id"],
        "meta_json": row["meta_json"],
        "created_at": row["created_at"],
        "expires_at": row["expires_at"],
        "paid_at": row["paid_at"],
    }


def insert_payment_order(
    *,
    order_no: str,
    user_id: int | None,
    plan_code: str,
    duration_days: int,
    amount: str,
    channel: str,
    client_ip: str,
    expires_at: str,
) -> None:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = _conn()
    conn.execute(
        """INSERT INTO payment_orders
           (order_no, user_id, plan_code, duration_days, amount, channel, status,
            client_ip, created_at, expires_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (order_no, user_id, plan_code, duration_days, amount, channel, "pending", client_ip, now, expires_at),
    )
    conn.commit()
    conn.close()


def update_payment_order_gateway(
    order_no: str,
    *,
    qrcode: str = "",
    payurl: str = "",
    gateway_trade_no: str = "",
) -> None:
    conn = _conn()
    conn.execute(
        """UPDATE payment_orders SET qrcode=?, payurl=?, gateway_trade_no=?
           WHERE order_no=? AND status='pending'""",
        (qrcode or None, payurl or None, gateway_trade_no or None, order_no),
    )
    conn.commit()
    conn.close()


def get_payment_order(order_no: str) -> dict | None:
    conn = _conn()
    row = conn.execute("SELECT * FROM payment_orders WHERE order_no=?", (order_no,)).fetchone()
    conn.close()
    return _payment_order_row(row)


def expire_stale_payment_order(order_no: str) -> None:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = _conn()
    conn.execute(
        """UPDATE payment_orders SET status='expired'
           WHERE order_no=? AND status='pending' AND expires_at < ?""",
        (order_no, now),
    )
    conn.commit()
    conn.close()


def mark_payment_order_paid(
    order_no: str,
    *,
    gateway_trade_no: str,
    auth_code: str,
    paid_at: str,
) -> bool:
    conn = _conn()
    cur = conn.execute(
        """UPDATE payment_orders
           SET status='paid', gateway_trade_no=?, auth_code=?, paid_at=?
           WHERE order_no=? AND status='pending'""",
        (gateway_trade_no or None, auth_code, paid_at, order_no),
    )
    ok = cur.rowcount > 0
    conn.commit()
    conn.close()
    return ok


def mark_payment_order_paid_force(
    order_no: str,
    *,
    gateway_trade_no: str,
    auth_code: str,
    paid_at: str,
) -> bool:
    """已付款但订单 pending/expired 时强制标记为 paid（补单）。"""
    conn = _conn()
    cur = conn.execute(
        """UPDATE payment_orders
           SET status='paid', gateway_trade_no=?, auth_code=?, paid_at=?
           WHERE order_no=? AND status IN ('pending', 'expired')""",
        (gateway_trade_no or None, auth_code, paid_at, order_no),
    )
    ok = cur.rowcount > 0
    conn.commit()
    conn.close()
    return ok


def mark_payment_order_fulfilled(order_no: str, user_id: int) -> None:
    conn = _conn()
    conn.execute(
        "UPDATE payment_orders SET fulfilled_user_id=? WHERE order_no=?",
        (user_id, order_no),
    )
    conn.commit()
    conn.close()


def get_user_by_email(email: str) -> dict | None:
    addr = (email or "").strip().lower()
    if not addr:
        return None
    conn = _conn()
    row = conn.execute(
        "SELECT id, username, email FROM users WHERE LOWER(email)=?",
        (addr,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def set_user_email(user_id: int, email: str) -> None:
    addr = (email or "").strip().lower()
    if not addr or "@" not in addr:
        raise ValueError("请输入有效邮箱")
    conn = _conn()
    existing = conn.execute(
        "SELECT id FROM users WHERE LOWER(email)=? AND id!=?",
        (addr, user_id),
    ).fetchone()
    if existing:
        conn.close()
        raise ValueError("该邮箱已被其他账号绑定")
    conn.execute("UPDATE users SET email=? WHERE id=?", (addr, user_id))
    conn.commit()
    conn.close()


def create_password_reset_token(user_id: int, token_hash: str, hours: int = 2) -> None:
    now = datetime.now()
    expires = (now + timedelta(hours=hours)).strftime("%Y-%m-%d %H:%M:%S")
    created = now.strftime("%Y-%m-%d %H:%M:%S")
    conn = _conn()
    conn.execute("DELETE FROM password_reset_tokens WHERE user_id=? AND used_at IS NULL", (user_id,))
    conn.execute(
        """INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at)
           VALUES (?,?,?,?)""",
        (user_id, token_hash, expires, created),
    )
    conn.commit()
    conn.close()


def consume_password_reset_token(token_hash: str) -> int | None:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = _conn()
    row = conn.execute(
        """SELECT id, user_id FROM password_reset_tokens
           WHERE token_hash=? AND used_at IS NULL AND expires_at >= ?""",
        (token_hash, now),
    ).fetchone()
    if not row:
        conn.close()
        return None
    conn.execute(
        "UPDATE password_reset_tokens SET used_at=? WHERE id=?",
        (now, row["id"]),
    )
    conn.commit()
    conn.close()
    return int(row["user_id"])


def create_member_feedback(
    *,
    user_id: int,
    username: str,
    category: str,
    content: str,
    contact: str = "",
    app_version: str = "",
    machine_id: str = "",
    client_ip: str = "",
) -> dict:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = _conn()
    cur = conn.execute(
        """INSERT INTO member_feedback
           (user_id, username, category, content, contact, app_version, machine_id, client_ip, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (
            user_id,
            (username or "")[:64],
            (category or "suggestion")[:32],
            (content or "")[:8000],
            (contact or "")[:255],
            (app_version or "")[:32],
            (machine_id or "")[:64],
            (client_ip or "")[:64],
            now,
            now,
        ),
    )
    conn.commit()
    rid = int(cur.lastrowid)
    conn.close()
    return {"id": rid, "created_at": now}


def create_member_keyword_request(
    *,
    user_id: int,
    username: str,
    keywords: str,
    note: str = "",
    app_version: str = "",
    machine_id: str = "",
    client_ip: str = "",
) -> dict:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = _conn()
    cur = conn.execute(
        """INSERT INTO member_keyword_requests
           (user_id, username, keywords, note, app_version, machine_id, client_ip, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (
            user_id,
            (username or "")[:64],
            (keywords or "")[:4000],
            (note or "")[:2000],
            (app_version or "")[:32],
            (machine_id or "")[:64],
            (client_ip or "")[:64],
            now,
            now,
        ),
    )
    conn.commit()
    rid = int(cur.lastrowid)
    conn.close()
    return {"id": rid, "created_at": now}


def list_member_feedback(*, limit: int = 100, status: str | None = None) -> list:
    conn = _conn()
    lim = min(max(limit, 1), 500)
    if status:
        rows = conn.execute(
            "SELECT * FROM member_feedback WHERE status=? ORDER BY created_at DESC LIMIT ?",
            (status[:16], lim),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM member_feedback ORDER BY created_at DESC LIMIT ?",
            (lim,),
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def list_member_keyword_requests(*, limit: int = 100, status: str | None = None) -> list:
    conn = _conn()
    lim = min(max(limit, 1), 500)
    if status:
        rows = conn.execute(
            "SELECT * FROM member_keyword_requests WHERE status=? ORDER BY created_at DESC LIMIT ?",
            (status[:16], lim),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM member_keyword_requests ORDER BY created_at DESC LIMIT ?",
            (lim,),
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_member_feedback(item_id: int, *, status: str | None = None, admin_note: str | None = None) -> bool:
    sets = []
    params = []
    if status is not None:
        sets.append("status=?")
        params.append(status[:16])
    if admin_note is not None:
        sets.append("admin_note=?")
        params.append((admin_note or "")[:2000])
    if not sets:
        return False
    sets.append("updated_at=?")
    params.append(datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    params.append(int(item_id))
    conn = _conn()
    cur = conn.execute(
        f"UPDATE member_feedback SET {', '.join(sets)} WHERE id=?",
        params,
    )
    conn.commit()
    ok = cur.rowcount > 0
    conn.close()
    return ok


def update_member_keyword_request(item_id: int, *, status: str | None = None, admin_note: str | None = None) -> bool:
    sets = []
    params = []
    if status is not None:
        sets.append("status=?")
        params.append(status[:16])
    if admin_note is not None:
        sets.append("admin_note=?")
        params.append((admin_note or "")[:2000])
    if not sets:
        return False
    sets.append("updated_at=?")
    params.append(datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    params.append(int(item_id))
    conn = _conn()
    cur = conn.execute(
        f"UPDATE member_keyword_requests SET {', '.join(sets)} WHERE id=?",
        params,
    )
    conn.commit()
    ok = cur.rowcount > 0
    conn.close()
    return ok

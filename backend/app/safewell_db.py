import base64
import hashlib
import hmac
import secrets
import sqlite3
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime, timedelta

DB_SCHEMA = [
    """
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        age_years INTEGER,
        gender TEXT,
        health_conditions TEXT,
        height_cm REAL,
        current_weight_kg REAL,
        onboarded INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT,
        height_cm REAL,
        start_weight_kg REAL,
        target_weight_kg REAL,
        plan_mode TEXT,
        duration_days INTEGER,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS checkins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER,
        checkpoint_id TEXT,
        checkpoint_label TEXT,
        checkpoint_window TEXT,
        sort_index INTEGER,
        completed INTEGER,
        note TEXT,
        weight_kg REAL,
        updated_at TEXT,
        FOREIGN KEY(profile_id) REFERENCES profiles(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER,
        checkpoint_id TEXT,
        checkpoint_label TEXT,
        checkpoint_window TEXT,
        sort_index INTEGER,
        completed INTEGER,
        note TEXT,
        weight_kg REAL,
        logged_at TEXT NOT NULL,
        FOREIGN KEY(profile_id) REFERENCES profiles(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS library (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT,
        title TEXT,
        description TEXT
    )
    """,
]


DEFAULT_LIBRARY = [
    ("exercise", "Brisk Walk 30 min", "Moderate cardio: brisk walking for 30 minutes."),
    ("exercise", "Bodyweight Strength 20 min", "Simple bodyweight circuits: squats, push-ups, lunges."),
    ("food", "High-Protein Breakfast", "Eggs, Greek yogurt, or a protein smoothie to start the day."),
    ("food", "Whole-Food Snacks", "Nuts, fruit, or vegetable sticks to avoid empty calories."),
]


def _conn(db_path: str):
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: str):
    p = Path(db_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    conn = _conn(db_path)
    cur = conn.cursor()
    for stmt in DB_SCHEMA:
        cur.executescript(stmt)

    ensure_columns(
        conn,
        "users",
        {
            "age_years": "INTEGER",
            "gender": "TEXT",
            "health_conditions": "TEXT",
            "height_cm": "REAL",
            "current_weight_kg": "REAL",
            "onboarded": "INTEGER NOT NULL DEFAULT 0",
            "updated_at": "TEXT",
        },
    )
    ensure_columns(
        conn,
        "profiles",
        {
            "user_id": "INTEGER",
            "updated_at": "TEXT",
        },
    )
    ensure_columns(
        conn,
        "checkins",
        {
            "checkpoint_id": "TEXT",
            "checkpoint_label": "TEXT",
            "checkpoint_window": "TEXT",
            "sort_index": "INTEGER",
            "completed": "INTEGER",
            "note": "TEXT",
            "updated_at": "TEXT",
        },
    )
    ensure_columns(
        conn,
        "history",
        {
            "checkpoint_id": "TEXT",
            "checkpoint_label": "TEXT",
            "checkpoint_window": "TEXT",
            "sort_index": "INTEGER",
            "completed": "INTEGER",
            "note": "TEXT",
            "weight_kg": "REAL",
            "logged_at": "TEXT",
        },
    )
    # seed library if empty
    cur.execute("SELECT COUNT(*) as c FROM library")
    if cur.fetchone()[0] == 0:
        cur.executemany("INSERT INTO library (type, title, description) VALUES (?, ?, ?)", DEFAULT_LIBRARY)
    conn.commit()
    conn.close()


def ensure_columns(conn: sqlite3.Connection, table_name: str, columns: Dict[str, str]) -> None:
    cur = conn.cursor()
    cur.execute(f"PRAGMA table_info({table_name})")
    existing = {row[1] for row in cur.fetchall()}
    for column_name, column_definition in columns.items():
        if column_name not in existing:
            cur.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}")


def now_iso() -> str:
    return datetime.utcnow().isoformat()


def toString(value: Any) -> str:
    return "" if value is None else str(value)


def to_boolean(value: Any) -> bool:
    return bool(value) and value not in {0, "0", "false", "False"}


def toNumber(value: Any) -> float:
    try:
        parsed = float(value)
    except Exception:
        return 0.0

    return parsed if parsed == parsed else 0.0


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return f"{base64.b64encode(salt).decode('ascii')}${base64.b64encode(digest).decode('ascii')}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt_b64, digest_b64 = stored_hash.split("$", 1)
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
    except Exception:
        return False

    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return hmac.compare_digest(actual, expected)


def serialize_user(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(row["id"]),
        "name": toString(row["name"]),
        "ageYears": None if row.get("age_years") is None else math_round(row.get("age_years")),
        "gender": toString(row.get("gender")) if row.get("gender") is not None else None,
        "healthConditions": toString(row.get("health_conditions")) if row.get("health_conditions") is not None else None,
        "heightCm": to_nullable_float(row.get("height_cm")),
        "currentWeightKg": to_nullable_float(row.get("current_weight_kg")),
        "onboarded": to_boolean(row.get("onboarded")),
        "createdAt": toString(row.get("created_at")),
        "updatedAt": toString(row.get("updated_at")),
    }


def math_round(value: Any) -> int:
    if value is None or value == "":
        return 0
    return int(round(float(value)))


def to_nullable_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    parsed = float(value)
    return parsed if parsed == parsed else None


def get_user_by_name(db_path: str, name: str):
    conn = _conn(db_path)
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE lower(name) = lower(?)", (name,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_id(db_path: str, user_id: int):
    conn = _conn(db_path)
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def create_user(db_path: str, name: str, password: str):
    conn = _conn(db_path)
    cur = conn.cursor()
    timestamp = now_iso()
    cur.execute(
        """
        INSERT INTO users (name, password_hash, onboarded, created_at, updated_at)
        VALUES (?, ?, 0, ?, ?)
        """,
        (name.strip(), hash_password(password), timestamp, timestamp),
    )
    conn.commit()
    user_id = cur.lastrowid
    cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = dict(cur.fetchone())
    conn.close()
    return user


def update_user_onboarding(db_path: str, user_id: int, age_years: int, height_cm: float, current_weight_kg: float, gender: str | None = None, health_conditions: str | None = None):
    conn = _conn(db_path)
    cur = conn.cursor()
    timestamp = now_iso()
    cur.execute(
        """
        UPDATE users
        SET age_years = ?, height_cm = ?, current_weight_kg = ?, gender = ?, health_conditions = ?, onboarded = 1, updated_at = ?
        WHERE id = ?
        """,
        (age_years, height_cm, current_weight_kg, gender, health_conditions, timestamp, user_id),
    )
    conn.commit()
    conn.close()
    return get_user_by_id(db_path, user_id)


def create_session(db_path: str, user_id: int, ttl_hours: int = 72):
    conn = _conn(db_path)
    cur = conn.cursor()
    timestamp = now_iso()
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.utcnow() + timedelta(hours=ttl_hours)).isoformat()
    cur.execute(
        "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (token, user_id, timestamp, expires_at),
    )
    conn.commit()
    conn.close()
    return token


def get_user_by_token(db_path: str, token: str):
    conn = _conn(db_path)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT u.*
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > ?
        """,
        (token, now_iso()),
    )
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def serialize_profile(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(row["id"]),
        "userId": str(row["user_id"]),
        "name": toString(row["name"]),
        "heightCm": toNumber(row.get("height_cm")),
        "currentWeightKg": toNumber(row.get("start_weight_kg")),
        "goalWeightKg": toNumber(row.get("target_weight_kg")),
        "durationDays": math_round(row.get("duration_days")),
        "createdAt": toString(row.get("created_at")),
        "updatedAt": toString(row.get("updated_at") or row.get("created_at")),
    }


def serialize_checkin(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "checkpointId": toString(row.get("checkpoint_id")),
        "checkpointLabel": toString(row.get("checkpoint_label")),
        "checkpointWindow": toString(row.get("checkpoint_window")),
        "sortIndex": math_round(row.get("sort_index")),
        "completed": to_boolean(row.get("completed")),
        "note": toString(row.get("note")),
        "weightKg": to_nullable_float(row.get("weight_kg")),
        "updatedAt": toString(row.get("updated_at")),
    }


def serialize_history(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(row["id"]),
        "checkpointId": toString(row.get("checkpoint_id")),
        "checkpointLabel": toString(row.get("checkpoint_label")),
        "checkpointWindow": toString(row.get("checkpoint_window")),
        "sortIndex": math_round(row.get("sort_index")),
        "completed": to_boolean(row.get("completed")),
        "note": toString(row.get("note")),
        "weightKg": to_nullable_float(row.get("weight_kg")),
        "updatedAt": toString(row.get("logged_at")),
        "loggedAt": toString(row.get("logged_at")),
    }


def list_profiles(db_path: str, user_id: int) -> List[Dict[str, Any]]:
    conn = _conn(db_path)
    cur = conn.cursor()
    cur.execute("SELECT * FROM profiles WHERE user_id = ? ORDER BY updated_at DESC, id DESC", (user_id,))
    rows = [serialize_profile(dict(r)) for r in cur.fetchall()]
    conn.close()
    return rows


def _replace_checkins(conn: sqlite3.Connection, profile_id: int, checkins: List[Dict[str, Any]]) -> None:
    cur = conn.cursor()
    cur.execute("DELETE FROM checkins WHERE profile_id = ?", (profile_id,))
    cur.execute("DELETE FROM history WHERE profile_id = ?", (profile_id,))

    timestamp = now_iso()
    for checkin in checkins:
        weight_value = checkin.get("weight")
        if weight_value in (None, ""):
            weight_kg = None
        else:
            try:
                weight_kg = float(weight_value)
            except Exception:
                weight_kg = None

        payload = (
            profile_id,
            checkin.get("checkpointId"),
            checkin.get("checkpointLabel"),
            checkin.get("checkpointWindow"),
            checkin.get("sortIndex", 0),
            1 if checkin.get("completed") else 0,
            checkin.get("note", ""),
            weight_kg,
            timestamp,
        )
        cur.execute(
            """
            INSERT INTO checkins (
                profile_id, checkpoint_id, checkpoint_label, checkpoint_window, sort_index,
                completed, note, weight_kg, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            payload,
        )

        if checkin.get("completed") or weight_kg is not None or checkin.get("note"):
            cur.execute(
                """
                INSERT INTO history (
                    profile_id, checkpoint_id, checkpoint_label, checkpoint_window, sort_index,
                    completed, note, weight_kg, logged_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    profile_id,
                    checkin.get("checkpointId"),
                    checkin.get("checkpointLabel"),
                    checkin.get("checkpointWindow"),
                    checkin.get("sortIndex", 0),
                    1 if checkin.get("completed") else 0,
                    checkin.get("note", ""),
                    weight_kg,
                    timestamp,
                ),
            )


def _profile_snapshot(conn: sqlite3.Connection, profile_id: int) -> Dict[str, Any] | None:
    cur = conn.cursor()
    cur.execute("SELECT * FROM profiles WHERE id = ?", (profile_id,))
    profile_row = cur.fetchone()
    if not profile_row:
        return None

    cur.execute("SELECT * FROM checkins WHERE profile_id = ? ORDER BY sort_index ASC, id ASC", (profile_id,))
    checkins = [serialize_checkin(dict(row)) for row in cur.fetchall()]

    cur.execute("SELECT * FROM history WHERE profile_id = ? ORDER BY logged_at DESC, id DESC", (profile_id,))
    history = [serialize_history(dict(row)) for row in cur.fetchall()]

    return {
        "profile": serialize_profile(dict(profile_row)),
        "checkIns": checkins,
        "history": history,
    }


def create_profile(db_path: str, user_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    conn = _conn(db_path)
    cur = conn.cursor()
    timestamp = now_iso()
    cur.execute(
        """
        INSERT INTO profiles (user_id, name, height_cm, start_weight_kg, target_weight_kg, plan_mode, duration_days, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            data.get("name"),
            data.get("heightCm"),
            data.get("currentWeightKg"),
            data.get("goalWeightKg"),
            data.get("planMode") or data.get("plan_mode"),
            data.get("durationDays") or data.get("duration_days"),
            timestamp,
            timestamp,
        ),
    )
    conn.commit()
    pid = cur.lastrowid
    snapshot = _profile_snapshot(conn, pid)
    conn.close()
    return snapshot


def get_profile(db_path: str, user_id: int, profile_id: int) -> Dict[str, Any]:
    conn = _conn(db_path)
    cur = conn.cursor()
    cur.execute("SELECT * FROM profiles WHERE id = ? AND user_id = ?", (profile_id, user_id))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None

    snapshot_conn = _conn(db_path)
    snapshot = _profile_snapshot(snapshot_conn, profile_id)
    snapshot_conn.close()
    return snapshot


def update_profile(db_path: str, user_id: int, profile_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    conn = _conn(db_path)
    cur = conn.cursor()
    timestamp = now_iso()
    cur.execute(
        """
        UPDATE profiles SET name = ?, height_cm = ?, start_weight_kg = ?, target_weight_kg = ?, plan_mode = ?, duration_days = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
        """,
        (
            data.get("name"),
            data.get("heightCm"),
            data.get("currentWeightKg"),
            data.get("goalWeightKg"),
            data.get("planMode") or data.get("plan_mode"),
            data.get("durationDays") or data.get("duration_days"),
            timestamp,
            profile_id,
            user_id,
        ),
    )

    _replace_checkins(conn, profile_id, data.get("checkIns", []) or [])
    conn.commit()
    snapshot = _profile_snapshot(conn, profile_id)
    conn.close()
    return snapshot


def delete_profile(db_path: str, user_id: int, profile_id: int) -> bool:
    conn = _conn(db_path)
    cur = conn.cursor()
    cur.execute("DELETE FROM profiles WHERE id = ? AND user_id = ?", (profile_id, user_id))
    conn.commit()
    changed = cur.rowcount > 0
    conn.close()
    return changed


def list_library(db_path: str) -> List[Dict[str, Any]]:
    conn = _conn(db_path)
    cur = conn.cursor()
    cur.execute("SELECT * FROM library ORDER BY id")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


# --- Safety logic ported from the original TypeScript ---
def analyze_plan(height_cm: float, start_weight_kg: float, target_weight_kg: float, duration_days: int) -> Dict[str, Any]:
    # Guardrails
    healthy_bmi_floor = 18.5
    body_weight_loss_cap = 0.01  # 1% per day
    absolute_weekly_cap_kg = 1.0

    height_m = height_cm / 100.0 if height_cm else None
    bmi = None
    if height_m and start_weight_kg:
        bmi = start_weight_kg / (height_m * height_m)

    # compute allowed minimal target based on BMI floor
    min_safe_weight = None
    if height_m:
        min_safe_weight = healthy_bmi_floor * (height_m * height_m)

    recommended = True
    reasons = []

    if target_weight_kg is None:
        recommended = False
        reasons.append("No target weight provided")

    if min_safe_weight and target_weight_kg < min_safe_weight:
        recommended = False
        reasons.append("Target weight is below healthy BMI floor")

    # max safe weekly loss
    max_weekly = absolute_weekly_cap_kg
    # implied daily cap from percent
    max_daily_percent = body_weight_loss_cap

    # compute required average daily loss to reach target
    if duration_days and start_weight_kg and target_weight_kg is not None:
        total_loss = max(0.0, start_weight_kg - target_weight_kg)
        avg_daily_loss = total_loss / max(1, duration_days)
        avg_weekly_loss = avg_daily_loss * 7
        if avg_weekly_loss > max_weekly:
            recommended = False
            reasons.append(f"Requested pace ({avg_weekly_loss:.2f} kg/week) exceeds safe weekly cap ({max_weekly} kg/week)")
        if avg_daily_loss > start_weight_kg * max_daily_percent:
            recommended = False
            reasons.append("Requested daily loss exceeds percentage-based cap")

    return {
        "recommended": recommended,
        "reasons": reasons,
        "bmi": round(bmi, 2) if bmi else None,
        "min_safe_weight": round(min_safe_weight, 2) if min_safe_weight else None,
    }


def build_checkpoints(start_weight_kg: float, target_weight_kg: float, duration_days: int) -> List[Dict[str, Any]]:
    checkpoints = []
    if duration_days <= 0:
        return checkpoints
    total_loss = start_weight_kg - target_weight_kg
    for day in range(1, duration_days + 1):
        frac = day / duration_days
        weight = round(start_weight_kg - total_loss * frac, 2)
        date = (datetime.utcnow() + timedelta(days=day - 1)).date().isoformat()
        checkpoints.append({"day": day, "date": date, "target_weight_kg": weight})
    return checkpoints

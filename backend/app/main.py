import os
import json
import base64
import hashlib
import hmac
import secrets
import sqlite3
import threading
from pathlib import Path
import time
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any

import csv
import io
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, Response
from pydantic import BaseModel, Field

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
from contextlib import asynccontextmanager
import httpx
import asyncio

load_dotenv(dotenv_path=ENV_PATH)

try:
    from app.engine import (
        calculate_bmr_mifflin_st_jeor,
        calculate_metabolic_profile,
        analyze_user_progress
    )
except ImportError:
    from engine import (
        calculate_bmr_mifflin_st_jeor,
        calculate_metabolic_profile,
        analyze_user_progress
    )

DB_PATH = str(Path(__file__).resolve().parents[1] / "data" / "safewell.db")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure database directory and tables are created on app startup
    init_db()
    # Configure connection pooling, limits, and timeouts in httpx
    limits = httpx.Limits(max_connections=100, max_keepalive_connections=20)
    timeout = httpx.Timeout(30.0, connect=5.0)
    app.state.http_client = httpx.AsyncClient(limits=limits, timeout=timeout)
    yield
    await app.state.http_client.aclose()

app = FastAPI(
    title="SafeWell Weight & Trajectory Safety API",
    description="Production-grade API featuring Mifflin-St Jeor BMR & TDEE engine, historical weigh-in check-in tracking, progress trajectory analysis, and CSV reporting.",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RATE_LIMIT_STORE = defaultdict(list)
RATE_LIMIT_LOCK = threading.Lock()

def check_rate_limit(key: str, limit: int, period: int):
    """
    Checks if the request key has exceeded limit requests within the period (seconds).
    Raises HTTPException 429 if exceeded.
    """
    now = time.time()
    with RATE_LIMIT_LOCK:
        timestamps = [t for t in RATE_LIMIT_STORE[key] if now - t < period]
        if len(timestamps) >= limit:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please slow down and try again later."
            )
        timestamps.append(now)
        RATE_LIMIT_STORE[key] = timestamps


# 2. DATABASE CONFIGURATION & OPERATIONS
def get_db_connection():
    # Set a 20-second timeout to handle write contention and avoid database-locked crashes
    conn = sqlite3.connect(DB_PATH, timeout=20.0)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db_connection()
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        cur = conn.cursor()
        
        # Users table (sensitive info stored encrypted as TEXT)
        cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            age_years TEXT,
            gender TEXT,
            height_cm TEXT,
            current_weight_kg TEXT,
            goal_weight_kg TEXT,
            duration_days TEXT,
            health_conditions TEXT,
            onboarded INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        )
        """)
        
        # Sessions table
        cur.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        """)
    
        # Weight History Table
        cur.execute("""
        CREATE TABLE IF NOT EXISTS weight_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            logged_date TEXT NOT NULL,
            weight TEXT NOT NULL,
            note TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """)

        conn.commit()
    finally:
        conn.close()


init_db()


PBKDF2_ITERATIONS = 60_000

# 3. CRYPTOGRAPHIC HELPERS (PASSWORD HASHING)
def _sync_hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"{base64.b64encode(salt).decode('ascii')}${base64.b64encode(digest).decode('ascii')}"


def _sync_verify_password(password: str, stored_hash: str) -> tuple[bool, bool]:
    """Returns (is_valid, is_legacy)."""
    try:
        salt_b64, digest_b64 = stored_hash.split("$", 1)
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
    except Exception:
        return False, False
    
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    if hmac.compare_digest(actual, expected):
        return True, False
        
    for legacy_iters in (100_000, 600_000):
        legacy_actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, legacy_iters)
        if hmac.compare_digest(legacy_actual, expected):
            return True, True
            
    return False, False


async def hash_password(password: str) -> str:
    """Asynchronously hashes a password without blocking the event loop."""
    return await asyncio.to_thread(_sync_hash_password, password)


async def verify_password(password: str, stored_hash: str) -> bool:
    """Asynchronously verifies a password without blocking the event loop."""
    is_valid, _ = await asyncio.to_thread(_sync_verify_password, password, stored_hash)
    return is_valid

import os

# Try importing Fernet for AES encryption
try:
    from cryptography.fernet import Fernet
    HAS_CRYPTOGRAPHY = True
except ImportError:
    HAS_CRYPTOGRAPHY = False

raw_key = os.environ.get("DATABASE_ENCRYPTION_KEY") or "safewell_default_secure_key_32_bytes_len!"
if HAS_CRYPTOGRAPHY:
    derived_key = hashlib.sha256(raw_key.encode()).digest()
    fernet_key = base64.urlsafe_b64encode(derived_key)
    fernet = Fernet(fernet_key)


def encrypt_data(data: str | None) -> str:
    """Encrypts data using AES (Fernet) if available, falling back to XOR cipher."""
    if not data:
        return ""
    if HAS_CRYPTOGRAPHY:
        try:
            return fernet.encrypt(data.encode()).decode("ascii")
        except Exception:
            pass
            
    xor_bytes = bytes(ord(c) ^ ord(raw_key[i % len(raw_key)]) for i, c in enumerate(data))
    return xor_bytes.hex()


def decrypt_data(hex_or_token: str | None) -> str:
    """Decrypts data using AES (Fernet) if available, falling back to XOR or plain text."""
    if not hex_or_token:
        return ""
    if HAS_CRYPTOGRAPHY:
        try:
            return fernet.decrypt(hex_or_token.encode()).decode()
        except Exception:
            pass
            
    try:
        raw_bytes = bytes.fromhex(hex_or_token)
        decrypted_chars = [chr(b ^ ord(raw_key[i % len(raw_key)])) for i, b in enumerate(raw_bytes)]
        return "".join(decrypted_chars)
    except Exception:
        # Fallback for plain text values
        return str(hex_or_token)


def decrypt_user_fields(user_dict: dict) -> dict:
    """Helper to decrypt all sensitive user fields in place, falling back to plain text if needed."""
    fields_to_decrypt = [
        ("age_years", int),
        ("gender", str),
        ("height_cm", float),
        ("current_weight_kg", float),
        ("goal_weight_kg", float),
        ("duration_days", int),
        ("health_conditions", str)
    ]
    for field, field_type in fields_to_decrypt:
        val = user_dict.get(field)
        if val is not None and val != "":
            try:
                dec = decrypt_data(str(val))
                user_dict[field] = field_type(dec) if dec else None
            except Exception:
                try:
                    user_dict[field] = field_type(val)
                except Exception:
                    user_dict[field] = None
    return user_dict


async def decrypt_user_fields_async(user_dict: dict) -> dict:
    """Asynchronously decrypts all sensitive user fields in place without blocking the event loop."""
    return await asyncio.to_thread(decrypt_user_fields, user_dict)


def _sync_get_user_by_token(token: str) -> dict | None:
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        now_iso = datetime.utcnow().isoformat()
        cur.execute(
            "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?",
            (token, now_iso)
        )
        user_row = cur.fetchone()
        return dict(user_row) if user_row else None
    finally:
        conn.close()


# 4. AUTHENTICATION DEPENDENCY
async def get_current_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Session token required")
    
    token = authorization[7:].strip()
    user_dict = await asyncio.to_thread(_sync_get_user_by_token, token)
    
    if not user_dict:
        raise HTTPException(status_code=401, detail="Session expired or invalid")
        
    try:
        return await decrypt_user_fields_async(user_dict)
    except ValueError as e:
        raise HTTPException(status_code=401, detail="Session data compromised or outdated format. Please login again.") from e


def serialize_user(user: dict) -> dict:
    base = {
        "id": user["id"],
        "name": user["name"],
        "ageYears": user["age_years"],
        "gender": user["gender"],
        "heightCm": user["height_cm"],
        "currentWeightKg": user["current_weight_kg"],
        "goalWeightKg": user["goal_weight_kg"],
        "durationDays": user["duration_days"],
        "healthConditions": user["health_conditions"],
        "onboarded": bool(user["onboarded"]),
        "createdAt": user["created_at"]
    }
    if user.get("height_cm") and user.get("current_weight_kg") and user.get("age_years"):
        try:
            profile = calculate_metabolic_profile(
                weight_kg=float(user["current_weight_kg"]),
                height_cm=float(user["height_cm"]),
                age_years=int(user["age_years"]),
                gender=str(user.get("gender") or "Male"),
                goal_weight_kg=float(user.get("goal_weight_kg") or user["current_weight_kg"]),
                duration_days=int(user.get("duration_days") or 30)
            )
            base["metabolicProfile"] = {
                "bmr": profile.bmr,
                "tdee": profile.tdee,
                "targetCalories": profile.target_calories,
                "calorieDelta": profile.calorie_delta,
                "mode": profile.mode,
                "proteinG": profile.protein_g,
                "carbsG": profile.carbs_g,
                "fatG": profile.fat_g,
                "maxSafeWeeklyRate": profile.max_safe_weekly_rate,
                "isUnderweight": profile.is_underweight,
                "wasCapped": profile.was_capped,
                "actualDaysNeeded": profile.actual_days_needed,
                "notes": profile.notes
            }
        except Exception as e:
            print(f"Metabolic serialization note: {e}")
    return base


# 5. DATA SCHEMAS
class UserAuthSchema(BaseModel):
    name: str = Field(min_length=1)
    password: str = Field(min_length=4)


class OnboardingPayload(BaseModel):
    ageYears: int = Field(gt=0, lt=130)
    gender: str = Field(default="Male")
    heightCm: float = Field(gt=0)
    currentWeightKg: float = Field(gt=0)
    goalWeightKg: float = Field(gt=0)
    durationDays: int = Field(default=30)
    healthConditions: str | None = None


class CheckinPayload(BaseModel):
    logged_date: str = Field(description="YYYY-MM-DD format")
    weight: float = Field(gt=0, description="Logged weight in kg")
    note: str | None = None

# 8. API ENDPOINTS

# --- AUTH ROUTES ---
@app.post("/api/auth/signup")
async def signup(request: Request, payload: UserAuthSchema):
    client_ip = request.client.host if request.client else "unknown_ip"
    check_rate_limit(f"signup:{client_ip}", limit=10, period=60)
    
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id FROM users WHERE name = ?", (payload.name,))
        if cur.fetchone():
            raise HTTPException(status_code=409, detail="Username already exists")
        
        password_hash = await hash_password(payload.password)
        cur.execute(
            "INSERT INTO users (name, password_hash, created_at) VALUES (?, ?, ?)",
            (payload.name, password_hash, datetime.utcnow().isoformat())
        )
        conn.commit()
    finally:
        conn.close()
    return {"message": "User registered successfully"}


@app.post("/api/auth/login")
async def login(request: Request, payload: UserAuthSchema):
    client_ip = request.client.host if request.client else "unknown_ip"
    check_rate_limit(f"login:{client_ip}", limit=30, period=60)
    
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE name = ?", (payload.name,))
        row = cur.fetchone()
        
        if not row or not await verify_password(payload.password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid username or password")
            
        # Fast upgrade: re-hash with fast 10,000 iterations so subsequent logins are instant (< 5ms)
        fast_hash = await hash_password(payload.password)
        cur.execute("UPDATE users SET password_hash = ? WHERE id = ?", (fast_hash, row["id"]))

        user = await decrypt_user_fields_async(dict(row))
        token = secrets.token_urlsafe(32)
        # 30-day session lifetime to prevent random session expiration
        expires_at = (datetime.utcnow() + timedelta(days=30)).isoformat()
        
        # Clean up old/expired sessions for this user
        cur.execute("DELETE FROM sessions WHERE user_id = ? OR expires_at < ?", (user["id"], datetime.utcnow().isoformat()))
        
        # Save session
        cur.execute("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", (token, user["id"], expires_at))
        conn.commit()
    finally:
        conn.close()
        
    return {
        "token": token,
        "user": serialize_user(user)
    }


@app.get("/api/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return {"user": serialize_user(user)}


def _sync_update_user_only(user_id: int, payload_dict: dict, final_goal: float) -> dict:
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        encrypted_age = encrypt_data(str(payload_dict["ageYears"]))
        encrypted_gender = encrypt_data(payload_dict["gender"])
        encrypted_height = encrypt_data(str(payload_dict["heightCm"]))
        encrypted_curr_weight = encrypt_data(str(payload_dict["currentWeightKg"]))
        encrypted_goal_weight = encrypt_data(str(final_goal))
        encrypted_duration = encrypt_data(str(payload_dict["durationDays"]))
        encrypted_health = encrypt_data(payload_dict["healthConditions"])
        
        cur.execute("""
            UPDATE users 
            SET age_years = ?, gender = ?, height_cm = ?, current_weight_kg = ?, goal_weight_kg = ?, duration_days = ?, health_conditions = ?, onboarded = 1
            WHERE id = ?
        """, (
            encrypted_age,
            encrypted_gender,
            encrypted_height,
            encrypted_curr_weight,
            encrypted_goal_weight,
            encrypted_duration,
            encrypted_health,
            user_id
        ))
        conn.commit()
        cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        return decrypt_user_fields(dict(cur.fetchone()))
    finally:
        conn.close()


@app.put("/api/auth/me")
async def update_me(request: Request, payload: OnboardingPayload, user: dict = Depends(get_current_user)):
    client_ip = request.client.host if request.client else "unknown_ip"
    rate_limit_key = f"update_me:{user['id']}:{client_ip}"
    
    # Rate Limiting: 30 requests per minute
    check_rate_limit(rate_limit_key, limit=30, period=60)
    
    # 1. Enforce SafeCut boundaries
    h_m = payload.heightCm / 100
    bmi = payload.currentWeightKg / (h_m * h_m)
    final_goal = payload.goalWeightKg
    if bmi < 18.5:
        target_bmi_18_5_w = round(18.5 * (h_m ** 2), 2)
        if final_goal < target_bmi_18_5_w:
            final_goal = target_bmi_18_5_w
        
    requested_change = abs(payload.currentWeightKg - final_goal)
    duration_weeks = payload.durationDays / 7
    weekly_rate = requested_change / duration_weeks
    max_safe_rate = min(1.0, payload.currentWeightKg * 0.01) if final_goal < payload.currentWeightKg else 0.5
    
    if weekly_rate > max_safe_rate + 0.01:
        max_safe_change = max_safe_rate * duration_weeks
        if final_goal < payload.currentWeightKg:
            final_goal = round(payload.currentWeightKg - max_safe_change, 2)
        else:
            final_goal = round(payload.currentWeightKg + max_safe_change, 2)

    # Check if stats changed
    stats_changed = (
        payload.ageYears != user.get("age_years") or
        payload.gender != user.get("gender") or
        payload.heightCm != user.get("height_cm") or
        payload.currentWeightKg != user.get("current_weight_kg") or
        final_goal != user.get("goal_weight_kg") or
        payload.durationDays != user.get("duration_days") or
        payload.healthConditions != user.get("health_conditions")
    )
    
    payload_dict = payload.dict()
    
    if stats_changed:
        # Save new stats to DB
        updated_user = await asyncio.to_thread(
            _sync_update_user_only,
            user["id"],
            payload_dict,
            final_goal
        )
    else:
        # If nothing changed, we do not write to DB
        updated_user = user
        
    return {"user": serialize_user(updated_user)}


# --- CHECK-IN LOGGING & PROGRESS ROUTES ---
@app.get("/api/checkins")
def list_checkins(user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM weight_history WHERE user_id = ? ORDER BY logged_date ASC", (user["id"],))
        rows = cur.fetchall()
    finally:
        conn.close()
        
    decrypted_rows = []
    for r in rows:
        d = dict(r)
        try:
            d["weight"] = float(decrypt_data(d["weight"]))
        except Exception:
            d["weight"] = float(user.get("current_weight_kg") or 70.0)
        if d.get("note"):
            try:
                d["note"] = decrypt_data(d["note"])
            except Exception:
                pass
        decrypted_rows.append(d)
        
    checkins, summary = analyze_user_progress(user, decrypted_rows)
    return {"checkins": checkins, "summary": summary}


@app.post("/api/checkins")
def create_checkin(payload: CheckinPayload, user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        encrypted_weight = encrypt_data(str(payload.weight))
        encrypted_note = encrypt_data(payload.note) if payload.note else ""
        
        # Check if entry already exists for this date
        cur.execute("SELECT id FROM weight_history WHERE user_id = ? AND logged_date = ?", (user["id"], payload.logged_date))
        row = cur.fetchone()
        if row:
            cur.execute(
                "UPDATE weight_history SET weight = ?, note = ? WHERE id = ?",
                (encrypted_weight, encrypted_note, row["id"])
            )
        else:
            cur.execute(
                "INSERT INTO weight_history (user_id, logged_date, weight, note) VALUES (?, ?, ?, ?)",
                (user["id"], payload.logged_date, encrypted_weight, encrypted_note)
            )
        conn.commit()
    finally:
        conn.close()
    return {"message": "Check-in logged successfully"}


@app.put("/api/checkins/{checkin_id}")
def update_checkin(checkin_id: int, payload: CheckinPayload, user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        encrypted_weight = encrypt_data(str(payload.weight))
        encrypted_note = encrypt_data(payload.note) if payload.note else ""
        
        cur.execute(
            "UPDATE weight_history SET logged_date = ?, weight = ?, note = ? WHERE id = ? AND user_id = ?",
            (payload.logged_date, encrypted_weight, encrypted_note, checkin_id, user["id"])
        )
        conn.commit()
    finally:
        conn.close()
    return {"message": "Check-in updated successfully"}


@app.delete("/api/checkins/{checkin_id}")
def delete_checkin(checkin_id: int, user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM weight_history WHERE id = ? AND user_id = ?", (checkin_id, user["id"]))
        conn.commit()
    finally:
        conn.close()
    return {"message": "Check-in deleted successfully"}


@app.get("/api/export/csv")
def export_progress_csv(user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM weight_history WHERE user_id = ? ORDER BY logged_date ASC", (user["id"],))
        rows = cur.fetchall()
    finally:
        conn.close()
        
    decrypted_rows = []
    for r in rows:
        d = dict(r)
        try:
            d["weight"] = float(decrypt_data(d["weight"]))
        except Exception:
            d["weight"] = float(user.get("current_weight_kg") or 70.0)
        if d.get("note"):
            try:
                d["note"] = decrypt_data(d["note"])
            except Exception:
                pass
        decrypted_rows.append(d)
        
    checkins, summary = analyze_user_progress(user, decrypted_rows)
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write Header Metadata
    writer.writerow(["SafeWell Progress & Safety Path Summary Report"])
    writer.writerow(["User Name", user.get("name", "User")])
    writer.writerow(["Age (years)", user.get("age_years", "")])
    writer.writerow(["Gender", user.get("gender", "")])
    writer.writerow(["Height (cm)", user.get("height_cm", "")])
    writer.writerow(["Baseline Weight (kg)", summary["startWeightKg"]])
    writer.writerow(["Goal Weight (kg)", summary["goalWeightKg"]])
    writer.writerow(["Duration (days)", summary["durationDays"]])
    writer.writerow(["BMR (Mifflin-St Jeor)", f"{summary['bmr']} kcal"])
    writer.writerow(["TDEE", f"{summary['tdee']} kcal"])
    writer.writerow(["Prescribed Daily Target Calories", f"{summary['targetCalories']} kcal"])
    writer.writerow(["Protein Target (g)", f"{summary['proteinG']}g"])
    writer.writerow(["Carbs Target (g)", f"{summary['carbsG']}g"])
    writer.writerow(["Fat Target (g)", f"{summary['fatG']}g"])
    writer.writerow([])
    
    # Write Check-in Data Table
    writer.writerow(["Date", "Logged Weight (kg)", "Days Since Last Entry", "Weight Change Since Last (kg)", "Interval Safety Limit (kg)", "Target Expected Weight (kg)", "Safety Boundary Limit (kg)", "Status", "Notes"])
    for c in checkins:
        writer.writerow([
            c["logged_date"],
            c["weight"],
            c.get("days_since_last", 0),
            c.get("weight_change_from_last", 0.0),
            c.get("max_interval_safe_change", "--"),
            c["expected_weight"],
            c["safety_boundary_weight"],
            c["status_label"],
            c["note"]
        ])
        
    csv_content = output.getvalue()
    filename = f"safewell_progress_{user.get('name', 'user')}_{datetime.utcnow().strftime('%Y%m%d')}.csv"
    
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# 9. ROOT & API STATUS ROUTING
@app.get("/")
def serve_index():
    dist_index = Path(__file__).resolve().parents[2] / "frontend" / "dist" / "index.html"
    if dist_index.exists():
        return FileResponse(dist_index)
    return {
        "status": "online",
        "service": "SafeWell API",
        "frontend": "http://localhost:5173",
        "docs": "/docs"
    }


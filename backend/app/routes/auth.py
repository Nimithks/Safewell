from pathlib import Path

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field

from .. import safewell_db

router = APIRouter()


def _db_path() -> str:
    return str(Path(__file__).resolve().parents[2] / "data" / "safewell.db")


def _token_from_header(authorization: str | None) -> str | None:
    if not authorization:
        return None
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip() or None
    return None


def current_user(authorization: str | None = Header(default=None), token: str | None = None):
    token = _token_from_header(authorization) or token
    if not token:
        raise HTTPException(status_code=401, detail="Missing session token")

    user = safewell_db.get_user_by_token(_db_path(), token)
    if not user:
        raise HTTPException(status_code=401, detail="Session expired or invalid")

    return user


class SignupPayload(BaseModel):
    name: str = Field(min_length=1)
    password: str = Field(min_length=4)


class LoginPayload(BaseModel):
    name: str = Field(min_length=1)
    password: str = Field(min_length=4)


class OnboardingPayload(BaseModel):
    ageYears: int = Field(gt=0, lt=130)
    gender: str | None = None
    healthConditions: str | None = None
    heightCm: float = Field(gt=0)
    currentWeightKg: float = Field(gt=0)


@router.post("/signup")
def signup(payload: SignupPayload):
    existing = safewell_db.get_user_by_name(_db_path(), payload.name)
    if existing:
        raise HTTPException(status_code=409, detail="That name is already registered")

    safewell_db.create_user(_db_path(), payload.name, payload.password)
    return {"message": "Signup complete. Please log in."}


@router.post("/login")
def login(payload: LoginPayload):
    user = safewell_db.get_user_by_name(_db_path(), payload.name)
    if not user or not safewell_db.verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Name or password did not match")

    token = safewell_db.create_session(_db_path(), int(user["id"]))
    return {
        "token": token,
        "user": safewell_db.serialize_user(user),
    }


@router.get("/me")
def me(authorization: str | None = Header(default=None)):
    return {"user": safewell_db.serialize_user(current_user(authorization))}


@router.put("/me")
def update_me(payload: OnboardingPayload, authorization: str | None = Header(default=None)):
    user = current_user(authorization)
    updated = safewell_db.update_user_onboarding(
        _db_path(),
        int(user["id"]),
        payload.ageYears,
        payload.heightCm,
        payload.currentWeightKg,
        payload.gender,
        payload.healthConditions,
    )
    return {"user": safewell_db.serialize_user(updated)}

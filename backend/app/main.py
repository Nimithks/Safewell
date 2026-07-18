import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from project root
env_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=env_path)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import safewell_db
from .routes import auth, profiles, library, chat


app = FastAPI(title="SafeWell API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    db_path = Path(__file__).resolve().parents[1] / "data" / "safewell.db"
    safewell_db.init_db(str(db_path))


app.include_router(profiles.router, prefix="/api/profiles")
app.include_router(library.router, prefix="/api/library")
app.include_router(auth.router, prefix="/api/auth")
app.include_router(chat.router, prefix="/api/chat")


@app.get("/api/health")
def health():
    return {"status": "ok"}

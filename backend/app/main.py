from pathlib import Path
from contextlib import asynccontextmanager
from dotenv import load_dotenv

# Load .env file from project root
env_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=env_path)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import safewell_db
from .routes import auth, profiles


@asynccontextmanager
async def lifespan(app: FastAPI):
    db_path = Path(__file__).resolve().parents[1] / "data" / "safewell.db"
    safewell_db.init_db(str(db_path))
    yield


app = FastAPI(title="SafeWell API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(profiles.router, prefix="/api/profiles")
app.include_router(auth.router, prefix="/api/auth")


@app.get("/api/health")
def health():
    return {"status": "ok"}


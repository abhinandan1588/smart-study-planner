"""Configuration objects for the Smart Study Planner backend.

Secrets and provider keys are read from the environment only (PRD 10.1).
"""

import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent

load_dotenv(BASE_DIR / ".env")


def _bool(name, default=False):
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(name, default):
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)


def _csv(name, default):
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return list(default)
    return [item.strip() for item in raw.split(",") if item.strip()]


class BaseConfig:
    # --- Flask core -------------------------------------------------------
    SECRET_KEY = os.environ.get(
        "SECRET_KEY", "dev-only-flask-secret-change-me-in-production"
    )
    JSON_SORT_KEYS = False

    # --- Database ---------------------------------------------------------
    INSTANCE_DIR = BASE_DIR / "instance"
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", f"sqlite:///{INSTANCE_DIR / 'app.db'}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # --- JWT --------------------------------------------------------------
    JWT_SECRET_KEY = os.environ.get(
        "JWT_SECRET_KEY",
        os.environ.get("SECRET_KEY", "dev-only-jwt-secret-change-me-in-production"),
    )
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(seconds=_int("JWT_ACCESS_TOKEN_EXPIRES", 3600))
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(
        seconds=_int("JWT_REFRESH_TOKEN_EXPIRES", 30 * 24 * 3600)
    )
    JWT_TOKEN_LOCATION = ["headers"]
    JWT_HEADER_NAME = "Authorization"
    JWT_HEADER_TYPE = "Bearer"
    JWT_ERROR_MESSAGE_KEY = "message"

    # --- CORS -------------------------------------------------------------
    CORS_ORIGINS = _csv(
        "FRONTEND_ORIGIN",
        ["http://localhost:5173", "http://127.0.0.1:5173"],
    )

    # --- Uploads ----------------------------------------------------------
    UPLOAD_FOLDER = str(BASE_DIR / os.environ.get("UPLOAD_FOLDER", "uploads"))
    MAX_UPLOAD_MB = _int("MAX_UPLOAD_MB", 20)
    MAX_CONTENT_LENGTH = MAX_UPLOAD_MB * 1024 * 1024
    ALLOWED_UPLOAD_EXTENSIONS = {
        "pdf",
        "doc",
        "docx",
        "png",
        "jpg",
        "jpeg",
        "txt",
        "md",
        "csv",
    }

    # --- AI provider (server side only) -----------------------------------
    AI_PROVIDER = os.environ.get("AI_PROVIDER", "offline")
    AI_MODEL = os.environ.get("AI_MODEL", "gpt-4o-mini")
    AI_API_KEY = (
        os.environ.get("AI_API_KEY")
        or os.environ.get("OPENAI_API_KEY")
        or os.environ.get("GEMINI_API_KEY")
        or ""
    )
    AI_RATE_LIMIT = os.environ.get("AI_RATE_LIMIT", "20 per hour")

    # --- Auth behaviour ---------------------------------------------------
    PASSWORD_MIN_LENGTH = 8
    VERIFICATION_TOKEN_TTL = timedelta(hours=48)
    RESET_TOKEN_TTL = timedelta(hours=1)
    # No SMTP provider is configured, so the verification / reset tokens are
    # logged server side and returned by the API in development.
    EXPOSE_DEV_TOKENS = _bool("EXPOSE_DEV_TOKENS", True)
    REQUIRE_EMAIL_VERIFICATION = _bool("REQUIRE_EMAIL_VERIFICATION", False)

    # --- Rate limiting ----------------------------------------------------
    RATELIMIT_STORAGE_URI = os.environ.get("RATELIMIT_STORAGE_URI", "memory://")
    RATELIMIT_HEADERS_ENABLED = True
    AUTH_RATE_LIMIT = os.environ.get("AUTH_RATE_LIMIT", "30 per minute")

    # --- Pagination -------------------------------------------------------
    DEFAULT_PAGE_SIZE = 20
    MAX_PAGE_SIZE = 100


class DevelopmentConfig(BaseConfig):
    DEBUG = True
    ENV_NAME = "development"
    EXPOSE_DEV_TOKENS = _bool("EXPOSE_DEV_TOKENS", True)


class TestingConfig(BaseConfig):
    TESTING = True
    DEBUG = False
    ENV_NAME = "testing"
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    EXPOSE_DEV_TOKENS = True
    RATELIMIT_ENABLED = False


class ProductionConfig(BaseConfig):
    DEBUG = False
    ENV_NAME = "production"
    EXPOSE_DEV_TOKENS = _bool("EXPOSE_DEV_TOKENS", False)
    REQUIRE_EMAIL_VERIFICATION = _bool("REQUIRE_EMAIL_VERIFICATION", True)
    JWT_COOKIE_SECURE = True


CONFIG_MAP = {
    "development": DevelopmentConfig,
    "dev": DevelopmentConfig,
    "testing": TestingConfig,
    "test": TestingConfig,
    "production": ProductionConfig,
    "prod": ProductionConfig,
}


def get_config(name=None):
    key = (name or os.environ.get("FLASK_ENV") or "development").strip().lower()
    return CONFIG_MAP.get(key, DevelopmentConfig)

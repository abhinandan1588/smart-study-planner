"""Application factory for the Smart Study Planner API."""

import importlib
import logging
import os
from pathlib import Path

from flask import Flask, jsonify

from config import get_config
from app.extensions import cors, db, jwt, limiter, migrate

API_PREFIX = "/api/v1"


def create_app(config_name=None):
    app = Flask(__name__, instance_relative_config=False)
    app.config.from_object(get_config(config_name))

    _configure_logging(app)
    _prepare_directories(app)
    _init_extensions(app)
    _register_jwt_handlers(app)
    _register_blueprints(app)
    _register_core_routes(app)
    _register_cli(app)

    from app.common.errors import register_error_handlers

    register_error_handlers(app)

    app.logger.info(
        "Smart Study Planner API ready (env=%s, db=%s)",
        app.config.get("ENV_NAME", "development"),
        app.config["SQLALCHEMY_DATABASE_URI"],
    )
    return app


# --- setup helpers ------------------------------------------------------


def _configure_logging(app):
    level = logging.DEBUG if app.config.get("DEBUG") else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    )
    app.logger.setLevel(level)


def _prepare_directories(app):
    uri = app.config["SQLALCHEMY_DATABASE_URI"]
    if uri.startswith("sqlite:///") and ":memory:" not in uri:
        db_path = Path(uri.replace("sqlite:///", "", 1))
        if not db_path.is_absolute():
            db_path = Path(app.root_path).parent / db_path
        db_path.parent.mkdir(parents=True, exist_ok=True)
        app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"

    for sub in ("", "students", "admin", "tmp"):
        Path(app.config["UPLOAD_FOLDER"], sub).mkdir(parents=True, exist_ok=True)


def _init_extensions(app):
    db.init_app(app)
    # render_as_batch keeps ALTER TABLE migrations working on SQLite.
    migrate.init_app(app, db, render_as_batch=True)
    jwt.init_app(app)
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
        supports_credentials=True,
        expose_headers=["Content-Disposition"],
    )
    limiter.init_app(app)

    # Import every model so Flask-Migrate autogenerate sees the full metadata.
    importlib.import_module("app.models")

    if app.config["SQLALCHEMY_DATABASE_URI"].startswith("sqlite"):
        _enable_sqlite_foreign_keys(app)


def _enable_sqlite_foreign_keys(app):
    """SQLite ignores foreign keys unless the pragma is set per connection."""
    import sqlite3

    from sqlalchemy import event

    with app.app_context():
        engine = db.engine

    @event.listens_for(engine, "connect")
    def _set_pragma(dbapi_connection, _connection_record):
        if isinstance(dbapi_connection, sqlite3.Connection):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()


def _register_jwt_handlers(app):
    """Uniform JSON errors for every JWT failure mode."""
    from app.auth.services import is_token_revoked

    def _error(code, message, status):
        return jsonify({"error": {"code": code, "message": message}}), status

    @jwt.token_in_blocklist_loader
    def _check_blocklist(_jwt_header, jwt_payload):
        return is_token_revoked(jwt_payload)

    @jwt.unauthorized_loader
    def _missing_token(reason):
        return _error(
            "UNAUTHORIZED",
            "Authentication is required. Send an Authorization: Bearer <token> header.",
            401,
        )

    @jwt.invalid_token_loader
    def _invalid_token(reason):
        return _error("INVALID_TOKEN", f"The token is invalid: {reason}", 401)

    @jwt.expired_token_loader
    def _expired_token(_jwt_header, _jwt_payload):
        return _error(
            "TOKEN_EXPIRED", "The token has expired. Refresh it and try again.", 401
        )

    @jwt.revoked_token_loader
    def _revoked_token(_jwt_header, _jwt_payload):
        return _error("TOKEN_REVOKED", "This token has been revoked.", 401)

    @jwt.needs_fresh_token_loader
    def _needs_fresh(_jwt_header, _jwt_payload):
        return _error("FRESH_TOKEN_REQUIRED", "A fresh login is required.", 401)

    @jwt.user_lookup_error_loader
    def _user_lookup_error(_jwt_header, _jwt_payload):
        return _error(
            "UNAUTHORIZED", "The account for this token no longer exists.", 401
        )


def _register_blueprints(app):
    from app.admin import admin_bp
    from app.ai_assistant import ai_bp
    from app.analytics import analytics_bp
    from app.auth import auth_bp
    from app.courses import courses_bp
    from app.notifications import notifications_bp
    from app.planner import planner_bp
    from app.resources import materials_bp
    from app.student import student_bp
    from app.syllabus import syllabus_bp

    student_prefix = f"{API_PREFIX}/student"

    app.register_blueprint(auth_bp, url_prefix=f"{API_PREFIX}/auth")
    app.register_blueprint(admin_bp, url_prefix=f"{API_PREFIX}/admin")
    app.register_blueprint(courses_bp, url_prefix=f"{API_PREFIX}/courses")
    # Several student-facing blueprints share the /student prefix; blueprint
    # names stay unique so endpoint names never collide.
    app.register_blueprint(student_bp, url_prefix=student_prefix)
    app.register_blueprint(syllabus_bp, url_prefix=student_prefix)
    app.register_blueprint(planner_bp, url_prefix=student_prefix)
    app.register_blueprint(analytics_bp, url_prefix=student_prefix)
    app.register_blueprint(materials_bp, url_prefix=student_prefix)
    app.register_blueprint(notifications_bp, url_prefix=student_prefix)
    # The AI assistant answers on the PRD 8.2 path and on the shorter /ai path.
    app.register_blueprint(ai_bp, url_prefix=f"{student_prefix}/ai")
    app.register_blueprint(ai_bp, url_prefix=f"{API_PREFIX}/ai", name="ai_short")


def _register_core_routes(app):
    @app.get(f"{API_PREFIX}/health")
    def health():
        try:
            db.session.execute(db.text("SELECT 1"))
            database = "ok"
        except Exception:
            db.session.rollback()
            database = "error"
        return (
            jsonify(
                {
                    "status": "ok" if database == "ok" else "degraded",
                    "service": "smart-study-planner-api",
                    "version": "v1",
                    "db": database,
                }
            ),
            200 if database == "ok" else 503,
        )

    @app.get("/")
    def index():
        return (
            jsonify(
                {
                    "service": "Smart Study Planner API",
                    "api_base": API_PREFIX,
                    "health": f"{API_PREFIX}/health",
                }
            ),
            200,
        )


def _register_cli(app):
    import click

    from app.seed import seed_demo_data

    @app.cli.command("init-db")
    def init_db_command():
        """Create every table directly (use `flask db upgrade` in production)."""
        db.create_all()
        click.echo("Database tables created.")

    @app.cli.command("seed")
    @click.option("--reset", is_flag=True, help="Delete demo rows before seeding.")
    def seed_command(reset):
        """Populate the database with demo accounts and courses."""
        seed_demo_data(reset=reset, echo=click.echo)

    @app.cli.command("seed-demo")
    @click.option("--reset", is_flag=True, help="Delete demo rows before seeding.")
    def seed_demo_command(reset):
        """Alias of `flask seed`."""
        seed_demo_data(reset=reset, echo=click.echo)

    @app.shell_context_processor
    def shell_context():
        models = importlib.import_module("app.models")
        return {"db": db, "models": models, "os": os}

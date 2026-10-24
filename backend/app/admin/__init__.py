"""Administrator blueprint (PRD 4)."""

from flask import Blueprint

admin_bp = Blueprint("admin", __name__)

from app.admin import routes_audit  # noqa: E402,F401

"""Student study-materials blueprint (PRD 3.10)."""

from flask import Blueprint

materials_bp = Blueprint("materials", __name__)

from app.resources import routes  # noqa: E402,F401

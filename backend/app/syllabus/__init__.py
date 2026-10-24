"""Student syllabus and topic-progress blueprint (PRD 3.4)."""

from flask import Blueprint

syllabus_bp = Blueprint("syllabus", __name__)

from app.syllabus import routes  # noqa: E402,F401

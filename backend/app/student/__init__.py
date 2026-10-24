"""Student blueprint: dashboard, profile and enrollments (PRD 3.2 / 3.3 / 3.12)."""

from flask import Blueprint

student_bp = Blueprint("student", __name__)

from app.student import routes  # noqa: E402,F401

"""Notification centre and student-facing announcements (PRD 3.11)."""

from flask import Blueprint

notifications_bp = Blueprint("notifications", __name__)

from app.notifications import routes  # noqa: E402,F401

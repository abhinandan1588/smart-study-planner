"""Planner blueprint: timetable, tasks, focus timer, goals (PRD 3.5 - 3.7)."""

from flask import Blueprint

planner_bp = Blueprint("planner", __name__)

from app.planner import (  # noqa: E402,F401
    routes_focus,
    routes_goals,
    routes_tasks,
    routes_timetable,
)

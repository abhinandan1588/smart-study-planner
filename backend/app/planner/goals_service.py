"""Server-side goal progress recomputation (PRD 3.7).

Every goal category except ``practice_questions`` derives ``current_value``
from stored activity, so a client can never inflate its own progress. Practice
questions have no stored source of truth, so they use an explicit, validated
increment endpoint and are clearly the only manually tracked category.
"""

from datetime import timedelta

from app.common.progress import course_progress
from app.common.streaks import (
    streak_info,
    studied_minutes_between,
    week_bounds,
)
from app.extensions import db
from app.models import Goal, StudySession, Task, TopicProgress, utcnow

MANUAL_CATEGORIES = ("practice_questions",)


def recompute_goal(goal, today=None):
    """Refresh ``current_value`` and ``status`` from stored rows."""
    today = today or utcnow().date()
    category = goal.category

    if category == "course_completion":
        if goal.course_id:
            goal.current_value = course_progress(goal.user_id, goal.course_id)[
                "completion_percent"
            ]
        else:
            goal.current_value = 0.0

    elif category == "topics_count":
        goal.current_value = float(
            TopicProgress.query.filter(
                TopicProgress.user_id == goal.user_id,
                TopicProgress.status == "completed",
                TopicProgress.completed_at.isnot(None),
                TopicProgress.completed_at
                >= _as_datetime(goal.start_date),
            ).count()
        )

    elif category == "weekly_hours":
        week_start, week_end = week_bounds(today)
        minutes = studied_minutes_between(goal.user_id, week_start, week_end)
        goal.current_value = round(minutes / 60.0, 2)

    elif category == "daily_tasks":
        goal.current_value = float(
            Task.query.filter(
                Task.user_id == goal.user_id,
                Task.status == "completed",
                Task.completed_at.isnot(None),
                Task.completed_at >= _as_datetime(today),
                Task.completed_at < _as_datetime(today + timedelta(days=1)),
            ).count()
        )

    elif category == "study_streak":
        goal.current_value = float(streak_info(goal.user_id, today)["current"])

    elif category == "revision_cycle":
        goal.current_value = float(
            StudySession.query.filter(
                StudySession.user_id == goal.user_id,
                StudySession.session_type == "revision",
                StudySession.status.in_(("completed", "partially_completed")),
                StudySession.start_at >= _as_datetime(goal.start_date),
            ).count()
        )

    # practice_questions keeps its stored, explicitly reported value.

    if goal.target_value and goal.current_value >= goal.target_value:
        if goal.status != "completed":
            goal.status = "completed"
            goal.completed_at = utcnow()
    elif goal.status == "completed":
        # Progress fell back below the target (e.g. a new week started).
        goal.status = "overdue" if goal.deadline < today else "active"
        goal.completed_at = None
    elif goal.status == "active" and goal.deadline < today:
        goal.status = "overdue"
    elif goal.status == "overdue" and goal.deadline >= today:
        goal.status = "active"

    return goal


def recompute_goals(user_id, statuses=None, commit=True):
    """Recompute every goal of a user and return the refreshed rows."""
    query = Goal.query.filter(Goal.user_id == user_id)
    if statuses:
        query = query.filter(Goal.status.in_(list(statuses)))
    goals = query.order_by(Goal.deadline.asc(), Goal.id.asc()).all()
    today = utcnow().date()
    for goal in goals:
        recompute_goal(goal, today=today)
    if commit and goals:
        db.session.commit()
    return goals


def _as_datetime(value):
    from datetime import datetime, time

    if hasattr(value, "hour"):
        return value
    return datetime.combine(value, time.min)

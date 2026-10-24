"""Server-side achievement evaluation (PRD 3.7).

Every metric is recomputed from stored rows — nothing the client sends can
influence an award. Duplicate awards are impossible: the insert is guarded by
an existence check *and* by the ``uq_user_achievement`` unique constraint, so a
race or a replayed request can never create a second row.
"""

import json
import logging

from sqlalchemy.exc import IntegrityError

from app.common.progress import course_progress_bulk, enrolled_course_ids
from app.common.streaks import streak_info, studied_minutes_between, week_bounds
from app.extensions import db
from app.models import (
    Achievement,
    FocusSession,
    Task,
    TopicProgress,
    User,
    UserAchievement,
    utcnow,
)

logger = logging.getLogger(__name__)


def compute_metrics(user_id):
    """Every metric an achievement can be defined against."""
    user = db.session.get(User, user_id)
    today = utcnow().date()

    topics_completed = TopicProgress.query.filter_by(
        user_id=user_id, status="completed"
    ).count()
    focus_completed = FocusSession.query.filter_by(
        user_id=user_id, status="completed"
    ).count()
    focus_minutes = (
        db.session.query(
            db.func.coalesce(db.func.sum(FocusSession.focus_minutes), 0)
        )
        .filter(
            FocusSession.user_id == user_id,
            FocusSession.status.in_(("completed", "interrupted")),
        )
        .scalar()
        or 0
    )
    tasks_completed = Task.query.filter_by(user_id=user_id, status="completed").count()

    course_ids = enrolled_course_ids(user_id)
    per_course = course_progress_bulk(user_id, course_ids)
    courses_completed = sum(
        1
        for stats in per_course.values()
        if stats["total_topics"] > 0 and stats["completion_percent"] >= 100
    )

    streak = streak_info(user_id, today)
    week_start, week_end = week_bounds(today)
    week_minutes = studied_minutes_between(user_id, week_start, week_end)
    weekly_target = (user.weekly_target_minutes if user else 0) or 0

    return {
        "topics_completed": topics_completed,
        "focus_sessions_completed": focus_completed,
        "focus_minutes": int(focus_minutes),
        "tasks_completed": tasks_completed,
        "courses_completed": courses_completed,
        "study_streak_days": max(streak["current"], streak["longest"]),
        "weekly_target_met": 1 if weekly_target and week_minutes >= weekly_target else 0,
        "weekly_minutes": week_minutes,
    }


def evaluate_achievements(user_id, commit=True):
    """Award every achievement the stored activity now supports.

    Returns the list of newly earned achievement codes (empty on a repeat run).
    """
    metrics = compute_metrics(user_id)
    earned_ids = {
        row[0]
        for row in db.session.query(UserAchievement.achievement_id)
        .filter(UserAchievement.user_id == user_id)
        .all()
    }

    newly_earned = []
    for achievement in Achievement.query.filter_by(is_active=True).order_by(
        Achievement.id
    ):
        if achievement.id in earned_ids:
            continue
        criteria = _criteria(achievement)
        metric = criteria.get("metric")
        threshold = criteria.get("threshold", 0)
        if metric is None or metrics.get(metric, 0) < threshold:
            continue
        try:
            with db.session.begin_nested():
                db.session.add(
                    UserAchievement(user_id=user_id, achievement_id=achievement.id)
                )
            newly_earned.append(achievement.code)
        except IntegrityError:
            # The unique constraint fired: already earned, nothing to do.
            logger.debug(
                "achievement %s already awarded to user %s", achievement.code, user_id
            )

    if commit and newly_earned:
        db.session.commit()
    return newly_earned


def _criteria(achievement):
    try:
        return json.loads(achievement.criteria_json or "{}")
    except (TypeError, ValueError):
        return {}


def achievement_catalogue(user_id):
    """Earned and still-available achievements with live progress values."""
    metrics = compute_metrics(user_id)
    earned_rows = {
        row.achievement_id: row
        for row in UserAchievement.query.filter_by(user_id=user_id).all()
    }

    earned = []
    available = []
    for achievement in Achievement.query.filter_by(is_active=True).order_by(
        Achievement.id
    ):
        criteria = _criteria(achievement)
        metric = criteria.get("metric")
        threshold = criteria.get("threshold", 0) or 0
        value = metrics.get(metric, 0)
        payload = {
            "id": achievement.id,
            "code": achievement.code,
            "title": achievement.title,
            "description": achievement.description,
            "icon": achievement.icon,
            "metric": metric,
            "threshold": threshold,
            "current_value": value,
            "progress_percent": (
                round(min(100.0, (value / threshold) * 100), 2) if threshold else 0.0
            ),
        }
        row = earned_rows.get(achievement.id)
        if row is not None:
            payload["earned_at"] = row.earned_at.isoformat() if row.earned_at else None
            earned.append(payload)
        else:
            available.append(payload)
    return {"earned": earned, "available": available, "metrics": metrics}

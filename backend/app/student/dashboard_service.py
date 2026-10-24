"""Dashboard aggregation (PRD 3.2).

Every number below is computed from stored rows for the authenticated student.
Nothing is sampled, defaulted or hard coded: an account with no activity gets
zeros and empty lists.
"""

from datetime import datetime, time, timedelta

from app.common.notifications import unread_count, visible_announcements
from app.common.progress import overall_completion
from app.common.serializers import (
    announcement_detail,
    course_summary,
    goal_detail,
    study_session_detail,
)
from app.common.streaks import activity_by_day, streak_info, week_bounds
from app.extensions import db
from app.models import Enrollment, StudySession, Task, Topic, TopicProgress, utcnow
from app.planner.goals_service import recompute_goals

UPCOMING_SESSION_LIMIT = 5
RECENT_COURSE_LIMIT = 4
ANNOUNCEMENT_LIMIT = 3
DEADLINE_WINDOW_DAYS = 14


def greeting_for(hour):
    if hour < 12:
        return "Good morning"
    if hour < 17:
        return "Good afternoon"
    return "Good evening"


def build_dashboard(user):
    now = utcnow()
    today = now.date()
    day_start = datetime.combine(today, time.min)
    day_end = day_start + timedelta(days=1)

    activity = activity_by_day(user.id, today, today)[today]
    target_minutes = user.daily_target_minutes or 0

    planned_today = (
        db.session.query(
            db.func.coalesce(db.func.sum(StudySession.planned_minutes), 0)
        )
        .filter(
            StudySession.user_id == user.id,
            StudySession.session_type != "break",
            StudySession.start_at >= day_start,
            StudySession.start_at < day_end,
        )
        .scalar()
        or 0
    )

    tasks = _task_counts(user.id, today, day_start, day_end)
    syllabus_totals, per_course = overall_completion(user.id)

    upcoming_sessions = (
        StudySession.query.filter(
            StudySession.user_id == user.id,
            StudySession.status == "planned",
            StudySession.session_type != "break",
            StudySession.start_at >= now,
        )
        .order_by(StudySession.start_at.asc())
        .limit(UPCOMING_SESSION_LIMIT)
        .all()
    )

    streak = streak_info(user.id, today)
    week_start, week_end = week_bounds(today)
    week_activity = activity_by_day(user.id, week_start, week_end)
    week_studied = sum(row["studied_minutes"] for row in week_activity.values())
    week_focus = sum(row["focus_minutes"] for row in week_activity.values())

    goals = recompute_goals(user.id)
    active_goals = [goal for goal in goals if goal.status in ("active", "overdue")]

    recent_courses = _recent_courses(user.id)
    announcements = visible_announcements(user.id)[:ANNOUNCEMENT_LIMIT]

    return {
        "greeting": f"{greeting_for(now.hour)}, {user.full_name.split(' ')[0]}",
        "date": today.isoformat(),
        "server_time": now.isoformat(),
        "timezone": user.timezone,
        "today": {
            "planned_minutes": int(planned_today),
            "studied_minutes": activity["studied_minutes"],
            "session_minutes": activity["session_minutes"],
            "focus_minutes": activity["focus_minutes"],
            "target_minutes": target_minutes,
            "percent": (
                round(min(100.0, activity["studied_minutes"] / target_minutes * 100), 2)
                if target_minutes
                else 0.0
            ),
            "sessions_total": activity["sessions_total"],
            "sessions_completed": activity["sessions_completed"],
            "focus_sessions": activity["focus_sessions"],
        },
        "week": {
            "start_date": week_start.isoformat(),
            "end_date": week_end.isoformat(),
            "studied_minutes": week_studied,
            "focus_minutes": week_focus,
            "target_minutes": user.weekly_target_minutes or 0,
            "percent": (
                round(
                    min(100.0, week_studied / user.weekly_target_minutes * 100), 2
                )
                if user.weekly_target_minutes
                else 0.0
            ),
        },
        "tasks": tasks,
        "syllabus_completion_percent": syllabus_totals["completion_percent"],
        "syllabus": syllabus_totals,
        "upcoming_sessions": [
            study_session_detail(session) for session in upcoming_sessions
        ],
        "streak_days": streak["current"],
        "streak": streak,
        "focus_minutes_today": activity["focus_minutes"],
        "active_goals": [goal_detail(goal) for goal in active_goals[:5]],
        "upcoming_deadlines": _upcoming_deadlines(user.id, today, active_goals),
        "recent_courses": [
            {
                **course_summary(enrollment.course),
                "enrollment_id": enrollment.id,
                "last_accessed_at": (
                    enrollment.last_accessed_at.isoformat()
                    if enrollment.last_accessed_at
                    else None
                ),
                "target_completion_date": (
                    enrollment.target_completion_date.isoformat()
                    if enrollment.target_completion_date
                    else None
                ),
                "progress": per_course.get(enrollment.course_id),
            }
            for enrollment in recent_courses
        ],
        "announcements": [
            announcement_detail(announcement) for announcement in announcements
        ],
        "unread_notifications": unread_count(user.id),
        "continue_topic": _continue_topic(user.id),
        "enrolled_courses": len(per_course),
    }


def _task_counts(user_id, today, day_start, day_end):
    base = Task.query.filter(Task.user_id == user_id)
    return {
        "completed": base.filter(Task.status == "completed").count(),
        "pending": base.filter(Task.status.in_(("pending", "in_progress"))).count(),
        "completed_today": base.filter(
            Task.status == "completed",
            Task.completed_at >= day_start,
            Task.completed_at < day_end,
        ).count(),
        "due_today": base.filter(
            Task.status.in_(("pending", "in_progress")), Task.due_date == today
        ).count(),
        "overdue": base.filter(
            Task.status.in_(("pending", "in_progress")),
            Task.due_date.isnot(None),
            Task.due_date < today,
        ).count(),
    }


def _recent_courses(user_id):
    # SQLite orders NULLs last on a DESC sort, so never-opened courses fall to
    # the bottom of the recently-accessed list.
    return (
        Enrollment.query.filter(
            Enrollment.user_id == user_id, Enrollment.status != "dropped"
        )
        .order_by(Enrollment.last_accessed_at.desc(), Enrollment.enrolled_at.desc())
        .limit(RECENT_COURSE_LIMIT)
        .all()
    )


def _upcoming_deadlines(user_id, today, active_goals):
    horizon = today + timedelta(days=DEADLINE_WINDOW_DAYS)
    items = []

    for goal in active_goals:
        if goal.deadline <= horizon:
            items.append(
                {
                    "kind": "goal",
                    "id": goal.id,
                    "title": goal.title,
                    "date": goal.deadline.isoformat(),
                    "days_left": (goal.deadline - today).days,
                    "link": "/app/goals",
                }
            )

    tasks = (
        Task.query.filter(
            Task.user_id == user_id,
            Task.status.in_(("pending", "in_progress")),
            Task.due_date.isnot(None),
            Task.due_date <= horizon,
        )
        .order_by(Task.due_date.asc())
        .limit(10)
        .all()
    )
    for task in tasks:
        items.append(
            {
                "kind": "task",
                "id": task.id,
                "title": task.title,
                "date": task.due_date.isoformat(),
                "days_left": (task.due_date - today).days,
                "priority": task.priority,
                "link": "/app/planner/tasks",
            }
        )

    enrollments = (
        Enrollment.query.filter(
            Enrollment.user_id == user_id,
            Enrollment.status == "active",
            Enrollment.target_completion_date.isnot(None),
            Enrollment.target_completion_date <= horizon,
        )
        .order_by(Enrollment.target_completion_date.asc())
        .all()
    )
    for enrollment in enrollments:
        items.append(
            {
                "kind": "course",
                "id": enrollment.course_id,
                "title": f"{enrollment.course.title} target date",
                "date": enrollment.target_completion_date.isoformat(),
                "days_left": (enrollment.target_completion_date - today).days,
                "link": "/app/courses",
            }
        )

    items.sort(key=lambda item: (item["date"], item["kind"], item["id"]))
    return items[:10]


def _continue_topic(user_id):
    """The most recently touched in-progress topic, for the quick action."""
    row = (
        db.session.query(TopicProgress, Topic)
        .join(Topic, TopicProgress.topic_id == Topic.id)
        .filter(
            TopicProgress.user_id == user_id,
            TopicProgress.status == "in_progress",
        )
        .order_by(TopicProgress.updated_at.desc())
        .first()
    )
    if row is None:
        return None
    progress, topic = row
    unit = topic.unit
    return {
        "topic_id": topic.id,
        "title": topic.title,
        "time_spent_minutes": progress.time_spent_minutes,
        "estimated_minutes": topic.estimated_minutes,
        "subject_id": unit.subject_id if unit else None,
        "subject_name": unit.subject.name if unit and unit.subject else None,
        "course_id": unit.version.course_id if unit and unit.version else None,
    }

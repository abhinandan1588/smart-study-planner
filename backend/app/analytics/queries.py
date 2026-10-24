"""Aggregate analytics queries (PRD 3.8). Every series comes from stored rows."""

from datetime import timedelta

from app.common.progress import course_progress_bulk, enrolled_course_ids
from app.common.streaks import activity_by_day, streak_info
from app.extensions import db
from app.models import (
    Course,
    Enrollment,
    FocusSession,
    Goal,
    StudySession,
    Subject,
    SyllabusUnit,
    Task,
    Topic,
    TopicProgress,
    utcnow,
)

RANGE_DAYS = {"7d": 7, "30d": 30, "90d": 90, "365d": 365}


def resolve_range(range_key, today=None):
    today = today or utcnow().date()
    days = RANGE_DAYS.get(range_key, 30)
    return today - timedelta(days=days - 1), today, days


def daily_study(user_id, from_date, to_date):
    """Line chart: studied minutes per day."""
    activity = activity_by_day(user_id, from_date, to_date)
    return [
        {
            "date": day.isoformat(),
            "minutes": row["studied_minutes"],
            "focus_minutes": row["focus_minutes"],
            "session_minutes": row["session_minutes"],
        }
        for day, row in sorted(activity.items())
    ]


def planned_vs_actual(user_id, from_date, to_date):
    """Comparison chart: planned versus actual session minutes per day."""
    activity = activity_by_day(user_id, from_date, to_date)
    return [
        {
            "date": day.isoformat(),
            "planned_minutes": row["planned_minutes"],
            "actual_minutes": row["session_minutes"],
        }
        for day, row in sorted(activity.items())
    ]


def consistency_heatmap(user_id, from_date, to_date):
    activity = activity_by_day(user_id, from_date, to_date)
    return [
        {
            "date": day.isoformat(),
            "minutes": row["studied_minutes"],
            "level": _heat_level(row["studied_minutes"]),
        }
        for day, row in sorted(activity.items())
    ]


def _heat_level(minutes):
    if minutes <= 0:
        return 0
    if minutes < 30:
        return 1
    if minutes < 90:
        return 2
    if minutes < 180:
        return 3
    return 4


def _window(from_date, to_date):
    from datetime import datetime, time

    return (
        datetime.combine(from_date, time.min),
        datetime.combine(to_date, time.min) + timedelta(days=1),
    )


def study_time_by_subject(user_id, from_date, to_date, course_id=None):
    """Bar chart: actual session minutes grouped by subject."""
    start, end = _window(from_date, to_date)
    query = (
        db.session.query(
            Subject.id,
            Subject.name,
            db.func.coalesce(db.func.sum(StudySession.actual_minutes), 0),
        )
        .select_from(StudySession)
        .join(Subject, StudySession.subject_id == Subject.id)
        .filter(
            StudySession.user_id == user_id,
            StudySession.start_at >= start,
            StudySession.start_at < end,
            StudySession.status.in_(("completed", "partially_completed")),
        )
        .group_by(Subject.id, Subject.name)
    )
    if course_id:
        query = query.filter(StudySession.course_id == course_id)
    rows = query.order_by(
        db.func.coalesce(db.func.sum(StudySession.actual_minutes), 0).desc()
    ).all()
    return [
        {"subject_id": row[0], "subject": row[1], "minutes": int(row[2])}
        for row in rows
        if row[2]
    ]


def study_time_by_course(user_id, from_date, to_date):
    start, end = _window(from_date, to_date)
    rows = (
        db.session.query(
            Course.id,
            Course.title,
            db.func.coalesce(db.func.sum(StudySession.actual_minutes), 0),
        )
        .select_from(StudySession)
        .join(Course, StudySession.course_id == Course.id)
        .filter(
            StudySession.user_id == user_id,
            StudySession.start_at >= start,
            StudySession.start_at < end,
            StudySession.status.in_(("completed", "partially_completed")),
        )
        .group_by(Course.id, Course.title)
        .order_by(db.func.coalesce(db.func.sum(StudySession.actual_minutes), 0).desc())
        .all()
    )
    return [
        {"course_id": row[0], "course": row[1], "minutes": int(row[2])}
        for row in rows
        if row[2]
    ]


def course_completion(user_id):
    """Progress bars: syllabus completion per enrolled course."""
    enrollments = (
        Enrollment.query.filter(
            Enrollment.user_id == user_id, Enrollment.status != "dropped"
        )
        .order_by(Enrollment.enrolled_at.asc())
        .all()
    )
    stats = course_progress_bulk(
        user_id, [enrollment.course_id for enrollment in enrollments]
    )
    return [
        {
            "course_id": enrollment.course_id,
            "course": enrollment.course.title if enrollment.course else None,
            "percent": stats.get(enrollment.course_id, {}).get(
                "completion_percent", 0.0
            ),
            "weighted_percent": stats.get(enrollment.course_id, {}).get(
                "weighted_completion_percent", 0.0
            ),
            "completed_topics": stats.get(enrollment.course_id, {}).get(
                "completed_topics", 0
            ),
            "total_topics": stats.get(enrollment.course_id, {}).get("total_topics", 0),
            "target_completion_date": (
                enrollment.target_completion_date.isoformat()
                if enrollment.target_completion_date
                else None
            ),
        }
        for enrollment in enrollments
    ]


def syllabus_completion_over_time(user_id, from_date, to_date):
    """Cumulative completed-topic count per day inside the range."""
    start, end = _window(from_date, to_date)
    rows = (
        db.session.query(
            db.func.date(TopicProgress.completed_at), db.func.count(TopicProgress.id)
        )
        .filter(
            TopicProgress.user_id == user_id,
            TopicProgress.status == "completed",
            TopicProgress.completed_at.isnot(None),
            TopicProgress.completed_at < end,
        )
        .group_by(db.func.date(TopicProgress.completed_at))
        .all()
    )
    per_day = {str(row[0]): int(row[1]) for row in rows}

    before = sum(
        count for day, count in per_day.items() if day < from_date.isoformat()
    )
    series = []
    running = before
    day = from_date
    while day <= to_date:
        running += per_day.get(day.isoformat(), 0)
        series.append(
            {
                "date": day.isoformat(),
                "completed_topics": running,
                "completed_today": per_day.get(day.isoformat(), 0),
            }
        )
        day += timedelta(days=1)
    return series


def tasks_planned_vs_completed(user_id, from_date, to_date):
    """Tasks due per day versus tasks completed per day."""
    planned_rows = (
        db.session.query(Task.due_date, db.func.count(Task.id))
        .filter(
            Task.user_id == user_id,
            Task.due_date.isnot(None),
            Task.due_date >= from_date,
            Task.due_date <= to_date,
        )
        .group_by(Task.due_date)
        .all()
    )
    planned = {row[0].isoformat(): int(row[1]) for row in planned_rows}

    start, end = _window(from_date, to_date)
    completed_rows = (
        db.session.query(db.func.date(Task.completed_at), db.func.count(Task.id))
        .filter(
            Task.user_id == user_id,
            Task.status == "completed",
            Task.completed_at.isnot(None),
            Task.completed_at >= start,
            Task.completed_at < end,
        )
        .group_by(db.func.date(Task.completed_at))
        .all()
    )
    completed = {str(row[0]): int(row[1]) for row in completed_rows}

    series = []
    day = from_date
    while day <= to_date:
        key = day.isoformat()
        series.append(
            {
                "date": key,
                "planned": planned.get(key, 0),
                "completed": completed.get(key, 0),
            }
        )
        day += timedelta(days=1)
    return series


def focus_sessions_series(user_id, from_date, to_date):
    activity = activity_by_day(user_id, from_date, to_date)
    return [
        {
            "date": day.isoformat(),
            "count": row["focus_sessions"],
            "completed": row["focus_completed"],
            "minutes": row["focus_minutes"],
            "cycles": row["focus_cycles"],
        }
        for day, row in sorted(activity.items())
    ]


def topics_donut(user_id, course_id=None):
    """Donut chart: completed / in progress / not started across the syllabus."""
    course_ids = [course_id] if course_id else enrolled_course_ids(user_id)
    stats = course_progress_bulk(user_id, course_ids)
    completed = sum(row["completed_topics"] for row in stats.values())
    in_progress = sum(row["in_progress_topics"] for row in stats.values())
    total = sum(row["total_topics"] for row in stats.values())
    return {
        "completed": completed,
        "in_progress": in_progress,
        "not_started": max(0, total - completed - in_progress),
        "total": total,
    }


def session_status_breakdown(user_id, from_date, to_date):
    start, end = _window(from_date, to_date)
    rows = (
        db.session.query(StudySession.status, db.func.count(StudySession.id))
        .filter(
            StudySession.user_id == user_id,
            StudySession.session_type != "break",
            StudySession.start_at >= start,
            StudySession.start_at < end,
        )
        .group_by(StudySession.status)
        .all()
    )
    return {row[0]: int(row[1]) for row in rows}


def overdue_tasks(user_id, today=None):
    today = today or utcnow().date()
    return Task.query.filter(
        Task.user_id == user_id,
        Task.status.in_(("pending", "in_progress")),
        Task.due_date.isnot(None),
        Task.due_date < today,
    ).count()


def upcoming_deadlines(user_id, today=None, days=14):
    today = today or utcnow().date()
    horizon = today + timedelta(days=days)
    items = []

    tasks = (
        Task.query.filter(
            Task.user_id == user_id,
            Task.status.in_(("pending", "in_progress")),
            Task.due_date.isnot(None),
            Task.due_date >= today,
            Task.due_date <= horizon,
        )
        .order_by(Task.due_date.asc())
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
            }
        )

    goals = (
        Goal.query.filter(
            Goal.user_id == user_id,
            Goal.status.in_(("active", "overdue")),
            Goal.deadline >= today,
            Goal.deadline <= horizon,
        )
        .order_by(Goal.deadline.asc())
        .all()
    )
    for goal in goals:
        items.append(
            {
                "kind": "goal",
                "id": goal.id,
                "title": goal.title,
                "date": goal.deadline.isoformat(),
                "days_left": (goal.deadline - today).days,
            }
        )

    revisions = (
        db.session.query(TopicProgress, Topic)
        .join(Topic, TopicProgress.topic_id == Topic.id)
        .filter(
            TopicProgress.user_id == user_id,
            TopicProgress.needs_revision.is_(True),
            TopicProgress.next_revision_date.isnot(None),
            TopicProgress.next_revision_date >= today,
            TopicProgress.next_revision_date <= horizon,
        )
        .all()
    )
    for progress, topic in revisions:
        items.append(
            {
                "kind": "revision",
                "id": topic.id,
                "title": f"Revise {topic.title}",
                "date": progress.next_revision_date.isoformat(),
                "days_left": (progress.next_revision_date - today).days,
            }
        )

    items.sort(key=lambda item: (item["date"], item["kind"], item["id"]))
    return items


def weekly_monthly_summary(user_id, today=None):
    today = today or utcnow().date()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)
    prev_week_start = week_start - timedelta(days=7)

    def totals(from_date, to_date):
        activity = activity_by_day(user_id, from_date, to_date)
        return {
            "from": from_date.isoformat(),
            "to": to_date.isoformat(),
            "studied_minutes": sum(r["studied_minutes"] for r in activity.values()),
            "focus_minutes": sum(r["focus_minutes"] for r in activity.values()),
            "planned_minutes": sum(r["planned_minutes"] for r in activity.values()),
            "sessions_completed": sum(
                r["sessions_completed"] for r in activity.values()
            ),
            "active_days": sum(
                1 for r in activity.values() if r["studied_minutes"] > 0
            ),
        }

    return {
        "this_week": totals(week_start, today),
        "last_week": totals(prev_week_start, week_start - timedelta(days=1)),
        "this_month": totals(month_start, today),
        "streak": streak_info(user_id, today),
    }


def focus_totals(user_id, from_date, to_date):
    start, end = _window(from_date, to_date)
    row = (
        db.session.query(
            db.func.count(FocusSession.id),
            db.func.coalesce(db.func.sum(FocusSession.focus_minutes), 0),
            db.func.coalesce(db.func.sum(FocusSession.cycles_completed), 0),
        )
        .filter(
            FocusSession.user_id == user_id,
            FocusSession.started_at >= start,
            FocusSession.started_at < end,
            FocusSession.status.in_(("completed", "interrupted")),
        )
        .one()
    )
    completed = FocusSession.query.filter(
        FocusSession.user_id == user_id,
        FocusSession.started_at >= start,
        FocusSession.started_at < end,
        FocusSession.status == "completed",
    ).count()
    return {
        "sessions": int(row[0]),
        "completed_sessions": completed,
        "minutes": int(row[1]),
        "cycles": int(row[2]),
    }


def subject_topic_breakdown(user_id, course_id):
    """Per-subject topic counts for one course, used by the course drill-down."""
    from app.common.progress import published_version_for

    version = published_version_for(course_id)
    if version is None:
        return []
    completed = db.case((TopicProgress.status == "completed", 1), else_=0)
    rows = (
        db.session.query(
            Subject.id,
            Subject.name,
            db.func.count(Topic.id),
            db.func.coalesce(db.func.sum(completed), 0),
        )
        .select_from(Topic)
        .join(SyllabusUnit, Topic.unit_id == SyllabusUnit.id)
        .join(Subject, SyllabusUnit.subject_id == Subject.id)
        .outerjoin(
            TopicProgress,
            db.and_(
                TopicProgress.topic_id == Topic.id,
                TopicProgress.user_id == user_id,
            ),
        )
        .filter(SyllabusUnit.syllabus_version_id == version.id)
        .group_by(Subject.id, Subject.name)
        .order_by(Subject.name.asc())
        .all()
    )
    return [
        {
            "subject_id": row[0],
            "subject": row[1],
            "total_topics": int(row[2]),
            "completed_topics": int(row[3]),
            "percent": (
                round(min(100.0, int(row[3]) / int(row[2]) * 100), 2) if row[2] else 0.0
            ),
        }
        for row in rows
    ]

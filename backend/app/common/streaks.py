"""Study-time, consistency and streak computation from stored activity.

Two sources record real study time: ``study_sessions.actual_minutes`` (a logged
calendar session) and ``focus_sessions.focus_minutes`` (timer time validated by
the server). A day's studied minutes is the greater of the two totals, never
their sum, so a focus session run inside a planned session is not counted twice.
"""

from datetime import timedelta

from app.extensions import db
from app.models import FocusSession, StudySession, utcnow

COUNTED_SESSION_STATUSES = ("completed", "partially_completed")
COUNTED_FOCUS_STATUSES = ("completed", "interrupted")


def _day(value):
    return value.date() if hasattr(value, "date") else value


def session_minutes_by_day(user_id, from_date, to_date):
    """``{date: {"actual": m, "planned": m, "completed": n, "total": n}}``."""
    start = _as_datetime(from_date)
    end = _as_datetime(to_date) + timedelta(days=1)
    rows = (
        StudySession.query.filter(
            StudySession.user_id == user_id,
            StudySession.start_at >= start,
            StudySession.start_at < end,
            StudySession.session_type != "break",
        )
        .with_entities(
            StudySession.start_at,
            StudySession.planned_minutes,
            StudySession.actual_minutes,
            StudySession.status,
        )
        .all()
    )
    out = {}
    for start_at, planned, actual, status in rows:
        bucket = out.setdefault(
            start_at.date(),
            {"actual": 0, "planned": 0, "completed": 0, "total": 0},
        )
        bucket["planned"] += planned or 0
        bucket["total"] += 1
        if status in COUNTED_SESSION_STATUSES:
            bucket["actual"] += actual or 0
            if status == "completed":
                bucket["completed"] += 1
    return out


def focus_minutes_by_day(user_id, from_date, to_date):
    """``{date: {"minutes": m, "sessions": n, "cycles": n}}``."""
    start = _as_datetime(from_date)
    end = _as_datetime(to_date) + timedelta(days=1)
    rows = (
        FocusSession.query.filter(
            FocusSession.user_id == user_id,
            FocusSession.started_at >= start,
            FocusSession.started_at < end,
            FocusSession.status.in_(COUNTED_FOCUS_STATUSES),
        )
        .with_entities(
            FocusSession.started_at,
            FocusSession.focus_minutes,
            FocusSession.cycles_completed,
            FocusSession.status,
        )
        .all()
    )
    out = {}
    for started_at, minutes, cycles, status in rows:
        bucket = out.setdefault(
            started_at.date(), {"minutes": 0, "sessions": 0, "cycles": 0, "completed": 0}
        )
        bucket["minutes"] += minutes or 0
        bucket["sessions"] += 1
        bucket["cycles"] += cycles or 0
        if status == "completed":
            bucket["completed"] += 1
    return out


def _as_datetime(value):
    from datetime import datetime, time

    if hasattr(value, "hour"):
        return value
    return datetime.combine(value, time.min)


def activity_by_day(user_id, from_date, to_date):
    """Merged per-day activity for every date in the inclusive range."""
    sessions = session_minutes_by_day(user_id, from_date, to_date)
    focus = focus_minutes_by_day(user_id, from_date, to_date)
    out = {}
    day = from_date
    while day <= to_date:
        s = sessions.get(day, {"actual": 0, "planned": 0, "completed": 0, "total": 0})
        f = focus.get(day, {"minutes": 0, "sessions": 0, "cycles": 0, "completed": 0})
        out[day] = {
            "date": day,
            "session_minutes": s["actual"],
            "planned_minutes": s["planned"],
            "sessions_total": s["total"],
            "sessions_completed": s["completed"],
            "focus_minutes": f["minutes"],
            "focus_sessions": f["sessions"],
            "focus_completed": f["completed"],
            "focus_cycles": f["cycles"],
            "studied_minutes": max(s["actual"], f["minutes"]),
        }
        day += timedelta(days=1)
    return out


def studied_minutes_on(user_id, day):
    return activity_by_day(user_id, day, day)[day]["studied_minutes"]


def focus_minutes_on(user_id, day):
    return activity_by_day(user_id, day, day)[day]["focus_minutes"]


def active_days(user_id, since=None):
    """Sorted set of dates on which the student actually studied."""
    days = set()

    session_rows = (
        StudySession.query.filter(
            StudySession.user_id == user_id,
            StudySession.status.in_(COUNTED_SESSION_STATUSES),
            StudySession.actual_minutes > 0,
            StudySession.session_type != "break",
        )
        .with_entities(StudySession.start_at)
        .all()
    )
    days.update(row[0].date() for row in session_rows)

    focus_rows = (
        FocusSession.query.filter(
            FocusSession.user_id == user_id,
            FocusSession.status.in_(COUNTED_FOCUS_STATUSES),
            FocusSession.focus_minutes > 0,
        )
        .with_entities(FocusSession.started_at)
        .all()
    )
    days.update(row[0].date() for row in focus_rows)

    if since is not None:
        days = {day for day in days if day >= since}
    return sorted(days)


def streak_info(user_id, today=None):
    """Current and longest consecutive-day study streaks."""
    today = today or utcnow().date()
    days = active_days(user_id)
    if not days:
        return {"current": 0, "longest": 0, "last_active_date": None, "active_days": 0}

    day_set = set(days)
    # Current streak: counted back from today, or from yesterday when today has
    # no activity yet (an unfinished day does not break a streak).
    anchor = today if today in day_set else today - timedelta(days=1)
    current = 0
    cursor = anchor
    while cursor in day_set:
        current += 1
        cursor -= timedelta(days=1)

    longest = 1
    run = 1
    for previous, day in zip(days, days[1:]):
        if (day - previous).days == 1:
            run += 1
        else:
            run = 1
        longest = max(longest, run)

    return {
        "current": current,
        "longest": max(longest, current),
        "last_active_date": days[-1].isoformat(),
        "active_days": len(days),
    }


def week_bounds(day):
    """Monday-to-Sunday bounds containing ``day``."""
    start = day - timedelta(days=day.weekday())
    return start, start + timedelta(days=6)


def studied_minutes_between(user_id, from_date, to_date):
    return sum(
        row["studied_minutes"]
        for row in activity_by_day(user_id, from_date, to_date).values()
    )


def focus_minutes_between(user_id, from_date, to_date):
    minutes = (
        db.session.query(
            db.func.coalesce(db.func.sum(FocusSession.focus_minutes), 0)
        )
        .filter(
            FocusSession.user_id == user_id,
            FocusSession.status.in_(COUNTED_FOCUS_STATUSES),
            FocusSession.started_at >= _as_datetime(from_date),
            FocusSession.started_at < _as_datetime(to_date) + timedelta(days=1),
        )
        .scalar()
    )
    return int(minutes or 0)

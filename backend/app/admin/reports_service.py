"""Administrative reports (PRD 4.9).

Every report is an aggregate query. No report returns an individual student's
notes, uploads or AI conversations; the only per-student figures exposed are
counts that an administrator legitimately needs (PRD 4.9 "Use aggregate data by
default").

Each builder returns ``{"type", "range", "series", "totals", "columns"}`` where
``columns`` drives the CSV export.
"""

from datetime import datetime, time, timedelta

from app.extensions import db
from app.models import (
    Announcement,
    AuditLog,
    Course,
    Enrollment,
    FocusSession,
    Notification,
    Resource,
    StudySession,
    Subject,
    SyllabusUnit,
    SyllabusVersion,
    Topic,
    TopicProgress,
    User,
)

REPORT_TYPES = (
    "registrations",
    "active_users",
    "enrollments",
    "resources",
    "engagement",
    "progress",
    "focus",
    "notifications",
    "accounts",
)


def _window(date_from, date_to):
    return (
        datetime.combine(date_from, time.min),
        datetime.combine(date_to, time.min) + timedelta(days=1),
    )


def _days(date_from, date_to):
    out = []
    day = date_from
    while day <= date_to:
        out.append(day)
        day += timedelta(days=1)
    return out


def build(report_type, date_from, date_to, course_id=None):
    builder = {
        "registrations": _registrations,
        "active_users": _active_users,
        "enrollments": _enrollments,
        "resources": _resources,
        "engagement": _engagement,
        "progress": _progress,
        "focus": _focus,
        "notifications": _notifications,
        "accounts": _accounts,
    }[report_type]
    report = builder(date_from, date_to, course_id)
    report["type"] = report_type
    report["range"] = {
        "from": date_from.isoformat(),
        "to": date_to.isoformat(),
        "days": (date_to - date_from).days + 1,
    }
    report["filters"] = {"course_id": course_id}
    return report


# --- builders -----------------------------------------------------------


def _registrations(date_from, date_to, _course_id):
    start, end = _window(date_from, date_to)
    rows = (
        db.session.query(
            db.func.date(User.created_at),
            db.func.count(User.id),
            db.func.sum(db.case((User.email_verified.is_(True), 1), else_=0)),
        )
        .filter(User.role == "student", User.created_at >= start, User.created_at < end)
        .group_by(db.func.date(User.created_at))
        .all()
    )
    per_day = {
        str(row[0]): {"registrations": int(row[1]), "verified": int(row[2] or 0)}
        for row in rows
    }
    series = []
    running = 0
    for day in _days(date_from, date_to):
        entry = per_day.get(day.isoformat(), {"registrations": 0, "verified": 0})
        running += entry["registrations"]
        series.append(
            {
                "date": day.isoformat(),
                "registrations": entry["registrations"],
                "verified": entry["verified"],
                "cumulative": running,
            }
        )
    return {
        "series": series,
        "columns": ["date", "registrations", "verified", "cumulative"],
        "totals": {
            "registrations": running,
            "verified": sum(row["verified"] for row in series),
            "total_students": User.query.filter(User.role == "student").count(),
        },
    }


def _active_student_ids(start, end):
    ids = set()
    queries = (
        db.session.query(StudySession.user_id).filter(
            StudySession.start_at >= start, StudySession.start_at < end
        ),
        db.session.query(FocusSession.user_id).filter(
            FocusSession.started_at >= start, FocusSession.started_at < end
        ),
        db.session.query(TopicProgress.user_id).filter(
            TopicProgress.updated_at >= start, TopicProgress.updated_at < end
        ),
    )
    for query in queries:
        ids.update(row[0] for row in query.distinct().all() if row[0] is not None)
    return ids


def _active_users(date_from, date_to, _course_id):
    series = []
    for day in _days(date_from, date_to):
        start, end = _window(day, day)
        series.append(
            {
                "date": day.isoformat(),
                "daily_active": len(_active_student_ids(start, end)),
            }
        )

    start, end = _window(date_from, date_to)
    week_start, week_end = _window(date_to - timedelta(days=6), date_to)
    month_start, month_end = _window(date_to - timedelta(days=29), date_to)
    return {
        "series": series,
        "columns": ["date", "daily_active"],
        "totals": {
            "unique_active_in_range": len(_active_student_ids(start, end)),
            "weekly_active": len(_active_student_ids(week_start, week_end)),
            "monthly_active": len(_active_student_ids(month_start, month_end)),
            "total_students": User.query.filter(User.role == "student").count(),
        },
    }


def _enrollments(date_from, date_to, course_id):
    start, end = _window(date_from, date_to)
    query = (
        db.session.query(
            Course.id,
            Course.title,
            Course.status,
            db.func.count(Enrollment.id),
            db.func.sum(db.case((Enrollment.status == "active", 1), else_=0)),
            db.func.sum(db.case((Enrollment.status == "completed", 1), else_=0)),
            db.func.sum(db.case((Enrollment.status == "dropped", 1), else_=0)),
        )
        .select_from(Course)
        .outerjoin(Enrollment, Enrollment.course_id == Course.id)
        .group_by(Course.id, Course.title, Course.status)
        .order_by(db.func.count(Enrollment.id).desc(), Course.title.asc())
    )
    if course_id:
        query = query.filter(Course.id == course_id)
    rows = query.all()

    new_in_range = dict(
        db.session.query(Enrollment.course_id, db.func.count(Enrollment.id))
        .filter(Enrollment.enrolled_at >= start, Enrollment.enrolled_at < end)
        .group_by(Enrollment.course_id)
        .all()
    )

    series = [
        {
            "course_id": row[0],
            "course": row[1],
            "course_status": row[2],
            "enrollments": int(row[3]),
            "active": int(row[4] or 0),
            "completed": int(row[5] or 0),
            "dropped": int(row[6] or 0),
            "new_in_range": int(new_in_range.get(row[0], 0)),
        }
        for row in rows
    ]
    return {
        "series": series,
        "columns": [
            "course_id",
            "course",
            "course_status",
            "enrollments",
            "active",
            "completed",
            "dropped",
            "new_in_range",
        ],
        "totals": {
            "enrollments": sum(row["enrollments"] for row in series),
            "active": sum(row["active"] for row in series),
            "new_in_range": sum(row["new_in_range"] for row in series),
            "courses": len(series),
        },
    }


def _resources(_date_from, _date_to, course_id):
    query = (
        db.session.query(
            Resource.id,
            Resource.title,
            Resource.resource_type,
            Resource.status,
            Resource.visibility,
            Resource.download_count,
            Resource.file_size_bytes,
            Course.title,
        )
        .select_from(Resource)
        .outerjoin(Course, Resource.course_id == Course.id)
        .filter(Resource.owner_id.is_(None))
        .order_by(Resource.download_count.desc(), Resource.id.asc())
    )
    if course_id:
        query = query.filter(Resource.course_id == course_id)
    rows = query.limit(200).all()

    series = [
        {
            "resource_id": row[0],
            "title": row[1],
            "resource_type": row[2],
            "status": row[3],
            "visibility": row[4],
            "downloads": int(row[5] or 0),
            "size_bytes": int(row[6] or 0),
            "course": row[7],
        }
        for row in rows
    ]
    return {
        "series": series,
        "columns": [
            "resource_id",
            "title",
            "resource_type",
            "status",
            "visibility",
            "downloads",
            "size_bytes",
            "course",
        ],
        "totals": {
            "resources": Resource.query.filter(Resource.owner_id.is_(None)).count(),
            "student_uploads": Resource.query.filter(
                Resource.owner_id.isnot(None)
            ).count(),
            "downloads": sum(row["downloads"] for row in series),
            "bytes": sum(row["size_bytes"] for row in series),
        },
    }


def _engagement(date_from, date_to, course_id):
    start, end = _window(date_from, date_to)
    session_query = (
        db.session.query(
            Course.id,
            Course.title,
            db.func.count(db.distinct(StudySession.user_id)),
            db.func.count(StudySession.id),
            db.func.coalesce(db.func.sum(StudySession.actual_minutes), 0),
            db.func.coalesce(db.func.sum(StudySession.planned_minutes), 0),
        )
        .select_from(Course)
        .outerjoin(
            StudySession,
            db.and_(
                StudySession.course_id == Course.id,
                StudySession.start_at >= start,
                StudySession.start_at < end,
            ),
        )
        .group_by(Course.id, Course.title)
        .order_by(db.func.coalesce(db.func.sum(StudySession.actual_minutes), 0).desc())
    )
    if course_id:
        session_query = session_query.filter(Course.id == course_id)
    rows = session_query.all()

    focus_rows = dict(
        (row[0], (int(row[1]), int(row[2] or 0)))
        for row in db.session.query(
            FocusSession.course_id,
            db.func.count(FocusSession.id),
            db.func.coalesce(db.func.sum(FocusSession.focus_minutes), 0),
        )
        .filter(
            FocusSession.started_at >= start,
            FocusSession.started_at < end,
            FocusSession.course_id.isnot(None),
        )
        .group_by(FocusSession.course_id)
        .all()
    )
    enrollment_counts = dict(
        db.session.query(Enrollment.course_id, db.func.count(Enrollment.id))
        .group_by(Enrollment.course_id)
        .all()
    )

    series = []
    for row in rows:
        focus_sessions, focus_minutes = focus_rows.get(row[0], (0, 0))
        enrolled = int(enrollment_counts.get(row[0], 0))
        active = int(row[2])
        series.append(
            {
                "course_id": row[0],
                "course": row[1],
                "enrolled_students": enrolled,
                "active_students": active,
                "engagement_percent": (
                    round((active / enrolled) * 100, 2) if enrolled else 0.0
                ),
                "sessions": int(row[3]),
                "studied_minutes": int(row[4]),
                "planned_minutes": int(row[5]),
                "plan_adherence_percent": (
                    round((int(row[4]) / int(row[5])) * 100, 2) if row[5] else 0.0
                ),
                "focus_sessions": focus_sessions,
                "focus_minutes": focus_minutes,
            }
        )
    return {
        "series": series,
        "columns": [
            "course_id",
            "course",
            "enrolled_students",
            "active_students",
            "engagement_percent",
            "sessions",
            "studied_minutes",
            "planned_minutes",
            "plan_adherence_percent",
            "focus_sessions",
            "focus_minutes",
        ],
        "totals": {
            "studied_minutes": sum(row["studied_minutes"] for row in series),
            "planned_minutes": sum(row["planned_minutes"] for row in series),
            "sessions": sum(row["sessions"] for row in series),
            "focus_minutes": sum(row["focus_minutes"] for row in series),
        },
    }


def _progress(_date_from, _date_to, course_id):
    """Aggregate syllabus progress per course and per subject."""
    completed = db.case((TopicProgress.status == "completed", 1), else_=0)
    in_progress = db.case((TopicProgress.status == "in_progress", 1), else_=0)

    query = (
        db.session.query(
            Course.id,
            Course.title,
            Subject.id,
            Subject.name,
            db.func.count(db.distinct(Topic.id)),
            db.func.coalesce(db.func.sum(completed), 0),
            db.func.coalesce(db.func.sum(in_progress), 0),
            db.func.coalesce(db.func.sum(TopicProgress.time_spent_minutes), 0),
        )
        .select_from(Course)
        .join(SyllabusVersion, SyllabusVersion.course_id == Course.id)
        .join(SyllabusUnit, SyllabusUnit.syllabus_version_id == SyllabusVersion.id)
        .join(Subject, SyllabusUnit.subject_id == Subject.id)
        .join(Topic, Topic.unit_id == SyllabusUnit.id)
        .outerjoin(TopicProgress, TopicProgress.topic_id == Topic.id)
        .filter(SyllabusVersion.status == "published")
        .group_by(Course.id, Course.title, Subject.id, Subject.name)
        .order_by(Course.title.asc(), Subject.name.asc())
    )
    if course_id:
        query = query.filter(Course.id == course_id)
    rows = query.all()

    enrollment_counts = dict(
        db.session.query(Enrollment.course_id, db.func.count(Enrollment.id))
        .filter(Enrollment.status != "dropped")
        .group_by(Enrollment.course_id)
        .all()
    )

    series = []
    for row in rows:
        topics = int(row[4])
        enrolled = int(enrollment_counts.get(row[0], 0))
        expected = topics * enrolled
        completed_rows = int(row[5])
        series.append(
            {
                "course_id": row[0],
                "course": row[1],
                "subject_id": row[2],
                "subject": row[3],
                "topics": topics,
                "enrolled_students": enrolled,
                "completed_records": completed_rows,
                "in_progress_records": int(row[6]),
                "expected_records": expected,
                "aggregate_completion_percent": (
                    round((completed_rows / expected) * 100, 2) if expected else 0.0
                ),
                "time_spent_minutes": int(row[7]),
            }
        )
    total_expected = sum(row["expected_records"] for row in series)
    total_completed = sum(row["completed_records"] for row in series)
    return {
        "series": series,
        "columns": [
            "course_id",
            "course",
            "subject_id",
            "subject",
            "topics",
            "enrolled_students",
            "completed_records",
            "in_progress_records",
            "expected_records",
            "aggregate_completion_percent",
            "time_spent_minutes",
        ],
        "totals": {
            "topics": sum(row["topics"] for row in series),
            "completed_records": total_completed,
            "expected_records": total_expected,
            "aggregate_completion_percent": (
                round((total_completed / total_expected) * 100, 2)
                if total_expected
                else 0.0
            ),
            "time_spent_minutes": sum(row["time_spent_minutes"] for row in series),
        },
    }


def _focus(date_from, date_to, course_id):
    start, end = _window(date_from, date_to)
    query = (
        db.session.query(
            db.func.date(FocusSession.started_at),
            db.func.count(FocusSession.id),
            db.func.sum(db.case((FocusSession.status == "completed", 1), else_=0)),
            db.func.sum(db.case((FocusSession.status == "interrupted", 1), else_=0)),
            db.func.sum(db.case((FocusSession.status == "abandoned", 1), else_=0)),
            db.func.coalesce(db.func.sum(FocusSession.focus_minutes), 0),
            db.func.coalesce(db.func.sum(FocusSession.cycles_completed), 0),
            db.func.count(db.distinct(FocusSession.user_id)),
        )
        .filter(FocusSession.started_at >= start, FocusSession.started_at < end)
        .group_by(db.func.date(FocusSession.started_at))
    )
    if course_id:
        query = query.filter(FocusSession.course_id == course_id)
    per_day = {
        str(row[0]): {
            "sessions": int(row[1]),
            "completed": int(row[2] or 0),
            "interrupted": int(row[3] or 0),
            "abandoned": int(row[4] or 0),
            "focus_minutes": int(row[5]),
            "cycles": int(row[6]),
            "students": int(row[7]),
        }
        for row in query.all()
    }
    empty = {
        "sessions": 0,
        "completed": 0,
        "interrupted": 0,
        "abandoned": 0,
        "focus_minutes": 0,
        "cycles": 0,
        "students": 0,
    }
    series = [
        {"date": day.isoformat(), **per_day.get(day.isoformat(), empty)}
        for day in _days(date_from, date_to)
    ]
    sessions = sum(row["sessions"] for row in series)
    completed = sum(row["completed"] for row in series)
    return {
        "series": series,
        "columns": [
            "date",
            "sessions",
            "completed",
            "interrupted",
            "abandoned",
            "focus_minutes",
            "cycles",
            "students",
        ],
        "totals": {
            "sessions": sessions,
            "completed": completed,
            "completion_rate_percent": (
                round((completed / sessions) * 100, 2) if sessions else 0.0
            ),
            "focus_minutes": sum(row["focus_minutes"] for row in series),
            "cycles": sum(row["cycles"] for row in series),
        },
    }


def _notifications(date_from, date_to, _course_id):
    start, end = _window(date_from, date_to)
    rows = (
        db.session.query(
            Notification.type,
            db.func.count(Notification.id),
            db.func.sum(db.case((Notification.is_read.is_(True), 1), else_=0)),
            db.func.count(db.distinct(Notification.user_id)),
        )
        .filter(Notification.created_at >= start, Notification.created_at < end)
        .group_by(Notification.type)
        .order_by(db.func.count(Notification.id).desc())
        .all()
    )
    series = []
    for row in rows:
        delivered = int(row[1])
        read = int(row[2] or 0)
        series.append(
            {
                "notification_type": row[0],
                "delivered": delivered,
                "read": read,
                "read_percent": round((read / delivered) * 100, 2) if delivered else 0.0,
                "recipients": int(row[3]),
            }
        )
    delivered_total = sum(row["delivered"] for row in series)
    read_total = sum(row["read"] for row in series)
    return {
        "series": series,
        "columns": [
            "notification_type",
            "delivered",
            "read",
            "read_percent",
            "recipients",
        ],
        "totals": {
            "delivered": delivered_total,
            "read": read_total,
            "read_percent": (
                round((read_total / delivered_total) * 100, 2)
                if delivered_total
                else 0.0
            ),
            "announcements_published": Announcement.query.filter(
                Announcement.status == "published"
            ).count(),
        },
    }


def _accounts(date_from, date_to, _course_id):
    start, end = _window(date_from, date_to)
    by_status = dict(
        db.session.query(User.status, db.func.count(User.id))
        .filter(User.role == "student")
        .group_by(User.status)
        .all()
    )
    verified = User.query.filter(
        User.role == "student", User.email_verified.is_(True)
    ).count()
    total = User.query.filter(User.role == "student").count()

    suspension_rows = (
        db.session.query(
            db.func.date(AuditLog.created_at), db.func.count(AuditLog.id)
        )
        .filter(
            AuditLog.action.in_(
                ("student.status_changed", "student.bulk_status_changed")
            ),
            AuditLog.created_at >= start,
            AuditLog.created_at < end,
        )
        .group_by(db.func.date(AuditLog.created_at))
        .all()
    )
    changes = {str(row[0]): int(row[1]) for row in suspension_rows}

    series = [
        {
            "date": day.isoformat(),
            "status_changes": changes.get(day.isoformat(), 0),
        }
        for day in _days(date_from, date_to)
    ]
    return {
        "series": series,
        "columns": ["date", "status_changes"],
        "totals": {
            "total_students": total,
            "active": int(by_status.get("active", 0)),
            "suspended": int(by_status.get("suspended", 0)),
            "pending_verification": int(by_status.get("pending_verification", 0)),
            "verified": verified,
            "unverified": total - verified,
            "verification_rate_percent": (
                round((verified / total) * 100, 2) if total else 0.0
            ),
            "status_changes_in_range": sum(row["status_changes"] for row in series),
            "admins": User.query.filter(User.role == "admin").count(),
        },
    }

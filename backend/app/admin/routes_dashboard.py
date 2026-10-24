"""Admin dashboard statistics (PRD 4.2).

Every number is an aggregate query over stored rows; nothing is estimated and
nothing is read from the client. The date range (`from` / `to`, default the
last 30 days) applies to the activity, signup and enrollment series.
"""

from datetime import datetime, time, timedelta

from flask import jsonify, request

from app.admin import admin_bp
from app.admin.serializers import student_row
from app.common.decorators import admin_required
from app.common.serializers import audit_log_entry, iso
from app.common.storage import storage_usage
from app.common.validators import parse_date, parse_int
from app.extensions import db
from app.models import (
    Announcement,
    AuditLog,
    Course,
    Enrollment,
    FocusSession,
    Resource,
    StudySession,
    Subject,
    SyllabusUnit,
    SyllabusVersion,
    Topic,
    TopicProgress,
    User,
    utcnow,
)

DEFAULT_RANGE_DAYS = 30
RECENT_LIMIT = 8


def resolve_range():
    today = utcnow().date()
    date_to = parse_date(request.args.get("to"), "to", required=False) or today
    date_from = parse_date(request.args.get("from"), "from", required=False) or (
        date_to - timedelta(days=DEFAULT_RANGE_DAYS - 1)
    )
    if date_from > date_to:
        date_from, date_to = date_to, date_from
    return date_from, date_to


def window(date_from, date_to):
    """Half-open naive-UTC datetime window for a pair of dates."""
    return (
        datetime.combine(date_from, time.min),
        datetime.combine(date_to, time.min) + timedelta(days=1),
    )


def _date_series(date_from, date_to):
    days = []
    day = date_from
    while day <= date_to:
        days.append(day)
        day += timedelta(days=1)
    return days


@admin_bp.get("/dashboard")
@admin_required
def dashboard():
    date_from, date_to = resolve_range()
    start, end = window(date_from, date_to)
    course_filter = parse_int(
        request.args.get("course_id"), "course_id", minimum=1, required=False
    )
    status_filter = (request.args.get("status") or "").strip() or None

    # --- account counts ------------------------------------------------
    student_q = User.query.filter(User.role == "student")
    if status_filter:
        student_q = student_q.filter(User.status == status_filter)
    total_students = student_q.count()

    by_status = dict(
        db.session.query(User.status, db.func.count(User.id))
        .filter(User.role == "student")
        .group_by(User.status)
        .all()
    )
    students_by_status = {
        "active": int(by_status.get("active", 0)),
        "suspended": int(by_status.get("suspended", 0)),
        "pending_verification": int(by_status.get("pending_verification", 0)),
    }

    new_registrations = User.query.filter(
        User.role == "student", User.created_at >= start, User.created_at < end
    ).count()

    # "Active" = produced a study session, focus session or progress update
    # inside the selected period.
    active_students = _active_student_count(start, end)

    # --- content counts -------------------------------------------------
    courses_by_status = dict(
        db.session.query(Course.status, db.func.count(Course.id))
        .group_by(Course.status)
        .all()
    )
    course_counts = {
        "draft": int(courses_by_status.get("draft", 0)),
        "published": int(courses_by_status.get("published", 0)),
        "archived": int(courses_by_status.get("archived", 0)),
        "total": sum(int(value) for value in courses_by_status.values()),
    }

    subject_count = Subject.query.filter(Subject.status == "active").count()
    unit_count = SyllabusUnit.query.count()
    topic_count = (
        db.session.query(db.func.count(Topic.id))
        .select_from(Topic)
        .join(SyllabusUnit, Topic.unit_id == SyllabusUnit.id)
        .join(
            SyllabusVersion,
            SyllabusUnit.syllabus_version_id == SyllabusVersion.id,
        )
        .filter(SyllabusVersion.status == "published")
        .scalar()
        or 0
    )
    resources_by_status = dict(
        db.session.query(Resource.status, db.func.count(Resource.id))
        .filter(Resource.owner_id.is_(None))
        .group_by(Resource.status)
        .all()
    )

    enrollment_q = Enrollment.query
    if course_filter:
        enrollment_q = enrollment_q.filter(Enrollment.course_id == course_filter)
    total_enrollments = enrollment_q.count()
    active_enrollments = enrollment_q.filter(Enrollment.status == "active").count()

    # --- distributions --------------------------------------------------
    distribution_rows = (
        db.session.query(
            Course.id,
            Course.title,
            Course.status,
            db.func.count(Enrollment.id),
        )
        .select_from(Course)
        .outerjoin(Enrollment, Enrollment.course_id == Course.id)
        .group_by(Course.id, Course.title, Course.status)
        .order_by(db.func.count(Enrollment.id).desc(), Course.title.asc())
        .all()
    )
    enrollment_distribution = [
        {
            "course_id": row[0],
            "course": row[1],
            "status": row[2],
            "count": int(row[3]),
        }
        for row in distribution_rows
    ]
    popular_courses = [row for row in enrollment_distribution if row["count"] > 0][:5]

    # --- activity trend --------------------------------------------------
    activity = _activity_series(date_from, date_to, course_filter)
    signups = _signup_series(date_from, date_to)

    # --- recent lists -----------------------------------------------------
    recent_users = (
        User.query.filter(User.role == "student")
        .order_by(User.created_at.desc())
        .limit(RECENT_LIMIT)
        .all()
    )
    enrollment_counts = _enrollment_counts([user.id for user in recent_users])
    recent_registrations = [
        student_row(user, enrollment_counts.get(user.id, 0)) for user in recent_users
    ]

    recent_actions = (
        AuditLog.query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(RECENT_LIMIT)
        .all()
    )

    return (
        jsonify(
            {
                "range": {
                    "from": date_from.isoformat(),
                    "to": date_to.isoformat(),
                    "days": (date_to - date_from).days + 1,
                },
                "filters": {"course_id": course_filter, "status": status_filter},
                "totals": {
                    "total_students": total_students,
                    "active_students": active_students,
                    "new_registrations": new_registrations,
                    "students_by_status": students_by_status,
                    "published_courses": course_counts["published"],
                    "draft_courses": course_counts["draft"],
                    "archived_courses": course_counts["archived"],
                    "total_courses": course_counts["total"],
                    "subject_count": subject_count,
                    "unit_count": unit_count,
                    "topic_count": int(topic_count),
                    "resource_count": sum(
                        int(value) for value in resources_by_status.values()
                    ),
                    "published_resources": int(resources_by_status.get("published", 0)),
                    "total_enrollments": total_enrollments,
                    "active_enrollments": active_enrollments,
                    "published_announcements": Announcement.query.filter(
                        Announcement.status == "published"
                    ).count(),
                },
                "courses_by_status": course_counts,
                "resources_by_status": {
                    key: int(value) for key, value in resources_by_status.items()
                },
                "enrollment_distribution": enrollment_distribution,
                "popular_courses": popular_courses,
                "activity": activity,
                "signups": signups,
                "recent_registrations": recent_registrations,
                "recent_admin_actions": [
                    audit_log_entry(entry) for entry in recent_actions
                ],
                "warnings": _warnings(),
                "storage": storage_usage(),
                "generated_at": iso(utcnow()),
            }
        ),
        200,
    )


# --- aggregates ---------------------------------------------------------


def _active_student_count(start, end):
    session_users = (
        db.session.query(StudySession.user_id)
        .filter(StudySession.start_at >= start, StudySession.start_at < end)
        .distinct()
    )
    focus_users = (
        db.session.query(FocusSession.user_id)
        .filter(FocusSession.started_at >= start, FocusSession.started_at < end)
        .distinct()
    )
    progress_users = (
        db.session.query(TopicProgress.user_id)
        .filter(TopicProgress.updated_at >= start, TopicProgress.updated_at < end)
        .distinct()
    )
    login_users = (
        db.session.query(User.id)
        .filter(
            User.role == "student",
            User.last_login_at.isnot(None),
            User.last_login_at >= start,
            User.last_login_at < end,
        )
        .distinct()
    )
    ids = set()
    for query in (session_users, focus_users, progress_users, login_users):
        ids.update(row[0] for row in query.all() if row[0] is not None)
    return len(ids)


def _activity_series(date_from, date_to, course_id=None):
    """Per-day platform activity: sessions, studied minutes, focus minutes."""
    start, end = window(date_from, date_to)

    session_q = (
        db.session.query(
            db.func.date(StudySession.start_at),
            db.func.count(StudySession.id),
            db.func.coalesce(db.func.sum(StudySession.actual_minutes), 0),
            db.func.count(db.distinct(StudySession.user_id)),
        )
        .filter(StudySession.start_at >= start, StudySession.start_at < end)
        .group_by(db.func.date(StudySession.start_at))
    )
    if course_id:
        session_q = session_q.filter(StudySession.course_id == course_id)
    sessions = {
        str(row[0]): {
            "sessions": int(row[1]),
            "session_minutes": int(row[2]),
            "active_students": int(row[3]),
        }
        for row in session_q.all()
    }

    focus_q = (
        db.session.query(
            db.func.date(FocusSession.started_at),
            db.func.count(FocusSession.id),
            db.func.coalesce(db.func.sum(FocusSession.focus_minutes), 0),
        )
        .filter(FocusSession.started_at >= start, FocusSession.started_at < end)
        .group_by(db.func.date(FocusSession.started_at))
    )
    if course_id:
        focus_q = focus_q.filter(FocusSession.course_id == course_id)
    focus = {
        str(row[0]): {"focus_sessions": int(row[1]), "focus_minutes": int(row[2])}
        for row in focus_q.all()
    }

    topic_rows = (
        db.session.query(
            db.func.date(TopicProgress.completed_at), db.func.count(TopicProgress.id)
        )
        .filter(
            TopicProgress.status == "completed",
            TopicProgress.completed_at.isnot(None),
            TopicProgress.completed_at >= start,
            TopicProgress.completed_at < end,
        )
        .group_by(db.func.date(TopicProgress.completed_at))
        .all()
    )
    topics = {str(row[0]): int(row[1]) for row in topic_rows}

    series = []
    for day in _date_series(date_from, date_to):
        key = day.isoformat()
        session_row = sessions.get(key, {})
        focus_row = focus.get(key, {})
        series.append(
            {
                "date": key,
                "sessions": session_row.get("sessions", 0),
                "session_minutes": session_row.get("session_minutes", 0),
                "active_students": session_row.get("active_students", 0),
                "focus_sessions": focus_row.get("focus_sessions", 0),
                "focus_minutes": focus_row.get("focus_minutes", 0),
                "topics_completed": topics.get(key, 0),
            }
        )
    return series


def _signup_series(date_from, date_to):
    start, end = window(date_from, date_to)
    rows = (
        db.session.query(db.func.date(User.created_at), db.func.count(User.id))
        .filter(
            User.role == "student", User.created_at >= start, User.created_at < end
        )
        .group_by(db.func.date(User.created_at))
        .all()
    )
    per_day = {str(row[0]): int(row[1]) for row in rows}
    return [
        {"date": day.isoformat(), "registrations": per_day.get(day.isoformat(), 0)}
        for day in _date_series(date_from, date_to)
    ]


def _enrollment_counts(user_ids):
    if not user_ids:
        return {}
    rows = (
        db.session.query(Enrollment.user_id, db.func.count(Enrollment.id))
        .filter(Enrollment.user_id.in_(user_ids))
        .group_by(Enrollment.user_id)
        .all()
    )
    return {row[0]: int(row[1]) for row in rows}


def _warnings():
    """Operational warnings an administrator should act on (PRD 4.2)."""
    warnings = []

    published_without_syllabus = (
        db.session.query(db.func.count(Course.id))
        .filter(
            Course.status == "published",
            ~db.exists().where(
                db.and_(
                    SyllabusVersion.course_id == Course.id,
                    SyllabusVersion.status == "published",
                )
            ),
        )
        .scalar()
        or 0
    )
    if published_without_syllabus:
        warnings.append(
            {
                "code": "COURSE_WITHOUT_PUBLISHED_SYLLABUS",
                "severity": "warning",
                "message": (
                    f"{published_without_syllabus} published course(s) have no "
                    "published syllabus version."
                ),
                "count": int(published_without_syllabus),
            }
        )

    missing_files = (
        Resource.query.filter(
            Resource.file_path.is_(None),
            Resource.external_url.is_(None),
            Resource.owner_id.is_(None),
        ).count()
    )
    if missing_files:
        warnings.append(
            {
                "code": "RESOURCE_WITHOUT_CONTENT",
                "severity": "warning",
                "message": (
                    f"{missing_files} shared resource(s) have neither a stored "
                    "file nor an external link."
                ),
                "count": missing_files,
            }
        )

    pending = User.query.filter(
        User.role == "student", User.status == "pending_verification"
    ).count()
    if pending:
        warnings.append(
            {
                "code": "PENDING_VERIFICATION",
                "severity": "info",
                "message": f"{pending} student account(s) are awaiting email verification.",
                "count": pending,
            }
        )

    expired = Announcement.query.filter(
        Announcement.status == "published",
        Announcement.expires_at.isnot(None),
        Announcement.expires_at < utcnow(),
    ).count()
    if expired:
        warnings.append(
            {
                "code": "ANNOUNCEMENT_EXPIRED",
                "severity": "info",
                "message": f"{expired} published announcement(s) are past their expiry date.",
                "count": expired,
            }
        )
    return warnings

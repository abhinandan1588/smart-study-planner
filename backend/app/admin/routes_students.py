"""Student account management (PRD 4.3).

Scope limits enforced here:

* only `role == 'student'` rows are reachable through these endpoints, so one
  administrator can never edit another administrator's account from the student
  directory;
* the `role` column is never writable from a request body — it is server
  controlled (PRD 2.3);
* private student content (topic notes, private uploads, AI conversations) is
  never returned, only aggregate study activity;
* every status change, password reset and bulk action writes an audit row.
"""

from datetime import timedelta

from flask import jsonify, request

from app.admin import admin_bp
from app.admin.helpers import audit, csv_response
from app.admin.serializers import enrollment_admin, student_row
from app.auth.services import generate_reset_token
from app.common.decorators import admin_required
from app.common.errors import NotFoundError, ValidationError
from app.common.pagination import paginate
from app.common.progress import course_progress_bulk, overall_completion
from app.common.serializers import iso, iso_date
from app.common.validators import (
    clean_str,
    get_json_body,
    parse_date,
    parse_int,
    validate_enum,
)
from app.extensions import db
from app.models import (
    USER_STATUSES,
    Enrollment,
    FocusSession,
    Goal,
    Notification,
    Resource,
    StudySession,
    Task,
    TopicProgress,
    User,
    utcnow,
)

SORTABLE = {
    "created_at": User.created_at,
    "full_name": User.full_name,
    "email": User.email,
    "last_login_at": User.last_login_at,
    "status": User.status,
}
ACTIVITY_WINDOW_DAYS = 30


def _student_or_404(student_id):
    student = db.session.get(User, student_id)
    if student is None or student.role != "student":
        raise NotFoundError("That student account was not found.")
    return student


def _student_query():
    query = User.query.filter(User.role == "student")

    search = (request.args.get("q") or "").strip()
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            db.or_(User.full_name.ilike(pattern), User.email.ilike(pattern))
        )

    status = request.args.get("status")
    if status:
        validate_enum(status, USER_STATUSES, "status")
        query = query.filter(User.status == status)

    verified = request.args.get("email_verified")
    if verified not in (None, ""):
        from app.common.validators import parse_bool

        query = query.filter(
            User.email_verified.is_(parse_bool(verified, "email_verified"))
        )

    course_id = parse_int(
        request.args.get("course_id"), "course_id", minimum=1, required=False
    )
    if course_id:
        enrolled = db.session.query(Enrollment.user_id).filter(
            Enrollment.course_id == course_id, Enrollment.status != "dropped"
        )
        query = query.filter(User.id.in_(enrolled))

    registered_from = parse_date(
        request.args.get("registered_from"), "registered_from", required=False
    )
    if registered_from:
        query = query.filter(User.created_at >= registered_from)

    registered_to = parse_date(
        request.args.get("registered_to"), "registered_to", required=False
    )
    if registered_to:
        query = query.filter(
            User.created_at < registered_to + timedelta(days=1)
        )

    sort = (request.args.get("sort") or "-created_at").strip()
    descending = sort.startswith("-")
    column = SORTABLE.get(sort.lstrip("-"), User.created_at)
    return query.order_by(column.desc() if descending else column.asc(), User.id.desc())


def _counts_for(user_ids):
    if not user_ids:
        return {}, {}
    enrollments = {
        row[0]: int(row[1])
        for row in db.session.query(Enrollment.user_id, db.func.count(Enrollment.id))
        .filter(Enrollment.user_id.in_(user_ids))
        .group_by(Enrollment.user_id)
        .all()
    }
    completed = {
        row[0]: int(row[1])
        for row in db.session.query(
            TopicProgress.user_id, db.func.count(TopicProgress.id)
        )
        .filter(
            TopicProgress.user_id.in_(user_ids), TopicProgress.status == "completed"
        )
        .group_by(TopicProgress.user_id)
        .all()
    }
    return enrollments, completed


@admin_bp.get("/students")
@admin_required
def list_students():
    """Searchable, paginated student directory."""
    page = paginate(_student_query())
    user_ids = [user.id for user in page["items"]]
    enrollments, completed = _counts_for(user_ids)
    page["items"] = [
        student_row(user, enrollments.get(user.id, 0), completed.get(user.id, 0))
        for user in page["items"]
    ]
    page["filters"] = {
        "q": (request.args.get("q") or "").strip() or None,
        "status": request.args.get("status"),
        "course_id": request.args.get("course_id"),
    }
    return jsonify(page), 200


@admin_bp.get("/students/export")
@admin_required
def export_students():
    """CSV of the permitted directory fields for the current filter."""
    students = _student_query().all()
    enrollments, completed = _counts_for([user.id for user in students])
    audit(
        "student.exported",
        entity_type="user",
        detail={"rows": len(students), "filters": dict(request.args)},
    )
    db.session.commit()
    return csv_response(
        "students.csv",
        [
            "id",
            "full_name",
            "email",
            "status",
            "email_verified",
            "created_at",
            "last_login_at",
            "enrollment_count",
            "completed_topics",
        ],
        (
            (
                user.id,
                user.full_name,
                user.email,
                user.status,
                "yes" if user.email_verified else "no",
                iso(user.created_at),
                iso(user.last_login_at),
                enrollments.get(user.id, 0),
                completed.get(user.id, 0),
            )
            for user in students
        ),
    )


@admin_bp.get("/students/<int:student_id>")
@admin_required
def get_student(student_id):
    """Profile, enrollments and aggregate study activity — no private content."""
    student = _student_or_404(student_id)

    enrollments = (
        Enrollment.query.filter(Enrollment.user_id == student.id)
        .order_by(Enrollment.enrolled_at.desc())
        .all()
    )
    stats = course_progress_bulk(
        student.id, [enrollment.course_id for enrollment in enrollments]
    )
    overall, _ = overall_completion(
        student.id, [enrollment.course_id for enrollment in enrollments]
    )

    since = utcnow() - timedelta(days=ACTIVITY_WINDOW_DAYS)
    session_row = (
        db.session.query(
            db.func.count(StudySession.id),
            db.func.coalesce(db.func.sum(StudySession.actual_minutes), 0),
            db.func.coalesce(db.func.sum(StudySession.planned_minutes), 0),
        )
        .filter(StudySession.user_id == student.id, StudySession.start_at >= since)
        .one()
    )
    focus_row = (
        db.session.query(
            db.func.count(FocusSession.id),
            db.func.coalesce(db.func.sum(FocusSession.focus_minutes), 0),
        )
        .filter(FocusSession.user_id == student.id, FocusSession.started_at >= since)
        .one()
    )
    tasks_by_status = dict(
        db.session.query(Task.status, db.func.count(Task.id))
        .filter(Task.user_id == student.id)
        .group_by(Task.status)
        .all()
    )

    return (
        jsonify(
            {
                "student": student_row(
                    student,
                    len(enrollments),
                    overall["completed_topics"],
                ),
                "enrollments": [
                    enrollment_admin(
                        enrollment, stats.get(enrollment.course_id, {})
                    )
                    for enrollment in enrollments
                ],
                "progress": overall,
                "activity": {
                    "window_days": ACTIVITY_WINDOW_DAYS,
                    "study_sessions": int(session_row[0]),
                    "studied_minutes": int(session_row[1]),
                    "planned_minutes": int(session_row[2]),
                    "focus_sessions": int(focus_row[0]),
                    "focus_minutes": int(focus_row[1]),
                    "tasks_by_status": {
                        key: int(value) for key, value in tasks_by_status.items()
                    },
                    "active_goals": Goal.query.filter(
                        Goal.user_id == student.id, Goal.status == "active"
                    ).count(),
                    "unread_notifications": Notification.query.filter(
                        Notification.user_id == student.id,
                        Notification.is_read.is_(False),
                    ).count(),
                    "private_uploads": Resource.query.filter(
                        Resource.owner_id == student.id
                    ).count(),
                },
                "account": {
                    "created_at": iso(student.created_at),
                    "last_login_at": iso(student.last_login_at),
                    "email_verified": student.email_verified,
                    "status": student.status,
                    "timezone": student.timezone,
                    "daily_target_minutes": student.daily_target_minutes,
                },
                "privacy_note": (
                    "Personal topic notes, private uploads and AI conversations "
                    "are not exposed through the admin API."
                ),
            }
        ),
        200,
    )


@admin_bp.patch("/students/<int:student_id>/status")
@admin_required
def set_student_status(student_id):
    """Activate, suspend or reset a student account to pending verification."""
    student = _student_or_404(student_id)
    body = get_json_body()
    status = validate_enum(body.get("status"), USER_STATUSES, "status")
    reason = clean_str(
        body.get("reason"), "reason", max_length=300, required=False
    )

    previous = student.status
    if previous == status:
        return (
            jsonify(
                {
                    "student": student_row(student),
                    "changed": False,
                    "message": f"The account is already {status}.",
                }
            ),
            200,
        )

    student.status = status
    if status == "active":
        student.email_verified = True
    elif status == "pending_verification":
        student.email_verified = False

    audit(
        "student.status_changed",
        entity_type="user",
        entity_id=student.id,
        detail={"from": previous, "to": status, "reason": reason},
    )
    db.session.commit()
    return (
        jsonify(
            {
                "student": student_row(student),
                "changed": True,
                "previous_status": previous,
                "message": f"Account status changed from {previous} to {status}.",
            }
        ),
        200,
    )


@admin_bp.post("/students/<int:student_id>/password-reset")
@admin_required
def issue_password_reset(student_id):
    """Issue a recovery token. An administrator never sees a password."""
    from flask import current_app

    student = _student_or_404(student_id)
    token = generate_reset_token(student)
    audit(
        "student.password_reset_issued",
        entity_type="user",
        entity_id=student.id,
        detail={"email": student.email},
    )
    db.session.commit()

    payload = {
        "message": (
            "A password recovery token has been issued for "
            f"{student.email}. The password itself is never visible."
        ),
        "expires_at": iso(student.reset_token_expires_at),
    }
    if current_app.config.get("EXPOSE_DEV_TOKENS"):
        payload["reset_token"] = token
        payload["dev_note"] = (
            "No email provider is configured, so this token is returned for "
            "testing and also written to the server log."
        )
    return jsonify(payload), 200


@admin_bp.post("/students/bulk")
@admin_required
def bulk_student_action():
    """Suspend or activate several accounts at once (PRD 4.3)."""
    body = get_json_body()
    raw_ids = body.get("ids")
    if not isinstance(raw_ids, list) or not raw_ids:
        raise ValidationError(
            "Select at least one student.",
            fields={"ids": "Provide a non-empty list of student ids."},
        )
    ids = []
    for value in raw_ids[:500]:
        ids.append(parse_int(value, "ids", minimum=1))
    action = validate_enum(
        body.get("action"), ("suspend", "activate", "require_verification"), "action"
    )
    reason = clean_str(body.get("reason"), "reason", max_length=300, required=False)

    target_status = {
        "suspend": "suspended",
        "activate": "active",
        "require_verification": "pending_verification",
    }[action]

    students = User.query.filter(
        User.id.in_(set(ids)), User.role == "student"
    ).all()
    updated = []
    for student in students:
        if student.status == target_status:
            continue
        student.status = target_status
        if target_status == "active":
            student.email_verified = True
        elif target_status == "pending_verification":
            student.email_verified = False
        updated.append(student.id)

    audit(
        "student.bulk_status_changed",
        entity_type="user",
        detail={
            "action": action,
            "status": target_status,
            "requested": len(set(ids)),
            "updated_ids": updated,
            "reason": reason,
        },
    )
    db.session.commit()
    return (
        jsonify(
            {
                "action": action,
                "status": target_status,
                "requested": len(set(ids)),
                "updated": len(updated),
                "updated_ids": updated,
                "skipped": len(students) - len(updated),
                "not_found": len(set(ids)) - len(students),
            }
        ),
        200,
    )


@admin_bp.get("/students/<int:student_id>/progress")
@admin_required
def student_progress(student_id):
    """Aggregate per-course progress for one student (no personal notes)."""
    student = _student_or_404(student_id)
    enrollments = Enrollment.query.filter(Enrollment.user_id == student.id).all()
    stats = course_progress_bulk(
        student.id, [enrollment.course_id for enrollment in enrollments]
    )
    return (
        jsonify(
            {
                "student_id": student.id,
                "courses": [
                    {
                        "course_id": enrollment.course_id,
                        "course_title": (
                            enrollment.course.title if enrollment.course else None
                        ),
                        "target_completion_date": iso_date(
                            enrollment.target_completion_date
                        ),
                        "progress": stats.get(enrollment.course_id, {}),
                    }
                    for enrollment in enrollments
                ],
            }
        ),
        200,
    )

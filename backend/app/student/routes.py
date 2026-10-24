"""Student dashboard, profile/settings and enrollment endpoints.

Every view is JWT protected and scoped to the caller: enrollment rows are
loaded through `get_owned_or_404`, so one student can never read or modify
another student's record.
"""

from flask import jsonify, request

from app.auth.services import hash_password, verify_password
from app.common.access import get_course_or_404
from app.common.decorators import current_user, get_owned_or_404, student_required
from app.common.errors import ConflictError, ValidationError
from app.common.notifications import generate_due_notifications
from app.common.progress import course_progress_bulk
from app.common.serializers import dump_json, enrollment_summary, user_profile
from app.common.validators import (
    clean_str,
    get_json_body,
    parse_date,
    parse_int,
    require_fields,
    validate_enum,
    validate_password,
)
from app.extensions import db
from app.models import (
    DIFFICULTY_LEVELS,
    ENROLLMENT_STATUSES,
    Enrollment,
    PRIORITIES,
    utcnow,
)
from app.student import student_bp
from app.student.dashboard_service import build_dashboard

WEEKDAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


# --- dashboard ----------------------------------------------------------


@student_bp.get("/dashboard")
@student_required
def dashboard():
    user = current_user()
    # Due reminders are generated on read because no background worker runs;
    # the dedupe key makes repeated loads idempotent.
    generate_due_notifications(user)
    return jsonify(build_dashboard(user)), 200


# --- profile & settings -------------------------------------------------


@student_bp.get("/profile")
@student_required
def get_profile():
    return jsonify({"user": user_profile(current_user())}), 200


@student_bp.patch("/profile")
@student_required
def update_profile():
    """Update profile and the study preferences the planner actually reads."""
    user = current_user()
    data = get_json_body()

    if "full_name" in data:
        user.full_name = clean_str(
            data.get("full_name"), "full_name", max_length=120, min_length=2
        )
    if "avatar_url" in data:
        user.avatar_url = clean_str(
            data.get("avatar_url"), "avatar_url", max_length=500, required=False
        )
    if "timezone" in data:
        user.timezone = clean_str(
            data.get("timezone"), "timezone", max_length=64, required=False
        ) or "UTC"
    if "language" in data:
        user.language = clean_str(
            data.get("language"), "language", max_length=10, required=False
        ) or "en"

    numeric_fields = {
        "daily_target_minutes": (15, 1440),
        "weekly_target_minutes": (30, 10080),
        "focus_duration_minutes": (5, 180),
        "short_break_minutes": (0, 60),
        "long_break_minutes": (0, 120),
    }
    for field, (minimum, maximum) in numeric_fields.items():
        if field in data:
            setattr(
                user,
                field,
                parse_int(
                    data.get(field), field, minimum=minimum, maximum=maximum
                ),
            )

    if "availability" in data or "availability_json" in data:
        raw = data.get("availability", data.get("availability_json"))
        user.availability_json = dump_json(_validate_availability(raw))
    if "notification_prefs" in data or "notification_prefs_json" in data:
        raw = data.get("notification_prefs", data.get("notification_prefs_json"))
        user.notification_prefs_json = dump_json(_validate_flag_map(raw, "notification_prefs"))
    if "accessibility_prefs" in data:
        user.accessibility_prefs_json = dump_json(
            _validate_flag_map(data.get("accessibility_prefs"), "accessibility_prefs")
        )

    db.session.commit()
    return jsonify({"user": user_profile(user)}), 200


@student_bp.post("/profile/password")
@student_required
def change_own_password():
    """Password change for the student settings page (same policy as /auth)."""
    user = current_user()
    data = get_json_body()
    require_fields(data, ["current_password", "new_password"])

    if not verify_password(user, data.get("current_password")):
        raise ValidationError(
            "The current password is incorrect.",
            fields={"current_password": "This password does not match our records."},
        )
    new_password = validate_password(data.get("new_password"), field="new_password")
    if new_password == data.get("current_password"):
        raise ValidationError(
            "The new password must be different from the current one.",
            fields={"new_password": "Choose a different password."},
        )
    user.password_hash = hash_password(new_password)
    db.session.commit()
    return jsonify({"message": "Password changed."}), 200


def _validate_availability(raw):
    """``{"mon":[{"start":"18:00","end":"21:00"}], ...}`` with real time checks."""
    if raw in (None, "", {}):
        return {}
    if not isinstance(raw, dict):
        raise ValidationError(
            "Invalid availability.",
            fields={"availability": "Expected an object keyed by weekday."},
        )
    cleaned = {}
    for key, windows in raw.items():
        day = str(key).strip().lower()[:3]
        if day not in WEEKDAY_KEYS:
            raise ValidationError(
                "Invalid availability.",
                fields={"availability": f"Unknown weekday '{key}'."},
            )
        if not isinstance(windows, list):
            raise ValidationError(
                "Invalid availability.",
                fields={"availability": f"'{day}' must be a list of windows."},
            )
        parsed = []
        for window in windows:
            if not isinstance(window, dict):
                raise ValidationError(
                    "Invalid availability.",
                    fields={"availability": "Each window needs start and end."},
                )
            start = _clock(window.get("start"), day)
            end = _clock(window.get("end"), day)
            if end <= start:
                raise ValidationError(
                    "Invalid availability.",
                    fields={
                        "availability": f"'{day}' window end must be after its start."
                    },
                )
            parsed.append({"start": start, "end": end})
        cleaned[day] = sorted(parsed, key=lambda item: item["start"])
    return cleaned


def _clock(value, day):
    text = str(value or "").strip()
    parts = text.split(":")
    try:
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError
    except (TypeError, ValueError) as exc:
        raise ValidationError(
            "Invalid availability.",
            fields={"availability": f"'{day}' needs times in HH:MM form."},
        ) from exc
    return f"{hour:02d}:{minute:02d}"


def _validate_flag_map(raw, field):
    if raw in (None, ""):
        return {}
    if not isinstance(raw, dict):
        raise ValidationError(
            "Invalid preferences.", fields={field: "Expected an object."}
        )
    return {str(key): bool(value) for key, value in raw.items()}


# --- enrollments --------------------------------------------------------


@student_bp.get("/enrollments")
@student_required
def list_enrollments():
    user = current_user()
    query = Enrollment.query.filter(Enrollment.user_id == user.id)
    status = request.args.get("status")
    if status:
        validate_enum(status, ENROLLMENT_STATUSES, "status")
        query = query.filter(Enrollment.status == status)
    enrollments = query.order_by(
        Enrollment.status.asc(), Enrollment.enrolled_at.desc()
    ).all()

    progress = course_progress_bulk(
        user.id, [enrollment.course_id for enrollment in enrollments]
    )
    items = []
    for enrollment in enrollments:
        stats = progress.get(enrollment.course_id, {})
        payload = enrollment_summary(
            enrollment, progress_percent=stats.get("completion_percent", 0.0)
        )
        payload["progress"] = stats
        items.append(payload)
    return jsonify({"items": items, "total": len(items)}), 200


@student_bp.post("/enrollments")
@student_required
def create_enrollment():
    user = current_user()
    data = get_json_body()
    require_fields(data, ["course_id"])
    course_id = parse_int(data.get("course_id"), "course_id", minimum=1)

    # Only published courses are enrollable.
    course = get_course_or_404(course_id, published_only=True)

    existing = Enrollment.query.filter_by(user_id=user.id, course_id=course.id).first()
    if existing is not None:
        if existing.status == "dropped":
            existing.status = "active"
            existing.enrolled_at = utcnow()
            db.session.commit()
            return (
                jsonify({"enrollment": enrollment_summary(existing), "reactivated": True}),
                200,
            )
        raise ConflictError("You are already enrolled in this course.")

    enrollment = Enrollment(
        user_id=user.id,
        course_id=course.id,
        target_completion_date=parse_date(
            data.get("target_completion_date"), "target_completion_date", required=False
        ),
        priority=validate_enum(
            data.get("priority"), PRIORITIES, "priority", required=False, default="medium"
        ),
        difficulty=validate_enum(
            data.get("difficulty"),
            DIFFICULTY_LEVELS,
            "difficulty",
            required=False,
            default="medium",
        ),
        status="active",
        last_accessed_at=utcnow(),
    )
    db.session.add(enrollment)
    db.session.commit()
    return jsonify({"enrollment": enrollment_summary(enrollment)}), 201


@student_bp.patch("/enrollments/<int:enrollment_id>")
@student_required
def update_enrollment(enrollment_id):
    enrollment = get_owned_or_404(Enrollment, enrollment_id)
    data = get_json_body()

    if "target_completion_date" in data:
        enrollment.target_completion_date = parse_date(
            data.get("target_completion_date"), "target_completion_date", required=False
        )
    if "priority" in data:
        enrollment.priority = validate_enum(
            data.get("priority"), PRIORITIES, "priority"
        )
    if "difficulty" in data:
        enrollment.difficulty = validate_enum(
            data.get("difficulty"), DIFFICULTY_LEVELS, "difficulty"
        )
    if "status" in data:
        enrollment.status = validate_enum(
            data.get("status"), ENROLLMENT_STATUSES, "status"
        )
    db.session.commit()
    return jsonify({"enrollment": enrollment_summary(enrollment)}), 200


@student_bp.delete("/enrollments/<int:enrollment_id>")
@student_required
def delete_enrollment(enrollment_id):
    """Un-enroll. Topic progress rows are deliberately kept (PRD 3.4)."""
    enrollment = get_owned_or_404(Enrollment, enrollment_id)
    db.session.delete(enrollment)
    db.session.commit()
    return "", 204

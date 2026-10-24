"""Syllabus tree, per-topic progress and revision queue (PRD 3.4).

Progress is always written against `get_jwt_identity()`; a topic is only
readable or writable when the caller holds an enrollment in the owning course,
so one student can never see or change another student's progress.
"""

from flask import jsonify, request

from app.common.access import (
    get_course_or_404,
    require_enrollment,
    require_topic_in_enrolled_course,
    touch_enrollment,
)
from app.common.achievements import evaluate_achievements
from app.common.decorators import current_user, student_required
from app.common.errors import NotFoundError, ValidationError
from app.common.progress import published_version_for
from app.common.serializers import topic_progress_summary
from app.common.validators import (
    clean_str,
    get_json_body,
    parse_bool,
    parse_date,
    parse_int,
    validate_enum,
)
from app.extensions import db
from app.models import (
    PRIORITIES,
    PROGRESS_STATUSES,
    SyllabusUnit,
    Topic,
    TopicProgress,
    utcnow,
)
from app.syllabus import syllabus_bp
from app.syllabus.tree_service import build_syllabus_tree, recompute_scope


@syllabus_bp.get("/courses/<int:course_id>/syllabus")
@student_required
def course_syllabus(course_id):
    user = current_user()
    course = get_course_or_404(course_id, published_only=False)
    enrollment = require_enrollment(user.id, course.id)

    version = published_version_for(course.id)
    if version is None:
        raise NotFoundError("This course has no published syllabus yet.")

    filters = {
        "status": validate_enum(
            request.args.get("status"),
            PROGRESS_STATUSES,
            "status",
            required=False,
        ),
        "priority": validate_enum(
            request.args.get("priority"), PRIORITIES, "priority", required=False
        ),
        "due_before": parse_date(
            request.args.get("due_before"), "due_before", required=False
        ),
        "needs_revision": parse_bool(
            request.args.get("needs_revision"), "needs_revision", required=False
        ),
        "q": (request.args.get("q") or "").strip() or None,
    }
    subject_id = parse_int(
        request.args.get("subject_id"), "subject_id", minimum=1, required=False
    )

    tree = build_syllabus_tree(user.id, course, version, filters)
    if subject_id:
        tree["subjects"] = [
            subject for subject in tree["subjects"] if subject["id"] == subject_id
        ]

    touch_enrollment(enrollment)
    db.session.commit()

    tree["enrollment"] = {
        "id": enrollment.id,
        "status": enrollment.status,
        "priority": enrollment.priority,
        "difficulty": enrollment.difficulty,
        "target_completion_date": (
            enrollment.target_completion_date.isoformat()
            if enrollment.target_completion_date
            else None
        ),
    }
    return jsonify(tree), 200


@syllabus_bp.get("/topics/<int:topic_id>/progress")
@student_required
def get_topic_progress(topic_id):
    user = current_user()
    topic, _ = require_topic_in_enrolled_course(user.id, topic_id)
    progress = TopicProgress.query.filter_by(
        user_id=user.id, topic_id=topic.id
    ).first()
    return (
        jsonify(
            {
                "topic": {
                    "id": topic.id,
                    "title": topic.title,
                    "estimated_minutes": topic.estimated_minutes,
                },
                "progress": topic_progress_summary(progress),
            }
        ),
        200,
    )


@syllabus_bp.patch("/topics/<int:topic_id>/progress")
@student_required
def update_topic_progress(topic_id):
    """Upsert the caller's own progress row for one topic."""
    user = current_user()
    topic, course_id = require_topic_in_enrolled_course(user.id, topic_id)
    data = get_json_body()

    progress = TopicProgress.query.filter_by(
        user_id=user.id, topic_id=topic.id
    ).first()
    if progress is None:
        progress = TopicProgress(user_id=user.id, topic_id=topic.id)
        db.session.add(progress)

    if "status" in data:
        new_status = validate_enum(data.get("status"), PROGRESS_STATUSES, "status")
        progress.status = new_status
        progress.completed_at = utcnow() if new_status == "completed" else None

    if "time_spent_minutes" in data:
        progress.time_spent_minutes = parse_int(
            data.get("time_spent_minutes"),
            "time_spent_minutes",
            minimum=0,
            maximum=100000,
        )
    if "add_time_minutes" in data:
        extra = parse_int(
            data.get("add_time_minutes"), "add_time_minutes", minimum=1, maximum=1440
        )
        progress.time_spent_minutes = (progress.time_spent_minutes or 0) + extra

    if "notes" in data:
        progress.notes = clean_str(
            data.get("notes"), "notes", max_length=5000, required=False
        )
    if "priority" in data:
        progress.priority = validate_enum(data.get("priority"), PRIORITIES, "priority")
    if "target_date" in data:
        progress.target_date = parse_date(
            data.get("target_date"), "target_date", required=False
        )
    if "needs_revision" in data:
        progress.needs_revision = bool(
            parse_bool(data.get("needs_revision"), "needs_revision", default=False)
        )
    if "next_revision_date" in data:
        progress.next_revision_date = parse_date(
            data.get("next_revision_date"), "next_revision_date", required=False
        )

    if progress.needs_revision and progress.next_revision_date is None:
        raise ValidationError(
            "A revision date is required.",
            fields={
                "next_revision_date": (
                    "Set the next revision date when marking a topic for revision."
                )
            },
        )

    db.session.commit()

    newly_earned = evaluate_achievements(user.id)
    scope = recompute_scope(user.id, topic)

    return (
        jsonify(
            {
                "progress": topic_progress_summary(progress),
                "rollup": scope,
                "course_id": course_id,
                "achievements_earned": newly_earned,
            }
        ),
        200,
    )


@syllabus_bp.get("/revisions")
@student_required
def revision_queue():
    """Topics the student flagged for revision, soonest first."""
    user = current_user()
    due_before = parse_date(
        request.args.get("due_before"), "due_before", required=False
    )

    query = (
        db.session.query(TopicProgress, Topic, SyllabusUnit)
        .join(Topic, TopicProgress.topic_id == Topic.id)
        .join(SyllabusUnit, Topic.unit_id == SyllabusUnit.id)
        .filter(
            TopicProgress.user_id == user.id,
            TopicProgress.needs_revision.is_(True),
        )
    )
    if due_before:
        query = query.filter(TopicProgress.next_revision_date <= due_before)

    rows = query.order_by(
        TopicProgress.next_revision_date.asc(), Topic.id.asc()
    ).all()

    today = utcnow().date()
    items = []
    for progress, topic, unit in rows:
        items.append(
            {
                "topic_id": topic.id,
                "title": topic.title,
                "estimated_minutes": topic.estimated_minutes,
                "difficulty": topic.difficulty,
                "importance": topic.importance,
                "subject_id": unit.subject_id,
                "subject_name": unit.subject.name if unit.subject else None,
                "course_id": unit.version.course_id if unit.version else None,
                "next_revision_date": (
                    progress.next_revision_date.isoformat()
                    if progress.next_revision_date
                    else None
                ),
                "is_overdue": bool(
                    progress.next_revision_date
                    and progress.next_revision_date < today
                ),
                "progress": topic_progress_summary(progress),
            }
        )
    overdue = sum(1 for item in items if item["is_overdue"])
    return (
        jsonify({"items": items, "total": len(items), "overdue": overdue}),
        200,
    )

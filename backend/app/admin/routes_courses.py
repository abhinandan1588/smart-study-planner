"""Course management and lifecycle (PRD 4.4).

Lifecycle rules:

* ``draft`` → ``published`` → ``archived``; a course can also be moved back to
  ``draft`` (unpublished) or re-published from ``archived``.
* Unpublishing or archiving a course that students are enrolled in removes it
  from the catalogue, so it is refused with 409 and an enrollment-impact report
  unless the caller repeats the request with ``confirm=true``. Enrollments and
  ``topic_progress`` rows are always preserved — the course is never deleted
  while anybody is enrolled, so archived courses keep their historical progress
  (PRD 4.4 "Preserve historical progress for archived courses").
* ``DELETE`` archives. A hard delete is only possible for a course with no
  enrollments and no syllabus versions.
"""

from flask import jsonify, request

from app.admin import admin_bp
from app.admin.helpers import audit, get_or_404, unique_slug
from app.admin.serializers import course_admin, subject_admin, version_summary
from app.common.decorators import admin_required, current_user_id
from app.common.errors import ConflictError, NotFoundError, ValidationError
from app.common.pagination import paginate
from app.common.validators import (
    clean_str,
    get_json_body,
    parse_bool,
    parse_float,
    parse_int,
    validate_enum,
)
from app.extensions import db
from app.models import (
    COURSE_CATEGORIES,
    COURSE_STATUSES,
    Course,
    CourseSubject,
    Enrollment,
    Resource,
    Subject,
    SyllabusUnit,
    SyllabusVersion,
    Topic,
    utcnow,
)

SORTABLE = {
    "title": Course.title,
    "created_at": Course.created_at,
    "updated_at": Course.updated_at,
    "status": Course.status,
}


# --- helpers ------------------------------------------------------------


def _course_counts(course_ids):
    """Subject / topic / enrollment counts for a batch of courses."""
    if not course_ids:
        return {}
    out = {cid: {"subject_count": 0, "topic_count": 0, "enrollment_count": 0,
                 "active_enrollment_count": 0, "syllabus_version_count": 0}
           for cid in course_ids}

    for row in (
        db.session.query(CourseSubject.course_id, db.func.count(CourseSubject.id))
        .filter(CourseSubject.course_id.in_(course_ids))
        .group_by(CourseSubject.course_id)
        .all()
    ):
        out[row[0]]["subject_count"] = int(row[1])

    for row in (
        db.session.query(SyllabusVersion.course_id, db.func.count(Topic.id))
        .select_from(SyllabusVersion)
        .join(SyllabusUnit, SyllabusUnit.syllabus_version_id == SyllabusVersion.id)
        .join(Topic, Topic.unit_id == SyllabusUnit.id)
        .filter(
            SyllabusVersion.course_id.in_(course_ids),
            SyllabusVersion.status == "published",
        )
        .group_by(SyllabusVersion.course_id)
        .all()
    ):
        out[row[0]]["topic_count"] = int(row[1])

    for row in (
        db.session.query(SyllabusVersion.course_id, db.func.count(SyllabusVersion.id))
        .filter(SyllabusVersion.course_id.in_(course_ids))
        .group_by(SyllabusVersion.course_id)
        .all()
    ):
        out[row[0]]["syllabus_version_count"] = int(row[1])

    for row in (
        db.session.query(Enrollment.course_id, db.func.count(Enrollment.id))
        .filter(Enrollment.course_id.in_(course_ids))
        .group_by(Enrollment.course_id)
        .all()
    ):
        out[row[0]]["enrollment_count"] = int(row[1])

    for row in (
        db.session.query(Enrollment.course_id, db.func.count(Enrollment.id))
        .filter(
            Enrollment.course_id.in_(course_ids), Enrollment.status == "active"
        )
        .group_by(Enrollment.course_id)
        .all()
    ):
        out[row[0]]["active_enrollment_count"] = int(row[1])

    return out


def enrollment_impact(course):
    """What would be affected by taking this course out of the catalogue."""
    total = Enrollment.query.filter(Enrollment.course_id == course.id).count()
    active = Enrollment.query.filter(
        Enrollment.course_id == course.id, Enrollment.status == "active"
    ).count()
    progress_rows = (
        db.session.query(db.func.count(db.distinct(Enrollment.user_id)))
        .filter(Enrollment.course_id == course.id)
        .scalar()
        or 0
    )
    return {
        "enrollments": total,
        "active_enrollments": active,
        "students_with_records": int(progress_rows),
        "topic_progress_preserved": True,
    }


def _confirmed():
    if parse_bool(request.args.get("confirm"), "confirm", default=False):
        return True
    body = request.get_json(silent=True)
    if isinstance(body, dict):
        return bool(parse_bool(body.get("confirm"), "confirm", default=False))
    return False


def _guard_status_change(course, new_status):
    """Refuse a catalogue-removing status change until it is confirmed."""
    if new_status == course.status or course.status != "published":
        return
    if new_status not in ("draft", "archived"):
        return
    impact = enrollment_impact(course)
    if impact["active_enrollments"] == 0 or _confirmed():
        return
    raise ConflictError(
        (
            f"{impact['active_enrollments']} student(s) are actively enrolled in "
            f"'{course.title}'. Repeat the request with confirm=true to "
            f"{'archive' if new_status == 'archived' else 'unpublish'} it. "
            "Existing enrollments and topic progress are preserved."
        ),
        extra={"impact": impact, "requires_confirmation": True},
    )


def _apply_status(course, new_status):
    previous = course.status
    if previous == new_status:
        return previous, False
    _guard_status_change(course, new_status)
    if new_status == "published":
        _require_publishable(course)
    course.status = new_status
    return previous, True


def _require_publishable(course):
    if not course.title or not course.category:
        raise ValidationError("A course needs a title and a category to publish.")


# --- course CRUD --------------------------------------------------------


@admin_bp.get("/courses")
@admin_required
def list_courses():
    query = Course.query

    search = (request.args.get("q") or "").strip()
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            db.or_(
                Course.title.ilike(pattern),
                Course.slug.ilike(pattern),
                Course.description.ilike(pattern),
            )
        )

    status = request.args.get("status")
    if status:
        validate_enum(status, COURSE_STATUSES, "status")
        query = query.filter(Course.status == status)

    category = request.args.get("category")
    if category:
        validate_enum(category, COURSE_CATEGORIES, "category")
        query = query.filter(Course.category == category)

    sort = (request.args.get("sort") or "-updated_at").strip()
    descending = sort.startswith("-")
    column = SORTABLE.get(sort.lstrip("-"), Course.updated_at)
    query = query.order_by(
        column.desc() if descending else column.asc(), Course.id.desc()
    )

    page = paginate(query)
    counts = _course_counts([course.id for course in page["items"]])
    page["items"] = [
        course_admin(course, counts.get(course.id)) for course in page["items"]
    ]
    return jsonify(page), 200


@admin_bp.post("/courses")
@admin_required
def create_course():
    body = get_json_body()
    title = clean_str(body.get("title"), "title", max_length=200, min_length=3)
    category = validate_enum(body.get("category"), COURSE_CATEGORIES, "category")
    raw_slug = body.get("slug")
    slug = unique_slug(
        Course, raw_slug or title, explicit=bool(raw_slug and str(raw_slug).strip())
    )
    status = validate_enum(
        body.get("status"), COURSE_STATUSES, "status", required=False, default="draft"
    )

    course = Course(
        title=title,
        slug=slug,
        description=clean_str(
            body.get("description"), "description", max_length=5000, required=False
        ),
        category=category,
        level=clean_str(body.get("level"), "level", max_length=50, required=False),
        thumbnail_url=clean_str(
            body.get("thumbnail_url"), "thumbnail_url", max_length=500, required=False
        ),
        estimated_duration_weeks=parse_int(
            body.get("estimated_duration_weeks"),
            "estimated_duration_weeks",
            minimum=1,
            maximum=520,
            required=False,
        ),
        target_audience=clean_str(
            body.get("target_audience"),
            "target_audience",
            max_length=300,
            required=False,
        ),
        status=status,
        created_by=current_user_id(),
    )
    db.session.add(course)
    db.session.flush()

    audit(
        "course.created",
        entity_type="course",
        entity_id=course.id,
        detail={"title": course.title, "slug": course.slug, "status": course.status},
    )
    db.session.commit()
    return jsonify({"course": course_admin(course, _course_counts([course.id]).get(course.id))}), 201


@admin_bp.get("/courses/<int:course_id>")
@admin_required
def get_course(course_id):
    course = get_or_404(Course, course_id, "course")
    counts = _course_counts([course.id]).get(course.id)

    links = (
        CourseSubject.query.filter(CourseSubject.course_id == course.id)
        .order_by(CourseSubject.display_order.asc(), CourseSubject.id.asc())
        .all()
    )
    versions = (
        SyllabusVersion.query.filter(SyllabusVersion.course_id == course.id)
        .order_by(SyllabusVersion.version_number.desc())
        .all()
    )
    topic_counts = _version_topic_counts([version.id for version in versions])

    return (
        jsonify(
            {
                "course": course_admin(course, counts),
                "subjects": [
                    subject_admin(link.subject, link=link)
                    for link in links
                    if link.subject is not None
                ],
                "syllabus_versions": [
                    version_summary(version, topic_counts.get(version.id))
                    for version in versions
                ],
                "impact": enrollment_impact(course),
                "resource_count": Resource.query.filter(
                    Resource.course_id == course.id
                ).count(),
            }
        ),
        200,
    )


def _version_topic_counts(version_ids):
    if not version_ids:
        return {}
    unit_rows = (
        db.session.query(
            SyllabusUnit.syllabus_version_id, db.func.count(SyllabusUnit.id)
        )
        .filter(SyllabusUnit.syllabus_version_id.in_(version_ids))
        .group_by(SyllabusUnit.syllabus_version_id)
        .all()
    )
    topic_rows = (
        db.session.query(
            SyllabusUnit.syllabus_version_id, db.func.count(Topic.id)
        )
        .select_from(SyllabusUnit)
        .join(Topic, Topic.unit_id == SyllabusUnit.id)
        .filter(SyllabusUnit.syllabus_version_id.in_(version_ids))
        .group_by(SyllabusUnit.syllabus_version_id)
        .all()
    )
    units = {row[0]: int(row[1]) for row in unit_rows}
    topics = {row[0]: int(row[1]) for row in topic_rows}
    return {
        version_id: {
            "unit_count": units.get(version_id, 0),
            "topic_count": topics.get(version_id, 0),
        }
        for version_id in version_ids
    }


@admin_bp.patch("/courses/<int:course_id>")
@admin_required
def update_course(course_id):
    course = get_or_404(Course, course_id, "course")
    body = get_json_body()
    changes = {}

    if "title" in body:
        course.title = clean_str(body["title"], "title", max_length=200, min_length=3)
        changes["title"] = course.title
    if "slug" in body and body["slug"]:
        course.slug = unique_slug(
            Course, body["slug"], exclude_id=course.id, explicit=True
        )
        changes["slug"] = course.slug
    if "description" in body:
        course.description = clean_str(
            body["description"], "description", max_length=5000, required=False
        )
        changes["description"] = True
    if "category" in body:
        course.category = validate_enum(
            body["category"], COURSE_CATEGORIES, "category"
        )
        changes["category"] = course.category
    if "level" in body:
        course.level = clean_str(
            body["level"], "level", max_length=50, required=False
        )
        changes["level"] = course.level
    if "thumbnail_url" in body:
        course.thumbnail_url = clean_str(
            body["thumbnail_url"], "thumbnail_url", max_length=500, required=False
        )
    if "estimated_duration_weeks" in body:
        course.estimated_duration_weeks = parse_int(
            body["estimated_duration_weeks"],
            "estimated_duration_weeks",
            minimum=1,
            maximum=520,
            required=False,
        )
    if "target_audience" in body:
        course.target_audience = clean_str(
            body["target_audience"], "target_audience", max_length=300, required=False
        )

    status_changed = False
    previous_status = course.status
    if "status" in body:
        new_status = validate_enum(body["status"], COURSE_STATUSES, "status")
        previous_status, status_changed = _apply_status(course, new_status)
        if status_changed:
            changes["status"] = {"from": previous_status, "to": course.status}

    audit(
        "course.status_changed" if status_changed else "course.updated",
        entity_type="course",
        entity_id=course.id,
        detail={"changes": changes} if changes else {"changes": "metadata"},
    )
    db.session.commit()

    payload = {
        "course": course_admin(course, _course_counts([course.id]).get(course.id)),
        "impact": enrollment_impact(course),
    }
    if status_changed:
        payload["previous_status"] = previous_status
    return jsonify(payload), 200


@admin_bp.post("/courses/<int:course_id>/publish")
@admin_required
def publish_course(course_id):
    """Publish a course so eligible students can see and enrol in it."""
    course = get_or_404(Course, course_id, "course")
    previous, changed = _apply_status(course, "published")
    published_version = course.published_version
    audit(
        "course.published",
        entity_type="course",
        entity_id=course.id,
        detail={"from": previous, "to": "published"},
    )
    db.session.commit()
    return (
        jsonify(
            {
                "course": course_admin(
                    course, _course_counts([course.id]).get(course.id)
                ),
                "changed": changed,
                "previous_status": previous,
                "published_syllabus_version": (
                    published_version.version_number if published_version else None
                ),
                "warning": (
                    None
                    if published_version
                    else "This course has no published syllabus version yet."
                ),
            }
        ),
        200,
    )


@admin_bp.post("/courses/<int:course_id>/unpublish")
@admin_required
def unpublish_course(course_id):
    """Move a published course back to draft (enrollments are preserved)."""
    course = get_or_404(Course, course_id, "course")
    previous, changed = _apply_status(course, "draft")
    audit(
        "course.unpublished",
        entity_type="course",
        entity_id=course.id,
        detail={"from": previous, "to": "draft", "impact": enrollment_impact(course)},
    )
    db.session.commit()
    return (
        jsonify(
            {
                "course": course_admin(
                    course, _course_counts([course.id]).get(course.id)
                ),
                "changed": changed,
                "previous_status": previous,
                "impact": enrollment_impact(course),
            }
        ),
        200,
    )


@admin_bp.delete("/courses/<int:course_id>")
@admin_required
def archive_course(course_id):
    """Archive a course. `?hard=true` only works when nothing depends on it."""
    course = get_or_404(Course, course_id, "course")
    impact = enrollment_impact(course)
    hard = parse_bool(request.args.get("hard"), "hard", default=False)

    if hard:
        if impact["enrollments"] or course.syllabus_versions:
            raise ConflictError(
                "This course has enrollments or syllabus versions and cannot be "
                "hard-deleted. Archive it instead so historical progress is kept.",
                extra={"impact": impact},
            )
        audit(
            "course.deleted",
            entity_type="course",
            entity_id=course.id,
            detail={"title": course.title, "slug": course.slug},
        )
        db.session.delete(course)
        db.session.commit()
        return "", 204

    previous, changed = _apply_status(course, "archived")
    audit(
        "course.archived",
        entity_type="course",
        entity_id=course.id,
        detail={"from": previous, "to": "archived", "impact": impact},
    )
    db.session.commit()
    return (
        jsonify(
            {
                "course": course_admin(
                    course, _course_counts([course.id]).get(course.id)
                ),
                "changed": changed,
                "previous_status": previous,
                "impact": impact,
                "message": (
                    "Course archived. Enrollments and topic progress are preserved."
                ),
            }
        ),
        200,
    )


# --- course ↔ subject links --------------------------------------------


@admin_bp.get("/courses/<int:course_id>/subjects")
@admin_required
def list_course_subjects(course_id):
    course = get_or_404(Course, course_id, "course")
    links = (
        CourseSubject.query.filter(CourseSubject.course_id == course.id)
        .order_by(CourseSubject.display_order.asc(), CourseSubject.id.asc())
        .all()
    )
    return (
        jsonify(
            {
                "course_id": course.id,
                "items": [
                    subject_admin(link.subject, link=link)
                    for link in links
                    if link.subject is not None
                ],
                "total": len(links),
            }
        ),
        200,
    )


@admin_bp.post("/courses/<int:course_id>/subjects")
@admin_required
def link_subject(course_id):
    course = get_or_404(Course, course_id, "course")
    body = get_json_body()
    subject_id = parse_int(body.get("subject_id"), "subject_id", minimum=1)
    subject = db.session.get(Subject, subject_id)
    if subject is None:
        raise NotFoundError("That subject was not found.")

    existing = CourseSubject.query.filter_by(
        course_id=course.id, subject_id=subject.id
    ).first()
    if existing is not None:
        raise ConflictError("That subject is already linked to this course.")

    next_order = (
        db.session.query(db.func.coalesce(db.func.max(CourseSubject.display_order), -1))
        .filter(CourseSubject.course_id == course.id)
        .scalar()
    ) + 1

    link = CourseSubject(
        course_id=course.id,
        subject_id=subject.id,
        display_order=parse_int(
            body.get("display_order"),
            "display_order",
            minimum=0,
            required=False,
            default=next_order,
        ),
        weightage=parse_float(
            body.get("weightage"), "weightage", minimum=0, maximum=100, required=False
        ),
    )
    db.session.add(link)
    audit(
        "course.subject_linked",
        entity_type="course",
        entity_id=course.id,
        detail={"subject_id": subject.id, "subject": subject.name},
    )
    db.session.commit()
    return jsonify({"subject": subject_admin(subject, link=link)}), 201


@admin_bp.delete("/courses/<int:course_id>/subjects/<int:subject_id>")
@admin_required
def unlink_subject(course_id, subject_id):
    course = get_or_404(Course, course_id, "course")
    link = CourseSubject.query.filter_by(
        course_id=course.id, subject_id=subject_id
    ).first()
    if link is None:
        raise NotFoundError("That subject is not linked to this course.")

    units = SyllabusUnit.query.join(
        SyllabusVersion, SyllabusUnit.syllabus_version_id == SyllabusVersion.id
    ).filter(
        SyllabusVersion.course_id == course.id, SyllabusUnit.subject_id == subject_id
    ).count()
    if units and not _confirmed():
        raise ConflictError(
            f"This subject still holds {units} syllabus unit(s) in this course. "
            "Repeat the request with confirm=true to unlink it; the syllabus "
            "rows and student progress are left untouched.",
            extra={"syllabus_units": units, "requires_confirmation": True},
        )

    db.session.delete(link)
    audit(
        "course.subject_unlinked",
        entity_type="course",
        entity_id=course.id,
        detail={"subject_id": subject_id, "syllabus_units": units},
    )
    db.session.commit()
    return "", 204


@admin_bp.patch("/courses/<int:course_id>/subjects/reorder")
@admin_required
def reorder_course_subjects(course_id):
    course = get_or_404(Course, course_id, "course")
    body = get_json_body()
    order = body.get("order")
    if not isinstance(order, list) or not order:
        raise ValidationError(
            "Provide the new order.",
            fields={"order": "A list of {subject_id, display_order} is required."},
        )

    links = {
        link.subject_id: link
        for link in CourseSubject.query.filter(
            CourseSubject.course_id == course.id
        ).all()
    }
    updated = 0
    for entry in order:
        if not isinstance(entry, dict):
            raise ValidationError(
                "Invalid order entry.",
                fields={"order": "Each entry must be an object."},
            )
        subject_id = parse_int(entry.get("subject_id"), "subject_id", minimum=1)
        link = links.get(subject_id)
        if link is None:
            continue
        link.display_order = parse_int(
            entry.get("display_order"), "display_order", minimum=0
        )
        updated += 1

    audit(
        "course.subjects_reordered",
        entity_type="course",
        entity_id=course.id,
        detail={"updated": updated},
    )
    db.session.commit()

    refreshed = (
        CourseSubject.query.filter(CourseSubject.course_id == course.id)
        .order_by(CourseSubject.display_order.asc(), CourseSubject.id.asc())
        .all()
    )
    return (
        jsonify(
            {
                "updated": updated,
                "items": [
                    subject_admin(link.subject, link=link)
                    for link in refreshed
                    if link.subject is not None
                ],
            }
        ),
        200,
    )


@admin_bp.get("/courses/<int:course_id>/enrollments")
@admin_required
def list_course_enrollments(course_id):
    """Who is enrolled in a course — used before archiving (PRD 4.6)."""
    course = get_or_404(Course, course_id, "course")
    query = (
        Enrollment.query.filter(Enrollment.course_id == course.id)
        .order_by(Enrollment.enrolled_at.desc())
    )
    status = request.args.get("status")
    if status:
        validate_enum(status, ("active", "completed", "dropped"), "status")
        query = query.filter(Enrollment.status == status)

    page = paginate(query)
    page["items"] = [
        {
            "enrollment_id": enrollment.id,
            "student_id": enrollment.user_id,
            "student_name": enrollment.user.full_name if enrollment.user else None,
            "student_email": enrollment.user.email if enrollment.user else None,
            "status": enrollment.status,
            "enrolled_at": enrollment.enrolled_at.isoformat()
            if enrollment.enrolled_at
            else None,
        }
        for enrollment in page["items"]
    ]
    page["course_id"] = course.id
    page["impact"] = enrollment_impact(course)
    return jsonify(page), 200


@admin_bp.get("/courses/<int:course_id>/preview")
@admin_required
def preview_course(course_id):
    """Draft preview: the student-facing course shape before publication."""
    course = get_or_404(Course, course_id, "course")
    counts = _course_counts([course.id]).get(course.id)
    version = course.published_version or (
        SyllabusVersion.query.filter(SyllabusVersion.course_id == course.id)
        .order_by(SyllabusVersion.version_number.desc())
        .first()
    )
    return (
        jsonify(
            {
                "course": course_admin(course, counts),
                "syllabus_version": version_summary(version) if version else None,
                "visible_to_students": course.status == "published",
                "previewed_at": utcnow().isoformat(),
            }
        ),
        200,
    )

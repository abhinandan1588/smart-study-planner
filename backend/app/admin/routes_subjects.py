"""Subject management (PRD 4.5).

Subjects are shared across courses through the many-to-many
``course_subjects`` link, so a subject is archived rather than deleted and
student records are never removed as a side effect.
"""

from flask import jsonify, request

from app.admin import admin_bp
from app.admin.helpers import audit, get_or_404, unique_slug
from app.admin.serializers import subject_admin
from app.common.decorators import admin_required
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
    SUBJECT_STATUSES,
    Course,
    CourseSubject,
    Subject,
    SyllabusUnit,
    SyllabusVersion,
    Topic,
    TopicProgress,
)

SORTABLE = {
    "name": Subject.name,
    "created_at": Subject.created_at,
    "updated_at": Subject.updated_at,
    "status": Subject.status,
}


def _subject_counts(subject_ids):
    if not subject_ids:
        return {}
    out = {
        sid: {"course_count": 0, "unit_count": 0, "topic_count": 0}
        for sid in subject_ids
    }
    for row in (
        db.session.query(CourseSubject.subject_id, db.func.count(CourseSubject.id))
        .filter(CourseSubject.subject_id.in_(subject_ids))
        .group_by(CourseSubject.subject_id)
        .all()
    ):
        out[row[0]]["course_count"] = int(row[1])
    for row in (
        db.session.query(SyllabusUnit.subject_id, db.func.count(SyllabusUnit.id))
        .filter(SyllabusUnit.subject_id.in_(subject_ids))
        .group_by(SyllabusUnit.subject_id)
        .all()
    ):
        out[row[0]]["unit_count"] = int(row[1])
    for row in (
        db.session.query(SyllabusUnit.subject_id, db.func.count(Topic.id))
        .select_from(SyllabusUnit)
        .join(Topic, Topic.unit_id == SyllabusUnit.id)
        .filter(SyllabusUnit.subject_id.in_(subject_ids))
        .group_by(SyllabusUnit.subject_id)
        .all()
    ):
        out[row[0]]["topic_count"] = int(row[1])
    return out


@admin_bp.get("/subjects")
@admin_required
def list_subjects():
    query = Subject.query

    search = (request.args.get("q") or "").strip()
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            db.or_(Subject.name.ilike(pattern), Subject.slug.ilike(pattern))
        )

    status = request.args.get("status")
    if status:
        validate_enum(status, SUBJECT_STATUSES, "status")
        query = query.filter(Subject.status == status)

    course_id = parse_int(
        request.args.get("course_id"), "course_id", minimum=1, required=False
    )
    if course_id:
        linked = db.session.query(CourseSubject.subject_id).filter(
            CourseSubject.course_id == course_id
        )
        query = query.filter(Subject.id.in_(linked))

    sort = (request.args.get("sort") or "name").strip()
    descending = sort.startswith("-")
    column = SORTABLE.get(sort.lstrip("-"), Subject.name)
    query = query.order_by(
        column.desc() if descending else column.asc(), Subject.id.asc()
    )

    page = paginate(query)
    counts = _subject_counts([subject.id for subject in page["items"]])
    links = {}
    if course_id:
        links = {
            link.subject_id: link
            for link in CourseSubject.query.filter(
                CourseSubject.course_id == course_id
            ).all()
        }
    page["items"] = [
        subject_admin(
            subject, counts.get(subject.id), link=links.get(subject.id)
        )
        for subject in page["items"]
    ]
    if course_id:
        page["items"].sort(key=lambda row: (row.get("display_order") or 0, row["name"]))
    return jsonify(page), 200


@admin_bp.post("/subjects")
@admin_required
def create_subject():
    body = get_json_body()
    name = clean_str(body.get("name"), "name", max_length=200, min_length=2)
    raw_slug = body.get("slug")
    subject = Subject(
        name=name,
        slug=unique_slug(
            Subject, raw_slug or name, explicit=bool(raw_slug and str(raw_slug).strip())
        ),
        description=clean_str(
            body.get("description"), "description", max_length=3000, required=False
        ),
        weightage=parse_float(
            body.get("weightage"), "weightage", minimum=0, maximum=100, required=False
        ),
        status=validate_enum(
            body.get("status"),
            SUBJECT_STATUSES,
            "status",
            required=False,
            default="active",
        ),
    )
    db.session.add(subject)
    db.session.flush()

    # Optionally attach to a course in the same request.
    course_id = parse_int(body.get("course_id"), "course_id", minimum=1, required=False)
    link = None
    if course_id:
        course = db.session.get(Course, course_id)
        if course is None:
            raise NotFoundError("That course was not found.")
        next_order = (
            db.session.query(
                db.func.coalesce(db.func.max(CourseSubject.display_order), -1)
            )
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
            weightage=subject.weightage,
        )
        db.session.add(link)

    audit(
        "subject.created",
        entity_type="subject",
        entity_id=subject.id,
        detail={"name": subject.name, "slug": subject.slug, "course_id": course_id},
    )
    db.session.commit()
    return (
        jsonify(
            {
                "subject": subject_admin(
                    subject, _subject_counts([subject.id]).get(subject.id), link=link
                )
            }
        ),
        201,
    )


@admin_bp.get("/subjects/<int:subject_id>")
@admin_required
def get_subject(subject_id):
    subject = get_or_404(Subject, subject_id, "subject")
    counts = _subject_counts([subject.id]).get(subject.id)

    links = (
        CourseSubject.query.filter(CourseSubject.subject_id == subject.id)
        .order_by(CourseSubject.course_id.asc())
        .all()
    )
    units = (
        SyllabusUnit.query.filter(
            SyllabusUnit.subject_id == subject.id, SyllabusUnit.parent_id.is_(None)
        )
        .order_by(SyllabusUnit.display_order.asc(), SyllabusUnit.id.asc())
        .all()
    )
    topic_counts = {
        row[0]: int(row[1])
        for row in db.session.query(Topic.unit_id, db.func.count(Topic.id))
        .filter(Topic.unit_id.in_([unit.id for unit in units] or [0]))
        .group_by(Topic.unit_id)
        .all()
    }

    return (
        jsonify(
            {
                "subject": subject_admin(subject, counts),
                "courses": [
                    {
                        "course_id": link.course_id,
                        "course_title": link.course.title if link.course else None,
                        "course_status": link.course.status if link.course else None,
                        "display_order": link.display_order,
                        "weightage": link.weightage,
                    }
                    for link in links
                ],
                "units": [
                    {
                        "id": unit.id,
                        "title": unit.title,
                        "unit_type": unit.unit_type,
                        "display_order": unit.display_order,
                        "syllabus_version_id": unit.syllabus_version_id,
                        "topic_count": topic_counts.get(unit.id, 0),
                    }
                    for unit in units
                ],
            }
        ),
        200,
    )


@admin_bp.patch("/subjects/<int:subject_id>")
@admin_required
def update_subject(subject_id):
    subject = get_or_404(Subject, subject_id, "subject")
    body = get_json_body()
    changes = {}

    if "name" in body:
        subject.name = clean_str(body["name"], "name", max_length=200, min_length=2)
        changes["name"] = subject.name
    if "slug" in body and body["slug"]:
        subject.slug = unique_slug(
            Subject, body["slug"], exclude_id=subject.id, explicit=True
        )
        changes["slug"] = subject.slug
    if "description" in body:
        subject.description = clean_str(
            body["description"], "description", max_length=3000, required=False
        )
    if "weightage" in body:
        subject.weightage = parse_float(
            body["weightage"], "weightage", minimum=0, maximum=100, required=False
        )
        changes["weightage"] = subject.weightage
    if "status" in body:
        new_status = validate_enum(body["status"], SUBJECT_STATUSES, "status")
        if new_status != subject.status:
            changes["status"] = {"from": subject.status, "to": new_status}
            subject.status = new_status

    audit(
        "subject.updated",
        entity_type="subject",
        entity_id=subject.id,
        detail={"changes": changes},
    )
    db.session.commit()
    return (
        jsonify(
            {
                "subject": subject_admin(
                    subject, _subject_counts([subject.id]).get(subject.id)
                )
            }
        ),
        200,
    )


@admin_bp.delete("/subjects/<int:subject_id>")
@admin_required
def archive_subject(subject_id):
    """Archive a subject. Syllabus rows and student progress are preserved."""
    subject = get_or_404(Subject, subject_id, "subject")
    counts = _subject_counts([subject.id]).get(subject.id)
    hard = parse_bool(request.args.get("hard"), "hard", default=False)

    progress_rows = (
        db.session.query(db.func.count(TopicProgress.id))
        .select_from(TopicProgress)
        .join(Topic, TopicProgress.topic_id == Topic.id)
        .join(SyllabusUnit, Topic.unit_id == SyllabusUnit.id)
        .filter(SyllabusUnit.subject_id == subject.id)
        .scalar()
        or 0
    )

    if hard:
        if counts["unit_count"] or progress_rows:
            raise ConflictError(
                "This subject still has syllabus units or student progress and "
                "cannot be deleted. Archive it instead.",
                extra={"impact": {**counts, "progress_rows": int(progress_rows)}},
            )
        audit(
            "subject.deleted",
            entity_type="subject",
            entity_id=subject.id,
            detail={"name": subject.name},
        )
        db.session.delete(subject)
        db.session.commit()
        return "", 204

    if subject.status == "archived":
        return (
            jsonify(
                {
                    "subject": subject_admin(subject, counts),
                    "changed": False,
                    "message": "This subject is already archived.",
                }
            ),
            200,
        )

    subject.status = "archived"
    audit(
        "subject.archived",
        entity_type="subject",
        entity_id=subject.id,
        detail={**counts, "progress_rows": int(progress_rows)},
    )
    db.session.commit()
    return (
        jsonify(
            {
                "subject": subject_admin(subject, counts),
                "changed": True,
                "impact": {**counts, "progress_rows": int(progress_rows)},
                "message": (
                    "Subject archived. Syllabus units, topics and student "
                    "progress are preserved."
                ),
            }
        ),
        200,
    )


@admin_bp.patch("/subjects/reorder")
@admin_required
def reorder_subjects():
    """Reorder subjects inside one course (PRD 4.5)."""
    body = get_json_body()
    course_id = parse_int(body.get("course_id"), "course_id", minimum=1)
    items = body.get("items") or body.get("order")
    if not isinstance(items, list) or not items:
        raise ValidationError(
            "Provide the new order.",
            fields={"items": "A list of {subject_id, display_order} is required."},
        )
    course = db.session.get(Course, course_id)
    if course is None:
        raise NotFoundError("That course was not found.")

    links = {
        link.subject_id: link
        for link in CourseSubject.query.filter(
            CourseSubject.course_id == course_id
        ).all()
    }
    updated = 0
    for entry in items:
        if not isinstance(entry, dict):
            raise ValidationError(
                "Invalid order entry.", fields={"items": "Each entry must be an object."}
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
        "subject.reordered",
        entity_type="course",
        entity_id=course_id,
        detail={"updated": updated},
    )
    db.session.commit()

    refreshed = (
        CourseSubject.query.filter(CourseSubject.course_id == course_id)
        .order_by(CourseSubject.display_order.asc(), CourseSubject.id.asc())
        .all()
    )
    return (
        jsonify(
            {
                "course_id": course_id,
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


@admin_bp.get("/subjects/<int:subject_id>/units")
@admin_required
def subject_units(subject_id):
    """Units and topic counts for a subject, optionally scoped to a version."""
    subject = get_or_404(Subject, subject_id, "subject")
    version_id = parse_int(
        request.args.get("version_id"), "version_id", minimum=1, required=False
    )
    query = SyllabusUnit.query.filter(SyllabusUnit.subject_id == subject.id)
    if version_id:
        query = query.filter(SyllabusUnit.syllabus_version_id == version_id)
    else:
        course_id = parse_int(
            request.args.get("course_id"), "course_id", minimum=1, required=False
        )
        if course_id:
            version_ids = db.session.query(SyllabusVersion.id).filter(
                SyllabusVersion.course_id == course_id
            )
            query = query.filter(SyllabusUnit.syllabus_version_id.in_(version_ids))

    units = query.order_by(
        SyllabusUnit.display_order.asc(), SyllabusUnit.id.asc()
    ).all()
    topic_counts = {
        row[0]: int(row[1])
        for row in db.session.query(Topic.unit_id, db.func.count(Topic.id))
        .filter(Topic.unit_id.in_([unit.id for unit in units] or [0]))
        .group_by(Topic.unit_id)
        .all()
    }
    return (
        jsonify(
            {
                "subject_id": subject.id,
                "items": [
                    {
                        "id": unit.id,
                        "title": unit.title,
                        "unit_type": unit.unit_type,
                        "parent_id": unit.parent_id,
                        "display_order": unit.display_order,
                        "syllabus_version_id": unit.syllabus_version_id,
                        "topic_count": topic_counts.get(unit.id, 0),
                    }
                    for unit in units
                ],
                "total": len(units),
            }
        ),
        200,
    )

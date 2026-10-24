"""Syllabus management: versions, units, chapters, topics, reorder, import.

See ``app/admin/syllabus_service.py`` for the versioning contract that keeps
student ``topic_progress`` rows intact across a syllabus revision (PRD 4.6).
"""

from flask import jsonify, request

from app.admin import admin_bp
from app.admin.helpers import audit, get_or_404
from app.admin.serializers import topic_admin, unit_admin, version_summary
from app.admin.syllabus_service import (
    create_draft_version,
    import_csv,
    latest_version,
    migrate_progress,
    progress_impact_for_topics,
    progress_impact_for_units,
    publish_version,
    unit_subtree_ids,
)
from app.common.decorators import admin_required
from app.common.errors import ConflictError, NotFoundError, ValidationError
from app.common.validators import (
    clean_str,
    get_json_body,
    parse_bool,
    parse_int,
    validate_enum,
)
from app.extensions import db
from app.models import (
    DIFFICULTIES,
    IMPORTANCES,
    SYLLABUS_VERSION_STATUSES,
    UNIT_TYPES,
    Course,
    Subject,
    SyllabusUnit,
    SyllabusVersion,
    Topic,
)
from app.syllabus.tree_service import build_syllabus_tree


# --- helpers ------------------------------------------------------------


def _resolve_version(require=True):
    """Resolve the target version from `version_id` or `course_id`."""
    version_id = parse_int(
        request.args.get("version_id"), "version_id", minimum=1, required=False
    )
    if version_id:
        return get_or_404(SyllabusVersion, version_id, "syllabus version")

    course_id = parse_int(
        request.args.get("course_id"), "course_id", minimum=1, required=False
    )
    if course_id:
        get_or_404(Course, course_id, "course")
        version = latest_version(course_id, status="published") or latest_version(
            course_id
        )
        if version is None and require:
            raise NotFoundError("That course has no syllabus version yet.")
        return version

    if require:
        raise ValidationError(
            "Specify which syllabus to load.",
            fields={"course_id": "Provide course_id or version_id."},
        )
    return None


def _version_tree(version):
    """Full admin tree: subjects → units → chapters → topics."""
    units = (
        SyllabusUnit.query.filter(SyllabusUnit.syllabus_version_id == version.id)
        .order_by(SyllabusUnit.display_order.asc(), SyllabusUnit.id.asc())
        .all()
    )
    unit_ids = [unit.id for unit in units]
    topics = (
        Topic.query.filter(Topic.unit_id.in_(unit_ids or [0]))
        .order_by(Topic.display_order.asc(), Topic.id.asc())
        .all()
    )
    topics_by_unit = {}
    for topic in topics:
        topics_by_unit.setdefault(topic.unit_id, []).append(topic)

    children = {}
    roots_by_subject = {}
    for unit in units:
        if unit.parent_id:
            children.setdefault(unit.parent_id, []).append(unit)
        else:
            roots_by_subject.setdefault(unit.subject_id, []).append(unit)

    impact = progress_impact_for_topics([topic.id for topic in topics])

    def node(unit):
        own_topics = topics_by_unit.get(unit.id, [])
        data = unit_admin(unit, topic_count=len(own_topics))
        data["topics"] = [topic_admin(topic) for topic in own_topics]
        data["children"] = [node(child) for child in children.get(unit.id, [])]
        return data

    subject_ids = list(roots_by_subject.keys())
    subjects = {
        subject.id: subject
        for subject in Subject.query.filter(Subject.id.in_(subject_ids or [0])).all()
    }
    subject_nodes = []
    for subject_id, roots in roots_by_subject.items():
        subject = subjects.get(subject_id)
        subject_nodes.append(
            {
                "id": subject_id,
                "name": subject.name if subject else None,
                "slug": subject.slug if subject else None,
                "status": subject.status if subject else None,
                "units": [node(unit) for unit in roots],
            }
        )
    subject_nodes.sort(key=lambda row: (row["name"] or ""))

    return {
        "version": version_summary(
            version, {"unit_count": len(units), "topic_count": len(topics)}
        ),
        "subjects": subject_nodes,
        "totals": {
            "units": len([unit for unit in units if unit.parent_id is None]),
            "chapters": len([unit for unit in units if unit.parent_id is not None]),
            "topics": len(topics),
            "estimated_minutes": sum(topic.estimated_minutes or 0 for topic in topics),
        },
        "student_impact": impact,
    }


# --- read ---------------------------------------------------------------


@admin_bp.get("/syllabus")
@admin_required
def get_syllabus():
    version = _resolve_version()
    payload = _version_tree(version)
    course = db.session.get(Course, version.course_id)
    payload["course"] = {
        "id": course.id,
        "title": course.title,
        "slug": course.slug,
        "status": course.status,
    } if course else None
    payload["versions"] = [
        version_summary(row)
        for row in SyllabusVersion.query.filter(
            SyllabusVersion.course_id == version.course_id
        )
        .order_by(SyllabusVersion.version_number.desc())
        .all()
    ]
    return jsonify(payload), 200


@admin_bp.get("/syllabus/versions")
@admin_required
def list_versions():
    course_id = parse_int(request.args.get("course_id"), "course_id", minimum=1)
    get_or_404(Course, course_id, "course")
    versions = (
        SyllabusVersion.query.filter(SyllabusVersion.course_id == course_id)
        .order_by(SyllabusVersion.version_number.desc())
        .all()
    )
    counts = {}
    for version in versions:
        unit_count = SyllabusUnit.query.filter(
            SyllabusUnit.syllabus_version_id == version.id
        ).count()
        topic_count = (
            db.session.query(db.func.count(Topic.id))
            .select_from(Topic)
            .join(SyllabusUnit, Topic.unit_id == SyllabusUnit.id)
            .filter(SyllabusUnit.syllabus_version_id == version.id)
            .scalar()
            or 0
        )
        counts[version.id] = {
            "unit_count": unit_count,
            "topic_count": int(topic_count),
        }
    return (
        jsonify(
            {
                "course_id": course_id,
                "items": [
                    version_summary(version, counts.get(version.id))
                    for version in versions
                ],
                "total": len(versions),
            }
        ),
        200,
    )


@admin_bp.get("/syllabus/preview")
@admin_required
def preview_syllabus():
    """The exact shape a student sees, for any version, with no progress data."""
    version = _resolve_version()
    course = get_or_404(Course, version.course_id, "course")
    # user_id=0 never matches a progress row, so the preview shows the
    # structure without leaking any individual student's records.
    tree = build_syllabus_tree(0, course, version)
    tree["preview"] = True
    return jsonify(tree), 200


# --- versions -----------------------------------------------------------


@admin_bp.post("/syllabus/versions")
@admin_required
def create_version():
    """New draft version. By default it clones the published tree."""
    body = get_json_body()
    course_id = parse_int(body.get("course_id"), "course_id", minimum=1)
    course = get_or_404(Course, course_id, "course")
    notes = clean_str(body.get("notes"), "notes", max_length=2000, required=False)

    source_id = parse_int(
        body.get("clone_from_version_id"),
        "clone_from_version_id",
        minimum=1,
        required=False,
    )
    clone_from = None
    if source_id:
        clone_from = get_or_404(SyllabusVersion, source_id, "syllabus version")
        if clone_from.course_id != course.id:
            raise ValidationError(
                "The source version belongs to a different course.",
                fields={"clone_from_version_id": "Must belong to the same course."},
            )

    should_clone = parse_bool(body.get("clone"), "clone", default=True)
    if should_clone or clone_from is not None:
        version, stats = create_draft_version(
            course, notes=notes, clone_from=clone_from
        )
    else:
        version, stats = _empty_version(course, notes)

    audit(
        "syllabus.version_created",
        entity_type="syllabus_version",
        entity_id=version.id,
        detail={"course_id": course.id, "version": version.version_number, **stats},
    )
    db.session.commit()
    return (
        jsonify(
            {
                "version": version_summary(
                    version,
                    {"unit_count": stats["units"], "topic_count": stats["topics"]},
                ),
                "cloned": stats,
                "message": (
                    "Draft version created. Students keep reading the published "
                    "version until this draft is published."
                ),
            }
        ),
        201,
    )


def _empty_version(course, notes):
    from app.admin.syllabus_service import next_version_number

    version = SyllabusVersion(
        course_id=course.id,
        version_number=next_version_number(course.id),
        status="draft",
        notes=notes,
    )
    db.session.add(version)
    db.session.flush()
    return version, {"units": 0, "topics": 0, "cloned_from": None}


@admin_bp.patch("/syllabus/versions/<int:version_id>")
@admin_required
def update_version(version_id):
    """Change a version's notes, or publish / archive it."""
    version = get_or_404(SyllabusVersion, version_id, "syllabus version")
    body = get_json_body()
    report = None

    if "notes" in body:
        version.notes = clean_str(
            body["notes"], "notes", max_length=2000, required=False
        )

    if "status" in body:
        new_status = validate_enum(
            body["status"], SYLLABUS_VERSION_STATUSES, "status"
        )
        if new_status != version.status:
            if new_status == "published":
                report = publish_version(version)
                audit(
                    "syllabus.version_published",
                    entity_type="syllabus_version",
                    entity_id=version.id,
                    detail=report,
                )
            elif new_status == "archived":
                impact = progress_impact_for_units(
                    [
                        row[0]
                        for row in db.session.query(SyllabusUnit.id)
                        .filter(SyllabusUnit.syllabus_version_id == version.id)
                        .all()
                    ]
                )
                version.status = "archived"
                audit(
                    "syllabus.version_archived",
                    entity_type="syllabus_version",
                    entity_id=version.id,
                    detail=impact,
                )
            else:
                version.status = new_status
                audit(
                    "syllabus.version_updated",
                    entity_type="syllabus_version",
                    entity_id=version.id,
                    detail={"status": new_status},
                )
    elif "notes" in body:
        audit(
            "syllabus.version_updated",
            entity_type="syllabus_version",
            entity_id=version.id,
            detail={"notes": True},
        )

    db.session.commit()
    payload = {"version": version_summary(version)}
    if report is not None:
        payload["publication"] = report
    return jsonify(payload), 200


@admin_bp.post("/syllabus/versions/<int:version_id>/publish")
@admin_required
def publish_syllabus_version(version_id):
    version = get_or_404(SyllabusVersion, version_id, "syllabus version")
    report = publish_version(version)
    audit(
        "syllabus.version_published",
        entity_type="syllabus_version",
        entity_id=version.id,
        detail=report,
    )
    db.session.commit()
    return jsonify({"version": version_summary(version), "publication": report}), 200


@admin_bp.post("/syllabus/versions/<int:version_id>/migrate-progress")
@admin_required
def migrate_version_progress(version_id):
    """Re-run the progress migration for a cloned version (idempotent)."""
    version = get_or_404(SyllabusVersion, version_id, "syllabus version")
    created = migrate_progress(version)
    audit(
        "syllabus.progress_migrated",
        entity_type="syllabus_version",
        entity_id=version.id,
        detail={"created_progress_rows": created},
    )
    db.session.commit()
    return (
        jsonify(
            {
                "version_id": version.id,
                "created_progress_rows": created,
                "message": (
                    "Existing rows were left untouched; only missing progress "
                    "rows were copied forward."
                ),
            }
        ),
        200,
    )


@admin_bp.get("/syllabus/versions/<int:version_id>/impact")
@admin_required
def version_impact(version_id):
    """Enrollment / progress impact of changing this version (PRD 4.6)."""
    version = get_or_404(SyllabusVersion, version_id, "syllabus version")
    unit_ids = [
        row[0]
        for row in db.session.query(SyllabusUnit.id)
        .filter(SyllabusUnit.syllabus_version_id == version.id)
        .all()
    ]
    from app.models import Enrollment

    enrollments = Enrollment.query.filter(
        Enrollment.course_id == version.course_id
    ).count()
    return (
        jsonify(
            {
                "version": version_summary(version),
                "enrollments": enrollments,
                "progress": progress_impact_for_units(unit_ids),
                "guidance": (
                    "Create a new draft version and publish it instead of editing "
                    "a published structure; publishing copies progress forward."
                ),
            }
        ),
        200,
    )


# --- units / chapters / topics -----------------------------------------


def _writable_version(version_id):
    version = get_or_404(SyllabusVersion, version_id, "syllabus version")
    if version.status == "archived":
        raise ConflictError(
            "This syllabus version is archived. Create a new draft version to "
            "make changes."
        )
    return version


@admin_bp.post("/syllabus")
@admin_required
def create_syllabus_item():
    """Create a unit, a chapter (unit with a parent) or a topic."""
    body = get_json_body()
    kind = validate_enum(body.get("kind"), ("unit", "chapter", "topic"), "kind")

    if kind in ("unit", "chapter"):
        version = _writable_version(
            parse_int(body.get("syllabus_version_id"), "syllabus_version_id", minimum=1)
        )
        subject_id = parse_int(body.get("subject_id"), "subject_id", minimum=1)
        subject = db.session.get(Subject, subject_id)
        if subject is None:
            raise NotFoundError("That subject was not found.")

        parent_id = parse_int(
            body.get("parent_id"), "parent_id", minimum=1, required=False
        )
        parent = None
        if parent_id:
            parent = db.session.get(SyllabusUnit, parent_id)
            if parent is None or parent.syllabus_version_id != version.id:
                raise ValidationError(
                    "Invalid parent unit.",
                    fields={"parent_id": "Must be a unit of the same version."},
                )
            if parent.parent_id is not None:
                raise ValidationError(
                    "Chapters cannot be nested further.",
                    fields={"parent_id": "A chapter may not contain another chapter."},
                )
        unit_type = validate_enum(
            body.get("unit_type"),
            UNIT_TYPES,
            "unit_type",
            required=False,
            default="chapter" if parent_id else "unit",
        )
        if parent_id and unit_type != "chapter":
            unit_type = "chapter"

        next_order = (
            db.session.query(
                db.func.coalesce(db.func.max(SyllabusUnit.display_order), -1)
            )
            .filter(
                SyllabusUnit.syllabus_version_id == version.id,
                SyllabusUnit.subject_id == subject_id,
                (
                    SyllabusUnit.parent_id == parent_id
                    if parent_id
                    else SyllabusUnit.parent_id.is_(None)
                ),
            )
            .scalar()
        ) + 1

        unit = SyllabusUnit(
            syllabus_version_id=version.id,
            subject_id=subject_id,
            parent_id=parent_id,
            title=clean_str(body.get("title"), "title", max_length=250, min_length=2),
            description=clean_str(
                body.get("description"), "description", max_length=4000, required=False
            ),
            unit_type=unit_type,
            display_order=parse_int(
                body.get("display_order"),
                "display_order",
                minimum=0,
                required=False,
                default=next_order,
            ),
        )
        db.session.add(unit)
        db.session.flush()
        audit(
            "syllabus.unit_created",
            entity_type="syllabus_unit",
            entity_id=unit.id,
            detail={
                "kind": unit_type,
                "title": unit.title,
                "version_id": version.id,
                "subject_id": subject_id,
            },
        )
        db.session.commit()
        return jsonify({"kind": unit_type, "unit": unit_admin(unit, 0)}), 201

    # --- topic -----------------------------------------------------------
    unit_id = parse_int(body.get("unit_id"), "unit_id", minimum=1)
    unit = db.session.get(SyllabusUnit, unit_id)
    if unit is None:
        raise NotFoundError("That syllabus unit was not found.")
    _writable_version(unit.syllabus_version_id)

    next_order = (
        db.session.query(db.func.coalesce(db.func.max(Topic.display_order), -1))
        .filter(Topic.unit_id == unit.id)
        .scalar()
    ) + 1

    topic = Topic(
        unit_id=unit.id,
        title=clean_str(body.get("title"), "title", max_length=250, min_length=2),
        description=clean_str(
            body.get("description"), "description", max_length=4000, required=False
        ),
        estimated_minutes=parse_int(
            body.get("estimated_minutes"),
            "estimated_minutes",
            minimum=1,
            maximum=10000,
            required=False,
            default=60,
        ),
        difficulty=validate_enum(
            body.get("difficulty"),
            DIFFICULTIES,
            "difficulty",
            required=False,
            default="medium",
        ),
        importance=validate_enum(
            body.get("importance"),
            IMPORTANCES,
            "importance",
            required=False,
            default="medium",
        ),
        display_order=parse_int(
            body.get("display_order"),
            "display_order",
            minimum=0,
            required=False,
            default=next_order,
        ),
    )
    db.session.add(topic)
    db.session.flush()
    audit(
        "syllabus.topic_created",
        entity_type="topic",
        entity_id=topic.id,
        detail={"title": topic.title, "unit_id": unit.id},
    )
    db.session.commit()
    return jsonify({"kind": "topic", "topic": topic_admin(topic)}), 201


@admin_bp.patch("/syllabus/<int:item_id>")
@admin_required
def update_syllabus_item(item_id):
    """Edit a unit/chapter or a topic. Metadata edits never touch progress."""
    body = get_json_body()
    kind = validate_enum(
        body.get("kind") or request.args.get("kind"),
        ("unit", "chapter", "topic"),
        "kind",
    )

    if kind in ("unit", "chapter"):
        unit = get_or_404(SyllabusUnit, item_id, "syllabus unit")
        _writable_version(unit.syllabus_version_id)
        if "title" in body:
            unit.title = clean_str(
                body["title"], "title", max_length=250, min_length=2
            )
        if "description" in body:
            unit.description = clean_str(
                body["description"], "description", max_length=4000, required=False
            )
        if "unit_type" in body:
            unit.unit_type = validate_enum(body["unit_type"], UNIT_TYPES, "unit_type")
        if "display_order" in body:
            unit.display_order = parse_int(
                body["display_order"], "display_order", minimum=0
            )
        if "subject_id" in body:
            subject_id = parse_int(body["subject_id"], "subject_id", minimum=1)
            if db.session.get(Subject, subject_id) is None:
                raise NotFoundError("That subject was not found.")
            unit.subject_id = subject_id
        audit(
            "syllabus.unit_updated",
            entity_type="syllabus_unit",
            entity_id=unit.id,
            detail={"title": unit.title},
        )
        db.session.commit()
        return jsonify({"kind": unit.unit_type, "unit": unit_admin(unit)}), 200

    topic = get_or_404(Topic, item_id, "topic")
    unit = topic.unit
    if unit is not None:
        _writable_version(unit.syllabus_version_id)
    if "title" in body:
        topic.title = clean_str(body["title"], "title", max_length=250, min_length=2)
    if "description" in body:
        topic.description = clean_str(
            body["description"], "description", max_length=4000, required=False
        )
    if "estimated_minutes" in body:
        topic.estimated_minutes = parse_int(
            body["estimated_minutes"],
            "estimated_minutes",
            minimum=1,
            maximum=10000,
        )
    if "difficulty" in body:
        topic.difficulty = validate_enum(body["difficulty"], DIFFICULTIES, "difficulty")
    if "importance" in body:
        topic.importance = validate_enum(body["importance"], IMPORTANCES, "importance")
    if "display_order" in body:
        topic.display_order = parse_int(
            body["display_order"], "display_order", minimum=0
        )
    if "unit_id" in body:
        new_unit_id = parse_int(body["unit_id"], "unit_id", minimum=1)
        new_unit = db.session.get(SyllabusUnit, new_unit_id)
        if new_unit is None:
            raise NotFoundError("That syllabus unit was not found.")
        _writable_version(new_unit.syllabus_version_id)
        topic.unit_id = new_unit.id

    audit(
        "syllabus.topic_updated",
        entity_type="topic",
        entity_id=topic.id,
        detail={"title": topic.title},
    )
    db.session.commit()
    return (
        jsonify(
            {
                "kind": "topic",
                "topic": topic_admin(topic),
                "progress_preserved": True,
            }
        ),
        200,
    )


@admin_bp.delete("/syllabus/<int:item_id>")
@admin_required
def delete_syllabus_item(item_id):
    """Delete a unit/chapter or topic. Refused when students have progress."""
    kind = validate_enum(request.args.get("kind"), ("unit", "chapter", "topic"), "kind")
    force = parse_bool(request.args.get("force"), "force", default=False)

    if kind in ("unit", "chapter"):
        unit = get_or_404(SyllabusUnit, item_id, "syllabus unit")
        _writable_version(unit.syllabus_version_id)
        unit_ids = unit_subtree_ids(unit)
        impact = progress_impact_for_units(unit_ids)
        if impact["progress_rows"] and not force:
            raise ConflictError(
                f"{impact['students']} student(s) have progress on "
                f"{impact['progress_rows']} topic(s) under '{unit.title}'. "
                "Create a new draft version instead, or repeat with force=true "
                "to delete the structure and its progress rows.",
                extra={"impact": impact, "requires_force": True},
            )
        audit(
            "syllabus.unit_deleted",
            entity_type="syllabus_unit",
            entity_id=unit.id,
            detail={"title": unit.title, "forced": force, "impact": impact},
        )
        db.session.delete(unit)
        db.session.commit()
        return "", 204

    topic = get_or_404(Topic, item_id, "topic")
    if topic.unit is not None:
        _writable_version(topic.unit.syllabus_version_id)
    impact = progress_impact_for_topics([topic.id])
    if impact["progress_rows"] and not force:
        raise ConflictError(
            f"{impact['students']} student(s) have progress on '{topic.title}'. "
            "Repeat with force=true to delete it and their progress rows.",
            extra={"impact": impact, "requires_force": True},
        )
    audit(
        "syllabus.topic_deleted",
        entity_type="topic",
        entity_id=topic.id,
        detail={"title": topic.title, "forced": force, "impact": impact},
    )
    db.session.delete(topic)
    db.session.commit()
    return "", 204


@admin_bp.patch("/syllabus/reorder")
@admin_required
def reorder_syllabus():
    """Reorder units/chapters or topics in one call."""
    body = get_json_body()
    kind = validate_enum(body.get("kind"), ("unit", "chapter", "topic"), "kind")
    items = body.get("items")
    if not isinstance(items, list) or not items:
        raise ValidationError(
            "Provide the new order.",
            fields={"items": "A list of {id, display_order} is required."},
        )

    model = Topic if kind == "topic" else SyllabusUnit
    updated = []
    for entry in items:
        if not isinstance(entry, dict):
            raise ValidationError(
                "Invalid order entry.", fields={"items": "Each entry must be an object."}
            )
        row_id = parse_int(entry.get("id"), "id", minimum=1)
        row = db.session.get(model, row_id)
        if row is None:
            continue
        if kind == "topic":
            if row.unit is not None:
                _writable_version(row.unit.syllabus_version_id)
            if "unit_id" in entry:
                new_unit_id = parse_int(entry["unit_id"], "unit_id", minimum=1)
                new_unit = db.session.get(SyllabusUnit, new_unit_id)
                if new_unit is None:
                    raise NotFoundError("That syllabus unit was not found.")
                row.unit_id = new_unit.id
        else:
            _writable_version(row.syllabus_version_id)
            if "parent_id" in entry:
                parent_id = parse_int(
                    entry["parent_id"], "parent_id", minimum=1, required=False
                )
                if parent_id:
                    parent = db.session.get(SyllabusUnit, parent_id)
                    if parent is None or parent.id == row.id:
                        raise ValidationError(
                            "Invalid parent unit.",
                            fields={"parent_id": "Must be another unit."},
                        )
                    row.parent_id = parent.id
                    row.unit_type = "chapter"
                else:
                    row.parent_id = None
                    row.unit_type = "unit"
        row.display_order = parse_int(
            entry.get("display_order"), "display_order", minimum=0
        )
        updated.append(row.id)

    audit(
        "syllabus.reordered",
        entity_type="topic" if kind == "topic" else "syllabus_unit",
        detail={"kind": kind, "updated": updated},
    )
    db.session.commit()
    return jsonify({"kind": kind, "updated": len(updated), "ids": updated}), 200


# --- CSV bulk import ----------------------------------------------------


@admin_bp.post("/syllabus/import")
@admin_required
def import_syllabus():
    """Bulk-import a syllabus structure from a validated CSV file.

    Columns: ``subject, unit, chapter, topic, estimated_minutes, difficulty,
    importance, description``. Every row is validated before anything is
    written; rejected rows come back individually in ``report.errors``.
    """
    version_id = parse_int(
        request.form.get("syllabus_version_id") or request.args.get("syllabus_version_id"),
        "syllabus_version_id",
        minimum=1,
        required=False,
    )
    if version_id:
        version = _writable_version(version_id)
    else:
        course_id = parse_int(
            request.form.get("course_id") or request.args.get("course_id"),
            "course_id",
            minimum=1,
        )
        course = get_or_404(Course, course_id, "course")
        version = latest_version(course.id, status="draft")
        if version is None:
            version, _ = create_draft_version(
                course, notes="Created automatically for a CSV import."
            )

    upload = request.files.get("file")
    if upload is None or not upload.filename:
        raise ValidationError(
            "A CSV file is required.", fields={"file": "Attach a .csv file."}
        )
    if not upload.filename.lower().endswith(".csv"):
        raise ValidationError(
            "Only .csv files can be imported.",
            fields={"file": "The file must have a .csv extension."},
        )
    raw = upload.read()
    if not raw:
        raise ValidationError(
            "The CSV file is empty.", fields={"file": "The file has no content."}
        )

    create_subjects = parse_bool(
        request.form.get("create_subjects"), "create_subjects", default=True
    )
    report, created = import_csv(version, raw, create_subjects=create_subjects)

    audit(
        "syllabus.imported",
        entity_type="syllabus_version",
        entity_id=version.id,
        detail={
            "filename": upload.filename,
            "rows_read": report["rows_read"],
            "rows_valid": report["rows_valid"],
            "rows_rejected": report["rows_rejected"],
            "created": report["created"],
        },
    )
    db.session.commit()

    status = 201 if created else 200
    return (
        jsonify(
            {
                "version": version_summary(version),
                "report": report,
                "message": (
                    f"Imported {report['created']['topics']} topic(s) into draft "
                    f"version {version.version_number}. Publish the version to "
                    "roll it out to students."
                ),
            }
        ),
        status,
    )


@admin_bp.get("/syllabus/import/template")
@admin_required
def import_template():
    """Downloadable CSV template with the expected header and one example row."""
    from app.admin.helpers import csv_response

    return csv_response(
        "syllabus-import-template.csv",
        [
            "subject",
            "unit",
            "chapter",
            "topic",
            "estimated_minutes",
            "difficulty",
            "importance",
            "description",
        ],
        [
            (
                "Indian Polity",
                "Constitutional Framework",
                "Preamble",
                "Keywords of the Preamble",
                45,
                "easy",
                "high",
                "Sovereign, socialist, secular, democratic, republic.",
            )
        ],
    )

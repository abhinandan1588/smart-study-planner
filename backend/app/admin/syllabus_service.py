"""Syllabus versioning, progress migration and CSV import (PRD 4.6).

How student progress survives a syllabus edit
---------------------------------------------

``topic_progress`` rows reference ``topics.id``. Three rules keep them safe:

1. **Structural edits happen on a draft version.** ``create_draft_version``
   clones the current published tree into a brand new ``syllabus_versions`` row
   (plus new unit and topic rows). Students keep reading the published version,
   so nothing they have done is touched while the draft is being edited.
2. **Publishing migrates progress forward instead of resetting it.** Every
   cloned row remembers its ancestor (``cloned_from_unit_id`` /
   ``cloned_from_topic_id``). ``publish_version`` walks the new topics and, for
   each one, copies each student's progress row from the ancestor topic — status,
   minutes spent, notes, priority, target date and revision schedule — unless a
   row already exists for that student and topic.
3. **The old version is archived, never deleted.** Its units and topics stay in
   the database, so the historical ``topic_progress`` rows remain readable and a
   publication can be audited or reverted.

Direct edits inside an already-published version are still allowed (fixing a
title, an estimate or a difficulty) because they do not move a topic's identity.
Deleting a unit or topic that students have progress on is refused with 409 and
an impact count unless the caller repeats the request with ``force=true``.
"""

import csv
import io

from app.common.errors import ConflictError, ValidationError
from app.extensions import db
from app.models import (
    DIFFICULTIES,
    IMPORTANCES,
    Course,
    CourseSubject,
    Subject,
    SyllabusUnit,
    SyllabusVersion,
    Topic,
    TopicProgress,
    utcnow,
)

CSV_COLUMNS = (
    "subject",
    "unit",
    "chapter",
    "topic",
    "estimated_minutes",
    "difficulty",
    "importance",
    "description",
)
MAX_CSV_ROWS = 2000


# --- versions -----------------------------------------------------------


def latest_version(course_id, status=None):
    query = SyllabusVersion.query.filter(SyllabusVersion.course_id == course_id)
    if status:
        query = query.filter(SyllabusVersion.status == status)
    return query.order_by(SyllabusVersion.version_number.desc()).first()


def next_version_number(course_id):
    current = (
        db.session.query(
            db.func.coalesce(db.func.max(SyllabusVersion.version_number), 0)
        )
        .filter(SyllabusVersion.course_id == course_id)
        .scalar()
    )
    return int(current) + 1


def create_draft_version(course, notes=None, clone_from=None):
    """New draft version, optionally cloning an existing tree.

    Returns ``(version, {"units": n, "topics": n, "cloned_from": id|None})``.
    """
    source = clone_from
    if source is None:
        source = latest_version(course.id, status="published") or latest_version(
            course.id
        )

    version = SyllabusVersion(
        course_id=course.id,
        version_number=next_version_number(course.id),
        status="draft",
        notes=notes,
        cloned_from_version_id=source.id if source is not None else None,
    )
    db.session.add(version)
    db.session.flush()

    stats = {"units": 0, "topics": 0, "cloned_from": source.id if source else None}
    if source is not None:
        stats.update(_clone_tree(source, version))
    return version, stats


def _clone_tree(source, target):
    """Copy every unit/chapter/topic of `source` into `target`, keeping lineage."""
    units = (
        SyllabusUnit.query.filter(SyllabusUnit.syllabus_version_id == source.id)
        .order_by(SyllabusUnit.display_order.asc(), SyllabusUnit.id.asc())
        .all()
    )
    unit_map = {}
    # Parents first so a child can resolve its new parent id.
    for unit in sorted(units, key=lambda row: (row.parent_id is not None, row.display_order, row.id)):
        clone = SyllabusUnit(
            syllabus_version_id=target.id,
            subject_id=unit.subject_id,
            parent_id=unit_map.get(unit.parent_id) if unit.parent_id else None,
            title=unit.title,
            description=unit.description,
            unit_type=unit.unit_type,
            display_order=unit.display_order,
            cloned_from_unit_id=unit.id,
        )
        db.session.add(clone)
        db.session.flush()
        unit_map[unit.id] = clone.id

    topic_count = 0
    topics = (
        Topic.query.join(SyllabusUnit, Topic.unit_id == SyllabusUnit.id)
        .filter(SyllabusUnit.syllabus_version_id == source.id)
        .order_by(Topic.display_order.asc(), Topic.id.asc())
        .all()
    )
    for topic in topics:
        new_unit_id = unit_map.get(topic.unit_id)
        if new_unit_id is None:
            continue
        db.session.add(
            Topic(
                unit_id=new_unit_id,
                title=topic.title,
                description=topic.description,
                estimated_minutes=topic.estimated_minutes,
                difficulty=topic.difficulty,
                importance=topic.importance,
                display_order=topic.display_order,
                cloned_from_topic_id=topic.id,
            )
        )
        topic_count += 1
    db.session.flush()
    return {"units": len(unit_map), "topics": topic_count}


def migrate_progress(version):
    """Copy student progress from ancestor topics onto this version's topics.

    Returns the number of ``topic_progress`` rows created. Existing rows are
    never overwritten, so re-running the migration is safe.
    """
    topics = (
        Topic.query.join(SyllabusUnit, Topic.unit_id == SyllabusUnit.id)
        .filter(
            SyllabusUnit.syllabus_version_id == version.id,
            Topic.cloned_from_topic_id.isnot(None),
        )
        .all()
    )
    if not topics:
        return 0

    ancestors = {topic.cloned_from_topic_id: topic for topic in topics}
    source_rows = TopicProgress.query.filter(
        TopicProgress.topic_id.in_(list(ancestors.keys()))
    ).all()
    if not source_rows:
        return 0

    new_topic_ids = [topic.id for topic in topics]
    existing = {
        (row.user_id, row.topic_id)
        for row in TopicProgress.query.filter(
            TopicProgress.topic_id.in_(new_topic_ids)
        ).all()
    }

    created = 0
    for row in source_rows:
        target = ancestors.get(row.topic_id)
        if target is None:
            continue
        if (row.user_id, target.id) in existing:
            continue
        db.session.add(
            TopicProgress(
                user_id=row.user_id,
                topic_id=target.id,
                status=row.status,
                time_spent_minutes=row.time_spent_minutes,
                notes=row.notes,
                priority=row.priority,
                target_date=row.target_date,
                needs_revision=row.needs_revision,
                next_revision_date=row.next_revision_date,
                completed_at=row.completed_at,
            )
        )
        existing.add((row.user_id, target.id))
        created += 1
    db.session.flush()
    return created


def publish_version(version):
    """Publish a draft version, migrating progress and archiving the previous one.

    Returns a report describing exactly what happened so the admin UI can show
    it and the audit log can record it.
    """
    if version.status == "published":
        raise ConflictError("That syllabus version is already published.")

    topic_total = (
        db.session.query(db.func.count(Topic.id))
        .select_from(Topic)
        .join(SyllabusUnit, Topic.unit_id == SyllabusUnit.id)
        .filter(SyllabusUnit.syllabus_version_id == version.id)
        .scalar()
        or 0
    )
    if not topic_total:
        raise ValidationError(
            "A syllabus version needs at least one topic before it can be published."
        )

    previous = (
        SyllabusVersion.query.filter(
            SyllabusVersion.course_id == version.course_id,
            SyllabusVersion.status == "published",
            SyllabusVersion.id != version.id,
        )
        .order_by(SyllabusVersion.version_number.desc())
        .all()
    )

    migrated = migrate_progress(version)

    for old in previous:
        old.status = "archived"

    version.status = "published"
    version.published_at = utcnow()
    db.session.flush()

    return {
        "version_id": version.id,
        "version_number": version.version_number,
        "topics": int(topic_total),
        "migrated_progress_rows": migrated,
        "archived_versions": [old.version_number for old in previous],
        "student_progress_preserved": True,
        "note": (
            "Progress rows were copied forward onto the new topics and the "
            "previous version was archived with its topics intact."
        ),
    }


# --- impact checks ------------------------------------------------------


def unit_subtree_ids(unit):
    ids = [unit.id]
    for child in unit.children:
        ids.extend(unit_subtree_ids(child))
    return ids


def progress_impact_for_units(unit_ids):
    if not unit_ids:
        return {"topics": 0, "progress_rows": 0, "students": 0}
    topic_ids = [
        row[0]
        for row in db.session.query(Topic.id)
        .filter(Topic.unit_id.in_(unit_ids))
        .all()
    ]
    return progress_impact_for_topics(topic_ids)


def progress_impact_for_topics(topic_ids):
    if not topic_ids:
        return {"topics": 0, "progress_rows": 0, "students": 0}
    row = (
        db.session.query(
            db.func.count(TopicProgress.id),
            db.func.count(db.distinct(TopicProgress.user_id)),
        )
        .filter(TopicProgress.topic_id.in_(topic_ids))
        .one()
    )
    return {
        "topics": len(topic_ids),
        "progress_rows": int(row[0]),
        "students": int(row[1]),
    }


# --- CSV bulk import ----------------------------------------------------


def _read_csv(raw_bytes):
    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValidationError(
            "The CSV file must be UTF-8 encoded.", fields={"file": str(exc)}
        ) from exc
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise ValidationError(
            "The CSV file is empty.", fields={"file": "No header row was found."}
        )
    headers = [(name or "").strip().lower() for name in reader.fieldnames]
    missing = [name for name in ("subject", "unit", "topic") if name not in headers]
    if missing:
        raise ValidationError(
            "The CSV header is missing required columns.",
            fields={
                "file": "Required columns: subject, unit, topic. Optional: "
                "chapter, estimated_minutes, difficulty, importance, description."
            },
        )
    rows = []
    for index, raw in enumerate(reader, start=2):
        rows.append(
            (
                index,
                {
                    (key or "").strip().lower(): (value or "").strip()
                    for key, value in raw.items()
                    if key is not None
                },
            )
        )
        if len(rows) > MAX_CSV_ROWS:
            raise ValidationError(
                f"The CSV file exceeds the {MAX_CSV_ROWS} row limit.",
                fields={"file": "Split the import into smaller files."},
            )
    return rows


def import_csv(version, raw_bytes, create_subjects=True):
    """Validate every row first, then commit nothing unless the file is usable.

    Returns ``(report, created_rows)``. Rows that fail validation are reported
    individually in ``report['errors']`` as ``{row, column, message}`` and are
    skipped; valid rows are still imported so a single typo does not discard an
    otherwise good file.
    """
    rows = _read_csv(raw_bytes)
    if not rows:
        raise ValidationError(
            "The CSV file has no data rows.", fields={"file": "Add at least one row."}
        )

    course = db.session.get(Course, version.course_id)
    linked_subject_ids = {
        link.subject_id
        for link in CourseSubject.query.filter(
            CourseSubject.course_id == version.course_id
        ).all()
    }

    errors = []
    valid = []
    seen_subjects = {}

    for line_number, row in rows:
        subject_name = row.get("subject", "")
        unit_title = row.get("unit", "")
        topic_title = row.get("topic", "")
        chapter_title = row.get("chapter", "")

        if not subject_name:
            errors.append(
                {"row": line_number, "column": "subject", "message": "Subject is required."}
            )
            continue
        if not unit_title:
            errors.append(
                {"row": line_number, "column": "unit", "message": "Unit is required."}
            )
            continue
        if not topic_title:
            errors.append(
                {"row": line_number, "column": "topic", "message": "Topic is required."}
            )
            continue
        if len(topic_title) > 250 or len(unit_title) > 250:
            errors.append(
                {
                    "row": line_number,
                    "column": "topic",
                    "message": "Unit and topic titles must be at most 250 characters.",
                }
            )
            continue

        minutes_raw = row.get("estimated_minutes") or "60"
        try:
            minutes = int(float(minutes_raw))
        except (TypeError, ValueError):
            errors.append(
                {
                    "row": line_number,
                    "column": "estimated_minutes",
                    "message": f"'{minutes_raw}' is not a number.",
                }
            )
            continue
        if minutes < 1 or minutes > 10000:
            errors.append(
                {
                    "row": line_number,
                    "column": "estimated_minutes",
                    "message": "Must be between 1 and 10000 minutes.",
                }
            )
            continue

        difficulty = (row.get("difficulty") or "medium").lower()
        if difficulty not in DIFFICULTIES:
            errors.append(
                {
                    "row": line_number,
                    "column": "difficulty",
                    "message": "Must be one of: " + ", ".join(DIFFICULTIES) + ".",
                }
            )
            continue

        importance = (row.get("importance") or "medium").lower()
        if importance not in IMPORTANCES:
            errors.append(
                {
                    "row": line_number,
                    "column": "importance",
                    "message": "Must be one of: " + ", ".join(IMPORTANCES) + ".",
                }
            )
            continue

        key = subject_name.lower()
        if key not in seen_subjects:
            subject = Subject.query.filter(
                db.func.lower(Subject.name) == key
            ).first()
            if subject is None and not create_subjects:
                errors.append(
                    {
                        "row": line_number,
                        "column": "subject",
                        "message": (
                            f"Subject '{subject_name}' does not exist and "
                            "create_subjects is disabled."
                        ),
                    }
                )
                continue
            seen_subjects[key] = subject or subject_name
        valid.append(
            {
                "row": line_number,
                "subject_key": key,
                "subject_name": subject_name,
                "unit": unit_title,
                "chapter": chapter_title,
                "topic": topic_title,
                "description": row.get("description") or None,
                "estimated_minutes": minutes,
                "difficulty": difficulty,
                "importance": importance,
            }
        )

    report = {
        "rows_read": len(rows),
        "rows_valid": len(valid),
        "rows_rejected": len(errors),
        "created": {"subjects": 0, "units": 0, "chapters": 0, "topics": 0},
        "linked_subjects": 0,
        "errors": errors,
    }
    if not valid:
        return report, 0

    # --- resolve subjects ---------------------------------------------
    from app.admin.helpers import unique_slug

    subjects = {}
    for key, value in seen_subjects.items():
        if isinstance(value, Subject):
            subjects[key] = value
            continue
        subject = Subject(
            name=value,
            slug=unique_slug(Subject, value),
            status="active",
        )
        db.session.add(subject)
        db.session.flush()
        subjects[key] = subject
        report["created"]["subjects"] += 1

    for key, subject in subjects.items():
        if subject.id not in linked_subject_ids:
            next_order = (
                db.session.query(
                    db.func.coalesce(db.func.max(CourseSubject.display_order), -1)
                )
                .filter(CourseSubject.course_id == version.course_id)
                .scalar()
            ) + 1
            db.session.add(
                CourseSubject(
                    course_id=version.course_id,
                    subject_id=subject.id,
                    display_order=next_order,
                )
            )
            linked_subject_ids.add(subject.id)
            report["linked_subjects"] += 1
    db.session.flush()

    # --- existing structure in this version ----------------------------
    unit_cache = {}
    for unit in SyllabusUnit.query.filter(
        SyllabusUnit.syllabus_version_id == version.id
    ).all():
        unit_cache[(unit.subject_id, unit.parent_id, unit.title.lower())] = unit

    topic_cache = set()
    for topic in (
        Topic.query.join(SyllabusUnit, Topic.unit_id == SyllabusUnit.id)
        .filter(SyllabusUnit.syllabus_version_id == version.id)
        .all()
    ):
        topic_cache.add((topic.unit_id, topic.title.lower()))

    def ensure_unit(subject_id, parent_id, title, unit_type):
        cache_key = (subject_id, parent_id, title.lower())
        existing = unit_cache.get(cache_key)
        if existing is not None:
            return existing
        next_order = (
            db.session.query(
                db.func.coalesce(db.func.max(SyllabusUnit.display_order), -1)
            )
            .filter(
                SyllabusUnit.syllabus_version_id == version.id,
                SyllabusUnit.subject_id == subject_id,
                (
                    SyllabusUnit.parent_id == parent_id
                    if parent_id is not None
                    else SyllabusUnit.parent_id.is_(None)
                ),
            )
            .scalar()
        ) + 1
        unit = SyllabusUnit(
            syllabus_version_id=version.id,
            subject_id=subject_id,
            parent_id=parent_id,
            title=title,
            unit_type=unit_type,
            display_order=next_order,
        )
        db.session.add(unit)
        db.session.flush()
        unit_cache[cache_key] = unit
        report["created"]["chapters" if unit_type == "chapter" else "units"] += 1
        return unit

    created_topics = 0
    for entry in valid:
        subject = subjects[entry["subject_key"]]
        unit = ensure_unit(subject.id, None, entry["unit"], "unit")
        container = unit
        if entry["chapter"]:
            container = ensure_unit(
                subject.id, unit.id, entry["chapter"], "chapter"
            )

        if (container.id, entry["topic"].lower()) in topic_cache:
            report["errors"].append(
                {
                    "row": entry["row"],
                    "column": "topic",
                    "message": (
                        f"Topic '{entry['topic']}' already exists under "
                        f"'{container.title}' and was skipped."
                    ),
                }
            )
            continue

        next_order = (
            db.session.query(db.func.coalesce(db.func.max(Topic.display_order), -1))
            .filter(Topic.unit_id == container.id)
            .scalar()
        ) + 1
        db.session.add(
            Topic(
                unit_id=container.id,
                title=entry["topic"],
                description=entry["description"],
                estimated_minutes=entry["estimated_minutes"],
                difficulty=entry["difficulty"],
                importance=entry["importance"],
                display_order=next_order,
            )
        )
        topic_cache.add((container.id, entry["topic"].lower()))
        created_topics += 1

    db.session.flush()
    report["created"]["topics"] = created_topics
    report["rows_rejected"] = len(report["errors"])
    report["course_id"] = version.course_id
    report["course_title"] = course.title if course else None
    report["syllabus_version_id"] = version.id
    return report, created_topics

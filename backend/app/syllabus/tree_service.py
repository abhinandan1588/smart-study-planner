"""Nested syllabus tree with rolled-up completion percentages (PRD 3.4).

Shape: ``course -> subjects -> units -> chapters -> topics``. Completion
percentages are rolled up from the student's own ``topic_progress`` rows at
every level, and the roll-up always uses the full topic set so a display filter
never changes a reported percentage.
"""

from app.common.progress import build_stats
from app.common.serializers import topic_progress_summary
from app.extensions import db
from app.models import CourseSubject, SyllabusUnit, Topic, TopicProgress

EMPTY_COUNTER = {
    "total": 0,
    "completed": 0,
    "in_progress": 0,
    "estimated_minutes": 0,
    "completed_minutes": 0,
    "time_spent_minutes": 0,
}


def _new_counter():
    return dict(EMPTY_COUNTER)


def _add(target, source):
    for key in target:
        target[key] += source[key]
    return target


def _count_topic(counter, topic, progress):
    status = progress.status if progress else "not_started"
    counter["total"] += 1
    counter["estimated_minutes"] += topic.estimated_minutes or 0
    counter["time_spent_minutes"] += progress.time_spent_minutes if progress else 0
    if status == "completed":
        counter["completed"] += 1
        counter["completed_minutes"] += topic.estimated_minutes or 0
    elif status == "in_progress":
        counter["in_progress"] += 1
    return counter


def _topic_matches(topic, progress, filters):
    status = filters.get("status")
    if status:
        current = progress.status if progress else "not_started"
        if current != status:
            return False
    priority = filters.get("priority")
    if priority:
        current = progress.priority if progress else "medium"
        if current != priority:
            return False
    due_before = filters.get("due_before")
    if due_before:
        target = progress.target_date if progress else None
        if target is None or target > due_before:
            return False
    needs_revision = filters.get("needs_revision")
    if needs_revision is not None:
        current = bool(progress.needs_revision) if progress else False
        if current != needs_revision:
            return False
    search = filters.get("q")
    if search and search.lower() not in (topic.title or "").lower():
        return False
    return True


def build_syllabus_tree(user_id, course, version, filters=None):
    filters = filters or {}

    units = (
        SyllabusUnit.query.filter_by(syllabus_version_id=version.id)
        .order_by(SyllabusUnit.display_order.asc(), SyllabusUnit.id.asc())
        .all()
    )
    topics = (
        Topic.query.join(SyllabusUnit, Topic.unit_id == SyllabusUnit.id)
        .filter(SyllabusUnit.syllabus_version_id == version.id)
        .order_by(Topic.display_order.asc(), Topic.id.asc())
        .all()
    )
    topic_ids = [topic.id for topic in topics]

    progress_by_topic = {}
    if topic_ids:
        for row in TopicProgress.query.filter(
            TopicProgress.user_id == user_id,
            TopicProgress.topic_id.in_(topic_ids),
        ).all():
            progress_by_topic[row.topic_id] = row

    children_by_parent = {}
    roots_by_subject = {}
    for unit in units:
        if unit.parent_id:
            children_by_parent.setdefault(unit.parent_id, []).append(unit)
        else:
            roots_by_subject.setdefault(unit.subject_id, []).append(unit)

    topics_by_unit = {}
    for topic in topics:
        topics_by_unit.setdefault(topic.unit_id, []).append(topic)

    def build_unit(unit):
        counter = _new_counter()
        topic_nodes = []
        for topic in topics_by_unit.get(unit.id, []):
            progress = progress_by_topic.get(topic.id)
            _count_topic(counter, topic, progress)
            if not _topic_matches(topic, progress, filters):
                continue
            topic_nodes.append(
                {
                    "id": topic.id,
                    "title": topic.title,
                    "description": topic.description,
                    "estimated_minutes": topic.estimated_minutes,
                    "difficulty": topic.difficulty,
                    "importance": topic.importance,
                    "display_order": topic.display_order,
                    "unit_id": topic.unit_id,
                    "progress": topic_progress_summary(progress),
                }
            )

        child_nodes = []
        for child in children_by_parent.get(unit.id, []):
            node, child_counter = build_unit(child)
            _add(counter, child_counter)
            child_nodes.append(node)

        return (
            {
                "id": unit.id,
                "title": unit.title,
                "description": unit.description,
                "unit_type": unit.unit_type,
                "display_order": unit.display_order,
                "subject_id": unit.subject_id,
                "parent_id": unit.parent_id,
                "progress": build_stats(**counter),
                "progress_percent": build_stats(**counter)["completion_percent"],
                "children": child_nodes,
                "topics": topic_nodes,
            },
            counter,
        )

    subject_nodes = []
    course_counter = _new_counter()
    links = sorted(
        course.course_subjects, key=lambda link: (link.display_order, link.subject_id)
    )
    if not links:
        # Fall back to the subjects actually used by this syllabus version.
        subject_ids = sorted(roots_by_subject.keys())
        links = (
            CourseSubject.query.filter(
                CourseSubject.course_id == course.id,
                CourseSubject.subject_id.in_(subject_ids),
            ).all()
            if subject_ids
            else []
        )

    for link in links:
        subject = link.subject
        if subject is None:
            continue
        subject_counter = _new_counter()
        unit_nodes = []
        for unit in roots_by_subject.get(link.subject_id, []):
            node, unit_counter = build_unit(unit)
            _add(subject_counter, unit_counter)
            unit_nodes.append(node)
        _add(course_counter, subject_counter)
        stats = build_stats(**subject_counter)
        subject_nodes.append(
            {
                "id": subject.id,
                "name": subject.name,
                "slug": subject.slug,
                "weightage": link.weightage or subject.weightage,
                "display_order": link.display_order,
                "progress": stats,
                "progress_percent": stats["completion_percent"],
                "units": unit_nodes,
            }
        )

    totals = build_stats(**course_counter)
    return {
        "course": {
            "id": course.id,
            "title": course.title,
            "slug": course.slug,
            "category": course.category,
            "status": course.status,
        },
        "version": {
            "id": version.id,
            "version_number": version.version_number,
            "status": version.status,
            "published_at": (
                version.published_at.isoformat() if version.published_at else None
            ),
        },
        "subjects": subject_nodes,
        "totals": totals,
        "filters_applied": {
            key: (value.isoformat() if hasattr(value, "isoformat") else value)
            for key, value in filters.items()
            if value is not None
        },
    }


def recompute_scope(user_id, topic):
    """Unit / subject / course percentages around one topic after an update."""
    unit = topic.unit
    version = unit.version if unit else None
    if unit is None or version is None:
        return {}

    chapter_ids = _subtree_ids(unit)
    unit_root = unit
    while unit_root.parent_id:
        unit_root = unit_root.parent
    root_ids = _subtree_ids(unit_root)

    subject_topic_ids = [
        row[0]
        for row in db.session.query(Topic.id)
        .join(SyllabusUnit, Topic.unit_id == SyllabusUnit.id)
        .filter(
            SyllabusUnit.syllabus_version_id == version.id,
            SyllabusUnit.subject_id == unit.subject_id,
        )
        .all()
    ]
    course_topic_ids = [
        row[0]
        for row in db.session.query(Topic.id)
        .join(SyllabusUnit, Topic.unit_id == SyllabusUnit.id)
        .filter(SyllabusUnit.syllabus_version_id == version.id)
        .all()
    ]

    return {
        "chapter": _stats_for(user_id, chapter_ids),
        "unit": _stats_for(user_id, root_ids),
        "subject": _stats_for(user_id, subject_topic_ids),
        "course": _stats_for(user_id, course_topic_ids),
        "chapter_id": unit.id,
        "unit_id": unit_root.id,
        "subject_id": unit.subject_id,
        "course_id": version.course_id,
    }


def _subtree_ids(unit):
    ids = [topic.id for topic in unit.topics]
    for child in unit.children:
        ids.extend(_subtree_ids(child))
    return ids


def _stats_for(user_id, topic_ids):
    if not topic_ids:
        return build_stats()
    completed = db.case((TopicProgress.status == "completed", 1), else_=0)
    in_progress = db.case((TopicProgress.status == "in_progress", 1), else_=0)
    completed_minutes = db.case(
        (TopicProgress.status == "completed", Topic.estimated_minutes), else_=0
    )
    row = (
        db.session.query(
            db.func.count(Topic.id),
            db.func.coalesce(db.func.sum(completed), 0),
            db.func.coalesce(db.func.sum(in_progress), 0),
            db.func.coalesce(db.func.sum(Topic.estimated_minutes), 0),
            db.func.coalesce(db.func.sum(completed_minutes), 0),
            db.func.coalesce(db.func.sum(TopicProgress.time_spent_minutes), 0),
        )
        .select_from(Topic)
        .outerjoin(
            TopicProgress,
            db.and_(
                TopicProgress.topic_id == Topic.id,
                TopicProgress.user_id == user_id,
            ),
        )
        .filter(Topic.id.in_(topic_ids))
        .one()
    )
    return build_stats(
        total=row[0],
        completed=row[1],
        in_progress=row[2],
        estimated_minutes=row[3],
        completed_minutes=row[4],
        time_spent_minutes=row[5],
    )

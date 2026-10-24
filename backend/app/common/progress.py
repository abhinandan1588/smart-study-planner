"""Completion-percentage math for topic / unit / subject / course (PRD 3.4).

Unweighted completion is ``completed topics / total topics``. Weighted
completion uses each topic's ``estimated_minutes`` as its weight and is always
reported under a separate key so the two are never confused.
"""

from app.extensions import db
from app.models import (
    Enrollment,
    SyllabusUnit,
    SyllabusVersion,
    Topic,
    TopicProgress,
)


def percent(part, whole):
    if not whole:
        return 0.0
    return round(min(100.0, (part / whole) * 100.0), 2)


def build_stats(
    total=0,
    completed=0,
    in_progress=0,
    estimated_minutes=0,
    completed_minutes=0,
    time_spent_minutes=0,
):
    """The progress envelope used at every level of the hierarchy."""
    total = int(total or 0)
    completed = int(completed or 0)
    in_progress = int(in_progress or 0)
    return {
        "total_topics": total,
        "completed_topics": completed,
        "in_progress_topics": in_progress,
        "not_started_topics": max(0, total - completed - in_progress),
        "completion_percent": percent(completed, total),
        "weighted_completion_percent": percent(completed_minutes, estimated_minutes),
        "estimated_minutes": int(estimated_minutes or 0),
        "time_spent_minutes": int(time_spent_minutes or 0),
    }


def published_version_for(course_id):
    """Latest published syllabus version of a course, or None."""
    return (
        SyllabusVersion.query.filter_by(course_id=course_id, status="published")
        .order_by(SyllabusVersion.version_number.desc())
        .first()
    )


def _progress_aggregate_query(user_id):
    """Shared aggregate projection over topics left-joined to this user's progress."""
    completed = db.case((TopicProgress.status == "completed", 1), else_=0)
    in_progress = db.case((TopicProgress.status == "in_progress", 1), else_=0)
    completed_minutes = db.case(
        (TopicProgress.status == "completed", Topic.estimated_minutes), else_=0
    )
    return (
        db.session.query(
            SyllabusVersion.course_id.label("course_id"),
            db.func.count(Topic.id).label("total"),
            db.func.coalesce(db.func.sum(completed), 0).label("completed"),
            db.func.coalesce(db.func.sum(in_progress), 0).label("in_progress"),
            db.func.coalesce(db.func.sum(Topic.estimated_minutes), 0).label(
                "estimated_minutes"
            ),
            db.func.coalesce(db.func.sum(completed_minutes), 0).label(
                "completed_minutes"
            ),
            db.func.coalesce(db.func.sum(TopicProgress.time_spent_minutes), 0).label(
                "time_spent_minutes"
            ),
        )
        .select_from(SyllabusVersion)
        .join(SyllabusUnit, SyllabusUnit.syllabus_version_id == SyllabusVersion.id)
        .join(Topic, Topic.unit_id == SyllabusUnit.id)
        .outerjoin(
            TopicProgress,
            db.and_(
                TopicProgress.topic_id == Topic.id,
                TopicProgress.user_id == user_id,
            ),
        )
        .filter(SyllabusVersion.status == "published")
    )


def course_progress_bulk(user_id, course_ids):
    """``{course_id: stats}`` for the given courses in one aggregate query."""
    course_ids = [int(cid) for cid in course_ids or []]
    if not course_ids:
        return {}
    rows = (
        _progress_aggregate_query(user_id)
        .filter(SyllabusVersion.course_id.in_(course_ids))
        .group_by(SyllabusVersion.course_id)
        .all()
    )
    out = {
        row.course_id: build_stats(
            total=row.total,
            completed=row.completed,
            in_progress=row.in_progress,
            estimated_minutes=row.estimated_minutes,
            completed_minutes=row.completed_minutes,
            time_spent_minutes=row.time_spent_minutes,
        )
        for row in rows
    }
    for course_id in course_ids:
        out.setdefault(course_id, build_stats())
    return out


def course_progress(user_id, course_id):
    return course_progress_bulk(user_id, [course_id])[int(course_id)]


def enrolled_course_ids(user_id, status="active"):
    query = db.session.query(Enrollment.course_id).filter(
        Enrollment.user_id == user_id
    )
    if status:
        query = query.filter(Enrollment.status == status)
    return [row[0] for row in query.all()]


def overall_completion(user_id, course_ids=None):
    """Aggregate syllabus completion across every enrolled course."""
    if course_ids is None:
        course_ids = enrolled_course_ids(user_id)
    per_course = course_progress_bulk(user_id, course_ids)
    totals = {
        "total": 0,
        "completed": 0,
        "in_progress": 0,
        "estimated_minutes": 0,
        "completed_minutes": 0,
        "time_spent_minutes": 0,
    }
    for stats in per_course.values():
        totals["total"] += stats["total_topics"]
        totals["completed"] += stats["completed_topics"]
        totals["in_progress"] += stats["in_progress_topics"]
        totals["estimated_minutes"] += stats["estimated_minutes"]
        totals["completed_minutes"] += round(
            stats["estimated_minutes"] * stats["weighted_completion_percent"] / 100.0
        )
        totals["time_spent_minutes"] += stats["time_spent_minutes"]
    return build_stats(**totals), per_course


def topic_course_id(topic):
    """Resolve the owning course id of a topic through its unit's version."""
    unit = topic.unit
    if unit is None or unit.version is None:
        return None
    return unit.version.course_id

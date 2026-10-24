"""Published course browsing, search and detail (PRD 3.3).

Only `published` courses are visible here; drafts and archived courses are
reachable through the admin blueprint only. Enrollment happens through
`POST /api/v1/student/enrollments`.
"""

from flask import jsonify, request

from app.common.decorators import auth_required, current_user
from app.common.errors import NotFoundError
from app.common.pagination import paginate
from app.common.progress import course_progress_bulk
from app.common.serializers import course_detail, course_summary, subject_summary
from app.common.validators import validate_enum
from app.courses import courses_bp
from app.extensions import db
from app.models import (
    COURSE_CATEGORIES,
    Course,
    CourseSubject,
    Enrollment,
    SyllabusUnit,
    SyllabusVersion,
    Topic,
)

SORT_OPTIONS = {
    "title": (Course.title.asc(),),
    "-title": (Course.title.desc(),),
    "newest": (Course.created_at.desc(),),
    "oldest": (Course.created_at.asc(),),
}


def _counts_for(course_ids):
    """Subject and topic counts per course from two aggregate queries."""
    if not course_ids:
        return {}
    counts = {cid: {"subject_count": 0, "topic_count": 0} for cid in course_ids}

    subject_rows = (
        db.session.query(
            CourseSubject.course_id, db.func.count(CourseSubject.subject_id)
        )
        .filter(CourseSubject.course_id.in_(course_ids))
        .group_by(CourseSubject.course_id)
        .all()
    )
    for course_id, total in subject_rows:
        counts[course_id]["subject_count"] = total

    topic_rows = (
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
    )
    for course_id, total in topic_rows:
        counts[course_id]["topic_count"] = total
    return counts


def _enrolled_ids(user_id, course_ids):
    if not course_ids:
        return set()
    rows = (
        db.session.query(Enrollment.course_id)
        .filter(
            Enrollment.user_id == user_id,
            Enrollment.course_id.in_(course_ids),
            Enrollment.status != "dropped",
        )
        .all()
    )
    return {row[0] for row in rows}


@courses_bp.get("")
@courses_bp.get("/")
@auth_required
def list_courses():
    """Browse and search published courses."""
    user = current_user()
    query = Course.query.filter(Course.status == "published")

    search = (request.args.get("q") or "").strip()
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            db.or_(
                Course.title.ilike(pattern),
                Course.description.ilike(pattern),
                Course.target_audience.ilike(pattern),
                Course.category.ilike(pattern),
            )
        )

    category = (request.args.get("category") or "").strip()
    if category:
        validate_enum(category, COURSE_CATEGORIES, "category")
        query = query.filter(Course.category == category)

    level = (request.args.get("level") or "").strip()
    if level:
        query = query.filter(Course.level == level)

    sort = (request.args.get("sort") or "title").strip()
    order = SORT_OPTIONS.get(sort, SORT_OPTIONS["title"])
    query = query.order_by(*order, Course.id.asc())

    page = paginate(query)
    course_ids = [course.id for course in page["items"]]
    counts = _counts_for(course_ids)
    enrolled = _enrolled_ids(user.id, course_ids)
    progress = (
        course_progress_bulk(user.id, list(enrolled)) if enrolled else {}
    )

    page["items"] = [
        {
            **course_summary(course),
            "description": course.description,
            **counts.get(course.id, {"subject_count": 0, "topic_count": 0}),
            "is_enrolled": course.id in enrolled,
            "progress_percent": progress.get(course.id, {}).get("completion_percent"),
        }
        for course in page["items"]
    ]
    return jsonify(page), 200


@courses_bp.get("/categories")
@auth_required
def list_categories():
    rows = (
        db.session.query(Course.category, db.func.count(Course.id))
        .filter(Course.status == "published")
        .group_by(Course.category)
        .all()
    )
    tally = dict(rows)
    return (
        jsonify(
            {
                "categories": [
                    {
                        "value": value,
                        "label": value.replace("_", " ").title(),
                        "count": tally.get(value, 0),
                    }
                    for value in COURSE_CATEGORIES
                ]
            }
        ),
        200,
    )


@courses_bp.get("/<int:course_id>")
@auth_required
def get_course(course_id):
    user = current_user()
    course = db.session.get(Course, course_id)
    if course is None or (course.status != "published" and not user.is_admin):
        raise NotFoundError("That course was not found.")

    counts = _counts_for([course.id]).get(
        course.id, {"subject_count": 0, "topic_count": 0}
    )
    enrolled = _enrolled_ids(user.id, [course.id])
    version = (
        SyllabusVersion.query.filter_by(course_id=course.id, status="published")
        .order_by(SyllabusVersion.version_number.desc())
        .first()
    )

    subjects = []
    for link in sorted(course.course_subjects, key=lambda cs: cs.display_order):
        payload = subject_summary(link.subject)
        if payload is None:
            continue
        payload["display_order"] = link.display_order
        payload["course_weightage"] = link.weightage
        payload["topic_count"] = (
            db.session.query(db.func.count(Topic.id))
            .select_from(Topic)
            .join(SyllabusUnit, Topic.unit_id == SyllabusUnit.id)
            .filter(
                SyllabusUnit.subject_id == link.subject_id,
                SyllabusUnit.syllabus_version_id == (version.id if version else -1),
            )
            .scalar()
            or 0
        )
        subjects.append(payload)

    data = course_detail(course)
    data.update(
        {
            **counts,
            "is_enrolled": course.id in enrolled,
            "subjects": subjects,
            "syllabus_version": (
                {
                    "id": version.id,
                    "version_number": version.version_number,
                    "published_at": (
                        version.published_at.isoformat() if version.published_at else None
                    ),
                }
                if version
                else None
            ),
            "enrolled_students": len(
                [e for e in course.enrollments if e.status != "dropped"]
            ),
        }
    )
    if course.id in enrolled:
        data["progress"] = course_progress_bulk(user.id, [course.id])[course.id]
    return jsonify({"course": data}), 200

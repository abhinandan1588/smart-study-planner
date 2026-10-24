"""Enrollment, course and resource access checks shared by the blueprints.

Resource visibility lives here rather than in a single blueprint because both
the study-materials download path and the AI retrieval path must apply exactly
the same rule: a student may read their own private uploads, published public
material, published `enrolled_only` material for a course they are enrolled in,
and anything granted through `resource_permissions` — nothing else.
"""

from app.common.errors import ForbiddenError, NotFoundError
from app.extensions import db
from app.models import (
    Course,
    Enrollment,
    Resource,
    ResourcePermission,
    Topic,
    utcnow,
)


def get_course_or_404(course_id, published_only=True):
    course = db.session.get(Course, course_id)
    if course is None:
        raise NotFoundError("That course was not found.")
    if published_only and course.status != "published":
        raise NotFoundError("That course was not found.")
    return course


def find_enrollment(user_id, course_id):
    return Enrollment.query.filter_by(user_id=user_id, course_id=course_id).first()


def require_enrollment(user_id, course_id):
    """The caller's enrollment in a course, or 403."""
    enrollment = find_enrollment(user_id, course_id)
    if enrollment is None or enrollment.status == "dropped":
        raise ForbiddenError("Enroll in this course before accessing its syllabus.")
    return enrollment


def touch_enrollment(enrollment):
    """Record a course access so the dashboard can list recent courses."""
    if enrollment is not None:
        enrollment.last_accessed_at = utcnow()
    return enrollment


def require_topic_in_enrolled_course(user_id, topic_id):
    """Load a topic and verify the caller is enrolled in its course.

    Returns ``(topic, course_id)``. Raises 404 when the topic does not exist
    and 403 when the caller is not enrolled, so one student can never touch
    progress for a course they do not study.
    """
    topic = db.session.get(Topic, topic_id)
    if topic is None:
        raise NotFoundError("That topic was not found.")
    unit = topic.unit
    course_id = unit.version.course_id if unit and unit.version else None
    if course_id is None:
        raise NotFoundError("That topic was not found.")
    require_enrollment(user_id, course_id)
    return topic, course_id


# --- resource visibility ------------------------------------------------


def enrolled_course_ids(user_id):
    """Course ids the student is still enrolled in."""
    return [
        row[0]
        for row in db.session.query(Enrollment.course_id)
        .filter(Enrollment.user_id == user_id, Enrollment.status != "dropped")
        .all()
    ]


def resource_visibility_filter(user_id, course_ids=None):
    """SQLAlchemy filter limiting `Resource` rows to what this caller may read."""
    if course_ids is None:
        course_ids = enrolled_course_ids(user_id)

    conditions = [Resource.owner_id == user_id]

    shared = db.and_(
        Resource.owner_id.is_(None),
        Resource.status == "published",
    )
    conditions.append(db.and_(shared, Resource.visibility == "public"))
    if course_ids:
        conditions.append(
            db.and_(
                shared,
                Resource.visibility == "enrolled_only",
                Resource.course_id.in_(course_ids),
            )
        )

    permission_targets = [ResourcePermission.user_id == user_id]
    if course_ids:
        permission_targets.append(ResourcePermission.course_id.in_(course_ids))
    granted = db.session.query(ResourcePermission.resource_id).filter(
        db.or_(*permission_targets)
    )
    conditions.append(Resource.id.in_(granted))

    return db.or_(*conditions)


def can_access_resource(resource, user):
    """True when this caller may read the resource."""
    if resource is None or user is None:
        return False
    if resource.owner_id == user.id:
        return True
    if resource.owner_id is not None:
        # Another student's private upload.
        return False
    if resource.status != "published":
        return False
    if resource.visibility == "public":
        return True

    course_ids = enrolled_course_ids(user.id)
    if resource.visibility == "enrolled_only" and resource.course_id in course_ids:
        return True

    permission = ResourcePermission.query.filter(
        ResourcePermission.resource_id == resource.id,
        db.or_(
            ResourcePermission.user_id == user.id,
            (
                ResourcePermission.course_id.in_(course_ids)
                if course_ids
                else db.false()
            ),
        ),
    ).first()
    return permission is not None

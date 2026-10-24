"""Enrollment and course access checks shared by the student blueprints."""

from app.common.errors import ForbiddenError, NotFoundError
from app.extensions import db
from app.models import Course, Enrollment, Topic, utcnow


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

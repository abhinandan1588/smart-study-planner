"""Validation of the course / subject / topic links on planner records.

A student may only point a session, task, focus session or goal at a course
they are enrolled in. The topic link is resolved through the syllabus so the
stored ``course_id`` / ``subject_id`` always agree with the topic.
"""

from app.common.access import require_enrollment, require_topic_in_enrolled_course
from app.common.errors import ValidationError
from app.common.validators import parse_int
from app.extensions import db
from app.models import CourseSubject, Subject


def resolve_links(user, data, current=None):
    """Return ``{"course_id", "subject_id", "topic_id"}`` for the payload.

    Only keys present in ``data`` are considered; the remaining values fall
    back to ``current`` (an existing row) so PATCH requests stay partial.
    """
    current = current or {}
    out = {
        "course_id": current.get("course_id"),
        "subject_id": current.get("subject_id"),
        "topic_id": current.get("topic_id"),
    }

    if "topic_id" in data:
        topic_id = parse_int(
            data.get("topic_id"), "topic_id", minimum=1, required=False
        )
        if topic_id is None:
            out["topic_id"] = None
        else:
            topic, course_id = require_topic_in_enrolled_course(user.id, topic_id)
            out["topic_id"] = topic.id
            out["subject_id"] = topic.unit.subject_id
            out["course_id"] = course_id
            return out

    if "course_id" in data:
        course_id = parse_int(
            data.get("course_id"), "course_id", minimum=1, required=False
        )
        if course_id is None:
            out["course_id"] = None
        else:
            require_enrollment(user.id, course_id)
            out["course_id"] = course_id

    if "subject_id" in data:
        subject_id = parse_int(
            data.get("subject_id"), "subject_id", minimum=1, required=False
        )
        if subject_id is None:
            out["subject_id"] = None
        else:
            if db.session.get(Subject, subject_id) is None:
                raise ValidationError(
                    "Invalid subject.", fields={"subject_id": "Unknown subject."}
                )
            if out["course_id"] is not None:
                linked = CourseSubject.query.filter_by(
                    course_id=out["course_id"], subject_id=subject_id
                ).first()
                if linked is None:
                    raise ValidationError(
                        "Invalid subject.",
                        fields={
                            "subject_id": "That subject is not part of the course."
                        },
                    )
            out["subject_id"] = subject_id

    return out

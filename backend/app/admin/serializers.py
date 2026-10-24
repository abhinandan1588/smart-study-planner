"""Admin-facing serialization shapes (PRD 4).

These never include private student content: personal topic notes, private
uploads and AI conversations are deliberately absent (PRD 2.3 / 4.3).
"""

from app.common.serializers import (
    course_summary,
    iso,
    iso_date,
    load_json,
)


def student_row(user, enrollment_count=0, completed_topics=0):
    """One row of the admin student directory."""
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
        "status": user.status,
        "email_verified": user.email_verified,
        "avatar_url": user.avatar_url,
        "timezone": user.timezone,
        "created_at": iso(user.created_at),
        "last_login_at": iso(user.last_login_at),
        "enrollment_count": int(enrollment_count or 0),
        "completed_topics": int(completed_topics or 0),
    }


def admin_account(user):
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
        "status": user.status,
        "email_verified": user.email_verified,
        "avatar_url": user.avatar_url,
        "timezone": user.timezone,
        "language": user.language,
        "last_login_at": iso(user.last_login_at),
        "created_at": iso(user.created_at),
    }


def course_admin(course, counts=None):
    """Course row for the admin course table, including lifecycle counts."""
    data = course_summary(course)
    data.update(
        {
            "description": course.description,
            "target_audience": course.target_audience,
            "created_by": course.created_by,
            "created_by_email": course.creator.email if course.creator else None,
            "created_at": iso(course.created_at),
            "updated_at": iso(course.updated_at),
        }
    )
    if counts:
        data.update(counts)
    return data


def subject_admin(subject, counts=None, link=None):
    data = {
        "id": subject.id,
        "name": subject.name,
        "slug": subject.slug,
        "description": subject.description,
        "weightage": subject.weightage,
        "status": subject.status,
        "created_at": iso(subject.created_at),
        "updated_at": iso(subject.updated_at),
    }
    if link is not None:
        data["display_order"] = link.display_order
        data["course_weightage"] = link.weightage
        data["course_id"] = link.course_id
    if counts:
        data.update(counts)
    return data


def version_summary(version, counts=None):
    data = {
        "id": version.id,
        "course_id": version.course_id,
        "version_number": version.version_number,
        "status": version.status,
        "notes": version.notes,
        "cloned_from_version_id": version.cloned_from_version_id,
        "published_at": iso(version.published_at),
        "created_at": iso(version.created_at),
    }
    if counts:
        data.update(counts)
    return data


def unit_admin(unit, topic_count=None):
    data = {
        "id": unit.id,
        "syllabus_version_id": unit.syllabus_version_id,
        "subject_id": unit.subject_id,
        "subject_name": unit.subject.name if unit.subject else None,
        "parent_id": unit.parent_id,
        "title": unit.title,
        "description": unit.description,
        "unit_type": unit.unit_type,
        "display_order": unit.display_order,
        "cloned_from_unit_id": unit.cloned_from_unit_id,
        "created_at": iso(unit.created_at),
        "updated_at": iso(unit.updated_at),
    }
    if topic_count is not None:
        data["topic_count"] = topic_count
    return data


def topic_admin(topic):
    return {
        "id": topic.id,
        "unit_id": topic.unit_id,
        "title": topic.title,
        "description": topic.description,
        "estimated_minutes": topic.estimated_minutes,
        "difficulty": topic.difficulty,
        "importance": topic.importance,
        "display_order": topic.display_order,
        "cloned_from_topic_id": topic.cloned_from_topic_id,
        "created_at": iso(topic.created_at),
        "updated_at": iso(topic.updated_at),
    }


def announcement_admin(announcement, delivery=None):
    data = {
        "id": announcement.id,
        "title": announcement.title,
        "body": announcement.body,
        "audience": announcement.audience,
        "course_id": announcement.course_id,
        "course_title": announcement.course.title if announcement.course else None,
        "target_role": announcement.target_role,
        "status": announcement.status,
        "publish_at": iso(announcement.publish_at),
        "expires_at": iso(announcement.expires_at),
        "created_by": announcement.created_by,
        "created_by_email": (
            announcement.creator.email if announcement.creator else None
        ),
        "view_count": announcement.view_count,
        "created_at": iso(announcement.created_at),
        "updated_at": iso(announcement.updated_at),
    }
    if delivery is not None:
        data["delivery"] = delivery
    return data


def resource_admin(resource, download_url=None):
    return {
        "id": resource.id,
        "title": resource.title,
        "description": resource.description,
        "resource_type": resource.resource_type,
        "external_url": resource.external_url,
        "tags": [tag.strip() for tag in (resource.tags or "").split(",") if tag.strip()],
        "file_size_bytes": resource.file_size_bytes,
        "mime_type": resource.mime_type,
        "has_file": bool(resource.file_path),
        "visibility": resource.visibility,
        "status": resource.status,
        "course_id": resource.course_id,
        "course_title": resource.course.title if resource.course else None,
        "subject_id": resource.subject_id,
        "subject_name": resource.subject.name if resource.subject else None,
        "unit_id": resource.unit_id,
        "unit_title": resource.unit.title if resource.unit else None,
        "topic_id": resource.topic_id,
        "topic_title": resource.topic.title if resource.topic else None,
        "owner_id": resource.owner_id,
        "uploaded_by": resource.uploaded_by,
        "uploaded_by_email": resource.uploader.email if resource.uploader else None,
        "download_count": resource.download_count,
        "last_accessed_at": iso(resource.last_accessed_at),
        "created_at": iso(resource.created_at),
        "updated_at": iso(resource.updated_at),
        "download_url": download_url
        or (f"/api/v1/admin/resources/{resource.id}/file" if resource.file_path else None),
    }


def enrollment_admin(enrollment, stats=None):
    data = {
        "id": enrollment.id,
        "course_id": enrollment.course_id,
        "course_title": enrollment.course.title if enrollment.course else None,
        "status": enrollment.status,
        "priority": enrollment.priority,
        "difficulty": enrollment.difficulty,
        "target_completion_date": iso_date(enrollment.target_completion_date),
        "enrolled_at": iso(enrollment.enrolled_at),
        "last_accessed_at": iso(enrollment.last_accessed_at),
    }
    if stats is not None:
        data["progress"] = stats
        data["progress_percent"] = stats.get("completion_percent", 0.0)
    return data


def setting_entry(setting):
    return {
        "key": setting.key,
        "value": load_json(setting.value_json, default=None),
        "description": setting.description,
        "updated_by": setting.updated_by,
        "updated_at": iso(setting.updated_at),
    }

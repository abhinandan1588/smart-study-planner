"""Serialization helpers. Hand written dicts, no Marshmallow dependency."""

import json


def iso(value):
    """ISO-8601 string for a datetime, or None."""
    return value.isoformat() if value is not None else None


def iso_date(value):
    return value.isoformat() if value is not None else None


def load_json(raw, default=None):
    """Parse a stored JSON text column, tolerating null/invalid content."""
    if not raw:
        return default
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return default


def dump_json(value):
    return json.dumps(value) if value is not None else None


def pick(instance, fields):
    """Shallow dict of the named attributes, with dates ISO-formatted."""
    out = {}
    for field in fields:
        value = getattr(instance, field, None)
        if hasattr(value, "isoformat"):
            value = value.isoformat()
        out[field] = value
    return out


def user_public(user):
    """Minimal identity shape returned with auth responses."""
    if user is None:
        return None
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
        "status": user.status,
        "email_verified": user.email_verified,
        "avatar_url": user.avatar_url,
    }


def user_profile(user):
    """Full profile including preferences (PRD 3.12)."""
    if user is None:
        return None
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
        "preferences": {
            "daily_target_minutes": user.daily_target_minutes,
            "weekly_target_minutes": user.weekly_target_minutes,
            "focus_duration_minutes": user.focus_duration_minutes,
            "short_break_minutes": user.short_break_minutes,
            "long_break_minutes": user.long_break_minutes,
            "availability": load_json(user.availability_json, default={}),
            "notifications": load_json(user.notification_prefs_json, default={}),
            "accessibility": load_json(user.accessibility_prefs_json, default={}),
        },
        "last_login_at": iso(user.last_login_at),
        "created_at": iso(user.created_at),
        "updated_at": iso(user.updated_at),
    }


def user_admin_summary(user):
    """Account row for the admin student directory (no private content)."""
    if user is None:
        return None
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
        "status": user.status,
        "email_verified": user.email_verified,
        "created_at": iso(user.created_at),
        "last_login_at": iso(user.last_login_at),
    }


def course_summary(course):
    if course is None:
        return None
    return {
        "id": course.id,
        "title": course.title,
        "slug": course.slug,
        "category": course.category,
        "level": course.level,
        "status": course.status,
        "thumbnail_url": course.thumbnail_url,
        "estimated_duration_weeks": course.estimated_duration_weeks,
    }


def course_detail(course):
    if course is None:
        return None
    data = course_summary(course)
    data.update(
        {
            "description": course.description,
            "target_audience": course.target_audience,
            "created_by": course.created_by,
            "created_at": iso(course.created_at),
            "updated_at": iso(course.updated_at),
        }
    )
    return data


def subject_summary(subject):
    if subject is None:
        return None
    return {
        "id": subject.id,
        "name": subject.name,
        "slug": subject.slug,
        "description": subject.description,
        "weightage": subject.weightage,
        "status": subject.status,
    }


def topic_summary(topic):
    if topic is None:
        return None
    return {
        "id": topic.id,
        "unit_id": topic.unit_id,
        "title": topic.title,
        "description": topic.description,
        "estimated_minutes": topic.estimated_minutes,
        "difficulty": topic.difficulty,
        "importance": topic.importance,
        "display_order": topic.display_order,
    }


def enrollment_summary(enrollment, progress_percent=None):
    if enrollment is None:
        return None
    data = {
        "id": enrollment.id,
        "course_id": enrollment.course_id,
        "course": course_summary(enrollment.course),
        "target_completion_date": iso_date(enrollment.target_completion_date),
        "priority": enrollment.priority,
        "difficulty": enrollment.difficulty,
        "status": enrollment.status,
        "enrolled_at": iso(enrollment.enrolled_at),
        "last_accessed_at": iso(enrollment.last_accessed_at),
    }
    if progress_percent is not None:
        data["progress_percent"] = progress_percent
    return data


def topic_progress_summary(progress):
    """Per-student progress for a topic, or the default 'not started' shape."""
    if progress is None:
        return {
            "status": "not_started",
            "time_spent_minutes": 0,
            "notes": None,
            "priority": "medium",
            "target_date": None,
            "needs_revision": False,
            "next_revision_date": None,
            "completed_at": None,
            "updated_at": None,
        }
    return {
        "id": progress.id,
        "topic_id": progress.topic_id,
        "status": progress.status,
        "time_spent_minutes": progress.time_spent_minutes,
        "notes": progress.notes,
        "priority": progress.priority,
        "target_date": iso_date(progress.target_date),
        "needs_revision": progress.needs_revision,
        "next_revision_date": iso_date(progress.next_revision_date),
        "completed_at": iso(progress.completed_at),
        "updated_at": iso(progress.updated_at),
    }


def study_session_detail(session):
    if session is None:
        return None
    return {
        "id": session.id,
        "title": session.title,
        "session_type": session.session_type,
        "start_at": iso(session.start_at),
        "end_at": iso(session.end_at),
        "planned_minutes": session.planned_minutes,
        "actual_minutes": session.actual_minutes,
        "status": session.status,
        "course_id": session.course_id,
        "course_title": session.course.title if session.course else None,
        "subject_id": session.subject_id,
        "subject_name": session.subject.name if session.subject else None,
        "topic_id": session.topic_id,
        "topic_title": session.topic.title if session.topic else None,
        "recurrence_rule": session.recurrence_rule,
        "recurrence_parent_id": session.recurrence_parent_id,
        "rescheduled_from_id": session.rescheduled_from_id,
        "generated_batch_id": session.generated_batch_id,
        "notes": session.notes,
        "created_at": iso(session.created_at),
        "updated_at": iso(session.updated_at),
    }


def task_detail(task):
    if task is None:
        return None
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "priority": task.priority,
        "status": task.status,
        "due_date": iso_date(task.due_date),
        "due_time": task.due_time.isoformat() if task.due_time else None,
        "estimated_minutes": task.estimated_minutes,
        "reminder_at": iso(task.reminder_at),
        "recurrence_rule": task.recurrence_rule,
        "course_id": task.course_id,
        "course_title": task.course.title if task.course else None,
        "subject_id": task.subject_id,
        "subject_name": task.subject.name if task.subject else None,
        "topic_id": task.topic_id,
        "topic_title": task.topic.title if task.topic else None,
        "completed_at": iso(task.completed_at),
        "created_at": iso(task.created_at),
        "updated_at": iso(task.updated_at),
    }


def focus_session_detail(session, elapsed_seconds=None):
    if session is None:
        return None
    data = {
        "id": session.id,
        "mode": session.mode,
        "status": session.status,
        "target_minutes": session.target_minutes,
        "focus_minutes": session.focus_minutes,
        "break_minutes": session.break_minutes,
        "started_at": iso(session.started_at),
        "ended_at": iso(session.ended_at),
        "paused_at": iso(session.paused_at),
        "paused_accumulated_seconds": session.paused_accumulated_seconds,
        "cycles_completed": session.cycles_completed,
        "course_id": session.course_id,
        "course_title": session.course.title if session.course else None,
        "subject_id": session.subject_id,
        "topic_id": session.topic_id,
        "topic_title": session.topic.title if session.topic else None,
        "created_at": iso(session.created_at),
        "updated_at": iso(session.updated_at),
    }
    if elapsed_seconds is not None:
        data["elapsed_seconds"] = elapsed_seconds
        data["remaining_seconds"] = max(
            0, session.target_minutes * 60 - elapsed_seconds
        )
    return data


def goal_detail(goal):
    if goal is None:
        return None
    return {
        "id": goal.id,
        "title": goal.title,
        "description": goal.description,
        "category": goal.category,
        "target_value": goal.target_value,
        "current_value": goal.current_value,
        "unit": goal.unit,
        "start_date": iso_date(goal.start_date),
        "deadline": iso_date(goal.deadline),
        "status": goal.status,
        "progress_percent": goal.progress_percent,
        "course_id": goal.course_id,
        "course_title": goal.course.title if goal.course else None,
        "completed_at": iso(goal.completed_at),
        "created_at": iso(goal.created_at),
        "updated_at": iso(goal.updated_at),
    }


def notification_detail(notification):
    if notification is None:
        return None
    return {
        "id": notification.id,
        "type": notification.type,
        "title": notification.title,
        "body": notification.body,
        "link": notification.link,
        "is_read": notification.is_read,
        "read_at": iso(notification.read_at),
        "created_at": iso(notification.created_at),
    }


def announcement_detail(announcement):
    if announcement is None:
        return None
    return {
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
        "created_at": iso(announcement.created_at),
    }


def resource_summary(resource, is_bookmarked=None, download_url=None):
    if resource is None:
        return None
    data = {
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
        "is_owner_upload": resource.owner_id is not None,
        "course_id": resource.course_id,
        "course_title": resource.course.title if resource.course else None,
        "subject_id": resource.subject_id,
        "topic_id": resource.topic_id,
        "download_count": resource.download_count,
        "last_accessed_at": iso(resource.last_accessed_at),
        "created_at": iso(resource.created_at),
    }
    if is_bookmarked is not None:
        data["is_bookmarked"] = is_bookmarked
    if download_url is not None:
        data["download_url"] = download_url
    return data


def audit_log_entry(entry):
    if entry is None:
        return None
    return {
        "id": entry.id,
        "actor_id": entry.actor_id,
        "actor_email": entry.actor.email if entry.actor else None,
        "action": entry.action,
        "entity_type": entry.entity_type,
        "entity_id": entry.entity_id,
        "detail": load_json(entry.detail_json, default=None),
        "ip_address": entry.ip_address,
        "created_at": iso(entry.created_at),
    }

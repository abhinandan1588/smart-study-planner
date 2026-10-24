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

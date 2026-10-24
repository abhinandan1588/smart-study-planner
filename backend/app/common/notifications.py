"""Notification creation and on-read reminder generation (PRD 3.11).

No background worker is configured, so due reminders are generated when the
student reads their notification centre or dashboard. Every generated row
carries a ``dedupe_key`` scoped to the user and the day, and the
``uq_notification_dedupe`` constraint makes a duplicate reminder impossible
even if two requests race.
"""

import logging
from datetime import timedelta

from sqlalchemy.exc import IntegrityError

from app.common.serializers import load_json
from app.extensions import db
from app.models import (
    Announcement,
    Enrollment,
    Goal,
    Notification,
    StudySession,
    Task,
    Topic,
    TopicProgress,
    utcnow,
)

logger = logging.getLogger(__name__)

UPCOMING_SESSION_WINDOW_HOURS = 24
GOAL_DEADLINE_WINDOW_DAYS = 3


def notification_enabled(user, notification_type):
    prefs = load_json(user.notification_prefs_json, default={}) or {}
    return bool(prefs.get(notification_type, True))


def create_notification(
    user_id, notification_type, title, body=None, link=None, dedupe_key=None
):
    """Insert a notification unless an identical dedupe key already exists.

    Returns ``(notification, created)``.
    """
    if dedupe_key:
        existing = Notification.query.filter_by(
            user_id=user_id, dedupe_key=dedupe_key
        ).first()
        if existing is not None:
            return existing, False

    notification = Notification(
        user_id=user_id,
        type=notification_type,
        title=title[:250],
        body=body,
        link=link,
        is_read=False,
        dedupe_key=dedupe_key,
    )
    try:
        with db.session.begin_nested():
            db.session.add(notification)
    except IntegrityError:
        existing = Notification.query.filter_by(
            user_id=user_id, dedupe_key=dedupe_key
        ).first()
        logger.debug("duplicate notification suppressed: %s", dedupe_key)
        return existing, False
    return notification, True


def unread_count(user_id):
    return Notification.query.filter_by(user_id=user_id, is_read=False).count()


def generate_due_notifications(user, commit=True):
    """Create the reminders that are due right now for one student."""
    now = utcnow()
    today = now.date()
    created = 0

    created += _upcoming_sessions(user, now, today)
    created += _due_tasks(user, today)
    created += _due_revisions(user, today)
    created += _goal_deadlines(user, today)
    created += _announcements(user)

    if commit:
        db.session.commit()
    return created


def _upcoming_sessions(user, now, today):
    if not notification_enabled(user, "session_upcoming"):
        return 0
    horizon = now + timedelta(hours=UPCOMING_SESSION_WINDOW_HOURS)
    sessions = (
        StudySession.query.filter(
            StudySession.user_id == user.id,
            StudySession.status == "planned",
            StudySession.session_type != "break",
            StudySession.start_at >= now,
            StudySession.start_at <= horizon,
        )
        .order_by(StudySession.start_at)
        .limit(10)
        .all()
    )
    created = 0
    for session in sessions:
        _, made = create_notification(
            user.id,
            "session_upcoming",
            f"Study session: {session.title}",
            body=(
                f"Starts at {session.start_at.strftime('%d %b %H:%M')} "
                f"for {session.planned_minutes} minutes."
            ),
            link="/app/planner",
            dedupe_key=f"session_upcoming:{session.id}:{today.isoformat()}",
        )
        created += 1 if made else 0
    return created


def _due_tasks(user, today):
    if not notification_enabled(user, "task_due"):
        return 0
    tasks = Task.query.filter(
        Task.user_id == user.id,
        Task.status.in_(("pending", "in_progress")),
        Task.due_date.isnot(None),
        Task.due_date <= today + timedelta(days=1),
    ).all()
    created = 0
    for task in tasks:
        overdue = task.due_date < today
        notification_type = "task_overdue" if overdue else "task_due"
        label = "overdue" if overdue else "due soon"
        _, made = create_notification(
            user.id,
            notification_type,
            f"Task {label}: {task.title}",
            body=f"Due on {task.due_date.isoformat()} ({task.priority} priority).",
            link="/app/planner/tasks",
            dedupe_key=f"{notification_type}:{task.id}:{today.isoformat()}",
        )
        created += 1 if made else 0
    return created


def _due_revisions(user, today):
    if not notification_enabled(user, "revision_due"):
        return 0
    rows = (
        db.session.query(TopicProgress, Topic)
        .join(Topic, TopicProgress.topic_id == Topic.id)
        .filter(
            TopicProgress.user_id == user.id,
            TopicProgress.needs_revision.is_(True),
            TopicProgress.next_revision_date.isnot(None),
            TopicProgress.next_revision_date <= today,
        )
        .limit(20)
        .all()
    )
    created = 0
    for progress, topic in rows:
        _, made = create_notification(
            user.id,
            "revision_due",
            f"Revision due: {topic.title}",
            body=f"Scheduled for {progress.next_revision_date.isoformat()}.",
            link="/app/syllabus",
            dedupe_key=(
                f"revision_due:{progress.id}:"
                f"{progress.next_revision_date.isoformat()}"
            ),
        )
        created += 1 if made else 0
    return created


def _goal_deadlines(user, today):
    if not notification_enabled(user, "goal_deadline"):
        return 0
    goals = Goal.query.filter(
        Goal.user_id == user.id,
        Goal.status.in_(("active", "overdue")),
        Goal.deadline <= today + timedelta(days=GOAL_DEADLINE_WINDOW_DAYS),
    ).all()
    created = 0
    for goal in goals:
        _, made = create_notification(
            user.id,
            "goal_deadline",
            f"Goal deadline approaching: {goal.title}",
            body=f"Deadline {goal.deadline.isoformat()}.",
            link="/app/goals",
            dedupe_key=f"goal_deadline:{goal.id}:{goal.deadline.isoformat()}",
        )
        created += 1 if made else 0
    return created


def _announcements(user):
    if not notification_enabled(user, "announcement"):
        return 0
    created = 0
    for announcement in visible_announcements(user.id, role=user.role):
        _, made = create_notification(
            user.id,
            "announcement",
            announcement.title,
            body=(announcement.body or "")[:400],
            link="/app/notifications",
            dedupe_key=f"announcement:{announcement.id}",
        )
        created += 1 if made else 0
    return created


def visible_announcements(user_id, role="student"):
    """Published, unexpired announcements targeted at this account."""
    now = utcnow()
    course_ids = [
        row[0]
        for row in db.session.query(Enrollment.course_id)
        .filter(Enrollment.user_id == user_id, Enrollment.status != "dropped")
        .all()
    ]
    query = Announcement.query.filter(
        Announcement.status == "published",
        db.or_(Announcement.publish_at.is_(None), Announcement.publish_at <= now),
        db.or_(Announcement.expires_at.is_(None), Announcement.expires_at >= now),
    )
    targets = [
        Announcement.audience == "all",
        db.and_(
            Announcement.audience == "role", Announcement.target_role == role
        ),
    ]
    if course_ids:
        targets.append(
            db.and_(
                Announcement.audience == "course",
                Announcement.course_id.in_(course_ids),
            )
        )
    audience_filter = db.or_(*targets)
    return (
        query.filter(audience_filter)
        .order_by(Announcement.publish_at.desc(), Announcement.id.desc())
        .all()
    )

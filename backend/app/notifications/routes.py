"""Notification centre endpoints (PRD 3.11).

Reminders are generated on read (no background worker is configured) and are
guarded by ``notifications.dedupe_key``, so repeatedly opening the centre never
produces duplicate reminders.
"""

from flask import jsonify, request

from app.common.decorators import current_user, get_owned_or_404, student_required
from app.common.notifications import (
    generate_due_notifications,
    unread_count,
    visible_announcements,
)
from app.common.pagination import paginate
from app.common.serializers import announcement_detail, notification_detail
from app.common.validators import parse_bool, validate_enum
from app.extensions import db
from app.models import NOTIFICATION_TYPES, Notification, utcnow
from app.notifications import notifications_bp


@notifications_bp.get("/notifications")
@student_required
def list_notifications():
    user = current_user()
    generate_due_notifications(user)

    query = Notification.query.filter(Notification.user_id == user.id)
    is_read = parse_bool(request.args.get("is_read"), "is_read", required=False)
    if is_read is not None:
        query = query.filter(Notification.is_read.is_(is_read))
    notification_type = request.args.get("type")
    if notification_type:
        validate_enum(notification_type, NOTIFICATION_TYPES, "type")
        query = query.filter(Notification.type == notification_type)

    page = paginate(
        query.order_by(Notification.created_at.desc(), Notification.id.desc()),
        serializer=notification_detail,
    )
    page["unread_count"] = unread_count(user.id)
    return jsonify(page), 200


@notifications_bp.get("/notifications/unread-count")
@student_required
def unread_notifications_count():
    user = current_user()
    return jsonify({"unread_count": unread_count(user.id)}), 200


@notifications_bp.patch("/notifications/<int:notification_id>/read")
@student_required
def mark_read(notification_id):
    notification = get_owned_or_404(Notification, notification_id)
    if not notification.is_read:
        notification.is_read = True
        notification.read_at = utcnow()
        db.session.commit()
    return (
        jsonify(
            {
                "notification": notification_detail(notification),
                "unread_count": unread_count(notification.user_id),
            }
        ),
        200,
    )


@notifications_bp.post("/notifications/read-all")
@student_required
def mark_all_read():
    user = current_user()
    updated = (
        Notification.query.filter(
            Notification.user_id == user.id, Notification.is_read.is_(False)
        ).update(
            {"is_read": True, "read_at": utcnow()}, synchronize_session=False
        )
    )
    db.session.commit()
    return jsonify({"updated": updated, "unread_count": 0}), 200


@notifications_bp.delete("/notifications/<int:notification_id>")
@student_required
def delete_notification(notification_id):
    notification = get_owned_or_404(Notification, notification_id)
    db.session.delete(notification)
    db.session.commit()
    return "", 204


@notifications_bp.get("/announcements")
@student_required
def list_announcements():
    """Published, unexpired announcements for 'all' or the caller's courses."""
    user = current_user()
    announcements = visible_announcements(user.id)
    return (
        jsonify(
            {
                "items": [
                    announcement_detail(announcement) for announcement in announcements
                ],
                "total": len(announcements),
            }
        ),
        200,
    )

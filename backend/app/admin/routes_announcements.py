"""Announcements and notification fan-out (PRD 4.8).

Targeting:

* ``audience='all'``    — every active student account;
* ``audience='course'`` — students with a non-dropped enrollment in ``course_id``;
* ``audience='role'``   — every active account with ``target_role``.

Publishing fans the announcement out into ``notifications`` rows. Each row
carries ``dedupe_key='announcement:<id>'`` and the ``uq_notification_dedupe``
constraint, so re-publishing or a student refreshing their notification centre
can never produce a duplicate reminder.

General announcements stay in the ``announcement`` notification type and are
kept separate from task reminders and security alerts.
"""

from flask import jsonify, request

from app.admin import admin_bp
from app.admin.helpers import audit, get_or_404
from app.admin.serializers import announcement_admin
from app.common.decorators import admin_required, current_user_id
from app.common.errors import NotFoundError, ValidationError
from app.common.notifications import create_notification
from app.common.pagination import paginate
from app.common.validators import (
    clean_str,
    get_json_body,
    parse_datetime,
    parse_int,
    validate_enum,
)
from app.extensions import db
from app.models import (
    ANNOUNCEMENT_AUDIENCES,
    ANNOUNCEMENT_STATUSES,
    ROLES,
    Announcement,
    Course,
    Enrollment,
    Notification,
    User,
    utcnow,
)


# --- targeting ----------------------------------------------------------


def target_user_ids(announcement):
    """Every account the announcement is addressed to."""
    if announcement.audience == "all":
        rows = (
            db.session.query(User.id)
            .filter(User.role == "student", User.status == "active")
            .all()
        )
    elif announcement.audience == "role":
        rows = (
            db.session.query(User.id)
            .filter(User.role == announcement.target_role, User.status == "active")
            .all()
        )
    elif announcement.audience == "course" and announcement.course_id:
        rows = (
            db.session.query(Enrollment.user_id)
            .join(User, User.id == Enrollment.user_id)
            .filter(
                Enrollment.course_id == announcement.course_id,
                Enrollment.status != "dropped",
                User.status == "active",
            )
            .all()
        )
    else:
        rows = []
    return sorted({row[0] for row in rows})


def fan_out(announcement):
    """Create one notification per targeted student. Duplicate-proof."""
    recipients = target_user_ids(announcement)
    created = 0
    for user_id in recipients:
        _, made = create_notification(
            user_id,
            "announcement",
            announcement.title,
            body=(announcement.body or "")[:400],
            link="/app/notifications",
            dedupe_key=f"announcement:{announcement.id}",
        )
        created += 1 if made else 0
    return {"targeted": len(recipients), "notifications_created": created}


def delivery_stats(announcement):
    """Delivery and engagement counters for the admin UI."""
    total = Notification.query.filter(
        Notification.dedupe_key == f"announcement:{announcement.id}"
    ).count()
    read = Notification.query.filter(
        Notification.dedupe_key == f"announcement:{announcement.id}",
        Notification.is_read.is_(True),
    ).count()
    return {
        "targeted": len(target_user_ids(announcement)),
        "delivered": total,
        "read": read,
        "read_percent": round((read / total) * 100, 2) if total else 0.0,
        "view_count": announcement.view_count,
    }


def _validate_targeting(audience, body, announcement=None):
    """Resolve course_id / target_role for the chosen audience."""
    course_id = None
    target_role = None
    if audience == "course":
        course_id = parse_int(
            body.get("course_id"),
            "course_id",
            minimum=1,
            required=announcement is None or announcement.course_id is None,
            default=announcement.course_id if announcement else None,
        )
        if course_id is None:
            raise ValidationError(
                "A course-targeted announcement needs a course.",
                fields={"course_id": "This field is required."},
            )
        if db.session.get(Course, course_id) is None:
            raise NotFoundError("That course was not found.")
    elif audience == "role":
        target_role = validate_enum(
            body.get("target_role")
            or (announcement.target_role if announcement else None),
            ROLES,
            "target_role",
        )
    return course_id, target_role


def _effective_status(status, publish_at):
    """`scheduled` when a future publish time is set, otherwise as requested."""
    if status == "published" and publish_at and publish_at > utcnow():
        return "scheduled"
    return status


# --- CRUD ---------------------------------------------------------------


@admin_bp.get("/announcements")
@admin_required
def list_announcements():
    query = Announcement.query

    status = request.args.get("status")
    if status:
        validate_enum(status, ANNOUNCEMENT_STATUSES, "status")
        query = query.filter(Announcement.status == status)

    audience = request.args.get("audience")
    if audience:
        validate_enum(audience, ANNOUNCEMENT_AUDIENCES, "audience")
        query = query.filter(Announcement.audience == audience)

    course_id = parse_int(
        request.args.get("course_id"), "course_id", minimum=1, required=False
    )
    if course_id:
        query = query.filter(Announcement.course_id == course_id)

    search = (request.args.get("q") or "").strip()
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            db.or_(Announcement.title.ilike(pattern), Announcement.body.ilike(pattern))
        )

    query = query.order_by(Announcement.created_at.desc(), Announcement.id.desc())
    page = paginate(query)
    page["items"] = [
        announcement_admin(item, delivery_stats(item)) for item in page["items"]
    ]
    return jsonify(page), 200


@admin_bp.post("/announcements")
@admin_required
def create_announcement():
    body = get_json_body()
    audience = validate_enum(
        body.get("audience"),
        ANNOUNCEMENT_AUDIENCES,
        "audience",
        required=False,
        default="all",
    )
    course_id, target_role = _validate_targeting(audience, body)
    publish_at = parse_datetime(
        body.get("publish_at"), "publish_at", required=False
    )
    expires_at = parse_datetime(
        body.get("expires_at"), "expires_at", required=False
    )
    if publish_at and expires_at and expires_at <= publish_at:
        raise ValidationError(
            "The expiry must be after the publication time.",
            fields={"expires_at": "Must be later than publish_at."},
        )

    requested_status = validate_enum(
        body.get("status"),
        ANNOUNCEMENT_STATUSES,
        "status",
        required=False,
        default="draft",
    )
    status = _effective_status(requested_status, publish_at)

    announcement = Announcement(
        title=clean_str(body.get("title"), "title", max_length=250, min_length=3),
        body=clean_str(body.get("body"), "body", max_length=20000, min_length=3),
        audience=audience,
        course_id=course_id,
        target_role=target_role,
        status=status,
        publish_at=publish_at or (utcnow() if status == "published" else None),
        expires_at=expires_at,
        created_by=current_user_id(),
    )
    db.session.add(announcement)
    db.session.flush()

    audit(
        "announcement.created",
        entity_type="announcement",
        entity_id=announcement.id,
        detail={
            "title": announcement.title,
            "audience": audience,
            "course_id": course_id,
            "target_role": target_role,
            "status": status,
        },
    )
    db.session.commit()

    delivery = None
    if announcement.status == "published":
        delivery = fan_out(announcement)
        audit(
            "announcement.published",
            entity_type="announcement",
            entity_id=announcement.id,
            detail=delivery,
        )
        db.session.commit()

    return (
        jsonify(
            {
                "announcement": announcement_admin(
                    announcement, delivery_stats(announcement)
                ),
                "fan_out": delivery,
            }
        ),
        201,
    )


@admin_bp.get("/announcements/<int:announcement_id>")
@admin_required
def get_announcement(announcement_id):
    announcement = get_or_404(Announcement, announcement_id, "announcement")
    return (
        jsonify(
            {
                "announcement": announcement_admin(
                    announcement, delivery_stats(announcement)
                ),
                "recipients": len(target_user_ids(announcement)),
            }
        ),
        200,
    )


@admin_bp.patch("/announcements/<int:announcement_id>")
@admin_required
def update_announcement(announcement_id):
    announcement = get_or_404(Announcement, announcement_id, "announcement")
    body = get_json_body()
    changes = {}

    if "title" in body:
        announcement.title = clean_str(
            body["title"], "title", max_length=250, min_length=3
        )
        changes["title"] = announcement.title
    if "body" in body:
        announcement.body = clean_str(
            body["body"], "body", max_length=20000, min_length=3
        )
        changes["body"] = True
    if "audience" in body:
        audience = validate_enum(
            body["audience"], ANNOUNCEMENT_AUDIENCES, "audience"
        )
        course_id, target_role = _validate_targeting(audience, body, announcement)
        announcement.audience = audience
        announcement.course_id = course_id
        announcement.target_role = target_role
        changes["audience"] = audience
    elif "course_id" in body and announcement.audience == "course":
        course_id = parse_int(body["course_id"], "course_id", minimum=1)
        if db.session.get(Course, course_id) is None:
            raise NotFoundError("That course was not found.")
        announcement.course_id = course_id
        changes["course_id"] = course_id

    if "publish_at" in body:
        announcement.publish_at = parse_datetime(
            body["publish_at"], "publish_at", required=False
        )
    if "expires_at" in body:
        announcement.expires_at = parse_datetime(
            body["expires_at"], "expires_at", required=False
        )
    if (
        announcement.publish_at
        and announcement.expires_at
        and announcement.expires_at <= announcement.publish_at
    ):
        raise ValidationError(
            "The expiry must be after the publication time.",
            fields={"expires_at": "Must be later than publish_at."},
        )

    publish_now = False
    if "status" in body:
        requested = validate_enum(body["status"], ANNOUNCEMENT_STATUSES, "status")
        status = _effective_status(requested, announcement.publish_at)
        if status != announcement.status:
            changes["status"] = {"from": announcement.status, "to": status}
            publish_now = status == "published"
            announcement.status = status
            if publish_now and announcement.publish_at is None:
                announcement.publish_at = utcnow()

    audit(
        "announcement.updated",
        entity_type="announcement",
        entity_id=announcement.id,
        detail={"changes": changes},
    )
    db.session.commit()

    delivery = None
    if publish_now:
        delivery = fan_out(announcement)
        audit(
            "announcement.published",
            entity_type="announcement",
            entity_id=announcement.id,
            detail=delivery,
        )
        db.session.commit()

    return (
        jsonify(
            {
                "announcement": announcement_admin(
                    announcement, delivery_stats(announcement)
                ),
                "fan_out": delivery,
            }
        ),
        200,
    )


@admin_bp.post("/announcements/<int:announcement_id>/publish")
@admin_required
def publish_announcement(announcement_id):
    """Publish immediately and fan out to the targeted students."""
    announcement = get_or_404(Announcement, announcement_id, "announcement")
    previous = announcement.status
    announcement.status = "published"
    if announcement.publish_at is None or announcement.publish_at > utcnow():
        announcement.publish_at = utcnow()
    db.session.commit()

    delivery = fan_out(announcement)
    audit(
        "announcement.published",
        entity_type="announcement",
        entity_id=announcement.id,
        detail={"from": previous, **delivery},
    )
    db.session.commit()
    return (
        jsonify(
            {
                "announcement": announcement_admin(
                    announcement, delivery_stats(announcement)
                ),
                "previous_status": previous,
                "fan_out": delivery,
            }
        ),
        200,
    )


@admin_bp.post("/announcements/<int:announcement_id>/expire")
@admin_required
def expire_announcement(announcement_id):
    """Expire an announcement now, or at a given time."""
    announcement = get_or_404(Announcement, announcement_id, "announcement")
    body = request.get_json(silent=True) or {}
    expires_at = parse_datetime(
        body.get("expires_at"), "expires_at", required=False, default=utcnow()
    )
    announcement.expires_at = expires_at
    if expires_at <= utcnow():
        announcement.status = "archived"
    audit(
        "announcement.expired",
        entity_type="announcement",
        entity_id=announcement.id,
        detail={"expires_at": expires_at.isoformat(), "status": announcement.status},
    )
    db.session.commit()
    return (
        jsonify(
            {
                "announcement": announcement_admin(
                    announcement, delivery_stats(announcement)
                ),
                "message": "The announcement is no longer visible to students.",
            }
        ),
        200,
    )


@admin_bp.delete("/announcements/<int:announcement_id>")
@admin_required
def archive_announcement(announcement_id):
    """Archive an announcement. Delivered notifications are left in place."""
    announcement = get_or_404(Announcement, announcement_id, "announcement")
    from app.common.validators import parse_bool

    if parse_bool(request.args.get("hard"), "hard", default=False):
        audit(
            "announcement.deleted",
            entity_type="announcement",
            entity_id=announcement.id,
            detail={"title": announcement.title},
        )
        db.session.delete(announcement)
        db.session.commit()
        return "", 204

    previous = announcement.status
    announcement.status = "archived"
    audit(
        "announcement.archived",
        entity_type="announcement",
        entity_id=announcement.id,
        detail={"from": previous, "to": "archived"},
    )
    db.session.commit()
    return (
        jsonify(
            {
                "announcement": announcement_admin(
                    announcement, delivery_stats(announcement)
                ),
                "previous_status": previous,
            }
        ),
        200,
    )


@admin_bp.get("/announcements/<int:announcement_id>/recipients")
@admin_required
def announcement_recipients(announcement_id):
    """Who the announcement targets, and whether they have read it."""
    announcement = get_or_404(Announcement, announcement_id, "announcement")
    user_ids = target_user_ids(announcement)
    read_by = {
        row[0]
        for row in db.session.query(Notification.user_id)
        .filter(
            Notification.dedupe_key == f"announcement:{announcement.id}",
            Notification.is_read.is_(True),
        )
        .all()
    }
    users = User.query.filter(User.id.in_(user_ids or [0])).all()
    return (
        jsonify(
            {
                "announcement_id": announcement.id,
                "delivery": delivery_stats(announcement),
                "items": [
                    {
                        "student_id": user.id,
                        "full_name": user.full_name,
                        "email": user.email,
                        "read": user.id in read_by,
                    }
                    for user in users
                ],
                "total": len(users),
            }
        ),
        200,
    )

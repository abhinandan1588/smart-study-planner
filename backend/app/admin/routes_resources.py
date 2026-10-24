"""Study material management (PRD 4.7).

Uploads are validated by extension, declared resource type and size, stored
under ``backend/uploads/admin/`` with a randomised filename, and are served
only through this permission-checked endpoint — never from a static path.
Student private uploads (``owner_id`` set) are listed for storage accounting
but their files are not readable here.
"""

from flask import current_app, jsonify, request, send_file

from app.admin import admin_bp
from app.admin.helpers import audit, get_or_404
from app.admin.serializers import resource_admin
from app.common.decorators import admin_required, current_user_id
from app.common.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.common.pagination import paginate
from app.common.storage import delete_upload, resolve_upload_path, save_upload, storage_usage
from app.common.validators import (
    clean_str,
    get_json_body,
    parse_bool,
    parse_int,
    validate_enum,
)
from app.extensions import db
from app.models import (
    RESOURCE_STATUSES,
    RESOURCE_TYPES,
    RESOURCE_VISIBILITIES,
    Course,
    Resource,
    Subject,
    SyllabusUnit,
    Topic,
    utcnow,
)
from app.models.resource import new_access_token

LINK_TYPES = ("link",)
UPLOAD_TYPES = tuple(kind for kind in RESOURCE_TYPES if kind not in LINK_TYPES)


def _shared_resource_or_404(resource_id):
    """Admin-managed resources only; student private uploads stay private."""
    resource = db.session.get(Resource, resource_id)
    if resource is None:
        raise NotFoundError("That resource was not found.")
    return resource


def _assert_manageable(resource):
    if resource.owner_id is not None:
        raise ForbiddenError(
            "This is a student's private upload. Administrators may not open or "
            "edit it (PRD 3.10 / 2.3)."
        )
    return resource


def _resolve_links(source, required=False):
    """Validate and normalise course / subject / unit / topic associations."""
    links = {}
    for field in ("course_id", "subject_id", "unit_id", "topic_id"):
        links[field] = parse_int(
            source.get(field), field, minimum=1, required=False
        )

    if links["topic_id"]:
        topic = db.session.get(Topic, links["topic_id"])
        if topic is None:
            raise NotFoundError("That topic was not found.")
        unit = topic.unit
        links["unit_id"] = unit.id if unit else links["unit_id"]
        links["subject_id"] = unit.subject_id if unit else links["subject_id"]
        if unit is not None and unit.version is not None:
            links["course_id"] = unit.version.course_id
    elif links["unit_id"]:
        unit = db.session.get(SyllabusUnit, links["unit_id"])
        if unit is None:
            raise NotFoundError("That syllabus unit was not found.")
        links["subject_id"] = unit.subject_id
        if unit.version is not None:
            links["course_id"] = unit.version.course_id
    else:
        if links["subject_id"] and db.session.get(Subject, links["subject_id"]) is None:
            raise NotFoundError("That subject was not found.")
        if links["course_id"] and db.session.get(Course, links["course_id"]) is None:
            raise NotFoundError("That course was not found.")

    if required and not any(links.values()):
        raise ValidationError(
            "Associate the material with at least a course.",
            fields={"course_id": "This field is required."},
        )
    return links


@admin_bp.get("/resources")
@admin_required
def list_resources():
    query = Resource.query

    scope = validate_enum(
        request.args.get("scope"),
        ("shared", "student", "all"),
        "scope",
        required=False,
        default="shared",
    )
    if scope == "shared":
        query = query.filter(Resource.owner_id.is_(None))
    elif scope == "student":
        query = query.filter(Resource.owner_id.isnot(None))

    search = (request.args.get("q") or "").strip()
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            db.or_(
                Resource.title.ilike(pattern),
                Resource.description.ilike(pattern),
                Resource.tags.ilike(pattern),
            )
        )

    resource_type = request.args.get("type")
    if resource_type:
        validate_enum(resource_type, RESOURCE_TYPES, "type")
        query = query.filter(Resource.resource_type == resource_type)

    status = request.args.get("status")
    if status:
        validate_enum(status, RESOURCE_STATUSES, "status")
        query = query.filter(Resource.status == status)

    visibility = request.args.get("visibility")
    if visibility:
        validate_enum(visibility, RESOURCE_VISIBILITIES, "visibility")
        query = query.filter(Resource.visibility == visibility)

    for field, column in (
        ("course_id", Resource.course_id),
        ("subject_id", Resource.subject_id),
        ("topic_id", Resource.topic_id),
    ):
        value = parse_int(request.args.get(field), field, minimum=1, required=False)
        if value:
            query = query.filter(column == value)

    query = query.order_by(Resource.created_at.desc(), Resource.id.desc())
    page = paginate(query, serializer=resource_admin)
    page["scope"] = scope
    return jsonify(page), 200


@admin_bp.post("/resources")
@admin_required
def create_resource():
    """Upload a file, or register an external link (`resource_type=link`)."""
    is_multipart = "multipart/form-data" in (request.content_type or "")
    source = request.form if is_multipart else get_json_body()

    resource_type = validate_enum(
        source.get("resource_type"), RESOURCE_TYPES, "resource_type"
    )
    title = clean_str(source.get("title"), "title", max_length=250, min_length=2)
    visibility = validate_enum(
        source.get("visibility"),
        RESOURCE_VISIBILITIES,
        "visibility",
        required=False,
        default="enrolled_only",
    )
    if visibility == "private":
        raise ValidationError(
            "Shared material cannot be private.",
            fields={"visibility": "Use public or enrolled_only."},
        )
    status = validate_enum(
        source.get("status"),
        RESOURCE_STATUSES,
        "status",
        required=False,
        default="draft",
    )
    links = _resolve_links(source)

    external_url = clean_str(
        source.get("external_url"), "external_url", max_length=1000, required=False
    )
    upload = request.files.get("file")
    meta = None

    if resource_type == "link":
        if not external_url:
            raise ValidationError(
                "A link resource needs a URL.",
                fields={"external_url": "This field is required."},
            )
        if not external_url.lower().startswith(("http://", "https://")):
            raise ValidationError(
                "Invalid URL.",
                fields={"external_url": "Must start with http:// or https://."},
            )
    else:
        if upload is None or not upload.filename:
            if not external_url:
                raise ValidationError(
                    "Attach a file or provide an external URL.",
                    fields={"file": "This field is required."},
                )
        else:
            meta = save_upload(upload, scope="admin", resource_type=resource_type)

    resource = Resource(
        title=title,
        description=clean_str(
            source.get("description"), "description", max_length=4000, required=False
        ),
        resource_type=resource_type,
        file_path=meta["file_path"] if meta else None,
        file_size_bytes=meta["size_bytes"] if meta else None,
        mime_type=meta["mime_type"] if meta else None,
        external_url=external_url,
        tags=clean_str(source.get("tags"), "tags", max_length=500, required=False),
        visibility=visibility,
        status=status,
        owner_id=None,
        uploaded_by=current_user_id(),
        access_token=new_access_token(),
        **links,
    )
    db.session.add(resource)
    db.session.flush()

    audit(
        "resource.created",
        entity_type="resource",
        entity_id=resource.id,
        detail={
            "title": resource.title,
            "type": resource.resource_type,
            "status": resource.status,
            "visibility": resource.visibility,
            "has_file": bool(resource.file_path),
            "size_bytes": resource.file_size_bytes,
        },
    )
    db.session.commit()

    if resource.status == "published":
        notified = _notify_new_resource(resource)
        db.session.commit()
    else:
        notified = 0

    return (
        jsonify(
            {
                "resource": resource_admin(resource),
                "notified_students": notified,
                "max_upload_mb": current_app.config.get("MAX_UPLOAD_MB"),
            }
        ),
        201,
    )


@admin_bp.get("/resources/storage")
@admin_required
def resource_storage():
    """Storage usage and upload-integrity warnings (PRD 4.7)."""
    by_type = [
        {
            "resource_type": row[0],
            "count": int(row[1]),
            "bytes": int(row[2] or 0),
        }
        for row in db.session.query(
            Resource.resource_type,
            db.func.count(Resource.id),
            db.func.coalesce(db.func.sum(Resource.file_size_bytes), 0),
        )
        .group_by(Resource.resource_type)
        .all()
    ]
    tracked_bytes = (
        db.session.query(db.func.coalesce(db.func.sum(Resource.file_size_bytes), 0))
        .scalar()
        or 0
    )

    failures = []
    for resource in Resource.query.filter(Resource.file_path.isnot(None)).all():
        try:
            resolve_upload_path(resource.file_path)
        except Exception:  # missing or unreadable file
            failures.append(
                {
                    "resource_id": resource.id,
                    "title": resource.title,
                    "file_path": resource.file_path,
                    "reason": "The stored file is missing from the upload folder.",
                }
            )

    return (
        jsonify(
            {
                "disk": storage_usage(),
                "tracked_bytes": int(tracked_bytes),
                "by_type": by_type,
                "shared_count": Resource.query.filter(
                    Resource.owner_id.is_(None)
                ).count(),
                "student_upload_count": Resource.query.filter(
                    Resource.owner_id.isnot(None)
                ).count(),
                "failures": failures,
                "max_upload_mb": current_app.config.get("MAX_UPLOAD_MB"),
                "allowed_extensions": sorted(
                    current_app.config.get("ALLOWED_UPLOAD_EXTENSIONS", [])
                ),
            }
        ),
        200,
    )


@admin_bp.get("/resources/<int:resource_id>")
@admin_required
def get_resource(resource_id):
    resource = _shared_resource_or_404(resource_id)
    payload = resource_admin(resource)
    if resource.owner_id is not None:
        payload["download_url"] = None
        payload["note"] = (
            "This is a student's private upload. Metadata only; the file is not "
            "readable through the admin API."
        )
    return jsonify({"resource": payload}), 200


@admin_bp.patch("/resources/<int:resource_id>")
@admin_required
def update_resource(resource_id):
    """Edit metadata / associations / visibility, or replace the stored file."""
    resource = _assert_manageable(_shared_resource_or_404(resource_id))
    is_multipart = "multipart/form-data" in (request.content_type or "")
    source = request.form if is_multipart else get_json_body()
    changes = {}

    if "title" in source:
        resource.title = clean_str(
            source.get("title"), "title", max_length=250, min_length=2
        )
        changes["title"] = resource.title
    if "description" in source:
        resource.description = clean_str(
            source.get("description"), "description", max_length=4000, required=False
        )
    if "tags" in source:
        resource.tags = clean_str(
            source.get("tags"), "tags", max_length=500, required=False
        )
    if "resource_type" in source:
        resource.resource_type = validate_enum(
            source.get("resource_type"), RESOURCE_TYPES, "resource_type"
        )
        changes["resource_type"] = resource.resource_type
    if "external_url" in source:
        url = clean_str(
            source.get("external_url"), "external_url", max_length=1000, required=False
        )
        if url and not url.lower().startswith(("http://", "https://")):
            raise ValidationError(
                "Invalid URL.",
                fields={"external_url": "Must start with http:// or https://."},
            )
        resource.external_url = url
    if "visibility" in source:
        visibility = validate_enum(
            source.get("visibility"), RESOURCE_VISIBILITIES, "visibility"
        )
        if visibility == "private":
            raise ValidationError(
                "Shared material cannot be private.",
                fields={"visibility": "Use public or enrolled_only."},
            )
        changes["visibility"] = {"from": resource.visibility, "to": visibility}
        resource.visibility = visibility

    if any(field in source for field in ("course_id", "subject_id", "unit_id", "topic_id")):
        links = _resolve_links(source)
        for field, value in links.items():
            setattr(resource, field, value)
        changes["links"] = links

    published_now = False
    if "status" in source:
        status = validate_enum(source.get("status"), RESOURCE_STATUSES, "status")
        if status != resource.status:
            published_now = status == "published"
            changes["status"] = {"from": resource.status, "to": status}
            resource.status = status

    replacement = request.files.get("file")
    if replacement is not None and replacement.filename:
        old_path = resource.file_path
        meta = save_upload(
            replacement, scope="admin", resource_type=resource.resource_type
        )
        resource.file_path = meta["file_path"]
        resource.file_size_bytes = meta["size_bytes"]
        resource.mime_type = meta["mime_type"]
        resource.access_token = new_access_token()
        changes["file_replaced"] = True
        if old_path:
            delete_upload(old_path)

    audit(
        "resource.updated",
        entity_type="resource",
        entity_id=resource.id,
        detail={"changes": changes},
    )
    db.session.commit()

    notified = 0
    if published_now:
        notified = _notify_new_resource(resource)
        db.session.commit()

    return (
        jsonify({"resource": resource_admin(resource), "notified_students": notified}),
        200,
    )


@admin_bp.post("/resources/<int:resource_id>/publish")
@admin_required
def publish_resource(resource_id):
    resource = _assert_manageable(_shared_resource_or_404(resource_id))
    if not resource.file_path and not resource.external_url:
        raise ValidationError(
            "This resource has neither a stored file nor a link and cannot be "
            "published."
        )
    previous = resource.status
    resource.status = "published"
    audit(
        "resource.published",
        entity_type="resource",
        entity_id=resource.id,
        detail={"from": previous, "to": "published"},
    )
    db.session.commit()
    notified = _notify_new_resource(resource)
    db.session.commit()
    return (
        jsonify(
            {
                "resource": resource_admin(resource),
                "previous_status": previous,
                "notified_students": notified,
            }
        ),
        200,
    )


@admin_bp.post("/resources/<int:resource_id>/unpublish")
@admin_required
def unpublish_resource(resource_id):
    resource = _assert_manageable(_shared_resource_or_404(resource_id))
    previous = resource.status
    resource.status = "draft"
    audit(
        "resource.unpublished",
        entity_type="resource",
        entity_id=resource.id,
        detail={"from": previous, "to": "draft"},
    )
    db.session.commit()
    return (
        jsonify({"resource": resource_admin(resource), "previous_status": previous}),
        200,
    )


@admin_bp.delete("/resources/<int:resource_id>")
@admin_required
def delete_resource(resource_id):
    """Archive by default. `?hard=true` removes the row and the stored file."""
    resource = _assert_manageable(_shared_resource_or_404(resource_id))
    hard = parse_bool(request.args.get("hard"), "hard", default=False)

    if hard:
        if resource.download_count and not parse_bool(
            request.args.get("confirm"), "confirm", default=False
        ):
            raise ConflictError(
                f"This resource has been downloaded {resource.download_count} "
                "time(s). Repeat the request with confirm=true to delete it "
                "permanently, or archive it instead.",
                extra={"download_count": resource.download_count},
            )
        stored = resource.file_path
        audit(
            "resource.deleted",
            entity_type="resource",
            entity_id=resource.id,
            detail={"title": resource.title, "file_removed": bool(stored)},
        )
        db.session.delete(resource)
        db.session.commit()
        if stored:
            delete_upload(stored)
        return "", 204

    previous = resource.status
    resource.status = "archived"
    audit(
        "resource.archived",
        entity_type="resource",
        entity_id=resource.id,
        detail={"from": previous, "to": "archived"},
    )
    db.session.commit()
    return (
        jsonify(
            {
                "resource": resource_admin(resource),
                "previous_status": previous,
                "message": "Resource archived. The stored file is retained.",
            }
        ),
        200,
    )


@admin_bp.get("/resources/<int:resource_id>/file")
@admin_required
def download_resource(resource_id):
    """Stream an admin-managed file. Never a predictable static path."""
    resource = _assert_manageable(_shared_resource_or_404(resource_id))
    if not resource.file_path:
        raise NotFoundError("This resource has no stored file.")
    path = resolve_upload_path(resource.file_path)
    resource.download_count = (resource.download_count or 0) + 1
    resource.last_accessed_at = utcnow()
    db.session.commit()
    return send_file(
        path,
        mimetype=resource.mime_type or "application/octet-stream",
        as_attachment=True,
        download_name=f"{resource.title[:80]}{path.suffix}",
        max_age=0,
    )


# --- fan-out ------------------------------------------------------------


def _notify_new_resource(resource):
    """Tell the affected students a new material is available."""
    from app.common.notifications import create_notification
    from app.models import Enrollment, User

    if resource.status != "published":
        return 0

    if resource.visibility == "public":
        user_ids = [
            row[0]
            for row in db.session.query(User.id)
            .filter(User.role == "student", User.status == "active")
            .all()
        ]
    elif resource.visibility == "enrolled_only" and resource.course_id:
        user_ids = [
            row[0]
            for row in db.session.query(Enrollment.user_id)
            .join(User, User.id == Enrollment.user_id)
            .filter(
                Enrollment.course_id == resource.course_id,
                Enrollment.status != "dropped",
                User.status == "active",
            )
            .all()
        ]
    else:
        return 0

    created = 0
    for user_id in set(user_ids):
        _, made = create_notification(
            user_id,
            "new_resource",
            f"New study material: {resource.title}",
            body=(resource.description or "")[:400] or None,
            link="/app/materials",
            dedupe_key=f"new_resource:{resource.id}",
        )
        created += 1 if made else 0
    return created

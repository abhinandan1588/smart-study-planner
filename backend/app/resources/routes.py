"""Student study materials: browse, upload, bookmark and download (PRD 3.10).

Access rules enforced on every request:

* a student sees public published resources, ``enrolled_only`` resources for
  courses they are actually enrolled in, resources granted through
  ``resource_permissions``, and their own private uploads — nothing else;
* uploads are validated by extension, declared type and size, stored under
  ``backend/uploads/students/<user_id>/`` with a randomised filename, and are
  never reachable through a static path;
* downloads go through ``/resources/file/<opaque token>`` (or the id route) and
  re-run the ownership/permission check on every single fetch.
"""

from flask import current_app, jsonify, request, send_file

from app.common.access import (
    can_access_resource,
    enrolled_course_ids,
    resource_visibility_filter,
)
from app.common.decorators import current_user, student_required
from app.common.errors import ForbiddenError, NotFoundError, ValidationError
from app.common.pagination import paginate
from app.common.serializers import resource_summary
from app.common.storage import (
    delete_upload,
    resolve_upload_path,
    save_upload,
)
from app.common.validators import (
    clean_str,
    parse_int,
    validate_enum,
)
from app.extensions import db
from app.models import (
    RESOURCE_TYPES,
    Resource,
    ResourceBookmark,
    utcnow,
)
from app.models.resource import new_access_token
from app.resources import materials_bp

UPLOADABLE_TYPES = (
    "pdf",
    "document",
    "image",
    "note",
    "practice_set",
    "revision_sheet",
)
RECENT_LIMIT = 10


# --- access control -----------------------------------------------------
# The visibility rules live in `app.common.access` so the AI retrieval path
# applies exactly the same checks as the download path.

_enrolled_course_ids = enrolled_course_ids
_visibility_filter = resource_visibility_filter
can_access = can_access_resource


def _authorised_resource(resource_id, user):
    resource = db.session.get(Resource, resource_id)
    if resource is None:
        raise NotFoundError("That resource was not found.")
    if not can_access(resource, user):
        # Do not confirm the existence of material the caller may not see.
        raise NotFoundError("That resource was not found.")
    return resource


def _download_url(resource):
    if not resource.file_path:
        return None
    if not resource.access_token:
        resource.access_token = new_access_token()
        db.session.commit()
    return f"/api/v1/student/resources/file/{resource.access_token}"


def _serialize(resource, bookmarked_ids=None):
    return resource_summary(
        resource,
        is_bookmarked=(
            resource.id in bookmarked_ids if bookmarked_ids is not None else None
        ),
        download_url=_download_url(resource) or "",
    )


# --- browsing -----------------------------------------------------------


@materials_bp.get("/resources")
@student_required
def list_resources():
    user = current_user()
    course_ids = _enrolled_course_ids(user.id)
    scope = validate_enum(
        request.args.get("scope"),
        ("all", "mine", "shared", "bookmarked"),
        "scope",
        required=False,
        default="all",
    )

    query = Resource.query.filter(_visibility_filter(user.id, course_ids))

    if scope == "mine":
        query = query.filter(Resource.owner_id == user.id)
    elif scope == "shared":
        query = query.filter(Resource.owner_id.is_(None))
    elif scope == "bookmarked":
        bookmarked = db.session.query(ResourceBookmark.resource_id).filter(
            ResourceBookmark.user_id == user.id
        )
        query = query.filter(Resource.id.in_(bookmarked))

    resource_type = request.args.get("type")
    if resource_type:
        validate_enum(resource_type, RESOURCE_TYPES, "type")
        query = query.filter(Resource.resource_type == resource_type)

    for field, column in (
        ("course_id", Resource.course_id),
        ("subject_id", Resource.subject_id),
        ("topic_id", Resource.topic_id),
    ):
        value = parse_int(request.args.get(field), field, minimum=1, required=False)
        if value:
            query = query.filter(column == value)

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

    query = query.order_by(Resource.created_at.desc(), Resource.id.desc())
    page = paginate(query)

    bookmarked_ids = {
        row[0]
        for row in db.session.query(ResourceBookmark.resource_id)
        .filter(ResourceBookmark.user_id == user.id)
        .all()
    }
    page["items"] = [_serialize(item, bookmarked_ids) for item in page["items"]]
    page["scope"] = scope
    return jsonify(page), 200


@materials_bp.get("/resources/recent")
@student_required
def recent_resources():
    """Most recently opened materials the caller may see."""
    user = current_user()
    course_ids = _enrolled_course_ids(user.id)
    rows = (
        Resource.query.filter(
            _visibility_filter(user.id, course_ids),
            Resource.last_accessed_at.isnot(None),
        )
        .order_by(Resource.last_accessed_at.desc())
        .limit(RECENT_LIMIT)
        .all()
    )
    bookmarked_ids = {
        row[0]
        for row in db.session.query(ResourceBookmark.resource_id)
        .filter(ResourceBookmark.user_id == user.id)
        .all()
    }
    return (
        jsonify(
            {
                "items": [_serialize(row, bookmarked_ids) for row in rows],
                "total": len(rows),
            }
        ),
        200,
    )


@materials_bp.get("/resources/<int:resource_id>")
@student_required
def get_resource(resource_id):
    user = current_user()
    resource = _authorised_resource(resource_id, user)
    bookmarked = (
        ResourceBookmark.query.filter_by(
            user_id=user.id, resource_id=resource.id
        ).first()
        is not None
    )
    payload = resource_summary(
        resource, is_bookmarked=bookmarked, download_url=_download_url(resource) or ""
    )
    return jsonify({"resource": payload}), 200


# --- download -----------------------------------------------------------


@materials_bp.get("/resources/file/<token>")
@student_required
def download_by_token(token):
    """Stream a file by its opaque token, re-checking permission every time."""
    user = current_user()
    handle = clean_str(token, "token", max_length=64, min_length=16)
    resource = Resource.query.filter_by(access_token=handle).first()
    if resource is None or not resource.file_path:
        raise NotFoundError("That file was not found.")
    if not can_access(resource, user):
        raise ForbiddenError("You do not have access to this file.")
    return _stream(resource)


@materials_bp.get("/resources/<int:resource_id>/file")
@student_required
def download_resource(resource_id):
    user = current_user()
    resource = _authorised_resource(resource_id, user)
    if not resource.file_path:
        raise NotFoundError("This resource has no stored file.")
    return _stream(resource)


def _stream(resource):
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


# --- private uploads ----------------------------------------------------


@materials_bp.post("/resources")
@student_required
def upload_resource():
    """Upload a private note. Validated by extension, type and size."""
    user = current_user()
    form = request.form
    resource_type = validate_enum(
        form.get("resource_type"),
        UPLOADABLE_TYPES,
        "resource_type",
        required=False,
        default="note",
    )
    title = clean_str(form.get("title"), "title", max_length=250, min_length=2)
    file_storage = request.files.get("file")
    if file_storage is None:
        raise ValidationError(
            "A file is required.", fields={"file": "Attach a file to upload."}
        )

    links = {}
    for field in ("course_id", "subject_id", "topic_id"):
        value = parse_int(form.get(field), field, minimum=1, required=False)
        links[field] = value
    if links["course_id"]:
        from app.common.access import require_enrollment

        require_enrollment(user.id, links["course_id"])
    if links["topic_id"]:
        from app.common.access import require_topic_in_enrolled_course

        topic, course_id = require_topic_in_enrolled_course(
            user.id, links["topic_id"]
        )
        links["course_id"] = course_id
        links["subject_id"] = topic.unit.subject_id

    meta = save_upload(
        file_storage,
        scope="students",
        owner_id=user.id,
        resource_type=resource_type,
    )

    resource = Resource(
        title=title,
        description=clean_str(
            form.get("description"), "description", max_length=2000, required=False
        ),
        resource_type=resource_type,
        file_path=meta["file_path"],
        file_size_bytes=meta["size_bytes"],
        mime_type=meta["mime_type"],
        tags=clean_str(form.get("tags"), "tags", max_length=500, required=False),
        visibility="private",
        status="published",
        owner_id=user.id,
        uploaded_by=user.id,
        access_token=new_access_token(),
        last_accessed_at=utcnow(),
        **links,
    )
    db.session.add(resource)
    db.session.commit()

    return (
        jsonify(
            {
                "resource": resource_summary(
                    resource, is_bookmarked=False, download_url=_download_url(resource)
                ),
                "max_upload_mb": current_app.config.get("MAX_UPLOAD_MB"),
            }
        ),
        201,
    )


@materials_bp.delete("/resources/<int:resource_id>")
@student_required
def delete_resource(resource_id):
    """Delete one of the caller's own uploads. Shared material is untouchable."""
    user = current_user()
    resource = db.session.get(Resource, resource_id)
    if resource is None or resource.owner_id != user.id:
        raise NotFoundError("That resource was not found.")
    stored_path = resource.file_path
    db.session.delete(resource)
    db.session.commit()
    if stored_path:
        delete_upload(stored_path)
    return "", 204


@materials_bp.post("/resources/<int:resource_id>/bookmark")
@student_required
def toggle_bookmark(resource_id):
    user = current_user()
    resource = _authorised_resource(resource_id, user)
    existing = ResourceBookmark.query.filter_by(
        user_id=user.id, resource_id=resource.id
    ).first()
    if existing is not None:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({"bookmarked": False, "resource_id": resource.id}), 200

    db.session.add(ResourceBookmark(user_id=user.id, resource_id=resource.id))
    db.session.commit()
    return jsonify({"bookmarked": True, "resource_id": resource.id}), 201

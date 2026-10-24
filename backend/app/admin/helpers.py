"""Shared helpers for the administrator blueprint."""

import csv
import io

from flask import Response

from app.common.audit import record_audit
from app.common.decorators import current_user_id
from app.common.errors import ConflictError, NotFoundError
from app.common.validators import slugify
from app.extensions import db


def get_or_404(model, object_id, label=None):
    instance = db.session.get(model, object_id)
    if instance is None:
        raise NotFoundError(f"That {label or model.__name__.lower()} was not found.")
    return instance


def audit(action, entity_type=None, entity_id=None, detail=None):
    """Record an administrative action attributed to the calling admin."""
    return record_audit(
        action,
        actor_id=current_user_id(),
        entity_type=entity_type,
        entity_id=entity_id,
        detail=detail,
    )


def unique_slug(model, raw, field="slug", exclude_id=None, explicit=False):
    """Slugify a value; reject an explicit duplicate, auto-suffix a derived one."""
    base = slugify(raw)
    column = getattr(model, field)

    def taken(candidate):
        query = model.query.filter(column == candidate)
        if exclude_id is not None:
            query = query.filter(model.id != exclude_id)
        return db.session.query(query.exists()).scalar()

    if not taken(base):
        return base
    if explicit:
        raise ConflictError(f"The slug '{base}' is already in use.")
    index = 2
    while taken(f"{base}-{index}"):
        index += 1
    return f"{base}-{index}"


def csv_response(filename, header, rows):
    """Build a downloadable CSV response from an iterable of row tuples."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)
    for row in rows:
        writer.writerow(["" if value is None else value for value in row])
    payload = buffer.getvalue()
    return Response(
        payload,
        mimetype="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(payload.encode("utf-8"))),
        },
    )

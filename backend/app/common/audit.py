"""Audit-log writer (PRD 2.3 / 10.1)."""

import json
import logging

from flask import has_request_context, request

from app.extensions import db
from app.models import AuditLog

logger = logging.getLogger(__name__)


def _client_ip():
    if not has_request_context():
        return None
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return (request.remote_addr or "")[:64] or None


def record_audit(
    action,
    actor_id=None,
    entity_type=None,
    entity_id=None,
    detail=None,
    commit=False,
):
    """Append an audit row.

    The row is added to the current session; the caller normally commits it in
    the same transaction as the action being audited.
    """
    entry = AuditLog(
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        detail_json=json.dumps(detail, default=str) if detail is not None else None,
        ip_address=_client_ip(),
    )
    db.session.add(entry)
    if commit:
        db.session.commit()
    logger.info(
        "audit action=%s actor=%s entity=%s:%s", action, actor_id, entity_type, entity_id
    )
    return entry

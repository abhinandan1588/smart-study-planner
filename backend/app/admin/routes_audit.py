"""Audit log review and service health (PRD 4.10)."""

from flask import jsonify

from app.admin import admin_bp
from app.common.decorators import admin_required
from app.common.pagination import paginate
from app.common.serializers import audit_log_entry
from app.common.storage import storage_usage
from app.common.validators import parse_date, parse_int
from app.extensions import db
from app.models import AuditLog
from flask import current_app, request


@admin_bp.get("/audit-logs")
@admin_required
def list_audit_logs():
    query = AuditLog.query

    action = (request.args.get("action") or "").strip()
    if action:
        query = query.filter(AuditLog.action.ilike(f"%{action}%"))

    entity_type = (request.args.get("entity_type") or "").strip()
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)

    actor_id = parse_int(
        request.args.get("actor_id"), "actor_id", minimum=1, required=False
    )
    if actor_id:
        query = query.filter(AuditLog.actor_id == actor_id)

    date_from = parse_date(request.args.get("from"), "from", required=False)
    if date_from:
        query = query.filter(AuditLog.created_at >= date_from)

    date_to = parse_date(request.args.get("to"), "to", required=False)
    if date_to:
        query = query.filter(AuditLog.created_at <= date_to)

    query = query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
    return jsonify(paginate(query, serializer=audit_log_entry)), 200


@admin_bp.get("/health")
@admin_required
def health():
    """Database, storage and AI provider status."""
    try:
        db.session.execute(db.text("SELECT 1"))
        database = "ok"
    except Exception:  # pragma: no cover - surfaced to the admin UI
        db.session.rollback()
        database = "error"

    return (
        jsonify(
            {
                "db": database,
                "storage": storage_usage(),
                "ai_provider": (
                    "configured" if current_app.config.get("AI_API_KEY") else "missing"
                ),
                "environment": current_app.config.get("ENV_NAME", "development"),
            }
        ),
        200,
    )

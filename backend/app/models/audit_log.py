"""Audit trail for significant administrative actions (PRD 2.3 / 10.1)."""

from app.extensions import db
from app.models.mixins import CreatedAtMixin, TimestampMixin


class AuditLog(CreatedAtMixin, db.Model):
    __tablename__ = "audit_logs"
    __table_args__ = (db.Index("ix_audit_logs_action_created", "action", "created_at"),)

    id = db.Column(db.Integer, primary_key=True)
    actor_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action = db.Column(db.String(80), nullable=False)
    entity_type = db.Column(db.String(60), nullable=True)
    entity_id = db.Column(db.Integer, nullable=True)
    detail_json = db.Column(db.Text, nullable=True)
    ip_address = db.Column(db.String(64), nullable=True)

    actor = db.relationship("User", foreign_keys=[actor_id])

    def __repr__(self):
        return f"<AuditLog {self.action} actor={self.actor_id}>"


class PlatformSetting(TimestampMixin, db.Model):
    """Key/value platform configuration editable by admins (PRD 4.10)."""

    __tablename__ = "platform_settings"

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(80), nullable=False, unique=True, index=True)
    value_json = db.Column(db.Text, nullable=True)
    description = db.Column(db.String(300), nullable=True)
    updated_by = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    editor = db.relationship("User", foreign_keys=[updated_by])

    def __repr__(self):
        return f"<PlatformSetting {self.key}>"

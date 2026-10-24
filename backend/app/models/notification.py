"""In-app notifications (PRD 3.11).

`uq_notification_dedupe` stops the same reminder being created twice.
"""

from app.extensions import db
from app.models.mixins import CreatedAtMixin

NOTIFICATION_TYPES = (
    "session_upcoming",
    "task_due",
    "task_overdue",
    "revision_due",
    "goal_deadline",
    "announcement",
    "new_resource",
    "plan_change",
)


class Notification(CreatedAtMixin, db.Model):
    __tablename__ = "notifications"
    __table_args__ = (
        db.UniqueConstraint("user_id", "dedupe_key", name="uq_notification_dedupe"),
        db.Index("ix_notifications_user_read_created", "user_id", "is_read", "created_at"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type = db.Column(db.String(40), nullable=False)
    title = db.Column(db.String(250), nullable=False)
    body = db.Column(db.Text, nullable=True)
    link = db.Column(db.String(300), nullable=True)
    is_read = db.Column(db.Boolean, nullable=False, default=False, index=True)
    read_at = db.Column(db.DateTime, nullable=True)
    dedupe_key = db.Column(db.String(160), nullable=True)

    user = db.relationship("User", back_populates="notifications")

    def __repr__(self):
        return f"<Notification {self.id} {self.type} user={self.user_id}>"

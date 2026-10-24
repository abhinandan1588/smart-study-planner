"""Per-student topic progress (PRD 3.4)."""

from app.extensions import db
from app.models.mixins import TimestampMixin

PROGRESS_STATUSES = ("not_started", "in_progress", "completed")


class TopicProgress(TimestampMixin, db.Model):
    __tablename__ = "topic_progress"
    __table_args__ = (
        db.UniqueConstraint("user_id", "topic_id", name="uq_topic_progress_user_topic"),
        db.Index("ix_topic_progress_user_status", "user_id", "status"),
        db.Index("ix_topic_progress_revision", "user_id", "next_revision_date"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    topic_id = db.Column(
        db.Integer, db.ForeignKey("topics.id", ondelete="CASCADE"), nullable=False
    )
    status = db.Column(db.String(20), nullable=False, default="not_started")
    time_spent_minutes = db.Column(db.Integer, nullable=False, default=0)
    notes = db.Column(db.Text, nullable=True)
    priority = db.Column(db.String(10), nullable=False, default="medium")
    target_date = db.Column(db.Date, nullable=True)
    needs_revision = db.Column(db.Boolean, nullable=False, default=False)
    next_revision_date = db.Column(db.Date, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship("User", back_populates="topic_progress")
    topic = db.relationship("Topic", back_populates="progress_records")

    def __repr__(self):
        return (
            f"<TopicProgress user={self.user_id} topic={self.topic_id} {self.status}>"
        )

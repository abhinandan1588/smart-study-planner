"""Focus timer records (PRD 3.6).

Interrupted and abandoned sessions stay distinct from completed ones, and the
stored `started_at` / `paused_accumulated_seconds` let the UI rebuild a running
timer after a page refresh.
"""

from app.extensions import db
from app.models.mixins import TimestampMixin

FOCUS_MODES = ("pomodoro", "custom")
FOCUS_STATUSES = ("running", "paused", "completed", "interrupted", "abandoned")


class FocusSession(TimestampMixin, db.Model):
    __tablename__ = "focus_sessions"
    __table_args__ = (
        db.Index("ix_focus_sessions_user_started", "user_id", "started_at"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    course_id = db.Column(
        db.Integer, db.ForeignKey("courses.id", ondelete="SET NULL"), nullable=True
    )
    subject_id = db.Column(
        db.Integer, db.ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True
    )
    topic_id = db.Column(
        db.Integer, db.ForeignKey("topics.id", ondelete="SET NULL"), nullable=True
    )
    mode = db.Column(db.String(20), nullable=False, default="pomodoro")
    target_minutes = db.Column(db.Integer, nullable=False)
    focus_minutes = db.Column(db.Integer, nullable=False, default=0)
    break_minutes = db.Column(db.Integer, nullable=False, default=0)
    started_at = db.Column(db.DateTime, nullable=False, index=True)
    ended_at = db.Column(db.DateTime, nullable=True)
    status = db.Column(db.String(20), nullable=False, default="running")
    paused_accumulated_seconds = db.Column(db.Integer, nullable=False, default=0)
    paused_at = db.Column(db.DateTime, nullable=True)
    cycles_completed = db.Column(db.Integer, nullable=False, default=0)

    user = db.relationship("User", back_populates="focus_sessions")
    course = db.relationship("Course")
    subject = db.relationship("Subject")
    topic = db.relationship("Topic")

    def __repr__(self):
        return f"<FocusSession {self.id} user={self.user_id} {self.status}>"

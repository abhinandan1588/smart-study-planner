"""Student tasks (PRD 3.5)."""

from app.extensions import db
from app.models.mixins import TimestampMixin

TASK_STATUSES = ("pending", "in_progress", "completed", "cancelled")
TASK_PRIORITIES = ("low", "medium", "high")


class Task(TimestampMixin, db.Model):
    __tablename__ = "tasks"
    __table_args__ = (
        db.Index("ix_tasks_user_status_due", "user_id", "status", "due_date"),
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
    title = db.Column(db.String(250), nullable=False)
    description = db.Column(db.Text, nullable=True)
    priority = db.Column(db.String(10), nullable=False, default="medium")
    due_date = db.Column(db.Date, nullable=True, index=True)
    due_time = db.Column(db.Time, nullable=True)
    estimated_minutes = db.Column(db.Integer, nullable=True)
    status = db.Column(db.String(20), nullable=False, default="pending")
    reminder_at = db.Column(db.DateTime, nullable=True)
    recurrence_rule = db.Column(db.String(100), nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship("User", back_populates="tasks")
    course = db.relationship("Course")
    subject = db.relationship("Subject")
    topic = db.relationship("Topic")

    def __repr__(self):
        return f"<Task {self.id} {self.title!r} {self.status}>"

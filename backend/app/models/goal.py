"""Study goals (PRD 3.7)."""

from app.extensions import db
from app.models.mixins import TimestampMixin

GOAL_CATEGORIES = (
    "course_completion",
    "topics_count",
    "weekly_hours",
    "daily_tasks",
    "study_streak",
    "revision_cycle",
    "practice_questions",
)
GOAL_STATUSES = ("active", "completed", "paused", "overdue")
GOAL_UNITS = ("topics", "hours", "days", "questions", "tasks")


class Goal(TimestampMixin, db.Model):
    __tablename__ = "goals"

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
    title = db.Column(db.String(250), nullable=False)
    description = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(40), nullable=False)
    target_value = db.Column(db.Float, nullable=False)
    current_value = db.Column(db.Float, nullable=False, default=0)
    unit = db.Column(db.String(20), nullable=True)
    start_date = db.Column(db.Date, nullable=False)
    deadline = db.Column(db.Date, nullable=False, index=True)
    status = db.Column(db.String(20), nullable=False, default="active")
    completed_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship("User", back_populates="goals")
    course = db.relationship("Course")

    @property
    def progress_percent(self):
        if not self.target_value:
            return 0.0
        return round(min(100.0, (self.current_value / self.target_value) * 100), 2)

    def __repr__(self):
        return f"<Goal {self.id} {self.title!r} {self.status}>"

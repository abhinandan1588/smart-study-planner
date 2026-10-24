"""Student course enrollments (PRD 3.3)."""

from app.extensions import db
from app.models.mixins import utcnow

ENROLLMENT_STATUSES = ("active", "completed", "dropped")
PRIORITIES = ("low", "medium", "high")
DIFFICULTY_LEVELS = ("easy", "medium", "hard")


class Enrollment(db.Model):
    __tablename__ = "enrollments"
    __table_args__ = (
        db.UniqueConstraint("user_id", "course_id", name="uq_enrollment_user_course"),
        db.Index("ix_enrollments_user_status", "user_id", "status"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    course_id = db.Column(
        db.Integer, db.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False
    )
    target_completion_date = db.Column(db.Date, nullable=True)
    priority = db.Column(db.String(10), nullable=False, default="medium")
    difficulty = db.Column(db.String(10), nullable=False, default="medium")
    status = db.Column(db.String(20), nullable=False, default="active")
    enrolled_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    last_accessed_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship("User", back_populates="enrollments")
    course = db.relationship("Course", back_populates="enrollments")

    def __repr__(self):
        return f"<Enrollment user={self.user_id} course={self.course_id}>"

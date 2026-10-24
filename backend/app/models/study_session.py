"""Planned timetable sessions (PRD 3.5)."""

from app.extensions import db
from app.models.mixins import TimestampMixin

SESSION_TYPES = ("study", "revision", "break")
SESSION_STATUSES = ("planned", "completed", "skipped", "partially_completed")


class StudySession(TimestampMixin, db.Model):
    __tablename__ = "study_sessions"
    __table_args__ = (
        db.Index("ix_study_sessions_user_start", "user_id", "start_at"),
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
    session_type = db.Column(db.String(20), nullable=False, default="study")
    start_at = db.Column(db.DateTime, nullable=False, index=True)
    end_at = db.Column(db.DateTime, nullable=False)
    planned_minutes = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(25), nullable=False, default="planned")
    actual_minutes = db.Column(db.Integer, nullable=False, default=0)
    recurrence_rule = db.Column(db.String(100), nullable=True)
    recurrence_parent_id = db.Column(
        db.Integer,
        db.ForeignKey("study_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    generated_batch_id = db.Column(db.String(36), nullable=True, index=True)
    rescheduled_from_id = db.Column(
        db.Integer,
        db.ForeignKey("study_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    notes = db.Column(db.Text, nullable=True)

    user = db.relationship(
        "User", back_populates="study_sessions", foreign_keys=[user_id]
    )
    course = db.relationship("Course")
    subject = db.relationship("Subject")
    topic = db.relationship("Topic")
    recurrence_children = db.relationship(
        "StudySession",
        backref=db.backref("recurrence_parent", remote_side=[id]),
        foreign_keys=[recurrence_parent_id],
    )
    reschedule_children = db.relationship(
        "StudySession",
        backref=db.backref("rescheduled_from", remote_side=[id]),
        foreign_keys=[rescheduled_from_id],
    )

    def __repr__(self):
        return f"<StudySession {self.id} {self.title!r} {self.start_at}>"

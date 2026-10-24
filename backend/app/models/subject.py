"""Subjects and the many-to-many course/subject link (PRD 4.5)."""

from app.extensions import db
from app.models.mixins import TimestampMixin

SUBJECT_STATUSES = ("active", "archived")


class Subject(TimestampMixin, db.Model):
    __tablename__ = "subjects"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    slug = db.Column(db.String(220), nullable=False, unique=True, index=True)
    description = db.Column(db.Text, nullable=True)
    weightage = db.Column(db.Float, nullable=True)
    status = db.Column(db.String(20), nullable=False, default="active", index=True)

    course_subjects = db.relationship(
        "CourseSubject",
        back_populates="subject",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    courses = db.relationship(
        "Course",
        secondary="course_subjects",
        viewonly=True,
        back_populates="subjects",
    )
    units = db.relationship(
        "SyllabusUnit",
        back_populates="subject",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self):
        return f"<Subject {self.id} {self.slug}>"


class CourseSubject(db.Model):
    __tablename__ = "course_subjects"
    __table_args__ = (
        db.UniqueConstraint("course_id", "subject_id", name="uq_course_subject"),
        db.Index("ix_course_subjects_course_id", "course_id"),
    )

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(
        db.Integer, db.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False
    )
    subject_id = db.Column(
        db.Integer, db.ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False
    )
    display_order = db.Column(db.Integer, nullable=False, default=0)
    weightage = db.Column(db.Float, nullable=True)

    course = db.relationship("Course", back_populates="course_subjects")
    subject = db.relationship("Subject", back_populates="course_subjects")

    def __repr__(self):
        return f"<CourseSubject course={self.course_id} subject={self.subject_id}>"

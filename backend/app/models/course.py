"""Course / examination definitions."""

from app.extensions import db
from app.models.mixins import TimestampMixin

COURSE_CATEGORIES = ("competitive_exam", "university", "skill")
COURSE_STATUSES = ("draft", "published", "archived")


class Course(TimestampMixin, db.Model):
    __tablename__ = "courses"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    slug = db.Column(db.String(220), nullable=False, unique=True, index=True)
    description = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(50), nullable=False, index=True)
    level = db.Column(db.String(50), nullable=True)
    thumbnail_url = db.Column(db.String(500), nullable=True)
    estimated_duration_weeks = db.Column(db.Integer, nullable=True)
    target_audience = db.Column(db.String(300), nullable=True)
    status = db.Column(db.String(20), nullable=False, default="draft", index=True)
    created_by = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    creator = db.relationship("User", foreign_keys=[created_by])
    course_subjects = db.relationship(
        "CourseSubject",
        back_populates="course",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="CourseSubject.display_order",
    )
    subjects = db.relationship(
        "Subject",
        secondary="course_subjects",
        viewonly=True,
        back_populates="courses",
    )
    enrollments = db.relationship(
        "Enrollment",
        back_populates="course",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    students = db.relationship(
        "User", secondary="enrollments", viewonly=True, back_populates="courses"
    )
    syllabus_versions = db.relationship(
        "SyllabusVersion",
        back_populates="course",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="SyllabusVersion.version_number",
    )

    @property
    def published_version(self):
        published = [
            version
            for version in self.syllabus_versions
            if version.status == "published"
        ]
        if not published:
            return None
        return max(published, key=lambda version: version.version_number)

    def __repr__(self):
        return f"<Course {self.id} {self.slug} {self.status}>"

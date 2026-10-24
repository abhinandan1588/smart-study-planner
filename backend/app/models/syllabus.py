"""Syllabus versioning, units/chapters and topics.

Progress rows point at `topics`, and publishing a new `SyllabusVersion` never
deletes topics, so student progress is never silently wiped by a syllabus edit
(PRD 3.4 / 4.6).

Structural edits happen on a **draft** version that is cloned from the version
currently published. The clone records its lineage (`cloned_from_version_id`,
`cloned_from_unit_id`, `cloned_from_topic_id`) so that publishing the draft can
copy every student's `topic_progress` row forward onto the matching new topic,
while the old version is archived with its topics — and therefore its progress
rows — still intact.
"""

from app.extensions import db
from app.models.mixins import CreatedAtMixin, TimestampMixin

SYLLABUS_VERSION_STATUSES = ("draft", "published", "archived")
UNIT_TYPES = ("unit", "chapter")
DIFFICULTIES = ("easy", "medium", "hard")
IMPORTANCES = ("low", "medium", "high")


class SyllabusVersion(CreatedAtMixin, db.Model):
    __tablename__ = "syllabus_versions"
    __table_args__ = (
        db.UniqueConstraint(
            "course_id", "version_number", name="uq_syllabus_version_number"
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(
        db.Integer,
        db.ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(20), nullable=False, default="draft", index=True)
    notes = db.Column(db.Text, nullable=True)
    published_at = db.Column(db.DateTime, nullable=True)
    cloned_from_version_id = db.Column(
        db.Integer,
        db.ForeignKey("syllabus_versions.id", ondelete="SET NULL"),
        nullable=True,
    )

    course = db.relationship("Course", back_populates="syllabus_versions")
    cloned_from = db.relationship(
        "SyllabusVersion", remote_side=[id], foreign_keys=[cloned_from_version_id]
    )
    units = db.relationship(
        "SyllabusUnit",
        back_populates="version",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="SyllabusUnit.display_order",
    )

    def __repr__(self):
        return f"<SyllabusVersion course={self.course_id} v{self.version_number}>"


class SyllabusUnit(TimestampMixin, db.Model):
    """A unit or, when `parent_id` is set, a chapter nested under a unit."""

    __tablename__ = "syllabus_units"
    __table_args__ = (
        db.Index(
            "ix_syllabus_units_version_subject_order",
            "syllabus_version_id",
            "subject_id",
            "display_order",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    syllabus_version_id = db.Column(
        db.Integer,
        db.ForeignKey("syllabus_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    subject_id = db.Column(
        db.Integer,
        db.ForeignKey("subjects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parent_id = db.Column(
        db.Integer,
        db.ForeignKey("syllabus_units.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    title = db.Column(db.String(250), nullable=False)
    description = db.Column(db.Text, nullable=True)
    unit_type = db.Column(db.String(20), nullable=False, default="unit")
    display_order = db.Column(db.Integer, nullable=False, default=0)
    cloned_from_unit_id = db.Column(
        db.Integer,
        db.ForeignKey("syllabus_units.id", ondelete="SET NULL"),
        nullable=True,
    )

    version = db.relationship("SyllabusVersion", back_populates="units")
    subject = db.relationship("Subject", back_populates="units")
    children = db.relationship(
        "SyllabusUnit",
        back_populates="parent",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="SyllabusUnit.display_order",
        foreign_keys=[parent_id],
    )
    parent = db.relationship(
        "SyllabusUnit",
        back_populates="children",
        remote_side=[id],
        foreign_keys=[parent_id],
    )
    topics = db.relationship(
        "Topic",
        back_populates="unit",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Topic.display_order",
    )

    def __repr__(self):
        return f"<SyllabusUnit {self.id} {self.unit_type} {self.title!r}>"


class Topic(TimestampMixin, db.Model):
    __tablename__ = "topics"
    __table_args__ = (db.Index("ix_topics_unit_order", "unit_id", "display_order"),)

    id = db.Column(db.Integer, primary_key=True)
    unit_id = db.Column(
        db.Integer,
        db.ForeignKey("syllabus_units.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = db.Column(db.String(250), nullable=False)
    description = db.Column(db.Text, nullable=True)
    estimated_minutes = db.Column(db.Integer, nullable=False, default=60)
    difficulty = db.Column(db.String(10), nullable=False, default="medium")
    importance = db.Column(db.String(10), nullable=False, default="medium")
    display_order = db.Column(db.Integer, nullable=False, default=0)
    cloned_from_topic_id = db.Column(
        db.Integer, db.ForeignKey("topics.id", ondelete="SET NULL"), nullable=True
    )

    unit = db.relationship("SyllabusUnit", back_populates="topics")
    progress_records = db.relationship(
        "TopicProgress",
        back_populates="topic",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self):
        return f"<Topic {self.id} {self.title!r}>"

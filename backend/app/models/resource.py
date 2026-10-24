"""Study material metadata, access rules and bookmarks (PRD 3.10 / 4.7).

Files live under `backend/uploads/` and are never served from a predictable
static path; every download goes through a permission-checked endpoint.
"""

import secrets

from app.extensions import db
from app.models.mixins import CreatedAtMixin, TimestampMixin


def new_access_token():
    """Opaque, unguessable download handle for a stored file."""
    return secrets.token_urlsafe(32)

RESOURCE_TYPES = (
    "pdf",
    "document",
    "image",
    "link",
    "practice_set",
    "revision_sheet",
    "note",
)
RESOURCE_VISIBILITIES = ("public", "enrolled_only", "private")
RESOURCE_STATUSES = ("draft", "published", "archived")
ACCESS_LEVELS = ("read", "download")


class Resource(TimestampMixin, db.Model):
    __tablename__ = "resources"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(250), nullable=False)
    description = db.Column(db.Text, nullable=True)
    resource_type = db.Column(db.String(30), nullable=False, index=True)
    file_path = db.Column(db.String(500), nullable=True)
    file_size_bytes = db.Column(db.Integer, nullable=True)
    mime_type = db.Column(db.String(100), nullable=True)
    external_url = db.Column(db.String(1000), nullable=True)
    tags = db.Column(db.String(500), nullable=True)
    course_id = db.Column(
        db.Integer,
        db.ForeignKey("courses.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    subject_id = db.Column(
        db.Integer, db.ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True
    )
    unit_id = db.Column(
        db.Integer, db.ForeignKey("syllabus_units.id", ondelete="SET NULL"), nullable=True
    )
    topic_id = db.Column(
        db.Integer,
        db.ForeignKey("topics.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    visibility = db.Column(db.String(20), nullable=False, default="private")
    status = db.Column(db.String(20), nullable=False, default="published", index=True)
    owner_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    uploaded_by = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    download_count = db.Column(db.Integer, nullable=False, default=0)
    last_accessed_at = db.Column(db.DateTime, nullable=True)
    # Opaque handle used in the download URL so a stored file is never
    # reachable through a guessable path (PRD 3.10 / 10.1).
    access_token = db.Column(
        db.String(64),
        nullable=True,
        unique=True,
        index=True,
        default=new_access_token,
    )

    owner = db.relationship(
        "User", back_populates="owned_resources", foreign_keys=[owner_id]
    )
    uploader = db.relationship("User", foreign_keys=[uploaded_by])
    course = db.relationship("Course")
    subject = db.relationship("Subject")
    unit = db.relationship("SyllabusUnit")
    topic = db.relationship("Topic")
    permissions = db.relationship(
        "ResourcePermission",
        back_populates="resource",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    bookmarks = db.relationship(
        "ResourceBookmark",
        back_populates="resource",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    chunks = db.relationship(
        "DocumentChunk",
        back_populates="resource",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="DocumentChunk.chunk_index",
    )

    def __repr__(self):
        return f"<Resource {self.id} {self.title!r} {self.visibility}>"


class ResourcePermission(db.Model):
    __tablename__ = "resource_permissions"
    __table_args__ = (
        db.UniqueConstraint(
            "resource_id", "user_id", "course_id", name="uq_resource_permission_target"
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    resource_id = db.Column(
        db.Integer,
        db.ForeignKey("resources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    course_id = db.Column(
        db.Integer, db.ForeignKey("courses.id", ondelete="CASCADE"), nullable=True
    )
    access_level = db.Column(db.String(20), nullable=False, default="read")

    resource = db.relationship("Resource", back_populates="permissions")
    user = db.relationship("User")
    course = db.relationship("Course")

    def __repr__(self):
        return f"<ResourcePermission resource={self.resource_id}>"


class ResourceBookmark(CreatedAtMixin, db.Model):
    __tablename__ = "resource_bookmarks"
    __table_args__ = (
        db.UniqueConstraint("user_id", "resource_id", name="uq_resource_bookmark"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    resource_id = db.Column(
        db.Integer, db.ForeignKey("resources.id", ondelete="CASCADE"), nullable=False
    )

    user = db.relationship("User", back_populates="resource_bookmarks")
    resource = db.relationship("Resource", back_populates="bookmarks")

    def __repr__(self):
        return f"<ResourceBookmark user={self.user_id} resource={self.resource_id}>"

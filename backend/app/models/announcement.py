"""Admin announcements (PRD 4.8)."""

from app.extensions import db
from app.models.mixins import TimestampMixin

ANNOUNCEMENT_AUDIENCES = ("all", "course", "role")
ANNOUNCEMENT_STATUSES = ("draft", "scheduled", "published", "archived")


class Announcement(TimestampMixin, db.Model):
    __tablename__ = "announcements"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(250), nullable=False)
    body = db.Column(db.Text, nullable=False)
    audience = db.Column(db.String(20), nullable=False, default="all")
    course_id = db.Column(
        db.Integer, db.ForeignKey("courses.id", ondelete="CASCADE"), nullable=True
    )
    # Required when audience == 'role'; targets every account with that role.
    target_role = db.Column(db.String(20), nullable=True)
    status = db.Column(db.String(20), nullable=False, default="draft", index=True)
    publish_at = db.Column(db.DateTime, nullable=True)
    expires_at = db.Column(db.DateTime, nullable=True)
    created_by = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    view_count = db.Column(db.Integer, nullable=False, default=0)

    course = db.relationship("Course")
    creator = db.relationship("User", foreign_keys=[created_by])

    def __repr__(self):
        return f"<Announcement {self.id} {self.title!r} {self.status}>"

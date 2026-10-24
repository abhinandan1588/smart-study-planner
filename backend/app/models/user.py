"""User accounts, roles, preferences and the JWT blocklist."""

from app.extensions import db
from app.models.mixins import CreatedAtMixin, TimestampMixin, utcnow

ROLES = ("student", "admin")
USER_STATUSES = ("active", "suspended", "pending_verification")


class User(TimestampMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), nullable=False, unique=True, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="student", index=True)
    status = db.Column(
        db.String(30), nullable=False, default="pending_verification", index=True
    )

    # Email verification / password recovery (no SMTP configured: tokens are
    # logged server side and surfaced by the API in development).
    email_verified = db.Column(db.Boolean, nullable=False, default=False)
    verification_token = db.Column(db.String(64), nullable=True, index=True)
    verification_sent_at = db.Column(db.DateTime, nullable=True)
    reset_token = db.Column(db.String(64), nullable=True, index=True)
    reset_token_expires_at = db.Column(db.DateTime, nullable=True)

    # Profile & preferences (PRD 3.12)
    avatar_url = db.Column(db.String(500), nullable=True)
    timezone = db.Column(db.String(64), nullable=False, default="Asia/Kolkata")
    language = db.Column(db.String(10), nullable=False, default="en")
    daily_target_minutes = db.Column(db.Integer, nullable=False, default=240)
    weekly_target_minutes = db.Column(db.Integer, nullable=False, default=1500)
    focus_duration_minutes = db.Column(db.Integer, nullable=False, default=25)
    short_break_minutes = db.Column(db.Integer, nullable=False, default=5)
    long_break_minutes = db.Column(db.Integer, nullable=False, default=15)
    availability_json = db.Column(db.Text, nullable=True)
    notification_prefs_json = db.Column(db.Text, nullable=True)
    accessibility_prefs_json = db.Column(db.Text, nullable=True)

    last_login_at = db.Column(db.DateTime, nullable=True)

    # --- relationships ----------------------------------------------------
    enrollments = db.relationship(
        "Enrollment",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    courses = db.relationship(
        "Course", secondary="enrollments", viewonly=True, back_populates="students"
    )
    topic_progress = db.relationship(
        "TopicProgress",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    study_sessions = db.relationship(
        "StudySession",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
        foreign_keys="StudySession.user_id",
    )
    tasks = db.relationship(
        "Task",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    focus_sessions = db.relationship(
        "FocusSession",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    goals = db.relationship(
        "Goal",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    user_achievements = db.relationship(
        "UserAchievement",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    notifications = db.relationship(
        "Notification",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    ai_conversations = db.relationship(
        "AiConversation",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    owned_resources = db.relationship(
        "Resource",
        back_populates="owner",
        cascade="all, delete-orphan",
        passive_deletes=True,
        foreign_keys="Resource.owner_id",
    )
    resource_bookmarks = db.relationship(
        "ResourceBookmark",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    # --- helpers ----------------------------------------------------------
    @property
    def is_admin(self):
        return self.role == "admin"

    @property
    def is_student(self):
        return self.role == "student"

    @property
    def is_active_account(self):
        return self.status == "active"

    def __repr__(self):
        return f"<User {self.id} {self.email} {self.role}>"


class TokenBlocklist(CreatedAtMixin, db.Model):
    """Revoked JWTs (logout). Durable so a restart cannot resurrect a token."""

    __tablename__ = "token_blocklist"

    id = db.Column(db.Integer, primary_key=True)
    jti = db.Column(db.String(36), nullable=False, unique=True, index=True)
    token_type = db.Column(db.String(16), nullable=False, default="access")
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    expires_at = db.Column(db.DateTime, nullable=True)

    @staticmethod
    def purge_expired():
        TokenBlocklist.query.filter(
            TokenBlocklist.expires_at.isnot(None),
            TokenBlocklist.expires_at < utcnow(),
        ).delete(synchronize_session=False)

    def __repr__(self):
        return f"<TokenBlocklist {self.jti}>"

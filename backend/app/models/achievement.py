"""Achievement definitions and earned awards (PRD 3.7).

`uq_user_achievement` is the anti-duplicate guard: repeated evaluation requests
can never award the same achievement twice.
"""

from app.extensions import db
from app.models.mixins import utcnow


class Achievement(db.Model):
    __tablename__ = "achievements"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(60), nullable=False, unique=True, index=True)
    title = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text, nullable=True)
    icon = db.Column(db.String(60), nullable=True)
    criteria_json = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    user_achievements = db.relationship(
        "UserAchievement",
        back_populates="achievement",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self):
        return f"<Achievement {self.code}>"


class UserAchievement(db.Model):
    __tablename__ = "user_achievements"
    __table_args__ = (
        db.UniqueConstraint(
            "user_id", "achievement_id", name="uq_user_achievement"
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    achievement_id = db.Column(
        db.Integer, db.ForeignKey("achievements.id", ondelete="CASCADE"), nullable=False
    )
    earned_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    user = db.relationship("User", back_populates="user_achievements")
    achievement = db.relationship("Achievement", back_populates="user_achievements")

    def __repr__(self):
        return f"<UserAchievement user={self.user_id} achievement={self.achievement_id}>"

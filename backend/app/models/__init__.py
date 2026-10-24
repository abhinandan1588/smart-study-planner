"""Model package.

Every model class is imported here so Flask-Migrate autogenerate sees the full
metadata and so `from app.models import X` works everywhere.
"""

from app.models.achievement import Achievement, UserAchievement
from app.models.ai import (
    AI_MESSAGE_ROLES,
    AiConversation,
    AiMessage,
    DocumentChunk,
)
from app.models.announcement import (
    ANNOUNCEMENT_AUDIENCES,
    ANNOUNCEMENT_STATUSES,
    Announcement,
)
from app.models.audit_log import AuditLog, PlatformSetting
from app.models.course import COURSE_CATEGORIES, COURSE_STATUSES, Course
from app.models.enrollment import (
    DIFFICULTY_LEVELS,
    ENROLLMENT_STATUSES,
    PRIORITIES,
    Enrollment,
)
from app.models.focus_session import FOCUS_MODES, FOCUS_STATUSES, FocusSession
from app.models.goal import (
    GOAL_CATEGORIES,
    GOAL_STATUSES,
    GOAL_UNITS,
    Goal,
)
from app.models.mixins import CreatedAtMixin, TimestampMixin, utcnow, utctoday
from app.models.notification import NOTIFICATION_TYPES, Notification
from app.models.progress import PROGRESS_STATUSES, TopicProgress
from app.models.resource import (
    ACCESS_LEVELS,
    RESOURCE_STATUSES,
    RESOURCE_TYPES,
    RESOURCE_VISIBILITIES,
    Resource,
    ResourceBookmark,
    ResourcePermission,
)
from app.models.study_session import (
    SESSION_STATUSES,
    SESSION_TYPES,
    StudySession,
)
from app.models.subject import SUBJECT_STATUSES, CourseSubject, Subject
from app.models.syllabus import (
    DIFFICULTIES,
    IMPORTANCES,
    SYLLABUS_VERSION_STATUSES,
    UNIT_TYPES,
    SyllabusUnit,
    SyllabusVersion,
    Topic,
)
from app.models.task import TASK_PRIORITIES, TASK_STATUSES, Task
from app.models.user import ROLES, USER_STATUSES, TokenBlocklist, User

__all__ = [
    "Achievement",
    "AiConversation",
    "AiMessage",
    "Announcement",
    "AuditLog",
    "Course",
    "CourseSubject",
    "CreatedAtMixin",
    "DocumentChunk",
    "Enrollment",
    "FocusSession",
    "Goal",
    "Notification",
    "PlatformSetting",
    "Resource",
    "ResourceBookmark",
    "ResourcePermission",
    "StudySession",
    "Subject",
    "SyllabusUnit",
    "SyllabusVersion",
    "Task",
    "TimestampMixin",
    "TokenBlocklist",
    "Topic",
    "TopicProgress",
    "User",
    "UserAchievement",
    # enum-like value tuples
    "ACCESS_LEVELS",
    "AI_MESSAGE_ROLES",
    "ANNOUNCEMENT_AUDIENCES",
    "ANNOUNCEMENT_STATUSES",
    "COURSE_CATEGORIES",
    "COURSE_STATUSES",
    "DIFFICULTIES",
    "DIFFICULTY_LEVELS",
    "ENROLLMENT_STATUSES",
    "FOCUS_MODES",
    "FOCUS_STATUSES",
    "GOAL_CATEGORIES",
    "GOAL_STATUSES",
    "GOAL_UNITS",
    "IMPORTANCES",
    "NOTIFICATION_TYPES",
    "PRIORITIES",
    "PROGRESS_STATUSES",
    "RESOURCE_STATUSES",
    "RESOURCE_TYPES",
    "RESOURCE_VISIBILITIES",
    "ROLES",
    "SESSION_STATUSES",
    "SESSION_TYPES",
    "SUBJECT_STATUSES",
    "SYLLABUS_VERSION_STATUSES",
    "TASK_PRIORITIES",
    "TASK_STATUSES",
    "UNIT_TYPES",
    "USER_STATUSES",
    "utcnow",
    "utctoday",
]

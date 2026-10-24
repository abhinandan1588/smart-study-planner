"""Administrator blueprint (PRD 4).

Nine areas, one module each, all mounted under `/api/v1/admin` and all gated by
`@admin_required` so a student token or an anonymous request is rejected server
side (PRD 2.3).
"""

from flask import Blueprint

admin_bp = Blueprint("admin", __name__)

from app.admin import routes_announcements  # noqa: E402,F401
from app.admin import routes_audit  # noqa: E402,F401
from app.admin import routes_courses  # noqa: E402,F401
from app.admin import routes_dashboard  # noqa: E402,F401
from app.admin import routes_reports  # noqa: E402,F401
from app.admin import routes_resources  # noqa: E402,F401
from app.admin import routes_settings  # noqa: E402,F401
from app.admin import routes_students  # noqa: E402,F401
from app.admin import routes_subjects  # noqa: E402,F401
from app.admin import routes_syllabus  # noqa: E402,F401

"""Reports and analytics endpoints (PRD 4.9)."""

from datetime import timedelta

from flask import jsonify, request

from app.admin import admin_bp
from app.admin.helpers import audit, csv_response
from app.admin.reports_service import REPORT_TYPES, build
from app.common.decorators import admin_required
from app.common.validators import parse_date, parse_int, validate_enum
from app.extensions import db
from app.models import utcnow

DEFAULT_RANGE_DAYS = 30


def _range():
    today = utcnow().date()
    date_to = parse_date(request.args.get("to"), "to", required=False) or today
    date_from = parse_date(request.args.get("from"), "from", required=False) or (
        date_to - timedelta(days=DEFAULT_RANGE_DAYS - 1)
    )
    if date_from > date_to:
        date_from, date_to = date_to, date_from
    return date_from, date_to


@admin_bp.get("/reports")
@admin_required
def get_report():
    report_type = validate_enum(
        request.args.get("type"),
        REPORT_TYPES,
        "type",
        required=False,
        default="registrations",
    )
    date_from, date_to = _range()
    course_id = parse_int(
        request.args.get("course_id"), "course_id", minimum=1, required=False
    )
    report = build(report_type, date_from, date_to, course_id)
    report["available_types"] = list(REPORT_TYPES)
    return jsonify(report), 200


@admin_bp.get("/reports/summary")
@admin_required
def report_summary():
    """Totals for every report in one call, for the reports landing page."""
    date_from, date_to = _range()
    course_id = parse_int(
        request.args.get("course_id"), "course_id", minimum=1, required=False
    )
    summary = {}
    for report_type in REPORT_TYPES:
        report = build(report_type, date_from, date_to, course_id)
        summary[report_type] = report["totals"]
    return (
        jsonify(
            {
                "range": {
                    "from": date_from.isoformat(),
                    "to": date_to.isoformat(),
                    "days": (date_to - date_from).days + 1,
                },
                "filters": {"course_id": course_id},
                "summary": summary,
            }
        ),
        200,
    )


@admin_bp.get("/reports/export")
@admin_required
def export_report():
    """CSV export of any report (PRD 4.9)."""
    report_type = validate_enum(request.args.get("type"), REPORT_TYPES, "type")
    date_from, date_to = _range()
    course_id = parse_int(
        request.args.get("course_id"), "course_id", minimum=1, required=False
    )
    report = build(report_type, date_from, date_to, course_id)
    columns = report["columns"]

    audit(
        "report.exported",
        entity_type="report",
        detail={
            "type": report_type,
            "from": date_from.isoformat(),
            "to": date_to.isoformat(),
            "rows": len(report["series"]),
        },
    )
    db.session.commit()

    return csv_response(
        f"report-{report_type}-{date_from.isoformat()}-to-{date_to.isoformat()}.csv",
        columns,
        ([row.get(column) for column in columns] for row in report["series"]),
    )

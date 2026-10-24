"""Student analytics endpoints (PRD 3.8).

Every dataset listed in the PRD chart list is returned here as a real
aggregate query over the caller's own rows. Empty datasets return empty arrays
rather than placeholder values.
"""

from flask import jsonify, request

from app.analytics import analytics_bp
from app.analytics.insights import build_insights
from app.analytics.queries import (
    RANGE_DAYS,
    consistency_heatmap,
    course_completion,
    daily_study,
    focus_sessions_series,
    focus_totals,
    overdue_tasks,
    planned_vs_actual,
    resolve_range,
    session_status_breakdown,
    study_time_by_course,
    study_time_by_subject,
    subject_topic_breakdown,
    syllabus_completion_over_time,
    tasks_planned_vs_completed,
    topics_donut,
    upcoming_deadlines,
    weekly_monthly_summary,
)
from app.common.access import require_enrollment
from app.common.decorators import current_user, student_required
from app.common.progress import overall_completion
from app.common.streaks import streak_info
from app.common.validators import parse_int, validate_enum
from app.models import utcnow


@analytics_bp.get("/analytics")
@student_required
def analytics():
    user = current_user()
    range_key = validate_enum(
        request.args.get("range"),
        tuple(RANGE_DAYS.keys()),
        "range",
        required=False,
        default="30d",
    )
    course_id = parse_int(
        request.args.get("course_id"), "course_id", minimum=1, required=False
    )
    if course_id:
        require_enrollment(user.id, course_id)

    today = utcnow().date()
    from_date, to_date, days = resolve_range(range_key, today)
    totals, _ = overall_completion(user.id)

    data = {
        "range": {
            "key": range_key,
            "days": days,
            "from": from_date.isoformat(),
            "to": to_date.isoformat(),
        },
        "course_id": course_id,
        "daily_study": daily_study(user.id, from_date, to_date),
        "by_subject": study_time_by_subject(user.id, from_date, to_date, course_id),
        "by_course": study_time_by_course(user.id, from_date, to_date),
        "course_completion": course_completion(user.id),
        "syllabus_over_time": syllabus_completion_over_time(
            user.id, from_date, to_date
        ),
        "tasks_planned_vs_completed": tasks_planned_vs_completed(
            user.id, from_date, to_date
        ),
        "focus_sessions": focus_sessions_series(user.id, from_date, to_date),
        "focus_totals": focus_totals(user.id, from_date, to_date),
        "consistency_heatmap": consistency_heatmap(user.id, from_date, to_date),
        "streak": streak_info(user.id, today),
        "topics_donut": topics_donut(user.id, course_id),
        "planned_vs_actual": planned_vs_actual(user.id, from_date, to_date),
        "session_statuses": session_status_breakdown(user.id, from_date, to_date),
        "overdue_tasks": overdue_tasks(user.id, today),
        "upcoming_deadlines": upcoming_deadlines(user.id, today),
        "syllabus_totals": totals,
        "targets": {
            "daily_target_minutes": user.daily_target_minutes,
            "weekly_target_minutes": user.weekly_target_minutes,
        },
    }
    if course_id:
        data["subject_breakdown"] = subject_topic_breakdown(user.id, course_id)

    data["insights"] = build_insights(user, data, today)
    return jsonify(data), 200


@analytics_bp.get("/analytics/summary")
@student_required
def analytics_summary():
    """Weekly and monthly summary cards (PRD 3.8)."""
    user = current_user()
    period = validate_enum(
        request.args.get("period"),
        ("week", "month"),
        "period",
        required=False,
        default="week",
    )
    today = utcnow().date()
    summary = weekly_monthly_summary(user.id, today)
    totals, per_course = overall_completion(user.id)

    selected = summary["this_week"] if period == "week" else summary["this_month"]
    target = (
        (user.weekly_target_minutes or 0)
        if period == "week"
        else (user.daily_target_minutes or 0) * today.day
    )

    return (
        jsonify(
            {
                "period": period,
                "selected": {
                    **selected,
                    "target_minutes": target,
                    "percent": (
                        round(
                            min(100.0, selected["studied_minutes"] / target * 100), 2
                        )
                        if target
                        else 0.0
                    ),
                },
                "this_week": summary["this_week"],
                "last_week": summary["last_week"],
                "this_month": summary["this_month"],
                "streak": summary["streak"],
                "syllabus_totals": totals,
                "courses": len(per_course),
                "overdue_tasks": overdue_tasks(user.id, today),
            }
        ),
        200,
    )

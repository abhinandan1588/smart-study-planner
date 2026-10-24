"""Goals and achievements (PRD 3.7).

Goal progress is recomputed from stored activity on every read and write, so a
client can never set its own ``current_value``. Achievements are evaluated
server side and protected against duplicates by `uq_user_achievement`.
"""

from flask import jsonify, request

from app.common.achievements import achievement_catalogue, evaluate_achievements
from app.common.decorators import current_user, get_owned_or_404, student_required
from app.common.errors import ValidationError
from app.common.serializers import goal_detail
from app.common.validators import (
    clean_str,
    get_json_body,
    parse_date,
    parse_float,
    parse_int,
    require_fields,
    validate_enum,
)
from app.extensions import db
from app.models import (
    GOAL_CATEGORIES,
    GOAL_STATUSES,
    GOAL_UNITS,
    Goal,
    utcnow,
)
from app.planner import planner_bp
from app.planner.goals_service import (
    MANUAL_CATEGORIES,
    recompute_goal,
    recompute_goals,
)
from app.planner.link_service import resolve_links


@planner_bp.get("/goals")
@student_required
def list_goals():
    user = current_user()
    all_goals = recompute_goals(user.id)

    counts = {value: 0 for value in GOAL_STATUSES}
    for goal in all_goals:
        counts[goal.status] = counts.get(goal.status, 0) + 1

    goals = all_goals
    status = request.args.get("status")
    if status:
        validate_enum(status, GOAL_STATUSES, "status")
        goals = [goal for goal in goals if goal.status == status]
    category = request.args.get("category")
    if category:
        validate_enum(category, GOAL_CATEGORIES, "category")
        goals = [goal for goal in goals if goal.category == category]

    return (
        jsonify(
            {
                "items": [goal_detail(goal) for goal in goals],
                "total": len(goals),
                "counts": counts,
            }
        ),
        200,
    )


@planner_bp.get("/goals/<int:goal_id>")
@student_required
def get_goal(goal_id):
    goal = get_owned_or_404(Goal, goal_id)
    recompute_goal(goal)
    db.session.commit()
    return jsonify({"goal": goal_detail(goal)}), 200


@planner_bp.post("/goals")
@student_required
def create_goal():
    user = current_user()
    data = get_json_body()
    require_fields(data, ["title", "category", "target_value", "deadline"])

    category = validate_enum(data.get("category"), GOAL_CATEGORIES, "category")
    start_date = parse_date(
        data.get("start_date"), "start_date", required=False, default=utcnow().date()
    )
    deadline = parse_date(data.get("deadline"), "deadline")
    if deadline < start_date:
        raise ValidationError(
            "Invalid goal window.",
            fields={"deadline": "The deadline must not precede the start date."},
        )

    links = resolve_links(user, data)
    if category == "course_completion" and not links.get("course_id"):
        raise ValidationError(
            "A course is required for this goal type.",
            fields={"course_id": "Select one of your enrolled courses."},
        )

    goal = Goal(
        user_id=user.id,
        course_id=links.get("course_id"),
        title=clean_str(data.get("title"), "title", max_length=250, min_length=2),
        description=clean_str(
            data.get("description"), "description", max_length=2000, required=False
        ),
        category=category,
        target_value=parse_float(
            data.get("target_value"), "target_value", minimum=0.1, maximum=100000
        ),
        current_value=0.0,
        unit=validate_enum(
            data.get("unit"), GOAL_UNITS, "unit", required=False, default=None
        ),
        start_date=start_date,
        deadline=deadline,
        status="active",
    )
    db.session.add(goal)
    db.session.flush()
    recompute_goal(goal)
    db.session.commit()
    return jsonify({"goal": goal_detail(goal)}), 201


@planner_bp.patch("/goals/<int:goal_id>")
@student_required
def update_goal(goal_id):
    goal = get_owned_or_404(Goal, goal_id)
    data = get_json_body()

    if "title" in data:
        goal.title = clean_str(data.get("title"), "title", max_length=250, min_length=2)
    if "description" in data:
        goal.description = clean_str(
            data.get("description"), "description", max_length=2000, required=False
        )
    if "target_value" in data:
        goal.target_value = parse_float(
            data.get("target_value"), "target_value", minimum=0.1, maximum=100000
        )
    if "unit" in data:
        goal.unit = validate_enum(
            data.get("unit"), GOAL_UNITS, "unit", required=False, default=None
        )
    if "start_date" in data:
        goal.start_date = parse_date(data.get("start_date"), "start_date")
    if "deadline" in data:
        goal.deadline = parse_date(data.get("deadline"), "deadline")
    if goal.deadline < goal.start_date:
        raise ValidationError(
            "Invalid goal window.",
            fields={"deadline": "The deadline must not precede the start date."},
        )
    if "status" in data:
        # Only pause / resume are client controlled; completion is earned.
        requested = validate_enum(data.get("status"), ("active", "paused"), "status")
        goal.status = requested
        goal.completed_at = None

    recompute_goal(goal)
    db.session.commit()
    return jsonify({"goal": goal_detail(goal)}), 200


@planner_bp.post("/goals/<int:goal_id>/progress")
@student_required
def report_goal_progress(goal_id):
    """Report progress for the one category with no stored activity source.

    Every other category is recomputed from stored rows and rejects manual
    input, so this cannot be used to fake syllabus or study-time progress.
    """
    goal = get_owned_or_404(Goal, goal_id)
    data = get_json_body()

    if goal.category not in MANUAL_CATEGORIES:
        raise ValidationError(
            "This goal's progress is computed from your stored activity.",
            fields={
                "category": (
                    "Manual progress is only accepted for: "
                    + ", ".join(MANUAL_CATEGORIES)
                    + "."
                )
            },
        )

    increment = parse_int(
        data.get("increment"), "increment", minimum=1, maximum=1000
    )
    goal.current_value = min(
        float(goal.target_value), float(goal.current_value or 0) + increment
    )
    recompute_goal(goal)
    db.session.commit()
    return jsonify({"goal": goal_detail(goal)}), 200


@planner_bp.delete("/goals/<int:goal_id>")
@student_required
def delete_goal(goal_id):
    goal = get_owned_or_404(Goal, goal_id)
    db.session.delete(goal)
    db.session.commit()
    return "", 204


@planner_bp.get("/achievements")
@student_required
def list_achievements():
    user = current_user()
    # Evaluate first so a page load can only ever *add* an award, never dupe.
    newly_earned = evaluate_achievements(user.id)
    payload = achievement_catalogue(user.id)
    payload["newly_earned"] = newly_earned
    return jsonify(payload), 200


@planner_bp.post("/achievements/evaluate")
@student_required
def evaluate_own_achievements():
    """Idempotent: replaying this request never awards a duplicate."""
    user = current_user()
    newly_earned = evaluate_achievements(user.id)
    return (
        jsonify(
            {
                "newly_earned": newly_earned,
                "earned_total": len(achievement_catalogue(user.id)["earned"]),
            }
        ),
        200,
    )

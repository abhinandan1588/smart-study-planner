"""Task CRUD with filtering and sorting (PRD 3.5).

Every query is filtered by `user_id` and every single-row lookup goes through
`get_owned_or_404`, so a task belonging to another student is reported as 404.
"""

from datetime import timedelta

from flask import jsonify, request

from app.common.achievements import evaluate_achievements
from app.common.decorators import current_user, get_owned_or_404, student_required
from app.common.pagination import paginate
from app.common.serializers import task_detail
from app.common.validators import (
    clean_str,
    get_json_body,
    parse_date,
    parse_datetime,
    parse_int,
    parse_time,
    require_fields,
    validate_enum,
)
from app.extensions import db
from app.models import TASK_PRIORITIES, TASK_STATUSES, Task, utcnow
from app.planner import planner_bp
from app.planner.link_service import resolve_links
from app.planner.recurrence import parse_rule

SORT_OPTIONS = {
    "due_date": (Task.due_date.asc(), Task.due_time.asc()),
    "-due_date": (Task.due_date.desc(), Task.due_time.desc()),
    "priority": (
        db.case(
            (Task.priority == "high", 0),
            (Task.priority == "medium", 1),
            else_=2,
        ).asc(),
    ),
    "-priority": (
        db.case(
            (Task.priority == "high", 0),
            (Task.priority == "medium", 1),
            else_=2,
        ).desc(),
    ),
    "created": (Task.created_at.asc(),),
    "-created": (Task.created_at.desc(),),
    "title": (Task.title.asc(),),
    "status": (Task.status.asc(),),
}


@planner_bp.get("/tasks")
@student_required
def list_tasks():
    user = current_user()
    query = Task.query.filter(Task.user_id == user.id)

    status = request.args.get("status")
    if status:
        statuses = [
            validate_enum(value.strip(), TASK_STATUSES, "status")
            for value in status.split(",")
            if value.strip()
        ]
        query = query.filter(Task.status.in_(statuses))

    priority = request.args.get("priority")
    if priority:
        validate_enum(priority, TASK_PRIORITIES, "priority")
        query = query.filter(Task.priority == priority)

    due_from = parse_date(request.args.get("due_from"), "due_from", required=False)
    if due_from:
        query = query.filter(Task.due_date >= due_from)
    due_to = parse_date(request.args.get("due_to"), "due_to", required=False)
    if due_to:
        query = query.filter(Task.due_date <= due_to)

    course_id = parse_int(
        request.args.get("course_id"), "course_id", minimum=1, required=False
    )
    if course_id:
        query = query.filter(Task.course_id == course_id)
    topic_id = parse_int(
        request.args.get("topic_id"), "topic_id", minimum=1, required=False
    )
    if topic_id:
        query = query.filter(Task.topic_id == topic_id)

    if (request.args.get("overdue") or "").lower() in ("1", "true", "yes"):
        query = query.filter(
            Task.status.in_(("pending", "in_progress")),
            Task.due_date.isnot(None),
            Task.due_date < utcnow().date(),
        )

    search = (request.args.get("q") or "").strip()
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            db.or_(Task.title.ilike(pattern), Task.description.ilike(pattern))
        )

    sort = (request.args.get("sort") or "due_date").strip()
    order = SORT_OPTIONS.get(sort, SORT_OPTIONS["due_date"])
    query = query.order_by(*order, Task.id.asc())

    page = paginate(query, serializer=task_detail)
    today = utcnow().date()
    base = Task.query.filter(Task.user_id == user.id)
    page["counts"] = {
        "pending": base.filter(Task.status == "pending").count(),
        "in_progress": base.filter(Task.status == "in_progress").count(),
        "completed": base.filter(Task.status == "completed").count(),
        "cancelled": base.filter(Task.status == "cancelled").count(),
        "overdue": base.filter(
            Task.status.in_(("pending", "in_progress")),
            Task.due_date.isnot(None),
            Task.due_date < today,
        ).count(),
        "due_today": base.filter(
            Task.status.in_(("pending", "in_progress")), Task.due_date == today
        ).count(),
    }
    return jsonify(page), 200


@planner_bp.get("/tasks/<int:task_id>")
@student_required
def get_task(task_id):
    task = get_owned_or_404(Task, task_id)
    return jsonify({"task": task_detail(task)}), 200


@planner_bp.post("/tasks")
@student_required
def create_task():
    user = current_user()
    data = get_json_body()
    require_fields(data, ["title"])

    links = resolve_links(user, data)
    rule_kind, _ = parse_rule(data.get("recurrence_rule"))

    task = Task(
        user_id=user.id,
        title=clean_str(data.get("title"), "title", max_length=250, min_length=2),
        description=clean_str(
            data.get("description"), "description", max_length=5000, required=False
        ),
        priority=validate_enum(
            data.get("priority"),
            TASK_PRIORITIES,
            "priority",
            required=False,
            default="medium",
        ),
        status=validate_enum(
            data.get("status"), TASK_STATUSES, "status", required=False, default="pending"
        ),
        due_date=parse_date(data.get("due_date"), "due_date", required=False),
        due_time=parse_time(data.get("due_time"), "due_time", required=False),
        estimated_minutes=parse_int(
            data.get("estimated_minutes"),
            "estimated_minutes",
            minimum=1,
            maximum=1440,
            required=False,
        ),
        reminder_at=parse_datetime(
            data.get("reminder_at"), "reminder_at", required=False
        ),
        recurrence_rule=(
            None if rule_kind == "none" else str(data.get("recurrence_rule")).strip()
        ),
        **links,
    )
    if task.status == "completed":
        task.completed_at = utcnow()
    db.session.add(task)
    db.session.commit()

    earned = evaluate_achievements(user.id) if task.status == "completed" else []
    return jsonify({"task": task_detail(task), "achievements_earned": earned}), 201


@planner_bp.patch("/tasks/<int:task_id>")
@student_required
def update_task(task_id):
    user = current_user()
    task = get_owned_or_404(Task, task_id)
    data = get_json_body()

    if "title" in data:
        task.title = clean_str(data.get("title"), "title", max_length=250, min_length=2)
    if "description" in data:
        task.description = clean_str(
            data.get("description"), "description", max_length=5000, required=False
        )
    if "priority" in data:
        task.priority = validate_enum(
            data.get("priority"), TASK_PRIORITIES, "priority"
        )
    if "due_date" in data:
        task.due_date = parse_date(data.get("due_date"), "due_date", required=False)
    if "due_time" in data:
        task.due_time = parse_time(data.get("due_time"), "due_time", required=False)
    if "estimated_minutes" in data:
        task.estimated_minutes = parse_int(
            data.get("estimated_minutes"),
            "estimated_minutes",
            minimum=1,
            maximum=1440,
            required=False,
        )
    if "reminder_at" in data:
        task.reminder_at = parse_datetime(
            data.get("reminder_at"), "reminder_at", required=False
        )
    if "recurrence_rule" in data:
        rule_kind, _ = parse_rule(data.get("recurrence_rule"))
        task.recurrence_rule = (
            None if rule_kind == "none" else str(data.get("recurrence_rule")).strip()
        )
    if any(key in data for key in ("course_id", "subject_id", "topic_id")):
        links = resolve_links(
            user,
            data,
            current={
                "course_id": task.course_id,
                "subject_id": task.subject_id,
                "topic_id": task.topic_id,
            },
        )
        task.course_id = links["course_id"]
        task.subject_id = links["subject_id"]
        task.topic_id = links["topic_id"]

    recurring_child = None
    if "status" in data:
        new_status = validate_enum(data.get("status"), TASK_STATUSES, "status")
        was_completed = task.status == "completed"
        task.status = new_status
        if new_status == "completed":
            task.completed_at = task.completed_at or utcnow()
            if not was_completed and task.recurrence_rule:
                recurring_child = _spawn_recurrence(task)
        else:
            task.completed_at = None

    db.session.commit()
    earned = evaluate_achievements(user.id)

    payload = {"task": task_detail(task), "achievements_earned": earned}
    if recurring_child is not None:
        payload["next_occurrence"] = task_detail(recurring_child)
    return jsonify(payload), 200


@planner_bp.delete("/tasks/<int:task_id>")
@student_required
def delete_task(task_id):
    task = get_owned_or_404(Task, task_id)
    db.session.delete(task)
    db.session.commit()
    return "", 204


def _spawn_recurrence(task):
    """Create the next occurrence of a recurring task once it is completed."""
    kind, weekdays = parse_rule(task.recurrence_rule)
    if kind == "none" or task.due_date is None:
        return None

    if kind == "daily":
        next_due = task.due_date + timedelta(days=1)
    else:
        targets = weekdays or [task.due_date.weekday()]
        next_due = task.due_date + timedelta(days=1)
        for _ in range(14):
            if next_due.weekday() in targets:
                break
            next_due += timedelta(days=1)

    existing = Task.query.filter_by(
        user_id=task.user_id,
        title=task.title,
        due_date=next_due,
        recurrence_rule=task.recurrence_rule,
    ).first()
    if existing is not None:
        return existing

    child = Task(
        user_id=task.user_id,
        course_id=task.course_id,
        subject_id=task.subject_id,
        topic_id=task.topic_id,
        title=task.title,
        description=task.description,
        priority=task.priority,
        due_date=next_due,
        due_time=task.due_time,
        estimated_minutes=task.estimated_minutes,
        status="pending",
        recurrence_rule=task.recurrence_rule,
    )
    db.session.add(child)
    db.session.flush()
    return child

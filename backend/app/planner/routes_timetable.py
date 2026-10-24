"""Timetable and study-session endpoints with server-side overlap detection.

Overlap rules (PRD 3.5 / plan 5.5):

* create / update / reschedule reject an overlapping slot with
  ``409 SCHEDULE_CONFLICT`` listing the conflicting sessions;
* ``?force=true`` stores it anyway and echoes the conflict back, which is what
  the UI confirm dialog uses;
* the generator cannot create overlaps because it only consumes free windows;
* saving an edited generated draft re-checks every row and is all-or-nothing.
"""

from datetime import datetime, time, timedelta

from flask import jsonify, request

from app.common.decorators import current_user, get_owned_or_404, student_required
from app.common.errors import ConflictError, ValidationError
from app.common.notifications import create_notification
from app.common.serializers import study_session_detail
from app.common.validators import (
    clean_str,
    get_json_body,
    parse_bool,
    parse_date,
    parse_datetime,
    parse_int,
    require_fields,
    validate_enum,
)
from app.extensions import db
from app.models import (
    SESSION_STATUSES,
    SESSION_TYPES,
    StudySession,
    utcnow,
)
from app.planner import planner_bp
from app.planner.conflicts import (
    conflict_payload,
    conflicting_sessions,
    find_overlaps,
)
from app.planner.link_service import resolve_links
from app.planner.recurrence import occurrences, parse_rule
from app.planner.scheduler import generate_plan

MAX_SESSION_MINUTES = 12 * 60
MAX_RANGE_DAYS = 120


# --- helpers ------------------------------------------------------------


def _window_from_args(default_days=7):
    """Resolve ``?from=&to=&view=&date=`` into an inclusive date range."""
    view = (request.args.get("view") or "").strip().lower()
    anchor = parse_date(request.args.get("date"), "date", required=False) or (
        utcnow().date()
    )

    if view == "day":
        return anchor, anchor, "day"
    if view == "week":
        start = anchor - timedelta(days=anchor.weekday())
        return start, start + timedelta(days=6), "week"
    if view == "month":
        start = anchor.replace(day=1)
        next_month = (start + timedelta(days=31)).replace(day=1)
        return start, next_month - timedelta(days=1), "month"

    date_from = parse_date(request.args.get("from"), "from", required=False)
    date_to = parse_date(request.args.get("to"), "to", required=False)
    if date_from is None and date_to is None:
        start = anchor - timedelta(days=anchor.weekday())
        return start, start + timedelta(days=6), "week"
    date_from = date_from or anchor
    date_to = date_to or date_from + timedelta(days=default_days)
    if date_to < date_from:
        raise ValidationError(
            "Invalid date range.", fields={"to": "'to' must not precede 'from'."}
        )
    if (date_to - date_from).days > MAX_RANGE_DAYS:
        raise ValidationError(
            "The requested range is too wide.",
            fields={"to": f"Request at most {MAX_RANGE_DAYS} days."},
        )
    return date_from, date_to, "range"


def _validate_window(start_at, end_at):
    if end_at <= start_at:
        raise ValidationError(
            "Invalid session window.",
            fields={"end_at": "The end time must be after the start time."},
        )
    minutes = int((end_at - start_at).total_seconds() // 60)
    if minutes < 5:
        raise ValidationError(
            "Invalid session window.",
            fields={"end_at": "A session must last at least 5 minutes."},
        )
    if minutes > MAX_SESSION_MINUTES:
        raise ValidationError(
            "Invalid session window.",
            fields={"end_at": "A single session cannot exceed 12 hours."},
        )
    return minutes


def _conflict_error(sessions):
    return ConflictError(
        "This slot overlaps an existing session.",
        extra={
            "code": "SCHEDULE_CONFLICT",
            "conflicts": conflict_payload(sessions),
        },
    )


def _forced():
    return bool(parse_bool(request.args.get("force"), "force", default=False))


# --- list / views -------------------------------------------------------


@planner_bp.get("/study-sessions")
@student_required
def list_study_sessions():
    user = current_user()
    date_from, date_to, view = _window_from_args()
    start = datetime.combine(date_from, time.min)
    end = datetime.combine(date_to, time.max)

    query = StudySession.query.filter(
        StudySession.user_id == user.id,
        StudySession.start_at <= end,
        StudySession.end_at >= start,
    )
    status = request.args.get("status")
    if status:
        validate_enum(status, SESSION_STATUSES, "status")
        query = query.filter(StudySession.status == status)
    session_type = request.args.get("session_type")
    if session_type:
        validate_enum(session_type, SESSION_TYPES, "session_type")
        query = query.filter(StudySession.session_type == session_type)
    course_id = parse_int(
        request.args.get("course_id"), "course_id", minimum=1, required=False
    )
    if course_id:
        query = query.filter(StudySession.course_id == course_id)

    sessions = query.order_by(StudySession.start_at.asc(), StudySession.id.asc()).all()

    by_day = {}
    for session in sessions:
        by_day.setdefault(session.start_at.date().isoformat(), []).append(
            study_session_detail(session)
        )

    totals = {
        "planned_minutes": sum(s.planned_minutes for s in sessions if s.session_type != "break"),
        "actual_minutes": sum(s.actual_minutes for s in sessions),
        "sessions": len([s for s in sessions if s.session_type != "break"]),
        "breaks": len([s for s in sessions if s.session_type == "break"]),
        "completed": len([s for s in sessions if s.status == "completed"]),
        "skipped": len([s for s in sessions if s.status == "skipped"]),
    }

    return (
        jsonify(
            {
                "view": view,
                "from": date_from.isoformat(),
                "to": date_to.isoformat(),
                "items": [study_session_detail(session) for session in sessions],
                "days": [
                    {
                        "date": (date_from + timedelta(days=offset)).isoformat(),
                        "sessions": by_day.get(
                            (date_from + timedelta(days=offset)).isoformat(), []
                        ),
                    }
                    for offset in range((date_to - date_from).days + 1)
                ],
                "conflicts": find_overlaps(sessions),
                "totals": totals,
            }
        ),
        200,
    )


@planner_bp.get("/timetable")
@student_required
def timetable_view():
    """Alias of the session list, defaulting to the current week."""
    return list_study_sessions()


@planner_bp.get("/study-sessions/<int:session_id>")
@student_required
def get_study_session(session_id):
    session = get_owned_or_404(StudySession, session_id)
    return jsonify({"session": study_session_detail(session)}), 200


# --- create / update / delete -------------------------------------------


@planner_bp.post("/study-sessions")
@student_required
def create_study_session():
    user = current_user()
    data = get_json_body()
    require_fields(data, ["title", "start_at", "end_at"])

    title = clean_str(data.get("title"), "title", max_length=250, min_length=2)
    start_at = parse_datetime(data.get("start_at"), "start_at")
    end_at = parse_datetime(data.get("end_at"), "end_at")
    minutes = _validate_window(start_at, end_at)

    session_type = validate_enum(
        data.get("session_type"),
        SESSION_TYPES,
        "session_type",
        required=False,
        default="study",
    )
    links = resolve_links(user, data)
    rule_kind, _ = parse_rule(data.get("recurrence_rule"))

    conflicts = conflicting_sessions(user.id, start_at, end_at)
    if conflicts and not _forced():
        raise _conflict_error(conflicts)

    session = StudySession(
        user_id=user.id,
        title=title,
        session_type=session_type,
        start_at=start_at,
        end_at=end_at,
        planned_minutes=minutes,
        status="planned",
        actual_minutes=0,
        recurrence_rule=(
            None if rule_kind == "none" else str(data.get("recurrence_rule")).strip()
        ),
        notes=clean_str(data.get("notes"), "notes", max_length=2000, required=False),
        **links,
    )
    db.session.add(session)
    db.session.flush()

    children = []
    skipped_occurrences = []
    if rule_kind != "none":
        for occ_start, occ_end in occurrences(
            start_at, end_at, data.get("recurrence_rule")
        ):
            if conflicting_sessions(user.id, occ_start, occ_end):
                skipped_occurrences.append(occ_start.isoformat())
                continue
            child = StudySession(
                user_id=user.id,
                title=title,
                session_type=session_type,
                start_at=occ_start,
                end_at=occ_end,
                planned_minutes=minutes,
                status="planned",
                actual_minutes=0,
                recurrence_rule=str(data.get("recurrence_rule")).strip(),
                recurrence_parent_id=session.id,
                notes=session.notes,
                **links,
            )
            db.session.add(child)
            db.session.flush()
            children.append(child)

    db.session.commit()

    payload = {
        "session": study_session_detail(session),
        "recurrence_children": [study_session_detail(child) for child in children],
        "skipped_occurrences": skipped_occurrences,
    }
    if conflicts:
        payload["forced_over_conflicts"] = conflict_payload(conflicts)
    return jsonify(payload), 201


@planner_bp.patch("/study-sessions/<int:session_id>")
@student_required
def update_study_session(session_id):
    user = current_user()
    session = get_owned_or_404(StudySession, session_id)
    data = get_json_body()

    start_at = (
        parse_datetime(data.get("start_at"), "start_at")
        if "start_at" in data
        else session.start_at
    )
    end_at = (
        parse_datetime(data.get("end_at"), "end_at")
        if "end_at" in data
        else session.end_at
    )
    if "start_at" in data or "end_at" in data:
        minutes = _validate_window(start_at, end_at)
        conflicts = conflicting_sessions(
            user.id, start_at, end_at, exclude_id=session.id
        )
        if conflicts and not _forced():
            raise _conflict_error(conflicts)
        session.start_at = start_at
        session.end_at = end_at
        session.planned_minutes = minutes

    if "title" in data:
        session.title = clean_str(
            data.get("title"), "title", max_length=250, min_length=2
        )
    if "session_type" in data:
        session.session_type = validate_enum(
            data.get("session_type"), SESSION_TYPES, "session_type"
        )
    if "notes" in data:
        session.notes = clean_str(
            data.get("notes"), "notes", max_length=2000, required=False
        )
    if "status" in data:
        session.status = validate_enum(data.get("status"), SESSION_STATUSES, "status")
        if session.status == "completed" and not data.get("actual_minutes"):
            session.actual_minutes = session.planned_minutes
        if session.status == "skipped":
            session.actual_minutes = 0
    if "actual_minutes" in data:
        session.actual_minutes = parse_int(
            data.get("actual_minutes"),
            "actual_minutes",
            minimum=0,
            maximum=MAX_SESSION_MINUTES,
        )

    if any(key in data for key in ("course_id", "subject_id", "topic_id")):
        links = resolve_links(
            user,
            data,
            current={
                "course_id": session.course_id,
                "subject_id": session.subject_id,
                "topic_id": session.topic_id,
            },
        )
        session.course_id = links["course_id"]
        session.subject_id = links["subject_id"]
        session.topic_id = links["topic_id"]

    db.session.commit()
    return jsonify({"session": study_session_detail(session)}), 200


@planner_bp.post("/study-sessions/<int:session_id>/attendance")
@student_required
def mark_attendance(session_id):
    """Mark a session attended (completed / partially completed) or missed."""
    session = get_owned_or_404(StudySession, session_id)
    data = get_json_body()
    attended = parse_bool(data.get("attended"), "attended", required=True)

    if attended:
        actual = parse_int(
            data.get("actual_minutes"),
            "actual_minutes",
            minimum=0,
            maximum=MAX_SESSION_MINUTES,
            required=False,
            default=session.planned_minutes,
        )
        session.actual_minutes = min(actual, MAX_SESSION_MINUTES)
        session.status = (
            "completed"
            if session.actual_minutes >= session.planned_minutes
            else "partially_completed"
        )
    else:
        session.status = "skipped"
        session.actual_minutes = 0

    db.session.commit()
    return jsonify({"session": study_session_detail(session)}), 200


@planner_bp.delete("/study-sessions/<int:session_id>")
@student_required
def delete_study_session(session_id):
    user = current_user()
    session = get_owned_or_404(StudySession, session_id)
    scope = validate_enum(
        request.args.get("scope"),
        ("single", "series"),
        "scope",
        required=False,
        default="single",
    )

    if scope == "series":
        root_id = session.recurrence_parent_id or session.id
        siblings = StudySession.query.filter(
            StudySession.user_id == user.id,
            db.or_(
                StudySession.id == root_id,
                StudySession.recurrence_parent_id == root_id,
            ),
        ).all()
        for sibling in siblings:
            db.session.delete(sibling)
    else:
        db.session.delete(session)

    db.session.commit()
    return "", 204


@planner_bp.post("/study-sessions/<int:session_id>/reschedule")
@student_required
def reschedule_study_session(session_id):
    """Move a missed session without creating duplicates.

    Idempotent: a second call returns the already-created replacement instead
    of adding another one.
    """
    user = current_user()
    session = get_owned_or_404(StudySession, session_id)
    data = get_json_body()
    require_fields(data, ["start_at", "end_at"])

    existing_child = StudySession.query.filter_by(
        user_id=user.id, rescheduled_from_id=session.id
    ).first()
    if existing_child is not None:
        return (
            jsonify(
                {
                    "session": study_session_detail(existing_child),
                    "original": study_session_detail(session),
                    "already_rescheduled": True,
                }
            ),
            200,
        )

    start_at = parse_datetime(data.get("start_at"), "start_at")
    end_at = parse_datetime(data.get("end_at"), "end_at")
    minutes = _validate_window(start_at, end_at)

    conflicts = conflicting_sessions(user.id, start_at, end_at, exclude_id=session.id)
    if conflicts and not _forced():
        raise _conflict_error(conflicts)

    replacement = StudySession(
        user_id=user.id,
        course_id=session.course_id,
        subject_id=session.subject_id,
        topic_id=session.topic_id,
        title=session.title,
        session_type=session.session_type,
        start_at=start_at,
        end_at=end_at,
        planned_minutes=minutes,
        status="planned",
        actual_minutes=0,
        notes=session.notes,
        rescheduled_from_id=session.id,
    )
    session.status = "skipped"
    db.session.add(replacement)
    db.session.flush()

    create_notification(
        user.id,
        "plan_change",
        f"Session rescheduled: {session.title}",
        body=f"Moved to {start_at.strftime('%d %b %H:%M')}.",
        link="/app/planner",
        dedupe_key=f"plan_change:reschedule:{session.id}",
    )
    db.session.commit()

    return (
        jsonify(
            {
                "session": study_session_detail(replacement),
                "original": study_session_detail(session),
                "already_rescheduled": False,
            }
        ),
        201,
    )


# --- smart generation ---------------------------------------------------


@planner_bp.post("/timetable/generate")
@student_required
def generate_timetable():
    """Deterministic draft plan. Nothing is persisted by this endpoint."""
    user = current_user()
    data = get_json_body(required=False)

    today = utcnow().date()
    from_date = parse_date(data.get("from"), "from", required=False, default=today)
    to_date = parse_date(
        data.get("to"), "to", required=False, default=from_date + timedelta(days=6)
    )
    if to_date < from_date:
        raise ValidationError(
            "Invalid date range.", fields={"to": "'to' must not precede 'from'."}
        )

    options = {
        "course_ids": _int_list(data.get("course_ids"), "course_ids"),
        "daily_availability": data.get("daily_availability"),
        "include_breaks": bool(data.get("include_breaks", True)),
        "include_revision": bool(data.get("include_revision", True)),
        "include_tasks": bool(data.get("include_tasks", True)),
        "daily_target_minutes": parse_int(
            data.get("daily_target_minutes"),
            "daily_target_minutes",
            minimum=15,
            maximum=1440,
            required=False,
        ),
    }

    sessions, unscheduled, batch_id = generate_plan(
        user, from_date, to_date, options
    )
    planned_minutes = sum(
        item["planned_minutes"] for item in sessions if item["session_type"] != "break"
    )
    return (
        jsonify(
            {
                "batch_id": batch_id,
                "from": from_date.isoformat(),
                "to": to_date.isoformat(),
                "sessions": sessions,
                "unscheduled": unscheduled,
                "summary": {
                    "session_count": len(
                        [s for s in sessions if s["session_type"] != "break"]
                    ),
                    "break_count": len(
                        [s for s in sessions if s["session_type"] == "break"]
                    ),
                    "planned_minutes": planned_minutes,
                    "unscheduled_count": len(unscheduled),
                },
                "persisted": False,
            }
        ),
        200,
    )


@planner_bp.post("/timetable/generate/save")
@student_required
def save_generated_timetable():
    """Persist a (possibly edited) draft. All-or-nothing in one transaction."""
    user = current_user()
    data = get_json_body()
    require_fields(data, ["sessions"])

    batch_id = clean_str(
        data.get("batch_id"), "batch_id", max_length=36, required=False
    )
    rows = data.get("sessions")
    if not isinstance(rows, list) or not rows:
        raise ValidationError(
            "No sessions to save.", fields={"sessions": "Provide a non-empty list."}
        )
    if len(rows) > 400:
        raise ValidationError(
            "Too many sessions in one batch.",
            fields={"sessions": "Save at most 400 sessions at a time."},
        )

    prepared = []
    conflicts = []
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ValidationError(
                "Invalid session.", fields={f"sessions[{index}]": "Expected an object."}
            )
        title = clean_str(row.get("title"), f"sessions[{index}].title", max_length=250)
        start_at = parse_datetime(row.get("start_at"), f"sessions[{index}].start_at")
        end_at = parse_datetime(row.get("end_at"), f"sessions[{index}].end_at")
        minutes = _validate_window(start_at, end_at)
        session_type = validate_enum(
            row.get("session_type"),
            SESSION_TYPES,
            f"sessions[{index}].session_type",
            required=False,
            default="study",
        )
        links = resolve_links(user, row)

        stored_conflicts = conflicting_sessions(user.id, start_at, end_at)
        internal = [
            other
            for other in prepared
            if other["start_at"] < end_at and start_at < other["end_at"]
        ]
        if stored_conflicts or internal:
            conflicts.append(
                {
                    "index": index,
                    "title": title,
                    "start_at": start_at.isoformat(),
                    "end_at": end_at.isoformat(),
                    "existing": conflict_payload(stored_conflicts),
                    "within_batch": [item["index"] for item in internal],
                }
            )
            continue

        prepared.append(
            {
                "index": index,
                "title": title,
                "start_at": start_at,
                "end_at": end_at,
                "planned_minutes": minutes,
                "session_type": session_type,
                "links": links,
                "notes": clean_str(
                    row.get("notes"), f"sessions[{index}].notes", max_length=2000,
                    required=False,
                ),
            }
        )

    if conflicts:
        raise ConflictError(
            "The plan conflicts with sessions already in your timetable.",
            extra={"code": "SCHEDULE_CONFLICT", "conflicts": conflicts},
        )

    created = []
    for item in prepared:
        session = StudySession(
            user_id=user.id,
            title=item["title"],
            session_type=item["session_type"],
            start_at=item["start_at"],
            end_at=item["end_at"],
            planned_minutes=item["planned_minutes"],
            status="planned",
            actual_minutes=0,
            notes=item["notes"],
            generated_batch_id=batch_id,
            **item["links"],
        )
        db.session.add(session)
        created.append(session)
    db.session.flush()

    create_notification(
        user.id,
        "plan_change",
        "Study plan saved",
        body=f"{len(created)} sessions were added to your timetable.",
        link="/app/planner",
        dedupe_key=f"plan_change:batch:{batch_id}" if batch_id else None,
    )
    db.session.commit()

    return (
        jsonify(
            {
                "created": len(created),
                "batch_id": batch_id,
                "sessions": [study_session_detail(session) for session in created],
            }
        ),
        201,
    )


def _int_list(raw, field):
    if raw in (None, ""):
        return []
    if not isinstance(raw, list):
        raise ValidationError(
            "Invalid value.", fields={field: "Expected a list of ids."}
        )
    return [parse_int(value, field, minimum=1) for value in raw]

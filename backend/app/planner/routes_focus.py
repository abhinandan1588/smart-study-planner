"""Focus timer with server-validated durations (PRD 3.6).

Timer reliability rules enforced here:

* ``started_at`` is set by the server; the client cannot backdate a live timer.
* elapsed time is derived from the stored timestamps minus the accumulated
  pause time, never from a client-supplied duration;
* a claimed duration that exceeds the real wall-clock window is rejected with
  ``422 IMPOSSIBLE_DURATION``;
* ``complete`` only records ``completed`` when at least 90 % of the target has
  actually elapsed, otherwise the row is stored as ``interrupted``;
* ``GET /focus-sessions/active`` returns the running/paused row so the UI can
  rebuild the countdown after a page refresh.
"""

from datetime import timedelta

from flask import jsonify, request

from app.common.achievements import evaluate_achievements
from app.common.decorators import current_user, get_owned_or_404, student_required
from app.common.errors import ApiError, ConflictError, ValidationError
from app.common.pagination import paginate
from app.common.serializers import focus_session_detail
from app.common.streaks import activity_by_day
from app.common.validators import (
    get_json_body,
    parse_date,
    parse_datetime,
    parse_int,
    validate_enum,
)
from app.extensions import db
from app.models import FOCUS_MODES, FocusSession, utcnow
from app.planner import planner_bp
from app.planner.link_service import resolve_links

LIVE_STATUSES = ("running", "paused")
COMPLETION_RATIO = 0.9
MAX_TARGET_MINUTES = 240
MIN_TARGET_MINUTES = 5
# A retroactively logged session may not be older than this.
MAX_BACKDATE_HOURS = 24


def elapsed_seconds(session, now=None):
    """Real focus seconds: wall clock minus accumulated and current pause."""
    now = now or utcnow()
    reference = session.ended_at or now
    if session.status == "paused" and session.paused_at:
        reference = session.paused_at
    total = (reference - session.started_at).total_seconds()
    total -= session.paused_accumulated_seconds or 0
    return max(0, int(total))


def _active_session(user_id):
    return (
        FocusSession.query.filter(
            FocusSession.user_id == user_id,
            FocusSession.status.in_(LIVE_STATUSES),
        )
        .order_by(FocusSession.started_at.desc())
        .first()
    )


@planner_bp.get("/focus-sessions/active")
@student_required
def active_focus_session():
    """State recovery endpoint: the UI rebuilds the timer from this."""
    user = current_user()
    session = _active_session(user.id)
    if session is None:
        return jsonify({"session": None, "server_time": utcnow().isoformat()}), 200
    seconds = elapsed_seconds(session)
    return (
        jsonify(
            {
                "session": focus_session_detail(session, elapsed_seconds=seconds),
                "server_time": utcnow().isoformat(),
            }
        ),
        200,
    )


@planner_bp.get("/focus-sessions")
@student_required
def list_focus_sessions():
    user = current_user()
    query = FocusSession.query.filter(FocusSession.user_id == user.id)

    date_from = parse_date(request.args.get("from"), "from", required=False)
    if date_from:
        query = query.filter(FocusSession.started_at >= _start_of(date_from))
    date_to = parse_date(request.args.get("to"), "to", required=False)
    if date_to:
        query = query.filter(
            FocusSession.started_at < _start_of(date_to) + timedelta(days=1)
        )
    status = request.args.get("status")
    if status:
        query = query.filter(FocusSession.status == status)

    page = paginate(
        query.order_by(FocusSession.started_at.desc(), FocusSession.id.desc()),
        serializer=focus_session_detail,
    )

    today = utcnow().date()
    totals = (
        db.session.query(
            db.func.coalesce(db.func.sum(FocusSession.focus_minutes), 0),
            db.func.coalesce(db.func.sum(FocusSession.cycles_completed), 0),
            db.func.count(FocusSession.id),
        )
        .filter(
            FocusSession.user_id == user.id,
            FocusSession.status.in_(("completed", "interrupted")),
        )
        .one()
    )
    page["totals"] = {
        "total_minutes": int(totals[0]),
        "cycles_completed": int(totals[1]),
        "session_count": int(totals[2]),
        "today_minutes": activity_by_day(user.id, today, today)[today]["focus_minutes"],
    }
    return jsonify(page), 200


@planner_bp.post("/focus-sessions")
@student_required
def create_focus_session():
    """Start a live timer, or record a finished session with validation."""
    user = current_user()
    data = get_json_body()

    mode = validate_enum(
        data.get("mode"), FOCUS_MODES, "mode", required=False, default="pomodoro"
    )
    default_target = user.focus_duration_minutes or 25
    target_minutes = parse_int(
        data.get("target_minutes"),
        "target_minutes",
        minimum=MIN_TARGET_MINUTES,
        maximum=MAX_TARGET_MINUTES,
        required=False,
        default=default_target,
    )
    links = resolve_links(user, data)
    now = utcnow()

    ended_at = parse_datetime(data.get("ended_at"), "ended_at", required=False)

    if ended_at is None:
        existing = _active_session(user.id)
        if existing is not None:
            raise ConflictError(
                "A focus session is already running.",
                extra={
                    "code": "FOCUS_SESSION_ACTIVE",
                    "session": focus_session_detail(
                        existing, elapsed_seconds=elapsed_seconds(existing)
                    ),
                },
            )
        session = FocusSession(
            user_id=user.id,
            mode=mode,
            target_minutes=target_minutes,
            focus_minutes=0,
            break_minutes=0,
            started_at=now,
            status="running",
            paused_accumulated_seconds=0,
            cycles_completed=0,
            **links,
        )
        db.session.add(session)
        db.session.commit()
        return (
            jsonify(
                {
                    "session": focus_session_detail(session, elapsed_seconds=0),
                    "server_time": now.isoformat(),
                }
            ),
            201,
        )

    # Retroactive record: the server derives the duration from the timestamps.
    started_at = parse_datetime(
        data.get("started_at"), "started_at", required=False
    ) or (ended_at - timedelta(minutes=target_minutes))

    if started_at > now or ended_at > now + timedelta(minutes=1):
        raise ValidationError(
            "A focus session cannot be recorded in the future.",
            fields={"started_at": "Timestamps must not be in the future."},
        )
    if ended_at <= started_at:
        raise ValidationError(
            "Invalid focus window.",
            fields={"ended_at": "The end time must be after the start time."},
        )
    if (now - started_at) > timedelta(hours=MAX_BACKDATE_HOURS):
        raise ValidationError(
            "This session is too old to record.",
            fields={
                "started_at": f"Record sessions within {MAX_BACKDATE_HOURS} hours."
            },
        )

    window_minutes = int((ended_at - started_at).total_seconds() // 60)
    claimed = parse_int(
        data.get("focus_minutes"),
        "focus_minutes",
        minimum=0,
        maximum=MAX_TARGET_MINUTES,
        required=False,
        default=min(window_minutes, target_minutes),
    )
    if claimed > window_minutes:
        raise ApiError(
            "The reported focus time is longer than the session window.",
            status_code=422,
            code="IMPOSSIBLE_DURATION",
            fields={
                "focus_minutes": (
                    f"At most {window_minutes} minutes elapsed between the "
                    "supplied timestamps."
                )
            },
        )

    focus_minutes = min(claimed, window_minutes, target_minutes)
    break_minutes = parse_int(
        data.get("break_minutes"),
        "break_minutes",
        minimum=0,
        maximum=240,
        required=False,
        default=0,
    )
    if focus_minutes + break_minutes > window_minutes:
        break_minutes = max(0, window_minutes - focus_minutes)

    completed = focus_minutes >= target_minutes * COMPLETION_RATIO
    session = FocusSession(
        user_id=user.id,
        mode=mode,
        target_minutes=target_minutes,
        focus_minutes=focus_minutes,
        break_minutes=break_minutes,
        started_at=started_at,
        ended_at=ended_at,
        status="completed" if completed else "interrupted",
        paused_accumulated_seconds=max(
            0, (window_minutes - focus_minutes - break_minutes) * 60
        ),
        cycles_completed=1 if completed else 0,
        **links,
    )
    db.session.add(session)
    db.session.commit()

    earned = evaluate_achievements(user.id)
    return (
        jsonify(
            {
                "session": focus_session_detail(
                    session, elapsed_seconds=focus_minutes * 60
                ),
                "achievements_earned": earned,
                "server_validated": True,
            }
        ),
        201,
    )


@planner_bp.patch("/focus-sessions/<int:session_id>")
@student_required
def update_focus_session(session_id):
    """Pause, resume, complete or stop a live timer."""
    user = current_user()
    session = get_owned_or_404(FocusSession, session_id)
    data = get_json_body()
    action = validate_enum(
        data.get("action"), ("pause", "resume", "complete", "stop"), "action"
    )
    now = utcnow()

    if session.status in ("completed", "interrupted", "abandoned"):
        raise ConflictError("This focus session has already finished.")

    earned = []
    if action == "pause":
        if session.status != "running":
            raise ConflictError("Only a running session can be paused.")
        session.status = "paused"
        session.paused_at = now

    elif action == "resume":
        if session.status != "paused":
            raise ConflictError("Only a paused session can be resumed.")
        if session.paused_at:
            session.paused_accumulated_seconds = (
                session.paused_accumulated_seconds or 0
            ) + int((now - session.paused_at).total_seconds())
        session.paused_at = None
        session.status = "running"

    else:
        seconds = elapsed_seconds(session, now)
        if session.status == "paused" and session.paused_at:
            session.paused_accumulated_seconds = (
                session.paused_accumulated_seconds or 0
            ) + int((now - session.paused_at).total_seconds())
            session.paused_at = None
        focus_minutes = min(session.target_minutes, seconds // 60)
        session.focus_minutes = int(focus_minutes)
        session.ended_at = now
        reached_target = seconds >= session.target_minutes * 60 * COMPLETION_RATIO

        if action == "complete":
            session.status = "completed" if reached_target else "interrupted"
            session.cycles_completed = 1 if reached_target else 0
        else:  # stop
            if session.focus_minutes <= 0:
                session.status = "abandoned"
            else:
                session.status = "completed" if reached_target else "interrupted"
                session.cycles_completed = 1 if reached_target else 0

        if session.status in ("completed", "interrupted"):
            session.break_minutes = int(
                min(
                    (session.paused_accumulated_seconds or 0) // 60,
                    user.long_break_minutes or 15,
                )
            )

    db.session.commit()
    if session.status in ("completed", "interrupted"):
        earned = evaluate_achievements(user.id)

    return (
        jsonify(
            {
                "session": focus_session_detail(
                    session, elapsed_seconds=elapsed_seconds(session, now)
                ),
                "achievements_earned": earned,
                "server_time": now.isoformat(),
            }
        ),
        200,
    )


@planner_bp.get("/focus-sessions/summary")
@student_required
def focus_summary():
    """Daily focus totals for the last 14 days plus today's cycle count."""
    user = current_user()
    today = utcnow().date()
    start = today - timedelta(days=13)
    activity = activity_by_day(user.id, start, today)
    return (
        jsonify(
            {
                "from": start.isoformat(),
                "to": today.isoformat(),
                "daily": [
                    {
                        "date": day.isoformat(),
                        "minutes": row["focus_minutes"],
                        "sessions": row["focus_sessions"],
                        "cycles": row["focus_cycles"],
                    }
                    for day, row in sorted(activity.items())
                ],
                "today": {
                    "minutes": activity[today]["focus_minutes"],
                    "sessions": activity[today]["focus_sessions"],
                    "cycles": activity[today]["focus_cycles"],
                },
                "preferences": {
                    "focus_duration_minutes": user.focus_duration_minutes,
                    "short_break_minutes": user.short_break_minutes,
                    "long_break_minutes": user.long_break_minutes,
                },
            }
        ),
        200,
    )


def _start_of(day):
    from datetime import datetime, time

    return datetime.combine(day, time.min)

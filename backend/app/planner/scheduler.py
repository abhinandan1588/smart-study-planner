"""Deterministic smart-timetable generation (plan section 5). No AI.

``generate_plan`` is a pure function of the stored rows plus the request
options: the same inputs always produce the same ordered plan. The only
non-deterministic value in the output is ``batch_id`` (a uuid4 used to group a
draft), and the comparison helpers ignore it.

The generator can never emit an internal overlap because it only ever consumes
free sub-windows and shrinks the window after each placement.
"""

import uuid
from datetime import datetime, time, timedelta

from app.common.progress import published_version_for
from app.common.serializers import load_json
from app.extensions import db
from app.models import (
    Enrollment,
    StudySession,
    SyllabusUnit,
    Task,
    Topic,
    TopicProgress,
    utcnow,
)

WEEKDAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")

DEFAULT_AVAILABILITY = {
    "mon": [{"start": "18:00", "end": "22:00"}],
    "tue": [{"start": "18:00", "end": "22:00"}],
    "wed": [{"start": "18:00", "end": "22:00"}],
    "thu": [{"start": "18:00", "end": "22:00"}],
    "fri": [{"start": "18:00", "end": "22:00"}],
    "sat": [{"start": "09:00", "end": "13:00"}, {"start": "15:00", "end": "19:00"}],
    "sun": [{"start": "09:00", "end": "13:00"}, {"start": "15:00", "end": "19:00"}],
}

MIN_SLOT_MINUTES = 20
MAX_SAME_COURSE_RUN = 3
MAX_PLAN_DAYS = 60

PRIORITY_WEIGHT = {"low": 1, "medium": 2, "high": 3}
IMPORTANCE_WEIGHT = {"low": 1, "medium": 2, "high": 3}
DIFFICULTY_WEIGHT = {"easy": 1, "medium": 2, "hard": 3}


# --- free-slot construction --------------------------------------------


class DayCapacity:
    """The free windows and remaining daily budget for one date."""

    def __init__(self, day, windows, cap_minutes):
        self.day = day
        self.windows = [[start, end] for start, end in windows]
        self.cap_minutes = cap_minutes
        self.used_minutes = 0
        self.block_count = 0

    @property
    def remaining(self):
        return max(0, self.cap_minutes - self.used_minutes)

    def take(self, minutes, counts_toward_cap=True):
        """Consume ``minutes`` from the earliest window that still fits."""
        if counts_toward_cap and minutes > self.remaining:
            return None
        for index, window in enumerate(self.windows):
            available = int((window[1] - window[0]).total_seconds() // 60)
            if available >= minutes:
                start = window[0]
                end = start + timedelta(minutes=minutes)
                window[0] = end
                if counts_toward_cap:
                    self.used_minutes += minutes
                    self.block_count += 1
                return start, end, index
        return None

    def take_in_window(self, index, minutes, counts_toward_cap=False):
        if index >= len(self.windows):
            return None
        window = self.windows[index]
        available = int((window[1] - window[0]).total_seconds() // 60)
        if available < minutes:
            return None
        start = window[0]
        end = start + timedelta(minutes=minutes)
        window[0] = end
        if counts_toward_cap:
            self.used_minutes += minutes
        return start, end


def _availability_for(user, options):
    raw = options.get("daily_availability")
    if not raw:
        raw = load_json(user.availability_json, default=None)
    if not raw:
        raw = DEFAULT_AVAILABILITY
    normalised = {}
    for key in WEEKDAY_KEYS:
        windows = raw.get(key) or []
        parsed = []
        for window in windows:
            start = _parse_clock(window.get("start"))
            end = _parse_clock(window.get("end"))
            if start is None or end is None or end <= start:
                continue
            parsed.append((start, end))
        normalised[key] = sorted(parsed)
    return normalised


def _parse_clock(value):
    if not value:
        return None
    try:
        parts = str(value).split(":")
        return time(int(parts[0]), int(parts[1]) if len(parts) > 1 else 0)
    except (TypeError, ValueError):
        return None


def _existing_busy_intervals(user_id, from_date, to_date):
    start = datetime.combine(from_date, time.min)
    end = datetime.combine(to_date, time.max)
    rows = (
        StudySession.query.filter(
            StudySession.user_id == user_id,
            StudySession.end_at > start,
            StudySession.start_at < end,
        )
        .with_entities(StudySession.start_at, StudySession.end_at)
        .all()
    )
    return [(row[0], row[1]) for row in rows]


def _subtract(windows, busy):
    """Interval difference: windows minus every busy interval."""
    segments = list(windows)
    for busy_start, busy_end in busy:
        nxt = []
        for seg_start, seg_end in segments:
            if busy_end <= seg_start or busy_start >= seg_end:
                nxt.append((seg_start, seg_end))
                continue
            if busy_start > seg_start:
                nxt.append((seg_start, busy_start))
            if busy_end < seg_end:
                nxt.append((busy_end, seg_end))
        segments = nxt
    return segments


def _cutoff_now():
    """Current time rounded up to the next quarter hour.

    Nothing is ever scheduled into a slot that has already passed. Rounding to
    a 15-minute boundary keeps repeated generations inside the same quarter
    hour byte-identical.
    """
    now = utcnow()
    minute = ((now.minute // 15) + 1) * 15
    if minute >= 60:
        return now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    return now.replace(minute=minute, second=0, microsecond=0)


def build_day_capacities(user, from_date, to_date, options):
    availability = _availability_for(user, options)
    busy = _existing_busy_intervals(user.id, from_date, to_date)
    cap = options.get("daily_target_minutes") or user.daily_target_minutes or 240
    cutoff = _cutoff_now()

    days = []
    day = from_date
    while day <= to_date:
        key = WEEKDAY_KEYS[day.weekday()]
        windows = [
            (datetime.combine(day, start), datetime.combine(day, end))
            for start, end in availability.get(key, [])
        ]
        if day <= cutoff.date():
            windows = [
                (max(start, cutoff), end)
                for start, end in windows
                if end > cutoff
            ]
        free = _subtract(windows, busy)
        free = [
            (start, end)
            for start, end in sorted(free)
            if (end - start).total_seconds() // 60 >= MIN_SLOT_MINUTES
        ]
        days.append(DayCapacity(day, free, cap))
        day += timedelta(days=1)
    return days


# --- work queue ---------------------------------------------------------


def _enrollments_in_scope(user_id, course_ids):
    query = Enrollment.query.filter(
        Enrollment.user_id == user_id, Enrollment.status == "active"
    )
    if course_ids:
        query = query.filter(Enrollment.course_id.in_(list(course_ids)))
    return sorted(
        query.all(),
        key=lambda e: (-PRIORITY_WEIGHT.get(e.priority, 2), e.course_id),
    )


def _unit_order(unit, unit_cache):
    """(parent order, own order) so chapters sort inside their unit."""
    if unit.parent_id:
        parent = unit_cache.get(unit.parent_id)
        parent_order = parent.display_order if parent else 0
        return (parent_order, unit.display_order)
    return (unit.display_order, 0)


def build_queue(user, from_date, to_date, options):
    """Score and order every candidate item exactly once."""
    today = utcnow().date()
    include_revision = options.get("include_revision", True)
    include_tasks = options.get("include_tasks", True)
    enrollments = _enrollments_in_scope(user.id, options.get("course_ids"))

    items = []
    queued_topic_ids = set()

    for course_order, enrollment in enumerate(enrollments):
        version = published_version_for(enrollment.course_id)
        if version is None:
            continue

        unit_cache = {
            unit.id: unit
            for unit in SyllabusUnit.query.filter_by(
                syllabus_version_id=version.id
            ).all()
        }
        rows = (
            db.session.query(Topic, SyllabusUnit, TopicProgress)
            .join(SyllabusUnit, Topic.unit_id == SyllabusUnit.id)
            .outerjoin(
                TopicProgress,
                db.and_(
                    TopicProgress.topic_id == Topic.id,
                    TopicProgress.user_id == user.id,
                ),
            )
            .filter(SyllabusUnit.syllabus_version_id == version.id)
            .order_by(Topic.id)
            .all()
        )

        for topic, unit, progress in rows:
            status = progress.status if progress else "not_started"
            parent_order, own_order = _unit_order(unit, unit_cache)

            if status != "completed":
                deadline = (
                    (progress.target_date if progress else None)
                    or enrollment.target_completion_date
                    or to_date
                )
                priority = max(
                    PRIORITY_WEIGHT.get(enrollment.priority, 2),
                    PRIORITY_WEIGHT.get(progress.priority if progress else "medium", 2),
                )
                remaining = topic.estimated_minutes
                if status == "in_progress" and progress:
                    remaining = max(
                        MIN_SLOT_MINUTES,
                        topic.estimated_minutes - (progress.time_spent_minutes or 0),
                    )
                items.append(
                    {
                        "kind": "topic",
                        "session_type": "study",
                        "title": topic.title,
                        "minutes": int(remaining),
                        "course_id": enrollment.course_id,
                        "subject_id": unit.subject_id,
                        "topic_id": topic.id,
                        "task_id": None,
                        "deadline": deadline,
                        "overdue_revision": 0,
                        "priority_weight": priority,
                        "importance_weight": IMPORTANCE_WEIGHT.get(
                            topic.importance, 2
                        ),
                        "difficulty_weight": DIFFICULTY_WEIGHT.get(
                            topic.difficulty, 2
                        ),
                        "course_order": course_order,
                        "subject_order": unit.subject_id,
                        "unit_order": (parent_order, own_order),
                        "topic_order": topic.display_order,
                        "item_id": topic.id,
                    }
                )
                queued_topic_ids.add(topic.id)
                continue

            if (
                include_revision
                and progress is not None
                and progress.needs_revision
                and progress.next_revision_date is not None
                and progress.next_revision_date <= to_date
            ):
                deadline = progress.next_revision_date
                items.append(
                    {
                        "kind": "revision",
                        "session_type": "revision",
                        "title": f"Revision: {topic.title}",
                        "minutes": max(
                            MIN_SLOT_MINUTES, round(topic.estimated_minutes * 0.5)
                        ),
                        "course_id": enrollment.course_id,
                        "subject_id": unit.subject_id,
                        "topic_id": topic.id,
                        "task_id": None,
                        "deadline": deadline,
                        "overdue_revision": 1 if deadline < today else 0,
                        "priority_weight": max(
                            PRIORITY_WEIGHT.get(enrollment.priority, 2),
                            PRIORITY_WEIGHT.get(progress.priority, 2),
                        ),
                        "importance_weight": IMPORTANCE_WEIGHT.get(
                            topic.importance, 2
                        ),
                        "difficulty_weight": DIFFICULTY_WEIGHT.get(
                            topic.difficulty, 2
                        ),
                        "course_order": course_order,
                        "subject_order": unit.subject_id,
                        "unit_order": (parent_order, own_order),
                        "topic_order": topic.display_order,
                        "item_id": topic.id,
                    }
                )

    if include_tasks:
        tasks = (
            Task.query.filter(
                Task.user_id == user.id,
                Task.status.in_(("pending", "in_progress")),
                Task.due_date.isnot(None),
                Task.due_date >= from_date,
                Task.due_date <= to_date,
                Task.estimated_minutes.isnot(None),
                Task.estimated_minutes > 0,
            )
            .order_by(Task.id)
            .all()
        )
        course_positions = {
            enrollment.course_id: index
            for index, enrollment in enumerate(enrollments)
        }
        for task in tasks:
            items.append(
                {
                    "kind": "task",
                    "session_type": "study",
                    "title": f"Task: {task.title}",
                    "minutes": int(task.estimated_minutes),
                    "course_id": task.course_id,
                    "subject_id": task.subject_id,
                    "topic_id": task.topic_id,
                    "task_id": task.id,
                    "deadline": task.due_date,
                    "overdue_revision": 0,
                    "priority_weight": PRIORITY_WEIGHT.get(task.priority, 2),
                    "importance_weight": PRIORITY_WEIGHT.get(task.priority, 2),
                    "difficulty_weight": 2,
                    "course_order": course_positions.get(task.course_id, len(enrollments)),
                    "subject_order": task.subject_id or 0,
                    "unit_order": (0, 0),
                    "topic_order": 0,
                    "item_id": 1_000_000 + task.id,
                }
            )

    for item in items:
        days_left = max(1, (item["deadline"] - today).days)
        item["deadline_pressure"] = round(
            item["priority_weight"] * item["importance_weight"] / days_left, 6
        )

    items.sort(key=_sort_key)
    return items


def _sort_key(item):
    return (
        -item["overdue_revision"],
        -item["deadline_pressure"],
        -item["difficulty_weight"],
        item["course_order"],
        item["subject_order"],
        item["unit_order"],
        item["topic_order"],
        item["item_id"],
    )


def interleave(items, max_run=MAX_SAME_COURSE_RUN):
    """Avoid more than ``max_run`` consecutive blocks from the same course."""
    remaining = list(items)
    ordered = []
    last_course = None
    run = 0
    while remaining:
        pick = 0
        if last_course is not None and run >= max_run:
            for index, candidate in enumerate(remaining):
                if candidate["course_id"] != last_course:
                    pick = index
                    break
        item = remaining.pop(pick)
        if item["course_id"] == last_course:
            run += 1
        else:
            last_course = item["course_id"]
            run = 1
        ordered.append(item)
    return ordered


# --- slot filling -------------------------------------------------------


def chunk_minutes(total, block_size):
    """Split a workload into focus-sized blocks (plan 5.4.3)."""
    total = max(MIN_SLOT_MINUTES, int(total))
    block_size = max(MIN_SLOT_MINUTES, int(block_size))
    if total <= block_size:
        return [total]
    blocks = []
    remaining = total
    while remaining > block_size:
        blocks.append(block_size)
        remaining -= block_size
    if remaining >= MIN_SLOT_MINUTES:
        blocks.append(remaining)
    elif remaining > 0:
        blocks[-1] += remaining
    return blocks


def generate_plan(user, from_date, to_date, options=None):
    """Build a draft timetable. Returns ``(sessions, unscheduled, batch_id)``."""
    options = options or {}
    if (to_date - from_date).days > MAX_PLAN_DAYS:
        to_date = from_date + timedelta(days=MAX_PLAN_DAYS)

    focus_minutes = user.focus_duration_minutes or 25
    block_size = max(MIN_SLOT_MINUTES, focus_minutes * 2)
    short_break = max(0, user.short_break_minutes or 0)
    long_break = max(0, user.long_break_minutes or 0)
    include_breaks = options.get("include_breaks", True)

    days = build_day_capacities(user, from_date, to_date, options)
    queue = interleave(build_queue(user, from_date, to_date, options))

    sessions = []
    unscheduled = []
    batch_id = str(uuid.uuid4())

    for item in queue:
        blocks = chunk_minutes(item["minutes"], block_size)
        total_blocks = len(blocks)
        for index, minutes in enumerate(blocks, start=1):
            title = item["title"]
            if total_blocks > 1:
                title = f"{item['title']} ({index}/{total_blocks})"

            placement, day = _place(days, minutes, item["deadline"])
            if placement is None:
                unscheduled.append(
                    {
                        "topic_id": item["topic_id"],
                        "task_id": item["task_id"],
                        "title": title,
                        "minutes": minutes,
                        "reason": "no_capacity",
                    }
                )
                continue

            start_at, end_at, window_index, after_deadline = placement
            if after_deadline:
                unscheduled.append(
                    {
                        "topic_id": item["topic_id"],
                        "task_id": item["task_id"],
                        "title": title,
                        "minutes": minutes,
                        "reason": "after_deadline",
                        "deadline": item["deadline"].isoformat(),
                        "scheduled_for": start_at.date().isoformat(),
                    }
                )

            sessions.append(
                {
                    "title": title,
                    "session_type": item["session_type"],
                    "start_at": start_at.isoformat(),
                    "end_at": end_at.isoformat(),
                    "planned_minutes": minutes,
                    "status": "planned",
                    "course_id": item["course_id"],
                    "subject_id": item["subject_id"],
                    "topic_id": item["topic_id"],
                    "source": item["kind"],
                    "task_id": item["task_id"],
                    "generated_batch_id": batch_id,
                }
            )

            if include_breaks and (short_break or long_break):
                is_long = day.block_count % 4 == 0
                break_minutes = long_break if is_long else short_break
                if break_minutes:
                    taken = day.take_in_window(window_index, break_minutes)
                    if taken is not None:
                        sessions.append(
                            {
                                "title": "Break",
                                "session_type": "break",
                                "start_at": taken[0].isoformat(),
                                "end_at": taken[1].isoformat(),
                                "planned_minutes": break_minutes,
                                "status": "planned",
                                "course_id": None,
                                "subject_id": None,
                                "topic_id": None,
                                "source": "break",
                                "task_id": None,
                                "generated_batch_id": batch_id,
                            }
                        )

    sessions.sort(key=lambda s: (s["start_at"], s["title"]))
    return sessions, unscheduled, batch_id


def _place(days, minutes, deadline):
    """Earliest free slot on or before the deadline, else the earliest slot."""
    for day in days:
        if deadline is not None and day.day > deadline:
            break
        taken = day.take(minutes)
        if taken is not None:
            return (taken[0], taken[1], taken[2], False), day
    for day in days:
        taken = day.take(minutes)
        if taken is not None:
            return (taken[0], taken[1], taken[2], True), day
    return None, None


def plan_fingerprint(sessions):
    """Batch-id-free fingerprint used to assert repeat runs are identical."""
    return [
        (
            session["start_at"],
            session["end_at"],
            session["title"],
            session["session_type"],
            session["planned_minutes"],
            session["topic_id"],
        )
        for session in sessions
    ]

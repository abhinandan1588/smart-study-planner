"""Recurring study-session expansion (PRD 3.5).

Supported rules:

* ``none`` / empty — a single session.
* ``daily`` — every day until the horizon.
* ``weekly`` — the same weekday every week.
* ``weekly:MO,WE,FR`` — the listed weekdays every week.

Expansion is bounded by ``RECURRENCE_HORIZON_DAYS`` so one request can never
create an unbounded number of rows.
"""

from datetime import timedelta

from app.common.errors import ValidationError

RECURRENCE_HORIZON_DAYS = 56
MAX_OCCURRENCES = 60

WEEKDAY_CODES = {
    "MO": 0,
    "TU": 1,
    "WE": 2,
    "TH": 3,
    "FR": 4,
    "SA": 5,
    "SU": 6,
}


def parse_rule(raw):
    """Normalise a recurrence rule into ``(kind, weekdays)``."""
    if raw is None:
        return "none", []
    rule = str(raw).strip().lower()
    if rule in ("", "none"):
        return "none", []
    if rule == "daily":
        return "daily", []
    if rule == "weekly":
        return "weekly", []
    if rule.startswith("weekly:"):
        codes = [code.strip().upper() for code in rule.split(":", 1)[1].split(",")]
        weekdays = []
        for code in codes:
            if code not in WEEKDAY_CODES:
                raise ValidationError(
                    "Invalid recurrence rule.",
                    fields={
                        "recurrence_rule": (
                            "Weekday codes must be MO, TU, WE, TH, FR, SA or SU."
                        )
                    },
                )
            weekdays.append(WEEKDAY_CODES[code])
        if not weekdays:
            raise ValidationError(
                "Invalid recurrence rule.",
                fields={"recurrence_rule": "List at least one weekday."},
            )
        return "weekly", sorted(set(weekdays))
    raise ValidationError(
        "Invalid recurrence rule.",
        fields={
            "recurrence_rule": (
                "Use none, daily, weekly or weekly:MO,WE (comma separated weekdays)."
            )
        },
    )


def occurrences(start_at, end_at, rule, horizon_days=RECURRENCE_HORIZON_DAYS):
    """Datetime pairs for every occurrence *after* the first one."""
    kind, weekdays = parse_rule(rule)
    if kind == "none":
        return []

    duration = end_at - start_at
    horizon = start_at.date() + timedelta(days=horizon_days)
    out = []

    if kind == "daily":
        cursor = start_at + timedelta(days=1)
        while cursor.date() <= horizon and len(out) < MAX_OCCURRENCES:
            out.append((cursor, cursor + duration))
            cursor += timedelta(days=1)
        return out

    target_days = weekdays or [start_at.weekday()]
    cursor = start_at + timedelta(days=1)
    while cursor.date() <= horizon and len(out) < MAX_OCCURRENCES:
        if cursor.weekday() in target_days:
            out.append((cursor, cursor + duration))
        cursor += timedelta(days=1)
    return out

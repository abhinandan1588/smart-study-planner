"""Shared column mixins and time helpers for the models."""

from datetime import datetime, timezone

from app.extensions import db


def utcnow():
    """Naive UTC timestamp.

    SQLite does not preserve tzinfo, so every stored datetime is naive UTC and
    every comparison in the application uses this helper.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def utctoday():
    return utcnow().date()


class TimestampMixin:
    """`created_at` / `updated_at` for mutable rows."""

    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )


class CreatedAtMixin:
    """`created_at` only, for append-only rows."""

    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

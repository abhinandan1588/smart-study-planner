"""Server-side schedule overlap detection (PRD 3.5).

Two intervals overlap when ``a.start < b.end and b.start < a.end``. The check
always runs on the server against the caller's own stored sessions; the client
cannot opt out of it except through the explicit ``?force=true`` flag, which
stores the session and still reports the conflict.
"""

from app.extensions import db
from app.models import StudySession


def intervals_overlap(a_start, a_end, b_start, b_end):
    return a_start < b_end and b_start < a_end


def find_overlaps(sessions):
    """Id pairs of overlapping sessions in a materialised list."""
    ordered = sorted(sessions, key=lambda s: (s.start_at, s.id))
    pairs = []
    for index, current in enumerate(ordered):
        for other in ordered[index + 1 :]:
            if other.start_at >= current.end_at:
                break
            if intervals_overlap(
                current.start_at, current.end_at, other.start_at, other.end_at
            ):
                pairs.append([current.id, other.id])
    return pairs


def conflicting_sessions(user_id, start_at, end_at, exclude_id=None, exclude_ids=None):
    """Stored sessions of this user that overlap the given window."""
    query = StudySession.query.filter(
        StudySession.user_id == user_id,
        StudySession.start_at < end_at,
        StudySession.end_at > start_at,
    )
    if exclude_id is not None:
        query = query.filter(StudySession.id != exclude_id)
    if exclude_ids:
        query = query.filter(~StudySession.id.in_(list(exclude_ids)))
    return query.order_by(StudySession.start_at).all()


def has_conflict(user_id, start_at, end_at, exclude_id=None):
    return (
        db.session.query(StudySession.id)
        .filter(
            StudySession.user_id == user_id,
            StudySession.start_at < end_at,
            StudySession.end_at > start_at,
            StudySession.id != (exclude_id or -1),
        )
        .first()
        is not None
    )


def conflict_payload(sessions):
    return [
        {
            "id": session.id,
            "title": session.title,
            "start_at": session.start_at.isoformat(),
            "end_at": session.end_at.isoformat(),
        }
        for session in sessions
    ]

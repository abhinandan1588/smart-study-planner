"""Pagination helper producing the standard list envelope."""

from flask import current_app, request

from app.common.validators import parse_int


def pagination_args():
    page = parse_int(
        request.args.get("page"), "page", minimum=1, required=False, default=1
    )
    default_size = current_app.config.get("DEFAULT_PAGE_SIZE", 20)
    max_size = current_app.config.get("MAX_PAGE_SIZE", 100)
    per_page = parse_int(
        request.args.get("per_page"),
        "per_page",
        minimum=1,
        maximum=max_size,
        required=False,
        default=default_size,
    )
    return page, per_page


def paginate(query, serializer=None, page=None, per_page=None):
    """Return ``{"items": [...], "page", "per_page", "total", "pages"}``."""
    if page is None or per_page is None:
        page, per_page = pagination_args()
    result = query.paginate(page=page, per_page=per_page, error_out=False)
    items = result.items
    if serializer is not None:
        items = [serializer(item) for item in items]
    return {
        "items": items,
        "page": result.page,
        "per_page": result.per_page,
        "total": result.total,
        "pages": result.pages,
        "has_next": result.has_next,
        "has_prev": result.has_prev,
    }


def paginate_list(rows, serializer=None, page=None, per_page=None):
    """Paginate an already-materialised list with the same envelope."""
    if page is None or per_page is None:
        page, per_page = pagination_args()
    total = len(rows)
    start = (page - 1) * per_page
    window = rows[start : start + per_page]
    if serializer is not None:
        window = [serializer(item) for item in window]
    pages = (total + per_page - 1) // per_page if per_page else 0
    return {
        "items": window,
        "page": page,
        "per_page": per_page,
        "total": total,
        "pages": pages,
        "has_next": page < pages,
        "has_prev": page > 1,
    }

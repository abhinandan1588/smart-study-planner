"""Authorization decorators and object-level ownership checks (PRD 2.3).

Role checks are always enforced server side from the stored `users.role`, never
from anything the client sends.
"""

from functools import wraps

from flask import current_app, g
from flask_jwt_extended import get_jwt, get_jwt_identity, verify_jwt_in_request

from app.common.errors import ForbiddenError, NotFoundError, UnauthorizedError
from app.extensions import db
from app.models import User


def load_current_user(optional=False):
    """Resolve the authenticated `User` from the JWT in the request."""
    if "current_user" in g:
        return g.current_user

    verify_jwt_in_request(optional=optional)
    identity = get_jwt_identity()
    if identity is None:
        if optional:
            g.current_user = None
            return None
        raise UnauthorizedError("Authentication is required.")

    try:
        user_id = int(identity)
    except (TypeError, ValueError) as exc:
        raise UnauthorizedError("The access token is malformed.") from exc

    user = db.session.get(User, user_id)
    if user is None:
        raise UnauthorizedError("The account for this token no longer exists.")
    g.current_user = user
    return user


def current_user():
    """The authenticated user for the current request, or None."""
    return g.get("current_user")


def current_user_id():
    user = g.get("current_user")
    return user.id if user else None


def _check_account_status(user):
    if user.status == "suspended":
        raise ForbiddenError(
            "This account is suspended. Contact an administrator for assistance."
        )
    if (
        current_app.config.get("REQUIRE_EMAIL_VERIFICATION")
        and not user.email_verified
        and not user.is_admin
    ):
        raise ForbiddenError(
            "Verify your email address before using this feature."
        )


def auth_required(fn):
    """Any authenticated, non-suspended account."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = load_current_user()
        _check_account_status(user)
        return fn(*args, **kwargs)

    return wrapper


def role_required(*roles):
    """Restrict a view to the given server-verified roles."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = load_current_user()
            _check_account_status(user)
            if user.role not in roles:
                raise ForbiddenError(
                    "This endpoint requires the "
                    + " or ".join(roles)
                    + " role."
                )
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def student_required(fn):
    return role_required("student")(fn)


def admin_required(fn):
    return role_required("admin")(fn)


def active_user_required(fn):
    """Authenticated and `status == 'active'`."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = load_current_user()
        _check_account_status(user)
        if not user.is_active_account:
            raise ForbiddenError(
                "This account is not active yet. Verify your email address to continue."
            )
        return fn(*args, **kwargs)

    return wrapper


def refresh_token_required(fn):
    """Requires a valid refresh token rather than an access token."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request(refresh=True)
        identity = get_jwt_identity()
        user = db.session.get(User, int(identity)) if identity else None
        if user is None:
            raise UnauthorizedError("The account for this token no longer exists.")
        g.current_user = user
        _check_account_status(user)
        return fn(*args, **kwargs)

    return wrapper


# --- object-level authorization -----------------------------------------


def get_owned_or_404(model, object_id, owner_field="user_id", user=None):
    """Fetch a row and verify the caller owns it.

    Admins are not implicitly granted access to private student records
    (PRD 2.3): callers that need admin access use the admin blueprint instead.
    """
    actor = user or current_user()
    if actor is None:
        raise UnauthorizedError("Authentication is required.")
    instance = db.session.get(model, object_id)
    if instance is None:
        raise NotFoundError(f"{model.__name__} {object_id} was not found.")
    owner_id = getattr(instance, owner_field, None)
    if owner_id != actor.id:
        # Do not leak the existence of another user's record.
        raise NotFoundError(f"{model.__name__} {object_id} was not found.")
    return instance


def ensure_owner(instance, owner_field="user_id", user=None):
    """Inline ownership assertion for an already-loaded row."""
    actor = user or current_user()
    if actor is None:
        raise UnauthorizedError("Authentication is required.")
    if getattr(instance, owner_field, None) != actor.id:
        raise ForbiddenError("You may only access your own records.")
    return instance


def owns(model, param="item_id", owner_field="user_id", as_kwarg="instance"):
    """Decorator form: resolves a URL parameter into an owned row.

    ``@owns(Task, param="task_id")`` passes the loaded ``Task`` to the view as
    the ``instance`` keyword argument.
    """

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            object_id = kwargs.get(param)
            if object_id is None:
                raise NotFoundError("The requested resource was not found.")
            instance = get_owned_or_404(model, object_id, owner_field=owner_field)
            kwargs[as_kwarg] = instance
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def token_claims():
    """Raw JWT claims for the current request."""
    return get_jwt()

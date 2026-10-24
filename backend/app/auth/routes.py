"""Auth endpoints under /api/v1/auth (PRD 3.1 / 8.1)."""

import logging

from flask import current_app, jsonify
from flask_jwt_extended import get_jwt, verify_jwt_in_request

from app.auth import auth_bp
from app.auth.services import (
    consume_reset_token,
    consume_verification_token,
    expose_dev_token,
    generate_reset_token,
    generate_verification_token,
    hash_password,
    issue_access_token,
    issue_tokens,
    revoke_token,
    verify_password,
)
from app.common.audit import record_audit
from app.common.decorators import (
    auth_required,
    current_user,
    refresh_token_required,
)
from app.common.errors import ApiError, ConflictError, ValidationError
from app.common.serializers import user_profile, user_public
from app.common.validators import (
    clean_str,
    get_json_body,
    require_fields,
    validate_email_address,
    validate_password,
)
from app.extensions import db, limiter
from app.models import User, utcnow

logger = logging.getLogger(__name__)

GENERIC_RECOVERY_MESSAGE = (
    "If an account exists for that email address, recovery instructions have "
    "been issued."
)


def _auth_limit():
    return current_app.config.get("AUTH_RATE_LIMIT", "30 per minute")


@auth_bp.post("/register")
@limiter.limit(_auth_limit)
def register():
    """Create a student account.

    The role is always forced to `student`: a `role` field in the payload is
    ignored, so registration can never create an administrator (PRD 2.3).
    """
    data = get_json_body()
    require_fields(data, ["full_name", "email", "password"])

    full_name = clean_str(data.get("full_name"), "full_name", max_length=120, min_length=2)
    email = validate_email_address(data.get("email"))
    password = validate_password(data.get("password"))

    if User.query.filter(db.func.lower(User.email) == email).first():
        raise ConflictError("An account with this email address already exists.")

    user = User(
        full_name=full_name,
        email=email,
        password_hash=hash_password(password),
        role="student",
        status="pending_verification",
        email_verified=False,
    )
    db.session.add(user)
    db.session.flush()

    token = generate_verification_token(user)
    record_audit(
        "auth.registered", actor_id=user.id, entity_type="user", entity_id=user.id
    )
    db.session.commit()

    payload = {
        "message": "Account created. Verify your email address to activate it.",
        "user": user_public(user),
    }
    payload.update(expose_dev_token("verification_token", token))
    return jsonify(payload), 201


@auth_bp.post("/login")
@limiter.limit(_auth_limit)
def login():
    data = get_json_body()
    require_fields(data, ["email", "password"])
    email = clean_str(data.get("email"), "email", max_length=255).lower()
    password = data.get("password")

    user = User.query.filter(db.func.lower(User.email) == email).first()
    if user is None or not verify_password(user, password):
        raise ApiError(
            "The email address or password is incorrect.",
            status_code=401,
            code="INVALID_CREDENTIALS",
        )

    if user.status == "suspended":
        raise ApiError(
            "This account is suspended. Contact an administrator for assistance.",
            status_code=403,
            code="ACCOUNT_SUSPENDED",
        )

    if (
        current_app.config.get("REQUIRE_EMAIL_VERIFICATION")
        and not user.email_verified
        and not user.is_admin
    ):
        raise ApiError(
            "Verify your email address before signing in.",
            status_code=403,
            code="EMAIL_NOT_VERIFIED",
        )

    user.last_login_at = utcnow()
    tokens = issue_tokens(user)
    db.session.commit()

    return jsonify({**tokens, "user": user_public(user)}), 200


@auth_bp.post("/logout")
def logout():
    """Revoke the presented token. Accepts an access or a refresh token."""
    verify_jwt_in_request(verify_type=False)
    payload = get_jwt()
    identity = payload.get("sub")
    revoke_token(payload, user_id=int(identity) if identity else None)
    db.session.commit()
    return jsonify({"message": "Signed out. The token has been revoked."}), 200


@auth_bp.post("/refresh")
@refresh_token_required
def refresh():
    user = current_user()
    return (
        jsonify(
            {
                "access_token": issue_access_token(user),
                "token_type": "Bearer",
                "expires_in": int(
                    current_app.config["JWT_ACCESS_TOKEN_EXPIRES"].total_seconds()
                ),
                "user": user_public(user),
            }
        ),
        200,
    )


@auth_bp.post("/verify-email")
def verify_email():
    data = get_json_body()
    require_fields(data, ["token"])
    token = clean_str(data.get("token"), "token", max_length=120)

    user = consume_verification_token(token)
    if user is None:
        raise ValidationError(
            "This verification link is invalid or has expired.",
            fields={"token": "Request a new verification email."},
        )

    user.email_verified = True
    user.verification_token = None
    if user.status == "pending_verification":
        user.status = "active"
    record_audit(
        "auth.email_verified", actor_id=user.id, entity_type="user", entity_id=user.id
    )
    db.session.commit()

    return (
        jsonify(
            {
                "message": "Email address verified. Your account is now active.",
                "user": user_public(user),
            }
        ),
        200,
    )


@auth_bp.post("/resend-verification")
@limiter.limit(_auth_limit)
def resend_verification():
    data = get_json_body()
    require_fields(data, ["email"])
    email = clean_str(data.get("email"), "email", max_length=255).lower()

    user = User.query.filter(db.func.lower(User.email) == email).first()
    payload = {
        "message": (
            "If an unverified account exists for that email address, a new "
            "verification token has been issued."
        )
    }
    if user is not None and not user.email_verified:
        token = generate_verification_token(user)
        db.session.commit()
        payload.update(expose_dev_token("verification_token", token))
    return jsonify(payload), 200


@auth_bp.post("/forgot-password")
@limiter.limit(_auth_limit)
def forgot_password():
    data = get_json_body()
    require_fields(data, ["email"])
    email = clean_str(data.get("email"), "email", max_length=255).lower()

    user = User.query.filter(db.func.lower(User.email) == email).first()
    payload = {"message": GENERIC_RECOVERY_MESSAGE}
    if user is not None:
        token = generate_reset_token(user)
        record_audit(
            "auth.password_reset_requested",
            actor_id=user.id,
            entity_type="user",
            entity_id=user.id,
        )
        db.session.commit()
        payload.update(expose_dev_token("reset_token", token))
    return jsonify(payload), 200


@auth_bp.post("/reset-password")
@limiter.limit(_auth_limit)
def reset_password():
    data = get_json_body()
    require_fields(data, ["token", "new_password"])
    token = clean_str(data.get("token"), "token", max_length=120)
    new_password = validate_password(data.get("new_password"), field="new_password")

    user = consume_reset_token(token)
    if user is None:
        raise ValidationError(
            "This password reset link is invalid or has expired.",
            fields={"token": "Request a new password reset."},
        )

    user.password_hash = hash_password(new_password)
    user.reset_token = None
    user.reset_token_expires_at = None
    record_audit(
        "auth.password_reset", actor_id=user.id, entity_type="user", entity_id=user.id
    )
    db.session.commit()

    return (
        jsonify({"message": "Password updated. You can now sign in."}),
        200,
    )


@auth_bp.post("/change-password")
@auth_required
def change_password():
    data = get_json_body()
    require_fields(data, ["current_password", "new_password"])
    user = current_user()

    if not verify_password(user, data.get("current_password")):
        raise ValidationError(
            "The current password is incorrect.",
            fields={"current_password": "This password does not match our records."},
        )

    new_password = validate_password(data.get("new_password"), field="new_password")
    if new_password == data.get("current_password"):
        raise ValidationError(
            "The new password must be different from the current one.",
            fields={"new_password": "Choose a password you have not used here before."},
        )

    user.password_hash = hash_password(new_password)
    record_audit(
        "auth.password_changed",
        actor_id=user.id,
        entity_type="user",
        entity_id=user.id,
    )
    db.session.commit()

    return jsonify({"message": "Password changed."}), 200


@auth_bp.get("/me")
@auth_required
def me():
    return jsonify({"user": user_profile(current_user())}), 200

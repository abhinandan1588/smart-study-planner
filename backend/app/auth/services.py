"""Auth services: password hashing, JWT issuance and one-time tokens.

No SMTP provider is configured, so the email-verification and password-reset
flows are implemented end to end but the token is written to the server log and
(when `EXPOSE_DEV_TOKENS` is on) returned in the API response so the flow is
testable.
"""

import logging
import secrets

from flask import current_app
from flask_jwt_extended import create_access_token, create_refresh_token
from werkzeug.security import check_password_hash, generate_password_hash

from app.extensions import db
from app.models import TokenBlocklist, User, utcnow

logger = logging.getLogger(__name__)


# --- passwords ----------------------------------------------------------


def hash_password(raw_password):
    return generate_password_hash(raw_password, method="pbkdf2:sha256:600000")


def verify_password(user, raw_password):
    if not user or not user.password_hash or not raw_password:
        return False
    return check_password_hash(user.password_hash, raw_password)


# --- JWT ----------------------------------------------------------------


def issue_tokens(user):
    """Access + refresh token pair carrying the server-verified role."""
    claims = {"role": user.role, "status": user.status, "email": user.email}
    identity = str(user.id)
    return {
        "access_token": create_access_token(identity=identity, additional_claims=claims),
        "refresh_token": create_refresh_token(
            identity=identity, additional_claims=claims
        ),
        "token_type": "Bearer",
        "expires_in": int(
            current_app.config["JWT_ACCESS_TOKEN_EXPIRES"].total_seconds()
        ),
    }


def issue_access_token(user):
    claims = {"role": user.role, "status": user.status, "email": user.email}
    return create_access_token(identity=str(user.id), additional_claims=claims)


def revoke_token(jwt_payload, user_id=None):
    """Add a token's jti to the durable blocklist."""
    jti = jwt_payload.get("jti")
    if not jti:
        return None
    existing = TokenBlocklist.query.filter_by(jti=jti).first()
    if existing:
        return existing
    expires_raw = jwt_payload.get("exp")
    expires_at = None
    if expires_raw:
        from datetime import datetime, timezone

        expires_at = datetime.fromtimestamp(expires_raw, tz=timezone.utc).replace(
            tzinfo=None
        )
    entry = TokenBlocklist(
        jti=jti,
        token_type=jwt_payload.get("type", "access"),
        user_id=user_id,
        expires_at=expires_at,
    )
    db.session.add(entry)
    return entry


def is_token_revoked(jwt_payload):
    jti = jwt_payload.get("jti")
    if not jti:
        return False
    return (
        db.session.query(TokenBlocklist.id).filter_by(jti=jti).first() is not None
    )


# --- one-time tokens ----------------------------------------------------


def generate_verification_token(user):
    user.verification_token = secrets.token_urlsafe(32)
    user.verification_sent_at = utcnow()
    logger.info(
        "Email verification token for %s: %s", user.email, user.verification_token
    )
    return user.verification_token


def generate_reset_token(user):
    user.reset_token = secrets.token_urlsafe(32)
    user.reset_token_expires_at = utcnow() + current_app.config["RESET_TOKEN_TTL"]
    logger.info("Password reset token for %s: %s", user.email, user.reset_token)
    return user.reset_token


def consume_verification_token(token):
    """Return the user matching an unexpired verification token, or None."""
    if not token:
        return None
    user = User.query.filter_by(verification_token=token).first()
    if user is None:
        return None
    ttl = current_app.config["VERIFICATION_TOKEN_TTL"]
    if user.verification_sent_at and utcnow() - user.verification_sent_at > ttl:
        return None
    return user


def consume_reset_token(token):
    """Return the user matching an unexpired reset token, or None."""
    if not token:
        return None
    user = User.query.filter_by(reset_token=token).first()
    if user is None:
        return None
    if not user.reset_token_expires_at or user.reset_token_expires_at < utcnow():
        return None
    return user


def expose_dev_token(key, token):
    """Include a one-time token in the response only in development."""
    if current_app.config.get("EXPOSE_DEV_TOKENS"):
        return {
            key: token,
            "dev_note": (
                "No email provider is configured, so this token is returned for "
                "testing and also written to the server log."
            ),
        }
    return {}

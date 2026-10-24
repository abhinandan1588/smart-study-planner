"""Administrator profile, platform settings and admin accounts (PRD 4.10)."""

import json

from flask import current_app, jsonify, request

from app.admin import admin_bp
from app.admin.helpers import audit
from app.admin.serializers import admin_account, setting_entry
from app.auth.services import generate_verification_token, hash_password, verify_password
from app.common.decorators import admin_required, current_user, current_user_id
from app.common.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.common.pagination import paginate
from app.common.serializers import user_profile
from app.common.validators import (
    clean_str,
    get_json_body,
    validate_email_address,
    validate_enum,
    validate_password,
)
from app.extensions import db
from app.models import (
    COURSE_CATEGORIES,
    RESOURCE_TYPES,
    USER_STATUSES,
    NOTIFICATION_TYPES,
    PlatformSetting,
    User,
)

EDITABLE_SETTINGS = {
    "course_categories": {
        "description": "Categories offered when creating a course.",
        "kind": "list",
        "allowed": COURSE_CATEGORIES,
    },
    "allowed_resource_types": {
        "description": "Resource types administrators may upload.",
        "kind": "list",
        "allowed": RESOURCE_TYPES,
    },
    "notification_defaults": {
        "description": "Notification preferences applied to new accounts.",
        "kind": "bool_map",
        "allowed": NOTIFICATION_TYPES,
    },
    "max_upload_mb": {
        "description": "Maximum upload size accepted from students and admins.",
        "kind": "int",
        "minimum": 1,
        "maximum": 200,
    },
}


# --- profile ------------------------------------------------------------


@admin_bp.get("/profile")
@admin_required
def get_profile():
    return jsonify({"user": user_profile(current_user())}), 200


@admin_bp.patch("/profile")
@admin_required
def update_profile():
    user = current_user()
    body = get_json_body()
    changes = []

    if "full_name" in body:
        user.full_name = clean_str(
            body["full_name"], "full_name", max_length=120, min_length=2
        )
        changes.append("full_name")
    if "avatar_url" in body:
        user.avatar_url = clean_str(
            body["avatar_url"], "avatar_url", max_length=500, required=False
        )
        changes.append("avatar_url")
    if "timezone" in body:
        user.timezone = clean_str(
            body["timezone"], "timezone", max_length=64, required=False, default="UTC"
        )
        changes.append("timezone")
    if "language" in body:
        user.language = clean_str(
            body["language"], "language", max_length=10, required=False, default="en"
        )
        changes.append("language")

    audit(
        "admin.profile_updated",
        entity_type="user",
        entity_id=user.id,
        detail={"fields": changes},
    )
    db.session.commit()
    return jsonify({"user": user_profile(user)}), 200


@admin_bp.post("/profile/password")
@admin_required
def change_password():
    user = current_user()
    body = get_json_body()
    current = body.get("current_password")
    if not verify_password(user, current):
        raise ValidationError(
            "The current password is incorrect.",
            fields={"current_password": "This password does not match."},
        )
    new_password = validate_password(body.get("new_password"), "new_password")
    if verify_password(user, new_password):
        raise ValidationError(
            "Choose a different password.",
            fields={"new_password": "The new password must differ from the old one."},
        )
    user.password_hash = hash_password(new_password)
    audit("admin.password_changed", entity_type="user", entity_id=user.id)
    db.session.commit()
    return jsonify({"message": "Password changed."}), 200


# --- platform settings --------------------------------------------------


def _coerce_setting(key, value):
    spec = EDITABLE_SETTINGS[key]
    kind = spec["kind"]

    if kind == "list":
        if not isinstance(value, list) or not value:
            raise ValidationError(
                "Invalid setting value.",
                fields={key: "Provide a non-empty list of values."},
            )
        unknown = [item for item in value if item not in spec["allowed"]]
        if unknown:
            raise ValidationError(
                "Invalid setting value.",
                fields={
                    key: "Unsupported values: "
                    + ", ".join(str(item) for item in unknown)
                    + ". Allowed: "
                    + ", ".join(spec["allowed"])
                    + "."
                },
            )
        return list(dict.fromkeys(value))

    if kind == "bool_map":
        if not isinstance(value, dict):
            raise ValidationError(
                "Invalid setting value.",
                fields={key: "Provide an object of notification_type: true/false."},
            )
        unknown = [item for item in value if item not in spec["allowed"]]
        if unknown:
            raise ValidationError(
                "Invalid setting value.",
                fields={key: "Unknown notification types: " + ", ".join(unknown) + "."},
            )
        return {name: bool(flag) for name, flag in value.items()}

    if kind == "int":
        try:
            number = int(value)
        except (TypeError, ValueError) as exc:
            raise ValidationError(
                "Invalid setting value.", fields={key: "Must be an integer."}
            ) from exc
        if number < spec["minimum"] or number > spec["maximum"]:
            raise ValidationError(
                "Invalid setting value.",
                fields={
                    key: f"Must be between {spec['minimum']} and {spec['maximum']}."
                },
            )
        return number

    return value


@admin_bp.get("/settings")
@admin_required
def get_settings():
    stored = {
        setting.key: setting for setting in PlatformSetting.query.all()
    }
    settings = {}
    for key, spec in EDITABLE_SETTINGS.items():
        setting = stored.get(key)
        settings[key] = (
            setting_entry(setting)
            if setting is not None
            else {
                "key": key,
                "value": None,
                "description": spec["description"],
                "updated_by": None,
                "updated_at": None,
            }
        )
    extras = [
        setting_entry(setting)
        for key, setting in stored.items()
        if key not in EDITABLE_SETTINGS
    ]
    return (
        jsonify(
            {
                "settings": settings,
                "other_settings": extras,
                "editable_keys": sorted(EDITABLE_SETTINGS),
                "runtime": {
                    "environment": current_app.config.get("ENV_NAME"),
                    "max_upload_mb": current_app.config.get("MAX_UPLOAD_MB"),
                    "allowed_upload_extensions": sorted(
                        current_app.config.get("ALLOWED_UPLOAD_EXTENSIONS", [])
                    ),
                    "require_email_verification": current_app.config.get(
                        "REQUIRE_EMAIL_VERIFICATION"
                    ),
                    "ai_provider_configured": bool(
                        current_app.config.get("AI_API_KEY")
                    ),
                },
            }
        ),
        200,
    )


@admin_bp.patch("/settings")
@admin_required
def update_settings():
    body = get_json_body()
    payload = body.get("settings") if isinstance(body.get("settings"), dict) else body
    unknown = [key for key in payload if key not in EDITABLE_SETTINGS]
    if unknown:
        raise ValidationError(
            "Unknown setting key.",
            fields={"settings": "Not editable: " + ", ".join(unknown) + "."},
        )
    if not payload:
        raise ValidationError(
            "Nothing to update.", fields={"settings": "Provide at least one key."}
        )

    updated = {}
    for key, raw in payload.items():
        value = _coerce_setting(key, raw)
        setting = PlatformSetting.query.filter_by(key=key).first()
        if setting is None:
            setting = PlatformSetting(
                key=key, description=EDITABLE_SETTINGS[key]["description"]
            )
            db.session.add(setting)
        setting.value_json = json.dumps(value)
        setting.updated_by = current_user_id()
        updated[key] = value

    audit("settings.updated", entity_type="platform", detail={"keys": list(updated)})
    db.session.commit()
    return jsonify({"updated": updated}), 200


# --- administrator accounts --------------------------------------------


@admin_bp.get("/admins")
@admin_required
def list_admins():
    query = User.query.filter(User.role == "admin").order_by(User.created_at.asc())
    page = paginate(query, serializer=admin_account)
    return jsonify(page), 200


@admin_bp.post("/admins")
@admin_required
def create_admin():
    """Create another administrator account through an authorized workflow."""
    body = get_json_body()
    full_name = clean_str(
        body.get("full_name"), "full_name", max_length=120, min_length=2
    )
    email = validate_email_address(body.get("email"))
    password = validate_password(body.get("password"))

    if User.query.filter(db.func.lower(User.email) == email).first() is not None:
        raise ConflictError("An account with this email address already exists.")

    admin = User(
        full_name=full_name,
        email=email,
        password_hash=hash_password(password),
        role="admin",
        status="active",
        email_verified=True,
    )
    db.session.add(admin)
    db.session.flush()
    audit(
        "admin.created",
        entity_type="user",
        entity_id=admin.id,
        detail={"email": admin.email, "created_by": current_user_id()},
    )
    db.session.commit()
    return jsonify({"admin": admin_account(admin)}), 201


@admin_bp.patch("/admins/<int:admin_id>")
@admin_required
def update_admin(admin_id):
    """Activate or suspend another administrator. Self-suspension is blocked."""
    target = db.session.get(User, admin_id)
    if target is None or target.role != "admin":
        raise NotFoundError("That administrator account was not found.")
    body = get_json_body()
    status = validate_enum(body.get("status"), USER_STATUSES, "status")

    if target.id == current_user_id() and status != "active":
        raise ForbiddenError("You cannot suspend your own administrator account.")
    if status != "active":
        remaining = User.query.filter(
            User.role == "admin", User.status == "active", User.id != target.id
        ).count()
        if remaining == 0:
            raise ConflictError(
                "At least one active administrator account must remain."
            )

    previous = target.status
    target.status = status
    if status == "active":
        target.email_verified = True
    audit(
        "admin.status_changed",
        entity_type="user",
        entity_id=target.id,
        detail={"from": previous, "to": status},
    )
    db.session.commit()
    return (
        jsonify({"admin": admin_account(target), "previous_status": previous}),
        200,
    )


@admin_bp.post("/admins/<int:admin_id>/password-reset")
@admin_required
def reset_admin_password(admin_id):
    """Issue a verification-style recovery token for another administrator."""
    from app.auth.services import generate_reset_token

    target = db.session.get(User, admin_id)
    if target is None or target.role != "admin":
        raise NotFoundError("That administrator account was not found.")
    token = generate_reset_token(target)
    audit(
        "admin.password_reset_issued",
        entity_type="user",
        entity_id=target.id,
        detail={"email": target.email},
    )
    db.session.commit()
    payload = {"message": f"A recovery token has been issued for {target.email}."}
    if current_app.config.get("EXPOSE_DEV_TOKENS"):
        payload["reset_token"] = token
    return jsonify(payload), 200


@admin_bp.post("/admins/<int:admin_id>/resend-verification")
@admin_required
def resend_admin_verification(admin_id):
    target = db.session.get(User, admin_id)
    if target is None or target.role != "admin":
        raise NotFoundError("That administrator account was not found.")
    token = generate_verification_token(target)
    audit(
        "admin.verification_resent",
        entity_type="user",
        entity_id=target.id,
        detail={"email": target.email},
    )
    db.session.commit()
    payload = {"message": f"A verification token has been issued for {target.email}."}
    if current_app.config.get("EXPOSE_DEV_TOKENS"):
        payload["verification_token"] = token
    return jsonify(payload), 200

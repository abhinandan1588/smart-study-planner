"""Request validation helpers used by every blueprint."""

import re
from datetime import date, datetime, time, timezone

from email_validator import EmailNotValidError, validate_email as _validate_email
from flask import current_app, request

from app.common.errors import ValidationError

_COMMON_PASSWORDS = {
    "password",
    "password1",
    "password123",
    "12345678",
    "123456789",
    "qwerty123",
    "letmein1",
    "admin123",
    "iloveyou",
    "welcome1",
}


def get_json_body(required=True):
    """Return the parsed JSON body as a dict."""
    body = request.get_json(silent=True)
    if body is None:
        if required:
            raise ValidationError("A JSON request body is required.")
        return {}
    if not isinstance(body, dict):
        raise ValidationError("The request body must be a JSON object.")
    return body


def require_fields(data, fields):
    """Ensure every name in `fields` is present and non-empty."""
    missing = {}
    for name in fields:
        value = data.get(name)
        if value is None or (isinstance(value, str) and not value.strip()):
            missing[name] = "This field is required."
    if missing:
        raise ValidationError("Required fields are missing.", fields=missing)
    return data


def clean_str(value, field, max_length=None, min_length=1, required=True, default=None):
    if value is None:
        if required:
            raise ValidationError(
                "Required fields are missing.", fields={field: "This field is required."}
            )
        return default
    if not isinstance(value, str):
        raise ValidationError(
            "Invalid field value.", fields={field: "Must be a string."}
        )
    cleaned = value.strip()
    if len(cleaned) < min_length:
        if not required and cleaned == "":
            return default
        raise ValidationError(
            "Invalid field value.",
            fields={field: f"Must be at least {min_length} characters."},
        )
    if max_length and len(cleaned) > max_length:
        raise ValidationError(
            "Invalid field value.",
            fields={field: f"Must be at most {max_length} characters."},
        )
    return cleaned


def validate_email_address(raw, field="email"):
    """Normalise and validate an email address."""
    value = clean_str(raw, field, max_length=255)
    try:
        result = _validate_email(value, check_deliverability=False)
    except EmailNotValidError as exc:
        raise ValidationError(
            "Invalid email address.", fields={field: str(exc)}
        ) from exc
    return result.normalized.lower()


def validate_password(raw, field="password"):
    """Enforce the password policy (PRD 3.1)."""
    min_length = current_app.config.get("PASSWORD_MIN_LENGTH", 8)
    if not isinstance(raw, str) or not raw:
        raise ValidationError(
            "Required fields are missing.", fields={field: "This field is required."}
        )
    problems = []
    if len(raw) < min_length:
        problems.append(f"at least {min_length} characters")
    if not re.search(r"[A-Za-z]", raw):
        problems.append("one letter")
    if not re.search(r"\d", raw):
        problems.append("one number")
    if len(raw) > 128:
        problems.append("at most 128 characters")
    if raw.lower() in _COMMON_PASSWORDS:
        raise ValidationError(
            "Password is too weak.",
            fields={field: "This password is too common. Choose another one."},
        )
    if problems:
        raise ValidationError(
            "Password is too weak.",
            fields={field: "The password must contain " + ", ".join(problems) + "."},
        )
    return raw


def validate_enum(value, allowed, field, required=True, default=None):
    if value is None or value == "":
        if required:
            raise ValidationError(
                "Required fields are missing.", fields={field: "This field is required."}
            )
        return default
    if value not in allowed:
        raise ValidationError(
            "Invalid field value.",
            fields={field: "Must be one of: " + ", ".join(allowed) + "."},
        )
    return value


def parse_int(value, field, minimum=None, maximum=None, required=True, default=None):
    if value is None or value == "":
        if required:
            raise ValidationError(
                "Required fields are missing.", fields={field: "This field is required."}
            )
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError(
            "Invalid field value.", fields={field: "Must be an integer."}
        ) from exc
    if minimum is not None and parsed < minimum:
        raise ValidationError(
            "Invalid field value.", fields={field: f"Must be at least {minimum}."}
        )
    if maximum is not None and parsed > maximum:
        raise ValidationError(
            "Invalid field value.", fields={field: f"Must be at most {maximum}."}
        )
    return parsed


def parse_float(value, field, minimum=None, maximum=None, required=True, default=None):
    if value is None or value == "":
        if required:
            raise ValidationError(
                "Required fields are missing.", fields={field: "This field is required."}
            )
        return default
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError(
            "Invalid field value.", fields={field: "Must be a number."}
        ) from exc
    if minimum is not None and parsed < minimum:
        raise ValidationError(
            "Invalid field value.", fields={field: f"Must be at least {minimum}."}
        )
    if maximum is not None and parsed > maximum:
        raise ValidationError(
            "Invalid field value.", fields={field: f"Must be at most {maximum}."}
        )
    return parsed


def parse_bool(value, field, required=False, default=None):
    if value is None or value == "":
        if required:
            raise ValidationError(
                "Required fields are missing.", fields={field: "This field is required."}
            )
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "on"}:
            return True
        if lowered in {"0", "false", "no", "off"}:
            return False
    raise ValidationError(
        "Invalid field value.", fields={field: "Must be a boolean."}
    )


def parse_date(value, field, required=True, default=None):
    if value is None or value == "":
        if required:
            raise ValidationError(
                "Required fields are missing.", fields={field: "This field is required."}
            )
        return default
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError as exc:
        raise ValidationError(
            "Invalid field value.", fields={field: "Must be a date in YYYY-MM-DD form."}
        ) from exc


def parse_datetime(value, field, required=True, default=None):
    """Parse an ISO-8601 datetime into naive UTC."""
    if value is None or value == "":
        if required:
            raise ValidationError(
                "Required fields are missing.", fields={field: "This field is required."}
            )
        return default
    if isinstance(value, datetime):
        parsed = value
    else:
        raw = str(value).strip().replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(raw)
        except ValueError as exc:
            raise ValidationError(
                "Invalid field value.",
                fields={field: "Must be an ISO-8601 datetime."},
            ) from exc
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def parse_time(value, field, required=True, default=None):
    if value is None or value == "":
        if required:
            raise ValidationError(
                "Required fields are missing.", fields={field: "This field is required."}
            )
        return default
    if isinstance(value, time):
        return value
    try:
        return time.fromisoformat(str(value))
    except ValueError as exc:
        raise ValidationError(
            "Invalid field value.", fields={field: "Must be a time in HH:MM form."}
        ) from exc


def slugify(value, max_length=220):
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return slug[:max_length] or "item"

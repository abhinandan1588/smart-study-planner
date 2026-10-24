"""Uniform JSON error envelope for the whole API.

Every error response has the shape::

    {"error": {"code": "VALIDATION_ERROR", "message": "...", "fields": {...}}}
"""

import logging

from flask import jsonify
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from werkzeug.exceptions import HTTPException

from app.extensions import db

logger = logging.getLogger(__name__)

DEFAULT_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    415: "UNSUPPORTED_MEDIA_TYPE",
    422: "UNPROCESSABLE_ENTITY",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    503: "SERVICE_UNAVAILABLE",
}


class ApiError(Exception):
    """Raise anywhere to return a structured JSON error."""

    status_code = 400
    code = "BAD_REQUEST"

    def __init__(self, message, status_code=None, code=None, fields=None, extra=None):
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        self.code = code or DEFAULT_CODES.get(self.status_code, "BAD_REQUEST")
        self.fields = fields or {}
        self.extra = extra or {}

    def to_payload(self):
        error = {"code": self.code, "message": self.message}
        if self.fields:
            error["fields"] = self.fields
        error.update(self.extra)
        return {"error": error}


class ValidationError(ApiError):
    status_code = 422
    code = "VALIDATION_ERROR"

    def __init__(self, message="The submitted data is invalid.", fields=None):
        super().__init__(message, status_code=422, code="VALIDATION_ERROR", fields=fields)


class NotFoundError(ApiError):
    def __init__(self, message="The requested resource was not found."):
        super().__init__(message, status_code=404, code="NOT_FOUND")


class ForbiddenError(ApiError):
    def __init__(self, message="You do not have permission to perform this action."):
        super().__init__(message, status_code=403, code="FORBIDDEN")


class UnauthorizedError(ApiError):
    def __init__(self, message="Authentication is required."):
        super().__init__(message, status_code=401, code="UNAUTHORIZED")


class ConflictError(ApiError):
    def __init__(self, message="The request conflicts with existing data.", extra=None):
        super().__init__(message, status_code=409, code="CONFLICT", extra=extra)


def error_response(message, status_code=400, code=None, fields=None, extra=None):
    err = ApiError(message, status_code=status_code, code=code, fields=fields, extra=extra)
    return jsonify(err.to_payload()), err.status_code


def register_error_handlers(app):
    @app.errorhandler(ApiError)
    def _handle_api_error(exc):
        return jsonify(exc.to_payload()), exc.status_code

    @app.errorhandler(HTTPException)
    def _handle_http_exception(exc):
        status = exc.code or 500
        code = DEFAULT_CODES.get(status, "HTTP_ERROR")
        message = exc.description or exc.name
        if status == 413:
            limit_mb = app.config.get("MAX_UPLOAD_MB", 20)
            message = f"The uploaded file exceeds the {limit_mb} MB limit."
        return jsonify({"error": {"code": code, "message": message}}), status

    @app.errorhandler(IntegrityError)
    def _handle_integrity_error(exc):
        db.session.rollback()
        logger.warning("Database integrity error: %s", exc)
        return (
            jsonify(
                {
                    "error": {
                        "code": "CONFLICT",
                        "message": "The request violates a database constraint.",
                    }
                }
            ),
            409,
        )

    @app.errorhandler(SQLAlchemyError)
    def _handle_sqlalchemy_error(exc):
        db.session.rollback()
        logger.exception("Database error: %s", exc)
        return (
            jsonify(
                {
                    "error": {
                        "code": "INTERNAL_ERROR",
                        "message": "A database error occurred.",
                    }
                }
            ),
            500,
        )

    @app.errorhandler(Exception)
    def _handle_unexpected_error(exc):
        db.session.rollback()
        logger.exception("Unhandled application error: %s", exc)
        return (
            jsonify(
                {
                    "error": {
                        "code": "INTERNAL_ERROR",
                        "message": "An unexpected server error occurred.",
                    }
                }
            ),
            500,
        )

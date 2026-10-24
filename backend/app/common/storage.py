"""Upload directory handling with file-type and size validation (PRD 3.10)."""

import mimetypes
import os
import secrets
from pathlib import Path

from flask import current_app
from werkzeug.utils import secure_filename

from app.common.errors import ApiError, ValidationError

# Extensions accepted per logical resource type.
TYPE_EXTENSIONS = {
    "pdf": {"pdf"},
    "document": {"pdf", "doc", "docx", "txt", "md"},
    "image": {"png", "jpg", "jpeg"},
    "practice_set": {"pdf", "doc", "docx", "csv", "txt", "md"},
    "revision_sheet": {"pdf", "doc", "docx", "txt", "md"},
    "note": {"pdf", "txt", "md", "doc", "docx"},
}


def upload_root():
    root = Path(current_app.config["UPLOAD_FOLDER"])
    root.mkdir(parents=True, exist_ok=True)
    return root


def ensure_upload_dirs():
    """Create the upload root and its per-scope subdirectories."""
    root = upload_root()
    for sub in ("students", "admin", "tmp"):
        (root / sub).mkdir(parents=True, exist_ok=True)
    return root


def extension_of(filename):
    return (Path(filename or "").suffix or "").lower().lstrip(".")


def allowed_extension(filename):
    return extension_of(filename) in current_app.config["ALLOWED_UPLOAD_EXTENSIONS"]


def validate_upload(file_storage, resource_type=None, field="file"):
    """Validate a `FileStorage` by extension, declared type and size."""
    if file_storage is None or not file_storage.filename:
        raise ValidationError(
            "A file is required.", fields={field: "No file was uploaded."}
        )

    ext = extension_of(file_storage.filename)
    allowed = current_app.config["ALLOWED_UPLOAD_EXTENSIONS"]
    if ext not in allowed:
        raise ValidationError(
            "Unsupported file type.",
            fields={field: "Allowed file types: " + ", ".join(sorted(allowed)) + "."},
        )

    if resource_type in TYPE_EXTENSIONS and ext not in TYPE_EXTENSIONS[resource_type]:
        raise ValidationError(
            "The file does not match the selected resource type.",
            fields={
                field: f"A {resource_type} resource accepts: "
                + ", ".join(sorted(TYPE_EXTENSIONS[resource_type]))
                + "."
            },
        )

    size = _stream_size(file_storage)
    max_bytes = current_app.config["MAX_CONTENT_LENGTH"]
    if size == 0:
        raise ValidationError(
            "The uploaded file is empty.", fields={field: "The file has no content."}
        )
    if size > max_bytes:
        raise ApiError(
            f"The uploaded file exceeds the {current_app.config['MAX_UPLOAD_MB']} MB limit.",
            status_code=413,
            code="PAYLOAD_TOO_LARGE",
        )

    mime = file_storage.mimetype or mimetypes.guess_type(file_storage.filename)[0]
    return {"extension": ext, "size_bytes": size, "mime_type": mime}


def _stream_size(file_storage):
    stream = file_storage.stream
    current = stream.tell()
    stream.seek(0, os.SEEK_END)
    size = stream.tell()
    stream.seek(current)
    return size


def save_upload(file_storage, scope="students", owner_id=None, resource_type=None):
    """Validate and store an upload; returns metadata with a relative path.

    The stored name is randomised so uploaded files are never reachable through
    a predictable URL.
    """
    meta = validate_upload(file_storage, resource_type=resource_type)
    root = ensure_upload_dirs()

    parts = [scope]
    if owner_id is not None:
        parts.append(str(owner_id))
    directory = root.joinpath(*parts)
    directory.mkdir(parents=True, exist_ok=True)

    original = secure_filename(file_storage.filename) or f"upload.{meta['extension']}"
    stem = Path(original).stem[:60] or "upload"
    stored_name = f"{stem}-{secrets.token_hex(8)}.{meta['extension']}"
    target = directory / stored_name
    file_storage.stream.seek(0)
    file_storage.save(target)

    meta.update(
        {
            "file_path": str(target.relative_to(root)),
            "original_filename": original,
            "stored_filename": stored_name,
            "size_bytes": target.stat().st_size,
        }
    )
    return meta


def resolve_upload_path(relative_path):
    """Absolute path for a stored file, rejecting traversal attempts."""
    if not relative_path:
        raise ApiError("This resource has no stored file.", status_code=404, code="NOT_FOUND")
    root = upload_root().resolve()
    candidate = (root / relative_path).resolve()
    if not str(candidate).startswith(str(root)):
        raise ApiError("Invalid file path.", status_code=400, code="BAD_REQUEST")
    if not candidate.is_file():
        raise ApiError(
            "The stored file is missing.", status_code=404, code="NOT_FOUND"
        )
    return candidate


def delete_upload(relative_path):
    """Remove a stored file. Returns True when a file was deleted."""
    if not relative_path:
        return False
    root = upload_root().resolve()
    candidate = (root / relative_path).resolve()
    if not str(candidate).startswith(str(root)) or not candidate.is_file():
        return False
    candidate.unlink()
    return True


def storage_usage():
    """Total bytes and file count under the upload root."""
    root = upload_root()
    total = 0
    count = 0
    for path in root.rglob("*"):
        if path.is_file():
            total += path.stat().st_size
            count += 1
    return {"total_bytes": total, "file_count": count, "root": str(root)}

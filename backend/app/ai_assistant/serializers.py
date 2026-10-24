"""Serializers for AI conversations, messages and indexed documents."""

from app.common.serializers import iso, load_json
from app.extensions import db
from app.models import AiMessage


def conversation_summary(conversation, message_count=None, last_message_at=None):
    if conversation is None:
        return None
    if message_count is None or last_message_at is None:
        counted, latest = (
            db.session.query(
                db.func.count(AiMessage.id), db.func.max(AiMessage.created_at)
            )
            .filter(AiMessage.conversation_id == conversation.id)
            .one()
        )
        if message_count is None:
            message_count = counted or 0
        if last_message_at is None:
            last_message_at = latest
    return {
        "id": conversation.id,
        "title": conversation.title,
        "course_id": conversation.course_id,
        "course_title": conversation.course.title if conversation.course else None,
        "topic_id": conversation.topic_id,
        "topic_title": conversation.topic.title if conversation.topic else None,
        "message_count": message_count,
        "last_message_at": iso(last_message_at),
        "created_at": iso(conversation.created_at),
        "updated_at": iso(conversation.updated_at),
    }


def message_detail(message):
    if message is None:
        return None
    return {
        "id": message.id,
        "conversation_id": message.conversation_id,
        "role": message.role,
        "content": message.content,
        "sources": load_json(message.sources_json, default=[]),
        "tokens": message.tokens,
        "created_at": iso(message.created_at),
    }


def document_summary(resource, chunk_count=0, indexed=False):
    """Metadata for a document available to retrieval. No file path is exposed."""
    if resource is None:
        return None
    return {
        "resource_id": resource.id,
        "title": resource.title,
        "resource_type": resource.resource_type,
        "mime_type": resource.mime_type,
        "file_size_bytes": resource.file_size_bytes,
        "visibility": resource.visibility,
        "is_own_upload": resource.owner_id is not None,
        "course_id": resource.course_id,
        "course_title": resource.course.title if resource.course else None,
        "topic_id": resource.topic_id,
        "indexed": indexed or chunk_count > 0,
        "chunk_count": chunk_count,
        "created_at": iso(resource.created_at),
    }

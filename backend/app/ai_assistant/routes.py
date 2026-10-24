"""AI Study Assistant endpoints (PRD 3.9, contract in PRD 8.2).

Registered twice by the app factory: under `/api/v1/student/ai` (the PRD 8.2
path) and under `/api/v1/ai`. Both prefixes serve the same views.

Guardrails applied to every generated answer:

* authentication and the student role, enforced server side;
* object-level ownership — a conversation is only ever reachable by the student
  who owns it, and a mismatch reports 404 rather than confirming it exists;
* document permissions — retrieval starts from the shared visibility filter, so
  another student's private upload can never enter a prompt;
* a message length limit and a per-user rate limit;
* a provider timeout with every transport failure turned into a clean JSON 503
  instead of a 500;
* graceful degradation: with no server-side key the chat endpoint still answers
  with the retrieved passages and a machine-readable `ai_configured: false`.
"""

import logging

from flask import current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request
from flask_limiter.util import get_remote_address

from app.ai_assistant import ai_bp, prompts, rag
from app.ai_assistant.provider import (
    AiNotConfiguredError,
    AiProviderError,
    complete,
    is_configured,
    parse_json_response,
    status as provider_status,
)
from app.ai_assistant.serializers import (
    conversation_summary,
    document_summary,
    message_detail,
)
from app.common.access import (
    get_course_or_404,
    require_enrollment,
    require_topic_in_enrolled_course,
)
from app.common.decorators import current_user, student_required
from app.common.errors import ApiError, NotFoundError, ValidationError
from app.common.pagination import paginate, paginate_list
from app.common.serializers import dump_json
from app.common.storage import delete_upload, save_upload
from app.common.validators import (
    clean_str,
    get_json_body,
    parse_bool,
    parse_int,
    validate_enum,
)
from app.extensions import db, limiter
from app.models import AiConversation, AiMessage, DocumentChunk, Resource, utcnow
from app.models.resource import new_access_token

logger = logging.getLogger(__name__)

DEFAULT_TITLE = "New conversation"
TITLE_FROM_MESSAGE_CHARS = 60


def _ai_limit():
    return current_app.config.get("AI_RATE_LIMIT", "20 per hour")


def _rate_key():
    """Rate limit per authenticated student, not per IP (PRD 3.9)."""
    try:
        verify_jwt_in_request(optional=True)
        identity = get_jwt_identity()
    except Exception:  # an unauthenticated call still gets limited by address
        identity = None
    return f"ai-user:{identity}" if identity else f"ai-ip:{get_remote_address()}"


def _disclaimer():
    return current_app.config.get("AI_DISCLAIMER")


# --- status -------------------------------------------------------------


@ai_bp.get("/status")
@student_required
def ai_status():
    """Whether AI generation is available. Never exposes the key itself."""
    return jsonify(provider_status()), 200


# --- conversations ------------------------------------------------------


def _owned_conversation(conversation_id, user):
    conversation = db.session.get(AiConversation, conversation_id)
    if conversation is None or conversation.user_id != user.id:
        # Never confirm that another student's conversation exists.
        raise NotFoundError("That conversation was not found.")
    return conversation


def _resolve_links(user, data):
    """Validate optional course/topic context against the caller's enrollments."""
    course_id = parse_int(data.get("course_id"), "course_id", minimum=1, required=False)
    topic_id = parse_int(data.get("topic_id"), "topic_id", minimum=1, required=False)
    course = None
    topic_context = None

    if topic_id:
        topic, resolved_course_id = require_topic_in_enrolled_course(user.id, topic_id)
        course_id = course_id or resolved_course_id
        topic_context = rag.topic_context(topic.id)
    if course_id:
        course = get_course_or_404(course_id)
        require_enrollment(user.id, course_id)
    return course, course_id, topic_id, topic_context


@ai_bp.get("/conversations")
@student_required
def list_conversations():
    user = current_user()
    counts = dict(
        db.session.query(AiMessage.conversation_id, db.func.count(AiMessage.id))
        .join(AiConversation, AiConversation.id == AiMessage.conversation_id)
        .filter(AiConversation.user_id == user.id)
        .group_by(AiMessage.conversation_id)
        .all()
    )
    last_at = dict(
        db.session.query(AiMessage.conversation_id, db.func.max(AiMessage.created_at))
        .join(AiConversation, AiConversation.id == AiMessage.conversation_id)
        .filter(AiConversation.user_id == user.id)
        .group_by(AiMessage.conversation_id)
        .all()
    )
    query = AiConversation.query.filter(AiConversation.user_id == user.id).order_by(
        AiConversation.updated_at.desc(), AiConversation.id.desc()
    )
    page = paginate(query)
    page["items"] = [
        conversation_summary(
            item,
            message_count=counts.get(item.id, 0),
            last_message_at=last_at.get(item.id),
        )
        for item in page["items"]
    ]
    return jsonify(page), 200


@ai_bp.post("/conversations")
@student_required
def create_conversation():
    user = current_user()
    data = get_json_body(required=False)
    _course, course_id, topic_id, _topic = _resolve_links(user, data)
    title = (
        clean_str(data.get("title"), "title", max_length=250, required=False)
        or DEFAULT_TITLE
    )
    conversation = AiConversation(
        user_id=user.id, title=title, course_id=course_id, topic_id=topic_id
    )
    db.session.add(conversation)
    db.session.commit()
    return jsonify({"conversation": conversation_summary(conversation, 0)}), 201


@ai_bp.get("/conversations/<int:conversation_id>")
@student_required
def get_conversation(conversation_id):
    user = current_user()
    conversation = _owned_conversation(conversation_id, user)
    messages = (
        AiMessage.query.filter_by(conversation_id=conversation.id)
        .order_by(AiMessage.created_at, AiMessage.id)
        .all()
    )
    return (
        jsonify(
            {
                "conversation": conversation_summary(
                    conversation,
                    message_count=len(messages),
                    last_message_at=messages[-1].created_at if messages else None,
                ),
                "messages": [message_detail(item) for item in messages],
                "ai_configured": is_configured(),
                "disclaimer": _disclaimer(),
            }
        ),
        200,
    )


@ai_bp.get("/conversations/<int:conversation_id>/messages")
@student_required
def list_messages(conversation_id):
    """Paginated message history, oldest first."""
    user = current_user()
    conversation = _owned_conversation(conversation_id, user)
    query = AiMessage.query.filter_by(conversation_id=conversation.id).order_by(
        AiMessage.created_at, AiMessage.id
    )
    page = paginate(query, serializer=message_detail)
    page["conversation_id"] = conversation.id
    return jsonify(page), 200


@ai_bp.patch("/conversations/<int:conversation_id>")
@student_required
def rename_conversation(conversation_id):
    user = current_user()
    conversation = _owned_conversation(conversation_id, user)
    data = get_json_body()
    if "title" in data:
        conversation.title = clean_str(
            data.get("title"), "title", max_length=250, min_length=1
        )
    if "course_id" in data or "topic_id" in data:
        _course, course_id, topic_id, _topic = _resolve_links(user, data)
        conversation.course_id = course_id
        conversation.topic_id = topic_id
    db.session.commit()
    return jsonify({"conversation": conversation_summary(conversation)}), 200


@ai_bp.delete("/conversations/<int:conversation_id>")
@student_required
def delete_conversation(conversation_id):
    """Delete a conversation and its messages (PRD 3.9 / 10.4)."""
    user = current_user()
    conversation = _owned_conversation(conversation_id, user)
    db.session.delete(conversation)
    db.session.commit()
    return "", 204


# --- documents ----------------------------------------------------------


def _chunk_counts(resource_ids):
    if not resource_ids:
        return {}
    rows = (
        db.session.query(DocumentChunk.resource_id, db.func.count(DocumentChunk.id))
        .filter(DocumentChunk.resource_id.in_(resource_ids))
        .group_by(DocumentChunk.resource_id)
        .all()
    )
    return dict(rows)


@ai_bp.get("/documents")
@student_required
def list_documents():
    """Documents this student may use for retrieval, with their index state."""
    user = current_user()
    only_indexed = parse_bool(
        request.args.get("indexed"), "indexed", required=False, default=None
    )
    rows = (
        rag.authorised_documents_query(user)
        .order_by(Resource.created_at.desc(), Resource.id.desc())
        .all()
    )
    rows = [row for row in rows if rag.is_indexable(row)]
    counts = _chunk_counts([row.id for row in rows])
    if only_indexed is True:
        rows = [row for row in rows if counts.get(row.id)]
    elif only_indexed is False:
        rows = [row for row in rows if not counts.get(row.id)]

    page = paginate_list(
        rows,
        serializer=lambda row: document_summary(row, chunk_count=counts.get(row.id, 0)),
    )
    page["total_indexed_chunks"] = sum(counts.get(row.id, 0) for row in rows)
    return jsonify(page), 200


@ai_bp.post("/documents")
@student_required
def add_document():
    """Upload a new document, or index one the caller is already allowed to read.

    `multipart/form-data` with a `file` creates a private resource owned by the
    caller and indexes it. A JSON body with `resource_id` indexes an existing
    document after the permission check.
    """
    user = current_user()
    file_storage = request.files.get("file")

    if file_storage is not None:
        return _upload_and_index(user, file_storage)

    data = get_json_body()
    resource_id = parse_int(data.get("resource_id"), "resource_id", minimum=1)
    force = parse_bool(data.get("force"), "force", required=False, default=False)
    resource = rag.require_readable_resource(resource_id, user)
    result = rag.index_resource(resource, force=force)
    return (
        jsonify(
            {
                "document": document_summary(
                    resource, chunk_count=result["chunks"], indexed=True
                ),
                "index": result,
            }
        ),
        200,
    )


def _upload_and_index(user, file_storage):
    form = request.form
    extension = (file_storage.filename or "").rsplit(".", 1)[-1].lower()
    if extension not in rag.INDEXABLE_EXTENSIONS:
        raise ValidationError(
            "Only PDF and plain-text documents can be indexed for retrieval.",
            fields={
                "file": "Supported extensions: "
                + ", ".join(sorted(rag.INDEXABLE_EXTENSIONS))
            },
        )
    resource_type = "pdf" if extension == "pdf" else "note"
    title = (
        clean_str(form.get("title"), "title", max_length=250, required=False)
        or (file_storage.filename or "Uploaded document")[:250]
    )

    links = {}
    for field in ("course_id", "subject_id", "topic_id"):
        links[field] = parse_int(form.get(field), field, minimum=1, required=False)
    if links["topic_id"]:
        topic, course_id = require_topic_in_enrolled_course(user.id, links["topic_id"])
        links["course_id"] = course_id
        links["subject_id"] = topic.unit.subject_id
    elif links["course_id"]:
        require_enrollment(user.id, links["course_id"])

    meta = save_upload(
        file_storage, scope="students", owner_id=user.id, resource_type=resource_type
    )
    resource = Resource(
        title=title,
        description=clean_str(
            form.get("description"), "description", max_length=2000, required=False
        ),
        resource_type=resource_type,
        file_path=meta["file_path"],
        file_size_bytes=meta["size_bytes"],
        mime_type=meta["mime_type"],
        tags=clean_str(form.get("tags"), "tags", max_length=500, required=False),
        visibility="private",
        status="published",
        owner_id=user.id,
        uploaded_by=user.id,
        access_token=new_access_token(),
        last_accessed_at=utcnow(),
        **links,
    )
    db.session.add(resource)
    db.session.commit()

    try:
        result = rag.index_resource(resource)
    except ApiError:
        # A document with no extractable text is not a usable upload: remove it
        # so the student does not end up with a resource that cannot be used.
        stored = resource.file_path
        db.session.delete(resource)
        db.session.commit()
        delete_upload(stored)
        raise

    return (
        jsonify(
            {
                "document": document_summary(
                    resource, chunk_count=result["chunks"], indexed=True
                ),
                "index": result,
            }
        ),
        201,
    )


@ai_bp.delete("/documents/<int:resource_id>")
@student_required
def remove_document_index(resource_id):
    """Drop the retrieval index for one of the caller's own documents."""
    user = current_user()
    resource = rag.require_readable_resource(resource_id, user)
    if resource.owner_id != user.id:
        raise NotFoundError("That document was not found.")
    removed = rag.clear_index(resource.id)
    return jsonify({"resource_id": resource.id, "chunks_removed": removed}), 200


# --- retrieval ----------------------------------------------------------


@ai_bp.post("/retrieve")
@student_required
def retrieve_chunks():
    """Run the retrieval step on its own and return the ranked chunks."""
    user = current_user()
    data = get_json_body()
    question = _validated_question(data.get("question") or data.get("message"))
    _course, course_id, topic_id, _topic = _resolve_links(user, data)
    resource_ids = _resource_ids(data.get("resource_ids"))
    top_k = parse_int(
        data.get("top_k"), "top_k", minimum=1, maximum=20, required=False
    )

    hits, meta = rag.retrieve(
        user,
        question,
        resource_ids=resource_ids,
        course_id=course_id,
        topic_id=topic_id,
        top_k=top_k,
    )
    return (
        jsonify(
            {
                "question": question,
                "chunks": [
                    {
                        "resource_id": hit["resource_id"],
                        "title": hit["title"],
                        "page_number": hit["page_number"],
                        "chunk_index": hit["chunk_index"],
                        "score": hit["score"],
                        "matched_terms": hit["matched_terms"],
                        "snippet": hit["snippet"],
                    }
                    for hit in hits
                ],
                "retrieval": meta,
            }
        ),
        200,
    )


def _validated_question(raw):
    limit = current_app.config.get("AI_MAX_MESSAGE_CHARS", 4000)
    question = clean_str(raw, "message", max_length=limit, min_length=2)
    return question


def _resource_ids(raw):
    if raw is None:
        return None
    if not isinstance(raw, list):
        raise ValidationError(
            "Invalid field value.",
            fields={"resource_ids": "Must be a list of resource ids."},
        )
    return [
        parse_int(item, "resource_ids", minimum=1) for item in raw[:20]
    ] or None


# --- chat ---------------------------------------------------------------


@ai_bp.post("/chat")
@limiter.limit(_ai_limit, key_func=_rate_key)
@student_required
def chat():
    """Ask the assistant a question, grounded in authorised documents.

    With a provider key configured this returns a generated answer plus the
    citations it was grounded in. Without one it returns HTTP 200 carrying
    `ai_configured: false`, a human-readable notice and the retrieved passages,
    so the page still works and nothing else in the app is affected.
    """
    user = current_user()
    data = get_json_body()
    question = _validated_question(data.get("message"))
    level = validate_enum(
        data.get("level"), prompts.LEVELS, "level", required=False, default="standard"
    )
    mode = validate_enum(
        data.get("mode"), prompts.MODES, "mode", required=False, default="explain"
    )
    course, course_id, topic_id, topic_context = _resolve_links(user, data)
    resource_ids = _resource_ids(data.get("resource_ids"))

    conversation = _conversation_for_chat(user, data, course_id, topic_id)

    hits, retrieval_meta = rag.retrieve(
        user,
        question,
        resource_ids=resource_ids,
        course_id=course_id or conversation.course_id,
        topic_id=topic_id or conversation.topic_id,
    )
    sources = rag.citations(hits)

    history = (
        AiMessage.query.filter_by(conversation_id=conversation.id)
        .filter(AiMessage.role.in_(("user", "assistant")))
        .order_by(AiMessage.created_at.desc(), AiMessage.id.desc())
        .limit(current_app.config.get("AI_MAX_HISTORY_MESSAGES", 10))
        .all()
    )
    history.reverse()

    db.session.add(
        AiMessage(conversation_id=conversation.id, role="user", content=question)
    )
    if conversation.title == DEFAULT_TITLE:
        conversation.title = question[:TITLE_FROM_MESSAGE_CHARS]
    conversation.updated_at = utcnow()
    db.session.commit()

    if not is_configured():
        content = rag.offline_answer(question, hits, topic=topic_context)
        assistant = _store_assistant(conversation, content, sources)
        payload = provider_status()
        return (
            jsonify(
                {
                    "conversation_id": conversation.id,
                    "ai_configured": False,
                    "code": "AI_NOT_CONFIGURED",
                    "notice": payload["message"],
                    "provider": payload["provider"],
                    "message": message_detail(assistant),
                    "retrieval": retrieval_meta,
                    "disclaimer": _disclaimer(),
                }
            ),
            200,
        )

    system = prompts.system_prompt(
        level=level,
        mode=mode,
        context=prompts.study_context(course=course, topic=topic_context),
    )
    try:
        result = complete(system, prompts.chat_messages(history, question, hits))
    except AiProviderError as exc:
        return _provider_error(exc, conversation_id=conversation.id)

    assistant = _store_assistant(
        conversation, result["content"], sources, tokens=result.get("tokens")
    )
    return (
        jsonify(
            {
                "conversation_id": conversation.id,
                "ai_configured": True,
                "provider": result["provider"],
                "model": result["model"],
                "message": message_detail(assistant),
                "retrieval": retrieval_meta,
                "disclaimer": _disclaimer(),
            }
        ),
        200,
    )


def _conversation_for_chat(user, data, course_id, topic_id):
    conversation_id = parse_int(
        data.get("conversation_id"), "conversation_id", minimum=1, required=False
    )
    if conversation_id:
        return _owned_conversation(conversation_id, user)
    conversation = AiConversation(
        user_id=user.id,
        title=DEFAULT_TITLE,
        course_id=course_id,
        topic_id=topic_id,
    )
    db.session.add(conversation)
    db.session.commit()
    return conversation


def _store_assistant(conversation, content, sources, tokens=None):
    message = AiMessage(
        conversation_id=conversation.id,
        role="assistant",
        content=content,
        sources_json=dump_json(sources) if sources else None,
        tokens=tokens,
    )
    db.session.add(message)
    conversation.updated_at = utcnow()
    db.session.commit()
    return message


def _provider_error(exc, conversation_id=None):
    """Clean JSON 503 for any provider failure — never a 500 that breaks the page."""
    logger.warning("AI provider failure (%s): %s", exc.code, exc.message)
    error = {
        "code": exc.code,
        "message": exc.message,
        "ai_configured": exc.code != "AI_NOT_CONFIGURED",
    }
    if conversation_id is not None:
        error["conversation_id"] = conversation_id
    return jsonify({"error": error}), 503


# --- quiz and flashcards ------------------------------------------------


def _subject_label(data, topic_context, course):
    explicit = clean_str(data.get("topic"), "topic", max_length=250, required=False)
    if explicit:
        return explicit
    if topic_context:
        return f"{topic_context['title']} ({topic_context.get('subject_name') or 'syllabus'})"
    if course is not None:
        return course.title
    raise ValidationError(
        "Choose what to generate from.",
        fields={"topic_id": "Provide topic_id, course_id or a topic label."},
    )


@ai_bp.post("/quiz")
@limiter.limit(_ai_limit, key_func=_rate_key)
@student_required
def quiz():
    """Practice multiple-choice questions grounded in authorised material."""
    user = current_user()
    data = get_json_body()
    count = parse_int(data.get("count"), "count", minimum=1, maximum=10, required=False, default=5)
    difficulty = validate_enum(
        data.get("difficulty"),
        ("easy", "medium", "hard"),
        "difficulty",
        required=False,
        default="medium",
    )
    course, course_id, topic_id, topic_context = _resolve_links(user, data)
    label = _subject_label(data, topic_context, course)

    if not is_configured():
        return _not_configured_payload()

    hits, retrieval_meta = rag.retrieve(
        user,
        label,
        resource_ids=_resource_ids(data.get("resource_ids")),
        course_id=course_id,
        topic_id=topic_id,
    )
    system = prompts.system_prompt(
        mode="quiz", context=prompts.study_context(course=course, topic=topic_context)
    )
    try:
        result = complete(
            system,
            [{"role": "user", "content": prompts.quiz_prompt(count, difficulty, label, hits)}],
            json_mode=True,
        )
        parsed = parse_json_response(result["content"])
    except AiProviderError as exc:
        return _provider_error(exc)

    questions = [
        item
        for item in (parsed.get("questions") or [])
        if isinstance(item, dict) and item.get("question") and len(item.get("options") or []) == 4
    ]
    return (
        jsonify(
            {
                "ai_configured": True,
                "topic": label,
                "difficulty": difficulty,
                "questions": questions[:count],
                "sources": rag.citations(hits),
                "retrieval": retrieval_meta,
                "disclaimer": _disclaimer(),
            }
        ),
        200,
    )


@ai_bp.post("/flashcards")
@limiter.limit(_ai_limit, key_func=_rate_key)
@student_required
def flashcards():
    """Revision flashcards grounded in authorised material."""
    user = current_user()
    data = get_json_body()
    count = parse_int(
        data.get("count"), "count", minimum=1, maximum=20, required=False, default=8
    )
    course, course_id, topic_id, topic_context = _resolve_links(user, data)
    label = _subject_label(data, topic_context, course)

    if not is_configured():
        return _not_configured_payload()

    hits, retrieval_meta = rag.retrieve(
        user,
        label,
        resource_ids=_resource_ids(data.get("resource_ids")),
        course_id=course_id,
        topic_id=topic_id,
    )
    system = prompts.system_prompt(
        mode="flashcards",
        context=prompts.study_context(course=course, topic=topic_context),
    )
    try:
        result = complete(
            system,
            [{"role": "user", "content": prompts.flashcards_prompt(count, label, hits)}],
            json_mode=True,
        )
        parsed = parse_json_response(result["content"])
    except AiProviderError as exc:
        return _provider_error(exc)

    cards = [
        item
        for item in (parsed.get("cards") or [])
        if isinstance(item, dict) and item.get("front") and item.get("back")
    ]
    return (
        jsonify(
            {
                "ai_configured": True,
                "topic": label,
                "cards": cards[:count],
                "sources": rag.citations(hits),
                "retrieval": retrieval_meta,
                "disclaimer": _disclaimer(),
            }
        ),
        200,
    )


def _not_configured_payload():
    """Structured 503 for the generation-only endpoints."""
    return _provider_error(AiNotConfiguredError())

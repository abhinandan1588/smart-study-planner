"""Retrieval-augmented generation over authorised study material (PRD 3.9).

Dependency-light by design: no vector database and no embedding service. Text
is extracted from PDFs (`pypdf`) and plain-text files, split into overlapping
character chunks stored in `document_chunks`, and scored at query time with a
pure-Python TF-IDF cosine ranking over the candidate chunk set.

Every retrieval starts from `resource_visibility_filter`, the same rule the
download endpoint uses, so a student can only ever retrieve from their own
private uploads, published public material, published `enrolled_only` material
for a course they are enrolled in, and explicit `resource_permissions` grants.
Another student's private document is invisible at the SQL level — it can never
reach a prompt.
"""

import logging
import math
import re
from collections import Counter

from flask import current_app

from app.common.access import (
    can_access_resource,
    enrolled_course_ids,
    resource_visibility_filter,
)
from app.common.errors import ApiError, NotFoundError, ValidationError
from app.common.storage import resolve_upload_path
from app.extensions import db
from app.models import DocumentChunk, Resource, Topic

logger = logging.getLogger(__name__)

CHUNK_CHARS = 900
CHUNK_OVERLAP = 150
MIN_CHUNK_CHARS = 40
MAX_CANDIDATE_CHUNKS = 4000
SNIPPET_CHARS = 420

TEXT_EXTENSIONS = {"txt", "md", "csv"}
PDF_EXTENSIONS = {"pdf"}
INDEXABLE_EXTENSIONS = TEXT_EXTENSIONS | PDF_EXTENSIONS

_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9'\-]*")
_WHITESPACE_RE = re.compile(r"[ \t\r\f\v]+")

STOPWORDS = {
    "a", "about", "after", "all", "also", "am", "an", "and", "any", "are", "as",
    "at", "be", "because", "been", "before", "being", "between", "both", "but",
    "by", "can", "did", "do", "does", "doing", "for", "from", "had", "has",
    "have", "having", "he", "her", "here", "hers", "him", "his", "how", "i",
    "if", "in", "into", "is", "it", "its", "just", "me", "more", "most", "my",
    "no", "nor", "not", "now", "of", "off", "on", "once", "only", "or", "other",
    "our", "out", "over", "own", "same", "she", "should", "so", "some", "such",
    "than", "that", "the", "their", "them", "then", "there", "these", "they",
    "this", "those", "through", "to", "too", "under", "until", "up", "very",
    "was", "we", "were", "what", "when", "where", "which", "while", "who",
    "whom", "why", "will", "with", "would", "you", "your",
}


# --- text extraction ----------------------------------------------------


def extension_of(resource):
    return (resource.file_path or "").rsplit(".", 1)[-1].lower()


def is_indexable(resource):
    return bool(resource.file_path) and extension_of(resource) in INDEXABLE_EXTENSIONS


def extract_pages(resource):
    """Return ``[(page_number, text), ...]`` for a stored file.

    Plain text files produce a single entry with ``page_number=None``; PDFs
    produce one entry per page so citations can name the page.
    """
    path = resolve_upload_path(resource.file_path)
    ext = extension_of(resource)

    if ext in TEXT_EXTENSIONS:
        text = path.read_text(encoding="utf-8", errors="replace")
        return [(None, text)]

    if ext in PDF_EXTENSIONS:
        try:
            from pypdf import PdfReader
        except ImportError as exc:  # pragma: no cover - dependency is pinned
            raise ApiError(
                "PDF text extraction is unavailable on this server.",
                status_code=503,
                code="PDF_EXTRACTION_UNAVAILABLE",
            ) from exc
        try:
            reader = PdfReader(str(path))
            pages = []
            for index, page in enumerate(reader.pages, start=1):
                try:
                    pages.append((index, page.extract_text() or ""))
                except Exception as exc:  # a single damaged page must not fail all
                    logger.warning(
                        "Could not extract page %s of resource %s: %s",
                        index,
                        resource.id,
                        exc,
                    )
            return pages
        except Exception as exc:
            raise ValidationError(
                "The PDF could not be read. It may be encrypted, scanned or damaged.",
                fields={"file": str(exc)[:200]},
            ) from exc

    raise ValidationError(
        "Only PDF and plain-text documents can be indexed for retrieval.",
        fields={
            "file": "Supported extensions: " + ", ".join(sorted(INDEXABLE_EXTENSIONS))
        },
    )


def normalise(text):
    text = (text or "").replace("\u0000", " ")
    text = _WHITESPACE_RE.sub(" ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_chunks(text, chunk_chars=CHUNK_CHARS, overlap=CHUNK_OVERLAP):
    """Split text into overlapping chunks, preferring sentence boundaries."""
    cleaned = normalise(text)
    if len(cleaned) <= chunk_chars:
        return [cleaned] if len(cleaned) >= MIN_CHUNK_CHARS else []

    chunks = []
    start = 0
    length = len(cleaned)
    while start < length:
        end = min(start + chunk_chars, length)
        if end < length:
            window = cleaned[start:end]
            # Prefer to break on a sentence end, then a newline, then a space.
            for marker in (". ", ".\n", "? ", "! ", "\n", " "):
                cut = window.rfind(marker)
                if cut > chunk_chars * 0.5:
                    end = start + cut + len(marker)
                    break
        piece = cleaned[start:end].strip()
        if len(piece) >= MIN_CHUNK_CHARS:
            chunks.append(piece)
        if end >= length:
            break
        start = max(end - overlap, start + 1)
    return chunks


def index_resource(resource, force=False):
    """Extract, chunk and store the text of a document.

    Idempotent: an already-indexed resource is left alone unless `force`.
    Returns ``{"resource_id", "chunks", "pages", "chars", "reindexed"}``.
    """
    if not is_indexable(resource):
        raise ValidationError(
            "This resource has no text content that can be indexed.",
            fields={
                "resource_id": "Attach a PDF or plain-text file to use retrieval."
            },
        )

    existing = DocumentChunk.query.filter_by(resource_id=resource.id).count()
    if existing and not force:
        return {
            "resource_id": resource.id,
            "chunks": existing,
            "pages": None,
            "chars": None,
            "reindexed": False,
        }

    if existing:
        DocumentChunk.query.filter_by(resource_id=resource.id).delete()
        db.session.flush()

    pages = extract_pages(resource)
    index = 0
    total_chars = 0
    for page_number, page_text in pages:
        for piece in split_chunks(page_text):
            db.session.add(
                DocumentChunk(
                    resource_id=resource.id,
                    chunk_index=index,
                    content=piece,
                    page_number=page_number,
                    char_count=len(piece),
                )
            )
            index += 1
            total_chars += len(piece)

    if index == 0:
        db.session.rollback()
        raise ValidationError(
            "No readable text could be extracted from this document.",
            fields={
                "file": "Scanned images need OCR, which this release does not include."
            },
        )

    db.session.commit()
    logger.info("Indexed resource %s into %s chunks", resource.id, index)
    return {
        "resource_id": resource.id,
        "chunks": index,
        "pages": len(pages),
        "chars": total_chars,
        "reindexed": bool(existing),
    }


def clear_index(resource_id):
    removed = DocumentChunk.query.filter_by(resource_id=resource_id).delete()
    db.session.commit()
    return removed


# --- authorisation ------------------------------------------------------


def authorised_documents_query(user, course_ids=None):
    """`Resource` rows with a file this caller may read."""
    if course_ids is None:
        course_ids = enrolled_course_ids(user.id)
    return Resource.query.filter(
        resource_visibility_filter(user.id, course_ids),
        Resource.file_path.isnot(None),
    )


def require_readable_resource(resource_id, user):
    """Load a resource the caller may read, or raise 404.

    A document the caller may not read is reported as missing rather than
    forbidden so the endpoint never confirms that another student's private
    upload exists.
    """
    resource = db.session.get(Resource, resource_id)
    if resource is None or not can_access_resource(resource, user):
        raise NotFoundError("That document was not found.")
    return resource


# --- retrieval ----------------------------------------------------------


def tokenize(text):
    return [
        token
        for token in _TOKEN_RE.findall((text or "").lower())
        if len(token) > 1 and token not in STOPWORDS
    ]


def _candidate_rows(user, resource_ids=None, course_id=None, topic_id=None):
    """Chunk rows the caller is authorised to see, narrowed by the filters."""
    course_ids = enrolled_course_ids(user.id)
    query = (
        db.session.query(DocumentChunk, Resource)
        .join(Resource, DocumentChunk.resource_id == Resource.id)
        .filter(resource_visibility_filter(user.id, course_ids))
    )

    if resource_ids:
        # Each explicitly requested document is permission-checked first, so an
        # unauthorised id is dropped instead of widening the search.
        allowed = []
        for resource_id in resource_ids:
            resource = db.session.get(Resource, resource_id)
            if resource is not None and can_access_resource(resource, user):
                allowed.append(resource.id)
        if not allowed:
            return [], []
        query = query.filter(DocumentChunk.resource_id.in_(allowed))
    else:
        if course_id:
            query = query.filter(
                db.or_(Resource.course_id == course_id, Resource.owner_id == user.id)
            )
        if topic_id:
            query = query.filter(
                db.or_(
                    Resource.topic_id == topic_id,
                    Resource.topic_id.is_(None),
                )
            )

    rows = query.order_by(DocumentChunk.resource_id, DocumentChunk.chunk_index).limit(
        MAX_CANDIDATE_CHUNKS
    ).all()
    return rows, sorted({resource.id for _, resource in rows})


def retrieve(user, question, resource_ids=None, course_id=None, topic_id=None, top_k=None):
    """Top-k chunks for a question, ranked by TF-IDF cosine similarity.

    Returns ``(hits, meta)``. Each hit carries the source resource so the
    answer can cite it.
    """
    top_k = top_k or current_app.config.get("AI_RETRIEVAL_TOP_K", 4)
    query_terms = tokenize(question)
    rows, searched_resource_ids = _candidate_rows(
        user, resource_ids=resource_ids, course_id=course_id, topic_id=topic_id
    )
    meta = {
        "candidate_chunks": len(rows),
        "searched_resource_ids": searched_resource_ids,
        "method": "tfidf_cosine",
        "top_k": top_k,
    }
    if not rows or not query_terms:
        return [], meta

    # Document frequencies across the authorised candidate set.
    chunk_tokens = []
    document_frequency = Counter()
    for chunk, _resource in rows:
        tokens = tokenize(chunk.content)
        counts = Counter(tokens)
        chunk_tokens.append(counts)
        document_frequency.update(counts.keys())

    total = len(rows)

    def idf(term):
        return math.log((total + 1) / (document_frequency.get(term, 0) + 1)) + 1.0

    query_counts = Counter(query_terms)
    query_weights = {
        term: (1.0 + math.log(count)) * idf(term)
        for term, count in query_counts.items()
    }
    query_norm = math.sqrt(sum(weight**2 for weight in query_weights.values())) or 1.0

    scored = []
    for position, (chunk, resource) in enumerate(rows):
        counts = chunk_tokens[position]
        if not counts:
            continue
        overlap = [term for term in query_weights if term in counts]
        if not overlap:
            continue
        dot = 0.0
        for term in overlap:
            weight = (1.0 + math.log(counts[term])) * idf(term)
            dot += weight * query_weights[term]
        chunk_norm = math.sqrt(
            sum(
                ((1.0 + math.log(count)) * idf(term)) ** 2
                for term, count in counts.items()
            )
        ) or 1.0
        score = dot / (chunk_norm * query_norm)
        if score <= 0:
            continue
        scored.append((score, len(overlap), chunk, resource))

    # Deterministic ordering: score, then term coverage, then chunk identity.
    scored.sort(key=lambda row: (-row[0], -row[1], row[2].resource_id, row[2].chunk_index))

    hits = []
    for score, matched, chunk, resource in scored[:top_k]:
        hits.append(
            {
                "chunk_id": chunk.id,
                "resource_id": resource.id,
                "title": resource.title,
                "resource_type": resource.resource_type,
                "chunk_index": chunk.chunk_index,
                "page_number": chunk.page_number,
                "score": round(score, 4),
                "matched_terms": matched,
                "snippet": chunk.content[:SNIPPET_CHARS],
                "content": chunk.content,
            }
        )
    meta["matched_chunks"] = len(scored)
    meta["query_terms"] = sorted(query_weights)
    return hits, meta


def citations(hits):
    """Public source list stored with the assistant message."""
    return [
        {
            "resource_id": hit["resource_id"],
            "title": hit["title"],
            "page_number": hit["page_number"],
            "chunk_index": hit["chunk_index"],
            "score": hit["score"],
            "snippet": hit["snippet"],
        }
        for hit in hits
    ]


# --- syllabus context ---------------------------------------------------


def topic_context(topic_id):
    """Short syllabus description for a topic, used to ground the prompt."""
    topic = db.session.get(Topic, topic_id)
    if topic is None:
        return None
    unit = topic.unit
    return {
        "topic_id": topic.id,
        "title": topic.title,
        "description": topic.description,
        "difficulty": topic.difficulty,
        "importance": topic.importance,
        "estimated_minutes": topic.estimated_minutes,
        "unit_title": unit.title if unit else None,
        "subject_name": unit.subject.name if unit and unit.subject else None,
        "course_title": (
            unit.version.course.title if unit and unit.version and unit.version.course else None
        ),
    }


# --- offline fallback ---------------------------------------------------


def offline_answer(question, hits, topic=None):
    """Extractive answer used when no provider key is configured.

    Nothing is invented: the reply quotes the retrieved passages and names
    their source so the feature stays useful and honest without a model.
    """
    lines = []
    if hits:
        lines.append(
            "AI generation is switched off on this server, so here are the "
            "most relevant passages from your authorised study material for "
            f'"{question.strip()[:160]}":'
        )
        for position, hit in enumerate(hits, start=1):
            where = hit["title"]
            if hit["page_number"]:
                where += f", page {hit['page_number']}"
            lines.append("")
            lines.append(f"[{position}] {where}")
            lines.append(hit["snippet"].strip())
    elif topic:
        lines.append(
            "AI generation is switched off on this server and no uploaded "
            "document matched your question. Here is the syllabus entry for "
            f"this topic instead:"
        )
        lines.append("")
        lines.append(f"{topic['title']} ({topic.get('subject_name') or 'syllabus'})")
        if topic.get("description"):
            lines.append(topic["description"])
        lines.append(
            f"Difficulty: {topic['difficulty']} · Importance: {topic['importance']} · "
            f"Estimated study time: {topic['estimated_minutes']} minutes"
        )
    else:
        lines.append(
            "AI generation is switched off on this server and no authorised "
            "document matched your question. Upload a PDF or text note under "
            "Study Materials and index it, then ask again to see the matching "
            "passages."
        )
    return "\n".join(lines)

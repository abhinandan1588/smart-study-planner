"""AI assistant conversations, messages and the RAG document chunk cache."""

from app.extensions import db
from app.models.mixins import CreatedAtMixin, TimestampMixin

AI_MESSAGE_ROLES = ("user", "assistant", "system")


class AiConversation(TimestampMixin, db.Model):
    __tablename__ = "ai_conversations"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = db.Column(db.String(250), nullable=False, default="New conversation")
    course_id = db.Column(
        db.Integer, db.ForeignKey("courses.id", ondelete="SET NULL"), nullable=True
    )
    topic_id = db.Column(
        db.Integer, db.ForeignKey("topics.id", ondelete="SET NULL"), nullable=True
    )

    user = db.relationship("User", back_populates="ai_conversations")
    course = db.relationship("Course")
    topic = db.relationship("Topic")
    messages = db.relationship(
        "AiMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="AiMessage.created_at",
    )

    def __repr__(self):
        return f"<AiConversation {self.id} user={self.user_id}>"


class AiMessage(CreatedAtMixin, db.Model):
    __tablename__ = "ai_messages"

    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(
        db.Integer,
        db.ForeignKey("ai_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = db.Column(db.String(12), nullable=False)
    content = db.Column(db.Text, nullable=False)
    sources_json = db.Column(db.Text, nullable=True)
    tokens = db.Column(db.Integer, nullable=True)

    conversation = db.relationship("AiConversation", back_populates="messages")

    def __repr__(self):
        return f"<AiMessage {self.id} {self.role}>"


class DocumentChunk(CreatedAtMixin, db.Model):
    """Extracted text chunks for retrieval-augmented answers (PRD 3.9)."""

    __tablename__ = "document_chunks"
    __table_args__ = (
        db.UniqueConstraint(
            "resource_id", "chunk_index", name="uq_document_chunk_index"
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    resource_id = db.Column(
        db.Integer,
        db.ForeignKey("resources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chunk_index = db.Column(db.Integer, nullable=False)
    content = db.Column(db.Text, nullable=False)
    page_number = db.Column(db.Integer, nullable=True)
    char_count = db.Column(db.Integer, nullable=False, default=0)

    resource = db.relationship("Resource", back_populates="chunks")

    def __repr__(self):
        return f"<DocumentChunk resource={self.resource_id} #{self.chunk_index}>"

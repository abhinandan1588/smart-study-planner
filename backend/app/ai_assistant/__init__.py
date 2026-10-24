"""AI Study Assistant blueprint (PRD 3.9).

Chat, conversation persistence and document-grounded retrieval. The provider
key is read from the server environment only and is never serialised into a
response, so it can never reach the frontend.
"""

from flask import Blueprint

ai_bp = Blueprint("ai", __name__)

from app.ai_assistant import routes  # noqa: E402,F401

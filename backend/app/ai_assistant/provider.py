"""AI provider integration (PRD 3.9 / 10.1).

The API key is read from the server environment through `config.py`
(`AI_API_KEY`, which also accepts `OPENAI_API_KEY` / `GEMINI_API_KEY`). It is
used only to sign the outbound HTTPS request to the provider: it is never
logged, never returned by an endpoint and never sent to the frontend.

When no key is configured `is_configured()` is False and callers fall back to
the offline extractive answer in `rag.py`, so every other feature of the app
keeps working (PRD 11 "AI failures do not break other study-planner features").

Only the standard library is used for the HTTP call to keep dependencies light.
"""

import json
import logging
import socket
import urllib.error
import urllib.request

from flask import current_app

logger = logging.getLogger(__name__)

OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions"
GEMINI_ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)
DEFAULT_MODELS = {"openai": "gpt-4o-mini", "gemini": "gemini-2.0-flash"}


class AiProviderError(Exception):
    """A provider call failed. Routes turn this into a clean 503 JSON error."""

    def __init__(self, message, code="AI_UNAVAILABLE", detail=None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.detail = detail


class AiNotConfiguredError(AiProviderError):
    def __init__(self, message=None):
        super().__init__(
            message
            or (
                "The AI provider is not configured on this server. Set "
                "OPENAI_API_KEY or GEMINI_API_KEY in the backend environment "
                "to enable generated answers."
            ),
            code="AI_NOT_CONFIGURED",
        )


# --- configuration ------------------------------------------------------


def _api_key():
    return (current_app.config.get("AI_API_KEY") or "").strip()


def provider_name():
    """`openai`, `gemini` or `offline` when no key is configured."""
    configured = (current_app.config.get("AI_PROVIDER") or "offline").strip().lower()
    if not _api_key():
        return "offline"
    if configured not in DEFAULT_MODELS:
        return "openai"
    return configured


def model_name():
    explicit = (current_app.config.get("AI_MODEL") or "").strip()
    if explicit:
        return explicit
    return DEFAULT_MODELS.get(provider_name(), DEFAULT_MODELS["openai"])


def is_configured():
    """True when a server-side key is present and a real provider is selected."""
    return bool(_api_key()) and provider_name() in DEFAULT_MODELS


def status():
    """Machine-readable configuration state for the UI. Never includes the key."""
    configured = is_configured()
    return {
        "ai_configured": configured,
        "provider": provider_name(),
        "model": model_name() if configured else None,
        "mode": "live" if configured else "offline_retrieval_only",
        "capabilities": {
            "chat": True,
            "document_retrieval": True,
            "generated_answers": configured,
            "quiz": configured,
            "flashcards": configured,
        },
        "features": [
            "explain",
            "summary",
            "quiz",
            "flashcards",
            "revision_plan",
            "breakdown",
        ],
        "limits": {
            "max_message_chars": current_app.config.get("AI_MAX_MESSAGE_CHARS", 4000),
            "rate_limit": current_app.config.get("AI_RATE_LIMIT", "20 per hour"),
            "retrieval_top_k": current_app.config.get("AI_RETRIEVAL_TOP_K", 4),
            "timeout_seconds": current_app.config.get("AI_TIMEOUT_SECONDS", 30),
        },
        "message": (
            "AI generation is available."
            if configured
            else (
                "The AI provider is not configured on this server, so answers "
                "are built from your authorised study material instead of a "
                "language model. Ask an administrator to set OPENAI_API_KEY or "
                "GEMINI_API_KEY to enable generated answers."
            )
        ),
        "disclaimer": current_app.config.get("AI_DISCLAIMER"),
    }


# --- completion ---------------------------------------------------------


def complete(system_prompt, messages, max_tokens=None, temperature=0.3, json_mode=False):
    """Send a chat completion to the configured provider.

    `messages` is a list of ``{"role": "user"|"assistant", "content": str}``.
    Returns ``{"content", "tokens", "model", "provider"}``.
    Raises `AiNotConfiguredError` when no key is set and `AiProviderError` for
    every transport, timeout, HTTP or decoding failure.
    """
    if not is_configured():
        raise AiNotConfiguredError()

    provider = provider_name()
    model = model_name()
    timeout = current_app.config.get("AI_TIMEOUT_SECONDS", 30)
    max_tokens = max_tokens or current_app.config.get("AI_MAX_OUTPUT_TOKENS", 900)

    if provider == "gemini":
        url, headers, payload = _gemini_request(
            system_prompt, messages, model, max_tokens, temperature, json_mode
        )
    else:
        url, headers, payload = _openai_request(
            system_prompt, messages, model, max_tokens, temperature, json_mode
        )

    raw = _post_json(url, headers, payload, timeout)

    if provider == "gemini":
        content, tokens = _gemini_text(raw)
    else:
        content, tokens = _openai_text(raw)

    if not content:
        raise AiProviderError("The AI provider returned an empty response.")
    return {
        "content": content.strip(),
        "tokens": tokens,
        "model": model,
        "provider": provider,
    }


def _openai_request(system_prompt, messages, model, max_tokens, temperature, json_mode):
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": system_prompt}] + list(messages),
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {_api_key()}",
    }
    return OPENAI_ENDPOINT, headers, payload


def _gemini_request(system_prompt, messages, model, max_tokens, temperature, json_mode):
    contents = [
        {
            "role": "model" if item.get("role") == "assistant" else "user",
            "parts": [{"text": item.get("content") or ""}],
        }
        for item in messages
    ]
    generation_config = {
        "temperature": temperature,
        "maxOutputTokens": max_tokens,
    }
    if json_mode:
        generation_config["responseMimeType"] = "application/json"
    payload = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": contents,
        "generationConfig": generation_config,
    }
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": _api_key(),
    }
    return GEMINI_ENDPOINT.format(model=model), headers, payload


def _post_json(url, headers, payload, timeout):
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = _safe_error_body(exc)
        logger.warning("AI provider HTTP %s: %s", exc.code, detail)
        if exc.code in (401, 403):
            raise AiProviderError(
                "The AI provider rejected the server credentials.",
                code="AI_AUTH_FAILED",
            ) from exc
        if exc.code == 429:
            raise AiProviderError(
                "The AI provider is rate limiting this server. Try again shortly.",
                code="AI_PROVIDER_RATE_LIMITED",
            ) from exc
        raise AiProviderError(
            f"The AI provider returned an error (HTTP {exc.code}).",
            detail=detail,
        ) from exc
    except (socket.timeout, TimeoutError) as exc:
        logger.warning("AI provider timed out after %ss", timeout)
        raise AiProviderError(
            f"The AI provider did not respond within {timeout} seconds.",
            code="AI_TIMEOUT",
        ) from exc
    except urllib.error.URLError as exc:
        logger.warning("AI provider unreachable: %s", exc.reason)
        raise AiProviderError(
            "The AI provider could not be reached from this server.",
            code="AI_UNREACHABLE",
        ) from exc
    except (ValueError, json.JSONDecodeError) as exc:
        raise AiProviderError(
            "The AI provider returned a response that could not be parsed.",
            code="AI_BAD_RESPONSE",
        ) from exc


def _safe_error_body(exc):
    """Provider error text, truncated and never echoing the request headers."""
    try:
        raw = exc.read().decode("utf-8", errors="replace")
    except Exception:  # pragma: no cover - defensive
        return None
    return raw[:400]


def _openai_text(raw):
    choices = raw.get("choices") or []
    if not choices:
        return "", None
    content = (choices[0].get("message") or {}).get("content") or ""
    tokens = (raw.get("usage") or {}).get("total_tokens")
    return content, tokens


def _gemini_text(raw):
    candidates = raw.get("candidates") or []
    if not candidates:
        return "", None
    parts = (candidates[0].get("content") or {}).get("parts") or []
    content = "".join(part.get("text") or "" for part in parts)
    tokens = (raw.get("usageMetadata") or {}).get("totalTokenCount")
    return content, tokens


def parse_json_response(content):
    """Decode a JSON payload returned by the model, tolerating code fences."""
    text = (content or "").strip()
    if text.startswith("```"):
        text = text.split("```")[1] if "```" in text[3:] else text[3:]
        if text.lstrip().lower().startswith("json"):
            text = text.lstrip()[4:]
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise AiProviderError(
            "The AI provider did not return structured data.",
            code="AI_BAD_RESPONSE",
        )
    try:
        return json.loads(text[start : end + 1])
    except ValueError as exc:
        raise AiProviderError(
            "The AI provider did not return structured data.",
            code="AI_BAD_RESPONSE",
        ) from exc

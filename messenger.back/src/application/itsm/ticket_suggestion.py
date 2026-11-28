from typing import Any

from src.application.itsm.constants import DEFAULT_SUGGESTED_PRIORITY, DEFAULT_SUGGESTED_TICKET_TYPE

TITLE_MAX = 255
DESCRIPTION_MAX = 10_000


def _first_non_empty_line(text: str) -> str:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped
    return text.strip()


def _first_text_block(content: dict[str, Any]) -> str:
    blocks = content.get("blocks") or []
    for item in blocks:
        if isinstance(item, dict) and item.get("type") == "text":
            return str(item.get("text") or "").strip()
    return ""


def build_ticket_suggestion_fields(content: dict[str, Any]) -> tuple[str, str] | None:
    """Derive ticket title (first line) and description (full plaintext) from message content."""

    from src.application.messaging.content import extract_searchable_text

    text = extract_searchable_text(content).strip()
    if not text:
        return None
    title_source = _first_text_block(content) or text
    title = _first_non_empty_line(title_source)[:TITLE_MAX].strip()
    if not title:
        return None
    description = text[:DESCRIPTION_MAX]
    return title, description


def default_suggestion_ticket_type() -> str:
    return DEFAULT_SUGGESTED_TICKET_TYPE


def default_suggestion_priority() -> str:
    return DEFAULT_SUGGESTED_PRIORITY

from enum import StrEnum


class MessageContentType(StrEnum):
    """Типы content blocks в Message.content JSONB."""

    TEXT = "text"
    MEDIA = "media"
    RESOURCE = "resource"

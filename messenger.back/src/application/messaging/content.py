from typing import Any

from uuid import UUID

from src.application.itsm.constants import DIODESK_PROVIDER, TICKET_RESOURCE_TYPE
from src.application.messaging.config import MessagingConfig
from src.application.messaging.dtos import (
    ContentBlock,
    MediaBlock,
    ResourceBlock,
    SendMessageDTO,
    TextBlock,
)
from src.application.messaging.enrich import mentions_wire
from src.application.messaging.exceptions import EmptyMessageError, MessageContentInvalidError
from src.domain.media.types import MediaPresentation


def normalize_text_block(text: str, *, max_length: int) -> str:
    normalized = text.strip()
    if not normalized:
        raise MessageContentInvalidError("Text block cannot be empty.")
    if len(normalized) > max_length:
        raise MessageContentInvalidError(f"Message content exceeds {max_length} characters.")
    return normalized


def _media_wire(block: MediaBlock) -> dict[str, Any]:
    wire: dict[str, Any] = {"type": "media", "assetId": str(block.asset_id)}
    if block.presentation is not MediaPresentation.FILE:
        wire["presentation"] = block.presentation.value
    return wire


def _resource_wire(block: ResourceBlock) -> dict[str, Any]:
    if block.provider != DIODESK_PROVIDER or block.resource_type != TICKET_RESOURCE_TYPE:
        raise MessageContentInvalidError("Unsupported resource reference.")
    try:
        UUID(block.resource_id)
    except ValueError as exc:
        raise MessageContentInvalidError("resourceId must be a UUID.") from exc
    wire: dict[str, Any] = {
        "type": "resource",
        "provider": block.provider,
        "resourceType": block.resource_type,
        "resourceId": block.resource_id,
    }
    if block.number:
        wire["number"] = block.number.strip()
    return wire


def build_message_content(
    blocks: list[ContentBlock],
    *,
    config: MessagingConfig | None = None,
) -> dict[str, Any]:
    settings = config or MessagingConfig()
    if not blocks:
        raise EmptyMessageError("Message must contain at least one content block.")

    media_ids: list[UUID] = []
    wire_blocks: list[dict[str, Any]] = []

    for block in blocks:
        if isinstance(block, TextBlock):
            text = normalize_text_block(block.text, max_length=settings.max_message_length)
            wire_blocks.append({"type": "text", "text": text})
        elif isinstance(block, MediaBlock):
            media_ids.append(block.asset_id)
            wire_blocks.append(_media_wire(block))
        elif isinstance(block, ResourceBlock):
            wire_blocks.append(_resource_wire(block))
        else:
            raise MessageContentInvalidError("Unsupported content block.")

    unique_media = list(dict.fromkeys(media_ids))
    if len(unique_media) > settings.max_media_per_message:
        raise MessageContentInvalidError("Too many media blocks for a single message.")
    if len(unique_media) != len(media_ids):
        raise MessageContentInvalidError("Duplicate media assets are not allowed.")

    return {"blocks": wire_blocks}


def extract_searchable_text(content: dict[str, Any]) -> str:
    """Plaintext from text blocks — mirrors messenger_message_search_text()."""

    blocks = content.get("blocks") or []
    parts: list[str] = []
    for item in blocks:
        if isinstance(item, dict) and item.get("type") == "text":
            text = str(item.get("text") or "").strip()
            if text:
                parts.append(text)
    return " ".join(parts)


def extract_media_blocks(
    content: dict[str, Any],
) -> list[tuple[UUID, MediaPresentation]]:
    """Медиа-блоки в порядке следования: (asset_id, presentation)."""
    blocks = content.get("blocks") or []
    result: list[tuple[UUID, MediaPresentation]] = []
    for item in blocks:
        if not isinstance(item, dict) or item.get("type") != "media":
            continue
        raw = item.get("assetId") or item.get("asset_id")
        if not isinstance(raw, str):
            continue
        presentation_raw = item.get("presentation")
        try:
            presentation = (
                MediaPresentation(presentation_raw)
                if presentation_raw is not None
                else MediaPresentation.FILE
            )
        except ValueError:
            presentation = MediaPresentation.FILE
        result.append((UUID(raw), presentation))
    return result


def content_fingerprint(content: dict[str, Any]) -> tuple[tuple[str, ...], ...]:
    blocks = content.get("blocks") or []
    fingerprint: list[tuple[str, ...]] = []
    for item in blocks:
        if not isinstance(item, dict):
            continue
        block_type = str(item.get("type") or "")
        if block_type == "text":
            fingerprint.append(("text", str(item.get("text") or "")))
        elif block_type == "media":
            asset_id = item.get("assetId") or item.get("asset_id") or ""
            presentation = item.get("presentation") or MediaPresentation.FILE.value
            fingerprint.append(("media", str(asset_id), str(presentation)))
        elif block_type == "resource":
            fingerprint.append(
                (
                    "resource",
                    str(item.get("provider") or ""),
                    str(item.get("resourceType") or item.get("resource_type") or ""),
                    str(item.get("resourceId") or item.get("resource_id") or ""),
                )
            )
    return tuple(fingerprint)


def same_send_fingerprint(existing_content: dict[str, Any], command: SendMessageDTO) -> bool:
    try:
        expected_base = build_message_content(list(command.blocks))
    except (EmptyMessageError, MessageContentInvalidError):
        return False
    if content_fingerprint(existing_content) != content_fingerprint(expected_base):
        return False
    quote = command.quote_text.strip() if command.quote_text is not None else None
    if existing_content.get("quoteText") != quote:
        return False

    existing_fwd = existing_content.get("forwardedFrom")
    if command.forwarded_from is None:
        if existing_fwd:
            return False
    else:
        if not isinstance(existing_fwd, dict):
            return False
        if str(existing_fwd.get("conversationId") or existing_fwd.get("conversation_id")) != str(
            command.forwarded_from.conversation_id
        ):
            return False
        if str(existing_fwd.get("messageId") or existing_fwd.get("message_id")) != str(
            command.forwarded_from.message_id
        ):
            return False

    existing_mentions = existing_content.get("mentions") or {}
    expected_mentions = mentions_wire(list(command.mentions), mention_all=command.mention_all)
    if bool(existing_mentions.get("all")) != command.mention_all:
        return False
    existing_ids = sorted(str(x) for x in (existing_mentions.get("principalIds") or []))
    return existing_ids == sorted(expected_mentions["principalIds"])

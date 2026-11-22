from typing import Any

from uuid import UUID

from src.application.messaging.dtos import SendMessageDTO


def snapshot_text_from_content(content: dict[str, Any]) -> str:
    blocks = content.get("blocks") or []
    parts: list[str] = []
    for item in blocks:
        if isinstance(item, dict) and item.get("type") == "text":
            text = str(item.get("text") or "").strip()
            if text:
                parts.append(text)
    return "\n".join(parts) if parts else ""


def mentions_wire(principal_ids: list[UUID], *, mention_all: bool) -> dict[str, Any]:
    unique = list(dict.fromkeys(principal_ids))
    return {
        "principalIds": [str(pid) for pid in unique],
        "all": mention_all,
    }


def apply_mentions_to_content(
    content: dict[str, Any],
    *,
    principal_ids: list[UUID],
    mention_all: bool,
) -> dict[str, Any]:
    if not principal_ids and not mention_all:
        return content
    merged = dict(content)
    merged["mentions"] = mentions_wire(principal_ids, mention_all=mention_all)
    return merged


def apply_forwarded_from(content: dict[str, Any], forwarded: dict[str, Any]) -> dict[str, Any]:
    merged = dict(content)
    merged["forwardedFrom"] = forwarded
    return merged


def metadata_fingerprint(content: dict[str, Any]) -> tuple[Any, ...]:
    mentions = content.get("mentions") or {}
    principal_ids = tuple(sorted(str(x) for x in (mentions.get("principalIds") or [])))
    mention_all = bool(mentions.get("all"))
    fwd = content.get("forwardedFrom") or {}
    fwd_key = (
        str(fwd.get("conversationId") or fwd.get("conversation_id") or ""),
        str(fwd.get("messageId") or fwd.get("message_id") or ""),
        str(fwd.get("text") or ""),
    )
    return (principal_ids, mention_all, fwd_key)


def build_send_content(
    command: SendMessageDTO,
    base_content: dict[str, Any],
    *,
    forwarded_snapshot: dict[str, Any] | None,
) -> dict[str, Any]:
    content = apply_mentions_to_content(
        base_content,
        principal_ids=list(command.mentions),
        mention_all=command.mention_all,
    )
    if forwarded_snapshot is not None:
        content = apply_forwarded_from(content, forwarded_snapshot)
    return content
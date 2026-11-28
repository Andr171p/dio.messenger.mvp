from typing import Any

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from uuid import UUID

from ddf.application.exceptions import UniqueConstraintViolationError
from ddf.application.outbox import OutboxStore, save_events_to_outbox
from ddf.application.uow import UnitOfWork

from src.application.audit.repositories import AuditRepository
from src.application.audit.service import log_audit
from src.application.auth import AuthUser
from src.application.conversations.commands import require_active_membership
from src.application.conversations.repositories import ConversationRepository, MembershipRepository
from src.application.media.exceptions import MediaNotFoundError
from src.application.media.repositories import MediaRepository
from src.application.messaging.builders import build_message_dto
from src.application.messaging.config import MessagingConfig
from src.application.messaging.content import (
    build_message_content,
    extract_media_blocks,
    same_send_fingerprint,
)
from src.application.messaging.dtos import (
    DeliveryCursorDTO,
    EditMessageDTO,
    MessageDTO,
    ReadCursorDTO,
    SendMessageDTO,
)
from src.application.messaging.enrich import build_send_content, snapshot_text_from_content
from src.application.messaging.exceptions import (
    IdempotencyConflictError,
    MessageContentInvalidError,
    MessageEditWindowExpiredError,
    MessageNotFoundError,
)
from src.application.messaging.formatting import visible_formatted_text
from src.application.messaging.repositories import ConversationEventStore, MessageRepository
from src.application.messaging.validate_send import resolve_forward_snapshot, validate_mentions
from src.application.policies.repositories import ConversationPolicyRepository
from src.application.receipts.cursors import monotonic_receipt_cursor
from src.application.threads.commands import ensure_thread_sendable
from src.application.threads.repositories import ThreadRepository
from src.domain.conversations import Conversation
from src.domain.events import ConversationEvent
from src.domain.media.types import MediaPresentation, presentation_matches_content_type
from src.domain.messages import Message, create_message


def _idempotent_or_conflict(existing: Message, command: SendMessageDTO) -> MessageDTO:
    conflicts = (
        existing.reply_to_id != command.reply_to_id
        or existing.thread_id != command.thread_id
        or not same_send_fingerprint(
            existing.content,
            command,
        )
    )
    if conflicts:
        raise IdempotencyConflictError("client_message_id was already used with different content")
    return build_message_dto(existing, event_seq=existing.created_seq)


async def _ensure_reply_target(
    *,
    conversation_id: UUID,
    reply_to_id: UUID | None,
    quote_text: str | None,
    history_from_seq: int,
    message_repository: MessageRepository,
) -> None:
    if reply_to_id is None:
        if quote_text is not None:
            raise MessageContentInvalidError("A quote requires a reply target.")
        return
    reply = await message_repository.read(reply_to_id)
    if reply is None or reply.conversation_id != conversation_id or reply.created_seq < history_from_seq:
        raise MessageNotFoundError("Reply target message not found.")
    if quote_text is not None:
        if reply.is_tombstone:
            raise MessageNotFoundError("Quoted message not found.")
        source_text = snapshot_text_from_content(reply.content)
        if quote_text not in source_text and quote_text not in visible_formatted_text(source_text):
            raise MessageContentInvalidError("Quoted text must be a fragment of the original message.")


async def _ensure_media_attachable(
    *,
    blocks: list[tuple[UUID, MediaPresentation]],
    actor: AuthUser,
    organization_id: UUID,
    conversation_id: UUID,
    media_repository: MediaRepository,
) -> list[UUID]:
    unique_ids = list(dict.fromkeys(asset_id for asset_id, _ in blocks))
    for asset_id, presentation in blocks:
        asset = await media_repository.read(asset_id)
        if asset is None:
            raise MediaNotFoundError("Media asset not found.")
        if asset.conversation_id != conversation_id:
            raise MediaNotFoundError("Media asset does not belong to this conversation.")
        asset.ensure_attachable(owner_id=actor.user.id, organization_id=organization_id)
        if not presentation_matches_content_type(presentation, asset.content_type):
            raise MessageContentInvalidError(
                f"Presentation {presentation.value!r} is incompatible with "
                f"content type {asset.content_type!r}."
            )
    return unique_ids


def _message_created_payload(message: Message, *, seq: int, command: SendMessageDTO) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "messageId": str(message.id),
        "createdSeq": seq,
        "senderId": str(message.sender_id),
        "clientMessageId": str(command.client_message_id),
        "revision": message.revision,
        "createdAt": message.created_at.isoformat(),
        "content": message.content,
        "replyToId": str(command.reply_to_id) if command.reply_to_id else None,
    }
    mentions = message.content.get("mentions")
    if mentions:
        payload["mentions"] = mentions
    if command.thread_id is not None:
        payload["threadId"] = str(command.thread_id)
    return payload


async def send_message(
    command: SendMessageDTO,
    *,
    conversation_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    message_repository: MessageRepository,
    event_store: ConversationEventStore,
    media_repository: MediaRepository,
    policy_repository: ConversationPolicyRepository,
    outbox_store: OutboxStore,
    uow: UnitOfWork,
    audit_repository: AuditRepository,
    thread_repository: ThreadRepository | None = None,
) -> MessageDTO:
    conversation, membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )

    base_content = build_message_content(list(command.blocks))
    existing = await message_repository.get_by_client_message_id(
        conversation_id=conversation_id,
        sender_id=actor.user.id,
        client_message_id=command.client_message_id,
    )
    if existing is not None:
        return _idempotent_or_conflict(existing, command)

    forwarded_snapshot = None
    if command.forwarded_from is not None:
        forwarded_snapshot = await resolve_forward_snapshot(
            command.forwarded_from,
            dest_conversation_id=conversation.id,
            dest_organization_id=conversation.organization_id,
            actor=actor,
            actor_membership=membership,
            conversation_repository=conversation_repository,
            membership_repository=membership_repository,
            message_repository=message_repository,
            policy_repository=policy_repository,
        )
    await validate_mentions(
        command,
        conversation_id=conversation.id,
        membership=membership,
        membership_repository=membership_repository,
    )
    content = build_send_content(command, base_content, forwarded_snapshot=forwarded_snapshot)

    if command.thread_id is not None:
        if thread_repository is None:
            from src.application.threads.exceptions import ThreadInvalidError

            raise ThreadInvalidError("Thread repository unavailable.")
        await ensure_thread_sendable(
            conversation_id=conversation_id,
            thread_id=command.thread_id,
            membership_history_from_seq=membership.history_from_seq,
            thread_repository=thread_repository,
            message_repository=message_repository,
        )

    await _ensure_reply_target(
        conversation_id=conversation_id,
        reply_to_id=command.reply_to_id,
        quote_text=command.quote_text.strip() if command.quote_text is not None else None,
        history_from_seq=membership.history_from_seq,
        message_repository=message_repository,
    )
    linked_ids = await _ensure_media_attachable(
        blocks=extract_media_blocks(content),
        actor=actor,
        organization_id=conversation.organization_id,
        conversation_id=conversation.id,
        media_repository=media_repository,
    )

    return await _commit_new_message(
        command,
        conversation=conversation,
        content=content,
        linked_asset_ids=linked_ids,
        actor=actor,
        conversation_repository=conversation_repository,
        message_repository=message_repository,
        event_store=event_store,
        media_repository=media_repository,
        outbox_store=outbox_store,
        uow=uow,
        audit_repository=audit_repository,
    )


async def _commit_new_message(
    command: SendMessageDTO,
    *,
    conversation: Conversation,
    content: dict[str, Any],
    linked_asset_ids: list[UUID],
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    message_repository: MessageRepository,
    event_store: ConversationEventStore,
    media_repository: MediaRepository,
    outbox_store: OutboxStore,
    uow: UnitOfWork,
    audit_repository: AuditRepository,
) -> MessageDTO:
    seq = await conversation_repository.allocate_event_seq(conversation.id)
    message = create_message(
        conversation_id=conversation.id,
        organization_id=conversation.organization_id,
        sender_id=actor.user.id,
        client_message_id=command.client_message_id,
        created_seq=seq,
        content=content,
        reply_to_id=command.reply_to_id,
        thread_id=command.thread_id,
    )

    try:
        await message_repository.create(message)
        if linked_asset_ids:
            await media_repository.link_to_message(
                message_id=message.id,
                asset_ids=linked_asset_ids,
            )
        await event_store.append(
            ConversationEvent(
                conversation_id=conversation.id,
                organization_id=conversation.organization_id,
                seq=seq,
                type="message.created",
                payload=_message_created_payload(message, seq=seq, command=command),
            )
        )
        if command.forwarded_from is not None:
            await log_audit(
                audit_repository,
                organization_id=conversation.organization_id,
                actor_id=actor.user.id,
                action="message.forwarded",
                conversation_id=conversation.id,
                resource_type="message",
                resource_id=str(message.id),
                summary={
                    "sourceConversationId": str(command.forwarded_from.conversation_id),
                    "sourceMessageId": str(command.forwarded_from.message_id),
                },
            )
        await save_events_to_outbox(outbox_store, message)
        await uow.commit()
    except UniqueConstraintViolationError as exc:
        await uow.rollback()
        existing = await message_repository.get_by_client_message_id(
            conversation_id=conversation.id,
            sender_id=actor.user.id,
            client_message_id=command.client_message_id,
        )
        if existing is None:
            raise
        try:
            return _idempotent_or_conflict(existing, command)
        except IdempotencyConflictError as conflict:
            raise conflict from exc

    return build_message_dto(message, event_seq=seq)


def _ensure_edit_window(message: Message, *, config: MessagingConfig) -> None:
    if config.edit_window_seconds == 0:
        return
    age = (datetime.now(UTC) - message.created_at).total_seconds()
    if age > config.edit_window_seconds:
        raise MessageEditWindowExpiredError("Message edit window has expired.")


async def _load_own_message(
    *,
    conversation_id: UUID,
    message_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    message_repository: MessageRepository,
) -> tuple[Conversation, Message]:
    conversation, _membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    message = await message_repository.read(message_id)
    if message is None or message.conversation_id != conversation_id:
        raise MessageNotFoundError("Message not found.")
    if message.sender_id != actor.user.id:
        raise MessageNotFoundError("Message not found.")
    return conversation, message


async def edit_message(
    command: EditMessageDTO,
    *,
    conversation_id: UUID,
    message_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    message_repository: MessageRepository,
    event_store: ConversationEventStore,
    media_repository: MediaRepository,
    outbox_store: OutboxStore,
    uow: UnitOfWork,
    config: MessagingConfig | None = None,
) -> MessageDTO:
    settings = config or MessagingConfig()
    conversation, message = await _load_own_message(
        conversation_id=conversation_id,
        message_id=message_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        message_repository=message_repository,
    )
    _ensure_edit_window(message, config=settings)
    if "poll" in message.content:
        raise MessageContentInvalidError("Published polls cannot be edited.")

    content = build_message_content(list(command.blocks), config=settings)
    for key in ("quoteText", "forwardedFrom", "mentions"):
        if key in message.content:
            content[key] = message.content[key]
    # Validate only: message_media links создаются при send; повторный link на edit дал бы дубли.
    await _ensure_media_attachable(
        blocks=extract_media_blocks(content),
        actor=actor,
        organization_id=conversation.organization_id,
        conversation_id=conversation.id,
        media_repository=media_repository,
    )

    seq = await conversation_repository.allocate_event_seq(conversation.id)
    message.replace_content(content, event_seq=seq)

    await message_repository.update(message)
    await event_store.append(
        ConversationEvent(
            conversation_id=conversation.id,
            organization_id=conversation.organization_id,
            seq=seq,
            type="message.edited",
            payload={
                "messageId": str(message.id),
                "createdSeq": message.created_seq,
                "eventSeq": seq,
                "revision": message.revision,
                "content": message.content,
            },
        )
    )
    await save_events_to_outbox(outbox_store, message)
    await uow.commit()
    return build_message_dto(message, event_seq=seq)


async def delete_message(
    *,
    conversation_id: UUID,
    message_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    message_repository: MessageRepository,
    event_store: ConversationEventStore,
    outbox_store: OutboxStore,
    uow: UnitOfWork,
) -> MessageDTO:
    conversation, message = await _load_own_message(
        conversation_id=conversation_id,
        message_id=message_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        message_repository=message_repository,
    )

    seq = await conversation_repository.allocate_event_seq(conversation.id)
    message.soft_delete(event_seq=seq)

    await message_repository.update(message)
    await event_store.append(
        ConversationEvent(
            conversation_id=conversation.id,
            organization_id=conversation.organization_id,
            seq=seq,
            type="message.deleted",
            payload={
                "messageId": str(message.id),
                "createdSeq": message.created_seq,
                "eventSeq": seq,
            },
        )
    )
    await save_events_to_outbox(outbox_store, message)
    await uow.commit()
    return build_message_dto(message, event_seq=seq)


async def update_read_cursor(
    command: ReadCursorDTO,
    *,
    conversation_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    uow: UnitOfWork,
) -> ReadCursorDTO:
    conversation, membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )

    next_seq, changed = monotonic_receipt_cursor(
        membership.last_read_message_seq,
        command.last_read_message_seq,
        upper_bound=conversation.last_event_seq,
    )

    if changed:
        next_seq = await membership_repository.update_read_cursor(
            conversation_id=conversation_id,
            principal_id=actor.user.id,
            last_read_message_seq=next_seq,
        )
        await uow.commit()

    return ReadCursorDTO(last_read_message_seq=next_seq)


async def update_delivery_cursor(
    command: DeliveryCursorDTO,
    *,
    conversation_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    uow: UnitOfWork,
    publish_delivery_updated: Callable[..., Awaitable[None]],
) -> DeliveryCursorDTO:
    conversation, membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )

    next_seq, changed = monotonic_receipt_cursor(
        membership.last_delivered_message_seq,
        command.last_delivered_message_seq,
        upper_bound=conversation.last_event_seq,
    )

    if changed:
        await membership_repository.update_delivery_cursor(
            conversation_id=conversation_id,
            principal_id=actor.user.id,
            last_delivered_message_seq=next_seq,
        )
        await uow.commit()
        await publish_delivery_updated(
            organization_id=conversation.organization_id,
            conversation_id=conversation.id,
            user_id=actor.user.id,
            last_delivered_message_seq=next_seq,
        )

    return DeliveryCursorDTO(last_delivered_message_seq=next_seq)

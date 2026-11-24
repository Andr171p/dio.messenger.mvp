from datetime import UTC, datetime
from uuid import UUID

from ddf.application.exceptions import UniqueConstraintViolationError
from ddf.application.outbox import OutboxStore, save_events_to_outbox
from ddf.application.uow import UnitOfWork

from src.application.auth import AuthUser
from src.application.auth.exceptions import PermissionDeniedError
from src.application.conversations.commands import require_active_membership
from src.application.conversations.repositories import ConversationRepository, MembershipRepository
from src.application.messaging.enrich import snapshot_text_from_content
from src.application.messaging.exceptions import MessageNotFoundError
from src.application.messaging.formatting import visible_formatted_text
from src.application.messaging.repositories import ConversationEventStore, MessageRepository
from src.application.audit.repositories import AuditRepository
from src.application.audit.service import log_audit
from src.application.pins.dtos import AddPinDTO, PinDTO
from src.application.pins.exceptions import PinNotFoundError
from src.application.pins.repositories import PinRepository
from src.application.policies.helpers import is_guest_membership
from src.domain.events import ConversationEvent
from src.domain.pins import MessagePin


def _to_dto(pin: MessagePin, *, event_seq: int) -> PinDTO:
    return PinDTO(
        id=pin.id,
        conversation_id=pin.conversation_id,
        message_id=pin.message_id,
        pinned_by=pin.pinned_by,
        pinned_at=pin.pinned_at,
        event_seq=event_seq,
    )


async def pin_message(
    command: AddPinDTO,
    *,
    conversation_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    message_repository: MessageRepository,
    pin_repository: PinRepository,
    event_store: ConversationEventStore,
    outbox_store: OutboxStore,
    uow: UnitOfWork,
    audit_repository: AuditRepository | None = None,
) -> PinDTO:
    conversation, membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    if is_guest_membership(membership):
        raise PermissionDeniedError("Guests cannot pin messages.")

    message = await message_repository.read(command.message_id)
    if message is None or message.conversation_id != conversation_id or message.is_tombstone:
        raise MessageNotFoundError("Message not found.")

    existing = await pin_repository.get(
        conversation_id=conversation.id,
        message_id=message.id,
    )
    if existing is not None:
        return _to_dto(existing, event_seq=message.created_seq)

    pinned_at = datetime.now(UTC)
    pin = MessagePin(
        conversation_id=conversation.id,
        organization_id=conversation.organization_id,
        message_id=message.id,
        pinned_by=actor.user.id,
        pinned_at=pinned_at,
        message_created_seq=message.created_seq,
    )
    seq = await conversation_repository.allocate_event_seq(conversation.id)
    pin.mark_pinned(event_seq=seq)

    try:
        await pin_repository.create(pin)
    except UniqueConstraintViolationError:
        await uow.rollback()
        existing = await pin_repository.get(
            conversation_id=conversation.id,
            message_id=message.id,
        )
        if existing is None:
            raise
        return _to_dto(existing, event_seq=message.created_seq)

    await event_store.append(
        ConversationEvent(
            conversation_id=conversation.id,
            organization_id=conversation.organization_id,
            seq=seq,
            type="message.pinned",
            payload={
                "messageId": str(message.id),
                "createdSeq": message.created_seq,
                "eventSeq": seq,
                "pinnedById": str(actor.user.id),
            },
        )
    )
    await save_events_to_outbox(outbox_store, pin)
    if audit_repository is not None:
        await log_audit(
            audit_repository,
            organization_id=conversation.organization_id,
            actor_id=actor.user.id,
            action="message.pinned",
            conversation_id=conversation.id,
            resource_type="message",
            resource_id=str(message.id),
            summary={"eventSeq": seq},
        )
    await uow.commit()
    return _to_dto(pin, event_seq=seq)


async def unpin_message(
    *,
    conversation_id: UUID,
    message_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    message_repository: MessageRepository,
    pin_repository: PinRepository,
    event_store: ConversationEventStore,
    outbox_store: OutboxStore,
    uow: UnitOfWork,
    audit_repository: AuditRepository | None = None,
) -> None:
    conversation, membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    if is_guest_membership(membership):
        raise PermissionDeniedError("Guests cannot pin messages.")

    message = await message_repository.read(message_id)
    if message is None or message.conversation_id != conversation_id:
        raise MessageNotFoundError("Message not found.")

    existing = await pin_repository.get(
        conversation_id=conversation.id,
        message_id=message.id,
    )
    if existing is None:
        raise PinNotFoundError("Pin not found.")

    seq = await conversation_repository.allocate_event_seq(conversation.id)
    existing.message_created_seq = message.created_seq
    existing.mark_unpinned(event_seq=seq, unpinned_by_id=actor.user.id)
    deleted = await pin_repository.delete(
        conversation_id=conversation.id,
        message_id=message.id,
    )
    if deleted is None:
        raise PinNotFoundError("Pin not found.")

    await event_store.append(
        ConversationEvent(
            conversation_id=conversation.id,
            organization_id=conversation.organization_id,
            seq=seq,
            type="message.unpinned",
            payload={
                "messageId": str(message.id),
                "createdSeq": message.created_seq,
                "eventSeq": seq,
                "unpinnedById": str(actor.user.id),
            },
        )
    )
    await save_events_to_outbox(outbox_store, existing)
    if audit_repository is not None:
        await log_audit(
            audit_repository,
            organization_id=conversation.organization_id,
            actor_id=actor.user.id,
            action="message.unpinned",
            conversation_id=conversation.id,
            resource_type="message",
            resource_id=str(message.id),
            summary={"eventSeq": seq},
        )
    await uow.commit()


async def list_pins(
    *,
    conversation_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    pin_repository: PinRepository,
) -> list[PinDTO]:
    _, membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    items = await pin_repository.list_for_conversation(
        conversation_id, history_from_seq=membership.history_from_seq,
    )
    return [
        PinDTO(
            id=item.id,
            conversation_id=item.conversation_id,
            message_id=item.message_id,
            pinned_by=item.pinned_by,
            pinned_at=item.pinned_at,
            event_seq=item.message_created_seq,
            preview=visible_formatted_text(snapshot_text_from_content(content), hide_spoilers=True)[:160],
        )
        for item, content in items
    ]

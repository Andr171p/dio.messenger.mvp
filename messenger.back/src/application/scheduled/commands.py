from datetime import UTC, datetime
from uuid import UUID

from ddf.application.exceptions import UniqueConstraintViolationError
from ddf.application.uow import UnitOfWork

from src.application.auth import AuthUser
from src.application.conversations.commands import require_active_membership
from src.application.conversations.repositories import ConversationRepository, MembershipRepository
from src.application.scheduled.dtos import CreateScheduledMessageDTO, ScheduledMessageDTO
from src.application.scheduled.exceptions import ScheduledMessageInvalidError, ScheduledMessageNotFoundError
from src.application.scheduled.repositories import ScheduledMessageRepository
from src.domain.scheduled import ScheduledMessage, ScheduledMessageStatus


def _to_dto(entity: ScheduledMessage) -> ScheduledMessageDTO:
    return ScheduledMessageDTO(
        id=entity.id,
        conversation_id=entity.conversation_id,
        sender_id=entity.sender_id,
        send_at=entity.send_at,
        status=entity.status.value,
        client_message_id=entity.client_message_id,
        payload=entity.payload,
    )


async def create_scheduled_message(
    command: CreateScheduledMessageDTO,
    *,
    conversation_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    scheduled_repository: ScheduledMessageRepository,
    uow: UnitOfWork,
) -> ScheduledMessageDTO:
    conversation, _ = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )

    send_at = command.send_at
    if send_at.tzinfo is None:
        send_at = send_at.replace(tzinfo=UTC)
    if send_at <= datetime.now(UTC):
        raise ScheduledMessageInvalidError("sendAt must be in the future.")

    payload = command.message.model_dump(mode="json", by_alias=True)
    entity = ScheduledMessage(
        conversation_id=conversation.id,
        organization_id=conversation.organization_id,
        sender_id=actor.user.id,
        payload=payload,
        send_at=send_at,
        client_message_id=command.message.client_message_id,
    )

    try:
        await scheduled_repository.create(entity)
        await uow.commit()
    except UniqueConstraintViolationError:
        await uow.rollback()
        raise ScheduledMessageInvalidError(
            "client_message_id already scheduled in this conversation."
        ) from None

    return _to_dto(entity)


async def list_scheduled_messages(
    *,
    conversation_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    scheduled_repository: ScheduledMessageRepository,
) -> list[ScheduledMessageDTO]:
    await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    items = await scheduled_repository.list_pending_for_conversation(
        conversation_id,
        sender_id=actor.user.id,
    )
    return [_to_dto(item) for item in items]


async def cancel_scheduled_message(
    *,
    conversation_id: UUID,
    scheduled_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    scheduled_repository: ScheduledMessageRepository,
    uow: UnitOfWork,
) -> ScheduledMessageDTO:
    await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )

    entity = await scheduled_repository.read(scheduled_id)
    if entity is None or entity.conversation_id != conversation_id:
        raise ScheduledMessageNotFoundError("Scheduled message not found.")
    if entity.sender_id != actor.user.id:
        raise ScheduledMessageNotFoundError("Scheduled message not found.")
    if entity.status is not ScheduledMessageStatus.PENDING:
        return _to_dto(entity)

    entity.mark_cancelled()
    await scheduled_repository.update(entity)
    await uow.commit()
    return _to_dto(entity)

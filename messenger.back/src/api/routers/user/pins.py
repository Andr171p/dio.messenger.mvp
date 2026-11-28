from uuid import UUID

from fastapi import APIRouter, status

from src.api.dependencies.audit import AuditRepositoryDep
from src.api.dependencies.auth import CurrentUser
from src.api.dependencies.conversations import ConversationRepositoryDep, MembershipRepositoryDep
from src.api.dependencies.db import DBSession, OutboxDep
from src.api.dependencies.messaging import ConversationEventStoreDep, MessageRepositoryDep
from src.api.dependencies.pins import PinRepositoryDep
from src.application.pins import commands
from src.application.pins.dtos import AddPinDTO, PinDTO

router = APIRouter(prefix="/v1/conversations", tags=["pins"])


@router.post(
    "/{conversation_id}/pins",
    status_code=status.HTTP_201_CREATED,
    summary="Закрепить сообщение",
)
async def pin_message(
    conversation_id: UUID,
    dto: AddPinDTO,
    auth: CurrentUser,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    message_repository: MessageRepositoryDep,
    pin_repository: PinRepositoryDep,
    event_store: ConversationEventStoreDep,
    outbox_store: OutboxDep,
    audit_repository: AuditRepositoryDep,
) -> PinDTO:
    return await commands.pin_message(
        dto,
        conversation_id=conversation_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        message_repository=message_repository,
        pin_repository=pin_repository,
        event_store=event_store,
        outbox_store=outbox_store,
        uow=session,
        audit_repository=audit_repository,
    )


@router.delete(
    "/{conversation_id}/messages/{message_id}/pins",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Снять закрепление",
)
async def unpin_message(
    conversation_id: UUID,
    message_id: UUID,
    auth: CurrentUser,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    message_repository: MessageRepositoryDep,
    pin_repository: PinRepositoryDep,
    event_store: ConversationEventStoreDep,
    outbox_store: OutboxDep,
    audit_repository: AuditRepositoryDep,
) -> None:
    await commands.unpin_message(
        conversation_id=conversation_id,
        message_id=message_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        message_repository=message_repository,
        pin_repository=pin_repository,
        event_store=event_store,
        outbox_store=outbox_store,
        uow=session,
        audit_repository=audit_repository,
    )


@router.get(
    "/{conversation_id}/pins",
    status_code=status.HTTP_200_OK,
    summary="Список закреплённых сообщений",
)
async def list_pins(
    conversation_id: UUID,
    auth: CurrentUser,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    pin_repository: PinRepositoryDep,
) -> list[PinDTO]:
    return await commands.list_pins(
        conversation_id=conversation_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        pin_repository=pin_repository,
    )

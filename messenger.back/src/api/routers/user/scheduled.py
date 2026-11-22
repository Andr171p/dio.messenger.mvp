from uuid import UUID

from fastapi import APIRouter, status

from src.api.dependencies.auth import CurrentUser
from src.api.dependencies.conversations import ConversationRepositoryDep, MembershipRepositoryDep
from src.api.dependencies.db import DBSession
from src.api.dependencies.scheduled import ScheduledMessageRepositoryDep
from src.application.scheduled import commands
from src.application.scheduled.dtos import CreateScheduledMessageDTO, ScheduledMessageDTO

router = APIRouter(prefix="/v1/conversations", tags=["scheduled-messages"])


@router.post(
    "/{conversation_id}/scheduled-messages",
    status_code=status.HTTP_201_CREATED,
    summary="Запланировать отправку сообщения",
)
async def create_scheduled_message(
    conversation_id: UUID,
    dto: CreateScheduledMessageDTO,
    auth: CurrentUser,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    scheduled_repository: ScheduledMessageRepositoryDep,
) -> ScheduledMessageDTO:
    return await commands.create_scheduled_message(
        dto,
        conversation_id=conversation_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        scheduled_repository=scheduled_repository,
        uow=session,
    )


@router.get(
    "/{conversation_id}/scheduled-messages",
    status_code=status.HTTP_200_OK,
    summary="Список ожидающих отложенных сообщений автора",
)
async def list_scheduled_messages(
    conversation_id: UUID,
    auth: CurrentUser,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    scheduled_repository: ScheduledMessageRepositoryDep,
) -> list[ScheduledMessageDTO]:
    return await commands.list_scheduled_messages(
        conversation_id=conversation_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        scheduled_repository=scheduled_repository,
    )


@router.delete(
    "/{conversation_id}/scheduled-messages/{scheduled_id}",
    status_code=status.HTTP_200_OK,
    summary="Отменить отложенное сообщение",
)
async def cancel_scheduled_message(
    conversation_id: UUID,
    scheduled_id: UUID,
    auth: CurrentUser,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    scheduled_repository: ScheduledMessageRepositoryDep,
) -> ScheduledMessageDTO:
    return await commands.cancel_scheduled_message(
        conversation_id=conversation_id,
        scheduled_id=scheduled_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        scheduled_repository=scheduled_repository,
        uow=session,
    )
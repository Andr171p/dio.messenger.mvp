from uuid import UUID

from fastapi import APIRouter, status

from src.api.dependencies.auth import CurrentUser
from src.api.dependencies.conversations import ConversationRepositoryDep, MembershipRepositoryDep
from src.api.dependencies.db import DBSession, OutboxDep
from src.api.dependencies.media import MediaRepositoryDep
from src.api.dependencies.messaging import ConversationEventStoreDep, MessageRepositoryDep
from src.api.dependencies.polls import PollRepositoryDep
from src.api.dependencies.threads import ThreadRepositoryDep
from src.application.polls import commands
from src.application.polls.dtos import CreatePollDTO, PollDTO, VotePollDTO

router = APIRouter(prefix="/v1/conversations", tags=["polls"])


@router.post(
    "/{conversation_id}/polls",
    status_code=status.HTTP_201_CREATED,
    summary="Создать опрос (сообщение с poll block)",
)
async def create_poll(
    conversation_id: UUID,
    dto: CreatePollDTO,
    auth: CurrentUser,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    message_repository: MessageRepositoryDep,
    event_store: ConversationEventStoreDep,
    poll_repository: PollRepositoryDep,
    media_repository: MediaRepositoryDep,
    thread_repository: ThreadRepositoryDep,
    outbox_store: OutboxDep,
) -> PollDTO:
    return await commands.create_poll_message(
        dto,
        conversation_id=conversation_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        message_repository=message_repository,
        event_store=event_store,
        poll_repository=poll_repository,
        media_repository=media_repository,
        thread_repository=thread_repository,
        outbox_store=outbox_store,
        uow=session,
    )


@router.post(
    "/{conversation_id}/polls/{poll_id}/votes",
    status_code=status.HTTP_200_OK,
    summary="Проголосовать в опросе",
)
async def vote_poll(
    conversation_id: UUID,
    poll_id: UUID,
    dto: VotePollDTO,
    auth: CurrentUser,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    poll_repository: PollRepositoryDep,
    message_repository: MessageRepositoryDep,
    event_store: ConversationEventStoreDep,
    outbox_store: OutboxDep,
) -> PollDTO:
    return await commands.vote_poll(
        dto,
        conversation_id=conversation_id,
        poll_id=poll_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        poll_repository=poll_repository,
        message_repository=message_repository,
        event_store=event_store,
        outbox_store=outbox_store,
        uow=session,
    )


@router.post(
    "/{conversation_id}/polls/{poll_id}/close",
    status_code=status.HTTP_200_OK,
    summary="Закрыть опрос",
)
async def close_poll(
    conversation_id: UUID,
    poll_id: UUID,
    auth: CurrentUser,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    poll_repository: PollRepositoryDep,
    message_repository: MessageRepositoryDep,
    event_store: ConversationEventStoreDep,
    outbox_store: OutboxDep,
) -> PollDTO:
    return await commands.close_poll(
        conversation_id=conversation_id,
        poll_id=poll_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        poll_repository=poll_repository,
        message_repository=message_repository,
        event_store=event_store,
        outbox_store=outbox_store,
        uow=session,
    )
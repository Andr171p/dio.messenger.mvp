from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from src.api.dependencies.auth import CurrentUser
from src.api.dependencies.conversations import ConversationRepositoryDep, MembershipRepositoryDep
from src.api.dependencies.db import DBSession, OutboxDep
from src.api.dependencies.media import MediaRepositoryDep
from src.api.dependencies.messaging import ConversationEventStoreDep, MessageRepositoryDep
from src.api.dependencies.polls import PollRepositoryDep
from src.api.dependencies.threads import ThreadRepositoryDep
from src.application.polls import commands
from src.application.polls.dtos import CreatePollDTO, PollDTO, VotePollDTO
from src.application.auth.exceptions import PermissionDeniedError
from src.domain.conversations import Conversation
from src.domain.memberships import ConversationMembership
from src.domain.messages import Message
from src.domain.polls import Poll

router = APIRouter(prefix="/v1/conversations", tags=["polls"])


async def visible_poll(
    conversation_id: UUID, poll_id: UUID, auth: CurrentUser,
    conversation_repository: ConversationRepositoryDep, membership_repository: MembershipRepositoryDep,
    poll_repository: PollRepositoryDep, message_repository: MessageRepositoryDep,
) -> tuple[Conversation, ConversationMembership, Poll, Message]:
    return await commands.get_visible_poll(
        conversation_id=conversation_id, poll_id=poll_id, actor=auth,
        conversation_repository=conversation_repository, membership_repository=membership_repository,
        poll_repository=poll_repository, message_repository=message_repository,
    )


VisiblePoll = Annotated[tuple[Conversation, ConversationMembership, Poll, Message], Depends(visible_poll)]


@router.get("/{conversation_id}/polls/{poll_id}")
async def get_poll(visible: VisiblePoll, auth: CurrentUser, poll_repository: PollRepositoryDep) -> PollDTO:
    conversation, _, poll, _ = visible
    return await commands.poll_state(
        poll, event_seq=conversation.last_event_seq, voter_id=auth.user.id, poll_repository=poll_repository,
    )


@router.get("/{conversation_id}/polls/{poll_id}/voters")
async def get_poll_voters(
    visible: VisiblePoll, membership_repository: MembershipRepositoryDep, poll_repository: PollRepositoryDep,
) -> dict[UUID, list[UUID]]:
    conversation, _, poll, message = visible
    if not poll.show_voters:
        raise PermissionDeniedError("This poll is anonymous.")
    active = await membership_repository.list_active(conversation.id)
    recipients = {member.principal_id for member in active if member.history_from_seq <= message.created_seq}
    result: dict[UUID, list[UUID]] = {}
    for option, voter in await poll_repository.list_votes_for_poll(poll.id):
        if voter in recipients:
            result.setdefault(option, []).append(voter)
    return result


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

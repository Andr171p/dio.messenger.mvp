from uuid import UUID

from fastapi import APIRouter, status

from src.api.dependencies.auth import CurrentUser
from src.api.dependencies.conversations import ConversationRepositoryDep, MembershipRepositoryDep
from src.api.dependencies.db import DBSession, OutboxDep
from src.api.dependencies.messaging import ConversationEventStoreDep, MessageRepositoryDep
from src.api.dependencies.reactions import ReactionRepositoryDep
from src.application.reactions import commands
from src.application.reactions.dtos import AddReactionDTO, ReactionDTO, ReactionSummaryDTO

router = APIRouter(prefix="/v1/conversations", tags=["reactions"])


@router.post(
    "/{conversation_id}/reactions",
    status_code=status.HTTP_201_CREATED,
    summary="Добавить реакцию на сообщение",
)
async def add_reaction(
    conversation_id: UUID,
    dto: AddReactionDTO,
    auth: CurrentUser,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    message_repository: MessageRepositoryDep,
    reaction_repository: ReactionRepositoryDep,
    event_store: ConversationEventStoreDep,
    outbox_store: OutboxDep,
) -> ReactionDTO:
    return await commands.add_reaction(
        dto,
        conversation_id=conversation_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        message_repository=message_repository,
        reaction_repository=reaction_repository,
        event_store=event_store,
        outbox_store=outbox_store,
        uow=session,
    )


@router.delete(
    "/{conversation_id}/messages/{message_id}/reactions/{emoji}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Снять свою реакцию",
)
async def remove_reaction(
    conversation_id: UUID,
    message_id: UUID,
    emoji: str,
    auth: CurrentUser,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    message_repository: MessageRepositoryDep,
    reaction_repository: ReactionRepositoryDep,
    event_store: ConversationEventStoreDep,
    outbox_store: OutboxDep,
) -> None:
    await commands.remove_reaction(
        conversation_id=conversation_id,
        message_id=message_id,
        emoji=emoji,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        message_repository=message_repository,
        reaction_repository=reaction_repository,
        event_store=event_store,
        outbox_store=outbox_store,
        uow=session,
    )


@router.get(
    "/{conversation_id}/messages/{message_id}/reactions",
    status_code=status.HTTP_200_OK,
    summary="Сводка реакций на сообщение",
)
async def list_reactions(
    conversation_id: UUID,
    message_id: UUID,
    auth: CurrentUser,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    message_repository: MessageRepositoryDep,
    reaction_repository: ReactionRepositoryDep,
) -> list[ReactionSummaryDTO]:
    return await commands.list_reaction_summaries(
        conversation_id=conversation_id,
        message_id=message_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        message_repository=message_repository,
        reaction_repository=reaction_repository,
    )

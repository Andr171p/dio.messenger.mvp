from uuid import UUID

from fastapi import APIRouter, status

from src.api.dependencies.auth import CurrentUser
from src.api.dependencies.conversations import ConversationRepositoryDep, MembershipRepositoryDep
from src.api.dependencies.db import DBSession, OutboxDep
from src.api.dependencies.messaging import ConversationEventStoreDep, MessageRepositoryDep
from src.api.dependencies.threads import ThreadRepositoryDep
from src.application.threads import commands
from src.application.threads.dtos import CreateThreadDTO, RenameThreadDTO, ThreadDTO

router = APIRouter(prefix="/v1/conversations", tags=["threads"])


@router.post(
    "/{conversation_id}/threads",
    status_code=status.HTTP_201_CREATED,
    summary="Создать тред от корневого сообщения",
)
async def create_thread(
    conversation_id: UUID,
    dto: CreateThreadDTO,
    auth: CurrentUser,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    message_repository: MessageRepositoryDep,
    thread_repository: ThreadRepositoryDep,
    event_store: ConversationEventStoreDep,
    outbox_store: OutboxDep,
) -> ThreadDTO:
    return await commands.create_conversation_thread(
        dto,
        conversation_id=conversation_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        message_repository=message_repository,
        thread_repository=thread_repository,
        event_store=event_store,
        outbox_store=outbox_store,
        uow=session,
    )


@router.get(
    "/{conversation_id}/threads",
    status_code=status.HTTP_200_OK,
    summary="Список тредов беседы",
)
async def list_threads(
    conversation_id: UUID,
    auth: CurrentUser,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    thread_repository: ThreadRepositoryDep,
) -> list[ThreadDTO]:
    return await commands.list_conversation_threads(
        conversation_id=conversation_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        thread_repository=thread_repository,
    )


@router.patch("/{conversation_id}/threads/{thread_id}")
async def rename_thread(
    conversation_id: UUID,
    thread_id: UUID,
    dto: RenameThreadDTO,
    auth: CurrentUser,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    thread_repository: ThreadRepositoryDep,
) -> ThreadDTO:
    return await commands.manage_thread(
        conversation_id,
        thread_id,
        title=dto.title,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        thread_repository=thread_repository,
        uow=session,
    )


@router.delete("/{conversation_id}/threads/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_thread(
    conversation_id: UUID,
    thread_id: UUID,
    auth: CurrentUser,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    thread_repository: ThreadRepositoryDep,
) -> None:
    await commands.manage_thread(
        conversation_id,
        thread_id,
        title=None,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        thread_repository=thread_repository,
        uow=session,
    )

from uuid import UUID

from ddf.application.exceptions import UniqueConstraintViolationError
from ddf.application.outbox import OutboxStore, save_events_to_outbox
from ddf.application.uow import UnitOfWork

from src.application.auth import AuthUser
from src.application.conversations.commands import require_active_membership
from src.application.conversations.repositories import ConversationRepository, MembershipRepository
from src.application.messaging.exceptions import MessageNotFoundError
from src.application.messaging.repositories import ConversationEventStore, MessageRepository
from src.application.threads.dtos import CreateThreadDTO, ThreadDTO
from src.application.threads.exceptions import ThreadInvalidError, ThreadNotFoundError
from src.application.threads.repositories import ThreadRepository
from src.domain.events import ConversationEvent
from src.domain.threads import ConversationThread, create_thread


def _to_dto(thread: ConversationThread, *, event_seq: int) -> ThreadDTO:
    return ThreadDTO(
        id=thread.id,
        conversation_id=thread.conversation_id,
        root_message_id=thread.root_message_id,
        title=thread.title,
        created_by=thread.created_by,
        created_at=thread.created_at,
        event_seq=event_seq,
    )


async def create_conversation_thread(
    command: CreateThreadDTO,
    *,
    conversation_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    message_repository: MessageRepository,
    thread_repository: ThreadRepository,
    event_store: ConversationEventStore,
    outbox_store: OutboxStore,
    uow: UnitOfWork,
) -> ThreadDTO:
    conversation, membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )

    root = await message_repository.read(command.root_message_id)
    if root is None or root.conversation_id != conversation_id or root.is_tombstone:
        raise MessageNotFoundError("Root message not found.")
    if root.created_seq < membership.history_from_seq:
        raise ThreadInvalidError("Root message is outside your history visibility.")

    existing = await thread_repository.get_by_root(
        conversation_id=conversation_id,
        root_message_id=root.id,
    )
    if existing is not None:
        return _to_dto(existing, event_seq=root.created_seq)

    thread = create_thread(
        conversation_id=conversation.id,
        organization_id=conversation.organization_id,
        root_message_id=root.id,
        created_by=actor.user.id,
        root_message_created_seq=root.created_seq,
        title=command.title,
    )
    seq = await conversation_repository.allocate_event_seq(conversation.id)
    thread.root_message_created_seq = root.created_seq
    thread.mark_created(event_seq=seq)

    try:
        await thread_repository.create(thread)
    except UniqueConstraintViolationError:
        await uow.rollback()
        existing = await thread_repository.get_by_root(
            conversation_id=conversation_id,
            root_message_id=root.id,
        )
        if existing is None:
            raise
        return _to_dto(existing, event_seq=root.created_seq)

    await event_store.append(
        ConversationEvent(
            conversation_id=conversation.id,
            organization_id=conversation.organization_id,
            seq=seq,
            type="thread.created",
            payload={
                "threadId": str(thread.id),
                "rootMessageId": str(root.id),
                "createdSeq": root.created_seq,
                "eventSeq": seq,
                "createdBy": str(actor.user.id),
                "title": thread.title,
            },
        )
    )
    await save_events_to_outbox(outbox_store, thread)
    await uow.commit()
    return _to_dto(thread, event_seq=seq)


async def list_conversation_threads(
    *,
    conversation_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    thread_repository: ThreadRepository,
) -> list[ThreadDTO]:
    _conversation, membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    items = await thread_repository.list_for_conversation(
        conversation_id,
        history_from_seq=membership.history_from_seq,
    )
    return [
        ThreadDTO(
            id=item.id,
            conversation_id=item.conversation_id,
            root_message_id=item.root_message_id,
            title=item.title,
            created_by=item.created_by,
            created_at=item.created_at,
            event_seq=item.root_message_created_seq,
        )
        for item in items
    ]


async def ensure_thread_sendable(
    *,
    conversation_id: UUID,
    thread_id: UUID,
    membership_history_from_seq: int,
    thread_repository: ThreadRepository,
    message_repository: MessageRepository,
) -> ConversationThread:
    thread = await thread_repository.read(thread_id)
    if thread is None or thread.conversation_id != conversation_id:
        raise ThreadNotFoundError("Thread not found.")
    root = await message_repository.read(thread.root_message_id)
    if root is None or root.created_seq < membership_history_from_seq:
        raise ThreadInvalidError("Thread root is outside your history visibility.")
    return thread
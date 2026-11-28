from uuid import UUID

from src.application.auth import AuthUser
from src.application.auth.exceptions import PermissionDeniedError
from src.application.conversations.commands import require_active_membership
from src.application.conversations.repositories import ConversationRepository, MembershipRepository
from src.application.messaging.builders import build_conversation_event_dto, build_history_message_dtos
from src.application.messaging.dtos import (
    ConversationEventDTO,
    MessageDTO,
    MessageReaderDTO,
    MessageReadersDTO,
    MessageReceiptSummaryDTO,
)
from src.application.messaging.exceptions import MessageNotFoundError, SnapshotRequiredError
from src.application.messaging.repositories import ConversationEventStore, MessageRepository
from src.application.reactions.repositories import ReactionRepository
from src.domain.memberships import ConversationMembership
from src.domain.messages import Message
from src.infra.observability.metrics import inc_sync_gap

DEFAULT_PAGE_LIMIT = 50
MAX_PAGE_LIMIT = 100


def _eligible_recipients(
    message: Message, members: list[ConversationMembership]
) -> list[ConversationMembership]:
    return [
        member
        for member in members
        if member.principal_id != message.sender_id
        and member.joined_at <= message.created_at
        and member.history_from_seq <= message.created_seq
    ]


async def get_receipt_summaries(
    conversation_id: UUID,
    message_ids: list[UUID],
    *,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    message_repository: MessageRepository,
) -> dict[UUID, MessageReceiptSummaryDTO]:
    _, membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    members = await membership_repository.list_active(conversation_id)
    result = {}
    for message in await message_repository.list_by_ids(conversation_id, message_ids):
        if message.sender_id != actor.user.id or message.created_seq < membership.history_from_seq:
            continue
        eligible = _eligible_recipients(message, members)
        result[message.id] = MessageReceiptSummaryDTO(
            total=len(eligible),
            seen=sum(member.last_read_message_seq >= message.created_seq for member in eligible),
            delivered=any(member.last_delivered_message_seq >= message.created_seq for member in eligible),
        )
    return result


async def get_message_readers(
    conversation_id: UUID,
    message_id: UUID,
    *,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    message_repository: MessageRepository,
    offset: int,
    limit: int,
) -> MessageReadersDTO:
    _, membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    message = await message_repository.read(message_id)
    if (
        message is None
        or message.conversation_id != conversation_id
        or message.deleted_at is not None
        or message.created_seq < membership.history_from_seq
    ):
        raise MessageNotFoundError("Message not found.")
    if message.sender_id != actor.user.id:
        raise PermissionDeniedError("Only the message author can view readers.")
    eligible = _eligible_recipients(message, await membership_repository.list_active(conversation_id))
    readers = sorted(
        (member for member in eligible if member.last_read_message_seq >= message.created_seq),
        key=lambda member: member.principal_id,
    )
    page = readers[offset : offset + limit]
    times = await membership_repository.read_times([member.id for member in page], message.created_seq)
    return MessageReadersDTO(
        read_count=len(readers),
        eligible_count=len(eligible),
        readers=[
            MessageReaderDTO(user_id=member.principal_id, read_at=times.get(member.id)) for member in page
        ],
        next_offset=offset + limit if offset + limit < len(readers) else None,
    )


async def get_history(
    conversation_id: UUID,
    *,
    actor: AuthUser,
    before_seq: int | None = None,
    thread_id: UUID | None = None,
    main_only: bool = False,
    around_message_id: UUID | None = None,
    limit: int = DEFAULT_PAGE_LIMIT,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    message_repository: MessageRepository,
    reaction_repository: ReactionRepository | None = None,
) -> list[MessageDTO]:
    _, membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )

    if around_message_id is not None:
        target = await message_repository.read(around_message_id)
        if (
            target is None
            or target.conversation_id != conversation_id
            or target.created_seq < membership.history_from_seq
        ):
            raise MessageNotFoundError("Message not found.")
        before_seq = target.created_seq + 1

    page_limit = min(max(limit, 1), MAX_PAGE_LIMIT)
    items = await message_repository.get_history(
        conversation_id=conversation_id,
        before_seq=before_seq,
        thread_id=thread_id,
        main_only=main_only,
        history_from_seq=membership.history_from_seq,
        limit=page_limit,
    )
    return await build_history_message_dtos(items, reaction_repository)


async def get_events(
    conversation_id: UUID,
    *,
    actor: AuthUser,
    after_seq: int,
    limit: int = DEFAULT_PAGE_LIMIT,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    event_store: ConversationEventStore,
) -> list[ConversationEventDTO]:
    _, membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )

    page_limit = min(max(limit, 1), MAX_PAGE_LIMIT)
    min_seq = await event_store.min_seq(conversation_id)
    if min_seq is not None and after_seq + 1 < min_seq:
        inc_sync_gap()
        raise SnapshotRequiredError("Event cursor is older than retention horizon.")

    items = await event_store.get_after(
        conversation_id=conversation_id,
        after_seq=after_seq,
        history_from_seq=membership.history_from_seq,
        limit=page_limit,
    )
    return [build_conversation_event_dto(item) for item in items]

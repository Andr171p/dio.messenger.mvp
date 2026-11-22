from uuid import UUID

from src.application.auth import AuthUser
from src.application.conversations.commands import require_active_membership
from src.application.conversations.repositories import ConversationRepository, MembershipRepository
from src.application.messaging.builders import build_conversation_event_dto, build_message_dto
from src.application.messaging.dtos import ConversationEventDTO, MessageDTO
from src.application.messaging.exceptions import SnapshotRequiredError
from src.infra.observability.metrics import inc_sync_gap
from src.application.messaging.repositories import ConversationEventStore, MessageRepository

DEFAULT_PAGE_LIMIT = 50
MAX_PAGE_LIMIT = 100


async def get_history(
    conversation_id: UUID,
    *,
    actor: AuthUser,
    before_seq: int | None = None,
    limit: int = DEFAULT_PAGE_LIMIT,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    message_repository: MessageRepository,
) -> list[MessageDTO]:
    _, membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )

    page_limit = min(max(limit, 1), MAX_PAGE_LIMIT)
    items = await message_repository.get_history(
        conversation_id=conversation_id,
        before_seq=before_seq,
        history_from_seq=membership.history_from_seq,
        limit=page_limit,
    )
    return [build_message_dto(item) for item in items]


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

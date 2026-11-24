from uuid import UUID

from src.application.auth import AuthUser
from src.application.conversations.commands import require_active_membership
from src.application.conversations.repositories import ConversationRepository, MembershipRepository
from src.application.messaging.builders import build_history_message_dtos
from src.application.reactions.repositories import ReactionRepository
from src.application.messaging.queries import DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT
from src.application.messaging.repositories import MessageRepository
from src.application.sync.dtos import (
    ConversationSnapshotDTO,
    SnapshotConversationDTO,
    SnapshotMembershipDTO,
    SyncManifestDTO,
    SyncManifestEntryDTO,
)
from src.domain.memberships import MemberRole
from src.infra.observability.metrics import inc_snapshot_reset


async def get_sync_manifest(
    *,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
) -> SyncManifestDTO:
    conversations = await conversation_repository.list_for_principal(
        organization_id=actor.user.organization_id,
        principal_id=actor.user.id,
    )

    entries: list[SyncManifestEntryDTO] = []
    for conversation in conversations:
        membership = await membership_repository.get_active(
            conversation_id=conversation.id,
            principal_id=actor.user.id,
        )
        if membership is None:
            continue

        entries.append(
            SyncManifestEntryDTO(
                conversation_id=conversation.id,
                last_event_seq=conversation.last_event_seq,
                history_from_seq=membership.history_from_seq,
                last_read_message_seq=membership.last_read_message_seq,
                last_delivered_message_seq=membership.last_delivered_message_seq,
            )
        )

    return SyncManifestDTO(conversations=entries)


async def get_conversation_snapshot(
    conversation_id: UUID,
    *,
    actor: AuthUser,
    message_limit: int = DEFAULT_PAGE_LIMIT,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    message_repository: MessageRepository,
    reaction_repository: ReactionRepository | None = None,
) -> ConversationSnapshotDTO:
    conversation, membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )

    page_limit = min(max(message_limit, 1), MAX_PAGE_LIMIT)
    # Берём page_limit+1, чтобы понять truncated без отдельного COUNT.
    page = await message_repository.get_history(
        conversation_id=conversation.id,
        before_seq=None,
        history_from_seq=membership.history_from_seq,
        limit=page_limit + 1,
    )
    truncated = len(page) > page_limit
    messages = page[-page_limit:] if truncated else page

    has_external = await membership_repository.has_role(conversation.id, role=MemberRole.GUEST)
    inc_snapshot_reset()
    return ConversationSnapshotDTO(
        conversation=SnapshotConversationDTO(
            id=conversation.id,
            organization_id=conversation.organization_id,
            type=conversation.type,
            title=conversation.title,
            last_event_seq=conversation.last_event_seq,
            created_by=conversation.created_by,
            has_external_members=has_external,
        ),
        membership=SnapshotMembershipDTO(
            history_from_seq=membership.history_from_seq,
            last_read_message_seq=membership.last_read_message_seq,
            last_delivered_message_seq=membership.last_delivered_message_seq,
        ),
        snapshot_event_seq=conversation.last_event_seq,
        messages=await build_history_message_dtos(messages, reaction_repository),
        messages_truncated=truncated,
        message_limit=page_limit,
    )

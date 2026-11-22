from collections import Counter
from uuid import UUID

from ddf.application.exceptions import UniqueConstraintViolationError
from ddf.application.outbox import OutboxStore, save_events_to_outbox
from ddf.application.uow import UnitOfWork

from src.application.auth import AuthUser
from src.application.conversations.commands import require_active_membership
from src.application.conversations.repositories import ConversationRepository, MembershipRepository
from src.application.messaging.exceptions import MessageNotFoundError
from src.application.messaging.repositories import ConversationEventStore, MessageRepository
from src.application.reactions.dtos import AddReactionDTO, ReactionDTO, ReactionSummaryDTO
from src.application.reactions.exceptions import ReactionInvalidError, ReactionNotFoundError
from src.application.reactions.repositories import ReactionRepository
from src.domain.events import ConversationEvent
from src.domain.reactions import MessageReaction

_MAX_EMOJI_LEN = 32


def _normalize_emoji(emoji: str) -> str:
    normalized = emoji.strip()
    if not normalized or len(normalized) > _MAX_EMOJI_LEN:
        raise ReactionInvalidError("Emoji must be 1..32 characters.")
    if any(ch.isspace() for ch in normalized):
        raise ReactionInvalidError("Emoji must not contain whitespace.")
    return normalized


def _to_dto(reaction: MessageReaction, *, event_seq: int) -> ReactionDTO:
    return ReactionDTO(
        message_id=reaction.message_id,
        conversation_id=reaction.conversation_id,
        actor_id=reaction.actor_id,
        emoji=reaction.emoji,
        event_seq=event_seq,
        created_at=reaction.created_at,
    )


async def add_reaction(
    command: AddReactionDTO,
    *,
    conversation_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    message_repository: MessageRepository,
    reaction_repository: ReactionRepository,
    event_store: ConversationEventStore,
    outbox_store: OutboxStore,
    uow: UnitOfWork,
) -> ReactionDTO:
    conversation, _ = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    emoji = _normalize_emoji(command.emoji)

    message = await message_repository.read(command.message_id)
    if message is None or message.conversation_id != conversation_id or message.is_tombstone:
        raise MessageNotFoundError("Message not found.")

    existing = await reaction_repository.get(
        message_id=message.id,
        actor_id=actor.user.id,
        emoji=emoji,
    )
    if existing is not None:
        return _to_dto(existing, event_seq=message.created_seq)

    reaction = MessageReaction(
        message_id=message.id,
        conversation_id=conversation.id,
        organization_id=conversation.organization_id,
        actor_id=actor.user.id,
        emoji=emoji,
        message_created_seq=message.created_seq,
    )
    seq = await conversation_repository.allocate_event_seq(conversation.id)
    reaction.mark_added(event_seq=seq)

    try:
        await reaction_repository.create(reaction)
    except UniqueConstraintViolationError:
        await uow.rollback()
        existing = await reaction_repository.get(
            message_id=message.id,
            actor_id=actor.user.id,
            emoji=emoji,
        )
        if existing is None:
            raise
        return _to_dto(existing, event_seq=message.created_seq)

    await event_store.append(
        ConversationEvent(
            conversation_id=conversation.id,
            organization_id=conversation.organization_id,
            seq=seq,
            type="reaction.added",
            payload={
                "messageId": str(message.id),
                "createdSeq": message.created_seq,
                "eventSeq": seq,
                "actorId": str(actor.user.id),
                "emoji": emoji,
            },
        )
    )
    await save_events_to_outbox(outbox_store, reaction)
    await uow.commit()
    return _to_dto(reaction, event_seq=seq)


async def remove_reaction(
    *,
    conversation_id: UUID,
    message_id: UUID,
    emoji: str,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    message_repository: MessageRepository,
    reaction_repository: ReactionRepository,
    event_store: ConversationEventStore,
    outbox_store: OutboxStore,
    uow: UnitOfWork,
) -> None:
    conversation, _ = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    normalized = _normalize_emoji(emoji)

    message = await message_repository.read(message_id)
    if message is None or message.conversation_id != conversation_id:
        raise MessageNotFoundError("Message not found.")

    existing = await reaction_repository.get(
        message_id=message.id,
        actor_id=actor.user.id,
        emoji=normalized,
    )
    if existing is None:
        raise ReactionNotFoundError("Reaction not found.")

    seq = await conversation_repository.allocate_event_seq(conversation.id)
    existing.message_created_seq = message.created_seq
    existing.mark_removed(event_seq=seq)
    deleted = await reaction_repository.delete(
        message_id=message.id,
        actor_id=actor.user.id,
        emoji=normalized,
    )
    if deleted is None:
        raise ReactionNotFoundError("Reaction not found.")

    await event_store.append(
        ConversationEvent(
            conversation_id=conversation.id,
            organization_id=conversation.organization_id,
            seq=seq,
            type="reaction.removed",
            payload={
                "messageId": str(message.id),
                "createdSeq": message.created_seq,
                "eventSeq": seq,
                "actorId": str(actor.user.id),
                "emoji": normalized,
            },
        )
    )
    await save_events_to_outbox(outbox_store, existing)
    await uow.commit()


async def list_reaction_summaries(
    *,
    conversation_id: UUID,
    message_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    message_repository: MessageRepository,
    reaction_repository: ReactionRepository,
) -> list[ReactionSummaryDTO]:
    await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    message = await message_repository.read(message_id)
    if message is None or message.conversation_id != conversation_id:
        raise MessageNotFoundError("Message not found.")

    items = await reaction_repository.list_for_message(message_id)
    counts = Counter(item.emoji for item in items)
    mine = {item.emoji for item in items if item.actor_id == actor.user.id}
    return [
        ReactionSummaryDTO(emoji=emoji, count=count, reacted_by_me=emoji in mine)
        for emoji, count in sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))
    ]

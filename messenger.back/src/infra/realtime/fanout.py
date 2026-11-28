"""Маппинг доменных событий → compact realtime payload + публикация в conversation room."""

from typing import Any

from datetime import UTC
from uuid import UUID

from ddf.application.events import deserialize_event
from ddf.application.realtime import Event, RealtimePublisher
from ddf.domain.events import Event as DomainEvent

from src.domain.memberships.events import MemberJoined, MemberRemoved
from src.domain.messages.events import MessageCreated, MessageDeleted, MessageEdited
from src.domain.pins.events import MessagePinned, MessageUnpinned
from src.domain.polls.events import PollClosed, PollCreated, PollVoted
from src.domain.reactions.events import ReactionAdded, ReactionRemoved
from src.domain.threads.events import ThreadCreated
from src.infra.realtime.rooms import conversation_room, user_room
from src.infra.realtime.sessions import build_access_revoked_event

REALTIME_FANOUT_QUEUE = "messenger.realtime.fanout"


def to_realtime_event(domain_event: DomainEvent) -> Event[dict[str, Any]] | None:  # noqa: C901, PLR0911
    """Строит compact WS-событие. Неизвестный тип — None (игнор)."""

    if isinstance(domain_event, MessageCreated):
        payload = {
            "conversationId": str(domain_event.conversation_id),
            "eventSeq": domain_event.event_seq,
            "messageId": str(domain_event.message_id),
            "createdSeq": domain_event.created_seq,
            "senderId": str(domain_event.sender_id),
            "clientMessageId": str(domain_event.client_message_id),
        }
        if domain_event.thread_id is not None:
            payload["threadId"] = str(domain_event.thread_id)
        return Event(
            id=domain_event.event_id,
            type=domain_event.event_type,
            payload=payload,
            version=domain_event.version,
            occurred_at=domain_event.occurred_on,
        )

    if isinstance(domain_event, MessageEdited):
        payload = {
            "conversationId": str(domain_event.conversation_id),
            "eventSeq": domain_event.event_seq,
            "messageId": str(domain_event.message_id),
            "createdSeq": domain_event.created_seq,
            "revision": domain_event.revision,
        }
        return Event(
            id=domain_event.event_id,
            type=domain_event.event_type,
            payload=payload,
            version=domain_event.version,
            occurred_at=domain_event.occurred_on,
        )

    if isinstance(domain_event, MessageDeleted):
        payload = {
            "conversationId": str(domain_event.conversation_id),
            "eventSeq": domain_event.event_seq,
            "messageId": str(domain_event.message_id),
            "createdSeq": domain_event.created_seq,
        }
        return Event(
            id=domain_event.event_id,
            type=domain_event.event_type,
            payload=payload,
            version=domain_event.version,
            occurred_at=domain_event.occurred_on,
        )

    if isinstance(domain_event, ReactionAdded | ReactionRemoved):
        payload = {
            "conversationId": str(domain_event.conversation_id),
            "eventSeq": domain_event.event_seq,
            "messageId": str(domain_event.message_id),
            "createdSeq": domain_event.created_seq,
            "actorId": str(domain_event.actor_id),
            "emoji": domain_event.emoji,
        }
        return Event(
            id=domain_event.event_id,
            type=domain_event.event_type,
            payload=payload,
            version=domain_event.version,
            occurred_at=domain_event.occurred_on,
        )

    if isinstance(domain_event, MessagePinned):
        payload = {
            "conversationId": str(domain_event.conversation_id),
            "eventSeq": domain_event.event_seq,
            "messageId": str(domain_event.message_id),
            "createdSeq": domain_event.created_seq,
            "pinnedById": str(domain_event.pinned_by_id),
        }
        return Event(
            id=domain_event.event_id,
            type=domain_event.event_type,
            payload=payload,
            version=domain_event.version,
            occurred_at=domain_event.occurred_on,
        )

    if isinstance(domain_event, MessageUnpinned):
        payload = {
            "conversationId": str(domain_event.conversation_id),
            "eventSeq": domain_event.event_seq,
            "messageId": str(domain_event.message_id),
            "createdSeq": domain_event.created_seq,
            "unpinnedById": str(domain_event.unpinned_by_id),
        }
        return Event(
            id=domain_event.event_id,
            type=domain_event.event_type,
            payload=payload,
            version=domain_event.version,
            occurred_at=domain_event.occurred_on,
        )

    if isinstance(domain_event, ThreadCreated):
        payload = {
            "conversationId": str(domain_event.conversation_id),
            "eventSeq": domain_event.event_seq,
            "threadId": str(domain_event.thread_id),
            "rootMessageId": str(domain_event.root_message_id) if domain_event.root_message_id else None,
            "createdBy": str(domain_event.created_by),
        }
        if domain_event.title:
            payload["title"] = domain_event.title
        return Event(
            id=domain_event.event_id,
            type=domain_event.event_type,
            payload=payload,
            version=domain_event.version,
            occurred_at=domain_event.occurred_on,
        )

    if isinstance(domain_event, PollCreated):
        payload = {
            "conversationId": str(domain_event.conversation_id),
            "eventSeq": domain_event.event_seq,
            "pollId": str(domain_event.poll_id),
            "messageId": str(domain_event.message_id),
            "createdSeq": domain_event.message_created_seq,
            "createdBy": str(domain_event.created_by),
        }
        return Event(
            id=domain_event.event_id,
            type=domain_event.event_type,
            payload=payload,
            version=domain_event.version,
            occurred_at=domain_event.occurred_on,
        )

    if isinstance(domain_event, PollVoted):
        payload = {
            "conversationId": str(domain_event.conversation_id),
            "eventSeq": domain_event.event_seq,
            "pollId": str(domain_event.poll_id),
            "messageId": str(domain_event.message_id),
            "createdSeq": domain_event.message_created_seq,
        }
        return Event(
            id=domain_event.event_id,
            type=domain_event.event_type,
            payload=payload,
            version=domain_event.version,
            occurred_at=domain_event.occurred_on,
        )

    if isinstance(domain_event, PollClosed):
        payload = {
            "conversationId": str(domain_event.conversation_id),
            "eventSeq": domain_event.event_seq,
            "pollId": str(domain_event.poll_id),
            "messageId": str(domain_event.message_id),
            "createdSeq": domain_event.message_created_seq,
            "closedBy": str(domain_event.closed_by),
        }
        return Event(
            id=domain_event.event_id,
            type=domain_event.event_type,
            payload=payload,
            version=domain_event.version,
            occurred_at=domain_event.occurred_on,
        )

    if isinstance(domain_event, MemberJoined):
        payload = {
            "conversationId": str(domain_event.conversation_id),
            "eventSeq": domain_event.event_seq,
            "principalId": str(domain_event.principal_id),
            "historyFromSeq": domain_event.history_from_seq,
        }
        return Event(
            id=domain_event.event_id,
            type=domain_event.event_type,
            payload=payload,
            version=domain_event.version,
            occurred_at=domain_event.occurred_on,
        )

    if isinstance(domain_event, MemberRemoved):
        payload = {
            "conversationId": str(domain_event.conversation_id),
            "eventSeq": domain_event.event_seq,
            "principalId": str(domain_event.principal_id),
            "removedById": str(domain_event.removed_by_id),
        }
        return Event(
            id=domain_event.event_id,
            type=domain_event.event_type,
            payload=payload,
            version=domain_event.version,
            occurred_at=domain_event.occurred_on,
        )

    return None


def conversation_id_of(domain_event: DomainEvent) -> UUID | None:
    conversation_id = getattr(domain_event, "conversation_id", None)
    return conversation_id if isinstance(conversation_id, UUID) else None


def _ensure_aware(event: Event[dict[str, Any]]) -> Event[dict[str, Any]]:
    occurred_at = event.occurred_at
    if occurred_at.tzinfo is not None:
        return event
    return Event(
        id=event.id,
        type=event.type,
        payload=event.payload,
        version=event.version,
        occurred_at=occurred_at.replace(tzinfo=UTC),
    )


async def publish_domain_event_payload(
    *,
    event_type: str,
    payload: dict[str, Any],
    publisher: RealtimePublisher[Any],
) -> None:
    domain_event = deserialize_event(event_type, payload)
    realtime_event = to_realtime_event(domain_event)
    conversation_id = conversation_id_of(domain_event)
    if realtime_event is None or conversation_id is None:
        return

    realtime_event = _ensure_aware(realtime_event)
    await publisher(realtime_event, to=conversation_room(conversation_id))

    if isinstance(domain_event, MemberRemoved):
        user = user_room(
            organization_id=domain_event.organization_id,
            user_id=domain_event.principal_id,
        )
        await publisher(realtime_event, to=user)
        await publisher(
            build_access_revoked_event(
                organization_id=domain_event.organization_id,
                conversation_id=domain_event.conversation_id,
                principal_id=domain_event.principal_id,
            ),
            to=user,
        )

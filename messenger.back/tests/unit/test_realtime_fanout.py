from uuid import uuid4

from src.domain.memberships.events import MemberJoined, MemberRemoved
from src.domain.messages.events import MessageCreated, MessageDeleted, MessageEdited
from src.domain.reactions.events import ReactionAdded
from src.infra.realtime.fanout import to_realtime_event


def test_message_created_maps_to_compact_realtime_event() -> None:
    conversation_id = uuid4()
    event = MessageCreated(
        organization_id=uuid4(),
        conversation_id=conversation_id,
        message_id=uuid4(),
        created_seq=3,
        event_seq=3,
        sender_id=uuid4(),
        client_message_id=uuid4(),
    )
    realtime = to_realtime_event(event)
    assert realtime is not None
    assert realtime.type == "message.created"
    assert realtime.payload["conversationId"] == str(conversation_id)
    assert realtime.payload["eventSeq"] == 3


def test_edited_and_deleted_include_event_seq() -> None:
    edited = MessageEdited(
        organization_id=uuid4(),
        conversation_id=uuid4(),
        message_id=uuid4(),
        created_seq=1,
        event_seq=4,
        revision=2,
    )
    deleted = MessageDeleted(
        organization_id=uuid4(),
        conversation_id=uuid4(),
        message_id=uuid4(),
        created_seq=1,
        event_seq=5,
    )
    assert to_realtime_event(edited) is not None
    assert to_realtime_event(edited).payload["eventSeq"] == 4
    assert to_realtime_event(deleted).payload["eventSeq"] == 5


def test_reaction_added_maps() -> None:
    event = ReactionAdded(
        organization_id=uuid4(),
        conversation_id=uuid4(),
        message_id=uuid4(),
        created_seq=2,
        event_seq=9,
        actor_id=uuid4(),
        emoji="👍",
    )
    realtime = to_realtime_event(event)
    assert realtime is not None
    assert realtime.type == "reaction.added"
    assert realtime.payload["emoji"] == "👍"
    assert realtime.payload["eventSeq"] == 9


def test_member_joined_maps() -> None:
    conversation_id = uuid4()
    event = MemberJoined(
        organization_id=uuid4(),
        conversation_id=conversation_id,
        principal_id=uuid4(),
        event_seq=4,
        history_from_seq=4,
    )
    realtime = to_realtime_event(event)
    assert realtime is not None
    assert realtime.type == "member.joined"
    assert realtime.payload["conversationId"] == str(conversation_id)
    assert realtime.payload["historyFromSeq"] == 4


def test_member_removed_maps() -> None:
    conversation_id = uuid4()
    principal_id = uuid4()
    event = MemberRemoved(
        organization_id=uuid4(),
        conversation_id=conversation_id,
        principal_id=principal_id,
        event_seq=5,
        removed_by_id=uuid4(),
    )
    realtime = to_realtime_event(event)
    assert realtime is not None
    assert realtime.type == "member.removed"
    assert realtime.payload["principalId"] == str(principal_id)
    assert realtime.payload["eventSeq"] == 5

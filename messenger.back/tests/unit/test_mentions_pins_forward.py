import asyncio
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from src.application.auth.exceptions import PermissionDeniedError
from src.application.messaging.content import same_send_fingerprint
from src.application.messaging.dtos import ForwardedFromRefDTO, SendMessageDTO, TextBlock
from src.application.messaging.enrich import (
    apply_mentions_to_content,
    build_send_content,
    snapshot_text_from_content,
)
from src.application.messaging.validate_send import validate_mentions
from src.domain.memberships import ConversationMembership, MemberRole
from src.domain.pins import MessagePin
from src.domain.pins.events import MessagePinned, MessageUnpinned
from src.infra.realtime.fanout import to_realtime_event


def test_apply_mentions_to_content() -> None:
    principal = uuid4()
    base = {"blocks": [{"type": "text", "text": "hi"}]}
    enriched = apply_mentions_to_content(
        base,
        principal_ids=[principal],
        mention_all=False,
    )
    assert enriched["mentions"] == {"principalIds": [str(principal)], "all": False}


def test_snapshot_text_from_content() -> None:
    content = {
        "blocks": [
            {"type": "text", "text": "line1"},
            {"type": "media", "assetId": str(uuid4())},
            {"type": "text", "text": "line2"},
        ]
    }
    assert snapshot_text_from_content(content) == "line1\nline2"


def test_build_send_content_with_forward() -> None:
    command = SendMessageDTO(
        client_message_id=uuid4(),
        blocks=[TextBlock(text="fwd")],
        forwarded_from=ForwardedFromRefDTO(conversation_id=uuid4(), message_id=uuid4()),
    )
    base = {"blocks": [{"type": "text", "text": "fwd"}]}
    snap = {"conversationId": "a", "messageId": "b", "text": "orig"}
    content = build_send_content(command, base, forwarded_snapshot=snap)
    assert content["forwardedFrom"] == snap


def test_validate_mentions_guest_cannot_mention_all() -> None:
    membership = ConversationMembership(
        conversation_id=uuid4(),
        organization_id=uuid4(),
        principal_id=uuid4(),
        role=MemberRole.GUEST,
        joined_at=datetime.now(UTC),
    )
    command = SendMessageDTO(client_message_id=uuid4(), blocks=[TextBlock(text="x")], mention_all=True)

    class _Repo:
        async def list_active(self, conversation_id):  # noqa: ARG002
            return [membership]

    with pytest.raises(PermissionDeniedError):
        asyncio.run(
            validate_mentions(
                command,
                conversation_id=membership.conversation_id,
                membership=membership,
                membership_repository=_Repo(),  # type: ignore[arg-type]
            )
        )


def test_same_send_fingerprint_includes_mentions() -> None:
    pid = uuid4()
    command = SendMessageDTO(
        client_message_id=uuid4(),
        blocks=[TextBlock(text="hi")],
        mentions=[pid],
    )
    content = apply_mentions_to_content(
        {"blocks": [{"type": "text", "text": "hi"}]},
        principal_ids=[pid],
        mention_all=False,
    )
    assert same_send_fingerprint(content, command) is True


def test_pin_domain_registers_events() -> None:
    pin = MessagePin(
        conversation_id=uuid4(),
        organization_id=uuid4(),
        message_id=uuid4(),
        pinned_by=uuid4(),
        pinned_at=datetime.now(UTC),
        message_created_seq=2,
    )
    pin.mark_pinned(event_seq=8)
    events = list(pin.collect_events())
    assert len(events) == 1
    assert events[0].event_type == "message.pinned"


def test_pin_unpinned_fanout() -> None:
    event = MessageUnpinned(
        organization_id=uuid4(),
        conversation_id=uuid4(),
        message_id=uuid4(),
        created_seq=1,
        event_seq=3,
        unpinned_by_id=uuid4(),
    )
    realtime = to_realtime_event(event)
    assert realtime is not None
    assert realtime.type == "message.unpinned"
    assert realtime.payload["eventSeq"] == 3


def test_message_pinned_fanout() -> None:
    event = MessagePinned(
        organization_id=uuid4(),
        conversation_id=uuid4(),
        message_id=uuid4(),
        created_seq=1,
        event_seq=2,
        pinned_by_id=uuid4(),
    )
    realtime = to_realtime_event(event)
    assert realtime is not None
    assert realtime.type == "message.pinned"
    assert "pinnedById" in realtime.payload
from uuid import uuid4

import pytest

from src.application.messaging.content import build_message_content
from src.application.messaging.dtos import MediaBlock, TextBlock
from src.application.messaging.exceptions import EmptyMessageError
from src.domain.messages import MessageAlreadyDeletedError, create_message


def test_build_message_content_requires_blocks() -> None:
    with pytest.raises(EmptyMessageError):
        build_message_content([])

    content = build_message_content([TextBlock(text="  hello  ")])
    assert content == {"blocks": [{"type": "text", "text": "hello"}]}


def test_build_message_content_with_media() -> None:
    asset_id = uuid4()
    content = build_message_content(
        [
            TextBlock(text="see this"),
            MediaBlock(asset_id=asset_id),
        ]
    )
    assert content == {
        "blocks": [
            {"type": "text", "text": "see this"},
            {"type": "media", "assetId": str(asset_id)},
        ]
    }


def test_create_message_registers_event() -> None:
    conversation_id = uuid4()
    message = create_message(
        conversation_id=conversation_id,
        organization_id=uuid4(),
        sender_id=uuid4(),
        client_message_id=uuid4(),
        created_seq=1,
        content={"blocks": [{"type": "text", "text": "ping"}]},
    )
    events = list(message.collect_events())
    assert len(events) == 1
    assert events[0].event_type == "message.created"


def test_soft_delete_is_state_invariant() -> None:
    message = create_message(
        conversation_id=uuid4(),
        organization_id=uuid4(),
        sender_id=uuid4(),
        client_message_id=uuid4(),
        created_seq=1,
        content={"blocks": [{"type": "text", "text": "x"}]},
    )
    list(message.collect_events())
    message.soft_delete(event_seq=2)
    with pytest.raises(MessageAlreadyDeletedError):
        message.soft_delete(event_seq=3)

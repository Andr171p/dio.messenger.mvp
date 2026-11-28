from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.application.messaging.commands import _ensure_reply_target
from src.application.messaging.content import same_send_fingerprint
from src.application.messaging.dtos import SendMessageDTO
from src.application.messaging.enrich import build_send_content
from src.application.messaging.exceptions import MessageContentInvalidError, MessageNotFoundError


@pytest.mark.asyncio
async def test_quote_is_verified_against_visible_original() -> None:
    conversation_id = uuid4()
    source = SimpleNamespace(
        conversation_id=conversation_id,
        created_seq=8,
        is_tombstone=False,
        content={"blocks": [{"type": "text", "text": "Check VPN access first."}]},
    )
    repo = SimpleNamespace(read=AsyncMock(return_value=source))
    kwargs = {"conversation_id": conversation_id, "reply_to_id": uuid4(), "message_repository": repo}

    await _ensure_reply_target(**kwargs, quote_text="VPN access", history_from_seq=8)
    with pytest.raises(MessageContentInvalidError):
        await _ensure_reply_target(**kwargs, quote_text="fabricated", history_from_seq=8)
    with pytest.raises(MessageNotFoundError):
        await _ensure_reply_target(**kwargs, quote_text="VPN access", history_from_seq=9)
    source.conversation_id = uuid4()
    with pytest.raises(MessageNotFoundError):
        await _ensure_reply_target(**kwargs, quote_text="VPN access", history_from_seq=8)
    source.conversation_id = conversation_id
    source.is_tombstone = True
    with pytest.raises(MessageNotFoundError):
        await _ensure_reply_target(**kwargs, quote_text="VPN access", history_from_seq=8)
    with pytest.raises(MessageContentInvalidError):
        await _ensure_reply_target(
            **{**kwargs, "reply_to_id": None}, quote_text="VPN access", history_from_seq=8
        )


def test_quote_preserves_snapshot_and_is_part_of_idempotency() -> None:
    body = [{"type": "text", "text": "I checked."}]
    request = SendMessageDTO.model_validate(
        {
            "clientMessageId": uuid4(),
            "replyToId": uuid4(),
            "quoteText": " VPN access ",
            "blocks": body,
        }
    )
    content = build_send_content(request, {"blocks": body}, forwarded_snapshot=None)
    assert content == {"blocks": body, "quoteText": "VPN access"}
    assert same_send_fingerprint(content, request)
    assert not same_send_fingerprint(content, request.model_copy(update={"quote_text": "VPN"}))

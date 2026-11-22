from uuid import uuid4

import pytest

from src.application.reactions.commands import _normalize_emoji
from src.application.reactions.exceptions import ReactionInvalidError
from src.domain.reactions import MessageReaction


def test_normalize_emoji() -> None:
    assert _normalize_emoji(" 👍 ") == "👍"
    with pytest.raises(ReactionInvalidError):
        _normalize_emoji("")
    with pytest.raises(ReactionInvalidError):
        _normalize_emoji("a b")


def test_reaction_registers_events() -> None:
    reaction = MessageReaction(
        message_id=uuid4(),
        conversation_id=uuid4(),
        organization_id=uuid4(),
        actor_id=uuid4(),
        emoji="🔥",
        message_created_seq=3,
    )
    reaction.mark_added(event_seq=10)
    events = list(reaction.collect_events())
    assert len(events) == 1
    assert events[0].event_type == "reaction.added"
    assert events[0].event_seq == 10

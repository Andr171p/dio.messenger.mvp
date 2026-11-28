from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.application.auth.exceptions import PermissionDeniedError
from src.application.threads.commands import manage_thread
from src.domain.memberships import MemberRole
from src.domain.polls import Poll, create_poll
from src.domain.polls.events import PollClosed, PollCreated, PollVoted
from src.domain.polls.exceptions import PollClosedError, PollInvalidError
from src.domain.scheduled import ScheduledMessage, ScheduledMessageStatus
from src.domain.threads import ConversationThread, create_thread
from src.domain.threads.events import ThreadCreated
from src.infra.realtime.fanout import to_realtime_event


def test_create_thread_registers_event() -> None:
    thread = create_thread(
        conversation_id=uuid4(),
        organization_id=uuid4(),
        root_message_id=uuid4(),
        created_by=uuid4(),
        root_message_created_seq=5,
        title="  Topic  ",
    )
    assert thread.title == "Topic"
    thread.mark_created(event_seq=6)
    events = list(thread.collect_events())
    assert len(events) == 1
    assert isinstance(events[0], ThreadCreated)
    assert events[0].event_seq == 6


def test_create_poll_validates_options() -> None:
    with pytest.raises(PollInvalidError):
        create_poll(
            message_id=uuid4(),
            conversation_id=uuid4(),
            organization_id=uuid4(),
            question="?",
            option_labels=["only"],
            created_by=uuid4(),
            message_created_seq=1,
        )


def test_poll_vote_and_close_domain_events() -> None:
    poll = create_poll(
        message_id=uuid4(),
        conversation_id=uuid4(),
        organization_id=uuid4(),
        question="Pick one",
        option_labels=["A", "B"],
        created_by=uuid4(),
        message_created_seq=3,
    )
    poll.message_created_seq = 3
    poll.mark_created(event_seq=4)
    option_id = poll.options[0].id
    assert option_id is not None
    poll.record_vote(event_seq=5, voter_id=uuid4(), option_id=option_id)
    poll.close(event_seq=6, closed_by=poll.created_by)

    types = [type(e) for e in poll.collect_events()]
    assert PollCreated in types
    assert PollVoted in types
    assert PollClosed in types


def test_poll_cannot_vote_when_closed() -> None:
    poll = create_poll(
        message_id=uuid4(),
        conversation_id=uuid4(),
        organization_id=uuid4(),
        question="Q",
        option_labels=["A", "B"],
        created_by=uuid4(),
        message_created_seq=1,
    )
    poll.is_closed = True
    with pytest.raises(PollClosedError):
        poll.record_vote(event_seq=2, voter_id=uuid4(), option_id=poll.options[0].id)  # type: ignore[arg-type]


def test_scheduled_message_cancel() -> None:
    entity = ScheduledMessage(
        conversation_id=uuid4(),
        organization_id=uuid4(),
        sender_id=uuid4(),
        payload={"clientMessageId": str(uuid4()), "blocks": [{"type": "text", "text": "hi"}]},
        send_at=datetime.now(UTC) + timedelta(hours=1),
        client_message_id=uuid4(),
    )
    entity.mark_cancelled()
    assert entity.status is ScheduledMessageStatus.CANCELLED


def test_fanout_maps_poll_created() -> None:
    thread = ConversationThread(
        conversation_id=uuid4(),
        organization_id=uuid4(),
        root_message_id=uuid4(),
        created_by=uuid4(),
    )
    thread.mark_created(event_seq=2)
    evt = next(iter(thread.collect_events()))
    mapped = to_realtime_event(evt)
    assert mapped is not None
    assert mapped.type == "thread.created"
    assert "threadId" in mapped.payload


@pytest.mark.parametrize(
    ("role", "author", "title", "allowed"),
    [
        (MemberRole.MEMBER, True, "Renamed", True),
        (MemberRole.MEMBER, True, None, False),
        (MemberRole.ADMIN, False, None, False),
        (MemberRole.OWNER, False, None, True),
    ],
)
async def test_manage_thread_permissions(monkeypatch, role, author, title, allowed):
    actor = SimpleNamespace(user=SimpleNamespace(id=uuid4()))
    thread = create_thread(
        conversation_id=uuid4(),
        organization_id=uuid4(),
        root_message_id=None,
        created_by=actor.user.id if author else uuid4(),
        root_message_created_seq=1,
        title="Original",
    )
    monkeypatch.setattr(
        "src.application.threads.commands.require_active_membership",
        AsyncMock(return_value=(None, SimpleNamespace(role=role))),
    )
    repository = SimpleNamespace(read=AsyncMock(return_value=thread), update=AsyncMock(return_value=True))
    uow = SimpleNamespace(commit=AsyncMock())
    operation = manage_thread(
        thread.conversation_id,
        thread.id,
        title=title,
        actor=actor,
        conversation_repository=None,
        membership_repository=None,
        thread_repository=repository,
        uow=uow,
    )
    if allowed:
        await operation
        assert (thread.deleted_at is not None) == (title is None)
        if title is not None:
            assert thread.title == title
        uow.commit.assert_awaited_once()
    else:
        with pytest.raises(PermissionDeniedError):
            await operation
        repository.update.assert_not_awaited()

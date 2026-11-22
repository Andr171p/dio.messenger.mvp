from typing import ClassVar

from dataclasses import dataclass
from uuid import UUID

from ddf.domain.events import Event


@dataclass(kw_only=True, frozen=True)
class PollCreated(Event):
    event_type: ClassVar[str] = "poll.created"

    organization_id: UUID
    conversation_id: UUID
    poll_id: UUID
    message_id: UUID
    message_created_seq: int
    event_seq: int
    created_by: UUID


@dataclass(kw_only=True, frozen=True)
class PollVoted(Event):
    event_type: ClassVar[str] = "poll.voted"

    organization_id: UUID
    conversation_id: UUID
    poll_id: UUID
    message_id: UUID
    message_created_seq: int
    event_seq: int
    voter_id: UUID
    option_id: UUID


@dataclass(kw_only=True, frozen=True)
class PollClosed(Event):
    event_type: ClassVar[str] = "poll.closed"

    organization_id: UUID
    conversation_id: UUID
    poll_id: UUID
    message_id: UUID
    message_created_seq: int
    event_seq: int
    closed_by: UUID
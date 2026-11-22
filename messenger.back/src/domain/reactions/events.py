from typing import ClassVar

from dataclasses import dataclass
from uuid import UUID

from ddf.domain.events import Event


@dataclass(kw_only=True, frozen=True)
class ReactionAdded(Event):
    event_type: ClassVar[str] = "reaction.added"

    organization_id: UUID
    conversation_id: UUID
    message_id: UUID
    created_seq: int
    event_seq: int
    actor_id: UUID
    emoji: str


@dataclass(kw_only=True, frozen=True)
class ReactionRemoved(Event):
    event_type: ClassVar[str] = "reaction.removed"

    organization_id: UUID
    conversation_id: UUID
    message_id: UUID
    created_seq: int
    event_seq: int
    actor_id: UUID
    emoji: str

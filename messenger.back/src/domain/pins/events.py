from typing import ClassVar

from dataclasses import dataclass
from uuid import UUID

from ddf.domain.events import Event


@dataclass(kw_only=True, frozen=True)
class MessagePinned(Event):
    event_type: ClassVar[str] = "message.pinned"

    organization_id: UUID
    conversation_id: UUID
    message_id: UUID
    created_seq: int
    event_seq: int
    pinned_by_id: UUID


@dataclass(kw_only=True, frozen=True)
class MessageUnpinned(Event):
    event_type: ClassVar[str] = "message.unpinned"

    organization_id: UUID
    conversation_id: UUID
    message_id: UUID
    created_seq: int
    event_seq: int
    unpinned_by_id: UUID

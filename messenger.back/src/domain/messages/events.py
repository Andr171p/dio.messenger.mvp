from typing import ClassVar

from dataclasses import dataclass
from uuid import UUID

from ddf.domain.events import Event


@dataclass(kw_only=True, frozen=True)
class MessageCreated(Event):
    event_type: ClassVar[str] = "message.created"

    organization_id: UUID
    conversation_id: UUID
    message_id: UUID
    created_seq: int
    event_seq: int
    sender_id: UUID
    client_message_id: UUID
    thread_id: UUID | None = None


@dataclass(kw_only=True, frozen=True)
class MessageEdited(Event):
    event_type: ClassVar[str] = "message.edited"

    organization_id: UUID
    conversation_id: UUID
    message_id: UUID
    created_seq: int
    event_seq: int
    revision: int


@dataclass(kw_only=True, frozen=True)
class MessageDeleted(Event):
    event_type: ClassVar[str] = "message.deleted"

    organization_id: UUID
    conversation_id: UUID
    message_id: UUID
    created_seq: int
    event_seq: int

from typing import ClassVar

from dataclasses import dataclass
from uuid import UUID

from ddf.domain.events import Event


@dataclass(kw_only=True, frozen=True)
class ThreadCreated(Event):
    event_type: ClassVar[str] = "thread.created"

    organization_id: UUID
    conversation_id: UUID
    thread_id: UUID
    root_message_id: UUID
    event_seq: int
    created_by: UUID
    title: str | None = None
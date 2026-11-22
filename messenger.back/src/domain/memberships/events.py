from typing import ClassVar

from dataclasses import dataclass
from uuid import UUID

from ddf.domain.events import Event


@dataclass(kw_only=True, frozen=True)
class MemberJoined(Event):
    event_type: ClassVar[str] = "member.joined"

    organization_id: UUID
    conversation_id: UUID
    principal_id: UUID
    event_seq: int
    history_from_seq: int


@dataclass(kw_only=True, frozen=True)
class MemberRemoved(Event):
    event_type: ClassVar[str] = "member.removed"

    organization_id: UUID
    conversation_id: UUID
    principal_id: UUID
    event_seq: int
    removed_by_id: UUID

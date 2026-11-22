from dataclasses import dataclass
from uuid import UUID

from ddf.domain.models import AggregateRoot

from .types import ConversationType


@dataclass(kw_only=True)
class Conversation(AggregateRoot):
    """Беседа: lifecycle, конфигурация и high-water mark durable events."""

    organization_id: UUID
    type: ConversationType
    title: str | None = None
    created_by: UUID
    last_event_seq: int = 0

from typing import Any

from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID, uuid7


@dataclass(kw_only=True, frozen=True)
class ConversationEvent:
    """Durable изменение беседы для Sync API. Не полный Event Sourcing."""

    id: UUID = field(default_factory=uuid7)
    conversation_id: UUID
    organization_id: UUID
    seq: int
    type: str
    payload: dict[str, Any]
    occurred_at: datetime = field(default_factory=lambda: datetime.now(UTC))

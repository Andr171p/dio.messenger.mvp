from typing import Protocol

from datetime import datetime
from uuid import UUID

from src.domain.scheduled import ScheduledMessage


class ScheduledMessageRepository(Protocol):
    async def create(self, entity: ScheduledMessage) -> ScheduledMessage: ...

    async def read(self, scheduled_id: UUID) -> ScheduledMessage | None: ...

    async def list_pending_for_conversation(
        self,
        conversation_id: UUID,
        *,
        sender_id: UUID | None = None,
    ) -> list[ScheduledMessage]: ...

    async def update(self, entity: ScheduledMessage) -> None: ...

    async def claim_due(self, *, limit: int, now: datetime | None = None) -> list[ScheduledMessage]: ...

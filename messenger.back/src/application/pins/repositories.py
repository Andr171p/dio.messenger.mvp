from typing import Any, Protocol

from uuid import UUID

from src.domain.pins import MessagePin


class PinRepository(Protocol):
    async def create(self, entity: MessagePin) -> MessagePin: ...

    async def get(
        self,
        *,
        conversation_id: UUID,
        message_id: UUID,
    ) -> MessagePin | None: ...

    async def delete(
        self,
        *,
        conversation_id: UUID,
        message_id: UUID,
    ) -> MessagePin | None: ...

    async def list_for_conversation(
        self,
        conversation_id: UUID,
        *,
        history_from_seq: int,
    ) -> list[tuple[MessagePin, dict[str, Any]]]: ...

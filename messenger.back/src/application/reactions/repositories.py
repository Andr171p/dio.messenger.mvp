from typing import Protocol

from uuid import UUID

from src.domain.reactions import MessageReaction


class ReactionRepository(Protocol):
    async def create(self, entity: MessageReaction) -> MessageReaction: ...

    async def get(
        self,
        *,
        message_id: UUID,
        actor_id: UUID,
        emoji: str,
    ) -> MessageReaction | None: ...

    async def delete(
        self,
        *,
        message_id: UUID,
        actor_id: UUID,
        emoji: str,
    ) -> MessageReaction | None: ...

    async def list_for_message(self, message_id: UUID) -> list[MessageReaction]: ...

from typing import Protocol

from uuid import UUID

from src.application.search.dtos import MessageSearchCriteria, SearchMessageHitDTO


class MessageSearchRepository(Protocol):
    async def search(self, criteria: MessageSearchCriteria) -> list[SearchMessageHitDTO]: ...

    async def search_in_conversation(
        self,
        *,
        conversation_id: UUID,
        criteria: MessageSearchCriteria,
    ) -> list[SearchMessageHitDTO]: ...
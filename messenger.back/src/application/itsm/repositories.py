from typing import Protocol
from uuid import UUID

from src.domain.itsm import ContextLink


class ContextLinkRepository(Protocol):
    async def create(self, entity: ContextLink) -> ContextLink: ...

    async def get_by_conversation(self, conversation_id: UUID) -> ContextLink | None: ...

    async def get_by_resource(
        self,
        *,
        organization_id: UUID,
        provider: str,
        resource_type: str,
        resource_id: str,
    ) -> ContextLink | None: ...

    async def delete(self, entity: ContextLink) -> None: ...

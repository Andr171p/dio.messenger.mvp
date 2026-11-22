from typing import Any, Protocol
from uuid import UUID

from src.domain.audit import AuditEvent


class AuditRepository(Protocol):
    async def append(self, event: AuditEvent) -> AuditEvent: ...

    async def list_for_conversation(
        self,
        *,
        organization_id: UUID,
        conversation_id: UUID,
        limit: int,
    ) -> list[AuditEvent]: ...
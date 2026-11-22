from typing import Any, Protocol
from uuid import UUID

from src.application.itsm.dtos import ResourceActionResultDTO, ResourcePreviewDTO, ResourceReference


class ResourcePreviewResolver(Protocol):
    async def preview(
        self,
        ref: ResourceReference,
        *,
        access_token: str,
        guest: bool = False,
    ) -> ResourcePreviewDTO: ...


class ResourceActionExecutor(Protocol):
    async def execute(
        self,
        *,
        ref: ResourceReference,
        action: str,
        params: dict[str, Any],
        access_token: str,
    ) -> ResourceActionResultDTO: ...


class TicketCreator(Protocol):
    async def create_ticket(
        self,
        *,
        title: str,
        description: str,
        ticket_type: str,
        priority: str,
        reporter_id: UUID,
        access_token: str,
    ) -> tuple[UUID, str, str, str]:
        """Returns (ticket_id, number, status, title)."""
        ...

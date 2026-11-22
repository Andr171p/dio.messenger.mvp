from typing import Any
from uuid import UUID

from src.application.itsm.constants import DIODESK_PROVIDER, TICKET_RESOURCE_TYPE
from src.application.itsm.dtos import (
    ResourceActionResultDTO,
    ResourcePreviewDTO,
    ResourceReference,
)
from src.application.itsm.exceptions import UnsupportedItsmActionError, UnsupportedResourceError
from src.application.itsm.policies import apply_preview_visibility
from src.infra.services.diodesk import DioDeskTicketsClient

_ACTION_STATUS: dict[str, str] = {
    "start_progress": "in_progress",
    "resolve": "resolved",
    "close": "closed",
    "reopen": "reopened",
}


def _require_ticket_ref(ref: ResourceReference) -> UUID:
    if ref.provider != DIODESK_PROVIDER or ref.resource_type != TICKET_RESOURCE_TYPE:
        raise UnsupportedResourceError("Only dio-desk ticket resources are supported.")
    try:
        return UUID(ref.resource_id)
    except ValueError as exc:
        raise UnsupportedResourceError("resourceId must be a UUID.") from exc


def _map_preview(ref: ResourceReference, raw: dict[str, Any], *, guest: bool) -> ResourcePreviewDTO:
    assignee_name: str | None = None
    # TicketResponse uses assignee_id; view responses may embed assignee.
    assignee = raw.get("assignee")
    if isinstance(assignee, dict):
        assignee_name = assignee.get("full_name") or assignee.get("fullName") or None
    preview = ResourcePreviewDTO(
        ref=ref,
        number=str(raw.get("number") or ""),
        title=str(raw.get("title") or ""),
        status=str(raw.get("status") or ""),
        priority=str(raw.get("priority") or ""),
        ticket_type=str(raw["type"]) if raw.get("type") is not None else None,
        assignee_display_name=assignee_name,
        access="full",
    )
    return apply_preview_visibility(preview, guest=guest)


class DioDeskItsmAdapter:
    """ResourcePreviewResolver + ResourceActionExecutor + TicketCreator."""

    def __init__(self, client: DioDeskTicketsClient) -> None:
        self._client = client

    async def preview(
        self,
        ref: ResourceReference,
        *,
        access_token: str,
        guest: bool = False,
    ) -> ResourcePreviewDTO:
        ticket_id = _require_ticket_ref(ref)
        raw = await self._client.get_ticket(ticket_id, access_token=access_token)
        return _map_preview(ref, raw, guest=guest)

    async def execute(
        self,
        *,
        ref: ResourceReference,
        action: str,
        params: dict[str, Any],
        access_token: str,
    ) -> ResourceActionResultDTO:
        ticket_id = _require_ticket_ref(ref)
        if action == "assign":
            raw_assignee = params.get("assigneeId") or params.get("assignee_id")
            if raw_assignee is None:
                raise UnsupportedItsmActionError("assign requires assigneeId.")
            raw = await self._client.assign(
                ticket_id,
                assignee_id=UUID(str(raw_assignee)),
                access_token=access_token,
            )
        elif action in _ACTION_STATUS:
            raw = await self._client.change_status(
                ticket_id,
                new_status=_ACTION_STATUS[action],
                access_token=access_token,
            )
        else:
            raise UnsupportedItsmActionError(f"Unsupported action: {action}")

        return ResourceActionResultDTO(
            ref=ref,
            action=action,
            status=str(raw.get("status") or ""),
            number=str(raw.get("number") or ""),
            title=str(raw.get("title") or ""),
        )

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
        raw = await self._client.create_ticket(
            {
                "reporter_id": str(reporter_id),
                "title": title,
                "description": description,
                "type": ticket_type,
                "priority": priority,
            },
            access_token=access_token,
        )
        return (
            UUID(str(raw["id"])),
            str(raw.get("number") or ""),
            str(raw.get("status") or ""),
            str(raw.get("title") or title),
        )

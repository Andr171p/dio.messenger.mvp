from fastapi import APIRouter, status

from src.api.dependencies.auth import CurrentUser
from src.api.dependencies.realtime import WsTicketStoreDep
from src.application.realtime.dtos import WsTicketDTO
from src.infra.realtime import WsTicketClaims

router = APIRouter(prefix="/v1/ws", tags=["websocket"])


@router.post(
    "/tickets",
    status_code=status.HTTP_201_CREATED,
    summary="Выпустить короткоживущий ticket для WebSocket handshake",
)
async def create_ws_ticket(
    auth: CurrentUser,
    ticket_store: WsTicketStoreDep,
) -> WsTicketDTO:
    issued = await ticket_store.issue(
        WsTicketClaims(
            user_id=auth.user.id,
            organization_id=auth.user.organization_id,
            email=str(auth.user.email),
        )
    )
    return WsTicketDTO(
        ticket=issued.ticket,
        expires_in=issued.expires_in,
        expires_at=issued.expires_at,
    )

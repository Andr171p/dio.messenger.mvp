from typing import Annotated

from fastapi import Depends, Request

from src.infra.realtime import WsTicketStore
from src.infra.realtime.ephemeral import EphemeralRealtimeStore


def get_ws_ticket_store(request: Request) -> WsTicketStore:
    store = getattr(request.app.state, "ws_ticket_store", None)
    if store is None:
        raise RuntimeError("WS ticket store is not initialized.")
    return store


def get_ephemeral_store(request: Request) -> EphemeralRealtimeStore:
    store = getattr(request.app.state, "ephemeral_store", None)
    if store is None:
        raise RuntimeError("Ephemeral realtime store is not initialized.")
    return store


WsTicketStoreDep = Annotated[WsTicketStore, Depends(get_ws_ticket_store)]
EphemeralStoreDep = Annotated[EphemeralRealtimeStore, Depends(get_ephemeral_store)]

__all__ = ["EphemeralStoreDep", "WsTicketStoreDep", "get_ephemeral_store", "get_ws_ticket_store"]

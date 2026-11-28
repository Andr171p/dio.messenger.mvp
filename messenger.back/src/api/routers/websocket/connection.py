from typing import Annotated

from uuid import UUID

from ddf.api.ws import (
    WsAdmission,
    create_ws_admitter,
    serve_websocket,
)
from ddf.application.realtime import Subscription
from ddf.application.realtime.exceptions import SubscriptionDeniedError
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, status

from src.api.dependencies.db import sessionmaker
from src.api.realtime_runtime import session_registry
from src.api.routers.websocket.handler import handle_messenger_ws_commands
from src.infra.database.repositories import SqlAlchemyMembershipRepository
from src.infra.realtime import WsTicketStore, conversation_room, user_room
from src.infra.realtime.ephemeral import EphemeralRealtimeStore

router = APIRouter(tags=["websocket"])


async def _get_ticket_subject(
    websocket: WebSocket,
    ticket: Annotated[str, Query(min_length=1)],
) -> str:
    store: WsTicketStore = websocket.app.state.ws_ticket_store
    claims = await store.consume(ticket)
    if claims is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired WS ticket",
        )

    websocket.state.ws_claims = claims
    return f"{claims.organization_id}:{claims.user_id}"


admit = create_ws_admitter(_get_ticket_subject)


def _make_room_resolver(*, organization_id: UUID, user_id: UUID):
    async def resolve(subscription: Subscription):
        if subscription.topic != "conversation":
            raise SubscriptionDeniedError()

        try:
            conversation_id = UUID(subscription.key)
        except ValueError as exc:
            raise SubscriptionDeniedError() from exc

        async with sessionmaker() as session:
            membership = await SqlAlchemyMembershipRepository(session).get_active(
                conversation_id=conversation_id,
                principal_id=user_id,
            )

        if membership is None or membership.organization_id != organization_id:
            raise SubscriptionDeniedError()

        return conversation_room(conversation_id)

    return resolve


@router.websocket("/v1/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    admission: Annotated[WsAdmission, Depends(admit)],
) -> None:
    claims = websocket.state.ws_claims
    resolver = _make_room_resolver(
        organization_id=claims.organization_id,
        user_id=claims.user_id,
    )
    ephemeral: EphemeralRealtimeStore = websocket.app.state.ephemeral_store

    await serve_websocket(
        websocket,
        handler=lambda connection: handle_messenger_ws_commands(
            connection,
            claims=claims,
            ephemeral=ephemeral,
            resolve_room=resolver,
            session_registry=session_registry,
        ),
        admission=admission,
        initial_rooms=(user_room(organization_id=claims.organization_id, user_id=claims.user_id),),
    )

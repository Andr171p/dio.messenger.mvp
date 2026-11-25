"""WS command loop: subscriptions + ephemeral typing/presence."""

from __future__ import annotations

from typing import Any

import json
from uuid import UUID

from ddf.api.ws.commands import dispatch_subscription_command, send_reply
from ddf.api.ws.config import WsConfig
from ddf.api.ws.dependencies import get_ws_container
from ddf.application.realtime import Connection, ErrorPayload, RoomResolver, SubscriptionCommand
from fastapi import WebSocketException, status
from pydantic import TypeAdapter, ValidationError

from src.api.dependencies.db import sessionmaker
from src.infra.database.repositories import SqlAlchemyMembershipRepository
from src.infra.realtime.ephemeral import EphemeralRealtimeStore
from src.infra.realtime.sessions import WsSessionRegistry
from src.infra.realtime.tickets import WsTicketClaims

_subscription_adapter: TypeAdapter[SubscriptionCommand] = TypeAdapter(SubscriptionCommand)


async def handle_messenger_ws_commands(
    connection: Connection,
    *,
    claims: WsTicketClaims,
    ephemeral: EphemeralRealtimeStore,
    resolve_room: RoomResolver,
    session_registry: WsSessionRegistry,
) -> None:
    container = get_ws_container(connection.websocket)
    config, connection_manager = container.config, container.connection_manager
    session_registry.register(
        connection,
        organization_id=claims.organization_id,
        user_id=claims.user_id,
    )
    session_id = await ephemeral.presence_connected(
        organization_id=claims.organization_id,
        user_id=claims.user_id,
    )
    invalid = 0

    try:
        while True:
            message = await connection.websocket.receive()

            if message["type"] == "websocket.disconnect":
                return

            if message["type"] != "websocket.receive":
                raise WebSocketException(code=status.WS_1002_PROTOCOL_ERROR)

            raw = _validate_raw_text(config, message.get("text"))
            await ephemeral.presence_heartbeat(
                organization_id=claims.organization_id,
                user_id=claims.user_id,
            )

            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                invalid = _note_invalid(connection, config, invalid)
                continue

            if not isinstance(payload, dict):
                invalid = _note_invalid(connection, config, invalid)
                continue

            msg_type = payload.get("type")
            if not isinstance(msg_type, str):
                invalid = _note_invalid(connection, config, invalid)
                continue

            if msg_type.startswith("subscription."):
                try:
                    command = _subscription_adapter.validate_python(payload)
                except ValidationError:
                    invalid = _note_invalid(connection, config, invalid)
                    continue
                invalid = 0
                await dispatch_subscription_command(
                    command,
                    connection=connection,
                    connection_manager=connection_manager,
                    resolve_room=resolve_room,
                    timeout=config.subscription.authorization_timeout,
                )
                continue

            if msg_type in {"typing.started", "typing.stopped", "presence.ping"}:
                invalid = 0
                await _handle_ephemeral(
                    connection,
                    claims=claims,
                    ephemeral=ephemeral,
                    msg_type=msg_type,
                    payload=payload,
                )
                continue

            invalid = _note_invalid(connection, config, invalid)
    finally:
        session_registry.unregister(connection.id)
        await ephemeral.presence_disconnected(
            organization_id=claims.organization_id,
            user_id=claims.user_id,
            session_id=session_id,
        )


def _validate_raw_text(config: WsConfig, raw: object) -> str:
    if not isinstance(raw, str):
        raise WebSocketException(code=status.WS_1003_UNSUPPORTED_DATA)

    if len(raw.encode("utf-8")) > config.max_incoming_bytes:
        raise WebSocketException(code=status.WS_1009_MESSAGE_TOO_BIG)

    return raw


def _note_invalid(connection: Connection, config: WsConfig, invalid: int) -> int:
    invalid += 1
    if invalid >= config.subscription.max_consecutive_invalid_commands:
        raise WebSocketException(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Too many invalid commands",
        )
    send_reply(connection, "error", ErrorPayload(code="invalid_command", message="Invalid command"))
    return invalid


async def _handle_ephemeral(
    connection: Connection,
    *,
    claims: WsTicketClaims,
    ephemeral: EphemeralRealtimeStore,
    msg_type: str,
    payload: dict[str, Any],
) -> None:
    command_id = payload.get("id")
    body = payload.get("payload") if isinstance(payload.get("payload"), dict) else {}

    if msg_type == "presence.ping":
        await ephemeral.presence_heartbeat(
            organization_id=claims.organization_id,
            user_id=claims.user_id,
        )
        send_reply(connection, "presence.pong", {"status": "online"}, _as_uuid(command_id))
        return

    conversation_raw = body.get("conversationId") or body.get("conversation_id")
    try:
        conversation_id = UUID(str(conversation_raw))
    except (TypeError, ValueError):
        send_reply(
            connection,
            "error",
            ErrorPayload(code="invalid_command", message="conversationId required"),
            _as_uuid(command_id),
        )
        return

    if not await _is_active_member(
        conversation_id=conversation_id,
        user_id=claims.user_id,
        organization_id=claims.organization_id,
    ):
        send_reply(
            connection,
            "error",
            ErrorPayload(code="forbidden", message="Not a conversation member"),
            _as_uuid(command_id),
        )
        return

    activity = "recording_audio" if body.get("activity") == "recording_audio" else "typing"
    if msg_type == "typing.started":
        await ephemeral.typing_started(
            organization_id=claims.organization_id,
            conversation_id=conversation_id,
            user_id=claims.user_id,
            activity=activity,
        )
        send_reply(connection, "typing.ack", {"status": "started"}, _as_uuid(command_id))
        return

    await ephemeral.typing_stopped(
        organization_id=claims.organization_id,
        conversation_id=conversation_id,
        user_id=claims.user_id,
        activity=activity,
    )
    send_reply(connection, "typing.ack", {"status": "stopped"}, _as_uuid(command_id))


async def _is_active_member(
    *,
    conversation_id: UUID,
    user_id: UUID,
    organization_id: UUID,
) -> bool:
    async with sessionmaker() as session:
        membership = await SqlAlchemyMembershipRepository(session).get_active(
            conversation_id=conversation_id,
            principal_id=user_id,
        )
    return membership is not None and membership.organization_id == organization_id


def _as_uuid(value: object) -> UUID | None:
    if value is None:
        return None
    try:
        return UUID(str(value))
    except ValueError:
        return None

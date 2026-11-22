"""Локальный реестр WS-сессий для access revoke при kick."""

from collections import defaultdict
from datetime import UTC, datetime
from uuid import UUID

from typing import Any

from ddf.application.realtime import Connection, ConnectionManager, Event, Room, Subscription

from src.infra.observability.metrics import set_ws_connections
from src.infra.realtime.rooms import conversation_room


class WsSessionRegistry:
    def __init__(self) -> None:
        self._by_connection: dict[UUID, tuple[UUID, UUID, Connection]] = {}
        self._by_user: dict[tuple[UUID, UUID], set[UUID]] = defaultdict(set)

    def connection_count(self) -> int:
        return len(self._by_connection)

    def register(self, connection: Connection, *, organization_id: UUID, user_id: UUID) -> None:
        self._by_connection[connection.id] = (organization_id, user_id, connection)
        self._by_user[(organization_id, user_id)].add(connection.id)
        set_ws_connections(self.connection_count())

    def unregister(self, connection_id: UUID) -> None:
        entry = self._by_connection.pop(connection_id, None)
        if entry is None:
            return
        organization_id, user_id, _ = entry
        sessions = self._by_user.get((organization_id, user_id))
        if sessions is None:
            return
        sessions.discard(connection_id)
        if not sessions:
            del self._by_user[(organization_id, user_id)]
        set_ws_connections(self.connection_count())

    def connections_for(self, *, organization_id: UUID, user_id: UUID) -> list[Connection]:
        ids = self._by_user.get((organization_id, user_id), set())
        result: list[Connection] = []
        for connection_id in tuple(ids):
            entry = self._by_connection.get(connection_id)
            if entry is not None:
                result.append(entry[2])
        return result


def build_access_revoked_event(
    *,
    organization_id: UUID,
    conversation_id: UUID,
    principal_id: UUID,
    reason: str = "member.removed",
) -> Event[dict[str, str]]:
    return Event(
        type="access.revoked",
        payload={
            "organizationId": str(organization_id),
            "conversationId": str(conversation_id),
            "principalId": str(principal_id),
            "reason": reason,
        },
        occurred_at=datetime.now(UTC),
    )


def drop_conversation_access(
    *,
    manager: ConnectionManager,
    registry: WsSessionRegistry,
    organization_id: UUID,
    user_id: UUID,
    conversation_id: UUID,
) -> None:
    """Снимает локальные conversation subscriptions у кикнутого пользователя."""

    room = conversation_room(conversation_id)
    subscription = Subscription(topic="conversation", key=str(conversation_id))

    for connection in registry.connections_for(organization_id=organization_id, user_id=user_id):
        try:
            manager.unsubscribe(connection, subscription)
            manager.leave(connection, room)
        except RuntimeError:
            continue


class MessengerConnectionManager(ConnectionManager):
    """ConnectionManager с локальным revoke при ``access.revoked`` (все API-инстансы через Redis)."""

    def __init__(self, registry: WsSessionRegistry) -> None:
        super().__init__()
        self.session_registry = registry

    def emit(self, event: Event[Any], *, to: Room) -> None:
        if event.type == "access.revoked" and isinstance(event.payload, dict):
            self._drop_on_access_revoked(event.payload)
        super().emit(event, to=to)

    def _drop_on_access_revoked(self, payload: dict) -> None:
        try:
            organization_id = UUID(str(payload["organizationId"]))
            conversation_id = UUID(str(payload["conversationId"]))
            principal_id = UUID(str(payload["principalId"]))
        except (KeyError, TypeError, ValueError):
            return
        drop_conversation_access(
            manager=self,
            registry=self.session_registry,
            organization_id=organization_id,
            user_id=principal_id,
            conversation_id=conversation_id,
        )

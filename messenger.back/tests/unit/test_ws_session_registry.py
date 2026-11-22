from uuid import uuid4

from ddf.application.realtime import Connection, Subscription

from src.infra.realtime.rooms import conversation_room
from src.infra.realtime.sessions import (
    MessengerConnectionManager,
    WsSessionRegistry,
    build_access_revoked_event,
)


class _DummyWebSocket:
    """Минимальный stub для Connection (очередь offer без реального WS)."""


def test_registry_tracks_connections() -> None:
    registry = WsSessionRegistry()
    org_id = uuid4()
    user_id = uuid4()
    connection = Connection(_DummyWebSocket())  # type: ignore[arg-type]
    registry.register(connection, organization_id=org_id, user_id=user_id)
    assert registry.connections_for(organization_id=org_id, user_id=user_id) == [connection]
    registry.unregister(connection.id)
    assert registry.connections_for(organization_id=org_id, user_id=user_id) == []


def test_access_revoked_drops_conversation_subscription() -> None:
    registry = WsSessionRegistry()
    manager = MessengerConnectionManager(registry)
    org_id = uuid4()
    user_id = uuid4()
    conversation_id = uuid4()
    connection = Connection(_DummyWebSocket())  # type: ignore[arg-type]

    with manager.connect(connection):
        registry.register(connection, organization_id=org_id, user_id=user_id)
        room = conversation_room(conversation_id)
        subscription = Subscription(topic="conversation", key=str(conversation_id))
        manager.subscribe(connection, subscription, room)

        event = build_access_revoked_event(
            organization_id=org_id,
            conversation_id=conversation_id,
            principal_id=user_id,
        )
        manager.emit(event, to=room)

        assert subscription not in manager._subscriptions[connection.id]

"""Redis helpers for ephemeral typing / presence."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from ddf.application.realtime import Event, RealtimePublisher
from redis.asyncio import Redis

from src.application.realtime.config import RealtimeEphemeralConfig
from src.infra.realtime.rooms import conversation_room, user_room


class EphemeralRealtimeStore:
    def __init__(
        self,
        redis: Redis,
        publisher: RealtimePublisher,
        *,
        config: RealtimeEphemeralConfig | None = None,
    ) -> None:
        self._redis = redis
        self._publisher = publisher
        self._config = config or RealtimeEphemeralConfig()

    def _typing_key(self, conversation_id: UUID, user_id: UUID) -> str:
        return f"messenger:typing:{conversation_id}:{user_id}"

    def _presence_key(self, organization_id: UUID, user_id: UUID) -> str:
        return f"messenger:presence:{organization_id}:{user_id}"

    def _presence_sessions_key(self, organization_id: UUID, user_id: UUID) -> str:
        return f"messenger:presence:sessions:{organization_id}:{user_id}"

    async def online_users(self, organization_id: UUID, user_ids: list[UUID]) -> set[UUID]:
        if not user_ids:
            return set()
        keys = [self._presence_key(organization_id, user_id) for user_id in user_ids]
        values = await self._redis.mget(keys)
        return {user_id for user_id, value in zip(user_ids, values, strict=True) if value is not None}

    async def typing_started(
        self,
        *,
        organization_id: UUID,
        conversation_id: UUID,
        user_id: UUID,
    ) -> bool:
        """Возвращает True, если нужно fanout (новый/истёкший typing или throttle окно)."""

        key = self._typing_key(conversation_id, user_id)
        throttle_key = f"{key}:throttle"
        if await self._redis.exists(throttle_key):
            await self._redis.set(key, "1", ex=self._config.typing_ttl_seconds)
            return False

        await self._redis.set(key, "1", ex=self._config.typing_ttl_seconds)
        await self._redis.set(throttle_key, "1", ex=max(1, int(self._config.typing_throttle_seconds)))
        await self._publish_typing(
            conversation_id=conversation_id,
            user_id=user_id,
            organization_id=organization_id,
            status="started",
        )
        return True

    async def typing_stopped(
        self,
        *,
        organization_id: UUID,
        conversation_id: UUID,
        user_id: UUID,
    ) -> None:
        key = self._typing_key(conversation_id, user_id)
        deleted = await self._redis.delete(key)
        if deleted:
            await self._publish_typing(
                conversation_id=conversation_id,
                user_id=user_id,
                organization_id=organization_id,
                status="stopped",
            )

    async def presence_connected(self, *, organization_id: UUID, user_id: UUID) -> str:
        """Регистрирует сессию; возвращает session_id."""

        session_id = str(uuid4())
        sessions_key = self._presence_sessions_key(organization_id, user_id)
        presence_key = self._presence_key(organization_id, user_id)

        count = await self._redis.sadd(sessions_key, session_id)
        await self._redis.expire(sessions_key, self._config.presence_ttl_seconds)
        await self._redis.set(presence_key, "online", ex=self._config.presence_ttl_seconds)

        if count == 1:
            await self._publish_presence(
                organization_id=organization_id,
                user_id=user_id,
                status="online",
            )
        return session_id

    async def presence_heartbeat(self, *, organization_id: UUID, user_id: UUID) -> None:
        sessions_key = self._presence_sessions_key(organization_id, user_id)
        presence_key = self._presence_key(organization_id, user_id)
        await self._redis.expire(sessions_key, self._config.presence_ttl_seconds)
        await self._redis.set(presence_key, "online", ex=self._config.presence_ttl_seconds)

    async def presence_disconnected(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        session_id: str,
    ) -> None:
        sessions_key = self._presence_sessions_key(organization_id, user_id)
        await self._redis.srem(sessions_key, session_id)
        remaining = await self._redis.scard(sessions_key)
        if remaining == 0:
            await self._redis.delete(self._presence_key(organization_id, user_id))
            await self._redis.delete(sessions_key)
            await self._publish_presence(
                organization_id=organization_id,
                user_id=user_id,
                status="offline",
            )

    async def _publish_typing(
        self,
        *,
        conversation_id: UUID,
        user_id: UUID,
        organization_id: UUID,
        status: str,
    ) -> None:
        event = Event(
            type="typing.updated",
            payload={
                "conversationId": str(conversation_id),
                "userId": str(user_id),
                "organizationId": str(organization_id),
                "status": status,
            },
            occurred_at=datetime.now(UTC),
        )
        await self._publisher(event, to=conversation_room(conversation_id))

    async def publish_delivery_updated(
        self,
        *,
        organization_id: UUID,
        conversation_id: UUID,
        user_id: UUID,
        last_delivered_message_seq: int,
    ) -> None:
        event = Event(
            type="receipt.delivered_updated",
            payload={
                "conversationId": str(conversation_id),
                "userId": str(user_id),
                "organizationId": str(organization_id),
                "lastDeliveredMessageSeq": last_delivered_message_seq,
            },
            occurred_at=datetime.now(UTC),
        )
        await self._publisher(event, to=conversation_room(conversation_id))

    async def _publish_presence(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        status: str,
    ) -> None:
        event = Event(
            type="presence.changed",
            payload={
                "organizationId": str(organization_id),
                "userId": str(user_id),
                "status": status,
            },
            occurred_at=datetime.now(UTC),
        )
        await self._publisher(event, to=user_room(organization_id=organization_id, user_id=user_id))

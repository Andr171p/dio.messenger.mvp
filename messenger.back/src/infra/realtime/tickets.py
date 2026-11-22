"""Короткоживущие WS tickets (вместо access token в query string)."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from redis.asyncio import Redis

TICKET_TTL_SECONDS = 60
_KEY_PREFIX = "messenger:ws:ticket:"


@dataclass(frozen=True, slots=True)
class WsTicketClaims:
    user_id: UUID
    organization_id: UUID
    email: str


@dataclass(frozen=True, slots=True)
class IssuedWsTicket:
    ticket: str
    expires_in: int
    expires_at: datetime


class WsTicketStore:
    def __init__(self, redis: Redis, *, ttl_seconds: int = TICKET_TTL_SECONDS) -> None:
        self._redis = redis
        self._ttl_seconds = ttl_seconds

    async def issue(self, claims: WsTicketClaims) -> IssuedWsTicket:
        ticket = str(uuid4())
        key = f"{_KEY_PREFIX}{ticket}"
        await self._redis.hset(
            key,
            mapping={
                "user_id": str(claims.user_id),
                "organization_id": str(claims.organization_id),
                "email": claims.email,
            },
        )
        await self._redis.expire(key, self._ttl_seconds)
        expires_at = datetime.now(UTC) + timedelta(seconds=self._ttl_seconds)
        return IssuedWsTicket(ticket=ticket, expires_in=self._ttl_seconds, expires_at=expires_at)

    async def consume(self, ticket: str) -> WsTicketClaims | None:
        key = f"{_KEY_PREFIX}{ticket}"
        data = await self._redis.hgetall(key)
        if not data:
            return None

        await self._redis.delete(key)
        return WsTicketClaims(
            user_id=UUID(data["user_id"]),
            organization_id=UUID(data["organization_id"]),
            email=data["email"],
        )

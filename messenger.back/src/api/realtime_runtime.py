"""Composition root для WebSocket / Redis realtime (живёт вместе с API-процессом)."""

from ddf.api.ws import WsConfig, WsContainer
from ddf.infra.limits.concurrency.redis import RedisConcurrencyLimiter
from ddf.ratelimit.redis import RedisRateLimiter
from redis.asyncio import Redis

from src.infra.realtime.sessions import MessengerConnectionManager, WsSessionRegistry
from src.infra.redis import RedisConfig

redis_config = RedisConfig()
ws_config = WsConfig()

redis = Redis.from_url(redis_config.url, decode_responses=True)
session_registry = WsSessionRegistry()
connection_manager = MessengerConnectionManager(session_registry)
rate_limiter = RedisRateLimiter(redis, prefix="messenger:rl")
concurrency_limiter = RedisConcurrencyLimiter(redis, prefix="messenger:concurrency")
ws_container = WsContainer(
    config=ws_config,
    connection_manager=connection_manager,
    rate_limiter=rate_limiter,
    concurrency_limiter=concurrency_limiter,
)

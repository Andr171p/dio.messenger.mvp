from typing import Any

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from ddf.infra.brokers.rabbit import RabbitConfig
from ddf.infra.cache import InMemoryCache
from ddf.infra.realtime.redis import create_redis_realtime_publisher, register_redis_realtime_consumer
from fastapi import FastAPI
from faststream.rabbit import RabbitBroker
from faststream.redis import RedisBroker

from src.api.dependencies.auth import iam_client
from src.api.dependencies.db import engine
from src.api.dependencies.itsm import get_diodesk_tickets_client
from src.api.dependencies.links import link_preview_fetcher
from src.api.realtime_runtime import connection_manager, redis
from src.application.auth import Auth

# Регистрация event classes для deserialize_event в fanout.
from src.domain.memberships import events as _membership_events  # noqa: F401
from src.domain.messages import events as _message_events  # noqa: F401
from src.domain.pins import events as _pin_events  # noqa: F401
from src.domain.polls import events as _poll_events  # noqa: F401
from src.domain.reactions import events as _reaction_events  # noqa: F401
from src.domain.threads import events as _thread_events  # noqa: F401
from src.infra.realtime import REALTIME_FANOUT_QUEUE, WsTicketStore, publish_domain_event_payload
from src.infra.realtime.ephemeral import EphemeralRealtimeStore
from src.infra.redis import RedisConfig

logger = logging.getLogger(__name__)


def _rabbit_config() -> RabbitConfig:
    return RabbitConfig(exchange="messenger.events")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # noinspection PyUnresolvedReferences
    app.state.iam_client = iam_client
    # noinspection PyUnresolvedReferences
    app.state.auth_cache = InMemoryCache[Auth]()
    # noinspection PyUnresolvedReferences
    app.state.ws_ticket_store = WsTicketStore(redis)

    redis_broker = RedisBroker(RedisConfig().url)
    register_redis_realtime_consumer(redis_broker, connection_manager)
    publisher = create_redis_realtime_publisher(redis_broker)
    await redis_broker.start()

    rabbit_broker = RabbitBroker(_rabbit_config().uri)

    @rabbit_broker.subscriber(REALTIME_FANOUT_QUEUE)
    async def on_domain_event(message: dict[str, Any]) -> None:
        event_type = message.get("eventType")
        payload = message.get("payload")
        if not isinstance(event_type, str) or not isinstance(payload, dict):
            logger.warning("Invalid realtime fanout payload")
            return
        await publish_domain_event_payload(
            event_type=event_type,
            payload=payload,
            publisher=publisher,
        )

    await rabbit_broker.start()
    logger.info("Realtime fanout consumer started (queue=%s)", REALTIME_FANOUT_QUEUE)

    # noinspection PyUnresolvedReferences
    app.state.realtime_publisher = publisher
    # noinspection PyUnresolvedReferences
    app.state.ephemeral_store = EphemeralRealtimeStore(redis, publisher)
    # noinspection PyUnresolvedReferences
    app.state.redis_broker = redis_broker
    # noinspection PyUnresolvedReferences
    app.state.rabbit_broker = rabbit_broker

    try:
        yield
    finally:
        connection_manager.shutdown()
        await rabbit_broker.stop()
        await redis_broker.stop()
        await redis.aclose()
        await get_diodesk_tickets_client().close()
        await link_preview_fetcher.close()
        await iam_client.close()
        await engine.dispose()

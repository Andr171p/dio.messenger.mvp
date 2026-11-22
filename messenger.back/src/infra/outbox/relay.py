"""
Outbox relay: ``outbox_messages`` → RabbitMQ queue ``messenger.realtime.fanout`` (at-least-once).

Запуск: ``python -m src.infra.outbox.relay``.
Несколько экземпляров безопасны (``FOR UPDATE SKIP LOCKED``).
"""

import asyncio
import logging
from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager

from ddf.application.events import serialize_event
from ddf.application.outbox import OutboxConfig, OutboxProcessor
from ddf.domain.events import Event
from ddf.infra.brokers.rabbit import RabbitConfig
from ddf.infra.database.sqlalchemy import PostgresConfig
from ddf.infra.outbox.sqlalchemy import (
    PostgresOutboxListener,
    SqlAlchemyOutboxStore,
    run_postgres_notify_worker,
)
from ddf.infra.outbox.worker import OutboxWorkerConfig
from faststream.rabbit import RabbitBroker

# Регистрация доменных событий в Event registry (deserialize_event в processor).
from src.domain.memberships import events as _membership_events  # noqa: F401
from src.domain.messages import events as _message_events  # noqa: F401
from src.domain.pins import events as _pin_events  # noqa: F401
from src.domain.polls import events as _poll_events  # noqa: F401
from src.domain.reactions import events as _reaction_events  # noqa: F401
from src.domain.threads import events as _thread_events  # noqa: F401
from src.infra.database.connection import create_database
from src.infra.outbox import OUTBOX_CHANNEL
from src.infra.realtime.fanout import REALTIME_FANOUT_QUEUE

logger = logging.getLogger(__name__)


def _rabbit_config() -> RabbitConfig:
    # exchange обязателен в DDF RabbitConfig; для очереди fanout используем direct publish в queue.
    return RabbitConfig(exchange="messenger.events")


async def run_outbox_relay() -> None:
    pg_config = PostgresConfig()
    engine, sessionmaker = create_database(pg_config)
    rabbit_config = _rabbit_config()
    broker = RabbitBroker(rabbit_config.uri)

    async def publish(events: Sequence[Event]) -> None:
        for event in events:
            await broker.publish(
                {
                    "eventType": event.event_type,
                    "payload": serialize_event(event),
                },
                queue=REALTIME_FANOUT_QUEUE,
            )

    @asynccontextmanager
    async def processor_factory() -> AsyncIterator[OutboxProcessor]:
        async with sessionmaker() as session:
            yield OutboxProcessor(
                uow=session,
                outbox_store=SqlAlchemyOutboxStore(session),
                publisher=publish,
                config=OutboxConfig(),
            )

    await broker.start()
    logger.info("Outbox relay started (queue=%s)", REALTIME_FANOUT_QUEUE)

    try:
        await run_postgres_notify_worker(
            processor_factory,
            PostgresOutboxListener(engine, channel=OUTBOX_CHANNEL),
            OutboxWorkerConfig(),
        )
    finally:
        await broker.stop()
        await engine.dispose()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_outbox_relay())

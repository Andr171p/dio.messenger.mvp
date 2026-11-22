"""
Retention worker: prune aged conversation_events (keep MIN per conversation) and purge old tombstones.

Запуск: ``python -m src.infra.retention.worker``.

После prune ``GET /v1/conversations/{id}/events`` с устаревшим cursor вернёт ``snapshot_required``
(см. ``SnapshotRequiredError`` / ``event_store.min_seq``).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from ddf.infra.database.sqlalchemy import PostgresConfig
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.infra.database.connection import create_database
from src.infra.database.models import ConversationEventOrm, ConversationOrm, MessageOrm
from src.infra.retention.config import RetentionConfig, RetentionWorkerConfig

logger = logging.getLogger(__name__)

_PRUNE_EVENTS_SQL = text(
    """
    WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY seq DESC) AS rn
        FROM conversation_events
        WHERE conversation_id = :conversation_id
    )
    DELETE FROM conversation_events ce
    USING ranked r
    WHERE ce.id = r.id
      AND r.rn > :min_retained
      AND ce.occurred_at < :cutoff
      AND ce.conversation_id = :conversation_id
    """
)


async def _prune_conversation_events(
    session: AsyncSession,
    *,
    conversation_id,
    event_cutoff: datetime,
    min_retained_events: int,
) -> int:
    result = await session.execute(
        _PRUNE_EVENTS_SQL,
        {
            "conversation_id": conversation_id,
            "cutoff": event_cutoff,
            "min_retained": min_retained_events,
        },
    )
    return int(result.rowcount or 0)


async def _purge_tombstoned_messages(session: AsyncSession, *, tombstone_cutoff: datetime) -> int:
    stmt = delete(MessageOrm).where(
        MessageOrm.deleted_at.is_not(None),
        MessageOrm.deleted_at < tombstone_cutoff,
    )
    result = await session.execute(stmt)
    return int(result.rowcount or 0)


async def _list_conversation_ids(session: AsyncSession, *, limit: int, offset: int) -> list:
    stmt = (
        select(ConversationOrm.id)
        .where(ConversationOrm.deleted_at.is_(None))
        .order_by(ConversationOrm.id)
        .offset(offset)
        .limit(limit)
    )
    result = await session.scalars(stmt)
    return list(result.all())


async def run_retention_cycle(
    session: AsyncSession,
    *,
    retention: RetentionConfig,
    batch_conversations: int,
) -> tuple[int, int]:
    now = datetime.now(UTC)
    event_cutoff = now - timedelta(days=retention.event_retention_days)
    tombstone_cutoff = now - timedelta(days=retention.message_tombstone_retention_days)

    events_deleted = 0
    offset = 0
    while True:
        ids = await _list_conversation_ids(session, limit=batch_conversations, offset=offset)
        if not ids:
            break
        for conversation_id in ids:
            events_deleted += await _prune_conversation_events(
                session,
                conversation_id=conversation_id,
                event_cutoff=event_cutoff,
                min_retained_events=retention.min_retained_events,
            )
        offset += batch_conversations

    messages_purged = await _purge_tombstoned_messages(session, tombstone_cutoff=tombstone_cutoff)
    await session.commit()
    return events_deleted, messages_purged


async def run_retention_worker() -> None:
    pg_config = PostgresConfig()
    engine, sessionmaker = create_database(pg_config)
    worker_config = RetentionWorkerConfig()
    retention = RetentionConfig()

    logger.info(
        "Retention worker started (event_days=%s, min_events=%s, tombstone_days=%s)",
        retention.event_retention_days,
        retention.min_retained_events,
        retention.message_tombstone_retention_days,
    )

    try:
        while True:
            async with sessionmaker() as session:
                events_deleted, messages_purged = await run_retention_cycle(
                    session,
                    retention=retention,
                    batch_conversations=worker_config.batch_conversations,
                )
            if events_deleted or messages_purged:
                logger.info(
                    "Retention cycle: pruned %s events, purged %s tombstoned messages",
                    events_deleted,
                    messages_purged,
                )
            await asyncio.sleep(worker_config.poll_interval)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_retention_worker())
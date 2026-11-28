"""
Scheduled message worker: pending rows due at ``send_at`` → ``send_message``.

Запуск: ``python -m src.infra.scheduled.worker``.
Несколько экземпляров безопасны (``FOR UPDATE SKIP LOCKED``).
"""

import asyncio
import logging
from datetime import UTC, datetime
from uuid import UUID

from ddf.infra.database.sqlalchemy import PostgresConfig
from ddf.infra.outbox.sqlalchemy import SqlAlchemyOutboxStore
from pydantic import TypeAdapter

from src.application.audit.repositories import AuditRepository
from src.application.auth import Auth, AuthType, AuthUser
from src.application.messaging.commands import send_message
from src.application.messaging.dtos import SendMessageDTO
from src.domain.scheduled import ScheduledMessageStatus
from src.infra.database.connection import create_database
from src.infra.database.repositories.conversations import (
    SqlAlchemyConversationRepository,
    SqlAlchemyMembershipRepository,
)
from src.infra.database.repositories.media import SqlAlchemyMediaRepository
from src.infra.database.repositories.messages import (
    SqlAlchemyConversationEventStore,
    SqlAlchemyMessageRepository,
)
from src.infra.database.repositories.policies import SqlAlchemyConversationPolicyRepository
from src.infra.database.repositories.scheduled import SqlAlchemyScheduledMessageRepository
from src.infra.database.repositories.threads import SqlAlchemyThreadRepository
from src.infra.scheduled.config import ScheduledWorkerConfig

logger = logging.getLogger(__name__)

_SEND_ADAPTER = TypeAdapter(SendMessageDTO)


class _NoopAuditRepository(AuditRepository):
    async def append(self, *_args, **_kwargs) -> None:
        return


def _actor_for(sender_id: UUID, *, organization_id: UUID) -> AuthUser:
    return AuthUser(
        id=sender_id,
        type=AuthType.USER,
        user=Auth.User(
            id=sender_id,
            email="scheduled-worker@internal.local",
            organization_id=organization_id,
        ),
    )


async def _dispatch_one(
    *,
    sessionmaker,
    scheduled_id: UUID,
) -> bool:
    async with sessionmaker() as session:
        scheduled_repo = SqlAlchemyScheduledMessageRepository(session)
        entity = await scheduled_repo.read(scheduled_id)
        if entity is None or entity.status is not ScheduledMessageStatus.PENDING:
            return False

        command = _SEND_ADAPTER.validate_python(entity.payload)
        conversation_repository = SqlAlchemyConversationRepository(session)
        membership_repository = SqlAlchemyMembershipRepository(session)
        message_repository = SqlAlchemyMessageRepository(session)
        event_store = SqlAlchemyConversationEventStore(session)
        media_repository = SqlAlchemyMediaRepository(session)
        policy_repository = SqlAlchemyConversationPolicyRepository(session)
        thread_repository = SqlAlchemyThreadRepository(session)
        outbox_store = SqlAlchemyOutboxStore(session)
        audit_repository = _NoopAuditRepository()

        try:
            await send_message(
                command,
                conversation_id=entity.conversation_id,
                actor=_actor_for(entity.sender_id, organization_id=entity.organization_id),
                conversation_repository=conversation_repository,
                membership_repository=membership_repository,
                message_repository=message_repository,
                event_store=event_store,
                media_repository=media_repository,
                policy_repository=policy_repository,
                outbox_store=outbox_store,
                uow=session,
                audit_repository=audit_repository,
                thread_repository=thread_repository,
            )
            entity.mark_sent()
            await scheduled_repo.update(entity)
            await session.commit()
            logger.info("Scheduled message %s sent", entity.id)
            return True
        except Exception:
            await session.rollback()
            logger.exception("Failed to send scheduled message %s", scheduled_id)
            return False


async def _process_batch(*, sessionmaker, batch_size: int) -> int:
    async with sessionmaker() as session:
        scheduled_repo = SqlAlchemyScheduledMessageRepository(session)
        due = await scheduled_repo.claim_due(limit=batch_size, now=datetime.now(UTC))
        await session.commit()

    if not due:
        return 0

    sent = 0
    for item in due:
        if await _dispatch_one(sessionmaker=sessionmaker, scheduled_id=item.id):
            sent += 1
    return sent


async def run_scheduled_worker() -> None:
    pg_config = PostgresConfig()
    engine, sessionmaker = create_database(pg_config)
    worker_config = ScheduledWorkerConfig()

    logger.info("Scheduled message worker started (poll_interval=%ss)", worker_config.poll_interval)

    try:
        while True:
            count = await _process_batch(sessionmaker=sessionmaker, batch_size=worker_config.batch_size)
            if count == 0:
                await asyncio.sleep(worker_config.poll_interval)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_scheduled_worker())

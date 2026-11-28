from datetime import UTC, datetime
from uuid import UUID

from ddf.application.exceptions import UniqueConstraintViolationError
from ddf.infra.database.sqlalchemy.utils import get_constraint_name, is_unique_violation
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.scheduled import ScheduledMessage, ScheduledMessageStatus
from src.infra.database.models.scheduled import ScheduledMessageOrm


class SqlAlchemyScheduledMessageRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, entity: ScheduledMessage) -> ScheduledMessage:
        try:
            self._session.add(
                ScheduledMessageOrm(
                    id=entity.id,
                    created_at=entity.created_at,
                    updated_at=entity.updated_at,
                    deleted_at=entity.deleted_at,
                    conversation_id=entity.conversation_id,
                    organization_id=entity.organization_id,
                    sender_id=entity.sender_id,
                    payload=entity.payload,
                    send_at=entity.send_at,
                    status=entity.status.value,
                    client_message_id=entity.client_message_id,
                )
            )
            await self._session.flush()
        except IntegrityError as exc:
            if is_unique_violation(exc):
                raise UniqueConstraintViolationError(
                    f"Unique constraint violation: {get_constraint_name(exc)}.",
                ) from exc
            raise
        return entity

    async def read(self, scheduled_id: UUID) -> ScheduledMessage | None:
        stmt = select(ScheduledMessageOrm).where(
            ScheduledMessageOrm.id == scheduled_id,
            ScheduledMessageOrm.deleted_at.is_(None),
        )
        model = await self._session.scalar(stmt)
        return None if model is None else self._from_model(model)

    async def list_pending_for_conversation(
        self,
        conversation_id: UUID,
        *,
        sender_id: UUID | None = None,
    ) -> list[ScheduledMessage]:
        stmt = select(ScheduledMessageOrm).where(
            ScheduledMessageOrm.conversation_id == conversation_id,
            ScheduledMessageOrm.status == ScheduledMessageStatus.PENDING.value,
            ScheduledMessageOrm.deleted_at.is_(None),
        )
        if sender_id is not None:
            stmt = stmt.where(ScheduledMessageOrm.sender_id == sender_id)
        stmt = stmt.order_by(ScheduledMessageOrm.send_at)
        rows = (await self._session.scalars(stmt)).all()
        return [self._from_model(row) for row in rows]

    async def update(self, entity: ScheduledMessage) -> None:
        stmt = (
            update(ScheduledMessageOrm)
            .where(ScheduledMessageOrm.id == entity.id)
            .values(
                status=entity.status.value,
                updated_at=entity.updated_at,
            )
        )
        await self._session.execute(stmt)

    async def claim_due(self, *, limit: int, now: datetime | None = None) -> list[ScheduledMessage]:
        moment = now or datetime.now(UTC)
        stmt = (
            select(ScheduledMessageOrm)
            .where(
                ScheduledMessageOrm.status == ScheduledMessageStatus.PENDING.value,
                ScheduledMessageOrm.send_at <= moment,
                ScheduledMessageOrm.deleted_at.is_(None),
            )
            .order_by(ScheduledMessageOrm.send_at)
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
        rows = list((await self._session.scalars(stmt)).all())
        return [self._from_model(row) for row in rows]

    @staticmethod
    def _from_model(model: ScheduledMessageOrm) -> ScheduledMessage:
        return ScheduledMessage(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
            conversation_id=model.conversation_id,
            organization_id=model.organization_id,
            sender_id=model.sender_id,
            payload=model.payload,
            send_at=model.send_at,
            status=ScheduledMessageStatus(model.status),
            client_message_id=model.client_message_id,
        )

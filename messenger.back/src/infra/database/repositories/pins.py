from typing import Any
from uuid import UUID

from ddf.application.exceptions import UniqueConstraintViolationError
from ddf.infra.database.sqlalchemy.utils import get_constraint_name, is_unique_violation
from sqlalchemy import and_, delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.pins import MessagePin
from src.infra.database.models.messages import MessageOrm
from src.infra.database.models.pins import MessagePinOrm


class SqlAlchemyPinRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, entity: MessagePin) -> MessagePin:
        try:
            self._session.add(
                MessagePinOrm(
                    id=entity.id,
                    created_at=entity.created_at,
                    updated_at=entity.updated_at,
                    deleted_at=entity.deleted_at,
                    conversation_id=entity.conversation_id,
                    message_id=entity.message_id,
                    organization_id=entity.organization_id,
                    pinned_by=entity.pinned_by,
                    pinned_at=entity.pinned_at,
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

    async def get(
        self,
        *,
        conversation_id: UUID,
        message_id: UUID,
    ) -> MessagePin | None:
        stmt = select(MessagePinOrm).where(
            MessagePinOrm.conversation_id == conversation_id,
            MessagePinOrm.message_id == message_id,
            MessagePinOrm.deleted_at.is_(None),
        )
        model = await self._session.scalar(stmt)
        return None if model is None else self._from_model(model)

    async def delete(
        self,
        *,
        conversation_id: UUID,
        message_id: UUID,
    ) -> MessagePin | None:
        existing = await self.get(conversation_id=conversation_id, message_id=message_id)
        if existing is None:
            return None
        await self._session.execute(
            delete(MessagePinOrm).where(
                and_(
                    MessagePinOrm.conversation_id == conversation_id,
                    MessagePinOrm.message_id == message_id,
                )
            )
        )
        await self._session.flush()
        return existing

    async def list_for_conversation(
        self, conversation_id: UUID, *, history_from_seq: int,
    ) -> list[tuple[MessagePin, dict[str, Any]]]:
        stmt = (
            select(MessagePinOrm, MessageOrm.created_seq, MessageOrm.content)
            .join(MessageOrm, MessageOrm.id == MessagePinOrm.message_id)
            .where(
                MessagePinOrm.conversation_id == conversation_id,
                MessagePinOrm.deleted_at.is_(None),
                MessageOrm.conversation_id == conversation_id,
                MessageOrm.deleted_at.is_(None),
                MessageOrm.created_seq >= history_from_seq,
            )
            .order_by(MessagePinOrm.pinned_at.desc(), MessagePinOrm.id.desc())
        )
        result = await self._session.execute(stmt)
        return [(self._from_model(model, created_seq), content) for model, created_seq, content in result]

    @staticmethod
    def _from_model(model: MessagePinOrm, message_created_seq: int = 0) -> MessagePin:
        return MessagePin(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
            conversation_id=model.conversation_id,
            organization_id=model.organization_id,
            message_id=model.message_id,
            pinned_by=model.pinned_by,
            pinned_at=model.pinned_at,
            message_created_seq=message_created_seq,
        )

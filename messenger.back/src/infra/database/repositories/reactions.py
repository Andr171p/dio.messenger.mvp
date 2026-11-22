from uuid import UUID

from ddf.application.exceptions import UniqueConstraintViolationError
from ddf.infra.database.sqlalchemy.utils import get_constraint_name, is_unique_violation
from sqlalchemy import and_, delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.reactions import MessageReaction
from src.infra.database.models.reactions import MessageReactionOrm


class SqlAlchemyReactionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, entity: MessageReaction) -> MessageReaction:
        try:
            self._session.add(
                MessageReactionOrm(
                    id=entity.id,
                    created_at=entity.created_at,
                    updated_at=entity.updated_at,
                    deleted_at=entity.deleted_at,
                    message_id=entity.message_id,
                    conversation_id=entity.conversation_id,
                    organization_id=entity.organization_id,
                    actor_id=entity.actor_id,
                    emoji=entity.emoji,
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
        message_id: UUID,
        actor_id: UUID,
        emoji: str,
    ) -> MessageReaction | None:
        stmt = select(MessageReactionOrm).where(
            MessageReactionOrm.message_id == message_id,
            MessageReactionOrm.actor_id == actor_id,
            MessageReactionOrm.emoji == emoji,
            MessageReactionOrm.deleted_at.is_(None),
        )
        model = await self._session.scalar(stmt)
        return None if model is None else self._from_model(model)

    async def delete(
        self,
        *,
        message_id: UUID,
        actor_id: UUID,
        emoji: str,
    ) -> MessageReaction | None:
        existing = await self.get(message_id=message_id, actor_id=actor_id, emoji=emoji)
        if existing is None:
            return None
        await self._session.execute(
            delete(MessageReactionOrm).where(
                and_(
                    MessageReactionOrm.message_id == message_id,
                    MessageReactionOrm.actor_id == actor_id,
                    MessageReactionOrm.emoji == emoji,
                )
            )
        )
        await self._session.flush()
        return existing

    async def list_for_message(self, message_id: UUID) -> list[MessageReaction]:
        stmt = (
            select(MessageReactionOrm)
            .where(
                MessageReactionOrm.message_id == message_id,
                MessageReactionOrm.deleted_at.is_(None),
            )
            .order_by(MessageReactionOrm.created_at.asc())
        )
        result = await self._session.scalars(stmt)
        return [self._from_model(model) for model in result.all()]

    @staticmethod
    def _from_model(model: MessageReactionOrm) -> MessageReaction:
        return MessageReaction(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
            message_id=model.message_id,
            conversation_id=model.conversation_id,
            organization_id=model.organization_id,
            actor_id=model.actor_id,
            emoji=model.emoji,
            message_created_seq=0,
        )

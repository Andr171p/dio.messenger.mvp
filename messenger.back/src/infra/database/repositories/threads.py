from uuid import UUID

from ddf.application.exceptions import UniqueConstraintViolationError
from ddf.infra.database.sqlalchemy.utils import get_constraint_name, is_unique_violation
from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.threads import ConversationThread
from src.infra.database.models.threads import ConversationThreadOrm


class SqlAlchemyThreadRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, entity: ConversationThread) -> ConversationThread:
        try:
            self._session.add(
                ConversationThreadOrm(
                    id=entity.id,
                    created_at=entity.created_at,
                    updated_at=entity.updated_at,
                    deleted_at=entity.deleted_at,
                    conversation_id=entity.conversation_id,
                    organization_id=entity.organization_id,
                    root_message_id=entity.root_message_id,
                    title=entity.title,
                    event_seq=entity.event_seq,
                    created_by=entity.created_by,
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

    async def read(self, thread_id: UUID) -> ConversationThread | None:
        stmt = select(ConversationThreadOrm).where(
            ConversationThreadOrm.id == thread_id,
            ConversationThreadOrm.deleted_at.is_(None),
        )
        model = await self._session.scalar(stmt)
        return None if model is None else self._from_model(model)

    async def update(self, entity: ConversationThread) -> bool:
        statement = (
            update(ConversationThreadOrm)
            .where(ConversationThreadOrm.id == entity.id, ConversationThreadOrm.deleted_at.is_(None))
            .values(title=entity.title, updated_at=entity.updated_at, deleted_at=entity.deleted_at)
            .returning(ConversationThreadOrm.id)
        )
        return await self._session.scalar(statement) is not None

    async def get_by_root(
        self,
        *,
        conversation_id: UUID,
        root_message_id: UUID,
    ) -> ConversationThread | None:
        stmt = select(ConversationThreadOrm).where(
            ConversationThreadOrm.conversation_id == conversation_id,
            ConversationThreadOrm.root_message_id == root_message_id,
            ConversationThreadOrm.deleted_at.is_(None),
        )
        model = await self._session.scalar(stmt)
        return None if model is None else self._from_model(model)

    async def list_for_conversation(
        self,
        conversation_id: UUID,
        *,
        history_from_seq: int,
    ) -> list[ConversationThread]:
        from src.infra.database.models.messages import MessageOrm

        stmt = (
            select(ConversationThreadOrm)
            .outerjoin(MessageOrm, MessageOrm.id == ConversationThreadOrm.root_message_id)
            .where(
                ConversationThreadOrm.conversation_id == conversation_id,
                ConversationThreadOrm.deleted_at.is_(None),
                or_(
                    ConversationThreadOrm.root_message_id.is_(None),
                    MessageOrm.created_seq >= history_from_seq,
                ),
            )
            .order_by(ConversationThreadOrm.created_at.desc())
        )
        rows = (await self._session.scalars(stmt)).all()
        return [self._from_model(model) for model in rows]

    @staticmethod
    def _from_model(model: ConversationThreadOrm) -> ConversationThread:
        return ConversationThread(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
            conversation_id=model.conversation_id,
            organization_id=model.organization_id,
            root_message_id=model.root_message_id,
            title=model.title,
            event_seq=model.event_seq,
            created_by=model.created_by,
        )

from uuid import UUID

from ddf.infra.database.sqlalchemy import SqlAlchemyRepository
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.events import ConversationEvent
from src.domain.messages import Message
from src.infra.database.models import ConversationEventOrm, MessageOrm


class MessageMapper:
    @staticmethod
    def to_model(entity: Message) -> MessageOrm:
        return MessageOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            deleted_at=entity.deleted_at,
            conversation_id=entity.conversation_id,
            organization_id=entity.organization_id,
            sender_id=entity.sender_id,
            client_message_id=entity.client_message_id,
            created_seq=entity.created_seq,
            content=entity.content,
            revision=entity.revision,
            reply_to_id=entity.reply_to_id,
            thread_id=entity.thread_id,
            edited_at=entity.edited_at,
        )

    @staticmethod
    def from_model(model: MessageOrm) -> Message:
        return Message(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
            conversation_id=model.conversation_id,
            organization_id=model.organization_id,
            sender_id=model.sender_id,
            client_message_id=model.client_message_id,
            created_seq=model.created_seq,
            content=model.content,
            revision=model.revision,
            reply_to_id=model.reply_to_id,
            thread_id=model.thread_id,
            edited_at=model.edited_at,
        )


class SqlAlchemyMessageRepository(SqlAlchemyRepository[Message, MessageOrm]):
    model = MessageOrm
    data_mapper = MessageMapper()

    async def get_by_client_message_id(
        self,
        *,
        conversation_id: UUID,
        sender_id: UUID,
        client_message_id: UUID,
    ) -> Message | None:
        stmt = select(MessageOrm).where(
            MessageOrm.conversation_id == conversation_id,
            MessageOrm.sender_id == sender_id,
            MessageOrm.client_message_id == client_message_id,
        )
        model = await self._session.scalar(stmt)
        return None if model is None else self.data_mapper.from_model(model)

    async def get_history(
        self,
        *,
        conversation_id: UUID,
        before_seq: int | None,
        thread_id: UUID | None = None,
        main_only: bool = False,
        history_from_seq: int,
        limit: int,
    ) -> list[Message]:
        stmt = select(MessageOrm).where(
            MessageOrm.conversation_id == conversation_id,
            MessageOrm.created_seq >= history_from_seq,
        )
        if thread_id is not None:
            stmt = stmt.where(MessageOrm.thread_id == thread_id)
        elif main_only:
            stmt = stmt.where(MessageOrm.thread_id.is_(None))
        if before_seq is not None:
            stmt = stmt.where(MessageOrm.created_seq < before_seq)

        stmt = stmt.order_by(MessageOrm.created_seq.desc()).limit(limit)
        result = await self._session.scalars(stmt)
        items = [self.data_mapper.from_model(model) for model in result.all()]
        items.reverse()
        return items


class SqlAlchemyConversationEventStore:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def append(self, event: ConversationEvent) -> None:
        self._session.add(
            ConversationEventOrm(
                id=event.id,
                conversation_id=event.conversation_id,
                organization_id=event.organization_id,
                seq=event.seq,
                type=event.type,
                payload=event.payload,
                occurred_at=event.occurred_at,
            )
        )
        await self._session.flush()

    async def get_after(
        self,
        *,
        conversation_id: UUID,
        after_seq: int,
        history_from_seq: int,
        limit: int,
        min_retained_seq: int | None = None,
    ) -> list[ConversationEvent]:
        del min_retained_seq
        lower_bound = max(after_seq, history_from_seq - 1)
        stmt = (
            select(ConversationEventOrm)
            .where(
                ConversationEventOrm.conversation_id == conversation_id,
                ConversationEventOrm.seq > lower_bound,
            )
            .order_by(ConversationEventOrm.seq.asc())
            .limit(limit)
        )
        result = await self._session.scalars(stmt)
        return [
            ConversationEvent(
                id=model.id,
                conversation_id=model.conversation_id,
                organization_id=model.organization_id,
                seq=model.seq,
                type=model.type,
                payload=model.payload,
                occurred_at=model.occurred_at,
            )
            for model in result.all()
        ]

    async def min_seq(self, conversation_id: UUID) -> int | None:
        from sqlalchemy import func

        stmt = select(func.min(ConversationEventOrm.seq)).where(
            ConversationEventOrm.conversation_id == conversation_id,
        )
        return await self._session.scalar(stmt)

from uuid import UUID

from ddf.infra.database.sqlalchemy import SqlAlchemyRepository
from sqlalchemy import select

from src.domain.policies import ConversationPolicy
from src.infra.database.models.policies import ConversationPolicyOrm


class ConversationPolicyMapper:
    @staticmethod
    def to_model(entity: ConversationPolicy) -> ConversationPolicyOrm:
        return ConversationPolicyOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            deleted_at=entity.deleted_at,
            conversation_id=entity.conversation_id,
            organization_id=entity.organization_id,
            allow_external_members=entity.allow_external_members,
            allow_forwarding=entity.allow_forwarding,
            allow_attachments=entity.allow_attachments,
            allow_ai=entity.allow_ai,
            max_attachment_bytes=entity.max_attachment_bytes,
            message_edit_window_seconds=entity.message_edit_window_seconds,
            version=entity.version,
        )

    @staticmethod
    def from_model(model: ConversationPolicyOrm) -> ConversationPolicy:
        return ConversationPolicy(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
            conversation_id=model.conversation_id,
            organization_id=model.organization_id,
            allow_external_members=model.allow_external_members,
            allow_forwarding=model.allow_forwarding,
            allow_attachments=model.allow_attachments,
            allow_ai=model.allow_ai,
            max_attachment_bytes=model.max_attachment_bytes,
            message_edit_window_seconds=model.message_edit_window_seconds,
            version=model.version,
        )


class SqlAlchemyConversationPolicyRepository(
    SqlAlchemyRepository[ConversationPolicy, ConversationPolicyOrm]
):
    model = ConversationPolicyOrm
    data_mapper = ConversationPolicyMapper()

    async def get_for_conversation(self, conversation_id: UUID) -> ConversationPolicy | None:
        stmt = select(ConversationPolicyOrm).where(
            ConversationPolicyOrm.conversation_id == conversation_id,
            ConversationPolicyOrm.deleted_at.is_(None),
        )
        model = await self._session.scalar(stmt)
        return None if model is None else self.data_mapper.from_model(model)

    async def upsert(self, entity: ConversationPolicy) -> ConversationPolicy:
        existing = await self.get_for_conversation(entity.conversation_id)
        if existing is None:
            return await self.create(entity)

        entity.id = existing.id
        entity.created_at = existing.created_at
        await self.update(entity)
        return entity

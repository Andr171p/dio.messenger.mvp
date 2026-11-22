from uuid import UUID

from ddf.infra.database.sqlalchemy import SqlAlchemyRepository
from sqlalchemy import select

from src.domain.audit import AuditEvent
from src.infra.database.models.audit import AuditEventOrm


class AuditMapper:
    @staticmethod
    def to_model(entity: AuditEvent) -> AuditEventOrm:
        return AuditEventOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            deleted_at=entity.deleted_at,
            organization_id=entity.organization_id,
            actor_id=entity.actor_id,
            action=entity.action,
            conversation_id=entity.conversation_id,
            resource_type=entity.resource_type,
            resource_id=entity.resource_id,
            summary=entity.summary,
        )

    @staticmethod
    def from_model(model: AuditEventOrm) -> AuditEvent:
        return AuditEvent(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
            organization_id=model.organization_id,
            actor_id=model.actor_id,
            action=model.action,
            conversation_id=model.conversation_id,
            resource_type=model.resource_type,
            resource_id=model.resource_id,
            summary=model.summary,
        )


class SqlAlchemyAuditRepository(SqlAlchemyRepository[AuditEvent, AuditEventOrm]):
    model = AuditEventOrm
    data_mapper = AuditMapper()

    async def append(self, event: AuditEvent) -> AuditEvent:
        return await self.create(event)

    async def list_for_conversation(
        self,
        *,
        organization_id: UUID,
        conversation_id: UUID,
        limit: int,
    ) -> list[AuditEvent]:
        stmt = (
            select(AuditEventOrm)
            .where(
                AuditEventOrm.organization_id == organization_id,
                AuditEventOrm.conversation_id == conversation_id,
                AuditEventOrm.deleted_at.is_(None),
            )
            .order_by(AuditEventOrm.created_at.desc())
            .limit(limit)
        )
        result = await self._session.scalars(stmt)
        return [self.data_mapper.from_model(model) for model in result.all()]
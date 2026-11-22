from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.itsm import ContextLink
from src.infra.database.models.itsm import ContextLinkOrm


class ContextLinkMapper:
    @staticmethod
    def to_model(entity: ContextLink) -> ContextLinkOrm:
        return ContextLinkOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            deleted_at=entity.deleted_at,
            organization_id=entity.organization_id,
            conversation_id=entity.conversation_id,
            provider=entity.provider,
            resource_type=entity.resource_type,
            resource_id=entity.resource_id,
            created_by=entity.created_by,
        )

    @staticmethod
    def from_model(model: ContextLinkOrm) -> ContextLink:
        return ContextLink(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
            organization_id=model.organization_id,
            conversation_id=model.conversation_id,
            provider=model.provider,
            resource_type=model.resource_type,
            resource_id=model.resource_id,
            created_by=model.created_by,
        )


class SqlAlchemyContextLinkRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, entity: ContextLink) -> ContextLink:
        model = ContextLinkMapper.to_model(entity)
        self._session.add(model)
        await self._session.flush()
        return ContextLinkMapper.from_model(model)

    async def get_by_conversation(self, conversation_id: UUID) -> ContextLink | None:
        stmt = select(ContextLinkOrm).where(
            ContextLinkOrm.conversation_id == conversation_id,
            ContextLinkOrm.deleted_at.is_(None),
        )
        model = await self._session.scalar(stmt)
        return None if model is None else ContextLinkMapper.from_model(model)

    async def get_by_resource(
        self,
        *,
        organization_id: UUID,
        provider: str,
        resource_type: str,
        resource_id: str,
    ) -> ContextLink | None:
        stmt = select(ContextLinkOrm).where(
            ContextLinkOrm.organization_id == organization_id,
            ContextLinkOrm.provider == provider,
            ContextLinkOrm.resource_type == resource_type,
            ContextLinkOrm.resource_id == resource_id,
            ContextLinkOrm.deleted_at.is_(None),
        )
        model = await self._session.scalar(stmt)
        return None if model is None else ContextLinkMapper.from_model(model)

    async def delete(self, entity: ContextLink) -> None:
        model = await self._session.get(ContextLinkOrm, entity.id)
        if model is None:
            return
        await self._session.delete(model)
        await self._session.flush()

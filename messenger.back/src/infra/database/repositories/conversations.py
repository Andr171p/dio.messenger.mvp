from typing import override

from uuid import UUID

from ddf.infra.database.sqlalchemy import SqlAlchemyRepository
from sqlalchemy import and_, func, select, update

from src.domain.conversations import Conversation, ConversationType
from src.domain.memberships import ConversationMembership, MemberRole
from src.infra.database.models import ConversationMemberOrm, ConversationOrm


class ConversationMapper:
    @staticmethod
    def to_model(entity: Conversation) -> ConversationOrm:
        return ConversationOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            deleted_at=entity.deleted_at,
            organization_id=entity.organization_id,
            type=entity.type.value,
            title=entity.title,
            description=entity.description,
            avatar_url=entity.avatar_url,
            created_by=entity.created_by,
            last_event_seq=entity.last_event_seq,
        )

    @staticmethod
    def from_model(model: ConversationOrm) -> Conversation:
        return Conversation(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
            organization_id=model.organization_id,
            type=ConversationType(model.type),
            title=model.title,
            description=model.description,
            avatar_url=model.avatar_url,
            created_by=model.created_by,
            last_event_seq=model.last_event_seq,
        )


class MembershipMapper:
    @staticmethod
    def to_model(entity: ConversationMembership) -> ConversationMemberOrm:
        return ConversationMemberOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            deleted_at=entity.deleted_at,
            conversation_id=entity.conversation_id,
            organization_id=entity.organization_id,
            principal_id=entity.principal_id,
            role=entity.role.value,
            joined_at=entity.joined_at,
            left_at=entity.left_at,
            last_read_message_seq=entity.last_read_message_seq,
            last_delivered_message_seq=entity.last_delivered_message_seq,
            history_from_seq=entity.history_from_seq,
        )

    @staticmethod
    def from_model(model: ConversationMemberOrm) -> ConversationMembership:
        return ConversationMembership(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
            conversation_id=model.conversation_id,
            organization_id=model.organization_id,
            principal_id=model.principal_id,
            role=MemberRole(model.role),
            joined_at=model.joined_at,
            left_at=model.left_at,
            last_read_message_seq=model.last_read_message_seq,
            last_delivered_message_seq=model.last_delivered_message_seq,
            history_from_seq=model.history_from_seq,
        )


class SqlAlchemyConversationRepository(SqlAlchemyRepository[Conversation, ConversationOrm]):
    model = ConversationOrm
    data_mapper = ConversationMapper()

    @override
    async def read(self, uid: UUID, with_lock: bool = False) -> Conversation | None:
        stmt = select(ConversationOrm).where(
            ConversationOrm.id == uid,
            ConversationOrm.deleted_at.is_(None),
        )
        if with_lock:
            stmt = stmt.with_for_update()

        model = await self._session.scalar(stmt)
        return None if model is None else self.data_mapper.from_model(model)

    async def list_for_principal(
        self,
        *,
        organization_id: UUID,
        principal_id: UUID,
    ) -> list[Conversation]:
        stmt = (
            select(ConversationOrm)
            .join(
                ConversationMemberOrm,
                ConversationMemberOrm.conversation_id == ConversationOrm.id,
            )
            .where(
                ConversationOrm.organization_id == organization_id,
                ConversationOrm.deleted_at.is_(None),
                ConversationMemberOrm.principal_id == principal_id,
                ConversationMemberOrm.left_at.is_(None),
                ConversationMemberOrm.deleted_at.is_(None),
            )
            .order_by(ConversationOrm.updated_at.desc())
        )
        result = await self._session.scalars(stmt)
        return [self.data_mapper.from_model(model) for model in result.all()]

    async def find_direct_between(
        self,
        *,
        organization_id: UUID,
        principal_a: UUID,
        principal_b: UUID,
    ) -> Conversation | None:
        # A pair can open its first chat from both accounts simultaneously.
        first, second = sorted((principal_a, principal_b))
        pair_key = f"direct:{organization_id}:{first}:{second}"
        await self._session.execute(select(func.pg_advisory_xact_lock(func.hashtextextended(pair_key, 0))))
        member_a = ConversationMemberOrm.__table__.alias("member_a")
        member_b = ConversationMemberOrm.__table__.alias("member_b")

        stmt = (
            select(ConversationOrm)
            .join(member_a, member_a.c.conversation_id == ConversationOrm.id)
            .join(member_b, member_b.c.conversation_id == ConversationOrm.id)
            .where(
                ConversationOrm.organization_id == organization_id,
                ConversationOrm.type == ConversationType.DIRECT.value,
                ConversationOrm.deleted_at.is_(None),
                member_a.c.principal_id == principal_a,
                member_a.c.left_at.is_(None),
                member_a.c.deleted_at.is_(None),
                member_b.c.principal_id == principal_b,
                member_b.c.left_at.is_(None),
                member_b.c.deleted_at.is_(None),
            )
            .limit(1)
        )
        model = await self._session.scalar(stmt)
        return None if model is None else self.data_mapper.from_model(model)

    async def allocate_event_seq(self, conversation_id: UUID) -> int:
        from datetime import UTC, datetime

        stmt = select(ConversationOrm).where(ConversationOrm.id == conversation_id).with_for_update()
        model = await self._session.scalar(stmt)
        if model is None:
            raise ValueError(f"Conversation {conversation_id} not found for seq allocation")

        model.last_event_seq += 1
        model.updated_at = datetime.now(UTC)
        await self._session.flush()
        return int(model.last_event_seq)


class SqlAlchemyMembershipRepository(SqlAlchemyRepository[ConversationMembership, ConversationMemberOrm]):
    model = ConversationMemberOrm
    data_mapper = MembershipMapper()

    async def get_active(
        self,
        *,
        conversation_id: UUID,
        principal_id: UUID,
    ) -> ConversationMembership | None:
        stmt = select(ConversationMemberOrm).where(
            ConversationMemberOrm.conversation_id == conversation_id,
            ConversationMemberOrm.principal_id == principal_id,
            ConversationMemberOrm.left_at.is_(None),
            ConversationMemberOrm.deleted_at.is_(None),
        )
        model = await self._session.scalar(stmt)
        return None if model is None else self.data_mapper.from_model(model)

    async def list_active(self, conversation_id: UUID) -> list[ConversationMembership]:
        stmt = select(ConversationMemberOrm).where(
            ConversationMemberOrm.conversation_id == conversation_id,
            ConversationMemberOrm.left_at.is_(None),
            ConversationMemberOrm.deleted_at.is_(None),
        )
        result = await self._session.scalars(stmt)
        return [self.data_mapper.from_model(model) for model in result.all()]

    async def has_role(self, conversation_id: UUID, *, role: MemberRole) -> bool:
        stmt = (
            select(ConversationMemberOrm.id)
            .where(
                ConversationMemberOrm.conversation_id == conversation_id,
                ConversationMemberOrm.role == role.value,
                ConversationMemberOrm.left_at.is_(None),
                ConversationMemberOrm.deleted_at.is_(None),
            )
            .limit(1)
        )
        return await self._session.scalar(stmt) is not None

    async def update_read_cursor(
        self,
        *,
        conversation_id: UUID,
        principal_id: UUID,
        last_read_message_seq: int,
    ) -> None:
        stmt = (
            update(ConversationMemberOrm)
            .where(
                and_(
                    ConversationMemberOrm.conversation_id == conversation_id,
                    ConversationMemberOrm.principal_id == principal_id,
                    ConversationMemberOrm.left_at.is_(None),
                    ConversationMemberOrm.deleted_at.is_(None),
                )
            )
            .values(last_read_message_seq=last_read_message_seq)
        )
        await self._session.execute(stmt)

    async def update_delivery_cursor(
        self,
        *,
        conversation_id: UUID,
        principal_id: UUID,
        last_delivered_message_seq: int,
    ) -> None:
        stmt = (
            update(ConversationMemberOrm)
            .where(
                and_(
                    ConversationMemberOrm.conversation_id == conversation_id,
                    ConversationMemberOrm.principal_id == principal_id,
                    ConversationMemberOrm.left_at.is_(None),
                    ConversationMemberOrm.deleted_at.is_(None),
                )
            )
            .values(last_delivered_message_seq=last_delivered_message_seq)
        )
        await self._session.execute(stmt)

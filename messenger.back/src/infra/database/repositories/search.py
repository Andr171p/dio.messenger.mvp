from uuid import UUID

from sqlalchemy import exists, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from src.application.search.dtos import MessageSearchCriteria, SearchMessageHitDTO
from src.infra.database.models import ConversationMemberOrm, MessageMediaOrm, MessageOrm

from .messages import visible_thread_message

_SNIPPET_OPTIONS = "MaxFragments=1,MaxWords=24,MinWords=8,ShortWord=3"



def _message_has_resource_block(criteria: MessageSearchCriteria) -> text:
    return text(
        """
        EXISTS (
            SELECT 1
            FROM jsonb_array_elements(messages.content->'blocks') AS elem
            WHERE COALESCE(elem->>'type', '') = 'resource'
              AND elem->>'provider' = :resource_provider
              AND COALESCE(elem->>'resourceType', elem->>'resource_type', '') = :resource_type
              AND COALESCE(elem->>'resourceId', elem->>'resource_id', '') = :resource_id
        )
        """
    )


class SqlAlchemyMessageSearchRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def search(self, criteria: MessageSearchCriteria) -> list[SearchMessageHitDTO]:
        stmt = self._base_select(criteria).join(
            ConversationMemberOrm,
            ConversationMemberOrm.conversation_id == MessageOrm.conversation_id,
        )
        stmt = self._apply_acl(stmt, criteria, membership_joined=True)
        stmt = self._apply_filters(stmt, criteria)
        stmt = self._apply_rank_order(stmt, criteria)
        stmt = stmt.limit(criteria.limit)
        return await self._collect(stmt, criteria)

    async def search_in_conversation(
        self,
        *,
        conversation_id: UUID,
        criteria: MessageSearchCriteria,
    ) -> list[SearchMessageHitDTO]:
        del conversation_id
        stmt = self._base_select(criteria)
        stmt = stmt.where(
            MessageOrm.conversation_id == criteria.conversation_id,
            MessageOrm.organization_id == criteria.organization_id,
            MessageOrm.created_seq >= (criteria.history_from_seq or 1),
        )
        stmt = self._apply_filters(stmt, criteria)
        stmt = self._apply_rank_order(stmt, criteria)
        stmt = stmt.limit(criteria.limit)
        return await self._collect(stmt, criteria)

    def _base_select(self, criteria: MessageSearchCriteria) -> Select:
        rank_expr = self._rank_expr(criteria)
        snippet_expr = self._snippet_expr(criteria)
        return select(
            MessageOrm.id,
            MessageOrm.conversation_id,
            MessageOrm.sender_id,
            MessageOrm.created_seq,
            MessageOrm.created_at,
            snippet_expr.label("snippet"),
            rank_expr.label("rank"),
        ).select_from(MessageOrm).where(MessageOrm.deleted_at.is_(None), visible_thread_message())

    @staticmethod
    def _apply_acl(
        stmt: Select,
        criteria: MessageSearchCriteria,
        *,
        membership_joined: bool,
    ) -> Select:
        del membership_joined
        return stmt.where(
            ConversationMemberOrm.principal_id == criteria.principal_id,
            ConversationMemberOrm.organization_id == criteria.organization_id,
            ConversationMemberOrm.left_at.is_(None),
            ConversationMemberOrm.deleted_at.is_(None),
            MessageOrm.organization_id == criteria.organization_id,
            MessageOrm.created_seq >= ConversationMemberOrm.history_from_seq,
        )

    def _apply_filters(self, stmt: Select, criteria: MessageSearchCriteria) -> Select:
        if criteria.author_id is not None:
            stmt = stmt.where(MessageOrm.sender_id == criteria.author_id)
        if criteria.from_at is not None:
            stmt = stmt.where(MessageOrm.created_at >= criteria.from_at)
        if criteria.to_at is not None:
            stmt = stmt.where(MessageOrm.created_at <= criteria.to_at)
        if criteria.has_attachment is True:
            stmt = stmt.where(self._has_attachment_clause())
        elif criteria.has_attachment is False:
            stmt = stmt.where(~self._has_attachment_clause())
        if (
            criteria.resource_provider is not None
            and criteria.resource_type is not None
            and criteria.resource_id is not None
        ):
            stmt = stmt.where(
                _message_has_resource_block(criteria).bindparams(
                    resource_provider=criteria.resource_provider,
                    resource_type=criteria.resource_type,
                    resource_id=criteria.resource_id,
                )
            )
        if criteria.query:
            stmt = stmt.where(self._text_match_clause(criteria.query))
        return stmt

    @staticmethod
    def _has_attachment_clause():
        return or_(
            exists(
                select(1)
                .select_from(MessageMediaOrm)
                .where(MessageMediaOrm.message_id == MessageOrm.id)
            ),
            text(
                """
                EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(messages.content->'blocks') AS elem
                    WHERE COALESCE(elem->>'type', '') = 'media'
                )
                """
            ),
        )

    @staticmethod
    def _ts_query(query: str):
        return func.websearch_to_tsquery("russian", query)

    def _text_match_clause(self, query: str):
        ts_query = self._ts_query(query)
        return or_(
            MessageOrm.search_vector.op("@@")(ts_query),
            MessageOrm.search_text.op("%")(query),
            MessageOrm.search_text.ilike(f"%{query}%"),
        )

    def _rank_expr(self, criteria: MessageSearchCriteria):
        if not criteria.query:
            return func.literal(0.0)
        ts_query = self._ts_query(criteria.query)
        return func.coalesce(
            func.ts_rank_cd(MessageOrm.search_vector, ts_query),
            func.similarity(MessageOrm.search_text, criteria.query),
            0.0,
        )

    def _snippet_expr(self, criteria: MessageSearchCriteria):
        if not criteria.query:
            return func.left(MessageOrm.search_text, 200)
        ts_query = self._ts_query(criteria.query)
        return func.ts_headline(
            "russian",
            MessageOrm.search_text,
            ts_query,
            text(f"'{_SNIPPET_OPTIONS}'"),
        )

    def _apply_rank_order(self, stmt: Select, criteria: MessageSearchCriteria) -> Select:
        rank = self._rank_expr(criteria)
        if criteria.query:
            return stmt.order_by(rank.desc(), MessageOrm.created_seq.desc())
        return stmt.order_by(MessageOrm.created_seq.desc())

    async def _collect(self, stmt: Select, criteria: MessageSearchCriteria) -> list[SearchMessageHitDTO]:
        del criteria
        rows = await self._session.execute(stmt)
        return [
            SearchMessageHitDTO(
                id=row.id,
                conversation_id=row.conversation_id,
                sender_id=row.sender_id,
                created_seq=row.created_seq,
                created_at=row.created_at,
                snippet=str(row.snippet or ""),
                rank=float(row.rank) if row.rank is not None else None,
            )
            for row in rows.all()
        ]
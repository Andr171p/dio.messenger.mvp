from datetime import datetime
from uuid import UUID

from src.application.auth import AuthUser
from src.application.conversations.commands import require_active_membership
from src.application.conversations.repositories import ConversationRepository, MembershipRepository
from src.application.search.dtos import MessageSearchCriteria, SearchMessagesResultDTO
from src.application.search.exceptions import SearchQueryInvalidError
from src.application.search.repositories import MessageSearchRepository

DEFAULT_SEARCH_LIMIT = 20
MAX_SEARCH_LIMIT = 50
_MIN_TRGM_QUERY_LEN = 3


def _normalize_query(query: str | None) -> str | None:
    if query is None:
        return None
    normalized = query.strip()
    return normalized or None


async def search_messages(
    *,
    actor: AuthUser,
    q: str | None,
    conversation_id: UUID | None,
    author_id: UUID | None,
    from_at: datetime | None,
    to_at: datetime | None,
    has_attachment: bool | None,
    resource_provider: str | None,
    resource_type: str | None,
    resource_id: str | None,
    limit: int,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    search_repository: MessageSearchRepository,
) -> SearchMessagesResultDTO:
    page_limit = min(max(limit, 1), MAX_SEARCH_LIMIT)
    normalized_q = _normalize_query(q)

    if normalized_q is not None and len(normalized_q) < _MIN_TRGM_QUERY_LEN:
        raise SearchQueryInvalidError("Query must be at least 3 characters.")
    if from_at is not None and to_at is not None and from_at > to_at:
        raise SearchQueryInvalidError("`from` must be before `to`.")
    if resource_provider is None and resource_type is None and resource_id is None:
        linked_resource_filter = False
    else:
        linked_resource_filter = True
        if resource_provider is None or resource_type is None or resource_id is None:
            raise SearchQueryInvalidError(
                "Linked resource filter requires provider, resourceType, and resourceId."
            )

    if conversation_id is not None:
        await require_active_membership(
            conversation_id=conversation_id,
            actor=actor,
            conversation_repository=conversation_repository,
            membership_repository=membership_repository,
        )
        membership = await membership_repository.get_active(
            conversation_id=conversation_id,
            principal_id=actor.user.id,
        )
        if membership is None:
            raise SearchQueryInvalidError("Conversation not accessible.")

        criteria = MessageSearchCriteria(
            organization_id=actor.user.organization_id,
            principal_id=actor.user.id,
            conversation_id=conversation_id,
            history_from_seq=membership.history_from_seq,
            author_id=author_id,
            from_at=from_at,
            to_at=to_at,
            query=normalized_q,
            has_attachment=has_attachment,
            resource_provider=resource_provider if linked_resource_filter else None,
            resource_type=resource_type if linked_resource_filter else None,
            resource_id=resource_id if linked_resource_filter else None,
            limit=page_limit,
        )
        items = await search_repository.search_in_conversation(
            conversation_id=conversation_id,
            criteria=criteria,
        )
    else:
        criteria = MessageSearchCriteria(
            organization_id=actor.user.organization_id,
            principal_id=actor.user.id,
            author_id=author_id,
            from_at=from_at,
            to_at=to_at,
            query=normalized_q,
            has_attachment=has_attachment,
            resource_provider=resource_provider if linked_resource_filter else None,
            resource_type=resource_type if linked_resource_filter else None,
            resource_id=resource_id if linked_resource_filter else None,
            limit=page_limit,
        )
        items = await search_repository.search(criteria)

    return SearchMessagesResultDTO(items=items, limit=page_limit)

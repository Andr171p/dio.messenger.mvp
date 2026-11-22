import time
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status

from src.api.dependencies.auth import CurrentUser
from src.api.dependencies.conversations import ConversationRepositoryDep, MembershipRepositoryDep
from src.api.dependencies.search import MessageSearchRepositoryDep
from src.application.search import queries
from src.application.search.dtos import SearchMessagesResultDTO
from src.infra.observability.metrics import observe_search_latency

router = APIRouter(prefix="/v1/search", tags=["search"])


@router.get(
    "/messages",
    status_code=status.HTTP_200_OK,
    summary="Поиск сообщений (PostgreSQL FTS, ACL-safe)",
)
async def search_messages(
    auth: CurrentUser,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    search_repository: MessageSearchRepositoryDep,
    q: Annotated[str | None, Query(description="Текстовый запрос (мин. 3 символа).")] = None,
    conversation_id: Annotated[UUID | None, Query(alias="conversationId")] = None,
    author_id: Annotated[UUID | None, Query(alias="authorId")] = None,
    from_at: Annotated[datetime | None, Query(alias="from")] = None,
    to_at: Annotated[datetime | None, Query(alias="to")] = None,
    has_attachment: Annotated[bool | None, Query(alias="hasAttachment")] = None,
    resource_provider: Annotated[str | None, Query(alias="provider")] = None,
    resource_type: Annotated[str | None, Query(alias="resourceType")] = None,
    resource_id: Annotated[str | None, Query(alias="resourceId")] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = queries.DEFAULT_SEARCH_LIMIT,
) -> SearchMessagesResultDTO:
    started = time.perf_counter()
    try:
        return await queries.search_messages(
            actor=auth,
            q=q,
            conversation_id=conversation_id,
            author_id=author_id,
            from_at=from_at,
            to_at=to_at,
            has_attachment=has_attachment,
            resource_provider=resource_provider,
            resource_type=resource_type,
            resource_id=resource_id,
            limit=limit,
            conversation_repository=conversation_repository,
            membership_repository=membership_repository,
            search_repository=search_repository,
        )
    finally:
        observe_search_latency(time.perf_counter() - started)
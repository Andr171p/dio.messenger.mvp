"""Pure helpers to build ACL-aware search criteria (unit-testable)."""

from datetime import datetime
from uuid import UUID

from src.application.search.dtos import MessageSearchCriteria


def build_in_conversation_criteria(
    *,
    organization_id: UUID,
    principal_id: UUID,
    conversation_id: UUID,
    history_from_seq: int,
    query: str | None = None,
    author_id: UUID | None = None,
    from_at: datetime | None = None,
    to_at: datetime | None = None,
    has_attachment: bool | None = None,
    limit: int = 20,
) -> MessageSearchCriteria:
    return MessageSearchCriteria(
        organization_id=organization_id,
        principal_id=principal_id,
        conversation_id=conversation_id,
        history_from_seq=history_from_seq,
        author_id=author_id,
        from_at=from_at,
        to_at=to_at,
        query=query,
        has_attachment=has_attachment,
        limit=limit,
    )


def build_org_wide_criteria(
    *,
    organization_id: UUID,
    principal_id: UUID,
    query: str | None = None,
    author_id: UUID | None = None,
    from_at: datetime | None = None,
    to_at: datetime | None = None,
    has_attachment: bool | None = None,
    limit: int = 20,
) -> MessageSearchCriteria:
    return MessageSearchCriteria(
        organization_id=organization_id,
        principal_id=principal_id,
        author_id=author_id,
        from_at=from_at,
        to_at=to_at,
        query=query,
        has_attachment=has_attachment,
        limit=limit,
    )

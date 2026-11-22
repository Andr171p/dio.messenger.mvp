from uuid import UUID

from src.application.audit.dtos import AuditEventDTO
from src.application.audit.repositories import AuditRepository
from src.application.auth import AuthUser
from src.application.auth.exceptions import PermissionDeniedError
from src.application.conversations.repositories import MembershipRepository
from src.domain.memberships import MemberRole

DEFAULT_AUDIT_LIMIT = 100
MAX_AUDIT_LIMIT = 500


async def list_conversation_audit(
    *,
    conversation_id: UUID,
    actor: AuthUser,
    membership_repository: MembershipRepository,
    audit_repository: AuditRepository,
    limit: int = DEFAULT_AUDIT_LIMIT,
) -> list[AuditEventDTO]:
    if not actor.user.is_staff:
        raise PermissionDeniedError("Audit log is only available to staff.")

    membership = await membership_repository.get_active(
        conversation_id=conversation_id,
        principal_id=actor.user.id,
    )
    if not actor.is_admin and (
        membership is None or membership.role not in {MemberRole.OWNER, MemberRole.ADMIN}
    ):
        raise PermissionDeniedError("Insufficient permissions to view audit log.")

    page_limit = min(max(limit, 1), MAX_AUDIT_LIMIT)
    items = await audit_repository.list_for_conversation(
        organization_id=actor.user.organization_id,
        conversation_id=conversation_id,
        limit=page_limit,
    )
    return [AuditEventDTO.model_validate(item, from_attributes=True) for item in items]
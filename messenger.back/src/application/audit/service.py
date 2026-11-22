from typing import Any
from uuid import UUID

from src.application.audit.repositories import AuditRepository
from src.domain.audit import AuditEvent


async def log_audit(
    audit_repository: AuditRepository,
    *,
    organization_id: UUID,
    actor_id: UUID,
    action: str,
    resource_type: str,
    resource_id: str,
    conversation_id: UUID | None = None,
    summary: dict[str, Any] | None = None,
) -> AuditEvent:
    event = AuditEvent(
        organization_id=organization_id,
        actor_id=actor_id,
        action=action,
        conversation_id=conversation_id,
        resource_type=resource_type,
        resource_id=resource_id,
        summary=summary or {},
    )
    return await audit_repository.append(event)
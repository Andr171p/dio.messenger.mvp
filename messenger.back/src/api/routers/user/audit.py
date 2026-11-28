from typing import Annotated

from uuid import UUID

from fastapi import APIRouter, Query, status

from src.api.dependencies.audit import AuditRepositoryDep
from src.api.dependencies.auth import CurrentUser
from src.api.dependencies.conversations import MembershipRepositoryDep
from src.application.audit import queries
from src.application.audit.dtos import AuditEventDTO

router = APIRouter(prefix="/v1/audit", tags=["audit"])


@router.get(
    "",
    status_code=status.HTTP_200_OK,
    summary="Audit log беседы (staff owner/admin)",
)
async def list_audit(
    auth: CurrentUser,
    membership_repository: MembershipRepositoryDep,
    audit_repository: AuditRepositoryDep,
    conversation_id: Annotated[UUID, Query(alias="conversationId")],
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> list[AuditEventDTO]:
    return await queries.list_conversation_audit(
        conversation_id=conversation_id,
        actor=auth,
        membership_repository=membership_repository,
        audit_repository=audit_repository,
        limit=limit,
    )

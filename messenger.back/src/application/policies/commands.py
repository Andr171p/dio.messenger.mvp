from uuid import UUID

from ddf.application.uow import UnitOfWork

from src.application.audit.repositories import AuditRepository
from src.application.audit.service import log_audit
from src.application.auth import AuthUser
from src.application.auth.exceptions import PermissionDeniedError
from src.application.conversations.commands import require_active_membership
from src.application.conversations.repositories import ConversationRepository, MembershipRepository
from src.application.policies.dtos import ConversationPolicyDTO, UpdateConversationPolicyDTO
from src.application.policies.helpers import effective_policy
from src.application.policies.repositories import ConversationPolicyRepository
from src.domain.memberships import MemberRole
from src.domain.policies import ConversationPolicy


def _to_dto(policy: ConversationPolicy) -> ConversationPolicyDTO:
    return ConversationPolicyDTO(
        conversation_id=policy.conversation_id,
        allow_external_members=policy.allow_external_members,
        allow_forwarding=policy.allow_forwarding,
        allow_attachments=policy.allow_attachments,
        allow_ai=policy.allow_ai,
        max_attachment_bytes=policy.max_attachment_bytes,
        message_edit_window_seconds=policy.message_edit_window_seconds,
        version=policy.version,
    )


async def get_conversation_policy(
    conversation_id: UUID,
    *,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    policy_repository: ConversationPolicyRepository,
) -> ConversationPolicyDTO:
    conversation, _ = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    stored = await policy_repository.get_for_conversation(conversation_id)
    policy = effective_policy(
        stored,
        conversation_id=conversation.id,
        organization_id=conversation.organization_id,
    )
    return _to_dto(policy)


async def update_conversation_policy(  # noqa: C901
    conversation_id: UUID,
    dto: UpdateConversationPolicyDTO,
    *,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    policy_repository: ConversationPolicyRepository,
    uow: UnitOfWork,
    audit_repository: AuditRepository | None = None,
) -> ConversationPolicyDTO:
    conversation, membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    if membership.role not in {MemberRole.OWNER, MemberRole.ADMIN}:
        raise PermissionDeniedError("Insufficient permissions to update conversation policy.")
    if membership.role is MemberRole.GUEST:
        raise PermissionDeniedError("Guests cannot update conversation policy.")

    stored = await policy_repository.get_for_conversation(conversation_id)
    policy = effective_policy(
        stored,
        conversation_id=conversation.id,
        organization_id=conversation.organization_id,
    )

    if dto.allow_external_members is not None:
        policy.allow_external_members = dto.allow_external_members
    if dto.allow_forwarding is not None:
        policy.allow_forwarding = dto.allow_forwarding
    if dto.allow_attachments is not None:
        policy.allow_attachments = dto.allow_attachments
    if dto.allow_ai is not None:
        policy.allow_ai = dto.allow_ai
    if dto.max_attachment_bytes is not None:
        policy.max_attachment_bytes = dto.max_attachment_bytes
    if dto.message_edit_window_seconds is not None:
        policy.message_edit_window_seconds = dto.message_edit_window_seconds
    policy.version += 1 if stored is not None else 0
    if stored is None:
        policy.version = 1

    saved = await policy_repository.upsert(policy)
    if audit_repository is not None:
        await log_audit(
            audit_repository,
            organization_id=conversation.organization_id,
            actor_id=actor.user.id,
            action="conversation.policy.updated",
            conversation_id=conversation.id,
            resource_type="conversation_policy",
            resource_id=str(conversation.id),
            summary={"version": saved.version},
        )
    await uow.commit()
    return _to_dto(saved)

from __future__ import annotations

from typing import TYPE_CHECKING

from datetime import UTC, datetime
from uuid import UUID

from ddf.application.outbox import OutboxStore, save_events_to_outbox
from ddf.application.uow import UnitOfWork
from ddf.domain.exceptions import InvalidStateError

from src.application.auth import AuthUser
from src.application.auth.exceptions import PermissionDeniedError
from src.application.conversations.dtos import (
    AddMemberDTO,
    ConversationDTO,
    ConversationMemberDTO,
    CreateDirectConversationDTO,
    CreateGroupConversationDTO,
)
from src.application.conversations.exceptions import ConversationNotFoundError
from src.application.audit.repositories import AuditRepository
from src.application.audit.service import log_audit
from src.application.conversations.repositories import ConversationRepository, MembershipRepository
from src.application.policies.helpers import assert_external_members_allowed, effective_policy
from src.application.policies.repositories import ConversationPolicyRepository
from src.domain.conversations import Conversation, ConversationType
from src.domain.events import ConversationEvent
from src.domain.memberships import ConversationMembership, MemberRole
from src.domain.policies import default_conversation_policy

if TYPE_CHECKING:
    from src.application.messaging.repositories import ConversationEventStore


async def _conversation_dto(
    conversation: Conversation,
    *,
    membership_repository: MembershipRepository,
) -> ConversationDTO:
    has_external = await membership_repository.has_role(conversation.id, role=MemberRole.GUEST)
    return ConversationDTO(
        id=conversation.id,
        organization_id=conversation.organization_id,
        type=conversation.type,
        title=conversation.title,
        last_event_seq=conversation.last_event_seq,
        created_by=conversation.created_by,
        has_external_members=has_external,
    )


def _resolve_add_role(requested: MemberRole) -> MemberRole:
    if requested is MemberRole.OWNER:
        raise PermissionDeniedError("Cannot assign owner role via add member.")
    if requested is MemberRole.ADMIN:
        return MemberRole.ADMIN
    if requested is MemberRole.GUEST:
        return MemberRole.GUEST
    return MemberRole.MEMBER


async def create_group_conversation(
    dto: CreateGroupConversationDTO,
    *,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    policy_repository: ConversationPolicyRepository | None = None,
    uow: UnitOfWork,
) -> ConversationDTO:
    if actor.user.is_customer:
        raise PermissionDeniedError("Customers cannot create group conversations.")

    organization_id = actor.user.organization_id
    conversation = Conversation(
        organization_id=organization_id,
        type=ConversationType.GROUP,
        title=dto.title.strip(),
        created_by=actor.user.id,
    )
    await conversation_repository.create(conversation)

    now = datetime.now(UTC)
    await membership_repository.create(
        ConversationMembership(
            conversation_id=conversation.id,
            organization_id=organization_id,
            principal_id=actor.user.id,
            role=MemberRole.OWNER,
            joined_at=now,
            history_from_seq=1,
        )
    )

    guest_ids = set(dto.guest_ids)
    for member_id in dict.fromkeys([*dto.member_ids, *dto.guest_ids]):
        if member_id == actor.user.id:
            continue
        role = MemberRole.GUEST if member_id in guest_ids else MemberRole.MEMBER
        await membership_repository.create(
            ConversationMembership(
                conversation_id=conversation.id,
                organization_id=organization_id,
                principal_id=member_id,
                role=role,
                joined_at=now,
                history_from_seq=1,
            )
        )

    if policy_repository is not None:
        policy = default_conversation_policy(
            conversation_id=conversation.id,
            organization_id=organization_id,
        )
        if guest_ids:
            policy.allow_external_members = True
        await policy_repository.upsert(policy)

    await uow.commit()
    return await _conversation_dto(conversation, membership_repository=membership_repository)


async def create_direct_conversation(
    dto: CreateDirectConversationDTO,
    *,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    uow: UnitOfWork,
) -> ConversationDTO:
    if dto.peer_id == actor.user.id:
        raise InvalidStateError("Cannot create a direct conversation with yourself.")

    organization_id = actor.user.organization_id
    existing = await conversation_repository.find_direct_between(
        organization_id=organization_id,
        principal_a=actor.user.id,
        principal_b=dto.peer_id,
    )
    if existing is not None:
        return await _conversation_dto(existing, membership_repository=membership_repository)

    conversation = Conversation(
        organization_id=organization_id,
        type=ConversationType.DIRECT,
        title=None,
        created_by=actor.user.id,
    )
    await conversation_repository.create(conversation)

    now = datetime.now(UTC)
    for principal_id, role in (
        (actor.user.id, MemberRole.MEMBER),
        (dto.peer_id, MemberRole.MEMBER),
    ):
        await membership_repository.create(
            ConversationMembership(
                conversation_id=conversation.id,
                organization_id=organization_id,
                principal_id=principal_id,
                role=role,
                joined_at=now,
                history_from_seq=1,
            )
        )

    await uow.commit()
    return await _conversation_dto(conversation, membership_repository=membership_repository)


async def require_active_membership(
    *,
    conversation_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
) -> tuple[Conversation, ConversationMembership]:
    conversation = await conversation_repository.read(conversation_id)
    if conversation is None or conversation.organization_id != actor.user.organization_id:
        raise ConversationNotFoundError("Conversation not found.")

    membership = await membership_repository.get_active(
        conversation_id=conversation_id,
        principal_id=actor.user.id,
    )
    if membership is None:
        raise ConversationNotFoundError("Conversation not found.")

    return conversation, membership


def _can_manage_members(membership: ConversationMembership) -> bool:
    return membership.role in {MemberRole.OWNER, MemberRole.ADMIN}


async def add_member(
    dto: AddMemberDTO,
    *,
    conversation_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    event_store: ConversationEventStore,
    outbox_store: OutboxStore,
    uow: UnitOfWork,
    policy_repository: ConversationPolicyRepository | None = None,
    audit_repository: AuditRepository | None = None,
) -> ConversationMemberDTO:
    conversation, actor_membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    if conversation.type is ConversationType.DIRECT:
        raise PermissionDeniedError("Cannot add members to a direct conversation.")
    if not _can_manage_members(actor_membership):
        raise PermissionDeniedError("Insufficient permissions to add members.")
    if actor_membership.role is MemberRole.GUEST:
        raise PermissionDeniedError("Guests cannot manage members.")

    role = _resolve_add_role(dto.role)
    if role is MemberRole.GUEST and actor.user.is_customer:
        raise PermissionDeniedError("Customers cannot invite guests.")

    existing = await membership_repository.get_active(
        conversation_id=conversation_id,
        principal_id=dto.principal_id,
    )
    if existing is not None:
        return ConversationMemberDTO.model_validate(existing, from_attributes=True)

    if role is MemberRole.GUEST and policy_repository is not None:
        stored = await policy_repository.get_for_conversation(conversation.id)
        if stored is None:
            policy = default_conversation_policy(
                conversation_id=conversation.id,
                organization_id=conversation.organization_id,
            )
            policy.allow_external_members = True
            await policy_repository.upsert(policy)
        elif not stored.allow_external_members:
            assert_external_members_allowed(stored)

    history_from_seq = max(1, conversation.last_event_seq + 1)
    membership = ConversationMembership(
        conversation_id=conversation.id,
        organization_id=conversation.organization_id,
        principal_id=dto.principal_id,
        role=role,
        joined_at=datetime.now(UTC),
        history_from_seq=history_from_seq,
    )
    seq = await conversation_repository.allocate_event_seq(conversation.id)
    membership.register_joined(event_seq=seq)
    await membership_repository.create(membership)
    await event_store.append(
        ConversationEvent(
            conversation_id=conversation.id,
            organization_id=conversation.organization_id,
            seq=seq,
            type="member.joined",
            payload={
                "principalId": str(membership.principal_id),
                "eventSeq": seq,
                "historyFromSeq": membership.history_from_seq,
                "role": membership.role.value,
            },
        )
    )
    await save_events_to_outbox(outbox_store, membership)
    if audit_repository is not None:
        await log_audit(
            audit_repository,
            organization_id=conversation.organization_id,
            actor_id=actor.user.id,
            action="member.added",
            conversation_id=conversation.id,
            resource_type="membership",
            resource_id=str(membership.principal_id),
            summary={"role": membership.role.value},
        )
    await uow.commit()
    return ConversationMemberDTO.model_validate(membership, from_attributes=True)


async def remove_member(
    *,
    conversation_id: UUID,
    principal_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    event_store: ConversationEventStore,
    outbox_store: OutboxStore,
    uow: UnitOfWork,
    audit_repository: AuditRepository | None = None,
) -> None:
    conversation, actor_membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    if conversation.type is ConversationType.DIRECT:
        raise PermissionDeniedError("Cannot remove members from a direct conversation.")

    self_leave = principal_id == actor.user.id
    if not self_leave and not _can_manage_members(actor_membership):
        raise PermissionDeniedError("Insufficient permissions to remove members.")
    if not self_leave and actor_membership.role is MemberRole.GUEST:
        raise PermissionDeniedError("Guests cannot remove members.")

    target = await membership_repository.get_active(
        conversation_id=conversation_id,
        principal_id=principal_id,
    )
    if target is None:
        raise ConversationNotFoundError("Member not found.")
    if target.role is MemberRole.OWNER and not self_leave:
        raise PermissionDeniedError("Cannot remove the conversation owner.")

    seq = await conversation_repository.allocate_event_seq(conversation.id)
    target.left_at = datetime.now(UTC)
    target.updated_at = target.left_at
    target.register_removed(event_seq=seq, removed_by_id=actor.user.id)
    await membership_repository.update(target)
    await event_store.append(
        ConversationEvent(
            conversation_id=conversation.id,
            organization_id=conversation.organization_id,
            seq=seq,
            type="member.removed",
            payload={
                "principalId": str(target.principal_id),
                "eventSeq": seq,
                "removedById": str(actor.user.id),
            },
        )
    )
    await save_events_to_outbox(outbox_store, target)
    if audit_repository is not None:
        await log_audit(
            audit_repository,
            organization_id=conversation.organization_id,
            actor_id=actor.user.id,
            action="member.removed",
            conversation_id=conversation.id,
            resource_type="membership",
            resource_id=str(target.principal_id),
            summary={"removedById": str(actor.user.id)},
        )
    await uow.commit()

from typing import Any

from uuid import UUID

from src.application.auth import AuthUser
from src.application.auth.exceptions import PermissionDeniedError
from src.application.conversations.commands import require_active_membership
from src.application.conversations.repositories import ConversationRepository, MembershipRepository
from src.application.messaging.dtos import ForwardedFromRefDTO, SendMessageDTO
from src.application.messaging.enrich import snapshot_text_from_content
from src.application.messaging.exceptions import MessageContentInvalidError, MessageNotFoundError
from src.application.messaging.repositories import MessageRepository
from src.application.policies.helpers import assert_forwarding_allowed, effective_policy, is_guest_membership
from src.application.policies.repositories import ConversationPolicyRepository
from src.domain.memberships import ConversationMembership, MemberRole


async def validate_mentions(
    command: SendMessageDTO,
    *,
    conversation_id: UUID,
    membership: ConversationMembership,
    membership_repository: MembershipRepository,
) -> None:
    if command.mention_all:
        if is_guest_membership(membership):
            raise PermissionDeniedError("Guests cannot mention all.")
        if membership.role not in {MemberRole.OWNER, MemberRole.ADMIN}:
            raise PermissionDeniedError("Only owners and admins can mention all.")

    unique_mentions = list(dict.fromkeys(command.mentions))
    if not unique_mentions:
        return

    active = await membership_repository.list_active(conversation_id)
    active_ids = {item.principal_id for item in active}
    for principal_id in unique_mentions:
        if principal_id not in active_ids:
            raise MessageContentInvalidError("Mentioned principal is not an active member.")


async def resolve_forward_snapshot(
    ref: ForwardedFromRefDTO,
    *,
    dest_conversation_id: UUID,
    dest_organization_id: UUID,
    actor: AuthUser,
    actor_membership: ConversationMembership,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    message_repository: MessageRepository,
    policy_repository: ConversationPolicyRepository,
) -> dict[str, Any]:
    if is_guest_membership(actor_membership):
        raise PermissionDeniedError("Guests cannot forward messages.")

    stored = await policy_repository.get_for_conversation(dest_conversation_id)
    policy = effective_policy(
        stored,
        conversation_id=dest_conversation_id,
        organization_id=dest_organization_id,
    )
    assert_forwarding_allowed(policy)

    _source_conversation, source_membership = await require_active_membership(
        conversation_id=ref.conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )

    source_message = await message_repository.read(ref.message_id)
    if (
        source_message is None
        or source_message.conversation_id != ref.conversation_id
        or source_message.is_tombstone
    ):
        raise MessageNotFoundError("Forwarded message not found.")
    if source_message.created_seq < source_membership.history_from_seq:
        raise PermissionDeniedError("Forwarded message is outside your visible history.")

    return {
        "conversationId": str(ref.conversation_id),
        "messageId": str(ref.message_id),
        "text": snapshot_text_from_content(source_message.content),
    }

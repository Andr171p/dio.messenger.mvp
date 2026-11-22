from src.application.auth.exceptions import PermissionDeniedError
from src.domain.memberships import ConversationMembership, MemberRole
from src.domain.policies import ConversationPolicy, default_conversation_policy


def is_guest_membership(membership: ConversationMembership | None) -> bool:
    return membership is not None and membership.role is MemberRole.GUEST


def effective_policy(
    stored: ConversationPolicy | None,
    *,
    conversation_id,
    organization_id,
) -> ConversationPolicy:
    if stored is not None:
        return stored
    return default_conversation_policy(
        conversation_id=conversation_id,
        organization_id=organization_id,
    )


def assert_external_members_allowed(policy: ConversationPolicy) -> None:
    if not policy.allow_external_members:
        raise PermissionDeniedError("External members are not allowed in this conversation.")


def assert_forwarding_allowed(policy: ConversationPolicy) -> None:
    if not policy.allow_forwarding:
        raise PermissionDeniedError("Forwarding is disabled for this conversation.")


def assert_attachments_allowed(policy: ConversationPolicy) -> None:
    if not policy.allow_attachments:
        raise PermissionDeniedError("Attachments are disabled for this conversation.")


def is_media_visible_to_guest(*, message_seq: int | None, history_from_seq: int) -> bool:
    """Guests may access media only from messages at or after their history window."""
    if message_seq is None:
        return True
    return message_seq >= history_from_seq

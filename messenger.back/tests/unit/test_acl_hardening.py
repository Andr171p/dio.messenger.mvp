import asyncio
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from src.application.auth.dtos import PrincipalKind, principal_kind_from_roles
from src.application.auth.exceptions import PermissionDeniedError
from src.application.itsm.priority import is_p1_priority
from src.application.messaging.dtos import SendMessageDTO, TextBlock
from src.application.messaging.validate_send import validate_mentions
from src.application.policies.helpers import (
    assert_forwarding_allowed,
    is_guest_membership,
    is_media_visible_to_guest,
)
from src.application.search.criteria import build_in_conversation_criteria, build_org_wide_criteria
from src.domain.memberships import ConversationMembership, MemberRole
from src.domain.policies import default_conversation_policy


def _guest_membership() -> ConversationMembership:
    return ConversationMembership(
        conversation_id=uuid4(),
        organization_id=uuid4(),
        principal_id=uuid4(),
        role=MemberRole.GUEST,
        joined_at=datetime.now(UTC),
        history_from_seq=100,
    )


def test_guest_cannot_mention_all() -> None:
    membership = _guest_membership()
    command = SendMessageDTO(client_message_id=uuid4(), blocks=[TextBlock(text="ping")], mention_all=True)

    class _Repo:
        async def list_active(self, conversation_id):  # noqa: ARG002
            return [membership]

    with pytest.raises(PermissionDeniedError, match="Guests cannot mention all"):
        asyncio.run(
            validate_mentions(
                command,
                conversation_id=membership.conversation_id,
                membership=membership,
                membership_repository=_Repo(),  # type: ignore[arg-type]
            )
        )


def test_forwarding_policy_deny() -> None:
    policy = default_conversation_policy(conversation_id=uuid4(), organization_id=uuid4())
    policy.allow_forwarding = False
    with pytest.raises(PermissionDeniedError, match="Forwarding is disabled"):
        assert_forwarding_allowed(policy)


def test_principal_kind_customer() -> None:
    assert principal_kind_from_roles({"customer"}) is PrincipalKind.CUSTOMER
    assert principal_kind_from_roles({"customer_admin"}) is PrincipalKind.CUSTOMER


def test_is_p1_priority() -> None:
    assert is_p1_priority("P1") is True
    assert is_p1_priority("p1") is True
    assert is_p1_priority(1) is True
    assert is_p1_priority("P2") is False
    assert is_p1_priority(None) is False


def test_guest_media_history_visibility() -> None:
    assert is_media_visible_to_guest(message_seq=None, history_from_seq=50) is True
    assert is_media_visible_to_guest(message_seq=50, history_from_seq=50) is True
    assert is_media_visible_to_guest(message_seq=49, history_from_seq=50) is False


def test_is_guest_membership_roles() -> None:
    guest = _guest_membership()
    member = ConversationMembership(
        conversation_id=guest.conversation_id,
        organization_id=guest.organization_id,
        principal_id=uuid4(),
        role=MemberRole.MEMBER,
        joined_at=datetime.now(UTC),
    )
    assert is_guest_membership(guest) is True
    assert is_guest_membership(member) is False


def test_search_criteria_builders_carry_acl() -> None:
    org_id = uuid4()
    principal_id = uuid4()
    conv_id = uuid4()
    in_conv = build_in_conversation_criteria(
        organization_id=org_id,
        principal_id=principal_id,
        conversation_id=conv_id,
        history_from_seq=42,
        query="hello",
    )
    assert in_conv.history_from_seq == 42
    assert in_conv.conversation_id == conv_id

    org_wide = build_org_wide_criteria(
        organization_id=org_id,
        principal_id=principal_id,
        query="hello",
    )
    assert org_wide.history_from_seq is None
    assert org_wide.conversation_id is None
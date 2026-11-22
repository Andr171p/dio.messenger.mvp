from uuid import uuid4

from src.application.auth.dtos import PrincipalKind, principal_kind_from_roles
from src.application.policies.helpers import is_guest_membership
from src.domain.memberships import ConversationMembership, MemberRole


def test_principal_kind_customer_roles() -> None:
    assert principal_kind_from_roles({"customer"}) is PrincipalKind.CUSTOMER
    assert principal_kind_from_roles({"customer_admin"}) is PrincipalKind.CUSTOMER
    assert principal_kind_from_roles({"customer", "customer_admin"}) is PrincipalKind.CUSTOMER


def test_principal_kind_staff_roles() -> None:
    assert principal_kind_from_roles({"support_agent"}) is PrincipalKind.STAFF
    assert principal_kind_from_roles({"admin"}) is PrincipalKind.STAFF
    assert principal_kind_from_roles({"customer", "support_agent"}) is PrincipalKind.STAFF
    assert principal_kind_from_roles(set()) is PrincipalKind.STAFF


def test_is_guest_membership() -> None:
    guest = ConversationMembership(
        conversation_id=uuid4(),
        organization_id=uuid4(),
        principal_id=uuid4(),
        role=MemberRole.GUEST,
        joined_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
    )
    member = ConversationMembership(
        conversation_id=uuid4(),
        organization_id=uuid4(),
        principal_id=uuid4(),
        role=MemberRole.MEMBER,
        joined_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
    )
    assert is_guest_membership(guest) is True
    assert is_guest_membership(member) is False
    assert is_guest_membership(None) is False

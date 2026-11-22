from datetime import UTC, datetime
from uuid import uuid4

from src.application.audit.dtos import AuditEventDTO
from src.application.receipts.cursors import monotonic_receipt_cursor
from src.domain.audit import AuditEvent


def test_monotonic_delivery_cursor_increases_only_forward() -> None:
    next_seq, changed = monotonic_receipt_cursor(10, 25, upper_bound=100)
    assert next_seq == 25
    assert changed is True

    next_seq, changed = monotonic_receipt_cursor(25, 20, upper_bound=100)
    assert next_seq == 25
    assert changed is False


def test_monotonic_delivery_cursor_caps_at_upper_bound() -> None:
    next_seq, changed = monotonic_receipt_cursor(5, 999, upper_bound=50)
    assert next_seq == 50
    assert changed is True


def test_audit_event_dto_from_domain() -> None:
    now = datetime.now(UTC)
    event = AuditEvent(
        id=uuid4(),
        created_at=now,
        organization_id=uuid4(),
        actor_id=uuid4(),
        action="member.added",
        conversation_id=uuid4(),
        resource_type="membership",
        resource_id=str(uuid4()),
        summary={"role": "member"},
    )
    dto = AuditEventDTO.model_validate(event, from_attributes=True)
    assert dto.action == "member.added"
    assert dto.summary["role"] == "member"
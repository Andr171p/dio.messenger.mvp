from uuid import uuid4

from src.application.itsm.constants import DIODESK_PROVIDER, TICKET_RESOURCE_TYPE
from src.application.itsm.dtos import ResourcePreviewDTO, ResourceReference
from src.application.itsm.policies import apply_preview_visibility
from src.application.messaging.content import build_message_content, content_fingerprint
from src.application.messaging.dtos import ResourceBlock, TextBlock


def test_resource_block_in_message_content() -> None:
    ticket_id = uuid4()
    content = build_message_content(
        [
            TextBlock(text="see ticket"),
            ResourceBlock(
                provider=DIODESK_PROVIDER,
                resource_type=TICKET_RESOURCE_TYPE,
                resource_id=str(ticket_id),
                number="ROM-1",
            ),
        ]
    )
    assert content["blocks"][1]["type"] == "resource"
    assert content["blocks"][1]["resourceId"] == str(ticket_id)
    fp = content_fingerprint(content)
    assert fp[1][0] == "resource"


def test_guest_preview_strips_internal_fields() -> None:
    preview = ResourcePreviewDTO(
        ref=ResourceReference(
            provider=DIODESK_PROVIDER,
            resource_type=TICKET_RESOURCE_TYPE,
            resource_id=str(uuid4()),
        ),
        number="ROM-1",
        title="VPN",
        status="open",
        priority="high",
        ticket_type="Инцидент",
        assignee_display_name="Alice",
        access="full",
    )
    limited = apply_preview_visibility(preview, guest=True)
    assert limited.assignee_display_name is None
    assert limited.ticket_type is None
    assert limited.access == "limited"
    assert limited.number == "ROM-1"

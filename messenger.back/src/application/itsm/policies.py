from src.application.itsm.dtos import ResourcePreviewDTO
from src.domain.memberships import MemberRole


def is_guest_role(role: MemberRole | None) -> bool:
    return role is MemberRole.GUEST


def apply_preview_visibility(preview: ResourcePreviewDTO, *, guest: bool) -> ResourcePreviewDTO:
    if not guest:
        return preview
    return ResourcePreviewDTO(
        ref=preview.ref,
        number=preview.number,
        title=preview.title,
        status=preview.status,
        priority=preview.priority,
        ticket_type=None,
        assignee_display_name=None,
        access="limited",
    )

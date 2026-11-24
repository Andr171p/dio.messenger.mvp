from uuid import UUID

from src.application.auth import AuthUser
from src.application.auth.exceptions import PermissionDeniedError
from src.application.conversations.commands import require_active_membership
from src.application.conversations.repositories import ConversationRepository, MembershipRepository
from src.application.itsm.constants import DIODESK_PROVIDER, TICKET_RESOURCE_TYPE
from src.application.itsm.dtos import ContextLinkDTO, ResourcePreviewDTO, ResourceReference, TicketSuggestionDTO
from src.application.itsm.exceptions import ItsmNotFoundError, UnsupportedResourceError
from src.application.itsm.policies import is_guest_role
from src.application.itsm.ports import ResourcePreviewResolver
from src.application.itsm.repositories import ContextLinkRepository
from src.application.itsm.ticket_suggestion import (
    build_ticket_suggestion_fields,
    default_suggestion_priority,
    default_suggestion_ticket_type,
)
from src.application.messaging.exceptions import MessageNotFoundError
from src.application.messaging.repositories import MessageRepository
from src.domain.memberships import MemberRole


def _link_dto(link) -> ContextLinkDTO:  # noqa: ANN001
    return ContextLinkDTO(
        id=link.id,
        conversation_id=link.conversation_id,
        organization_id=link.organization_id,
        provider=link.provider,
        resource_type=link.resource_type,
        resource_id=link.resource_id,
        created_by=link.created_by,
    )


def _validate_ref(ref: ResourceReference) -> None:
    if ref.provider != DIODESK_PROVIDER or ref.resource_type != TICKET_RESOURCE_TYPE:
        raise UnsupportedResourceError("Only dio-desk ticket resources are supported.")
    try:
        UUID(ref.resource_id)
    except ValueError as exc:
        raise UnsupportedResourceError("resourceId must be a UUID.") from exc


async def get_resource_preview(
    ref: ResourceReference,
    *,
    actor: AuthUser,
    access_token: str,
    conversation_id: UUID | None,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    preview_resolver: ResourcePreviewResolver,
    include_activity: bool = False,
) -> ResourcePreviewDTO:
    _validate_ref(ref)
    guest = False
    if conversation_id is not None:
        _, membership = await require_active_membership(
            conversation_id=conversation_id,
            actor=actor,
            conversation_repository=conversation_repository,
            membership_repository=membership_repository,
        )
        guest = is_guest_role(membership.role)

    if include_activity:
        return await preview_resolver.preview(ref, access_token=access_token, guest=guest, include_activity=True)
    return await preview_resolver.preview(ref, access_token=access_token, guest=guest)


async def get_ticket_suggestion(
    conversation_id: UUID,
    message_id: UUID,
    *,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    message_repository: MessageRepository,
    context_link_repository: ContextLinkRepository,
) -> TicketSuggestionDTO:
    _, membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    if membership.role is MemberRole.GUEST:
        raise PermissionDeniedError("Guests cannot view ticket suggestions.")

    message = await message_repository.read(message_id)
    if message is None or message.conversation_id != conversation_id or message.is_tombstone:
        raise MessageNotFoundError("Message not found.")

    existing_link = await context_link_repository.get_by_conversation(conversation_id)
    fields = build_ticket_suggestion_fields(message.content)
    suggested = existing_link is None and fields is not None
    title: str | None = None
    description: str | None = None
    if fields is not None:
        title, description = fields

    return TicketSuggestionDTO(
        conversation_id=conversation_id,
        message_id=message_id,
        suggested=suggested,
        title=title,
        description=description,
        ticket_type=default_suggestion_ticket_type(),
        priority=default_suggestion_priority(),
    )


async def get_conversation_context_link(
    conversation_id: UUID,
    *,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    context_link_repository: ContextLinkRepository,
) -> ContextLinkDTO:
    await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    link = await context_link_repository.get_by_conversation(conversation_id)
    if link is None:
        raise ItsmNotFoundError("Conversation has no context link.")
    return _link_dto(link)

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from ddf.application.outbox import OutboxStore, save_events_to_outbox
from ddf.application.uow import UnitOfWork

from src.application.auth import Auth, AuthUser
from src.application.auth.exceptions import PermissionDeniedError
from src.application.conversations.commands import require_active_membership
from src.application.conversations.repositories import ConversationRepository, MembershipRepository
from src.application.itsm.constants import (
    DEFAULT_SUGGESTED_TICKET_TYPE,
    DIODESK_PROVIDER,
    TICKET_RESOURCE_TYPE,
)
from src.application.itsm.dtos import (
    ConfirmTicketSuggestionDTO,
    ContextLinkDTO,
    CreateContextLinkDTO,
    CreateTicketFromChatDTO,
    CreateTicketFromChatResultDTO,
    ProvisionContextConversationDTO,
    ProvisionContextConversationResultDTO,
    ResourceActionRequestDTO,
    ResourceActionResultDTO,
)
from src.application.itsm.exceptions import ContextLinkConflictError, UnsupportedResourceError
from src.application.itsm.priority import is_p1_priority
from src.application.itsm.ticket_suggestion import build_ticket_suggestion_fields, default_suggestion_priority
from src.application.itsm.ports import ResourceActionExecutor, TicketCreator
from src.application.audit.repositories import AuditRepository
from src.application.audit.service import log_audit
from src.application.itsm.repositories import ContextLinkRepository
from src.domain.conversations import Conversation, ConversationType
from src.domain.events import ConversationEvent
from src.domain.itsm import ContextLink
from src.domain.memberships import ConversationMembership, MemberRole
from src.domain.messages.logic import create_message

from src.application.messaging.exceptions import MessageNotFoundError
from src.application.messaging.repositories import ConversationEventStore, MessageRepository


def _validate_ticket_ref(provider: str, resource_type: str, resource_id: str) -> None:
    if provider != DIODESK_PROVIDER or resource_type != TICKET_RESOURCE_TYPE:
        raise UnsupportedResourceError("Only dio-desk ticket resources are supported.")
    try:
        UUID(resource_id)
    except ValueError as exc:
        raise UnsupportedResourceError("resourceId must be a UUID.") from exc


def _link_dto(link: ContextLink) -> ContextLinkDTO:
    return ContextLinkDTO(
        id=link.id,
        conversation_id=link.conversation_id,
        organization_id=link.organization_id,
        provider=link.provider,
        resource_type=link.resource_type,
        resource_id=link.resource_id,
        created_by=link.created_by,
    )


async def create_context_link(
    dto: CreateContextLinkDTO,
    *,
    conversation_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    context_link_repository: ContextLinkRepository,
    uow: UnitOfWork,
    audit_repository: AuditRepository | None = None,
) -> ContextLinkDTO:
    conversation, membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    if membership.role is MemberRole.GUEST:
        raise PermissionDeniedError("Guests cannot manage context links.")
    _validate_ticket_ref(dto.provider, dto.resource_type, dto.resource_id)

    existing = await context_link_repository.get_by_conversation(conversation_id)
    if existing is not None:
        if (
            existing.provider == dto.provider
            and existing.resource_type == dto.resource_type
            and existing.resource_id == dto.resource_id
        ):
            return _link_dto(existing)
        raise ContextLinkConflictError("Conversation already linked to another resource.")

    by_resource = await context_link_repository.get_by_resource(
        organization_id=conversation.organization_id,
        provider=dto.provider,
        resource_type=dto.resource_type,
        resource_id=dto.resource_id,
    )
    if by_resource is not None:
        raise ContextLinkConflictError("Resource is already linked to another conversation.")

    link = ContextLink(
        organization_id=conversation.organization_id,
        conversation_id=conversation.id,
        provider=dto.provider,
        resource_type=dto.resource_type,
        resource_id=dto.resource_id,
        created_by=actor.user.id,
    )
    await context_link_repository.create(link)
    if audit_repository is not None:
        await log_audit(
            audit_repository,
            organization_id=conversation.organization_id,
            actor_id=actor.user.id,
            action="context_link.created",
            conversation_id=conversation.id,
            resource_type=dto.resource_type,
            resource_id=dto.resource_id,
            summary={"provider": dto.provider},
        )
    await uow.commit()
    return _link_dto(link)


async def delete_context_link(
    *,
    conversation_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    context_link_repository: ContextLinkRepository,
    uow: UnitOfWork,
    audit_repository: AuditRepository | None = None,
) -> None:
    conversation, membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    if membership.role is MemberRole.GUEST:
        raise PermissionDeniedError("Guests cannot manage context links.")
    link = await context_link_repository.get_by_conversation(conversation_id)
    if link is None:
        return
    await context_link_repository.delete(link)
    if audit_repository is not None:
        await log_audit(
            audit_repository,
            organization_id=conversation.organization_id,
            actor_id=actor.user.id,
            action="context_link.deleted",
            conversation_id=conversation.id,
            resource_type=link.resource_type,
            resource_id=link.resource_id,
            summary={"provider": link.provider},
        )
    await uow.commit()


async def execute_resource_action(
    dto: ResourceActionRequestDTO,
    *,
    actor: AuthUser,
    access_token: str,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    event_store: ConversationEventStore,
    action_executor: ResourceActionExecutor,
    uow: UnitOfWork,
) -> ResourceActionResultDTO:
    _validate_ticket_ref(dto.ref.provider, dto.ref.resource_type, dto.ref.resource_id)
    conversation = None
    if dto.conversation_id is not None:
        conversation, membership = await require_active_membership(
            conversation_id=dto.conversation_id,
            actor=actor,
            conversation_repository=conversation_repository,
            membership_repository=membership_repository,
        )
        if membership.role is MemberRole.GUEST:
            raise PermissionDeniedError("Guests cannot execute ITSM actions.")

    result = await action_executor.execute(
        ref=dto.ref,
        action=dto.action,
        params=dto.params,
        access_token=access_token,
    )

    if conversation is not None:
        seq = await conversation_repository.allocate_event_seq(conversation.id)
        await event_store.append(
            ConversationEvent(
                conversation_id=conversation.id,
                organization_id=conversation.organization_id,
                seq=seq,
                type="resource.action_applied",
                payload={
                    "provider": dto.ref.provider,
                    "resourceType": dto.ref.resource_type,
                    "resourceId": dto.ref.resource_id,
                    "action": result.action,
                    "status": result.status,
                    "actorId": str(actor.user.id),
                    "number": result.number,
                },
            )
        )
        await uow.commit()

    return result


async def create_ticket_from_chat(
    dto: CreateTicketFromChatDTO,
    *,
    conversation_id: UUID,
    actor: AuthUser,
    access_token: str,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    context_link_repository: ContextLinkRepository,
    message_repository: MessageRepository,
    event_store: ConversationEventStore,
    outbox_store: OutboxStore,
    ticket_creator: TicketCreator,
    uow: UnitOfWork,
) -> CreateTicketFromChatResultDTO:
    conversation, membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    if membership.role is MemberRole.GUEST:
        raise PermissionDeniedError("Guests cannot create tickets from chat.")

    existing_link = await context_link_repository.get_by_conversation(conversation_id)
    if existing_link is not None:
        raise ContextLinkConflictError("Conversation already linked to a resource.")

    ticket_id, number, _status, title = await ticket_creator.create_ticket(
        title=dto.title.strip(),
        description=dto.description.strip(),
        ticket_type=dto.ticket_type,
        priority=dto.priority,
        reporter_id=actor.user.id,
        access_token=access_token,
    )

    link = ContextLink(
        organization_id=conversation.organization_id,
        conversation_id=conversation.id,
        provider=DIODESK_PROVIDER,
        resource_type=TICKET_RESOURCE_TYPE,
        resource_id=str(ticket_id),
        created_by=actor.user.id,
    )
    await context_link_repository.create(link)

    message_id: UUID | None = None
    if dto.post_resource_message:
        client_message_id = dto.client_request_id or uuid4()
        seq = await conversation_repository.allocate_event_seq(conversation.id)
        content: dict[str, Any] = {
            "blocks": [
                {"type": "text", "text": f"Создана заявка {number}: {title}"},
                {
                    "type": "resource",
                    "provider": DIODESK_PROVIDER,
                    "resourceType": TICKET_RESOURCE_TYPE,
                    "resourceId": str(ticket_id),
                    "number": number,
                },
            ]
        }
        message = create_message(
            conversation_id=conversation.id,
            organization_id=conversation.organization_id,
            sender_id=actor.user.id,
            client_message_id=client_message_id,
            created_seq=seq,
            content=content,
        )
        await message_repository.create(message)
        await event_store.append(
            ConversationEvent(
                conversation_id=conversation.id,
                organization_id=conversation.organization_id,
                seq=seq,
                type="message.created",
                payload={
                    "messageId": str(message.id),
                    "createdSeq": seq,
                    "eventSeq": seq,
                    "senderId": str(actor.user.id),
                    "clientMessageId": str(client_message_id),
                },
            )
        )
        await save_events_to_outbox(outbox_store, message)
        message_id = message.id

    await uow.commit()
    return CreateTicketFromChatResultDTO(
        ticket_id=ticket_id,
        number=number,
        link=_link_dto(link),
        message_id=message_id,
    )


def require_p1_priority(priority: str | int | None) -> None:
    if not is_p1_priority(priority):
        raise UnsupportedResourceError("priority must be P1 (p1, P1, or 1).")


async def provision_p1_context_conversation(
    dto: ProvisionContextConversationDTO,
    *,
    actor: Auth,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    context_link_repository: ContextLinkRepository,
    uow: UnitOfWork,
) -> ProvisionContextConversationResultDTO:
    if dto.priority is not None:
        require_p1_priority(dto.priority)
    return await provision_context_conversation(
        dto,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        context_link_repository=context_link_repository,
        uow=uow,
    )


async def confirm_ticket_suggestion(
    dto: ConfirmTicketSuggestionDTO,
    *,
    conversation_id: UUID,
    message_id: UUID,
    actor: AuthUser,
    access_token: str,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    context_link_repository: ContextLinkRepository,
    message_repository: MessageRepository,
    event_store: ConversationEventStore,
    outbox_store: OutboxStore,
    ticket_creator: TicketCreator,
    uow: UnitOfWork,
) -> CreateTicketFromChatResultDTO:
    _, membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    if membership.role is MemberRole.GUEST:
        raise PermissionDeniedError("Guests cannot create tickets from chat.")

    message = await message_repository.read(message_id)
    if message is None or message.conversation_id != conversation_id or message.is_tombstone:
        raise MessageNotFoundError("Message not found.")

    fields = build_ticket_suggestion_fields(message.content)
    title = (dto.title or (fields[0] if fields else None) or "").strip()
    description = (dto.description or (fields[1] if fields else None) or "").strip()
    if not title or not description:
        raise UnsupportedResourceError("Ticket title and description are required.")

    ticket_type = (dto.ticket_type or DEFAULT_SUGGESTED_TICKET_TYPE).strip()
    priority = (dto.priority or default_suggestion_priority()).strip()

    create_dto = CreateTicketFromChatDTO(
        title=title,
        description=description,
        ticket_type=ticket_type,
        priority=priority,
        client_request_id=dto.client_request_id,
        post_resource_message=dto.post_resource_message,
    )
    return await create_ticket_from_chat(
        create_dto,
        conversation_id=conversation_id,
        actor=actor,
        access_token=access_token,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        context_link_repository=context_link_repository,
        message_repository=message_repository,
        event_store=event_store,
        outbox_store=outbox_store,
        ticket_creator=ticket_creator,
        uow=uow,
    )


async def provision_context_conversation(
    dto: ProvisionContextConversationDTO,
    *,
    actor: Auth,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    context_link_repository: ContextLinkRepository,
    uow: UnitOfWork,
) -> ProvisionContextConversationResultDTO:
    _validate_ticket_ref(dto.context.provider, dto.context.resource_type, dto.context.resource_id)

    existing = await context_link_repository.get_by_resource(
        organization_id=dto.organization_id,
        provider=dto.context.provider,
        resource_type=dto.context.resource_type,
        resource_id=dto.context.resource_id,
    )
    if existing is not None:
        return ProvisionContextConversationResultDTO(
            conversation_id=existing.conversation_id,
            created=False,
            link=_link_dto(existing),
        )

    from datetime import UTC, datetime

    title = (dto.title or "").strip() or f"Ticket {dto.context.resource_id}"
    conversation = Conversation(
        organization_id=dto.organization_id,
        type=ConversationType.GROUP,
        title=title,
        created_by=dto.created_by,
    )
    await conversation_repository.create(conversation)

    now = datetime.now(UTC)
    member_ids = list(dict.fromkeys([dto.created_by, *dto.member_ids]))
    for index, principal_id in enumerate(member_ids):
        await membership_repository.create(
            ConversationMembership(
                conversation_id=conversation.id,
                organization_id=dto.organization_id,
                principal_id=principal_id,
                role=MemberRole.OWNER if index == 0 and principal_id == dto.created_by else MemberRole.MEMBER,
                joined_at=now,
                history_from_seq=1,
            )
        )

    link = ContextLink(
        organization_id=dto.organization_id,
        conversation_id=conversation.id,
        provider=dto.context.provider,
        resource_type=dto.context.resource_type,
        resource_id=dto.context.resource_id,
        created_by=dto.created_by,
    )
    await context_link_repository.create(link)
    await uow.commit()
    return ProvisionContextConversationResultDTO(
        conversation_id=conversation.id,
        created=True,
        link=_link_dto(link),
    )

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status

from src.api.dependencies.auth import BearerToken, CurrentUser
from src.api.dependencies.conversations import ConversationRepositoryDep, MembershipRepositoryDep
from src.api.dependencies.audit import AuditRepositoryDep
from src.api.dependencies.db import DBSession, OutboxDep
from src.api.dependencies.itsm import ContextLinkRepositoryDep, ItsmAdapterDep
from src.api.dependencies.messaging import ConversationEventStoreDep, MessageRepositoryDep
from src.application.itsm import commands, queries
from src.application.itsm.dtos import (
    ConfirmTicketSuggestionDTO,
    ContextLinkDTO,
    CreateContextLinkDTO,
    CreateTicketFromChatDTO,
    CreateTicketFromChatResultDTO,
    ResourceActionRequestDTO,
    ResourceActionResultDTO,
    ResourcePreviewDTO,
    ResourceReference,
    TicketSuggestionDTO,
)

router = APIRouter(tags=["itsm"])


@router.get(
    "/v1/resources/preview",
    status_code=status.HTTP_200_OK,
    summary="Безопасное превью ITSM-ресурса",
)
async def get_resource_preview(
    auth: CurrentUser,
    token: BearerToken,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    itsm: ItsmAdapterDep,
    provider: Annotated[str, Query(min_length=1)],
    resource_type: Annotated[str, Query(alias="resourceType", min_length=1)],
    resource_id: Annotated[str, Query(alias="resourceId", min_length=1)],
    conversation_id: Annotated[UUID | None, Query(alias="conversationId")] = None,
) -> ResourcePreviewDTO:
    return await queries.get_resource_preview(
        ResourceReference(provider=provider, resource_type=resource_type, resource_id=resource_id),
        actor=auth,
        access_token=token,
        conversation_id=conversation_id,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        preview_resolver=itsm,
    )


@router.post(
    "/v1/resources/actions",
    status_code=status.HTTP_200_OK,
    summary="Выполнить действие над ITSM-ресурсом от имени пользователя",
)
async def execute_resource_action(
    dto: ResourceActionRequestDTO,
    auth: CurrentUser,
    token: BearerToken,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    event_store: ConversationEventStoreDep,
    itsm: ItsmAdapterDep,
) -> ResourceActionResultDTO:
    return await commands.execute_resource_action(
        dto,
        actor=auth,
        access_token=token,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        event_store=event_store,
        action_executor=itsm,
        uow=session,
    )


@router.get(
    "/v1/conversations/{conversation_id}/context-link",
    status_code=status.HTTP_200_OK,
    summary="Primary context link беседы",
)
async def get_context_link(
    conversation_id: UUID,
    auth: CurrentUser,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    context_link_repository: ContextLinkRepositoryDep,
) -> ContextLinkDTO:
    return await queries.get_conversation_context_link(
        conversation_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        context_link_repository=context_link_repository,
    )


@router.put(
    "/v1/conversations/{conversation_id}/context-link",
    status_code=status.HTTP_200_OK,
    summary="Привязать беседу к ITSM-ресурсу",
)
async def put_context_link(
    conversation_id: UUID,
    dto: CreateContextLinkDTO,
    auth: CurrentUser,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    context_link_repository: ContextLinkRepositoryDep,
    audit_repository: AuditRepositoryDep,
) -> ContextLinkDTO:
    return await commands.create_context_link(
        dto,
        conversation_id=conversation_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        context_link_repository=context_link_repository,
        uow=session,
        audit_repository=audit_repository,
    )


@router.delete(
    "/v1/conversations/{conversation_id}/context-link",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Снять context link",
)
async def delete_context_link(
    conversation_id: UUID,
    auth: CurrentUser,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    context_link_repository: ContextLinkRepositoryDep,
    audit_repository: AuditRepositoryDep,
) -> None:
    await commands.delete_context_link(
        conversation_id=conversation_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        context_link_repository=context_link_repository,
        uow=session,
        audit_repository=audit_repository,
    )


@router.get(
    "/v1/conversations/{conversation_id}/messages/{message_id}/ticket-suggestion",
    status_code=status.HTTP_200_OK,
    summary="Рекомендация создать заявку из текста сообщения (staff)",
)
async def get_ticket_suggestion(
    conversation_id: UUID,
    message_id: UUID,
    auth: CurrentUser,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    message_repository: MessageRepositoryDep,
    context_link_repository: ContextLinkRepositoryDep,
) -> TicketSuggestionDTO:
    return await queries.get_ticket_suggestion(
        conversation_id,
        message_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        message_repository=message_repository,
        context_link_repository=context_link_repository,
    )


@router.post(
    "/v1/conversations/{conversation_id}/messages/{message_id}/ticket-suggestion/confirm",
    status_code=status.HTTP_201_CREATED,
    summary="Подтвердить создание заявки по рекомендации (без silent auto-create)",
)
async def confirm_ticket_suggestion(
    conversation_id: UUID,
    message_id: UUID,
    dto: ConfirmTicketSuggestionDTO,
    auth: CurrentUser,
    token: BearerToken,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    context_link_repository: ContextLinkRepositoryDep,
    message_repository: MessageRepositoryDep,
    event_store: ConversationEventStoreDep,
    outbox_store: OutboxDep,
    itsm: ItsmAdapterDep,
) -> CreateTicketFromChatResultDTO:
    return await commands.confirm_ticket_suggestion(
        dto,
        conversation_id=conversation_id,
        message_id=message_id,
        actor=auth,
        access_token=token,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        context_link_repository=context_link_repository,
        message_repository=message_repository,
        event_store=event_store,
        outbox_store=outbox_store,
        ticket_creator=itsm,
        uow=session,
    )


@router.post(
    "/v1/conversations/{conversation_id}/tickets",
    status_code=status.HTTP_201_CREATED,
    summary="Создать заявку DioDesk из беседы и привязать context link",
)
async def create_ticket_from_chat(
    conversation_id: UUID,
    dto: CreateTicketFromChatDTO,
    auth: CurrentUser,
    token: BearerToken,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    context_link_repository: ContextLinkRepositoryDep,
    message_repository: MessageRepositoryDep,
    event_store: ConversationEventStoreDep,
    outbox_store: OutboxDep,
    itsm: ItsmAdapterDep,
) -> CreateTicketFromChatResultDTO:
    return await commands.create_ticket_from_chat(
        dto,
        conversation_id=conversation_id,
        actor=auth,
        access_token=token,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        context_link_repository=context_link_repository,
        message_repository=message_repository,
        event_store=event_store,
        outbox_store=outbox_store,
        ticket_creator=itsm,
        uow=session,
    )

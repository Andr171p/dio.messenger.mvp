from typing import Annotated

import time
from uuid import UUID

from fastapi import APIRouter, Query, status

from src.api.dependencies.audit import AuditRepositoryDep
from src.api.dependencies.auth import CurrentUser
from src.api.dependencies.conversations import ConversationRepositoryDep, MembershipRepositoryDep
from src.api.dependencies.db import DBSession, OutboxDep
from src.api.dependencies.media import MediaRepositoryDep
from src.api.dependencies.messaging import ConversationEventStoreDep, MessageRepositoryDep
from src.api.dependencies.policies import ConversationPolicyRepositoryDep
from src.api.dependencies.reactions import ReactionRepositoryDep
from src.api.dependencies.realtime import EphemeralStoreDep
from src.api.dependencies.threads import ThreadRepositoryDep
from src.application.messaging import commands, queries
from src.application.messaging.dtos import (
    ConversationEventDTO,
    DeliveryCursorDTO,
    EditMessageDTO,
    MessageDTO,
    MessageReadersDTO,
    MessageReceiptRequestDTO,
    MessageReceiptSummaryDTO,
    ReadCursorDTO,
    SendMessageDTO,
)
from src.infra.observability.metrics import observe_send_ack_latency

router = APIRouter(prefix="/v1/conversations", tags=["messages"])


@router.post("/{conversation_id}/message-receipts")
async def message_receipt_summaries(
    conversation_id: UUID,
    dto: MessageReceiptRequestDTO,
    auth: CurrentUser,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    message_repository: MessageRepositoryDep,
) -> dict[UUID, MessageReceiptSummaryDTO]:
    return await queries.get_receipt_summaries(
        conversation_id,
        dto.message_ids,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        message_repository=message_repository,
    )


@router.get("/{conversation_id}/messages/{message_id}/readers")
async def message_readers(
    conversation_id: UUID,
    message_id: UUID,
    auth: CurrentUser,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    message_repository: MessageRepositoryDep,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> MessageReadersDTO:
    return await queries.get_message_readers(
        conversation_id,
        message_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        message_repository=message_repository,
        offset=offset,
        limit=limit,
    )


@router.post(
    "/{conversation_id}/messages",
    status_code=status.HTTP_201_CREATED,
    summary="Отправить сообщение (content blocks)",
)
async def create_message(
    conversation_id: UUID,
    dto: SendMessageDTO,
    auth: CurrentUser,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    message_repository: MessageRepositoryDep,
    event_store: ConversationEventStoreDep,
    media_repository: MediaRepositoryDep,
    policy_repository: ConversationPolicyRepositoryDep,
    outbox_store: OutboxDep,
    audit_repository: AuditRepositoryDep,
    thread_repository: ThreadRepositoryDep,
) -> MessageDTO:
    started = time.perf_counter()
    try:
        return await commands.send_message(
            dto,
            conversation_id=conversation_id,
            actor=auth,
            conversation_repository=conversation_repository,
            membership_repository=membership_repository,
            message_repository=message_repository,
            event_store=event_store,
            media_repository=media_repository,
            policy_repository=policy_repository,
            outbox_store=outbox_store,
            uow=session,
            audit_repository=audit_repository,
            thread_repository=thread_repository,
        )
    finally:
        observe_send_ack_latency(time.perf_counter() - started)


@router.patch(
    "/{conversation_id}/messages/{message_id}",
    status_code=status.HTTP_200_OK,
    summary="Редактировать своё сообщение",
)
async def edit_message(
    conversation_id: UUID,
    message_id: UUID,
    dto: EditMessageDTO,
    auth: CurrentUser,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    message_repository: MessageRepositoryDep,
    event_store: ConversationEventStoreDep,
    media_repository: MediaRepositoryDep,
    outbox_store: OutboxDep,
) -> MessageDTO:
    return await commands.edit_message(
        dto,
        conversation_id=conversation_id,
        message_id=message_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        message_repository=message_repository,
        event_store=event_store,
        media_repository=media_repository,
        outbox_store=outbox_store,
        uow=session,
    )


@router.delete(
    "/{conversation_id}/messages/{message_id}",
    status_code=status.HTTP_200_OK,
    summary="Удалить своё сообщение (tombstone)",
)
async def delete_message(
    conversation_id: UUID,
    message_id: UUID,
    auth: CurrentUser,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    message_repository: MessageRepositoryDep,
    event_store: ConversationEventStoreDep,
    outbox_store: OutboxDep,
) -> MessageDTO:
    return await commands.delete_message(
        conversation_id=conversation_id,
        message_id=message_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        message_repository=message_repository,
        event_store=event_store,
        outbox_store=outbox_store,
        uow=session,
    )


@router.put(
    "/{conversation_id}/read-cursor",
    status_code=status.HTTP_200_OK,
    summary="Обновить read cursor участника",
)
async def put_read_cursor(
    conversation_id: UUID,
    dto: ReadCursorDTO,
    auth: CurrentUser,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
) -> ReadCursorDTO:
    return await commands.update_read_cursor(
        dto,
        conversation_id=conversation_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        uow=session,
    )


@router.put(
    "/{conversation_id}/delivery-cursor",
    status_code=status.HTTP_200_OK,
    summary="Обновить delivery cursor участника",
)
async def put_delivery_cursor(
    conversation_id: UUID,
    dto: DeliveryCursorDTO,
    auth: CurrentUser,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    ephemeral_store: EphemeralStoreDep,
) -> DeliveryCursorDTO:
    return await commands.update_delivery_cursor(
        dto,
        conversation_id=conversation_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        uow=session,
        publish_delivery_updated=ephemeral_store.publish_delivery_updated,
    )


@router.get(
    "/{conversation_id}/messages",
    status_code=status.HTTP_200_OK,
    summary="История сообщений (keyset по beforeSeq)",
)
async def get_messages(
    conversation_id: UUID,
    auth: CurrentUser,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    message_repository: MessageRepositoryDep,
    reaction_repository: ReactionRepositoryDep,
    thread_id: Annotated[UUID | None, Query(alias="threadId")] = None,
    main_only: Annotated[bool, Query(alias="mainOnly")] = False,
    before_seq: Annotated[int | None, Query(alias="beforeSeq")] = None,
    around_message_id: Annotated[UUID | None, Query(alias="aroundMessageId")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[MessageDTO]:
    return await queries.get_history(
        conversation_id,
        actor=auth,
        before_seq=before_seq,
        thread_id=thread_id,
        main_only=main_only,
        around_message_id=around_message_id,
        reaction_repository=reaction_repository,
        limit=limit,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        message_repository=message_repository,
    )


@router.get(
    "/{conversation_id}/events",
    status_code=status.HTTP_200_OK,
    summary="Durable sync events после afterSeq",
)
async def get_events(
    conversation_id: UUID,
    auth: CurrentUser,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    event_store: ConversationEventStoreDep,
    after_seq: Annotated[int, Query(alias="afterSeq", ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[ConversationEventDTO]:
    return await queries.get_events(
        conversation_id,
        actor=auth,
        after_seq=after_seq,
        limit=limit,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        event_store=event_store,
    )

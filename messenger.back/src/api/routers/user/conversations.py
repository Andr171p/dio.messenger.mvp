from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response, status

from src.api.dependencies.auth import BearerToken, CurrentUser, iam_client
from src.api.dependencies.conversations import ConversationRepositoryDep, MembershipRepositoryDep
from src.api.dependencies.audit import AuditRepositoryDep
from src.api.dependencies.db import DBSession, OutboxDep
from src.api.dependencies.messaging import ConversationEventStoreDep, MessageRepositoryDep
from src.api.dependencies.policies import ConversationPolicyRepositoryDep
from src.api.dependencies.realtime import EphemeralStoreDep
from src.api.dependencies.reactions import ReactionRepositoryDep
from src.application.conversations import commands, queries
from src.application.conversations.dtos import (
    AddMemberDTO,
    ConversationDTO,
    ConversationMemberDTO,
    ConversationPresenceDTO,
    CreateDirectConversationDTO,
    CreateGroupConversationDTO,
    InviteCatalogUserDTO,
    UpdateGroupAvatarDTO,
)
from src.application.policies import commands as policy_commands
from src.application.policies.dtos import ConversationPolicyDTO, UpdateConversationPolicyDTO
from src.application.sync import queries as sync_queries
from src.application.sync.dtos import ConversationSnapshotDTO

router = APIRouter(prefix="/v1/conversations", tags=["conversations"])


@router.post("", status_code=status.HTTP_201_CREATED, summary="Создать групповую беседу")
async def create_group_conversation(
    dto: CreateGroupConversationDTO,
    auth: CurrentUser,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    policy_repository: ConversationPolicyRepositoryDep,
    session: DBSession,
) -> ConversationDTO:
    return await commands.create_group_conversation(
        dto,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        policy_repository=policy_repository,
        uow=session,
    )


@router.post("/direct", status_code=status.HTTP_201_CREATED, summary="Создать или получить DIRECT-беседу")
async def create_direct_conversation(
    dto: CreateDirectConversationDTO,
    auth: CurrentUser,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    session: DBSession,
) -> ConversationDTO:
    return await commands.create_direct_conversation(
        dto,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        uow=session,
    )


@router.get("", status_code=status.HTTP_200_OK, summary="Список бесед текущего пользователя")
async def list_conversations(
    auth: CurrentUser,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
) -> list[ConversationDTO]:
    return await queries.list_conversations(
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )


@router.put("/{conversation_id}/avatar", status_code=status.HTTP_204_NO_CONTENT)
async def update_group_avatar(
    conversation_id: UUID,
    dto: UpdateGroupAvatarDTO,
    auth: CurrentUser,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    event_store: ConversationEventStoreDep,
    session: DBSession,
) -> None:
    await commands.update_group_avatar(
        conversation_id, dto.avatar_url, actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        event_store=event_store, uow=session,
    )


@router.get("/{conversation_id}", status_code=status.HTTP_200_OK, summary="Получить беседу")
async def get_conversation(
    conversation_id: UUID,
    auth: CurrentUser,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
) -> ConversationDTO:
    return await queries.get_conversation(
        conversation_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )


@router.get(
    "/{conversation_id}/snapshot",
    status_code=status.HTTP_200_OK,
    summary="Snapshot беседы для resync после snapshot_required",
    tags=["sync"],
)
async def get_conversation_snapshot(
    conversation_id: UUID,
    auth: CurrentUser,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    message_repository: MessageRepositoryDep,
    reaction_repository: ReactionRepositoryDep,
    message_limit: Annotated[int, Query(alias="messageLimit", ge=1, le=100)] = 50,
) -> ConversationSnapshotDTO:
    return await sync_queries.get_conversation_snapshot(
        conversation_id,
        actor=auth,
        message_limit=message_limit,
        reaction_repository=reaction_repository,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        message_repository=message_repository,
    )


@router.get(
    "/{conversation_id}/members",
    status_code=status.HTTP_200_OK,
    summary="Участники беседы",
)
async def list_members(
    conversation_id: UUID,
    auth: CurrentUser,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
) -> list[ConversationMemberDTO]:
    return await queries.list_members(
        conversation_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )


@router.get("/{conversation_id}/presence", summary="Статусы активных участников беседы")
async def list_presence(
    conversation_id: UUID,
    response: Response,
    auth: CurrentUser,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    ephemeral_store: EphemeralStoreDep,
) -> list[ConversationPresenceDTO]:
    conversation, _ = await commands.require_active_membership(
        conversation_id=conversation_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    members = await membership_repository.list_active(conversation_id)
    user_ids = [member.principal_id for member in members]
    online = await ephemeral_store.online_users(conversation.organization_id, user_ids)
    response.headers["Cache-Control"] = "no-store"
    return [
        ConversationPresenceDTO(user_id=user_id, status="online" if user_id in online else "offline")
        for user_id in user_ids
    ]


@router.post(
    "/{conversation_id}/members",
    status_code=status.HTTP_201_CREATED,
    summary="Добавить участника в GROUP (role=guest для внешних)",
)
async def add_member(
    conversation_id: UUID,
    dto: AddMemberDTO,
    auth: CurrentUser,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    event_store: ConversationEventStoreDep,
    outbox_store: OutboxDep,
    policy_repository: ConversationPolicyRepositoryDep,
    audit_repository: AuditRepositoryDep,
) -> ConversationMemberDTO:
    return await commands.add_member(
        dto,
        conversation_id=conversation_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        event_store=event_store,
        outbox_store=outbox_store,
        uow=session,
        policy_repository=policy_repository,
        audit_repository=audit_repository,
    )


@router.delete(
    "/{conversation_id}/members/{principal_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить участника / выйти из GROUP",
)
async def remove_member(
    conversation_id: UUID,
    principal_id: UUID,
    auth: CurrentUser,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    event_store: ConversationEventStoreDep,
    outbox_store: OutboxDep,
    audit_repository: AuditRepositoryDep,
) -> None:
    await commands.remove_member(
        conversation_id=conversation_id,
        principal_id=principal_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        event_store=event_store,
        outbox_store=outbox_store,
        uow=session,
        audit_repository=audit_repository,
    )


@router.get(
    "/{conversation_id}/policy",
    status_code=status.HTTP_200_OK,
    summary="Effective conversation policy",
)
async def get_conversation_policy(
    conversation_id: UUID,
    auth: CurrentUser,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    policy_repository: ConversationPolicyRepositoryDep,
) -> ConversationPolicyDTO:
    return await policy_commands.get_conversation_policy(
        conversation_id,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        policy_repository=policy_repository,
    )


@router.patch(
    "/{conversation_id}/policy",
    status_code=status.HTTP_200_OK,
    summary="Обновить conversation policy (owner/admin)",
)
async def update_conversation_policy(
    conversation_id: UUID,
    dto: UpdateConversationPolicyDTO,
    auth: CurrentUser,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    policy_repository: ConversationPolicyRepositoryDep,
    audit_repository: AuditRepositoryDep,
) -> ConversationPolicyDTO:
    return await policy_commands.update_conversation_policy(
        conversation_id,
        dto,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        policy_repository=policy_repository,
        uow=session,
        audit_repository=audit_repository,
    )


catalog_router = APIRouter(prefix="/v1/directory", tags=["directory"])


@catalog_router.get(
    "/users",
    status_code=status.HTTP_200_OK,
    summary="Каталог пользователей Desk для invite",
)
async def search_invite_catalog(
    auth: CurrentUser,
    token: BearerToken,
    q: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[InviteCatalogUserDTO]:
    return await queries.search_invite_catalog(
        actor=auth,
        token=token,
        iam_client=iam_client,
        query=q,
        page=page,
        size=size,
    )

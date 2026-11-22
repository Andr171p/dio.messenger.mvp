from uuid import UUID

from src.application.auth import AuthUser
from src.application.conversations.commands import require_active_membership
from src.application.conversations.dtos import (
    ConversationDTO,
    ConversationMemberDTO,
    InviteCatalogUserDTO,
)
from src.application.conversations.repositories import ConversationRepository, MembershipRepository
from src.domain.memberships import MemberRole
from src.infra.services.iam.client import SrvIamClient


async def _to_conversation_dto(
    conversation,
    *,
    membership_repository: MembershipRepository,
) -> ConversationDTO:
    has_external = await membership_repository.has_role(conversation.id, role=MemberRole.GUEST)
    return ConversationDTO(
        id=conversation.id,
        organization_id=conversation.organization_id,
        type=conversation.type,
        title=conversation.title,
        last_event_seq=conversation.last_event_seq,
        created_by=conversation.created_by,
        has_external_members=has_external,
    )


async def list_conversations(
    *,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
) -> list[ConversationDTO]:
    items = await conversation_repository.list_for_principal(
        organization_id=actor.user.organization_id,
        principal_id=actor.user.id,
    )
    return [
        await _to_conversation_dto(item, membership_repository=membership_repository)
        for item in items
    ]


async def get_conversation(
    conversation_id: UUID,
    *,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
) -> ConversationDTO:
    conversation, _ = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    return await _to_conversation_dto(conversation, membership_repository=membership_repository)


async def list_members(
    conversation_id: UUID,
    *,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
) -> list[ConversationMemberDTO]:
    await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    members = await membership_repository.list_active(conversation_id)
    return [ConversationMemberDTO.model_validate(member, from_attributes=True) for member in members]


async def search_invite_catalog(
    *,
    actor: AuthUser,
    token: str,
    iam_client: SrvIamClient,
    query: str | None = None,
    page: int = 1,
    size: int = 20,
) -> list[InviteCatalogUserDTO]:
    if actor.user.is_customer:
        from src.application.auth.exceptions import PermissionDeniedError

        raise PermissionDeniedError("Customers cannot search the invite catalog.")

    users = await iam_client.search_users(token, query=query, page=page, size=size)
    return [
        InviteCatalogUserDTO(
            id=user.id,
            email=str(user.email),
            full_name=user.full_name,
            username=user.username,
            roles=sorted(user.roles),
            counterparty_id=user.counterparty_id,
            principal_kind=user.principal_kind.value,
        )
        for user in users
    ]

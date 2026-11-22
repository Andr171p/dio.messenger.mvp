from fastapi import APIRouter, status

from src.api.dependencies.auth import CurrentClient
from src.api.dependencies.conversations import ConversationRepositoryDep, MembershipRepositoryDep
from src.api.dependencies.db import DBSession
from src.api.dependencies.itsm import ContextLinkRepositoryDep
from src.application.itsm import commands
from src.application.itsm.dtos import (
    ProvisionContextConversationDTO,
    ProvisionContextConversationResultDTO,
)

router = APIRouter(prefix="/v1/service", tags=["service-itsm"])


@router.post(
    "/context-conversations",
    status_code=status.HTTP_200_OK,
    summary="Идемпотентно создать GROUP-чат под ITSM-ресурс",
)
async def provision_context_conversation(
    dto: ProvisionContextConversationDTO,
    auth: CurrentClient,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    context_link_repository: ContextLinkRepositoryDep,
) -> ProvisionContextConversationResultDTO:
    return await commands.provision_context_conversation(
        dto,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        context_link_repository=context_link_repository,
        uow=session,
    )


@router.post(
    "/incidents/p1-provision",
    status_code=status.HTTP_200_OK,
    summary="Идемпотентный incident room для P1-заявки (priority must be P1 if set)",
)
async def provision_p1_context_conversation(
    dto: ProvisionContextConversationDTO,
    auth: CurrentClient,
    session: DBSession,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    context_link_repository: ContextLinkRepositoryDep,
) -> ProvisionContextConversationResultDTO:
    return await commands.provision_p1_context_conversation(
        dto,
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        context_link_repository=context_link_repository,
        uow=session,
    )

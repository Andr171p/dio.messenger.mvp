from fastapi import APIRouter, status

from src.api.dependencies.auth import CurrentUser
from src.api.dependencies.conversations import ConversationRepositoryDep, MembershipRepositoryDep
from src.application.sync import queries
from src.application.sync.dtos import SyncManifestDTO

router = APIRouter(prefix="/v1/sync", tags=["sync"])


@router.get(
    "/manifest",
    status_code=status.HTTP_200_OK,
    summary="Manifest доступных бесед и high-water marks",
)
async def get_sync_manifest(
    auth: CurrentUser,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
) -> SyncManifestDTO:
    return await queries.get_sync_manifest(
        actor=auth,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )

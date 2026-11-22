from uuid import UUID

from src.application.auth import AuthUser
from src.application.conversations.commands import require_active_membership
from src.application.conversations.repositories import ConversationRepository, MembershipRepository
from src.application.media.commands import _to_asset_dto
from src.application.media.dtos import MediaAssetDTO
from src.application.media.exceptions import MediaAccessDeniedError, MediaNotFoundError
from src.application.media.repositories import MediaRepository
from src.domain.media import MediaStatus


async def get_media_asset(
    asset_id: UUID,
    *,
    actor: AuthUser,
    media_repository: MediaRepository,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
) -> MediaAssetDTO:
    asset = await media_repository.read(asset_id)
    if asset is None or asset.organization_id != actor.user.organization_id:
        raise MediaNotFoundError("Media asset not found.")
    if asset.status is MediaStatus.DELETED:
        raise MediaNotFoundError("Media asset not found.")

    await require_active_membership(
        conversation_id=asset.conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    if asset.status is MediaStatus.PENDING and asset.owner_id != actor.user.id:
        raise MediaAccessDeniedError("Pending upload is visible only to the owner.")
    return _to_asset_dto(asset)

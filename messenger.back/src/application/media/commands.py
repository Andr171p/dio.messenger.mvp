from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from ddf.application.uow import UnitOfWork
from ddf.infra.s3 import S3Client

from src.application.auth import AuthUser
from src.application.conversations.commands import require_active_membership
from src.application.conversations.repositories import ConversationRepository, MembershipRepository
from src.application.media.config import MediaConfig
from src.application.media.dtos import (
    CreateUploadDTO,
    MediaAccessDTO,
    MediaAccessRequestDTO,
    MediaAssetDTO,
    UploadResponseDTO,
)
from src.application.media.exceptions import MediaAccessDeniedError, MediaNotFoundError
from src.application.media.metadata import parse_media_meta
from src.application.media.policies import validate_upload_request
from src.application.media.repositories import MediaRepository
from src.application.policies.helpers import is_guest_membership, is_media_visible_to_guest
from src.domain.media import MediaAsset, MediaObject, MediaObjectRole, MediaStatus, UploadTargetType


def _staging_key(*, organization_id: UUID, asset_id: UUID) -> str:
    return f"messenger/staging/{organization_id}/{asset_id}"


def _to_asset_dto(asset: MediaAsset) -> MediaAssetDTO:
    return MediaAssetDTO(
        id=asset.id,
        organization_id=asset.organization_id,
        owner_id=asset.owner_id,
        filename=asset.filename,
        content_type=asset.content_type,
        size=asset.size,
        status=asset.status,
        target_type=asset.target_type.value,
        conversation_id=asset.conversation_id,
        meta=parse_media_meta(asset.meta),
        created_at=asset.created_at,
    )


async def initiate_upload(
    dto: CreateUploadDTO,
    *,
    actor: AuthUser,
    media_repository: MediaRepository,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    storage: S3Client,
    uow: UnitOfWork,
    config: MediaConfig | None = None,
) -> UploadResponseDTO:
    settings = config or MediaConfig()
    validate_upload_request(
        filename=dto.filename,
        content_type=dto.content_type,
        size=dto.size,
        config=settings,
    )
    await require_active_membership(
        conversation_id=dto.target.conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )

    asset_id = uuid4()
    object_id = uuid4()
    object_key = _staging_key(organization_id=actor.user.organization_id, asset_id=asset_id)
    target_type = UploadTargetType(dto.target.type)
    asset = MediaAsset(
        id=asset_id,
        organization_id=actor.user.organization_id,
        owner_id=actor.user.id,
        filename=dto.filename.strip(),
        content_type=dto.content_type,
        size=dto.size,
        status=MediaStatus.PENDING,
        target_type=target_type,
        conversation_id=dto.target.conversation_id,
        objects=[
            MediaObject(
                id=object_id,
                asset_id=asset_id,
                role=MediaObjectRole.STAGING,
                key=object_key,
                content_type=dto.content_type,
                size=dto.size,
            )
        ],
    )
    upload_url = await storage.create_upload_url(
        object_key,
        dto.content_type,
        expires_in=settings.upload_url_expires_in,
    )
    await media_repository.create(asset)
    await uow.commit()
    return UploadResponseDTO(
        upload_id=asset.id,
        asset=_to_asset_dto(asset),
        upload_url=upload_url,
        expires_in=settings.upload_url_expires_in,
    )


async def complete_upload(
    upload_id: UUID,
    *,
    actor: AuthUser,
    media_repository: MediaRepository,
    storage: S3Client,
    uow: UnitOfWork,
) -> MediaAssetDTO:
    asset = await media_repository.read(upload_id)
    if asset is None or asset.organization_id != actor.user.organization_id:
        raise MediaNotFoundError("Media upload not found.")
    if asset.owner_id != actor.user.id:
        raise MediaAccessDeniedError("Only the owner can complete the upload.")
    if asset.status in {MediaStatus.READY, MediaStatus.UPLOADED, MediaStatus.SCANNING}:
        return _to_asset_dto(asset)
    if asset.status is not MediaStatus.PENDING:
        raise MediaAccessDeniedError("Upload cannot be completed from current status.")

    staging = asset.object_for(MediaObjectRole.STAGING)
    if staging is None:
        raise MediaNotFoundError("Staging object not found.")

    meta = await storage.get_metadata(staging.key)
    asset.mark_uploaded(size=meta.size, content_type=meta.content_type or asset.content_type)
    asset.objects = [
        MediaObject(
            id=staging.id,
            asset_id=asset.id,
            role=MediaObjectRole.ORIGINAL,
            key=staging.key,
            content_type=asset.content_type,
            size=asset.size,
        )
    ]
    await media_repository.update(asset)
    await uow.commit()
    return _to_asset_dto(asset)


async def cancel_upload(
    upload_id: UUID,
    *,
    actor: AuthUser,
    media_repository: MediaRepository,
    storage: S3Client,
    uow: UnitOfWork,
) -> None:
    asset = await media_repository.read(upload_id)
    if asset is None or asset.organization_id != actor.user.organization_id:
        raise MediaNotFoundError("Media upload not found.")
    if asset.owner_id != actor.user.id:
        raise MediaAccessDeniedError("Only the owner can cancel the upload.")
    if asset.status not in {MediaStatus.PENDING, MediaStatus.UPLOADED}:
        raise MediaAccessDeniedError("Only incomplete uploads can be cancelled.")

    staging = asset.object_for(MediaObjectRole.STAGING) or asset.primary_object()
    if staging is not None:
        await storage.delete(staging.key)

    asset.mark_deleted()
    await media_repository.update(asset)
    await uow.commit()


async def create_access_url(
    asset_id: UUID,
    dto: MediaAccessRequestDTO | None = None,
    *,
    actor: AuthUser,
    media_repository: MediaRepository,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    storage: S3Client,
    config: MediaConfig | None = None,
) -> MediaAccessDTO:
    settings = config or MediaConfig()
    request = dto or MediaAccessRequestDTO()
    asset = await media_repository.read(asset_id)
    if asset is None or asset.organization_id != actor.user.organization_id:
        raise MediaNotFoundError("Media asset not found.")
    if asset.status is not MediaStatus.READY:
        raise MediaAccessDeniedError("Media asset is not ready for download.")

    _, membership = await require_active_membership(
        conversation_id=asset.conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )

    if is_guest_membership(membership):
        message_seq = await media_repository.get_attached_message_seq(asset_id)
        if not is_media_visible_to_guest(
            message_seq=message_seq,
            history_from_seq=membership.history_from_seq,
        ):
            raise MediaAccessDeniedError("Media is outside guest history visibility.")

    role = MediaObjectRole(request.role)
    media_object = asset.object_for(role) or asset.primary_object()
    if media_object is None:
        raise MediaNotFoundError("Media object not found.")

    expires_in = settings.download_url_expires_in
    url = await storage.create_download_url(media_object.key, expires_in=expires_in)
    return MediaAccessDTO(
        asset_id=asset.id,
        url=url,
        expires_in=expires_in,
        expires_at=datetime.now(UTC) + timedelta(seconds=expires_in),
    )

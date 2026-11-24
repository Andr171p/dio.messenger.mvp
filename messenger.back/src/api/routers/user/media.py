from uuid import UUID

from fastapi import APIRouter, Request, Response, status
from fastapi.responses import StreamingResponse

from src.api.dependencies.auth import CurrentUser
from src.api.dependencies.conversations import ConversationRepositoryDep, MembershipRepositoryDep
from src.api.dependencies.db import DBSession
from src.api.dependencies.media import MediaRepositoryDep
from src.api.dependencies.storage import S3ClientDep
from src.application.media import commands, queries
from src.application.media.dtos import (
    CreateUploadDTO,
    MediaAccessDTO,
    MediaAccessRequestDTO,
    MediaAssetDTO,
    UploadResponseDTO,
)

router = APIRouter(prefix="/v1/media", tags=["media"])


@router.post(
    "/uploads",
    status_code=status.HTTP_201_CREATED,
    summary="Создать upload session и presigned PUT URL",
)
async def create_upload(
    dto: CreateUploadDTO,
    auth: CurrentUser,
    session: DBSession,
    media_repository: MediaRepositoryDep,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    storage: S3ClientDep,
) -> UploadResponseDTO:
    return await commands.initiate_upload(
        dto,
        actor=auth,
        media_repository=media_repository,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        storage=storage,
        uow=session,
    )


@router.put("/uploads/{upload_id}/content", status_code=status.HTTP_204_NO_CONTENT)
async def put_upload_content(
    upload_id: UUID,
    request: Request,
    auth: CurrentUser,
    media_repository: MediaRepositoryDep,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    storage: S3ClientDep,
) -> Response:
    await commands.store_upload_content(
        upload_id,
        request.stream(),
        actor=auth,
        media_repository=media_repository,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        storage=storage,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/uploads/{upload_id}/complete",
    status_code=status.HTTP_200_OK,
    summary="Завершить upload после PUT в S3",
)
async def complete_upload(
    upload_id: UUID,
    auth: CurrentUser,
    session: DBSession,
    media_repository: MediaRepositoryDep,
    storage: S3ClientDep,
) -> MediaAssetDTO:
    return await commands.complete_upload(
        upload_id,
        actor=auth,
        media_repository=media_repository,
        storage=storage,
        uow=session,
    )


@router.delete(
    "/uploads/{upload_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Отменить незавершённый upload",
)
async def cancel_upload(
    upload_id: UUID,
    auth: CurrentUser,
    session: DBSession,
    media_repository: MediaRepositoryDep,
    storage: S3ClientDep,
) -> Response:
    await commands.cancel_upload(
        upload_id,
        actor=auth,
        media_repository=media_repository,
        storage=storage,
        uow=session,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/{asset_id}",
    status_code=status.HTTP_200_OK,
    summary="Метаданные MediaAsset",
)
async def get_media_asset(
    asset_id: UUID,
    auth: CurrentUser,
    media_repository: MediaRepositoryDep,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
) -> MediaAssetDTO:
    return await queries.get_media_asset(
        asset_id,
        actor=auth,
        media_repository=media_repository,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )


@router.get("/{asset_id}/content", response_class=StreamingResponse)
async def get_media_content(
    asset_id: UUID,
    auth: CurrentUser,
    media_repository: MediaRepositoryDep,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    storage: S3ClientDep,
) -> StreamingResponse:
    asset, media_object = await commands.require_accessible_object(
        asset_id, actor=auth, media_repository=media_repository,
        conversation_repository=conversation_repository, membership_repository=membership_repository,
    )
    return StreamingResponse(
        storage.download_stream(media_object.key),
        media_type=asset.content_type,
        headers={
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "attachment",
        },
    )


@router.post(
    "/{asset_id}/access",
    status_code=status.HTTP_200_OK,
    summary="Выдать короткоживущий download URL",
)
async def create_media_access(
    asset_id: UUID,
    auth: CurrentUser,
    media_repository: MediaRepositoryDep,
    conversation_repository: ConversationRepositoryDep,
    membership_repository: MembershipRepositoryDep,
    storage: S3ClientDep,
    response: Response,
    dto: MediaAccessRequestDTO | None = None,
) -> MediaAccessDTO:
    access = await commands.create_access_url(
        asset_id,
        dto,
        actor=auth,
        media_repository=media_repository,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        storage=storage,
    )
    response.headers["Cache-Control"] = "no-store"
    return access

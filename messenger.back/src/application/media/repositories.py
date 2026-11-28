from uuid import UUID

from ddf.application.repositories import Repository

from src.application.media.dtos import MediaGalleryPositionDTO
from src.domain.media import MediaAsset


class MediaAssetRepository(Repository[MediaAsset]):
    async def link_to_message(
        self, *, message_id: UUID, asset_ids: list[UUID], start_position: int = 0
    ) -> None: ...

    async def get_attached_message_seq(self, asset_id: UUID) -> int | None: ...

    async def claim_for_scanning(self, *, limit: int = 10) -> list[MediaAsset]: ...

    async def get_gallery_position(
        self,
        *,
        conversation_id: UUID,
        asset_id: UUID,
        message_id: UUID,
        history_from_seq: int,
        media_kind: str,
    ) -> MediaGalleryPositionDTO | None: ...


# Совместимый алиас для messaging/media use cases и API dependencies.
MediaRepository = MediaAssetRepository

__all__ = ["MediaAssetRepository", "MediaRepository"]

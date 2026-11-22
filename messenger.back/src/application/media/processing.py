"""Scan / validate uploaded media assets (invoked from infra worker)."""

from uuid import uuid4

from ddf.infra.s3 import S3Client

from src.application.media.config import MediaConfig
from src.application.media.repositories import MediaRepository
from src.application.media.validation import (
    build_ready_meta,
    sniff_content_type,
    stub_antivirus_scan,
    validate_declared_vs_sniffed,
)
from src.domain.media import MediaAsset, MediaObject, MediaObjectRole
from src.infra.observability.metrics import inc_upload_scan_failure


async def read_object_prefix(storage: S3Client, *, key: str, limit: int = 4096) -> bytes:
    chunks: list[bytes] = []
    total = 0
    async for chunk in storage.download_stream(key, chunk_size=min(limit, 1024)):
        need = limit - total
        if need <= 0:
            break
        piece = chunk[:need]
        chunks.append(piece)
        total += len(piece)
    return b"".join(chunks)


async def process_uploaded_asset(
    asset: MediaAsset,
    *,
    storage: S3Client,
    media_repository: MediaRepository,
    config: MediaConfig | None = None,
) -> MediaAsset:
    """Validate bytes in object storage; mark asset ready or rejected."""
    settings = config or MediaConfig()
    original = asset.object_for(MediaObjectRole.ORIGINAL) or asset.primary_object()
    if original is None:
        asset.mark_rejected(reason="Original object not found.", code="missing_object")
        inc_upload_scan_failure()
        await media_repository.update(asset)
        return asset

    try:
        payload = await read_object_prefix(storage, key=original.key)
    except Exception:
        asset.mark_rejected(reason="Unable to read uploaded object.", code="storage_read_failed")
        inc_upload_scan_failure()
        await media_repository.update(asset)
        return asset

    malware = stub_antivirus_scan(payload)
    if malware is not None:
        asset.mark_rejected(reason=malware, code="malware_detected")
        inc_upload_scan_failure()
        await media_repository.update(asset)
        return asset

    sniffed = sniff_content_type(payload)
    mismatch = validate_declared_vs_sniffed(
        declared_content_type=asset.content_type,
        sniffed=sniffed,
        config=settings,
    )
    if mismatch is not None:
        asset.mark_rejected(reason=mismatch, code="content_type_mismatch")
        inc_upload_scan_failure()
        await media_repository.update(asset)
        return asset

    effective_type = (
        sniffed.detected_content_type
        if asset.content_type == "application/octet-stream" and sniffed.detected_content_type
        else asset.content_type
    )
    asset.content_type = effective_type

    objects = [obj for obj in asset.objects if obj.role is not MediaObjectRole.THUMBNAIL]
    if effective_type.startswith("image/"):
        objects.append(
            MediaObject(
                id=uuid4(),
                asset_id=asset.id,
                role=MediaObjectRole.THUMBNAIL,
                key=f"{original.key}.thumb.stub",
                content_type="image/jpeg",
                size=0,
            )
        )
    asset.objects = objects

    asset.mark_ready(meta=build_ready_meta(content_type=effective_type))
    await media_repository.update(asset)
    return asset
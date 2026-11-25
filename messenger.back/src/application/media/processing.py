"""Scan / validate uploaded media assets (invoked from infra worker)."""

import os
import tempfile
from uuid import uuid4

from ddf.infra.s3 import S3Client

from src.application.media.audio import extract_audio_meta
from src.application.media.config import MediaConfig
from src.application.media.metadata import build_audio_meta
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


_AUDIO_EXTENSION = {
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/webm": ".webm",
    "audio/wav": ".wav",
    "audio/mp4": ".m4a",
}


async def _download_to_tempfile(
    storage: S3Client,
    *,
    key: str,
    suffix: str,
) -> str:
    fd, path = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, "wb") as handle:
            async for chunk in storage.download_stream(key):
                handle.write(chunk)
        return path
    except Exception:
        os.unlink(path)
        raise


async def _build_audio_meta(
    key: str,
    *,
    content_type: str,
    storage: S3Client,
    settings: MediaConfig,
) -> dict:
    suffix = _AUDIO_EXTENSION.get(content_type, ".bin")
    path = await _download_to_tempfile(storage, key=key, suffix=suffix)
    try:
        ffprobe = settings.ffprobe_path or "ffprobe"
        ffmpeg = settings.ffmpeg_path or "ffmpeg"
        duration_ms, waveform = await extract_audio_meta(
            path,
            ffmpeg_path=ffmpeg,
            ffprobe_path=ffprobe,
            sample_rate=settings.waveform_sample_rate,
            bar_count=settings.waveform_bars,
        )
        return build_audio_meta(duration_ms=duration_ms, waveform=waveform)
    finally:
        os.unlink(path)


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

    if effective_type.startswith("audio/"):
        try:
            meta = await _build_audio_meta(
                original.key,
                content_type=effective_type,
                storage=storage,
                settings=settings,
            )
        except Exception:
            asset.mark_rejected(reason="Unable to process audio metadata.", code="audio_processing_failed")
            inc_upload_scan_failure()
            await media_repository.update(asset)
            return asset
    else:
        meta = build_ready_meta(content_type=effective_type)

    asset.mark_ready(meta=meta)
    await media_repository.update(asset)
    return asset

from uuid import uuid4

import pytest

from src.application.media.validation import (
    sniff_content_type,
    stub_antivirus_scan,
    validate_declared_vs_sniffed,
)
from src.domain.media import MediaAsset, MediaObject, MediaObjectRole, MediaStatus, UploadTargetType
from src.domain.media.exceptions import InvalidMediaTransitionError, MediaNotReadyError


def _asset(*, status: MediaStatus = MediaStatus.PENDING) -> MediaAsset:
    asset_id = uuid4()
    return MediaAsset(
        id=asset_id,
        organization_id=uuid4(),
        owner_id=uuid4(),
        filename="photo.jpg",
        content_type="image/jpeg",
        size=128,
        status=status,
        target_type=UploadTargetType.MESSAGE,
        conversation_id=uuid4(),
        objects=[
            MediaObject(
                id=uuid4(),
                asset_id=asset_id,
                role=MediaObjectRole.STAGING,
                key="messenger/staging/x",
                content_type="image/jpeg",
                size=128,
            )
        ],
    )


def test_lifecycle_happy_path() -> None:
    asset = _asset()
    asset.mark_uploaded(size=200)
    assert asset.status is MediaStatus.UPLOADED
    asset.mark_scanning()
    assert asset.status is MediaStatus.SCANNING
    asset.mark_ready(meta={"type": "image", "width": 1, "height": 1})
    assert asset.status is MediaStatus.READY
    assert asset.meta == {"type": "image", "width": 1, "height": 1}


def test_mark_ready_requires_scanning() -> None:
    asset = _asset()
    asset.mark_uploaded(size=1)
    with pytest.raises(InvalidMediaTransitionError):
        asset.mark_ready()


def test_mark_rejected_from_scanning_records_meta() -> None:
    asset = _asset()
    asset.mark_uploaded(size=1)
    asset.mark_scanning()
    asset.mark_rejected(reason="bad bytes", code="content_type_mismatch")
    assert asset.status is MediaStatus.REJECTED
    assert asset.meta == {"rejection": {"reason": "bad bytes", "code": "content_type_mismatch"}}


def test_ensure_attachable_requires_ready() -> None:
    asset = _asset()
    with pytest.raises(MediaNotReadyError):
        asset.ensure_attachable(owner_id=asset.owner_id, organization_id=asset.organization_id)

    asset.mark_uploaded(size=1)
    asset.mark_scanning()
    asset.mark_ready()
    asset.ensure_attachable(owner_id=asset.owner_id, organization_id=asset.organization_id)


def test_sniff_jpeg_and_validate_match() -> None:
    header = b"\xff\xd8\xff\xe0" + b"\x00" * 20
    sniffed = sniff_content_type(header)
    assert sniffed.detected_content_type == "image/jpeg"
    assert validate_declared_vs_sniffed(declared_content_type="image/jpeg", sniffed=sniffed) is None


def test_sniff_mismatch_rejects() -> None:
    header = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
    sniffed = sniff_content_type(header)
    reason = validate_declared_vs_sniffed(declared_content_type="image/jpeg", sniffed=sniffed)
    assert reason is not None
    assert "does not match" in reason


def test_stub_antivirus_eicar() -> None:
    payload = b"clean" + b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
    assert stub_antivirus_scan(payload) is not None
    assert stub_antivirus_scan(b"hello") is None
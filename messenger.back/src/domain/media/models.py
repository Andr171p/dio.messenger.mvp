from typing import Any

from dataclasses import dataclass, field
from uuid import UUID

from ddf.domain.models import AggregateRoot

from .exceptions import InvalidMediaTransitionError, MediaNotReadyError
from .types import MediaObjectRole, MediaStatus, UploadTargetType


@dataclass(frozen=True, slots=True)
class MediaObject:
    """Физический объект в S3 (ключ + метаданные версии/варианта)."""

    id: UUID
    asset_id: UUID
    role: MediaObjectRole
    key: str
    content_type: str
    size: int


@dataclass(kw_only=True)
class MediaAsset(AggregateRoot):
    """Загруженный файл как самостоятельный объект; байты — в object storage."""

    organization_id: UUID
    owner_id: UUID
    filename: str
    content_type: str
    size: int
    status: MediaStatus
    target_type: UploadTargetType
    conversation_id: UUID
    meta: dict[str, Any] | None = None
    objects: list[MediaObject] = field(default_factory=list)

    def object_for(self, role: MediaObjectRole) -> MediaObject | None:
        return next((item for item in self.objects if item.role is role), None)

    def primary_object(self) -> MediaObject | None:
        return (
            self.object_for(MediaObjectRole.ORIGINAL)
            or self.object_for(MediaObjectRole.STAGING)
            or (self.objects[0] if self.objects else None)
        )

    def mark_uploaded(self, *, size: int, content_type: str | None = None) -> None:
        if self.status is not MediaStatus.PENDING:
            raise InvalidMediaTransitionError("Media asset is not awaiting upload.")
        self.status = MediaStatus.UPLOADED
        self.size = size
        if content_type:
            self.content_type = content_type

    def mark_scanning(self) -> None:
        if self.status is MediaStatus.SCANNING:
            return
        if self.status is not MediaStatus.UPLOADED:
            raise InvalidMediaTransitionError("Media asset must be uploaded before scanning.")
        self.status = MediaStatus.SCANNING

    def mark_ready(self, *, meta: dict[str, Any] | None = None) -> None:
        if self.status is not MediaStatus.SCANNING:
            raise InvalidMediaTransitionError("Media asset must be scanning before ready.")
        self.status = MediaStatus.READY
        if meta is not None:
            self.meta = meta

    def mark_rejected(self, *, reason: str, code: str | None = None) -> None:
        if self.status not in {MediaStatus.PENDING, MediaStatus.UPLOADED, MediaStatus.SCANNING}:
            raise InvalidMediaTransitionError("Media asset cannot be rejected from current status.")
        self.status = MediaStatus.REJECTED
        rejection: dict[str, Any] = {"reason": reason}
        if code is not None:
            rejection["code"] = code
        base = dict(self.meta or {})
        base["rejection"] = rejection
        self.meta = base

    def mark_deleted(self) -> None:
        self.status = MediaStatus.DELETED

    def ensure_attachable(self, *, owner_id: UUID, organization_id: UUID) -> None:
        if self.owner_id != owner_id or self.organization_id != organization_id:
            raise MediaNotReadyError("Media asset does not belong to the sender.")
        if self.status is not MediaStatus.READY:
            raise MediaNotReadyError("Media asset is not ready for messaging.")
        if self.target_type is not UploadTargetType.MESSAGE:
            raise MediaNotReadyError("Media asset target does not allow messaging.")

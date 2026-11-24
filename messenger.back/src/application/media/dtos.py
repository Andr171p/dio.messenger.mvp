from typing import Annotated, Literal

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, PositiveInt
from pydantic.alias_generators import to_camel

from src.application.media.metadata import MediaMeta
from src.domain.media.types import MediaStatus


class MessageUploadTarget(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    type: Literal["message"] = "message"
    conversation_id: UUID


class ConversationAvatarUploadTarget(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    type: Literal["conversation_avatar"] = "conversation_avatar"
    conversation_id: UUID


UploadTarget = Annotated[
    MessageUploadTarget | ConversationAvatarUploadTarget,
    Field(discriminator="type"),
]


class CreateUploadDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=1, max_length=255)
    size: PositiveInt
    target: UploadTarget


class MediaAssetDTO(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        frozen=True,
        from_attributes=True,
    )

    id: UUID
    organization_id: UUID
    owner_id: UUID
    filename: str
    content_type: str
    size: PositiveInt
    status: MediaStatus
    target_type: str
    conversation_id: UUID
    meta: MediaMeta | None = None
    created_at: datetime


class UploadResponseDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    upload_id: UUID
    asset: MediaAssetDTO
    upload_url: str
    expires_in: PositiveInt


class MediaAccessRequestDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    role: Literal["original", "thumbnail", "preview"] = "original"


class MediaAccessDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    asset_id: UUID
    url: str
    expires_in: PositiveInt
    expires_at: datetime


class MediaGalleryKeyDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    asset_id: UUID
    message_id: UUID


class MediaGalleryPositionDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    position: PositiveInt
    total: PositiveInt
    sender_id: UUID
    sent_at: datetime
    previous: MediaGalleryKeyDTO | None = None
    next: MediaGalleryKeyDTO | None = None

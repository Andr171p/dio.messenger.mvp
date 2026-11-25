from typing import Annotated, Any, Literal

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, NonNegativeInt, PositiveInt
from pydantic.alias_generators import to_camel

from src.domain.media.types import MediaPresentation


class TextBlock(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    type: Literal["text"] = "text"
    text: str = Field(min_length=1, max_length=10_000)


class MediaBlock(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    type: Literal["media"] = "media"
    asset_id: UUID
    presentation: MediaPresentation = MediaPresentation.FILE


class ResourceBlock(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    type: Literal["resource"] = "resource"
    provider: str = Field(min_length=1, max_length=64)
    resource_type: str = Field(min_length=1, max_length=64)
    resource_id: str = Field(min_length=1, max_length=128)
    number: str | None = Field(default=None, max_length=64)


ContentBlock = Annotated[TextBlock | MediaBlock | ResourceBlock, Field(discriminator="type")]


class ForwardedFromRefDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    conversation_id: UUID
    message_id: UUID


class SendMessageDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    client_message_id: UUID
    blocks: list[ContentBlock] = Field(min_length=1)
    reply_to_id: UUID | None = None
    quote_text: str | None = Field(default=None, min_length=1, max_length=280, pattern=r"\S")
    mentions: list[UUID] = Field(default_factory=list)
    mention_all: bool = False
    forwarded_from: ForwardedFromRefDTO | None = None
    thread_id: UUID | None = None


class EditMessageDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    blocks: list[ContentBlock] = Field(min_length=1)


class MessageDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    id: UUID
    conversation_id: UUID
    client_message_id: UUID
    sender_id: UUID
    created_seq: PositiveInt
    event_seq: PositiveInt
    revision: PositiveInt
    content: dict[str, Any]
    reactions: dict[str, list[UUID]] | None = None
    reply_to_id: UUID | None
    thread_id: UUID | None = None
    created_at: datetime
    edited_at: datetime | None
    deleted_at: datetime | None


class ConversationEventDTO(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        frozen=True,
        from_attributes=True,
    )

    id: UUID
    conversation_id: UUID
    seq: PositiveInt
    type: str
    payload: dict[str, Any]
    occurred_at: datetime


class ReadCursorDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    last_read_message_seq: NonNegativeInt


class DeliveryCursorDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    last_delivered_message_seq: NonNegativeInt
